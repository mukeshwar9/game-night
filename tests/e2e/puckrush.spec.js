// Puck Rush across two clients: the peer link comes up, the host's sim is the
// one both screens draw, and a fling by either player moves a puck to the
// other half on both screens (src/lib/puckrushLogic.js, src/pages/PuckRushGame.jsx).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const table = (page) => page.getByTestId('puckrush-table')
const left = async (page, side) => Number((await page.getByTestId(`puckrush-left-${side}`).getAttribute('aria-label')).match(/(\d+) pucks left/)[1])

// Pull the middle puck of the near row straight back and let go: it starts in
// line with the gap, so it flies through. Each seat sees its own half nearest.
async function slingMiddlePuck(page) {
  const box = await table(page).boundingBox()
  const x = box.x + box.width * 0.5
  const y = box.y + box.height * (1 - 0.19 / 1.3)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + box.height * 0.07, { steps: 6 })
  await page.mouse.up()
}

test('Puck Rush: a fling reaches both screens', async ({ browser }) => {
  test.setTimeout(120_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players open a Puck Rush room and the table goes live', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'PUCK RUSH')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const p of [alice, bob]) {
      await expect(table(p.page)).toBeVisible()
      // The connecting / countdown overlay sits inside the table until play starts.
      await expect(p.page.getByTestId('puckrush-overlay')).toHaveCount(0, { timeout: 30_000 })
      expect(await left(p.page, 'X')).toBe(5)
      expect(await left(p.page, 'O')).toBe(5)
    }
  })

  await test.step('the host slings a puck through the gap', async () => {
    await slingMiddlePuck(alice.page)
    for (const p of [alice, bob]) {
      await expect.poll(() => left(p.page, 'X')).toBe(4)
      await expect.poll(() => left(p.page, 'O')).toBe(6)
    }
  })

  await test.step('the guest slings one back from their own end', async () => {
    await slingMiddlePuck(bob.page)
    for (const p of [alice, bob]) {
      await expect.poll(() => left(p.page, 'O')).toBeLessThan(6)
    }
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
