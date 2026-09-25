// LEAVE mid-match (report §5.3/§5.5): the leaver's own presence seat gets a
// `leftAt` marker, so the opponent is offered CLAIM WIN straight away instead
// of waiting out the 120 s abandon window.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test('tapping LEAVE lets the opponent claim the win at once', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players start a Tic Tac Toe round', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'TIC TAC TOE')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
    await expect(bob.page.getByText("OPPONENT'S TURN")).toBeVisible()
  })

  await test.step('Bob leaves through the HOME confirm', async () => {
    await bob.page.getByRole('link', { name: '← HOME' }).click()
    await expect(bob.page.getByText('LEAVE MATCH?')).toBeVisible()
    await bob.page.getByRole('button', { name: 'LEAVE', exact: true }).click()
    await expect(bob.page).not.toHaveURL(/\/game\//)
  })

  await test.step('Alice can claim immediately — well inside the 120 s window', async () => {
    await expect(alice.page.getByText('OPPONENT LEFT THE MATCH')).toBeVisible({ timeout: 10_000 })
    await alice.page.getByRole('button', { name: 'CLAIM WIN' }).click()
    await expect(alice.page.getByText('YOU WIN!')).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
