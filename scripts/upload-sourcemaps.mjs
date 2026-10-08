// Uploads the private source maps of the last build to Sentry, so errors from
// the web app and the iOS/Android shells show original file:line.
//
//   npm run build && npm run sourcemaps:sentry
//
// Opt-in: runs only when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are
// set (SENTRY_URL for a regional/self-hosted Sentry); otherwise it says what is
// missing and exits 0. The release is the commit the build was made from
// (VITE_SENTRY_RELEASE overrides it, same rule as vite.config.js), which is
// what the app reports. `vite build` moves the maps out of dist/ into
// sourcemaps/<build id>/ (vite.config.js); this puts them back beside the
// bundles in a scratch folder, so dist/ stays clean and nothing is deployed.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildIdFromFiles, sentryUploadPlan } from '../src/lib/sourcemapLogic.js'

const plan = sentryUploadPlan(process.env)
if (!plan.run) {
  console.log(`Sentry source-map upload skipped: set ${plan.missing.join(', ')} to enable it.`)
  process.exit(0)
}

const dist = path.resolve('dist')
const assets = path.join(dist, 'assets')
const jsFiles = fs.existsSync(assets) ? fs.readdirSync(assets).filter(f => f.endsWith('.js')) : []
const buildId = buildIdFromFiles(jsFiles)
if (!buildId) { console.error('No built entry chunk in dist/assets: run npm run build first.'); process.exit(1) }
const mapsDir = path.resolve('sourcemaps', buildId)
if (!fs.existsSync(mapsDir)) { console.error(`No maps for build ${buildId}: ${mapsDir} is missing.`); process.exit(1) }

const release = process.env.VITE_SENTRY_RELEASE
  || execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-sourcemaps-'))
try {
  fs.cpSync(assets, path.join(stage, 'assets'), { recursive: true, filter: src => !src.endsWith('.map') })
  fs.cpSync(path.join(mapsDir, 'assets'), path.join(stage, 'assets'), { recursive: true })
  const cli = path.resolve('node_modules/.bin/sentry-cli')
  // The token and URL reach the CLI through the environment (SENTRY_AUTH_TOKEN,
  // SENTRY_URL), never argv, where `ps` would show them.
  const common = ['--org', plan.org, '--project', plan.project]
  const run = (...rest) => execFileSync(cli, rest, { stdio: 'inherit' })
  run('releases', ...common, 'new', release)
  // `~/` matches any host: https://<site>/ on the web, capacitor://localhost/ (iOS)
  // and https://localhost/ (Android) in the shells.
  run('sourcemaps', 'upload', ...common, '--release', release, '--url-prefix', '~/', stage)
  run('releases', ...common, 'finalize', release)
  console.log(`Uploaded source maps for release ${release} (build ${buildId}).`)
} finally {
  fs.rmSync(stage, { recursive: true, force: true })
}
