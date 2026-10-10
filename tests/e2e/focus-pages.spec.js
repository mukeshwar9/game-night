// Focus mode on custom pages (src/components/FocusStage.jsx FocusFrame): the
// arena of a real-time game goes full screen in place and comes back with Esc
// and the ✕, on the solo page and in a room.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test.describe.configure({ timeout: 120_000 })

test('Bonk Buggies solo: the enter button opens a full-screen stage that Esc and the ✕ close', async ({ browser }) => {
  const p = await newPlayer(browser)
  await onboard(p.page, 'Alice')
  await p.page.goto('/solo/bonkbuggies')
  const arena = p.page.getByTestId('bonk-arena')
  await expect(arena).toBeVisible()
  const stage = p.page.locator('[data-focus-stage]')
  await expect(stage).toHaveCount(0)

  await p.page.getByTestId('focus-enter').click()
  await expect(stage).toBeVisible()
  await expect(stage.getByTestId('bonk-arena')).toBeVisible()

  await p.page.keyboard.press('Escape')
  await expect(stage).toHaveCount(0)
  await expect(arena).toBeVisible()

  await p.page.getByTestId('focus-enter').click()
  await expect(stage).toBeVisible()
  await p.page.getByRole('button', { name: 'Leave focus mode' }).click()
  await expect(stage).toHaveCount(0)
  expectNoPageErrors(p)
})

test('Bonk Buggies room: focus mode keeps the live arena mounted and the peer link up', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  await onboard(alice.page, 'Alice')
  await createRoom(alice.page, 'BONK BUGGIES')
  await joinViaInvite(bob.page, alice.page.url(), 'Bob')
  for (const p of [alice, bob]) {
    await expect(p.page.getByTestId('bonk-overlay')).toHaveCount(0, { timeout: 30_000 })
  }
  const stage = alice.page.locator('[data-focus-stage]')
  await alice.page.getByTestId('focus-enter').click()
  await expect(stage.getByTestId('bonk-arena')).toBeVisible()
  // No reconnect: the overlay never comes back because the page was not remounted.
  await alice.page.waitForTimeout(1500)
  await expect(alice.page.getByTestId('bonk-overlay')).toHaveCount(0)
  await alice.page.keyboard.press('Escape')
  await expect(stage).toHaveCount(0)
  expectNoPageErrors(alice, bob)
})
