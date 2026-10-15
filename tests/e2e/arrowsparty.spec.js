// ARROWS PARTY (src/pages/ArrowsPartyGame.jsx, src/lib/arrowsPartyLogic.js): a
// shared-board race for 2–4 phones. Three players in their own browser contexts
// pick the difficulty in the lobby, race the same seeded puzzle (the spec reads
// the seed from the emulator and solves it with the page's own pure logic),
// see each other's progress on their own screens, and the cup scores finish
// order. A second spec turns SABOTAGE on and checks a crate lands on the leader;
// a third races one player against two AI racers.
import { test, expect } from '@playwright/test'
import { ROOM_URL, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'
import { partyLevel } from '../../src/lib/arrowsPartyLogic.js'
import { solveArrows } from '../../src/lib/arrowsLogic.js'

test.describe.configure({ timeout: 240_000 })

const NS = 'demo-game-night-default-rtdb'
const roomId = (url) => url.split('/').pop()
const readRoom = async (url) => {
  const res = await fetch(`${DB_ORIGIN}/games/${roomId(url)}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}
const uidOf = (room, name) => Object.values(room.players).find((p) => p.name === name).playerId

async function openParty(page) {
  await page.goto('/games?intent=friend')
  await expect(page.getByRole('heading', { name: 'CHOOSE YOUR GAME' })).toBeVisible()
  await page.getByRole('button', { name: /^ARROWS PUZZLE\b/ }).first().click()
  const sheet = page.getByRole('dialog', { name: /^ARROWS PUZZLE\b/ })
  await sheet.getByRole('button', { name: 'MORE MODES' }).click()
  await page.getByRole('dialog', { name: /ARROWS PUZZLE — pick a mode/ }).getByRole('button', { name: /^PARTY/ }).click()
  await page.waitForURL(ROOM_URL)
}

// Everyone taps READY (a tap can land while the lobby re-renders, so tap again until the round is live).
async function startRound(players) {
  await expect.poll(async () => {
    for (const { page } of players) {
      const ready = page.getByRole('button', { name: 'READY', exact: true })
      if (await ready.count()) await ready.click({ timeout: 2000 }).catch(() => {})
    }
    return (await readRoom(players[0].page.url())).status
  }, { timeout: 40_000, intervals: [800] }).toBe('playing')
}

// Seat `seat` clears its zone's arrows in the puzzle's own solve order (`from` / `to` slice it).
async function clear(page, { order, per, seat, from = 0, to = order.length }) {
  for (const i of order.slice(from, to)) {
    const arrow = page.getByRole('button', { name: new RegExp(`^Arrow ${seat * per + i + 1},`) })
    await arrow.press('Enter', { timeout: 5000 })
  }
}

test('three phones race one puzzle: setup, rival progress, a freeze, finish order and cup points', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  const carol = await newPlayer(browser)
  const everyone = [alice, bob, carol]

  await test.step('the host picks EASY and a 5-round cup; the others see the pick read-only', async () => {
    await onboard(alice.page, 'Alice')
    await openParty(alice.page)
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    await joinViaInvite(carol.page, alice.page.url(), 'Carol')
    for (const { page } of everyone) await expect(page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    await alice.page.getByRole('button', { name: /^EASY/ }).click()
    await expect(alice.page.getByRole('button', { name: /^EASY/ })).toHaveAttribute('aria-pressed', 'true')
    await alice.page.getByRole('group', { name: 'Rounds in the cup' }).getByRole('button', { name: /^5/ }).click()
    await expect(alice.page.getByRole('group', { name: 'Rounds in the cup' }).getByRole('button', { name: /^5/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(bob.page.getByRole('button', { name: /^EASY/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(bob.page.getByRole('button', { name: /^EASY/ })).toBeDisabled()
    await expect(bob.page.getByText(/5-RACE CUP/).first()).toBeVisible()
  })

  await test.step('everyone readies up and the round goes live with the locked settings', async () => {
    await startRound(everyone)
    for (const { page } of everyone) await expect(page.getByRole('list', { name: 'Racers' })).toBeVisible({ timeout: 20_000 })
  })

  const room = await readRoom(alice.page.url())
  const rid = room.round.id
  const racers = Object.keys(room.round.racers).sort()
  expect(racers).toHaveLength(3)
  expect(room.round.tier).toBe('easy')
  expect(room.arrowsPartyConfig).toEqual({ version: 1, tier: 'easy', rounds: 5, sabotage: false, bots: 0 })
  const base = partyLevel(room.round.seed, 3, 'easy')
  const per = base.arrows.length
  const { order } = solveArrows(base)
  expect(order).toHaveLength(per)
  const seatOf = (name) => racers.indexOf(uidOf(room, name))
  const aliceUid = uidOf(room, 'Alice')
  const bobUid = uidOf(room, 'Bob')
  const carolUid = uidOf(room, 'Carol')

  await test.step('the countdown ends and the arrows become tappable', async () => {
    for (const { page } of everyone) {
      await expect.poll(() => page.getByRole('button', { name: /^Arrow \d+,/ }).count(), { timeout: 20_000 }).toBeGreaterThan(0)
    }
  })

  await test.step('Alice clears half her zone: Bob and Carol see it on their rival bars and in the room', async () => {
    const half = Math.floor(per / 2)
    await clear(alice.page, { order, per, seat: seatOf('Alice'), to: half })
    await expect.poll(async () => Object.keys((await readRoom(alice.page.url())).round.stats?.[rid]?.[aliceUid]?.g ?? {}).length).toBe(half)
    for (const { page } of [bob, carol]) {
      await expect(page.getByRole('list', { name: 'Racers' }).getByText(`${half}/${per}`)).toBeVisible()
    }
  })

  await test.step('a blocked tap on a 3-racer board freezes you for 2 s and counts a miss', async () => {
    const seat = seatOf('Carol')
    // The last arrow of the solve order is behind others at the start.
    const last = order[order.length - 1]
    await carol.page.getByRole('button', { name: new RegExp(`^Arrow ${seat * per + last + 1},`) }).press('Enter')
    await expect(carol.page.getByText(/^FROZEN/)).toBeVisible()
    await expect.poll(async () => (await readRoom(alice.page.url())).round.stats?.[rid]?.[carolUid]?.m).toBe(1)
    await expect(carol.page.getByText(/^FROZEN/)).toBeHidden({ timeout: 6000 })
  })

  await test.step('Alice finishes first, then Bob, then Carol', async () => {
    const seatAlice = seatOf('Alice')
    await clear(alice.page, { order, per, seat: seatAlice, from: Math.floor(per / 2) })
    await expect.poll(async () => (await readRoom(alice.page.url())).round.stats?.[rid]?.[aliceUid]?.fin).toBeGreaterThan(0)
    await clear(bob.page, { order, per, seat: seatOf('Bob') })
    await expect.poll(async () => (await readRoom(alice.page.url())).round.stats?.[rid]?.[bobUid]?.fin).toBeGreaterThan(0)
    await clear(carol.page, { order, per, seat: seatOf('Carol') })
  })

  await test.step('the round is ranked: 2 / 1 / 0 points, the race counted, and the next round is offered', async () => {
    await expect.poll(async () => (await readRoom(alice.page.url())).status, { timeout: 30_000 }).toBe('finished')
    const done = await readRoom(alice.page.url())
    expect(done.raceResult.order).toEqual([aliceUid, bobUid, carolUid])
    expect(done.raceResult.points).toEqual({ [aliceUid]: 2, [bobUid]: 1, [carolUid]: 0 })
    expect(done.scores).toEqual({ [aliceUid]: 2, [bobUid]: 1, [carolUid]: 0 })
    expect(done.cupRaces).toBe(1)
    for (const { page } of everyone) {
      await expect(page.getByRole('list', { name: 'Race results' })).toBeVisible()
      await expect(page.getByRole('button', { name: /^NEXT RACE/ })).toBeVisible()
    }
    await expect(alice.page.getByText('RACE 1 OF 5 DONE')).toBeVisible()
    // The cup is locked once under way: the host's picks stay but cannot change.
    await expect(alice.page.getByRole('button', { name: /^HARD/ })).toBeDisabled()
  })

  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})

test('sabotage: a trailing racer\'s streak drops a crate on the leader', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('the host switches SABOTAGE on and the round starts', async () => {
    await onboard(alice.page, 'Alice')
    await openParty(alice.page)
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const { page } of [alice, bob]) await expect(page.getByText(/^PLAYERS \(2\)/)).toBeVisible()
    await alice.page.getByRole('button', { name: /^EASY/ }).click()
    await alice.page.getByRole('button', { name: /^SABOTAGE/ }).click()
    await expect(alice.page.getByRole('button', { name: /^SABOTAGE/ })).toHaveAttribute('aria-pressed', 'true')
    await startRound([alice, bob])
    for (const { page } of [alice, bob]) {
      await expect.poll(() => page.getByRole('button', { name: /^Arrow \d+,/ }).count(), { timeout: 25_000 }).toBeGreaterThan(0)
    }
  })

  const room = await readRoom(alice.page.url())
  const rid = room.round.id
  expect(room.round.sab).toBe(true)
  const racers = Object.keys(room.round.racers).sort()
  const base = partyLevel(room.round.seed, 2, 'easy')
  const per = base.arrows.length
  const { order } = solveArrows(base)
  const aliceUid = uidOf(room, 'Alice')
  const bobUid = uidOf(room, 'Bob')

  await test.step('Alice leads by four clears; Bob clears three in a row', async () => {
    await clear(alice.page, { order, per, seat: racers.indexOf(aliceUid), to: 4 })
    await expect.poll(async () => Object.keys((await readRoom(alice.page.url())).round.stats?.[rid]?.[aliceUid]?.g ?? {}).length).toBe(4)
    await clear(bob.page, { order, per, seat: racers.indexOf(bobUid), to: 3 })
  })

  await test.step('the drop is one write-once record on Alice, signed by Bob, naming her progress', async () => {
    await expect.poll(async () => (await readRoom(alice.page.url())).round.drops?.[aliceUid]?.[0], { timeout: 10_000 })
      .toBe(`4|${rid}|${bobUid}`)
    await expect(alice.page.getByText(/^⚠ CRATE FROM BOB/)).toBeVisible()
    await expect(bob.page.getByText(/^➤ CRATE SENT TO ALICE/)).toBeVisible()
  })

  await test.step('nothing is dropped on the trailing racer', async () => {
    const after = await readRoom(alice.page.url())
    expect(after.round.drops?.[bobUid]).toBeUndefined()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('AI racers: one player starts a cup alone against two AIs, who race, finish and score', async ({ browser }) => {
  const alice = await newPlayer(browser)

  await test.step('the host picks two AIs and starts alone', async () => {
    await onboard(alice.page, 'Alice')
    await openParty(alice.page)
    await expect(alice.page.getByText(/^PLAYERS \(1\)/)).toBeVisible()
    await alice.page.getByRole('button', { name: /^EASY/ }).click()
    await alice.page.getByRole('group', { name: 'AI racers' }).getByRole('button', { name: '2 AI racers' }).click()
    await expect(alice.page.getByRole('button', { name: '2 AI racers' })).toHaveAttribute('aria-pressed', 'true')
    await expect(alice.page.getByRole('list', { name: 'AI racers' }).getByText('AI 1')).toBeVisible()
    await expect(alice.page.getByRole('list', { name: 'AI racers' }).getByText('AI 2')).toBeVisible()
    await startRound([alice])
  })

  const room = await readRoom(alice.page.url())
  const rid = room.round.id
  const aliceUid = uidOf(room, 'Alice')
  expect(room.round.bots).toBe(2)
  expect(room.round.botHost).toBe(aliceUid)
  const racers = Object.keys(room.round.racers).sort()
  expect(racers).toEqual([aliceUid, 'bot1', 'bot2'].sort())
  const base = partyLevel(room.round.seed, 3, 'easy')
  const per = base.arrows.length
  const { order } = solveArrows(base)

  await test.step('the AIs appear in the tiles and start clearing on their own', async () => {
    await expect(alice.page.getByRole('list', { name: 'Racers' }).getByText('AI 1')).toBeVisible({ timeout: 20_000 })
    await expect.poll(async () => Object.keys((await readRoom(alice.page.url())).round.stats?.[rid]?.bot1?.g ?? {}).length, { timeout: 30_000 }).toBeGreaterThan(0)
  })

  await test.step('Alice clears her zone first; the AIs keep going until they finish', async () => {
    await expect.poll(() => alice.page.getByRole('button', { name: /^Arrow \d+,/ }).count(), { timeout: 20_000 }).toBeGreaterThan(0)
    await clear(alice.page, { order, per, seat: racers.indexOf(aliceUid) })
    await expect.poll(async () => (await readRoom(alice.page.url())).round.stats?.[rid]?.[aliceUid]?.fin).toBeGreaterThan(0)
  })

  await test.step('the round ranks all three: Alice first, the AIs scored on the cup', async () => {
    await expect.poll(async () => (await readRoom(alice.page.url())).status, { timeout: 120_000, intervals: [1000] }).toBe('finished')
    const done = await readRoom(alice.page.url())
    expect(done.raceResult.order[0]).toBe(aliceUid)
    expect(done.raceResult.order).toHaveLength(3)
    expect(done.raceResult.points[aliceUid]).toBe(2)
    expect(done.scores[aliceUid]).toBe(2)
    expect(Object.keys(done.scores).sort()).toEqual(racers)
    expect(done.cupRaces).toBe(1)
    await expect(alice.page.getByRole('list', { name: 'Race results' }).getByText('AI 1')).toBeVisible()
    await expect(alice.page.getByRole('button', { name: /^NEXT RACE/ })).toBeVisible()
  })

  expectNoPageErrors(alice)
  await alice.context.close()
})
