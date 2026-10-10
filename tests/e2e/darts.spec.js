// Steady Hand across two clients: the host picks the setup in the lobby, a dart
// thrown by one player is replayed on both screens, and the turn passes after
// three darts (src/lib/dartsLogic.js). The ONE BUTTON throw is used so the
// spec needs no drag geometry: tap to start the sweep, tap to lock across, tap
// to throw.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'
import { replay } from '../../src/lib/dartsLogic.js'

const NS = 'demo-game-night-default-rtdb'
const readRound = async (url) => {
  const id = url.split('/').pop()
  const res = await fetch(`${DB_ORIGIN}/games/${id}/round.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}

// One dart with ONE BUTTON: start the sweep, lock across, throw.
async function throwOne(page) {
  const button = page.getByRole('button', { name: /^(THROW|LOCK)$/ })
  await expect(button).toBeEnabled()
  await button.click()
  await page.waitForTimeout(180)
  await button.click()
  await page.waitForTimeout(180)
  await button.click()
}

test('Steady Hand: the setup carries over, darts replay the same on both screens and the turn passes', async ({ browser }) => {
  test.setTimeout(150_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players meet in the lobby and the host picks the setup', async () => {
    await onboard(alice.page, 'Alice')
    const url = await createRoom(alice.page, 'STEADY HAND')
    await joinViaInvite(bob.page, url, 'Bob')
    await expect(alice.page.getByText('PLAYERS (2/4)')).toBeVisible()
    await alice.page.getByRole('radio', { name: 'ONE BUTTON' }).click()
    await alice.page.getByRole('radio', { name: '101' }).click()
    await expect(alice.page.getByRole('radio', { name: 'ONE BUTTON' })).toHaveAttribute('aria-checked', 'true')
    // Bob sees the pick but cannot change it.
    await expect(bob.page.getByText(/COUNTDOWN 101 · ONE BUTTON/)).toBeVisible()
    await expect(bob.page.getByRole('radio', { name: 'ONE BUTTON' })).toHaveCount(0)
    await alice.page.getByRole('button', { name: 'START MATCH' }).click()
    await expect(alice.page.getByText('YOUR VISIT')).toBeVisible()
    await expect(bob.page.getByText('ALICE IS UP')).toBeVisible()
    await expect(alice.page.getByRole('button', { name: /^THROW$/ })).toBeEnabled()
    await expect(bob.page.getByRole('button', { name: /^THROW$/ })).toBeDisabled()
  })

  const url = alice.page.url()
  const dartCount = async () => replay(await readRound(url))?.count ?? 0

  await test.step('Alice throws a visit; both screens show her score from the same replay', async () => {
    for (let i = 0; i < 3; i++) {
      await throwOne(alice.page)
      await expect.poll(dartCount, { timeout: 15_000 }).toBe(i + 1)
      await alice.page.waitForTimeout(700)
    }
    const state = replay(await readRound(url))
    expect(state.turnUid).toBe(state.seats[1])
    expect(state.thrown[state.seats[0]]).toBe(3)
    const left = state.scores[state.seats[0]]
    await expect(alice.page.getByLabel(new RegExp(`^YOU: ${left} left`))).toBeVisible()
    await expect(bob.page.getByLabel(new RegExp(`^Alice: ${left} left`))).toBeVisible()
  })

  await test.step('the turn is Bob’s, and a dart of his shows on Alice’s screen', async () => {
    await expect(bob.page.getByText('YOUR VISIT')).toBeVisible()
    await expect(alice.page.getByText('BOB IS UP')).toBeVisible()
    await expect(alice.page.getByRole('button', { name: /^THROW$/ })).toBeDisabled()
    await throwOne(bob.page)
    await expect.poll(dartCount, { timeout: 15_000 }).toBe(4)
    const state = replay(await readRound(url))
    const left = state.scores[state.seats[1]]
    await expect(alice.page.getByLabel(new RegExp(`^Bob: ${left} left`))).toBeVisible()
    await expect(bob.page.getByLabel(new RegExp(`^YOU: ${left} left`))).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('Steady Hand solo: the bot takes its visit and hands the board back', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/solo/darts')
  await page.getByRole('radio', { name: 'ONE BUTTON' }).click()
  await page.getByRole('radio', { name: '101' }).click()
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await expect(page.getByText(/101 LEFT/).first()).toBeVisible()
  for (let i = 0; i < 3; i++) {
    await throwOne(page)
    await page.waitForTimeout(1100)
  }
  await expect(page.getByText(/BOT NORMAL (IS LINING UP|THROWS)/).first()).toBeVisible()
  // Three darts later the bot is done and the board is ours again, unless the
  // bot checked out 101 in one visit (about one leg in sixteen).
  const ours = page.getByText(/LEFT · (TAP THROW TO START THE SWEEP|FINISH ON)/).first()
  const over = page.getByText('GOOD DARTS')
  await expect(ours.or(over)).toBeVisible({ timeout: 30_000 })
  if (await ours.isVisible()) await expect(page.getByRole('button', { name: /^THROW$/ })).toBeEnabled()
})

test('Steady Hand pass and play: the phone changes hands after three darts', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/local/darts')
  await page.getByRole('radio', { name: 'ONE BUTTON' }).click()
  await page.getByRole('radio', { name: 'TURF' }).click()
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await expect(page.getByText('HIT A WEDGE TO CLAIM IT').or(page.getByText(/TAP THROW TO START THE SWEEP/)).first()).toBeVisible()
  // The handoff lockout ends a moment after the banner.
  await page.waitForTimeout(1200)
  for (let i = 0; i < 3; i++) {
    await throwOne(page)
    await page.waitForTimeout(1100)
  }
  // The sweep lands wherever the timing puts it; the turn still moves on.
  await expect(page.getByLabel(/^P2: \d+ points, up/)).toBeVisible()
  // The seat that is not up reads "N points" with no ", up".
  await expect(page.getByLabel(/: \d+ points$/)).toHaveCount(1)
})
