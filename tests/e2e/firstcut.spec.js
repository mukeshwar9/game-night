// First Cut across two clients: both racers watch the same seeded plate, a swing
// at a lookalike blocks the katana, and the first to five cuts takes the round
// with both screens showing the same result (src/lib/firstCutLogic.js,
// src/pages/FirstCutGame.jsx, RaceShell). Also the one-phone page.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'
import { FC_ONLINE_TARGET, FC_TARGET } from '../../src/lib/firstCutLogic.js'

test.describe.configure({ timeout: 180_000 })

const NS = 'demo-game-night-default-rtdb'
const readRoom = async (url) => {
  const id = url.split('/').pop()
  const res = await fetch(`${DB_ORIGIN}/games/${id}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}

const myScore = async (page) => Number(await page.locator('button[data-seat="0"] [data-score]').first().textContent())

/** Swing at the first fruit that shows, until `score` is reached. A swing that lands on the next item
 *  (a block) just waits out the block and tries again. */
async function cutUntil(page, key, score, { deadlineMs = 90_000 } = {}) {
  const until = Date.now() + deadlineMs
  while (Date.now() < until && (await myScore(page)) < score) {
    const fruit = page.locator('.fc-item[data-kind="fruit"]:not(:has(.fc-half))')
    if (!(await fruit.count())) { await page.waitForTimeout(40); continue }
    const phase = await page.locator('button[data-seat="0"]').first().getAttribute('data-phase')
    if (phase !== 'ready') { await page.waitForTimeout(60); continue }
    await page.keyboard.press(key)
    await page.waitForTimeout(260)
  }
  expect(await myScore(page)).toBeGreaterThanOrEqual(score)
}

test('First Cut: one plate for both racers, a block, and the first to five takes the round', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players ready up and the plate appears', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'FIRST CUT')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const { page } of [alice, bob]) {
      await page.getByRole('button', { name: 'READY', exact: true }).click()
    }
    for (const { page } of [alice, bob]) await expect(page.locator('.fc-item').first()).toBeVisible({ timeout: 25_000 })
  })

  const room = await readRoom(alice.page.url())
  expect(Number.isFinite(room.round.seed)).toBe(true)
  expect(room.round.firstcutConfig).toMatchObject({ version: 1, flip: false, gold: false, pace: 'slow' })

  await test.step('Bob swings at a lookalike: his katana is blocked and the room records it', async () => {
    const twin = bob.page.locator('.fc-item[data-kind="twin"]')
    await expect(twin.first()).toBeVisible({ timeout: 20_000 })
    await bob.page.keyboard.press('Space')
    await expect(bob.page.locator('button[data-seat="0"]').first()).toHaveAttribute('data-phase', /stopped|drawing/, { timeout: 5000 })
    await expect.poll(async () => {
      const r = await readRoom(alice.page.url())
      const bobUid = Object.values(r.players).find((p) => p.name === 'Bob').playerId
      return Object.keys(r.round?.stats?.[r.round.id]?.[bobUid]?.j ?? {}).length
    }).toBeGreaterThan(0)
  })

  await test.step('Alice cuts fruit until she has five', async () => {
    await cutUntil(alice.page, 'Space', FC_ONLINE_TARGET)
  })

  await test.step('Bob goes full screen (focus mode) and the table stays playable, Esc leaves', async () => {
    await bob.page.getByTestId('focus-enter').click()
    const stage = bob.page.locator('[data-focus-stage]')
    await expect(stage).toBeVisible()
    await expect(stage.locator('.fc-arena')).toBeVisible()
    await expect(stage.locator('.fc-pad')).toBeVisible()
    await bob.page.keyboard.press('Escape')
    await expect(stage).toHaveCount(0)
    await expect(bob.page.locator('.fc-arena')).toBeVisible()
  })

  await test.step('both screens show the round result the room recorded', async () => {
    await expect.poll(async () => (await readRoom(alice.page.url())).status, { timeout: 30_000 }).toBe('finished')
    const final = await readRoom(alice.page.url())
    const aliceUid = Object.values(final.players).find((p) => p.name === 'Alice').playerId
    expect(final.raceResult.order[0]).toBe(aliceUid)
    expect(final.raceResult.scores[aliceUid]).toBe(FC_ONLINE_TARGET)
    expect(final.scores[aliceUid]).toBe(1)
    for (const { page } of [alice, bob]) {
      const rows = page.getByRole('list', { name: 'Race results' }).getByRole('listitem')
      await expect(rows).toHaveCount(2)
      await expect(rows.first()).toHaveAttribute('aria-label', /alice/i)
    }
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('First Cut on one phone: two players, one blocked, first to ten wins', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.goto('/local/firstcut')
  await expect(page.getByText('FIRST CUT').first()).toBeVisible()
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await expect(page.locator('.fc-item').first()).toBeVisible({ timeout: 15_000 })

  // Focus mode: the table moves into the full-screen stage and still plays.
  await page.getByTestId('focus-enter').click()
  const stage = page.locator('[data-focus-stage]')
  await expect(stage.locator('.fc-arena')).toBeVisible()
  await expect(stage.locator('.fc-item').first()).toBeVisible()

  // P2 swings at a lookalike: blocked, P1 plays on.
  await expect(page.locator('.fc-item[data-kind="twin"]').first()).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('l')
  await expect(page.locator('button[data-seat="1"]')).toHaveAttribute('data-phase', /stopped|drawing/)

  await cutUntil(page, 'a', FC_TARGET, { deadlineMs: 120_000 })
  await page.getByRole('button', { name: 'Leave focus mode' }).click()
  await expect(stage).toHaveCount(0)
  await expect(page.getByText('P1 WINS')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'REMATCH' })).toBeVisible()
  expect(errors).toEqual([])
})
