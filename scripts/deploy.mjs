// Guarded production deploy: `npm run deploy` (hosting only) or
// `npm run deploy -- --only hosting,database` to pass your own Firebase args.
//
// Refuses to ship anything that isn't a committed, reproducible build:
// - a dirty working tree (uncommitted or untracked files would go live
//   without ever reaching main)
// - a build without the Firebase web config (VITE_FIREBASE_*), which would
//   deploy an app that cannot reach the database
// Warns, but continues, when HEAD has not been pushed to any remote.

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from 'vite'

const REQUIRED_ENV = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_DATABASE_URL', 'VITE_FIREBASE_PROJECT_ID']

function run(cmd, args, { capture = false } = {}) {
  const res = spawnSync(cmd, args, { stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' })
  if (res.error) fail(`could not run ${cmd}: ${res.error.message}`)
  return res
}

function fail(message) {
  console.error(`\ndeploy refused: ${message}\n`)
  process.exit(1)
}

const dirty = run('git', ['status', '--porcelain'], { capture: true }).stdout.trim()
if (dirty) {
  fail(`the working tree has uncommitted or untracked changes:\n${dirty}\nCommit (or stash) them first so the live site matches a commit on main.`)
}

const env = loadEnv('production', process.cwd(), 'VITE_')
const missing = REQUIRED_ENV.filter(key => !env[key])
if (missing.length) {
  fail(`missing ${missing.join(', ')}. Copy .env.local.example to .env.local and fill in the Firebase config.`)
}

const head = run('git', ['rev-parse', '--short', 'HEAD'], { capture: true }).stdout.trim()
const onRemote = run('git', ['branch', '-r', '--contains', 'HEAD'], { capture: true }).stdout.trim()
if (!onRemote) console.warn(`\nwarning: ${head} is not on any remote branch yet; push it so others can rebuild what is live.\n`)

if (run('npm', ['run', 'build']).status !== 0) fail('the build failed')

// The config is inlined at build time; make sure it actually landed.
const assets = join('dist', 'assets')
const bundled = readdirSync(assets)
  .filter(name => name.endsWith('.js'))
  .some(name => readFileSync(join(assets, name), 'utf8').includes(env.VITE_FIREBASE_PROJECT_ID))
if (!bundled) fail(`the build does not contain the Firebase project id ${env.VITE_FIREBASE_PROJECT_ID}`)

// npm strips the `--` separator; a direct `node scripts/deploy.mjs -- ...` does not.
const extra = process.argv.slice(2).filter((arg, i) => !(i === 0 && arg === '--'))
const args = ['deploy', ...(extra.length ? extra : ['--only', 'hosting'])]
console.log(`\ndeploying ${head}: firebase ${args.join(' ')}\n`)
process.exit(run('firebase', args).status ?? 1)
