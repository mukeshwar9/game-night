// Bonk Buggies across two clients: the peer link comes up, both screens draw
// the host's sim, a point scored on one screen is on the other, and the
// player who just lost chooses the next arena for both
// (src/lib/bonkLogic.js, src/pages/BonkBuggiesGame.jsx).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test.describe.configure({ timeout: 180_000 })

const arenaName = async (page) => (await page.getByTestId('bonk-arena-name').textContent()).trim()
const points = async (page, seat) => {
  const label = await page.getByTestId(`bonk-score-${seat}`).getAttribute('aria-label')
  return Number(label.match(/(\d+) of 5 points/)[1])
}
const total = async (page) => (await points(page, 'X')) + (await points(page, 'O'))

test('Bonk Buggies: a point reaches both screens and the loser picks the next arena', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players open a room and the arena goes live', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'BONK BUGGIES')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const p of [alice, bob]) {
      await expect(p.page.getByTestId('bonk-arena')).toBeVisible()
      // The connecting / countdown overlay sits inside the arena until play starts.
      await expect(p.page.getByTestId('bonk-overlay')).toHaveCount(0, { timeout: 30_000 })
      await expect(p.page.getByTestId('bonk-arena-name')).toContainText('ROUND 1')
    }
    expect(await arenaName(bob.page)).toBe(await arenaName(alice.page))
  })

  await test.step('both drive at each other until the round is decided', async () => {
    await alice.page.keyboard.down('KeyD')
    await bob.page.keyboard.down('KeyA')
    // Head-on, then the tide: a round cannot stall for long.
    await expect.poll(async () => total(alice.page), { timeout: 90_000, intervals: [500] }).toBeGreaterThan(0)
    await alice.page.keyboard.up('KeyD')
    await bob.page.keyboard.up('KeyA')
    await expect.poll(async () => total(bob.page), { timeout: 10_000 }).toBeGreaterThan(0)
    expect(await points(bob.page, 'X')).toBe(await points(alice.page, 'X'))
    expect(await points(bob.page, 'O')).toBe(await points(alice.page, 'O'))
  })

  await test.step('the loser picks the next arena for both', async () => {
    for (const p of [alice, bob]) await expect(p.page.getByTestId('bonk-pick')).toBeVisible({ timeout: 15_000 })
    let picked = null
    for (const p of [alice, bob]) {
      const mine = p.page.locator('[data-testid^="bonk-pick-"]:not([disabled])')
      if (await mine.count()) {
        picked = mine.first()
        await picked.click()
        break
      }
    }
    expect(picked).not.toBeNull()
    for (const p of [alice, bob]) await expect(p.page.getByTestId('bonk-arena-name')).toContainText('ROUND 2', { timeout: 15_000 })
    expect(await arenaName(bob.page)).toBe(await arenaName(alice.page))
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
