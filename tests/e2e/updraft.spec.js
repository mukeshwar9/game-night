// UPDRAFT across two real players on the emulators. Versus: the host picks
// PURE in the lobby, both climbers go live together after the shared
// countdown, each sees the other's height arrive, and when both fall (a tab
// hidden for 3 s counts as a fall) the one guarded transaction settles the
// round on both screens; PLAY AGAIN keeps the host's mode. Co-op: both see
// the gate that waits on the partner's key, and one fall costs the team a
// shared life on both screens.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard, ROOM_URL } from './helpers.js'

// A hidden tab can't run the climb, so after 3 s the page counts it as a fall.
async function hideTab(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const arena = (page) => page.getByRole('img', { name: /^Updraft/ })

test('two players race an UPDRAFT round to a result and rematch in the host\'s mode', async ({ browser }) => {
  test.setTimeout(90_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('the host picks PURE in the lobby and a rival joins', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'UPDRAFT')
    await alice.page.getByRole('button', { name: /^PURE/ }).click()
    await expect(alice.page.getByRole('button', { name: /^PURE/ })).toHaveAttribute('aria-pressed', 'true')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
  })

  await test.step('both go live together and see each other climb', async () => {
    for (const { page } of [alice, bob]) {
      await expect(page.getByText(/^PURE · \d+s$/)).toBeVisible({ timeout: 20_000 })
    }
    // Each screen shows the other climber's height as it arrives.
    await expect(arena(alice.page)).toHaveAccessibleName(/O [1-9]\d* metres/, { timeout: 10_000 })
    await expect(arena(bob.page)).toHaveAccessibleName(/X [1-9]\d* metres/, { timeout: 10_000 })
  })

  await test.step('falls reach the rival and the round settles the same on both screens', async () => {
    // Hopping idle, either climber may also fall on their own; hiding both
    // tabs guarantees both falls either way.
    await hideTab(alice.page)
    await expect(bob.page.getByText(/^ALICE\s*\d+m ✕$/)).toBeVisible({ timeout: 10_000 })
    await hideTab(bob.page)
    const result = /REACHED THE SUMMIT|CLIMBED HIGHER|SAME HEIGHT — DRAW/
    for (const { page } of [alice, bob]) {
      await expect(page.getByText(result)).toBeVisible({ timeout: 10_000 })
    }
    await expect(alice.page.getByText(result)).toHaveText(await bob.page.getByText(result).textContent())
  })

  await test.step('PLAY AGAIN starts a new tower in the same mode', async () => {
    await alice.page.getByRole('button', { name: 'PLAY AGAIN' }).click()
    await bob.page.getByRole('button', { name: 'ACCEPT' }).click()
    for (const { page } of [alice, bob]) {
      await expect(page.getByText(/^PURE · \d+s$/)).toBeVisible({ timeout: 20_000 })
    }
  })

  expectNoPageErrors(alice, bob)
})

test('UPDRAFT CO-OP: gates wait on the partner and a fall costs a shared life', async ({ browser }) => {
  test.setTimeout(90_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('create the co-op mode from MORE MODES and join', async () => {
    await onboard(alice.page, 'Alice')
    await alice.page.getByRole('link', { name: 'PLAY WITH FRIENDS' }).click()
    await alice.page.getByRole('button', { name: /^UPDRAFT\b/ }).first().click()
    await alice.page.getByRole('button', { name: 'MORE MODES' }).click()
    await alice.page.getByRole('dialog', { name: /pick a mode/i }).getByRole('button', { name: /^CO-OP/ }).click()
    await alice.page.waitForURL(ROOM_URL)
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
  })

  await test.step('each sees the first gate waiting on the other', async () => {
    await expect(alice.page.getByText('GATE 1 · BOB HAS THE KEY')).toBeVisible({ timeout: 15_000 })
    await expect(bob.page.getByText('GATE 1 · ALICE HAS THE KEY')).toBeVisible({ timeout: 15_000 })
    await expect(alice.page.getByLabel('3 lives', { exact: true })).toBeVisible()
  })

  await test.step('a fall costs the team a life on both screens', async () => {
    // Wait for the run clock to start (the countdown is over).
    await expect(alice.page.getByText(/^2:\d\d$/)).toBeVisible({ timeout: 20_000 })
    await hideTab(alice.page)
    for (const { page } of [alice, bob]) {
      await expect(page.getByLabel('2 lives', { exact: true })).toBeVisible({ timeout: 10_000 })
    }
  })

  expectNoPageErrors(alice, bob)
})
