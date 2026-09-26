// Runs test/emulator.e2e.js inside `firebase emulators:exec` (Functions +
// Realtime Database) for the offline demo project — never a real one.
//
//   npm --prefix functions run test:emulator
//
// Uses a throwaway firebase.json with free ports, so it runs next to other
// emulators (the rules tests, `npm run emulators`) instead of fighting over
// 9000/5001. Its database rules deny all client access: the test writes with
// the admin SDK, exactly like the function does, and the repo's rules have
// their own tests (npm run test:rules).
const fs = require('node:fs')
const os = require('node:os')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')

const FUNCTIONS_DIR = path.resolve(__dirname, '..')
const PROJECT = 'demo-game-night'

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

async function main() {
  const [database, functions, hub, logging, eventarc, tasks] = await Promise.all(Array.from({ length: 6 }, freePort))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-functions-emu-'))
  // Deny-all for clients; the indexes are the ones the real rules define for
  // the Leaderboard page's query and the cleanup's room queries (the emulator
  // refuses unindexed queries).
  fs.writeFileSync(path.join(dir, 'database.rules.json'), JSON.stringify({
    rules: {
      '.read': false,
      '.write': false,
      leaderboard: { '.indexOn': ['verifiedWins'] },
      games: { '.indexOn': ['createdAt', 'lastActivityAt'] },
    },
  }))
  fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({
    database: { rules: 'database.rules.json' },
    functions: { source: path.relative(dir, FUNCTIONS_DIR), runtime: 'nodejs22' },
    emulators: {
      singleProjectMode: true,
      database: { port: database },
      functions: { port: functions },
      hub: { port: hub },
      logging: { port: logging },
      eventarc: { port: eventarc },
      tasks: { port: tasks },
      ui: { enabled: false },
    },
  }, null, 2))

  const testFile = path.join(__dirname, 'emulator.e2e.js')
  const child = spawn('firebase', [
    'emulators:exec', '--config', path.join(dir, 'firebase.json'), '--only', 'functions,database',
    '--project', PROJECT, `node --test --test-reporter=spec '${testFile}'`,
  ], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' })
  child.on('exit', (code, signal) => {
    fs.rmSync(dir, { recursive: true, force: true })
    process.exit(signal ? 1 : code ?? 1)
  })
}

main().catch(err => { console.error(err); process.exit(1) })
