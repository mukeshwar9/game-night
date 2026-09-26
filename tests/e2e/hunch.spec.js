// HUNCH (co-op, silent): two players clear level 1 by playing in rising
// order, then lose a life by playing out of order on level 2. Typed chat is
// hidden for the whole game (registry `quiet`).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const playButton = (page) => page.getByRole('button', { name: /^PLAY \d+$/ })
const cardOf = async (page) => Number((await playButton(page).textContent()).replace(/\D/g, ''))

test('two players clear a HUNCH level and feel a mistake', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('P1 creates a room and P2 joins', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'HUNCH')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const { page } of [alice, bob]) {
      await expect(page.getByText('NO TALKING', { exact: true })).toBeVisible()
      await expect(playButton(page)).toBeVisible()
    }
  })

  await test.step('typed chat and quick phrases are hidden; emotes stay', async () => {
    await expect(alice.page.getByRole('button', { name: /^Send .+ reaction$/ }).first()).toBeVisible()
    await expect(alice.page.getByRole('textbox', { name: 'Chat message' })).toHaveCount(0)
    await expect(alice.page.getByRole('button', { name: 'Send GG' })).toHaveCount(0)
  })

  await test.step('level 1: lower card first clears the level', async () => {
    const a = await cardOf(alice.page)
    const b = await cardOf(bob.page)
    const [first, second] = a < b ? [alice, bob] : [bob, alice]
    await playButton(first.page).click()
    await expect(second.page.getByText(String(Math.min(a, b)), { exact: true }).first()).toBeVisible()
    await playButton(second.page).click()
    for (const { page } of [alice, bob]) {
      await expect(page.getByText('LEVEL 1 CLEAR').first()).toBeVisible()
      await expect(page.getByText(/TEAM ★ 1/)).toBeVisible()
    }
  })

  await test.step('level 2: playing over a lower card costs a life', async () => {
    await bob.page.getByRole('button', { name: 'DEAL LEVEL 2' }).click()
    await expect(playButton(alice.page)).toBeVisible()
    await expect(playButton(bob.page)).toBeVisible()
    const a = await cardOf(alice.page)
    const b = await cardOf(bob.page)
    const hasHigher = a > b ? alice : bob
    await playButton(hasHigher.page).click()
    for (const { page } of [alice, bob]) {
      await expect(page.getByText(/^TOO SOON/)).toBeVisible()
      await expect(page.getByLabel('2 lives')).toBeVisible()
    }
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
