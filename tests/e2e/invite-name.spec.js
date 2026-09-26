// Invite join (report Top-10 #4): the invite screen names the game, the host
// and the places left, and the name typed there is saved to the invitee's
// profile — it survives a reload (ensureProfile used to swap it back for
// Guest-XXXX) and is what the opponent sees.
import { test, expect } from '@playwright/test'
import { completeOnboarding, createRoom, expectNoPageErrors, newPlayer, onboard } from './helpers.js'

const DB_URL = 'http://127.0.0.1:9000'
const NS = 'demo-game-night-default-rtdb'

async function readNode(request, path) {
  const res = await request.get(`${DB_URL}/${path}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  expect(res.ok()).toBe(true)
  return res.json()
}

test('an invitee names themselves once and the name sticks', async ({ browser, request }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  let roomUrl

  await test.step('host creates a Tic Tac Toe room', async () => {
    await onboard(alice.page, 'Alice')
    roomUrl = await createRoom(alice.page, 'TIC TAC TOE')
  })

  await test.step('the invite screen says which game, who hosts and what is left', async () => {
    await bob.page.goto(roomUrl)
    await expect(bob.page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeVisible()
    await expect(bob.page.getByText('TIC TAC TOE', { exact: true })).toBeVisible()
    await expect(bob.page.getByText(/HOSTED BY\s*Alice/)).toBeVisible()
    await expect(bob.page.getByText('1 SEAT LEFT')).toBeVisible()
  })

  await test.step('name, then look, then join', async () => {
    await completeOnboarding(bob.page, 'Bobby', 'JOIN GAME')
    await expect(bob.page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeHidden()
    await expect(alice.page.getByText('Bobby', { exact: true })).toBeVisible()
  })

  await test.step('the name is on the profile, not just this tab', async () => {
    const gameId = roomUrl.split('/').pop()
    const uid = await readNode(request, `games/${gameId}/players/O/playerId`)
    expect(typeof uid).toBe('string')
    await expect.poll(async () => (await readNode(request, `users/${uid}/displayName`))).toBe('Bobby')
  })

  await test.step('after a reload Bob is still Bobby, with no prompt', async () => {
    await bob.page.reload()
    await expect(bob.page.getByText('Bobby', { exact: true })).toBeVisible()
    await expect(bob.page.getByRole('heading', { name: /YOU.RE INVITED/ })).toHaveCount(0)
    await expect.poll(() => bob.page.evaluate(() => localStorage.getItem('playerName'))).toBe('Bobby')
    await expect(alice.page.getByText('Bobby', { exact: true })).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
