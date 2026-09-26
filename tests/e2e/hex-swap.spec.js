// Hex swap (pie) rule across two real players on the emulators: X opens,
// O takes the opening stone with SWAP, and both screens show it as O's —
// reflected across the long diagonal onto O's edges — with X to move again.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

// HexBoard labels cells "H3, empty" / "C8, O, last move" (column letter + row).
const cell = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}, `) })
const swapButton = (page) => page.getByRole('button', { name: /^Swap: take X's opening stone/ })
const SWAPPED = "O SWAPPED — THE OPENING STONE IS NOW O'S"

test('the second Hex player swaps the opening stone and both screens flip it', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('P1 creates a Hex room and P2 joins', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'HEX')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
    await expect(bob.page.getByText("OPPONENT'S TURN")).toBeVisible()
  })

  await test.step('nobody can swap before the first stone', async () => {
    await expect(swapButton(alice.page)).toHaveCount(0)
    await expect(swapButton(bob.page)).toHaveCount(0)
  })

  await test.step('X opens at H3', async () => {
    await cell(alice.page, 'H3').click()
    await expect(cell(bob.page, 'H3')).toHaveAccessibleName(/^H3, X/)
    await expect(bob.page.getByText('YOUR TURN')).toBeVisible()
    // Only the player to move gets the button; X just sees the notice.
    await expect(swapButton(alice.page)).toHaveCount(0)
    await expect(alice.page.getByText('O MAY SWAP INSTEAD OF MOVING')).toBeVisible()
  })

  await test.step('O swaps: the stone becomes O at the mirrored cell C8 on both screens', async () => {
    await swapButton(bob.page).click()
    for (const { page } of [alice, bob]) {
      await expect(cell(page, 'C8')).toHaveAccessibleName(/^C8, O(,|$)/)
      await expect(cell(page, 'H3')).toHaveAccessibleName(/^H3, empty/)
      await expect(page.getByText(SWAPPED)).toBeVisible()
    }
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
  })

  await test.step('the swap is spent: X cannot swap back, play continues', async () => {
    await expect(swapButton(alice.page)).toHaveCount(0)
    await cell(alice.page, 'F6').click()
    await expect(cell(bob.page, 'F6')).toHaveAccessibleName(/^F6, X/)
    await expect(bob.page.getByText(SWAPPED)).toHaveCount(0)
    await expect(swapButton(bob.page)).toHaveCount(0)
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
