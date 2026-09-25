// Shared harness for the database.rules.json tests. Needs the Realtime
// Database emulator: run via `npm run test:rules` (firebase emulators:exec),
// or start `npm run emulators` yourself and run
// `npx vitest run --config vitest.rules.config.js`.
import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'

export { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'

const RULES_PATH = fileURLToPath(new URL('../../database.rules.json', import.meta.url))

// emulators:exec exports FIREBASE_DATABASE_EMULATOR_HOST; fall back to the
// port pinned in firebase.json so a manually started emulator works too.
function emulatorAddress() {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':')
  return { host, port: Number(port) }
}

// rules-unit-testing loads the rules into (and reads/writes) the namespace
// named after projectId — `demo-game-night` — which is separate from the
// `demo-game-night-default-rtdb` namespace the app uses in emulator mode, so
// these tests never clobber a running `npm run dev:emu` session.
export async function setupRulesEnv() {
  return initializeTestEnvironment({
    projectId: 'demo-game-night',
    database: {
      ...emulatorAddress(),
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
    },
  })
}

// Writes fixtures with rules bypassed (the admin path).
export async function seed(testEnv, path, value) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(path).set(value)
  })
}

// Compat Database handle for a signed-in user, or for a signed-out visitor.
export function dbAs(testEnv, uid) {
  return uid ? testEnv.authenticatedContext(uid).database() : testEnv.unauthenticatedContext().database()
}

// A game node in the shape Home.jsx / freshGameState() writes.
export function gameNode({ x = 'alice', o = null, visibility, status = 'waiting', extra = {} } = {}) {
  const node = {
    gameType: 'tictactoe',
    status,
    board: ['', '', '', '', '', '', '', '', ''],
    currentTurn: 'X',
    createdAt: 1,
    players: { X: { name: 'Alice', joinedAt: 1, playerId: x } },
    scores: { X: 0, O: 0 },
    ...extra,
  }
  if (o) node.players.O = { name: 'Bob', joinedAt: 2, playerId: o }
  if (visibility) node.visibility = visibility
  return node
}
