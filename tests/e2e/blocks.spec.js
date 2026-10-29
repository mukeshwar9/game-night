// Blocking is an account-level block, not a device-local chat mute: after Alice
// blocks Bob, Bob's friend request and invite are refused by the database
// rules, and the block follows Alice's account (blocks/{uid}).
import { test, expect } from '@playwright/test'
import { authOf, expectNoPageErrors, newPlayer, onboard, uidOf } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'demo-game-night-default-rtdb'
const headers = { Authorization: 'Bearer owner' }

async function readNode(request, path) {
  const res = await request.get(`${DB_ORIGIN}/${path}.json?ns=${NS}`, { headers })
  expect(res.ok()).toBe(true)
  return res.json()
}

test('a blocked player cannot send friend requests or invites', async ({ browser, request }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  await onboard(alice.page, 'Alice')
  await onboard(bob.page, 'Bob')
  await alice.page.goto('/friends')
  await bob.page.goto('/friends')
  const aliceUid = await uidOf(alice.page)
  const bobUid = await uidOf(bob.page)
  expect(aliceUid).toBeTruthy()
  expect(bobUid).toBeTruthy()
  await expect(alice.page.locator('[data-selectable]').first()).toHaveText(/^[A-Z0-9]{6}$/)
  const code = (await alice.page.locator('[data-selectable]').first().textContent()).trim()

  await test.step('Bob adds Alice, Alice accepts: they are friends', async () => {
    await bob.page.getByPlaceholder('ENTER CODE').fill(code)
    await bob.page.getByRole('button', { name: 'SEND', exact: true }).click()
    await expect(alice.page.getByRole('button', { name: 'ACCEPT' })).toBeVisible()
    await alice.page.getByRole('button', { name: 'ACCEPT' }).click()
    await expect(alice.page.getByText('MY FRIENDS (1)')).toBeVisible()
    await expect(alice.page.getByRole('button', { name: 'ACCEPT' })).toBeHidden()
  })

  await test.step('Alice blocks Bob from her friends list', async () => {
    await alice.page.getByRole('button', { name: /More actions for Bob/ }).click()
    await alice.page.getByRole('button', { name: 'BLOCK', exact: true }).click()
    await expect(alice.page.getByText('NO FRIENDS YET')).toBeVisible()
    await expect.poll(() => readNode(request, `blocks/${aliceUid}/${bobUid}`)).toMatchObject({ name: 'Bob' })
    expect(await readNode(request, `friends/${aliceUid}/${bobUid}`)).toBeNull()
    expect(await readNode(request, `friends/${bobUid}/${aliceUid}`)).toBeNull()
  })

  await test.step("Bob's new friend request is refused: Alice never sees it", async () => {
    await bob.page.reload()
    await bob.page.getByPlaceholder('ENTER CODE').fill(code)
    await bob.page.getByRole('button', { name: 'SEND', exact: true }).click()
    // Bob is not told he is blocked; the request just never lands.
    await expect(bob.page.getByText(/REQUEST SENT/)).toBeVisible()
    expect(await readNode(request, `friendRequests/${aliceUid}`)).toBeNull()
    await alice.page.reload()
    await expect(alice.page.getByText(/^REQUESTS \(/)).toHaveCount(0)
  })

  await test.step("Bob's invite is refused by the database", async () => {
    // The same write inviteFriendToGame makes, with Bob's own token.
    const { token } = await authOf(bob.page)
    const res = await request.post(`${DB_ORIGIN}/invites/${aliceUid}.json?ns=${NS}&auth=${token}`, {
      data: JSON.stringify({ gameId: 'ABC123', gameType: 'tictactoe', fromUid: bobUid, fromName: 'Bob', fromAvatar: '', at: Date.now() }),
    })
    expect(res.status()).toBe(401)
    expect(await readNode(request, `invites/${aliceUid}`)).toBeNull()
  })

  await test.step('Alice sees Bob under blocked players and can unblock him', async () => {
    await alice.page.goto('/profile')
    await expect(alice.page.getByText('BLOCKED PLAYERS', { exact: true })).toBeVisible()
    await alice.page.getByRole('button', { name: 'UNBLOCK' }).click()
    await expect.poll(() => readNode(request, `blocks/${aliceUid}/${bobUid}`)).toBeNull()
  })

  expectNoPageErrors(alice)
  expectNoPageErrors(bob)
  await alice.context.close()
  await bob.context.close()
})
