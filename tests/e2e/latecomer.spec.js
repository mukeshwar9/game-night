// Party latecomers (report Top-10 #3 / 4.1 #7): a player who opens the invite
// while a round is running watches it, and is seated automatically the next
// time the room is back in its lobby — no reload, no extra tap.
import { test, expect } from '@playwright/test'
import { completeOnboarding, createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test('a 4th player who arrives mid-round is seated at the next lobby', async ({ browser }) => {
  const host = await newPlayer(browser)
  const guests = [await newPlayer(browser), await newPlayer(browser)]
  const late = await newPlayer(browser)
  const seated = [host, ...guests]

  await test.step('three players start a Herd Mind round', async () => {
    await onboard(host.page, 'Hana')
    await createRoom(host.page, 'HERD MIND')
    await joinViaInvite(guests[0].page, host.page.url(), 'Gus')
    await joinViaInvite(guests[1].page, host.page.url(), 'Gia')
    await expect(host.page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    await host.page.getByRole('button', { name: 'START ROUND' }).click()
    for (const { page } of seated) await expect(page.getByPlaceholder('YOUR ANSWER')).toBeVisible()
  })

  await test.step('the latecomer is told they join next round, then watches', async () => {
    await late.page.goto(host.page.url())
    await expect(late.page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeVisible()
    await expect(late.page.getByText(/YOU'LL JOIN NEXT ROUND/)).toBeVisible()
    await completeOnboarding(late.page, 'Lou', 'JOIN GAME')
    await expect(late.page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeHidden()
    await expect(late.page.getByPlaceholder('YOUR ANSWER')).toHaveCount(0)
    await expect(host.page.getByText('1 WATCHING')).toBeVisible()
  })

  await test.step('the host takes the room back to a lobby (switch game)', async () => {
    await host.page.getByRole('button', { name: 'Switch game' }).click()
    const sheet = host.page.getByRole('dialog', { name: 'Play another game' })
    await sheet.getByRole('button', { name: /^WAVELENGTH\b/ }).first().click()
  })

  await test.step('everyone, the latecomer included, is in the new lobby', async () => {
    for (const { page } of [...seated, late]) {
      await expect(page.getByText(/^PLAYERS \(4\)/)).toBeVisible()
    }
    await expect(late.page.getByText(/^Lou \(YOU\)$/i)).toBeVisible()
  })

  expectNoPageErrors(...seated, late)
  for (const { context } of [...seated, late]) await context.close()
})
