// SKETCH hearts and CROWD FAVOURITE, three real players: a guesser who got the
// word hearts the drawing while the other is still guessing, the artist sees
// the count but has no button, the second guesser hearts it at the reveal,
// and the match ends with the drawing as CROWD FAVOURITE on every screen —
// with the scores untouched by the hearts.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'ns=demo-game-night-default-rtdb'
const stage = (page, phase) => page.locator(`[data-testid="sketch-stage"][data-phase="${phase}"]`)
const heartButton = (page) => page.getByRole('button', { name: /^Love this drawing/ })

async function readRoom(gameId, path) {
  const res = await fetch(`${DB_ORIGIN}/games/${gameId}/${path}.json?${NS}`, { headers: { Authorization: 'Bearer owner' } })
  expect(res.ok).toBe(true)
  return res.json()
}

async function guess(page, text) {
  // Guesses are throttled to one per 500 ms, so a faster one is dropped silently.
  await page.waitForTimeout(600)
  await page.getByRole('textbox', { name: 'Your guess' }).fill(text)
  await page.getByRole('button', { name: 'GO', exact: true }).click()
}

test('two guessers heart a drawing and it is the CROWD FAVOURITE at the end', async ({ browser }) => {
  test.setTimeout(150_000)
  const ivy = await newPlayer(browser)
  const gus = await newPlayer(browser)
  const kai = await newPlayer(browser)
  let gameId = ''
  let kaiUid = ''
  let word = ''

  await test.step('three players start a match', async () => {
    await onboard(ivy.page, 'Ivy')
    await createRoom(ivy.page, 'SKETCH')
    gameId = ivy.page.url().split('/').pop()
    await joinViaInvite(gus.page, ivy.page.url(), 'Gus')
    await joinViaInvite(kai.page, ivy.page.url(), 'Kai')
    await expect(ivy.page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    await ivy.page.getByRole('button', { name: 'START ROUND' }).click()
    // Ivy joined first, so she would choose first; wait until her words are up.
    await expect(ivy.page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first()).toBeVisible()
  })

  await test.step('skip ahead to the last drawing of the match (test data only)', async () => {
    const order = await readRoom(gameId, 'round/order')
    expect(order).toHaveLength(3)
    kaiUid = order[2]
    const res = await fetch(`${DB_ORIGIN}/games/${gameId}/round.json?${NS}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner' },
      body: JSON.stringify({ cycle: 2, artist: kaiUid, options: null, endsAt: Date.now() + 15_000 }),
    })
    expect(res.ok).toBe(true)
  })

  await test.step('Kai picks a word and draws', async () => {
    await kai.page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first().click()
    await expect(stage(kai.page, 'drawing')).toBeVisible()
    word = (await kai.page.getByTestId('sketch-word').innerText()).trim()
    expect(word.length).toBeGreaterThan(2)
    const box = await kai.page.getByTestId('sketch-canvas').boundingBox()
    await kai.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3)
    await kai.page.mouse.down()
    for (let i = 1; i <= 8; i++) {
      await kai.page.mouse.move(box.x + box.width * (0.2 + i * 0.07), box.y + box.height * (0.3 + i * 0.04))
      await kai.page.waitForTimeout(30)
    }
    await kai.page.mouse.up()
    await expect(gus.page.getByTestId('sketch-canvas').locator('polyline').first()).toBeVisible()
  })

  await test.step('no heart while still guessing; Gus guesses it and hearts it during the drawing', async () => {
    await expect(heartButton(gus.page)).toHaveCount(0)
    await expect(gus.page.getByTestId('sketch-heart')).toHaveCount(0)
    await guess(gus.page, word)
    await expect(heartButton(gus.page)).toBeVisible()
    await heartButton(gus.page).click()
    await expect(heartButton(gus.page)).toHaveAttribute('aria-pressed', 'true')
    await expect(heartButton(gus.page)).toHaveAccessibleName('Love this drawing, 1 heart')
    // A second tap takes it back, a third gives it again.
    await heartButton(gus.page).click()
    await expect(heartButton(gus.page)).toHaveAttribute('aria-pressed', 'false')
    await heartButton(gus.page).click()
    await expect(heartButton(gus.page)).toHaveAttribute('aria-pressed', 'true')
  })

  await test.step('the artist sees the count with no button; Ivy, still guessing, sees no heart', async () => {
    await expect(kai.page.getByTestId('sketch-heart')).toContainText('1')
    await expect(heartButton(kai.page)).toHaveCount(0)
    await expect(ivy.page.getByTestId('sketch-heart')).toHaveCount(0)
  })

  let scoresAtReveal = null
  await test.step('Ivy guesses it, the reveal opens and she hearts it too', async () => {
    await guess(ivy.page, word)
    await expect(stage(ivy.page, 'reveal')).toBeVisible()
    await expect(stage(kai.page, 'reveal')).toBeVisible()
    // Hearts are open the whole reveal, also while the replay runs over the drawing.
    await heartButton(ivy.page).click()
    await expect(heartButton(ivy.page)).toHaveAccessibleName('Love this drawing, 2 hearts')
    await expect(kai.page.getByTestId('sketch-heart')).toContainText('2')
    await expect(heartButton(kai.page)).toHaveCount(0)
    scoresAtReveal = await readRoom(gameId, 'scores')
  })

  await test.step('the match ends with Kai\'s drawing as CROWD FAVOURITE on every screen', async () => {
    for (const p of [ivy, gus, kai]) {
      const award = p.page.getByTestId('sketch-crowd-favourite')
      await expect(award).toBeVisible({ timeout: 20_000 })
      await expect(award).toContainText('CROWD FAVOURITE')
      await expect(award).toContainText(`${word.toUpperCase()} · BY KAI`)
      await expect(award).toContainText('♥ 2 OF 2')
      await expect(award.getByRole('img', { name: new RegExp(`drawn by Kai`) })).toBeVisible()
    }
    // The award sits above the podium.
    const awardFirst = await ivy.page.evaluate(() => {
      const award = document.querySelector('[data-testid="sketch-crowd-favourite"]')
      const podium = document.querySelector('[data-testid="sketch-podium"]')
      return !!(award.compareDocumentPosition(podium) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(awardFirst).toBe(true)
    // The last drawing's hearts were folded into the tally; the scores never moved.
    expect(await readRoom(gameId, 'round/faves')).toEqual({ [`2:${kaiUid}`]: 2 })
    expect(await readRoom(gameId, 'round/likes')).toBeNull()
    expect(await readRoom(gameId, 'scores')).toEqual(scoresAtReveal)
  })

  expectNoPageErrors(ivy, gus, kai)
  await ivy.context.close()
  await gus.context.close()
  await kai.context.close()
})
