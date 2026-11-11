import { describe, it, expect } from 'vitest'
import { CI_FORWARDED_VARS, evaluateLaunch, formatReport, parseEnvKeys, readLeaderboardFlag, summarize } from './launchCheckLogic.js'

const allCi = CI_FORWARDED_VARS.map(n => `      ${n}: \${{ secrets.${n} }}`).join('\n')
const base = {
  env: {},
  shell: {},
  functionsEnv: null,
  leaderboardEnabled: false,
  placeholders: { teamId: true, certFingerprint: true, reversedClientId: true },
  nativeConfigFiles: { ios: false, android: false },
  ciWorkflow: allCi,
}
const status = (rows, id) => rows.find(r => r.id === id).status
const detail = (rows, id) => rows.find(r => r.id === id).detail

describe('evaluateLaunch', () => {
  it('reports an empty environment as open, never done', () => {
    const rows = evaluateLaunch(base)
    for (const id of ['contact-email', 'sentry-dsn', 'posthog-key', 'appcheck-key', 'turn', 'native-push', 'web-push-vapid', 'appstore-id']) {
      expect(status(rows, id)).toBe('open')
    }
    expect(status(rows, 'legal-review')).toBe('unknown')
    expect(status(rows, 'appcheck-enforce')).toBe('unknown')
  })

  it('validates the support address instead of trusting any text', () => {
    expect(status(evaluateLaunch({ ...base, env: { VITE_CONTACT_EMAIL: 'help@example.com' } }), 'contact-email')).toBe('done')
    const bad = evaluateLaunch({ ...base, env: { VITE_CONTACT_EMAIL: 'not an email' } })
    expect(status(bad, 'contact-email')).toBe('open')
    expect(detail(bad, 'contact-email')).toMatch(/not a valid/)
  })

  it('treats TURN as done only when URLs, username and credential are all set', () => {
    const partial = evaluateLaunch({ ...base, env: { VITE_TURN_URLS: 'turn:t.example.com' } })
    expect(status(partial, 'turn')).toBe('open')
    expect(detail(partial, 'turn')).toMatch(/partly set/)
    const full = evaluateLaunch({ ...base, env: { VITE_TURN_URLS: 'turn:t.example.com', VITE_TURN_USERNAME: 'u', VITE_TURN_CREDENTIAL: 'c' } })
    expect(status(full, 'turn')).toBe('done')
    // a URL that is not turn: does not count
    expect(status(evaluateLaunch({ ...base, env: { VITE_TURN_URLS: 'https://x', VITE_TURN_USERNAME: 'u', VITE_TURN_CREDENTIAL: 'c' } }), 'turn')).toBe('open')
  })

  it('only counts the exact flag value 1', () => {
    expect(status(evaluateLaunch({ ...base, env: { VITE_NATIVE_PUSH: '1' } }), 'native-push')).toBe('done')
    expect(status(evaluateLaunch({ ...base, env: { VITE_NATIVE_PUSH: 'true' } }), 'native-push')).toBe('open')
    expect(status(evaluateLaunch({ ...base, env: { VITE_AUTH_SAME_ORIGIN: '1' } }), 'auth-same-origin')).toBe('done')
  })

  it('reads functions/.env presence and says so when the file is missing', () => {
    expect(detail(evaluateLaunch(base), 'error-digest-webhook')).toMatch(/not found/)
    const rows = evaluateLaunch({ ...base, functionsEnv: { ERROR_DIGEST_WEBHOOK_URL: true } })
    expect(status(rows, 'error-digest-webhook')).toBe('done')
  })

  it('flags the leaderboard state, and unknown when features.js was unreadable', () => {
    expect(status(evaluateLaunch(base), 'leaderboard')).toBe('open')
    expect(status(evaluateLaunch({ ...base, leaderboardEnabled: true }), 'leaderboard')).toBe('done')
    expect(status(evaluateLaunch({ ...base, leaderboardEnabled: null }), 'leaderboard')).toBe('unknown')
  })

  it('lists which native placeholders remain and which config files are missing', () => {
    const rows = evaluateLaunch({ ...base, placeholders: { teamId: false, certFingerprint: true, reversedClientId: false } })
    expect(detail(rows, 'native-placeholders')).toMatch(/SHA256_CERT_FINGERPRINT_PLACEHOLDER/)
    expect(detail(rows, 'native-placeholders')).not.toMatch(/TEAMID/)
    expect(status(evaluateLaunch({ ...base, placeholders: { teamId: false, certFingerprint: false, reversedClientId: false } }), 'native-placeholders')).toBe('done')
    expect(status(evaluateLaunch({ ...base, placeholders: null }), 'native-placeholders')).toBe('unknown')
    expect(detail(evaluateLaunch(base), 'native-config-files')).toMatch(/GoogleService-Info.plist.*google-services.json/)
    expect(status(evaluateLaunch({ ...base, nativeConfigFiles: { ios: true, android: true } }), 'native-config-files')).toBe('done')
  })

  it('names every launch variable the deploy workflow does not forward', () => {
    expect(status(evaluateLaunch(base), 'ci-forwards-vars')).toBe('done')
    const rows = evaluateLaunch({ ...base, ciWorkflow: allCi.replace('VITE_CONTACT_EMAIL:', 'VITE_OTHER:') })
    expect(status(rows, 'ci-forwards-vars')).toBe('open')
    expect(detail(rows, 'ci-forwards-vars')).toMatch(/VITE_CONTACT_EMAIL/)
    expect(status(evaluateLaunch({ ...base, ciWorkflow: null }), 'ci-forwards-vars')).toBe('unknown')
  })

  it('never puts a value in the report', () => {
    const secrets = ['sekrit-dsn-123', 'phc_supersecret', 'turn-cred-xyz', 'owner@secret-domain.test', 'vapid-abc']
    const rows = evaluateLaunch({
      ...base,
      env: {
        VITE_SENTRY_DSN: secrets[0], VITE_POSTHOG_KEY: secrets[1], VITE_TURN_URLS: 'turn:secret-host.test',
        VITE_TURN_USERNAME: 'secret-user', VITE_TURN_CREDENTIAL: secrets[2], VITE_CONTACT_EMAIL: secrets[3], VITE_FIREBASE_VAPID_KEY: secrets[4],
      },
    })
    const text = formatReport(rows)
    for (const s of [...secrets, 'secret-host.test', 'secret-user']) expect(text).not.toContain(s)
  })

  it('gives every row a unique id, an owner and a status', () => {
    const rows = evaluateLaunch(base)
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
    for (const r of rows) {
      expect(['captain', 'agent']).toContain(r.owner)
      expect(['done', 'open', 'unknown']).toContain(r.status)
    }
  })
})

describe('helpers', () => {
  it('summarize counts each status', () => {
    expect(summarize([{ status: 'done' }, { status: 'open' }, { status: 'open' }, { status: 'unknown' }])).toEqual({ done: 1, open: 2, unknown: 1 })
  })

  it('readLeaderboardFlag parses the declaration and rejects anything else', () => {
    expect(readLeaderboardFlag('export const LEADERBOARD_ENABLED = false')).toBe(false)
    expect(readLeaderboardFlag('export const LEADERBOARD_ENABLED = true // x')).toBe(true)
    expect(readLeaderboardFlag('export const LEADERBOARD_ENABLED = flag()')).toBe(null)
    expect(readLeaderboardFlag(null)).toBe(null)
  })

  it('parseEnvKeys keeps names and emptiness, drops values and comments', () => {
    const keys = parseEnvKeys('# note\nA=1\nB=\nC="x"\nD=""\nexport E=y\n  # F=1\n')
    expect(keys).toEqual({ A: true, B: false, C: true, D: false, E: true })
  })
})
