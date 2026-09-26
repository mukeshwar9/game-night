// Two-player smoke test (report 4.3 "Engineering foundation", README #20):
// two distinct anonymous players on the emulators create a Tic Tac Toe room,
// join it through the invite link, and play it out to a win.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const cell = (page, row, col) => page.getByRole('button', { name: new RegExp(`^Row ${row}, column ${col}, `) })
// Cell.jsx labels a taken cell "Row r, column c, X", plus ", last move" on the latest one.
const occupiedBy = (symbol) => new RegExp(`^Row \\d, column \\d, ${symbol}(,|$)`)

test('two players create, join and finish a Tic Tac Toe room', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('P1 onboards and creates a room', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'TIC TAC TOE')
    await expect(alice.page.getByText('WAITING FOR OPPONENT')).toBeVisible()
  })

  await test.step('P2 joins through the invite link', async () => {
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    await expect(bob.page).toHaveURL(alice.page.url())
  })

  await test.step('both see each other and whose turn it is', async () => {
    await expect(alice.page.getByText('Bob', { exact: true })).toBeVisible()
    await expect(bob.page.getByText('Alice', { exact: true })).toBeVisible()
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
    await expect(bob.page.getByText("OPPONENT'S TURN")).toBeVisible()
  })

  // X wins down the middle column: X(2,2) O(1,1) X(1,2) O(1,3) X(3,2).
  const moves = [
    [alice, bob, 2, 2, 'X'],
    [bob, alice, 1, 1, 'O'],
    [alice, bob, 1, 2, 'X'],
    [bob, alice, 1, 3, 'O'],
    [alice, bob, 3, 2, 'X'],
  ]
  for (const [mover, watcher, row, col, symbol] of moves) {
    await test.step(`${symbol} plays row ${row}, column ${col}`, async () => {
      await expect(mover.page.getByText('YOUR TURN')).toBeVisible()
      await cell(mover.page, row, col).click()
      await expect(cell(mover.page, row, col)).toHaveAccessibleName(occupiedBy(symbol))
      await expect(cell(watcher.page, row, col)).toHaveAccessibleName(occupiedBy(symbol))
    })
  }

  await test.step('the win reaches both players', async () => {
    await expect(alice.page.getByText('YOU WIN!')).toBeVisible()
    await expect(bob.page.getByText('GAME OVER')).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
