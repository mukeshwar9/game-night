// Offline, read-only launch check: `npm run launch:check` (add `-- --strict` to
// exit 1 while anything is open or unknown). Prints one done / open / unknown
// line per item of docs/LAUNCH-CHECKLIST.md.
//
// It reads the build env the way `vite build` does (.env.local, .env, and the
// shell's VITE_* variables), the key NAMES of functions/.env, and a few repo
// files. It never prints a value, never touches the network and writes nothing.

import { existsSync, readFileSync } from 'node:fs'
import { loadEnv } from 'vite'
import { evaluateLaunch, formatReport, parseEnvKeys, readLeaderboardFlag, summarize } from '../src/lib/launchCheckLogic.js'

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null)

const env = loadEnv('production', process.cwd(), 'VITE_')
const functionsEnvText = read('functions/.env')
const placeholderFiles = {
  teamId: ['public/.well-known/apple-app-site-association', 'TEAMID_PLACEHOLDER'],
  certFingerprint: ['public/.well-known/assetlinks.json', 'SHA256_CERT_FINGERPRINT_PLACEHOLDER'],
  reversedClientId: ['ios/App/App/Info.plist', 'REVERSED_CLIENT_ID_PLACEHOLDER'],
}
const placeholderTexts = Object.fromEntries(Object.entries(placeholderFiles).map(([k, [file]]) => [k, read(file)]))
const placeholders = Object.values(placeholderTexts).some(t => t === null)
  ? null
  : Object.fromEntries(Object.entries(placeholderFiles).map(([k, [, token]]) => [k, placeholderTexts[k].includes(token)]))

const rows = evaluateLaunch({
  env,
  shell: Object.fromEntries(['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'].map(k => [k, !!process.env[k]])),
  functionsEnv: functionsEnvText === null ? null : parseEnvKeys(functionsEnvText),
  leaderboardEnabled: readLeaderboardFlag(read('src/lib/features.js')),
  placeholders,
  nativeConfigFiles: {
    ios: existsSync('ios/App/App/GoogleService-Info.plist'),
    android: existsSync('android/app/google-services.json'),
  },
  ciWorkflow: read('.github/workflows/deploy.yml'),
})

console.log(formatReport(rows))
const { open, unknown } = summarize(rows)
if (process.argv.includes('--strict') && (open || unknown)) process.exit(1)
