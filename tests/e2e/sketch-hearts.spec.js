// SKETCH hearts and the CROWD FAVOURITE (S5), three real players: a guesser
// who got it hearts the drawing while it is still being drawn, the other
// hearts it at the reveal, every screen shows the count, the artist cannot
// heart their own drawing, and the match ends with the drawing as CROWD
// FAVOURITE above the podium. Hearts never change the scores.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard, uidOf } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'ns=demo-game-night-default-rtdb'
const stage = (page, phase) => page.locator(`[data-testid="sketch-stage"][data-phase="${phase}"]`)
const rest = (path, init = {}) => fetch(`${DB_ORIGIN}/games/${path}.json?${NS}`, { ...init, headers: { Authorization: 'Bearer owner' } })

async function guess(page, text) {
  await page.getByRole('textbox', { name: 'Your guess' }).fill(text)
  await page.getByRole('button', { name: 'GO', exact: true }).click()
}

test('two guessers heart a drawing and it ends the match as CROWD FAVOURITE', async ({ browser }) => {
  test.setTimeout(120_000)
  const ivy = await newPlayer(browser)
  const gus = await newPlayer(browser)
  const cy = await newPlayer(browser)
  let gameId = ''
  let word = ''

  await test.step('three players start; the artist picks a word and draws', async () => {
    await onboard(ivy.page, 'Ivy')
    await createRoom(ivy.page, 'SKETCH')
    gameId = ivy.page.url().split('/').pop()
    await joinViaInvite(gus.page, ivy.page.url(), 'Gus')
    await joinViaInvite(cy.page, ivy.page.url(), 'Cy')
    await expect(ivy.page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    await ivy.page.getByRole('button', { name: 'START ROUND' }).click()
    const option = ivy.page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first()
    await expect(option).toBeVisible()
    // Test data only: make this the match's last drawing (cycle 2, Ivy last
    // in the order), so its reveal ends the match.
    const [ivyUid, gusUid, cyUid] = [await uidOf(ivy.page), await uidOf(gus.page), await uidOf(cy.page)]
    const res = await rest(`${gameId}/round`, { method: 'PATCH', body: JSON.stringify({ cycle: 2, order: [gusUid, cyUid, ivyUid] }) })
    expect(res.ok).toBe(true)
    await expect(ivy.page.getByText('CYCLE 2/2')).toBeVisible()
    await option.click()
    await expect(stage(ivy.page, 'drawing')).toBeVisible()
    word = (await ivy.page.getByTestId('sketch-word').innerText()).trim()
    const box = await ivy.page.getByTestId('sketch-canvas').boundingBox()
    await ivy.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5)
    await ivy.page.mouse.down()
    await ivy.page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 10 })
    await ivy.page.mouse.up()
  })

  await test.step('still guessing: no heart; the artist sees only a count', async () => {
    await expect(gus.page.getByTestId('sketch-heart')).toHaveCount(0)
    await expect(ivy.page.getByTestId('sketch-heart')).toHaveAttribute('data-count', '0')
    await expect(ivy.page.getByRole('button', { name: /Love this drawing/ })).toHaveCount(0)
  })

  await test.step('a guesser who got it can heart it while it is still being drawn', async () => {
    await guess(gus.page, word)
    const heart = gus.page.getByRole('button', { name: /Love this drawing/ })
    await expect(heart).toBeVisible()
    await heart.click()
    await expect(gus.page.getByTestId('sketch-heart')).toHaveAttribute('data-mine', '1')
    await expect(ivy.page.getByTestId('sketch-heart')).toHaveAttribute('data-count', '1')
    // Cy is still guessing and sees no heart at all.
    await expect(cy.page.getByTestId('sketch-heart')).toHaveCount(0)
  })

  await test.step('at the reveal everyone seated may heart it; the count is live on every screen', async () => {
    await guess(cy.page, word)
    await expect(stage(cy.page, 'reveal')).toBeVisible()
    await cy.page.getByRole('button', { name: /Love this drawing/ }).click()
    for (const p of [ivy, gus, cy]) await expect(p.page.getByTestId('sketch-heart')).toHaveAttribute('data-count', '2')
    await expect(ivy.page.getByRole('button', { name: /Love this drawing/ })).toHaveCount(0)
  })

  await test.step('the match ends with the drawing as CROWD FAVOURITE; hearts did not change the points', async () => {
    for (const p of [ivy, gus, cy]) {
      const award = p.page.getByTestId('sketch-crowd-favourite')
      await expect(award).toBeVisible({ timeout: 20_000 })
      await expect(award).toContainText('CROWD FAVOURITE')
      await expect(award).toContainText('BY IVY')
      await expect(award).toContainText('♥ 2')
    }
    await expect(ivy.page.getByTestId('sketch-crowd-favourite')).toContainText(word.toUpperCase())
    const scores = await (await rest(`${gameId}/scores`)).json()
    // 3+ players: 100 and 90 for the guessers, 25 per solve for the artist, times the tier.
    const total = Object.values(scores).reduce((a, b) => a + b, 0)
    expect([240, 288, 360]).toContain(total)
  })

  expectNoPageErrors(ivy, gus, cy)
  for (const p of [ivy, gus, cy]) await p.context.close()
})
