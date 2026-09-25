// Party smoke test: three distinct anonymous players fill a Herd Mind room
// (minimum 3), the host starts the round, and everyone sees the phase change.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test('three players join a Herd Mind room and the host starts a round', async ({ browser }) => {
  const host = await newPlayer(browser)
  const guests = [await newPlayer(browser), await newPlayer(browser)]
  const everyone = [host, ...guests]

  await test.step('host onboards and creates the room', async () => {
    await onboard(host.page, 'Hana')
    await createRoom(host.page, 'HERD MIND')
    await expect(host.page.getByText(/^PLAYERS \(1\)/)).toBeVisible()
    await expect(host.page.getByText(/NEED 3\+ PLAYERS/)).toBeVisible()
  })

  await test.step('two guests join through the invite link', async () => {
    await joinViaInvite(guests[0].page, host.page.url(), 'Gus')
    await joinViaInvite(guests[1].page, host.page.url(), 'Gia')
  })

  await test.step('everyone sees the full lobby', async () => {
    for (const { page } of everyone) {
      await expect(page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
      for (const name of ['Hana', 'Gus', 'Gia']) {
        await expect(page.getByText(new RegExp(`^${name}( \\(YOU\\))?$`))).toBeVisible()
      }
    }
    for (const { page } of guests) {
      await expect(page.getByRole('button', { name: 'START ROUND' })).toHaveCount(0)
    }
  })

  await test.step('host starts and every player reaches the answer phase', async () => {
    await host.page.getByRole('button', { name: 'START ROUND' }).click()
    for (const { page } of everyone) {
      await expect(page.getByText('NAME IT LIKE THE HERD')).toBeVisible()
      await expect(page.getByPlaceholder('YOUR ANSWER')).toBeVisible()
    }
  })

  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})
