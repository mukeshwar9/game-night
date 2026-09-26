// Fails the run immediately, with a pointer to the right command, when the
// Firebase emulators are not up — otherwise every spec would sit on the
// CONNECTING… splash until its 60 s timeout.
import net from 'node:net'

const EMULATORS = [
  { name: 'Realtime Database', host: '127.0.0.1', port: 9000 },
  { name: 'Auth', host: '127.0.0.1', port: 9099 },
]

function reachable({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(2000, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

export default async function globalSetup() {
  const down = []
  for (const emulator of EMULATORS) {
    if (!(await reachable(emulator))) down.push(`${emulator.name} emulator (${emulator.host}:${emulator.port})`)
  }
  if (down.length) {
    throw new Error(
      `E2E tests need the Firebase emulators, but these are unreachable: ${down.join(', ')}.\n` +
      'Run the suite with `npm run test:e2e` (starts the emulators for you), ' +
      'or start them with `npm run emulators` before `npx playwright test`.',
    )
  }
}
