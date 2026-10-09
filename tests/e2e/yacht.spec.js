// Yacht across two clients: the lobby starts a match, a roll requested by one
// player is resolved from the server's time and shows the same five dice on
// both screens, and banking a box moves the turn (src/lib/yachtLogic.js).
import { test, expect } from '@playwright/test'
import { completeOnboarding, createRoom, expectNoPageErrors, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'
import { lastRollMatches, normalizeRound } from '../../src/lib/yachtLogic.js'

const NS = 'demo-game-night-default-rtdb'
const readRound = async (url) => {
  const id = url.split('/').pop()
  const res = await fetch(`${DB_ORIGIN}/games/${id}/round.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}

async function joinNamed(page, roomUrl, name) {
  await onboard(page, name)
  await page.goto(roomUrl)
  const invited = page.getByRole('heading', { name: /YOU.RE INVITED/ })
  const lobby = page.getByText(/^PLAYERS \(\d\/4\)/)
  await expect(invited.or(lobby)).toBeVisible()
  if (await invited.isVisible()) await completeOnboarding(page, name, 'JOIN GAME')
  await expect(lobby).toBeVisible()
}

// The faces on screen, read from the dice buttons' labels ("Die 1: 4").
const diceOn = (page) => page.getByRole('button', { name: /^Die \d: \d/ }).evaluateAll((els) => els.map((el) => Number(el.getAttribute('aria-label').match(/: (\d)/)[1])))

test('Yacht: a roll is the same on both screens and a banked box passes the turn', async ({ browser }) => {
  test.setTimeout(120_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players start a match from the lobby', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'YACHT')
    await joinNamed(bob.page, alice.page.url(), 'Bob')
    await expect(alice.page.getByText('PLAYERS (2/4)')).toBeVisible()
    await alice.page.getByRole('button', { name: 'START MATCH' }).click()
    await expect(alice.page.getByText('YOUR TURN · ROLL THE DICE')).toBeVisible()
    await expect(bob.page.getByText('ALICE IS ROLLING…')).toBeVisible()
  })

  let before
  await test.step('Alice rolls: both screens show the same five dice', async () => {
    before = await readRound(alice.page.url())
    await alice.page.getByRole('button', { name: /^ROLL/ }).click()
    await expect.poll(async () => (await diceOn(alice.page)).length).toBe(5)
    await expect.poll(async () => (await diceOn(bob.page)).length).toBe(5)
    expect(await diceOn(bob.page)).toEqual(await diceOn(alice.page))
    const after = await readRound(alice.page.url())
    expect(normalizeRound(after).dice).toEqual(await diceOn(alice.page))
    // The dice in the room are the ones the seed and the server's time give.
    expect(lastRollMatches(after, before)).toBe(true)
  })

  await test.step('holding a die shows on the other screen', async () => {
    await alice.page.getByRole('button', { name: /^Die 1: \d$/ }).click()
    await expect(alice.page.getByRole('button', { name: /^Die 1: \d, held$/ })).toBeVisible()
    await expect(bob.page.getByRole('button', { name: /^Die 1: \d, held$/ })).toBeVisible()
  })

  await test.step('Alice banks CHANCE and the turn passes to Bob', async () => {
    const sum = (await diceOn(alice.page)).reduce((s, v) => s + v, 0)
    await alice.page.getByRole('button', { name: `CHANCE: score ${sum}` }).click()
    await alice.page.getByRole('button', { name: new RegExp(`^SCORE \\+${sum}`) }).click()
    await expect(alice.page.getByText('BOB IS ROLLING…')).toBeVisible()
    await expect(bob.page.getByText('YOUR TURN · ROLL THE DICE')).toBeVisible()
    await expect(alice.page.getByRole('button', { name: `CHANCE: ${sum}` })).toBeVisible()
    await expect(bob.page.getByRole('button', { name: new RegExp(`^Alice: ${sum} points`) })).toBeVisible()
  })

  await test.step('Bob cannot be rolled for by Alice', async () => {
    await expect(alice.page.getByRole('button', { name: /^ROLL/ })).toBeDisabled()
    await bob.page.getByRole('button', { name: /^ROLL/ }).click()
    await expect.poll(async () => (await diceOn(alice.page)).length).toBe(5)
    expect(await diceOn(alice.page)).toEqual(await diceOn(bob.page))
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
