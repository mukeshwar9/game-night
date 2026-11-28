// One-phone night (/night): a single browser plays a whole night. The games are
// the same pass-and-play pages /local/:type renders, which report no result, so
// the group taps who won between games; this checks the setup, the standings
// strip, the progress track, a reload mid-night and the champion.
import { test, expect } from '@playwright/test'
import { newPlayer, onboard, expectNoPageErrors } from './helpers.js'

test('deal a 5-game night for two, score it between games and crown a champion', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await onboard(page, 'Night Host')

  // The Home row is the door to the night.
  await page.getByRole('link', { name: /PLAY A NIGHT/ }).click()
  await expect(page).toHaveURL(/\/night$/)
  await expect(page.getByTestId('night-setup')).toBeVisible()
  await expect(page.getByLabel('Dealt games').getByRole('listitem')).toHaveCount(5)

  // Three players can only be dealt games that seat three.
  await page.getByRole('button', { name: '10', exact: true }).click()
  await page.getByRole('button', { name: '3', exact: true }).first().click()
  await expect(page.getByLabel('Player 3 name')).toBeVisible()
  await expect(page.getByRole('button', { name: '10', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '7', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Dealt games').getByRole('listitem')).toHaveCount(7)
  await page.getByRole('button', { name: '5', exact: true }).click()
  await page.getByRole('button', { name: '2', exact: true }).first().click()
  await page.getByLabel('Player 1 name').fill('Ana')
  await page.getByLabel('Player 2 name').fill('Ben')
  await page.getByTestId('night-start').click()

  await expect(page.getByTestId('night-intro')).toBeVisible()
  await expect(page.getByTestId('night-progress')).toContainText('GAME 1 OF 5')
  const strip = page.getByTestId('night-strip')
  await expect(strip).toContainText('Ana')
  await expect(strip).toContainText('Ben')

  // Ana, Ben, a draw, Ana, Ana  ->  Ana 3+0+1+3+3 = 10, Ben 0+3+1+0+0 = 4.
  const picks = ['p1', 'p2', 'draw', 'p1', 'p1']
  for (let i = 0; i < picks.length; i++) {
    await page.getByTestId('night-play').click()
    await page.getByTestId('night-finished').click()
    await expect(page.getByTestId('night-judging')).toBeVisible()
    if (i === 2) {
      // A reload while judging keeps the night.
      await page.reload()
      await expect(page.getByTestId('night-judging')).toBeVisible()
    }
    await page.getByTestId(picks[i] === 'draw' ? 'night-winner-draw' : `night-winner-${picks[i]}`).click()
    if (i < picks.length - 1) {
      await expect(page.getByTestId('night-progress')).toContainText(`GAME ${i + 2} OF 5`)
    }
    if (i === 0) await expect(page.getByTestId('night-strip-p1')).toContainText('3')
  }

  await expect(page.getByTestId('night-finale')).toBeVisible()
  await expect(page.getByTestId('night-champion')).toHaveText('Ana')
  await expect(page.getByTestId('night-strip-p1')).toContainText('10')
  await expect(page.getByTestId('night-strip-p2')).toContainText('4')

  // The last game's result can still be taken back from the finale.
  await page.getByTestId('night-last').getByRole('button', { name: 'UNDO' }).click()
  await expect(page.getByTestId('night-judging')).toBeVisible()
  await expect(page.getByTestId('night-strip-p1')).toContainText('7')
  await page.getByTestId('night-winner-p1').click()
  await expect(page.getByTestId('night-champion')).toHaveText('Ana')

  await page.getByTestId('night-again').click()
  await expect(page.getByTestId('night-setup')).toBeVisible()
  expectNoPageErrors(player)
  await player.context.close()
})

test('an undone result puts the game back up for judging', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await onboard(page, 'Night Host')
  await page.goto('/night')
  await page.getByTestId('night-start').click()
  await page.getByTestId('night-play').click()
  await page.getByTestId('night-finished').click()
  await page.getByTestId('night-winner-p2').click()
  await expect(page.getByTestId('night-last')).toContainText('won +3')
  await page.getByTestId('night-last').getByRole('button', { name: 'UNDO' }).click()
  await expect(page.getByTestId('night-judging')).toBeVisible()
  await expect(page.getByTestId('night-strip-p2')).toContainText('0')
  expectNoPageErrors(player)
  await player.context.close()
})
