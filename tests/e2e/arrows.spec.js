// Arrows race across two real players on the emulators: the host picks HARD in
// the waiting room, the guest sees the same pick (read-only), every round of
// the match plays at that tier, and once the match is over the host can change
// the difficulty before NEW MATCH.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

// The tap targets render once the countdown is over (they are transparent
// paths, so wait on their count rather than their visibility).
const racing = (page) => expect.poll(() => page.getByRole('button', { name: /^Arrow \d+,/ }).count(), { timeout: 20_000 }).toBeGreaterThan(0)
const header = (page, tier) => page.getByText(new RegExp(`^ROUND \\d/3 · ${tier}$`))

// Tap arrows in board order until the round is over. Blocked taps cost lives,
// so one pass usually runs this player out of lives and hands the round over.
async function tapUntilOver(page) {
  for (let pass = 0; pass < 6; pass += 1) {
    const arrows = page.getByRole('button', { name: /^Arrow \d+,/ })
    const n = await arrows.count()
    if (n === 0 || await page.getByText(/RAN OUT OF LIVES|CLEARED THE BOARD/).isVisible()) return
    for (let i = 0; i < n; i += 1) {
      if (await page.getByText(/RAN OUT OF LIVES|CLEARED THE BOARD/).isVisible()) return
      const arrow = arrows.nth(0)
      if (!(await arrow.count())) break
      await arrow.press('Enter').catch(() => {})
    }
  }
}

test('the host picks the Arrows difficulty and it holds for the whole match', async ({ browser }) => {
  test.setTimeout(150_000)
  const host = await newPlayer(browser)
  const guest = await newPlayer(browser)

  await test.step('the host picks HARD in the waiting room; the guest sees it', async () => {
    await onboard(host.page, 'Hana')
    await createRoom(host.page, 'ARROWS PUZZLE')
    await host.page.getByRole('button', { name: /^HARD/ }).click()
    await expect(host.page.getByRole('button', { name: /^HARD/ })).toHaveAttribute('aria-pressed', 'true')
    await joinViaInvite(guest.page, host.page.url(), 'Gus')
  })

  await test.step('round 1 plays at HARD on both screens', async () => {
    for (const { page } of [host, guest]) await expect(header(page, 'HARD')).toBeVisible({ timeout: 20_000 })
    await racing(host.page)
  })

  await test.step('the round ends and PLAY AGAIN keeps HARD for round 2', async () => {
    await tapUntilOver(host.page)
    for (const { page } of [host, guest]) await expect(page.getByText(/RAN OUT OF LIVES|CLEARED THE BOARD/)).toBeVisible({ timeout: 15_000 })
    await guest.page.getByRole('button', { name: 'PLAY AGAIN' }).click()
    await host.page.getByRole('button', { name: 'ACCEPT' }).click()
    for (const { page } of [host, guest]) await expect(page.getByText(/^ROUND 2\/3 · HARD$/)).toBeVisible({ timeout: 20_000 })
  })

  await test.step('after the match the host switches to EASY for the next one', async () => {
    await racing(host.page)
    await tapUntilOver(host.page)
    // Guest won both rounds: the match is over and the picker is back.
    await expect(host.page.getByRole('button', { name: 'NEW MATCH' })).toBeVisible({ timeout: 15_000 })
    await expect(guest.page.getByRole('button', { name: /^EASY/ })).toBeDisabled()
    await host.page.getByRole('button', { name: /^EASY/ }).click()
    await expect(guest.page.getByRole('button', { name: /^EASY/ })).toHaveAttribute('aria-pressed', 'true')
    await host.page.getByRole('button', { name: 'NEW MATCH' }).click()
    await guest.page.getByRole('button', { name: 'ACCEPT' }).click()
    for (const { page } of [host, guest]) await expect(page.getByText(/^ROUND 1\/3 · EASY$/)).toBeVisible({ timeout: 20_000 })
  })

  expectNoPageErrors(host, guest)
})
