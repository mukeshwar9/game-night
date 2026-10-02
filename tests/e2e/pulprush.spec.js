// PULP RUSH: two players race the same seeded course. The spec reads the
// round's seed from the emulator (a test-only shortcut) and rebuilds the
// course with the page's own pure generator, so Ana can swipe straight
// through real produce while Ben idles; both must then see Ana win.
// PULP HARVEST (co-op variant, via MORE MODES): two idle partners let the
// fruit fall, the shared hearts run out, and both see the same failed round.
import { test, expect } from '@playwright/test'
import { ROOM_URL, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { ARENA_H, ARENA_W, buildCourse, positionAt } from '../../src/lib/pulpLogic.js'
import { normalizeRaceRound, raceGoAt } from '../../src/lib/raceLogic.js'
import { DB_PORT } from './emulator.js'

test.describe.configure({ timeout: 180_000 })

const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || `127.0.0.1:${DB_PORT}`

async function readRoom(page) {
  const id = new URL(page.url()).pathname.split('/').pop()
  const res = await fetch(`http://${DB_HOST}/games/${id}.json?ns=demo-game-night-default-rtdb`, {
    headers: { Authorization: 'Bearer owner' },
  })
  return res.json()
}

async function openGame(page, label) {
  await page.goto('/games?intent=friend')
  await expect(page.getByRole('heading', { name: 'CHOOSE YOUR GAME' })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`^${label}\\b`) }).first().click()
  return page.getByRole('dialog', { name: new RegExp(`^${label}\\b`) })
}

async function everyoneReady(players) {
  for (const { page } of players) {
    await page.getByRole('button', { name: 'READY', exact: true }).click()
    await expect(page.getByRole('button', { name: '✓ READY' })).toBeVisible()
      .catch(() => { /* the last tap starts the race straight away */ })
  }
}

// Swipe horizontally through `piece` at the middle of its flight.
async function sliceThrough(page, box, piece, goAt) {
  const at = piece.launchAt + piece.flightMs / 2
  const wait = goAt + at - Date.now()
  if (wait < 0) return false
  await page.waitForTimeout(wait)
  const pos = positionAt(piece, at + 30)
  const y = box.y + (pos.y / ARENA_H) * box.height
  const x0 = box.x + (Math.max(0, pos.x - 0.25) / ARENA_W) * box.width
  const x1 = box.x + (Math.min(ARENA_W, pos.x + 0.25) / ARENA_W) * box.width
  await page.mouse.move(x0, y)
  await page.mouse.down()
  await page.mouse.move(x1, y, { steps: 4 })
  await page.mouse.up()
  return true
}

test('two racers face the same course and the one who slices wins', async ({ browser }) => {
  const a = await newPlayer(browser)
  const b = await newPlayer(browser)

  await onboard(a.page, 'Ana')
  const sheet = await openGame(a.page, 'PULP RUSH')
  await sheet.getByRole('button', { name: /^INVITE FRIEND/ }).click()
  await a.page.waitForURL(ROOM_URL)
  await joinViaInvite(b.page, a.page.url(), 'Ben')
  for (const { page } of [a, b]) await expect(page.getByText(/^PLAYERS \(2\)/)).toBeVisible()

  await everyoneReady([a, b])
  const field = a.page.getByRole('application', { name: /Pulp Rush field/ })
  await expect(field).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByRole('application', { name: /Pulp Rush field/ })).toBeVisible()

  const round = normalizeRaceRound((await readRoom(a.page)).round)
  const goAt = raceGoAt(round)
  const course = buildCourse(round.seed, round.endsAt - goAt)
  const box = await field.boundingBox()
  // A handful of fruit early in the course, well apart in time.
  let last = -Infinity
  let swiped = 0
  for (const piece of course) {
    if (piece.kind !== 'fruit' || piece.launchAt < last + 900) continue
    if (await sliceThrough(a.page, box, piece, goAt)) { swiped++; last = piece.launchAt }
    if (swiped >= 4) break
  }
  expect(swiped).toBeGreaterThan(0)
  await expect(a.page.getByText(/^SCORE [1-9]/)).toBeVisible()

  // The 45 s round ends on the deadline; both see Ana on top.
  for (const { page } of [a, b]) {
    await expect(page.getByRole('list', { name: 'Race results' })).toBeVisible({ timeout: 60_000 })
  }
  await expect(a.page.getByText('YOU WIN!')).toBeVisible()
  await expect(b.page.getByText(/ANA WINS/)).toBeVisible()

  expectNoPageErrors(a, b)
  await a.context.close()
  await b.context.close()
})

test('co-op harvest: dropped fruit drains the shared hearts for both partners', async ({ browser }) => {
  const a = await newPlayer(browser)
  const b = await newPlayer(browser)

  await onboard(a.page, 'Ana')
  const sheet = await openGame(a.page, 'PULP RUSH')
  await sheet.getByRole('button', { name: 'MORE MODES' }).click()
  await a.page.getByRole('dialog', { name: /PULP RUSH — pick a mode/ }).getByRole('button', { name: /^CO-OP/ }).click()
  await a.page.waitForURL(ROOM_URL)
  await joinViaInvite(b.page, a.page.url(), 'Ben')
  for (const { page } of [a, b]) await expect(page.getByText(/^PLAYERS \(2\)/)).toBeVisible()

  await everyoneReady([a, b])
  for (const { page } of [a, b]) {
    await expect(page.getByRole('progressbar', { name: 'Team basket' })).toBeVisible({ timeout: 15_000 })
  }
  // Nobody slices: five drops across both fields end the round early.
  for (const { page } of [a, b]) {
    await expect(page.getByText('HARVEST FAILED')).toBeVisible({ timeout: 45_000 })
  }

  expectNoPageErrors(a, b)
  await a.context.close()
  await b.context.close()
})
