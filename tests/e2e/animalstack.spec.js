// Animal Stack online: three players fill a room, the host starts, and one
// drop is replayed on every client — all three see the same tower and the
// turn pass on. The second seat then idles, its own 15 s timer auto-drops,
// and every client again agrees on the tower.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const towerLabel = (page) => page.getByRole('img', { name: /^Tower [\d.]+ metres, \d+ animals$/ })

async function towerOf(page) {
  return towerLabel(page).getAttribute('aria-label')
}

test('three players stack one tower in sync', async ({ browser }) => {
  test.setTimeout(120_000)
  const host = await newPlayer(browser)
  const guests = [await newPlayer(browser), await newPlayer(browser)]
  const everyone = [host, ...guests]

  await test.step('host creates the room, two guests join', async () => {
    await onboard(host.page, 'Hana')
    await createRoom(host.page, 'ANIMAL STACK')
    await expect(host.page.getByText('NEED 2+ PLAYERS — SHARE THE ROOM CODE')).toBeVisible()
    await joinViaInvite(guests[0].page, host.page.url(), 'Gus')
    await joinViaInvite(guests[1].page, host.page.url(), 'Gia')
    for (const { page } of everyone) await expect(page.getByText('SEATS (3/4)')).toBeVisible()
    for (const { page } of guests) await expect(page.getByRole('button', { name: /^START/ })).toHaveCount(0)
  })

  await test.step('host starts; only the host may drop', async () => {
    await host.page.getByRole('button', { name: 'START · 3 PLAYERS' }).click()
    for (const { page } of everyone) await expect(towerLabel(page)).toHaveAttribute('aria-label', 'Tower 0.0 metres, 0 animals')
    await expect(host.page.getByRole('button', { name: 'DROP' })).toBeEnabled()
    for (const { page } of guests) await expect(page.getByRole('button', { name: 'DROP' })).toBeDisabled()
  })

  await test.step('host drops; every client replays it to the same tower', async () => {
    await host.page.getByRole('button', { name: 'DROP' }).click()
    for (const { page } of everyone) await expect(towerLabel(page)).toHaveAttribute('aria-label', /, 1 animals$/, { timeout: 15_000 })
    const labels = await Promise.all(everyone.map(({ page }) => towerOf(page)))
    expect(new Set(labels).size).toBe(1)
    await expect(guests[0].page.getByRole('button', { name: 'DROP' })).toBeEnabled()
    await expect(host.page.getByRole('button', { name: 'DROP' })).toBeDisabled()
  })

  await test.step('the second seat idles; its timer auto-drops and every client agrees', async () => {
    // The auto-drop lands at centre: the tower either grows to 2 animals or
    // topples (TOPPLED BY …) — either way all three clients must agree.
    await expect(
      towerLabel(host.page).and(host.page.getByRole('img', { name: /, 2 animals$/ }))
        .or(host.page.getByText(/TOPPLED BY/)),
    ).toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => new Set(await Promise.all(everyone.map(({ page }) => towerOf(page)))).size, { timeout: 10_000 }).toBe(1)
  })

  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})
