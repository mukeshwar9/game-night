// Offline launch checklist (docs/LAUNCH-CHECKLIST.md). Pure: scripts/launch-check.mjs
// gathers the facts (build env, functions/.env key names, a few repo files) and
// this module turns them into one row per checklist item.
//
// Status is one of:
//   done    - the offline evidence says the item is finished
//   open    - the offline evidence says it is not
//   unknown - the state lives in a console, an account or a decision this
//             repository cannot see; the captain confirms it
//
// Rows carry names and statuses only. A value (a key, a DSN, an email) is never
// put in a row, so the output is safe to paste into a chat or a ticket.

import { cleanContactEmail } from './contactLogic.js'
import { isTurnConfigured, readTurnEnv } from './realtime/iceConfig.js'

export const STATUS = { DONE: 'done', OPEN: 'open', UNKNOWN: 'unknown' }

// Build variables that only take effect if the deploy workflow forwards them.
// Anything the captain can switch on from a secret or a variable belongs here.
export const CI_FORWARDED_VARS = [
  'VITE_CONTACT_EMAIL',
  'VITE_APPCHECK_SITE_KEY',
  'VITE_AUTH_SAME_ORIGIN',
  'VITE_FIREBASE_VAPID_KEY',
  'VITE_TURN_URLS',
  'VITE_TURN_USERNAME',
  'VITE_TURN_CREDENTIAL',
  'VITE_SENTRY_DSN',
  'VITE_POSTHOG_KEY',
  'VITE_POSTHOG_HOST',
]

const set = (value) => typeof value === 'string' && value.trim() !== ''
const flag = (value) => value === '1'

const row = (id, title, owner, status, detail) => ({ id, title, owner, status, detail })
const done = (id, title, owner, detail) => row(id, title, owner, STATUS.DONE, detail)
const open = (id, title, owner, detail) => row(id, title, owner, STATUS.OPEN, detail)
const unknown = (id, title, owner, detail) => row(id, title, owner, STATUS.UNKNOWN, detail)

const byKey = (isDone, id, title, owner, whenDone, whenOpen) =>
  isDone ? done(id, title, owner, whenDone) : open(id, title, owner, whenOpen)

/**
 * @param {object} facts
 * @param {Record<string, string>} facts.env           VITE_* values of the build (never echoed)
 * @param {Record<string, boolean>} facts.shell        SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT: set in this shell?
 * @param {Record<string, boolean>|null} facts.functionsEnv  non-empty keys of functions/.env, or null when the file is missing
 * @param {boolean|null} facts.leaderboardEnabled      LEADERBOARD_ENABLED in src/lib/features.js, null if unreadable
 * @param {{teamId: boolean, certFingerprint: boolean, reversedClientId: boolean}|null} facts.placeholders  placeholder still in the file?
 * @param {{ios: boolean, android: boolean}} facts.nativeConfigFiles
 * @param {string|null} facts.ciWorkflow               text of .github/workflows/deploy.yml
 * @returns {Array<{id: string, title: string, owner: string, status: string, detail: string}>}
 */
export function evaluateLaunch(facts) {
  const { env = {}, shell = {}, functionsEnv = null, leaderboardEnabled = null, placeholders = null, nativeConfigFiles = { ios: false, android: false }, ciWorkflow = null } = facts || {}
  const fn = (key) => !!(functionsEnv && functionsEnv[key])
  const rows = []

  // Support address and legal pages
  rows.push(byKey(!!cleanContactEmail(env.VITE_CONTACT_EMAIL), 'contact-email', 'Support email (VITE_CONTACT_EMAIL)', 'captain',
    'set and valid', set(env.VITE_CONTACT_EMAIL) ? 'set but not a valid address' : 'not set: /privacy, /terms and security.txt say "Support email coming soon"'))
  rows.push(unknown('legal-review', 'Privacy policy and terms reviewed and approved', 'captain',
    'wording is the captain\'s call; public/privacy.html and public/terms.html are drafts'))

  // Monitoring
  rows.push(byKey(set(env.VITE_SENTRY_DSN), 'sentry-dsn', 'Sentry errors (VITE_SENTRY_DSN)', 'captain', 'set', 'not set: Sentry never loads'))
  rows.push(byKey(set(env.VITE_POSTHOG_KEY), 'posthog-key', 'PostHog journeys (VITE_POSTHOG_KEY)', 'captain', 'set', 'not set: PostHog never loads'))
  rows.push(byKey(!!(shell.SENTRY_AUTH_TOKEN && shell.SENTRY_ORG && shell.SENTRY_PROJECT), 'sentry-sourcemaps', 'Sentry source-map upload (SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT)', 'captain',
    'all three set in this shell', 'not all three set in this shell (CI secrets are not visible from here)'))
  rows.push(byKey(fn('ERROR_DIGEST_WEBHOOK_URL'), 'error-digest-webhook', 'Error digest webhook (functions/.env ERROR_DIGEST_WEBHOOK_URL)', 'captain',
    'set in functions/.env', functionsEnv ? 'not set in functions/.env (the Cloud Logging email alert is the other route and is not checkable here)' : 'functions/.env not found on this machine'))

  // Security
  rows.push(byKey(set(env.VITE_APPCHECK_SITE_KEY), 'appcheck-key', 'App Check site key (VITE_APPCHECK_SITE_KEY)', 'captain',
    'set (monitor mode; enforcing is a console step to confirm)', 'not set: App Check never starts'))
  rows.push(unknown('appcheck-enforce', 'App Check enforced for Realtime Database', 'captain', 'a console state, not visible offline; only after about a week of monitor mode'))

  // Sign-in
  rows.push(byKey(flag(env.VITE_AUTH_SAME_ORIGIN), 'auth-same-origin', 'iOS PWA Google sign-in (VITE_AUTH_SAME_ORIGIN=1)', 'captain',
    'flag set (the OAuth redirect URI is a console step to confirm)', 'not set to 1'))
  rows.push(byKey(flag(env.VITE_NATIVE_GOOGLE_SIGNIN), 'native-google-signin', 'Native Google sign-in (VITE_NATIVE_GOOGLE_SIGNIN=1)', 'captain', 'flag set', 'not set to 1'))
  rows.push(byKey(flag(env.VITE_NATIVE_APPLE_SIGNIN), 'native-apple-signin', 'Sign in with Apple (VITE_NATIVE_APPLE_SIGNIN=1)', 'captain', 'flag set', 'not set to 1'))

  // Push
  rows.push(byKey(set(env.VITE_FIREBASE_VAPID_KEY), 'web-push-vapid', 'Web push key (VITE_FIREBASE_VAPID_KEY)', 'captain', 'set', 'not set: the web notifications toggle stays hidden'))
  rows.push(byKey(flag(env.VITE_NATIVE_PUSH), 'native-push', 'Native push (VITE_NATIVE_PUSH=1)', 'captain', 'flag set (the APNs key upload is a console step to confirm)', 'not set to 1'))

  // Peer-to-peer
  const turnEnv = readTurnEnv(env)
  const turnAny = set(env.VITE_TURN_URLS) || set(env.VITE_TURN_USERNAME) || set(env.VITE_TURN_CREDENTIAL)
  rows.push(isTurnConfigured(turnEnv)
    ? done('turn', 'TURN relay for peer-to-peer games (VITE_TURN_URLS, _USERNAME, _CREDENTIAL)', 'captain', 'all three set')
    : open('turn', 'TURN relay for peer-to-peer games (VITE_TURN_URLS, _USERNAME, _CREDENTIAL)', 'captain',
      turnAny ? 'partly set: URLs, username and credential are all needed, or TURN stays off' : 'not set: public STUN only, so some networks cannot connect'))

  // Switches the repo owns
  rows.push(leaderboardEnabled === null
    ? unknown('leaderboard', 'Public leaderboard (LEADERBOARD_ENABLED in src/lib/features.js)', 'captain', 'could not read src/lib/features.js')
    : byKey(leaderboardEnabled, 'leaderboard', 'Public leaderboard (LEADERBOARD_ENABLED in src/lib/features.js)', 'captain', 'on', 'off: hidden on purpose until the captain decides'))
  rows.push(byKey(flag(env.VITE_VOICE_ENABLED), 'voice', 'Party voice (VITE_VOICE_ENABLED=1 plus VOICE_ENABLED in functions/.env)', 'captain',
    functionsEnv && fn('VOICE_ENABLED') ? 'client flag and functions flag set (the Cloudflare secrets are not checkable here)' : 'client flag set; VOICE_ENABLED is not set in functions/.env',
    'client flag not set to 1'))
  rows.push(byKey(flag(env.VITE_MONETIZATION_ENABLED), 'monetization', 'Shop and Pass (VITE_MONETIZATION_ENABLED=1 plus MONETIZATION_ENABLED in functions/.env)', 'captain',
    functionsEnv && fn('MONETIZATION_ENABLED') ? 'client and functions switches set (Paddle and Razorpay accounts are not checkable here)' : 'client switch set; MONETIZATION_ENABLED is not set in functions/.env',
    'off by design for launch'))

  // Store and native shell
  rows.push(byKey(set(env.VITE_APPSTORE_ID), 'appstore-id', 'App Store id (VITE_APPSTORE_ID)', 'captain', 'set', 'not set: no Smart App Banner, no iPhone store link'))
  rows.push(byKey(flag(env.VITE_PLAY_LIVE), 'play-live', 'Play listing live (VITE_PLAY_LIVE=1)', 'captain', 'flag set', 'not set to 1'))
  rows.push(nativeConfigFiles.ios && nativeConfigFiles.android
    ? done('native-config-files', 'Native Firebase config files', 'captain', 'GoogleService-Info.plist and google-services.json both present')
    : open('native-config-files', 'Native Firebase config files', 'captain',
      `missing: ${[!nativeConfigFiles.ios && 'ios/App/App/GoogleService-Info.plist', !nativeConfigFiles.android && 'android/app/google-services.json'].filter(Boolean).join(', ')}`))
  if (placeholders) {
    const left = [
      placeholders.teamId && 'TEAMID_PLACEHOLDER (apple-app-site-association)',
      placeholders.certFingerprint && 'SHA256_CERT_FINGERPRINT_PLACEHOLDER (assetlinks.json)',
      placeholders.reversedClientId && 'REVERSED_CLIENT_ID_PLACEHOLDER (Info.plist)',
    ].filter(Boolean)
    rows.push(left.length
      ? open('native-placeholders', 'Universal Link and URL-scheme placeholders', 'captain', `still in the repo: ${left.join(', ')}`)
      : done('native-placeholders', 'Universal Link and URL-scheme placeholders', 'captain', 'none left'))
  } else {
    rows.push(unknown('native-placeholders', 'Universal Link and URL-scheme placeholders', 'captain', 'could not read the files'))
  }

  // Agent-side: the deploy workflow has to forward a variable for a secret to matter
  if (ciWorkflow === null) {
    rows.push(unknown('ci-forwards-vars', 'Deploy workflow forwards the launch variables', 'agent', 'could not read .github/workflows/deploy.yml'))
  } else {
    const missing = CI_FORWARDED_VARS.filter(name => !ciWorkflow.includes(`${name}:`))
    rows.push(missing.length
      ? open('ci-forwards-vars', 'Deploy workflow forwards the launch variables', 'agent', `deploy.yml does not pass: ${missing.join(', ')}`)
      : done('ci-forwards-vars', 'Deploy workflow forwards the launch variables', 'agent', 'every launch variable is passed to the build'))
  }

  return rows
}

export function summarize(rows) {
  const count = (status) => rows.filter(r => r.status === status).length
  return { done: count(STATUS.DONE), open: count(STATUS.OPEN), unknown: count(STATUS.UNKNOWN) }
}

const MARK = { done: 'DONE   ', open: 'OPEN   ', unknown: 'UNKNOWN' }

export function formatReport(rows) {
  const lines = ['Game Night launch check (offline, read-only)', '']
  for (const r of rows) lines.push(`${MARK[r.status]}  ${r.id}  [${r.owner}]  ${r.title}`, `         ${r.detail}`)
  const s = summarize(rows)
  lines.push('', `${s.done} done, ${s.open} open, ${s.unknown} unknown. Details: docs/LAUNCH-CHECKLIST.md`)
  return lines.join('\n')
}

/** Parse `export const LEADERBOARD_ENABLED = <bool>` from the text of features.js. */
export function readLeaderboardFlag(source) {
  const m = /export\s+const\s+LEADERBOARD_ENABLED\s*=\s*(true|false)\b/.exec(String(source || ''))
  return m ? m[1] === 'true' : null
}

/** Names of the non-empty keys of a dotenv file's text. Values are discarded here. */
export function parseEnvKeys(text) {
  const keys = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || line.trimStart().startsWith('#')) continue
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2')
    keys[m[1]] = value !== ''
  }
  return keys
}
