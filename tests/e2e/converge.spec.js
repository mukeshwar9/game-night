// CONVERGE (co-op): both lock a word at once, the partner's word stays
// hidden until both are in, and matching words end the chain with stars.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const lockIn = async (page, word) => {
  await page.getByRole('textbox', { name: 'Your word' }).fill(word)
  await page.getByRole('button', { name: 'LOCK', exact: true }).click()
}

test('two players converge on a word', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('P1 creates a room and P2 joins', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'CONVERGE')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const { page } of [alice, bob]) {
      await expect(page.getByText('YOUR WORD', { exact: true })).toBeVisible()
      await expect(page.getByText('Step 1: type any word at all.')).toBeVisible()
    }
  })

  await test.step('a locked word stays hidden and can be changed', async () => {
    await lockIn(alice.page, 'planet')
    await expect(bob.page.getByText('ALICE: LOCKED')).toBeVisible()
    await expect(bob.page.getByText('PLANET')).toHaveCount(0)
    await alice.page.getByRole('button', { name: 'CHANGE' }).click()
    await expect(bob.page.getByText('ALICE: THINKING…')).toBeVisible()
    await lockIn(alice.page, 'pizza')
  })

  await test.step('both words are revealed together', async () => {
    await lockIn(bob.page, 'moon')
    for (const { page } of [alice, bob]) {
      await expect(page.getByText('PIZZA', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('MOON', { exact: true }).first()).toBeVisible()
      await expect(page.getByText(/^Bridge/)).toBeVisible()
    }
  })

  await test.step('a repeated word is refused', async () => {
    await alice.page.getByRole('textbox', { name: 'Your word' }).fill('moons')
    await alice.page.getByRole('button', { name: 'LOCK', exact: true }).click()
    await expect(alice.page.getByText('ALREADY SAID THIS CHAIN')).toBeVisible()
  })

  await test.step('the same word converges the chain', async () => {
    await lockIn(alice.page, 'cheese')
    await lockIn(bob.page, 'cheeses')
    for (const { page } of [alice, bob]) {
      await expect(page.getByText('CONVERGED!')).toBeVisible()
      await expect(page.getByText('Same word in 2 steps.')).toBeVisible()
      await expect(page.getByText('STARS 3/15')).toBeVisible()
    }
  })

  await test.step('the match ends after five chains and PLAY AGAIN keeps the best', async () => {
    for (const [c, word] of [[2, 'sun'], [3, 'tea'], [4, 'cat'], [5, 'dog']]) {
      await alice.page.getByRole('button', { name: `START CHAIN ${c}` }).click()
      await expect(bob.page.getByRole('textbox', { name: 'Your word' })).toBeEnabled()
      await lockIn(alice.page, word)
      await lockIn(bob.page, word)
    }
    for (const { page } of [alice, bob]) {
      await expect(page.getByText('MATCH OVER')).toBeVisible()
      await expect(page.getByText('15 / 15 ★')).toBeVisible()
    }
    await alice.page.getByRole('button', { name: 'PLAY AGAIN' }).click()
    await bob.page.getByRole('button', { name: 'ACCEPT' }).click()
    for (const { page } of [alice, bob]) {
      await expect(page.getByText('Step 1: type any word at all.')).toBeVisible()
      await expect(page.getByText('STARS 0/15 · BEST 15')).toBeVisible()
    }
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
