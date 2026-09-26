// Spectators (report 4.1 #8): a third visitor to a full 2P room watches, is
// counted as "N WATCHING" through `spectators/{uid}` presence, and their
// reactions reach the players instead of being dropped.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test('a spectator is counted and can react', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  const carol = await newPlayer(browser)

  await test.step('two players fill a Tic Tac Toe room', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'TIC TAC TOE')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
    await expect(alice.page.getByText(/WATCHING$/)).toHaveCount(0)
  })

  await test.step('a third visitor watches and both players see the count', async () => {
    await joinViaInvite(carol.page, alice.page.url(), 'Carol')
    await expect(carol.page.getByText('SPECTATING', { exact: true })).toBeVisible()
    for (const { page } of [alice, bob, carol]) {
      await expect(page.getByText('1 WATCHING')).toBeVisible()
    }
  })

  await test.step("the spectator's reaction floats for the players", async () => {
    await carol.page.getByRole('button', { name: /^Send .+ reaction$/ }).first().click()
    await expect(alice.page.getByText('Carol', { exact: true })).toBeVisible({ timeout: 5_000 })
  })

  await test.step('the count drops when the spectator leaves', async () => {
    await carol.context.close()
    await expect(alice.page.getByText('1 WATCHING')).toBeHidden()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
