// Party-first rooms: friends gather in a party, then the host picks a game
// that fits how many came. Alice starts a party from Home, Bob and Carol join
// by link, the picker is filtered for three (19 everyone / 62 take turns /
// 1 needs more), Alice picks Connect Four (two sit, Carol lines up), the match
// is fast-forwarded through the emulator's admin REST API, Alice takes
// everyone back to the party and picks Fibbage (all three seated). A fourth
// joins, a fifth sees PARTY FULL, and a member the host removes stays out
// after the next switch.
import { test, expect } from '@playwright/test'
import { completeOnboarding, expectNoPageErrors, newPlayer, onboard, ROOM_URL } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'demo-game-night-default-rtdb'
const admin = { Authorization: 'Bearer owner' }

async function readRoom(request, gameId) {
  const res = await request.get(`${DB_ORIGIN}/games/${gameId}.json?ns=${NS}`, { headers: admin })
  expect(res.ok()).toBe(true)
  return res.json()
}

async function patchRoom(request, gameId, data) {
  const res = await request.patch(`${DB_ORIGIN}/games/${gameId}.json?ns=${NS}`, { headers: admin, data })
  expect(res.ok()).toBe(true)
}

// Onboard, then open the party link (handles the YOU'RE INVITED name prompt).
async function joinParty(page, url, name) {
  await onboard(page, name)
  await page.goto(url)
  const invited = page.getByRole('heading', { name: /YOU.RE INVITED/ })
  const lobby = page.getByTestId('party-lobby')
  await expect(invited.or(lobby)).toBeVisible()
  if (await invited.isVisible()) await completeOnboarding(page, name, 'JOIN GAME')
  await expect(lobby).toBeVisible()
}

const group = (page, id) => page.getByTestId(id)

test('party first: gather, pick by party size, take turns, back to the party', async ({ browser, request }) => {
  test.setTimeout(240_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  const carol = await newPlayer(browser)
  let url, gameId

  await test.step('Alice starts a party from Home', async () => {
    await onboard(alice.page, 'Alice')
    await alice.page.getByTestId('start-party').click()
    await alice.page.waitForURL(ROOM_URL)
    url = alice.page.url()
    gameId = url.split('/').pop()
    await expect(alice.page.getByTestId('party-lobby')).toBeVisible()
    await expect(alice.page.getByTestId('party-count')).toHaveText('1 / 4')
    const room = await readRoom(request, gameId)
    expect(room).toMatchObject({ gameType: 'party', partyRoom: true, partyCap: 4 })
  })

  await test.step('Bob and Carol join; the picker fits three', async () => {
    await joinParty(bob.page, url, 'Bob')
    await joinParty(carol.page, url, 'Carol')
    await expect(alice.page.getByTestId('party-count')).toHaveText('3 / 4')
    await expect(group(alice.page, 'party-group-all')).toContainText('EVERYONE PLAYS · 19')
    await group(alice.page, 'party-group-all').getByRole('button', { name: 'SHOW ALL 19' }).click()
    await expect(group(alice.page, 'party-group-all').getByRole('button', { name: /^Play / })).toHaveCount(19)
    await expect(group(alice.page, 'party-group-rotate')).toContainText('TAKE TURNS · 2 PLAY, WINNER STAYS · 63')
    await group(alice.page, 'party-group-rotate').getByRole('button', { name: 'SHOW ALL 63' }).click()
    await expect(group(alice.page, 'party-group-rotate').getByRole('button', { name: /^Play / })).toHaveCount(63)
    await expect(group(alice.page, 'party-group-short')).toContainText('NEEDS MORE PLAYERS · 1')
    // Guests see who is picking and can't pick.
    await expect(bob.page.getByTestId('party-picking')).toContainText('Alice')
    await expect(group(bob.page, 'party-group-all').getByRole('button', { name: 'FIBBAGE' })).toBeDisabled()
  })

  await test.step('Alice picks Connect Four: host and next joiner sit, Carol lines up', async () => {
    await group(alice.page, 'party-group-rotate').getByRole('button', { name: 'Play CONNECT FOUR' }).click()
    for (const p of [alice, bob, carol]) await expect(p.page.getByTestId('night-queue')).toContainText('Carol')
    const room = await readRoom(request, gameId)
    expect(room.gameType).toBe('connectfour')
    expect(room.players.X.name).toBe('Alice')
    expect(room.players.O.name).toBe('Bob')
    expect(Object.values(room.queue).map(q => q.name)).toEqual(['Carol'])
  })

  await test.step('the match ends: only the host can take everyone back to the party', async () => {
    await patchRoom(request, gameId, { status: 'finished', winner: 'X', scores: { X: 3, O: 0 } })
    await expect(bob.page.getByTestId('host-picks-next')).toContainText('ALICE PICKS NEXT')
    await expect(bob.page.getByTestId('back-to-party')).toHaveCount(0)
    await alice.page.getByTestId('back-to-party').click()
    for (const p of [alice, bob, carol]) await expect(p.page.getByTestId('party-lobby')).toBeVisible()
    await expect(alice.page.getByTestId('party-count')).toHaveText('3 / 4')
  })

  await test.step('Alice picks Fibbage: all three are seated', async () => {
    await group(alice.page, 'party-group-all').getByRole('button', { name: 'Play FIBBAGE' }).click()
    await expect.poll(async () => (await readRoom(request, gameId)).gameType).toBe('fibbage')
    const room = await readRoom(request, gameId)
    expect(Object.values(room.players).map(p => p.name).sort()).toEqual(['Alice', 'Bob', 'Carol'])
    await alice.page.getByTestId('back-to-party').click()
    await expect(carol.page.getByTestId('party-lobby')).toBeVisible()
  })

  const dave = await newPlayer(browser)
  const eve = await newPlayer(browser)
  await test.step('a fourth fills the party; a fifth sees PARTY FULL', async () => {
    await joinParty(dave.page, url, 'Dave')
    await expect(alice.page.getByTestId('party-count')).toHaveText('4 / 4')
    await onboard(eve.page, 'Eve')
    await eve.page.goto(url)
    const invited = eve.page.getByRole('heading', { name: /YOU.RE INVITED/ })
    await expect(invited.or(eve.page.getByTestId('party-full'))).toBeVisible()
    if (await invited.isVisible()) await completeOnboarding(eve.page, 'Eve', 'JOIN GAME')
    await expect(eve.page.getByTestId('party-full')).toBeVisible()
    const room = await readRoom(request, gameId)
    expect(Object.keys(room.players)).toHaveLength(4)
  })

  await test.step('the host removes Dave; he stays out after the next switch', async () => {
    await alice.page.getByRole('button', { name: /^HOST CONTROLS/ }).click()
    await alice.page.getByTestId('host-controls').getByRole('button', { name: 'Remove Dave' }).click()
    await alice.page.getByRole('dialog', { name: 'REMOVE DAVE?' }).getByRole('button', { name: 'REMOVE' }).click()
    await expect(dave.page.getByTestId('party-removed')).toBeVisible()
    await group(alice.page, 'party-group-all').getByRole('button', { name: 'Play TRIVIA BLITZ' }).click()
    await expect.poll(async () => (await readRoom(request, gameId)).gameType).toBe('trivia')
    await dave.page.reload()
    await expect(dave.page.getByTestId('party-removed')).toBeVisible()
    const room = await readRoom(request, gameId)
    expect(room.removed).toBeTruthy()
    expect(Object.values(room.players).map(p => p.name)).not.toContain('Dave')
  })

  expectNoPageErrors(alice, bob, carol)
  for (const p of [alice, bob, carol, dave, eve]) await p.context.close()
})
