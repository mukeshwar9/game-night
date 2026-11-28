// The shared intro card (components/IntroCard.jsx): one start card with a
// picture, pitch, seats, one big PLAY and the rules behind a "?". Adopted on
// Connect Four's pass-and-play start, Mental Math's solo start and the
// party-game card (Two Truths), all single-player pages.
import { test, expect } from '@playwright/test'
import { newPlayer, expectNoPageErrors } from './helpers.js'

const PHONE = { viewport: { width: 390, height: 664 } }

test('Connect Four pass-and-play opens on the card; ? shows the rules, PLAY starts the board', async ({ browser }) => {
  const player = await newPlayer(browser, PHONE)
  const { page } = player
  await page.goto('/local/connectfour')

  const card = page.getByTestId('intro-card')
  await expect(card.getByRole('heading', { name: 'CONNECT FOUR' })).toBeVisible()
  await expect(card.getByText('Four in a row wins.')).toBeVisible()
  await expect(card.getByText(/2 players · about \d+ min/)).toBeVisible()
  // The board is not mounted until PLAY.
  await expect(page.getByRole('button', { name: /^Drop in column 1/i })).toHaveCount(0)

  // The one PLAY button is inside the viewport on a short phone.
  const play = card.getByRole('button', { name: 'PLAY', exact: true })
  await expect(play).toBeVisible()
  await expect.poll(() => play.evaluate(el => el.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true)

  await card.getByRole('button', { name: 'How to play' }).click()
  const rules = page.getByRole('dialog', { name: /CONNECT FOUR rules/i })
  await expect(rules).toBeVisible()
  await rules.getByRole('button', { name: 'Close' }).click()
  await expect(rules).toHaveCount(0)

  await play.click()
  await expect(page.getByTestId('intro-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'CONNECT FOUR' })).toBeVisible()
  expectNoPageErrors(player)
  await player.context.close()
})

test('the VS AI chip on the Connect Four card goes to the solo page', async ({ browser }) => {
  const player = await newPlayer(browser, PHONE)
  const { page } = player
  await page.goto('/local/connectfour')
  await page.getByTestId('intro-card').getByRole('button', { name: 'VS AI' }).click()
  await expect(page).toHaveURL(/\/solo\/connectfour$/)
  expectNoPageErrors(player)
  await player.context.close()
})

test('Mental Math solo opens on the card with the CPU level, PLAY starts the countdown', async ({ browser }) => {
  const player = await newPlayer(browser, PHONE)
  const { page } = player
  await page.goto('/solo/math')
  const card = page.getByTestId('intro-card')
  await expect(card.getByText('Solve fastest under pressure.')).toBeVisible()
  await expect(card.getByRole('group', { name: 'CPU difficulty' })).toBeVisible()
  await card.getByRole('button', { name: 'PLAY', exact: true }).click()
  await expect(page.getByText('GET READY!')).toBeVisible()
  expectNoPageErrors(player)
  await player.context.close()
})

test('the party-game card (Two Truths) sends PLAY to the room creator', async ({ browser }) => {
  const player = await newPlayer(browser, PHONE)
  const { page } = player
  await page.goto('/solo/twotruths')
  const card = page.getByTestId('intro-card')
  await expect(card.getByText('NEEDS 2+ PLAYERS. NO SOLO BOT FOR THIS ONE.')).toBeVisible()
  await card.getByRole('button', { name: 'CREATE A ROOM' }).click()
  await expect(page).toHaveURL(/\/$/)
  expectNoPageErrors(player)
  await player.context.close()
})
