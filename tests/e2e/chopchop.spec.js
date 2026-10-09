// Chop Chop across two clients: both racers get the same seeded stack, a
// racer who reads it chops cleanly while one who ignores it is stunned, and
// both screens show the same ranking when the 30 seconds are up
// (src/lib/chopLogic.js, src/pages/ChopChopGame.jsx, RaceShell).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'
import { applyChop, sideDanger } from '../../src/lib/chopLogic.js'

test.describe.configure({ timeout: 180_000 })

const NS = 'demo-game-night-default-rtdb'
const readRoom = async (url) => {
  const id = url.split('/').pop()
  const res = await fetch(`${DB_ORIGIN}/games/${id}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}
const crates = (page, n) => page.getByLabel(`${n} crates`, { exact: true })

test('Chop Chop: the same stack for both racers and one shared ranking', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players ready up and the race starts', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'CHOP CHOP')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const { page } of [alice, bob]) {
      await page.getByRole('button', { name: 'READY', exact: true }).click()
      await expect(page.getByRole('button', { name: '✓ READY' })).toBeVisible().catch(() => { /* the last tap starts the race */ })
    }
    for (const { page } of [alice, bob]) await expect(crates(page, 0)).toBeVisible({ timeout: 20_000 })
  })

  const room = await readRoom(alice.page.url())
  const seed = room.round.seed
  expect(Number.isFinite(seed)).toBe(true)

  await test.step('Alice reads the stack and chops 12 crates without a beam', async () => {
    let stats = null
    for (let i = 0; i < 12; i++) {
      const side = sideDanger(seed, stats, 'L') ? 'R' : 'L'
      await alice.page.keyboard.press(side === 'L' ? 'ArrowLeft' : 'ArrowRight')
      stats = applyChop(seed, stats, side).stats
      await expect(crates(alice.page, i + 1)).toBeVisible()
    }
    expect(stats).toMatchObject({ chops: 12, bonks: 0 })
    await expect(alice.page.getByText('STREAK ×12')).toBeVisible()
  })

  await test.step('Bob stays on one side until a beam lands on him', async () => {
    let stats = null
    let bonked = false
    for (let i = 0; i < 40 && !bonked; i++) {
      const res = applyChop(seed, stats, 'L')
      await bob.page.getByRole('button', { name: /^Chop from the left/ }).dispatchEvent('pointerdown')
      stats = res.stats
      bonked = res.bonk
    }
    expect(bonked).toBe(true)
    await expect(bob.page.getByText('BONK!')).toBeVisible()
    // He is ahead of nobody: Alice's screen shows her lead over him.
    await expect(alice.page.getByText(/VS BOB/)).toBeVisible()
  })

  await test.step('time runs out: both screens rank Alice first, as the room recorded', async () => {
    await expect.poll(async () => (await readRoom(alice.page.url())).status, { timeout: 60_000 }).toBe('finished')
    const final = await readRoom(alice.page.url())
    const aliceUid = Object.values(final.players).find((p) => p.name === 'Alice').playerId
    expect(final.raceResult.order[0]).toBe(aliceUid)
    expect(final.raceResult.scores[aliceUid]).toBe(12)
    for (const { page } of [alice, bob]) {
      const rows = page.getByRole('list', { name: 'Race results' }).getByRole('listitem')
      await expect(rows).toHaveCount(2)
      await expect(rows.first()).toHaveAttribute('aria-label', /alice/i)
      await expect(rows.first()).toHaveAttribute('aria-label', /12/)
    }
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
