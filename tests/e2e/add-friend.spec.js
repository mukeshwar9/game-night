// R2: after finishing a duel, one player taps "+ ADD AS FRIEND" and the other
// sees the request on /friends and accepts. Two browser contexts = two uids.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const cell = (page, row, col) => page.getByRole('button', { name: new RegExp(`^Row ${row}, column ${col}, `) })
const occupiedBy = (symbol) => new RegExp(`^Row \\d, column \\d, ${symbol}(,|$)`)

test('add the person you just played as a friend, and they accept', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('Alice hosts, Bob joins', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'TIC TAC TOE')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
  })

  await test.step('no add-friend offer while the game is still going', async () => {
    await expect(alice.page.getByRole('button', { name: '+ ADD AS FRIEND' })).toHaveCount(0)
  })

  // X wins down the middle column.
  const moves = [
    [alice, bob, 2, 2, 'X'],
    [bob, alice, 1, 1, 'O'],
    [alice, bob, 1, 2, 'X'],
    [bob, alice, 1, 3, 'O'],
    [alice, bob, 3, 2, 'X'],
  ]
  for (const [mover, watcher, row, col, symbol] of moves) {
    await expect(mover.page.getByText('YOUR TURN')).toBeVisible()
    await cell(mover.page, row, col).click()
    await expect(cell(watcher.page, row, col)).toHaveAccessibleName(occupiedBy(symbol))
  }
  await expect(alice.page.getByText('YOU WIN!')).toBeVisible()
  await expect(bob.page.getByText('ALICE WINS!')).toBeVisible()

  await test.step('Bob taps ADD AS FRIEND and sees REQUEST SENT', async () => {
    const add = bob.page.getByRole('button', { name: '+ ADD AS FRIEND' })
    await expect(add).toBeVisible()
    await add.click()
    await expect(bob.page.getByTestId('friend-request-sent')).toHaveText(/REQUEST SENT/)
    await expect(add).toHaveCount(0)
  })

  await test.step('Alice (still on the result screen) is not offered a duplicate once Bob asked', async () => {
    // The request reaches her incoming list, so the result screen stops offering it.
    await expect(alice.page.getByRole('button', { name: '+ ADD AS FRIEND' })).toHaveCount(0)
  })

  await test.step('Alice sees the request on /friends and accepts', async () => {
    await alice.page.goto('/friends')
    await expect(alice.page.getByText('REQUESTS (1)')).toBeVisible()
    await expect(alice.page.getByText('Bob', { exact: true })).toBeVisible()
    await alice.page.getByRole('button', { name: 'ACCEPT' }).click()
    await expect(alice.page.getByText('REQUESTS (1)')).toBeHidden()
    await expect(alice.page.getByText('Bob', { exact: true })).toBeVisible()
  })

  await test.step('Bob now has Alice as a friend', async () => {
    await bob.page.goto('/friends')
    await expect(bob.page.getByText('Alice', { exact: true })).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
