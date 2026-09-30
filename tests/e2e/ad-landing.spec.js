// Ad landing: /play/<game> drops a stranger straight into a headline game
// against the CPU (no name, no onboarding), keeps the UTM tags for the funnel,
// and shows the curated strip instead of the full picker. A first-time visitor
// on Home gets the same strip.
import { test, expect } from '@playwright/test'
import { newPlayer, onboard, expectNoPageErrors } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'demo-game-night-default-rtdb'
const OWNER = { Authorization: 'Bearer owner' }
const today = () => new Date().toISOString().slice(0, 10)
const readDb = async (path) => (await fetch(`${DB_ORIGIN}/${path}.json?ns=${NS}`, { headers: OWNER })).json()

test('/play/<game> lands in the game with the headline strip and is attributed', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await page.goto('/play/battleship?utm_source=TikTok&utm_medium=paid&utm_campaign=e2eplay')
  await expect(page).toHaveURL(/\/solo\/battleship\?utm_source=TikTok&utm_medium=paid&utm_campaign=e2eplay$/)
  await expect(page.getByRole('heading', { name: 'PLAY SOLO' })).toBeVisible()
  // No onboarding gate on the way in.
  await expect(page.getByRole('heading', { name: 'WHAT SHOULD WE CALL YOU?' })).toHaveCount(0)

  const strip = page.getByRole('region', { name: 'Quick games' })
  await expect(strip.getByRole('link')).toHaveCount(6)
  await expect(strip.getByRole('link', { name: /CONNECT FOUR/ })).toHaveAttribute('href', '/solo/connectfour')
  await expect(page.getByRole('link', { name: 'PLAY WITH A FRIEND' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Row 1/ })).toHaveCount(0) // not the full picker

  const base = `funnelDaily/${today()}/tiktok/e2eplay`
  await expect.poll(() => readDb(`${base}/landed`)).toBe(1)
  await expect.poll(() => readDb(`${base}/started`)).toBe(1)

  await strip.getByRole('link', { name: /CONNECT FOUR/ }).click()
  await expect(page).toHaveURL(/\/solo\/connectfour$/)
  expectNoPageErrors(player)
  await player.context.close()
})

test('an unknown /play game falls back to the default headline game', async ({ browser }) => {
  const player = await newPlayer(browser)
  await player.page.goto('/play/not-a-game')
  await expect(player.page).toHaveURL(/\/solo\/connectfour$/)
  await expect(player.page.getByRole('heading', { name: 'PLAY SOLO' })).toBeVisible()
  await player.context.close()
})

test('a plain solo link keeps the full picker', async ({ browser }) => {
  const player = await newPlayer(browser)
  await player.page.goto('/solo/connectfour')
  await expect(player.page.getByText('MORE SOLO GAMES')).toBeVisible()
  await expect(player.page.getByRole('region', { name: 'Quick games' })).toHaveCount(0)
  await player.context.close()
})

test('a first-time visitor sees the headline games on Home', async ({ browser }) => {
  const player = await newPlayer(browser)
  await onboard(player.page, 'Newbie')
  const strip = player.page.getByRole('region', { name: 'Quick games' })
  await expect(strip.getByRole('link')).toHaveCount(6)
  await strip.getByRole('link', { name: /DOTS & BOXES/ }).click()
  await expect(player.page).toHaveURL(/\/solo\/dotsandboxes$/)
  await expect(player.page.getByRole('heading', { name: 'PLAY SOLO' })).toBeVisible()
  await player.page.goto('/')
  // Having played something, the strip gives way to JUMP BACK IN.
  await expect(player.page.getByText('JUMP BACK IN')).toBeVisible()
  await expect(player.page.getByRole('region', { name: 'Quick games' })).toHaveCount(0)
  await player.context.close()
})
