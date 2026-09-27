// Archery uses one transactional integer shot record per arrow. Three arrows
// keep the archer's turn; after the end, the next seat can shoot.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

async function shootThree(page) {
  const loose = page.getByRole('button', { name: 'LOOSE ARROW' })
  for (let i = 0; i < 3; i++) {
    await expect(loose).toBeEnabled()
    await loose.click()
    if (i < 2) await expect(page.getByText(new RegExp(`YOUR END · ARROW ${i + 2} / 3`))).toBeVisible()
  }
}

test('online archery gives three arrows per end and rotates seats', async ({ browser }) => {
  test.setTimeout(120_000)
  const host = await newPlayer(browser)
  const guest = await newPlayer(browser)
  await onboard(host.page, 'Ari')
  await createRoom(host.page, 'ARCHERY')
  await joinViaInvite(guest.page, host.page.url(), 'Bea')

  await expect(host.page.getByText('RANGE FORMAT · HOST PICKS')).toBeVisible()
  await host.page.getByRole('button', { name: /STANDARD/ }).click()
  await host.page.getByRole('button', { name: 'ARI', exact: true }).click()
  await host.page.getByRole('button', { name: 'START GAME' }).click()
  await expect(host.page.getByRole('img', { name: /Neon archery range/ })).toBeVisible()
  await expect(host.page.getByRole('button', { name: 'LOOSE ARROW' })).toBeEnabled()
  await expect(guest.page.getByRole('button', { name: 'LOOSE ARROW' })).toBeDisabled()

  await shootThree(host.page)
  await expect(guest.page.getByRole('button', { name: 'LOOSE ARROW' })).toBeEnabled()
  await expect(host.page.getByText('BEA SHOOTS…')).toBeVisible()

  expectNoPageErrors(host, guest)
  await host.context.close()
  await guest.context.close()
})

test('archery4 host starts a 2–4 seat range and turn advances after three arrows', async ({ browser }) => {
  test.setTimeout(120_000)
  const host = await newPlayer(browser)
  const guests = [await newPlayer(browser), await newPlayer(browser), await newPlayer(browser)]
  const everyone = [host, ...guests]
  await onboard(host.page, 'Ari')
  await createRoom(host.page, 'ARCHERY RANGE 4P')
  for (const [i, guest] of guests.entries()) {
    await joinViaInvite(guest.page, host.page.url(), ['Bea', 'Cal', 'Dee'][i])
  }

  await expect(host.page.getByText('ARCHERS (4/4)')).toBeVisible()
  await host.page.getByRole('button', { name: 'START · 4 ARCHERS' }).click()
  await expect(host.page.getByRole('button', { name: 'LOOSE ARROW' })).toBeEnabled()
  for (const { page } of guests) await expect(page.getByRole('button', { name: 'LOOSE ARROW' })).toBeDisabled()

  await shootThree(host.page)
  await expect(guests[0].page.getByRole('button', { name: 'LOOSE ARROW' })).toBeEnabled()
  for (const { page } of everyone) await expect(page.getByText(/Bea SHOOTS…|YOUR END · ARROW 1/)).toBeVisible()
  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})

test('same-device archers get a hidden hand-off after each three-arrow end', async ({ browser }) => {
  const player = await newPlayer(browser)
  await onboard(player.page, 'Local')
  await player.page.goto('/local/archery')
  await player.page.getByRole('button', { name: 'START RANGE' }).click()
  const loose = player.page.getByRole('button', { name: 'LOOSE ARROW' })
  for (let i = 0; i < 3; i++) {
    await expect(loose).toBeEnabled()
    await loose.click()
  }
  await expect(player.page.getByRole('dialog', { name: 'Hand off to next archer' })).toBeVisible()
  await player.page.getByRole('button', { name: 'I\'M READY' }).click()
  await expect(loose).toBeEnabled()
  expectNoPageErrors(player)
  await player.context.close()
})

test('CPU archer completes its three-arrow end before returning the range', async ({ browser }) => {
  const player = await newPlayer(browser)
  await onboard(player.page, 'Solo')
  await player.page.goto('/solo/archery')
  await player.page.getByRole('button', { name: /ROOKIE/ }).click()
  await shootThree(player.page)
  await expect(player.page.getByText('CPU AIMS…')).toBeVisible()
  await expect(player.page.getByRole('button', { name: 'LOOSE ARROW' })).toBeEnabled({ timeout: 12_000 })
  expectNoPageErrors(player)
  await player.context.close()
})

test('Score Attack completes a solo WA range and shows its best/rank', async ({ browser }) => {
  const player = await newPlayer(browser)
  await onboard(player.page, 'Solo')
  await player.page.goto('/solo/archery')
  await player.page.getByRole('button', { name: /SCORE ATTACK/ }).click()
  const loose = player.page.getByRole('button', { name: 'LOOSE ARROW' })
  for (let i = 0; i < 12; i++) {
    await expect(loose).toBeEnabled()
    await loose.click()
  }
  await expect(player.page.getByText('RANGE CLEAR').last()).toBeVisible()
  await expect(player.page.getByText(/ROOKIE|CLUB|PRO|ROBIN HOOD/)).toBeVisible()
  expectNoPageErrors(player)
  await player.context.close()
})
