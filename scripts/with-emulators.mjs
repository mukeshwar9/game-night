// Runs a command inside `firebase emulators:exec` for the local demo project.
//
//   node scripts/with-emulators.mjs <services> <command> [args...]
//   npm run test:e2e -- tests/e2e/hex-swap.spec.js
//
// `firebase emulators:exec` takes the command as ONE quoted string, so npm's
// trailing `-- args` would land outside it ("Too many arguments"). This
// wrapper quotes the command and every forwarded argument into that string.

import { spawn } from 'node:child_process'

const [services, ...command] = process.argv.slice(2)
if (!services || command.length === 0) {
  console.error('usage: node scripts/with-emulators.mjs <auth,database> <command> [args...]')
  process.exit(2)
}

const quote = (arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`)

const child = spawn(
  'firebase',
  ['emulators:exec', '--only', services, '--project', 'demo-game-night', command.map(quote).join(' ')],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1))
