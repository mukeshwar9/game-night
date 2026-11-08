// SKETCH mid-match join, three real players: Ivy and Gus start a match, Dan
// opens the invite link mid-round, sees he can join as a guesser, taps JOIN,
// waits out the round in flight, guesses and scores in the next round, and is
// added to the drawing order when the cycle wraps.
import { test, expect } from '@playwright/test'
import { authOf, completeOnboarding, createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'ns=demo-game-night-default-rtdb'
const stage = (page, phase) => page.locator(`[data-testid="sketch-stage"][data-phase="${phase}"]`)
const readRoom = async (gameId, path) => {
  const res = await fetch(`${DB_ORIGIN}/games/${gameId}/${path}.json?${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}
const pickWord = async (page) => {
  await page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first().click()
  await expect(stage(page, 'drawing')).toBeVisible()
  return (await page.getByTestId('sketch-word').innerText()).trim()
}
const guess = async (page, text) => {
  await page.getByRole('textbox', { name: 'Your guess' }).fill(text)
  await page.getByRole('button', { name: 'GO', exact: true }).click()
}

test('a visitor joins mid-match: guesses from the next round, draws from the next cycle', async ({ browser }) => {
  test.setTimeout(120_000)
  const ivy = await newPlayer(browser)
  const gus = await newPlayer(browser)
  const dan = await newPlayer(browser)
  let gameId = ''
  let roomUrl = ''
  let word = ''

  await test.step('Ivy and Gus start a match and Ivy draws', async () => {
    await onboard(ivy.page, 'Ivy')
    roomUrl = await createRoom(ivy.page, 'SKETCH')
    gameId = roomUrl.split('/').pop()
    await joinViaInvite(gus.page, roomUrl, 'Gus')
    await expect(ivy.page.getByText(/^PLAYERS \(2\)/)).toBeVisible()
    await ivy.page.getByRole('button', { name: 'START ROUND' }).click()
    word = await pickWord(ivy.page)
    await expect(stage(gus.page, 'drawing')).toBeVisible()
  })

  await test.step('Dan opens the link mid-match: the invite says he can join as a guesser', async () => {
    await dan.page.goto(roomUrl)
    await expect(dan.page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeVisible()
    await expect(dan.page.getByText('2/8 PLAYERS · MATCH IN PROGRESS — JOIN AS A GUESSER NEXT ROUND')).toBeVisible()
    await completeOnboarding(dan.page, 'Dan', 'JOIN GAME')
    await expect(stage(dan.page, 'drawing')).toBeVisible()
    // Watching: no guess box, a JOIN bar under the drawing, no game switcher.
    await expect(dan.page.getByRole('textbox', { name: 'Your guess' })).toHaveCount(0)
    await expect(dan.page.locator('[data-testid="sketch-join"][data-state="open"]')).toContainText('MATCH IN PROGRESS')
    await expect(dan.page.getByRole('button', { name: /SWITCH GAME/ })).toHaveCount(0)
  })

  await test.step('JOIN seats him for the next round with a NEW face for everyone', async () => {
    await dan.page.getByRole('button', { name: 'JOIN', exact: true }).click()
    const waiting = dan.page.locator('[data-testid="sketch-join"][data-state="waiting"]')
    await expect(waiting).toContainText("YOU'RE IN")
    await expect(waiting).toContainText('draw from cycle 2')
    // still not guessing this round
    await expect(dan.page.getByRole('textbox', { name: 'Your guess' })).toHaveCount(0)
    await expect(ivy.page.getByRole('group', { name: /^Dan, new, 0 points/ })).toBeVisible()
    await expect(gus.page.getByRole('group', { name: /^Dan, new, 0 points/ })).toBeVisible()
    // the round in flight still waits only on Gus
    await expect(ivy.page.getByText('YOU DRAW · 0 OF 1 GOT IT')).toBeVisible()
  })

  await test.step('Gus solves round 1; Dan scores nothing for it', async () => {
    await guess(gus.page, word)
    await expect(stage(ivy.page, 'reveal')).toBeVisible()
    const scores = await readRoom(gameId, 'scores')
    const { uid: danUid } = await authOf(dan.page)
    expect(scores?.[danUid] ?? 0).toBe(0)
  })

  await test.step('round 2: Gus draws, Dan guesses and scores', async () => {
    await expect(stage(gus.page, 'choosing')).toBeVisible({ timeout: 20_000 })
    word = await pickWord(gus.page)
    await expect(gus.page.getByText('YOU DRAW · 0 OF 2 GOT IT')).toBeVisible()
    await expect(dan.page.getByRole('textbox', { name: 'Your guess' })).toBeVisible()
    await expect(dan.page.getByTestId('sketch-join')).toHaveCount(0)
    await guess(dan.page, word)
    await expect(dan.page.getByText(/✓ YOU GOT IT · 1 OF 2 GOT IT/)).toBeVisible()
    await ivy.page.waitForTimeout(600)
    await guess(ivy.page, word)
    await expect(stage(dan.page, 'reveal')).toBeVisible()
    const { uid: danUid } = await authOf(dan.page)
    await expect.poll(async () => (await readRoom(gameId, 'scores'))?.[danUid] ?? 0).toBeGreaterThan(0)
  })

  await test.step('the cycle wraps and Dan joins the drawing order, last', async () => {
    await expect(stage(ivy.page, 'choosing')).toBeVisible({ timeout: 20_000 })
    const { uid: danUid } = await authOf(dan.page)
    const round = await readRoom(gameId, 'round')
    expect(round.cycle).toBe(2)
    expect(round.order).toHaveLength(3)
    expect(round.order[2]).toBe(danUid)
    // no longer new: he is in the order now
    await expect(ivy.page.getByRole('group', { name: /^Dan, \d+ points/ })).toBeVisible()
  })

  expectNoPageErrors(ivy, gus, dan)
  await ivy.context.close()
  await gus.context.close()
  await dan.context.close()
})
