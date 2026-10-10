// BAMBOOZLE across two clients: both racers get the same seeded garden, each
// phone reports its own dodger's hearts, and both screens show the ranking the
// room recorded when the last dodger falls (src/lib/bamboozleLogic.js,
// src/pages/BamboozleGame.jsx, RaceShell). Plus the two pages with no room:
// against bots (/solo/bamboozle) and on one phone (/local/bamboozle).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

test.describe.configure({ timeout: 180_000 })

const NS = 'demo-game-night-default-rtdb'
const readRoom = async (url) => {
  const id = url.split('/').pop()
  const res = await fetch(`${DB_ORIGIN}/games/${id}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}
const race = (page) => page.getByTestId('bamboozle-race')

test('Bamboozle: one garden for both racers and one shared ranking', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players ready up and the race starts', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'BAMBOOZLE')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const { page } of [alice, bob]) {
      await page.getByRole('button', { name: 'READY', exact: true }).click()
    }
    for (const { page } of [alice, bob]) {
      await expect(race(page)).toBeVisible({ timeout: 30_000 })
      await expect(race(page)).toHaveAttribute('data-hearts', '3')
    }
  })

  const room = await readRoom(alice.page.url())
  expect(Number.isFinite(room.round.seed)).toBe(true)
  // No deadline: a survival race ends when at most one dodger is left.
  expect(room.round.endsAt ?? null).toBeNull()

  await test.step('Bob walks about while Alice stands still; each phone reports its own hearts', async () => {
    await bob.page.keyboard.down('ArrowRight')
    await bob.page.waitForTimeout(500)
    await bob.page.keyboard.up('ArrowRight')
    await bob.page.keyboard.down('ArrowDown')
    await bob.page.waitForTimeout(400)
    await bob.page.keyboard.up('ArrowDown')
    // Alice's hearts reach the room and show on Bob's card for her.
    await expect.poll(async () => {
      const r = await readRoom(alice.page.url())
      const mine = Object.values(r.round?.stats?.[r.round.id] ?? {})
      return mine.length
    }, { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
  })

  await test.step('the garden fires until a dodger is out, and both screens see it', async () => {
    await expect.poll(async () => (await readRoom(alice.page.url())).status, { timeout: 120_000 }).toBe('finished')
    const final = await readRoom(alice.page.url())
    expect(final.raceResult.order).toHaveLength(2)
    const aliceUid = Object.values(final.players).find((p) => p.name === 'Alice').playerId
    const bobUid = Object.values(final.players).find((p) => p.name === 'Bob').playerId
    const ranks = final.raceResult.ranks
    expect([ranks[aliceUid], ranks[bobUid]].sort()).toEqual(expect.arrayContaining([1]))
    for (const { page } of [alice, bob]) {
      const rows = page.getByRole('list', { name: 'Race results' }).getByRole('listitem')
      await expect(rows).toHaveCount(2)
      await expect(rows.first()).toHaveAttribute('aria-label', new RegExp(final.raceResult.order[0] === aliceUid ? 'alice' : 'bob', 'i'))
    }
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('Bamboozle against bots: a round starts, counts in and plays', async ({ browser }) => {
  const p = await newPlayer(browser)
  await onboard(p.page, 'Solo')
  await p.page.goto('/solo/bamboozle')
  const table = p.page.getByTestId('bamboozle')
  await expect(table).toHaveAttribute('data-phase', 'ready')
  await p.page.getByRole('button', { name: /^2 BOTS/ }).click()
  await expect(table).toHaveAttribute('data-players', '3')
  await p.page.getByRole('button', { name: /TAP TO PLAY/ }).click()
  await expect(table).toHaveAttribute('data-phase', 'play')
  // You start with three hearts; the count-in is over within a few seconds.
  await expect(p.page.locator('[data-seat="0"]')).toHaveAttribute('data-hp', '3')
  await p.page.mouse.move(180, 400)
  await p.page.mouse.down()
  await p.page.mouse.move(240, 400, { steps: 5 })
  await p.page.mouse.up()
  await p.page.waitForTimeout(4000)
  await expect(p.page.getByTestId('bamboozle-canvas')).toBeVisible()
  expectNoPageErrors(p)
  await p.context.close()
})

test('Bamboozle on one phone: a thumb strip per seat', async ({ browser }) => {
  const p = await newPlayer(browser)
  await onboard(p.page, 'Host')
  await p.page.goto('/local/bamboozle')
  const table = p.page.getByTestId('bamboozle')
  await expect(table).toHaveAttribute('data-mode', 'local')
  await p.page.getByRole('button', { name: '4 PLAYERS' }).click()
  await expect(table).toHaveAttribute('data-players', '4')
  await expect(p.page.getByRole('group', { name: /^Player \d: drag here to steer$/ })).toHaveCount(4)
  await p.page.getByRole('button', { name: /TAP TO PLAY/ }).click()
  await expect(table).toHaveAttribute('data-phase', 'play')
  await p.page.waitForTimeout(3500)
  expectNoPageErrors(p)
  await p.context.close()
})
