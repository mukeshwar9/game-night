// App backgrounded mid-match (native shell): before the shell drops the
// database connection, the room seat is stamped `awayAt`, so the opponent
// reads STEPPED AWAY instead of OFFLINE (useRoomPresence, presenceLogic
// seatAway). The web build has no shell, so the test fires the shell's
// `native-pause` event itself, waits for the stamp like the shell does, then
// closes the page to drop the connection.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test('an opponent whose app went to the background reads as STEPPED AWAY', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players start a Tic Tac Toe round', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'TIC TAC TOE')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
  })

  await test.step('Bob sends the app to the background', async () => {
    await bob.page.evaluate(async () => {
      const pending = []
      window.dispatchEvent(new CustomEvent('native-pause', { detail: { waitUntil: (p) => pending.push(p) } }))
      await Promise.all(pending)
      return pending.length
    }).then((n) => expect(n).toBeGreaterThan(0))
    await bob.page.close()
  })

  await test.step('Alice sees STEPPED AWAY, not OFFLINE', async () => {
    await expect(alice.page.getByText('OPPONENT STEPPED AWAY — BACK SOON?')).toBeVisible({ timeout: 20_000 })
    await expect(alice.page.getByText('OPPONENT IS OFFLINE')).toHaveCount(0)
  })

  await test.step('Bob comes back and the notice clears', async () => {
    const page = await bob.context.newPage()
    await page.goto(alice.page.url())
    await expect(alice.page.getByText('OPPONENT STEPPED AWAY — BACK SOON?')).toHaveCount(0, { timeout: 20_000 })
  })

  expectNoPageErrors(alice)
  await alice.context.close()
  await bob.context.close()
})
