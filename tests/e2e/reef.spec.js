// REEF RUN smoke: two players ready up and both reach the live race canvas.
// The full 3-minute round is too long for CI, so this only covers the
// lobby -> live transition and that the canvas renders for both racers.
import { test, expect } from '@playwright/test'
import { createRoom, joinViaInvite, newPlayer, onboard } from './helpers.js'

test.describe.configure({ timeout: 120_000 })

test('two players ready up and both see the live REEF RUN canvas', async ({ browser }) => {
  const host = await newPlayer(browser)
  const guest = await newPlayer(browser)

  await test.step('host creates a REEF RUN room; the guest joins', async () => {
    await onboard(host.page, 'Hana')
    await createRoom(host.page, 'REEF RUN')
    await expect(host.page.getByText(/^PLAYERS \(1\)/)).toBeVisible()
    await joinViaInvite(guest.page, host.page.url(), 'Gus')
    for (const { page } of [host, guest]) {
      await expect(page.getByText(/^PLAYERS \(2\)/)).toBeVisible()
    }
  })

  await test.step('both ready up and the race goes live', async () => {
    for (const { page } of [host, guest]) {
      await page.getByRole('button', { name: 'READY', exact: true }).click()
    }
    for (const { page } of [host, guest]) {
      await expect(page.getByText('LIVE', { exact: true })).toBeVisible({ timeout: 30_000 })
      const canvas = page.getByTestId('reef-canvas')
      await expect(canvas).toBeVisible()
      const box = await canvas.boundingBox()
      expect(box.width).toBeGreaterThan(100)
      expect(box.height).toBeGreaterThan(80)
    }
  })
})
