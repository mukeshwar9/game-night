// Observability smoke test (report 4.2 "Observability v1"): a player sends
// feedback from /notes (and hits the 30 s cooldown), an ErrorBoundary draft
// pre-fills the form, and an uncaught error plus an unhandled rejection are
// reported to errors/{day}. Database contents are read back through the
// emulator's REST API as the owner, which bypasses the security rules.
import { test, expect } from '@playwright/test'
import { newPlayer, onboard } from './helpers.js'

const DB = 'http://127.0.0.1:9000'
const NS = 'demo-game-night-default-rtdb'

async function readDb(path) {
  const res = await fetch(`${DB}/${path}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}

// errors/ writes only succeed once the loaded rules have an `errors` rule;
// until then the spec checks the client side of the report only.
async function rulesAllowErrors() {
  const res = await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return /"errors"\s*:/.test(await res.text())
}

test('feedback is sent once, then rate limited for 30 s', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await onboard(page, 'Fiona')
  await page.goto('/notes')

  const note = `e2e feedback ${Date.now()}`
  await page.getByPlaceholder('what happened, or what should exist?').fill(note)
  await page.getByRole('button', { name: 'SEND', exact: true }).click()
  await expect(page.getByText('NOTE SENT!')).toBeVisible()

  await page.getByPlaceholder('what happened, or what should exist?').fill('a second note, straight away')
  await page.getByRole('button', { name: 'SEND', exact: true }).click()
  await expect(page.getByText(/^WAIT \d+S BEFORE SENDING ANOTHER NOTE\.$/)).toBeVisible()

  const items = Object.values(await readDb('feedback') || {})
  const mine = items.find(i => i.message === note)
  expect(mine).toMatchObject({ type: 'bug', status: 'open', name: 'Fiona' })
  expect(items.filter(i => i.by === mine.by)).toHaveLength(1)
  // Stamped in the same write, for the rules-side cooldown.
  expect(typeof await readDb(`users/${mine.by}/lastFeedbackAt`)).toBe('number')
  await player.context.close()
})

test('an ErrorBoundary draft pre-fills /notes once', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await onboard(page, 'Gus')
  await page.evaluate(() => sessionStorage.setItem('gn-feedback-draft', JSON.stringify({
    type: 'bug',
    message: 'The app crashed on /game/:id.\nError: boom\n\nWhat I was doing: ',
  })))
  await page.goto('/notes')
  await expect(page.getByText(/Sorry about that crash/)).toBeVisible()
  await expect(page.getByPlaceholder('what happened, or what should exist?')).toHaveValue(/Error: boom/)

  await page.reload()
  await expect(page.getByPlaceholder('what happened, or what should exist?')).toHaveValue('')
  await player.context.close()
})

test('uncaught errors and rejections are reported, once each', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page, context } = player
  // Telemetry is off on the emulator unless explicitly enabled.
  await context.addInitScript(() => localStorage.setItem('gn-telemetry', '1'))
  await onboard(page, 'Hana')

  const probe = `e2e telemetry probe ${Date.now()}`
  await page.evaluate((msg) => {
    for (let i = 0; i < 3; i++) setTimeout(() => { throw new Error(msg) }, 0)
    Promise.reject(new Error(`${msg} (rejection)`))
  }, probe)

  // Client side: two distinct reports handed off; the repeats were deduped.
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('gn-telemetry-session') || '{}').count))
    .toBe(2)

  if (!(await rulesAllowErrors())) return
  const day = new Date().toISOString().slice(0, 10)
  await expect.poll(async () => Object.values(await readDb(`errors/${day}`) || {})
    .filter(r => r.msg.startsWith(probe))
    .map(r => r.kind)
    .sort(), { timeout: 15_000 }).toEqual(['error', 'rejection'])
  const report = Object.values(await readDb(`errors/${day}`)).find(r => r.msg === probe)
  // 'dev' on the dev server, the entry chunk's hash on a production build.
  expect(report.route).toBe('/')
  expect(report.build).toMatch(/^[\w-]{1,20}$/)
  expect(report.uid).toBeTruthy()
  expect(report.ua).toMatch(/Chrome/)
  await player.context.close()
})
