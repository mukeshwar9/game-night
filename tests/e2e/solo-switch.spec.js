// Solo hub: SWITCH GAME opens the shared "play another game" popup (the
// compact GamePicker on BottomSheet), limited to games with a playable solo
// page, with a name search at the top. Picking a game swaps the board in
// place; the back gesture closes the popup instead of leaving the page.
import { test, expect } from '@playwright/test'
import { newPlayer, expectNoPageErrors } from './helpers.js'

const openPicker = async (page) => {
  await page.getByRole('button', { name: 'SWITCH GAME' }).click()
  const sheet = page.getByRole('dialog', { name: 'Play another game' })
  await expect(sheet).toBeVisible()
  return sheet
}

test('search filters the solo picker and a pick switches the game', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await page.goto('/solo/tictactoe')
  await expect(page.getByRole('heading', { name: 'PLAY SOLO' })).toBeVisible()

  const sheet = await openPicker(page)
  const search = sheet.getByRole('textbox', { name: 'Search games' })
  // Desktop (fine pointer): the search is focused on open.
  await expect(search).toBeFocused()

  await search.fill('connect')
  await expect(sheet.getByRole('button', { name: /^CONNECT FOUR\b/ })).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^REVERSI\b/ })).toHaveCount(0)

  // Party games with no bot (Two Truths) and games with no solo page
  // (Chameleon) are not offered.
  await search.fill('two truths')
  await expect(sheet.getByText(/NO GAMES MATCH/)).toBeVisible()
  await search.fill('chameleon')
  await expect(sheet.getByText(/NO GAMES MATCH/)).toBeVisible()

  await search.fill('reversi')
  await sheet.getByRole('button', { name: /^REVERSI\b/ }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('REVERSI', { exact: true })).toBeVisible()
  expectNoPageErrors(player)
  await player.context.close()
})

test('back closes the solo picker without leaving the page', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await page.goto('/solo/connectfour')
  const sheet = await openPicker(page)
  await page.goBack()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/\/solo\/connectfour$/)
  await expect(page.getByRole('heading', { name: 'PLAY SOLO' })).toBeVisible()
  await player.context.close()
})
