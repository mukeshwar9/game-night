// Spyfair: three players; exactly one is dealt the spy, the other two share a
// location, and neither the spy nor the location nor any role is readable in
// the room node during the round (each card is sealed to its player's key).
// The group votes the spy out and the reveal names both for everyone.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const DB = 'http://127.0.0.1:9000'
const NS = 'demo-game-night-default-rtdb'
const roomIdOf = (url) => url.split('/game/')[1]
async function readRoom(id) {
  const res = await fetch(`${DB}/games/${id}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}

test('one spy, sealed cards, a vote and a reveal', async ({ browser }) => {
  const names = ['Hana', 'Gus', 'Gia']
  const players = []
  for (const name of names) players.push({ ...(await newPlayer(browser)), name })
  const [host, ...guests] = players
  let roomId

  await test.step('three players fill the lobby and publish their sealing keys', async () => {
    await onboard(host.page, host.name)
    await createRoom(host.page, 'SPYFAIR')
    roomId = roomIdOf(host.page.url())
    for (const g of guests) await joinViaInvite(g.page, host.page.url(), g.name)
    for (const { page } of players) await expect(page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    await expect(host.page.getByText('READY', { exact: true })).toHaveCount(3)
  })

  await test.step('the host deals and everyone peeks at their card', async () => {
    await host.page.getByRole('button', { name: 'START ROUND' }).click()
    for (const { page } of players) {
      await page.getByRole('button', { name: 'TAP TO SEE YOUR SECRET' }).click()
      await expect(page.getByTestId('spyfair-card')).toContainText(/YOU ARE THE|Your role:/)
    }
  })

  let spy
  let location
  const roles = []
  await test.step('exactly one spy; the others share one location — none of it in the room node', async () => {
    const cards = []
    for (const p of players) cards.push((await p.page.getByTestId('spyfair-card').innerText()).trim())
    const spyIdx = cards.map((c, i) => (c.includes('YOU ARE THE') ? i : -1)).filter(i => i >= 0)
    expect(spyIdx).toHaveLength(1)
    spy = players[spyIdx[0]]
    const others = players.filter(p => p !== spy)
    const locs = []
    for (const p of others) {
      const card = p.page.getByTestId('spyfair-card')
      locs.push((await card.locator('p').nth(1).innerText()).trim())
      roles.push((await card.innerText()).match(/Your role: (.+)/)[1].trim())
    }
    expect(new Set(locs).size).toBe(1)
    location = locs[0]
    expect(location.length).toBeGreaterThan(0)
    await expect(spy.page.getByText('Your role:')).toHaveCount(0)

    const round = (await readRoom(roomId)).round
    expect(round.private).toBeUndefined()
    expect(round.spy ?? null).toBeNull()
    expect(round.locationIndex ?? null).toBeNull()
    expect(Object.keys(round.sealed)).toHaveLength(3)
    const json = JSON.stringify(round)
    expect(json).not.toContain(location)
    expect(json).not.toContain('"SPY"')
    for (const role of roles) expect(json).not.toContain(role)
  })

  await test.step('a guest reopens the room in a new tab and the dealer reseals their card', async () => {
    const g = guests[1]
    const wasSpy = g === spy
    const url = host.page.url()
    await g.page.close()
    g.page = await g.context.newPage()
    g.page.on('pageerror', (err) => g.errors.push(err))
    await g.page.goto(url)
    await g.page.getByRole('button', { name: 'TAP TO SEE YOUR SECRET' }).click()
    const card = g.page.getByTestId('spyfair-card')
    // The new tab has a fresh key, so the card only opens once it's resealed.
    await expect(card).toContainText(wasSpy ? /YOU ARE THE/ : new RegExp(location))
  })

  await test.step('questioning, then the group votes the spy out', async () => {
    await host.page.getByRole('button', { name: 'START QUESTIONING' }).click()
    await host.page.getByRole('button', { name: 'CALL THE VOTE NOW' }).click()
    for (const p of players) {
      await expect(p.page.getByText('WHO IS THE SPY?')).toBeVisible()
      const target = p === spy ? players.find(q => q !== spy) : spy
      await p.page.getByRole('button', { name: new RegExp(`^${target.name}`) }).click()
    }
  })

  await test.step('the reveal names the spy and the location for everyone', async () => {
    for (const { page } of players) {
      await expect(page.getByText('SPY CAUGHT!')).toBeVisible()
      await expect(page.getByText(new RegExp(`The spy was ${spy.name}`))).toBeVisible()
      await expect(page.getByText(new RegExp(`The location was ${location}`))).toBeVisible()
      await expect(page.getByText('UNVERIFIED')).toHaveCount(0)
    }
    const room = await readRoom(roomId)
    const spyUid = Object.values(room.players).find(p => p.name === spy.name).playerId
    expect(room.round.phase).toBe('result')
    expect(room.round.spy).toBe(spyUid)
    expect(room.round.consistent).toBe(true)
    for (const p of Object.values(room.players)) {
      expect(room.scores?.[p.playerId] || 0).toBe(p.playerId === spyUid ? 0 : 1)
    }
  })

  expectNoPageErrors(...players)
  for (const { context } of players) await context.close()
})
