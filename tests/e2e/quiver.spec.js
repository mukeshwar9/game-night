// Quiver: the online duel across two clients (the host's sim is the one wheel
// both screens draw, and a shot by either player spends an arrow on both), the
// solo table against a bot, the team-up mode, and the one-phone table seating
// 2-4 (src/lib/quiverLogic.js, src/pages/QuiverGame.jsx, QuiverDemo.jsx).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const table = (page) => page.getByTestId('quiver-table')
const pad = (page, seat) => page.getByTestId(`quiver-pad-${seat}`)

// Tap a button until the wheel is live and it has spent an arrow (the first
// seconds are a countdown and a banner, during which taps are ignored).
// `full` is the quiver's size: 8 arrows with two players, 6 with three.
async function shootOnce(page, seat, full = 8) {
  await expect(async () => {
    await pad(page, seat).click({ force: true, timeout: 1000 })
    await expect(pad(page, seat)).not.toContainText(`x${full}`, { timeout: 1000 })
  }).toPass({ timeout: 30_000 })
}

test('Quiver: a shot by either player spends an arrow on both screens', async ({ browser }) => {
  test.setTimeout(150_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players open a room and the wheel goes live', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'QUIVER')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const p of [alice, bob]) {
      await expect(table(p.page)).toBeVisible()
      // The connecting / countdown overlay sits on the table until play starts.
      await expect(p.page.getByTestId('quiver-overlay')).toHaveCount(0, { timeout: 30_000 })
      await expect(pad(p.page, 0)).toContainText('x8')
      await expect(pad(p.page, 1)).toContainText('x8')
    }
  })

  await test.step('the guest sees the table turned so their own button is nearest', async () => {
    const mine = await pad(bob.page, 1).boundingBox()
    const theirs = await pad(bob.page, 0).boundingBox()
    expect(mine.y).toBeGreaterThan(theirs.y)
    const hostMine = await pad(alice.page, 0).boundingBox()
    const hostTheirs = await pad(alice.page, 1).boundingBox()
    expect(hostMine.y).toBeGreaterThan(hostTheirs.y)
  })

  await test.step('the host shoots and both quivers agree', async () => {
    await shootOnce(alice.page, 0)
    for (const p of [alice, bob]) await expect(pad(p.page, 0)).not.toContainText('x8', { timeout: 15_000 })
  })

  await test.step('the guest shoots from the table turned around', async () => {
    await shootOnce(bob.page, 1)
    for (const p of [alice, bob]) await expect(pad(p.page, 1)).not.toContainText('x8', { timeout: 15_000 })
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('Quiver: solo against a bot, as a team, and one phone for 2-4', async ({ browser }) => {
  test.setTimeout(90_000)
  const me = await newPlayer(browser)
  await me.page.goto('/solo/quiver')
  await expect(table(me.page)).toBeVisible()
  await expect(me.page.getByTestId('quiver-score-0')).toHaveAttribute('aria-label', 'YOU: 0')
  await expect(me.page.getByTestId('quiver-score-1')).toHaveAttribute('aria-label', 'BOT: 0')

  // The bot's button is a badge, not a control: only your own seat shoots.
  await expect(me.page.getByRole('button', { name: /^YOU shoot/ })).toBeVisible()
  await expect(me.page.getByRole('button', { name: /^BOT shoot/ })).toHaveCount(0)
  await shootOnce(me.page, 0)

  await me.page.getByRole('button', { name: '3 BOTS' }).click()
  await expect(me.page.getByTestId('quiver-score-3')).toBeVisible()

  await me.page.getByRole('button', { name: /^TEAM UP/ }).click()
  await expect(me.page.getByTestId('quiver-hearts')).toBeVisible()
  await expect(me.page.getByTestId('quiver-score-0')).toHaveAttribute('aria-label', 'YOU: 0')
  await me.page.getByRole('button', { name: /^TEAM UP/ }).click()

  await me.page.getByRole('button', { name: 'ONE PHONE' }).click()
  await me.page.getByRole('button', { name: '3 PLAYERS' }).click()
  await expect(me.page.getByTestId('quiver-score-2')).toBeVisible()
  await expect(me.page.getByTestId('quiver-score-3')).toHaveCount(0)
  // Everyone has a live button on one phone.
  await expect(pad(me.page, 2)).toBeVisible()
  await shootOnce(me.page, 2, 6)

  await me.page.goto('/local/quiver')
  await expect(table(me.page)).toBeVisible()
  await expect(me.page.getByRole('button', { name: 'SOLO', exact: true })).toHaveCount(0)
  await me.page.getByRole('button', { name: '4 PLAYERS' }).click()
  await expect(me.page.getByTestId('quiver-score-3')).toBeVisible()

  expectNoPageErrors(me)
  await me.context.close()
})
