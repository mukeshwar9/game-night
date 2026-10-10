// Fender Bender across two clients: the peer link comes up, the host's sim is
// the one both screens draw, and the guest steering off the road ends the round
// on both screens (src/lib/fenderLogic.js, src/pages/FenderBenderGame.jsx).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const arena = (page) => page.getByTestId('fender-arena')

test('Fender Bender: the guest drives off the road and both screens show the result', async ({ browser }) => {
  test.setTimeout(120_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players open a Fender Bender room and the road goes live', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'FENDER BENDER')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const p of [alice, bob]) {
      await expect(arena(p.page)).toBeVisible()
      // The connecting / countdown overlay sits on the arena until play starts.
      await expect(p.page.getByTestId('fender-pad-' + (p === alice ? 0 : 1))).toBeVisible()
      await expect(p.page.getByTestId('fender-overlay')).toHaveCount(0, { timeout: 30_000 })
      await expect(p.page.getByTestId('fender-hearts-X')).toContainText('♥♥♥', { timeout: 30_000 })
      await expect(p.page.getByTestId('fender-hearts-O')).toContainText('♥♥♥')
    }
  })

  await test.step('the guest steers hard to the right edge and falls in the water', async () => {
    await bob.page.keyboard.down('ArrowRight')
    for (const p of [alice, bob]) {
      await expect(p.page.getByTestId('fender-result')).toBeVisible({ timeout: 30_000 })
    }
    await bob.page.keyboard.up('ArrowRight')
  })

  await test.step('the host is the last car rolling', async () => {
    for (const p of [alice, bob]) {
      await expect(p.page.getByTestId('fender-result')).toContainText('LAST CAR')
    }
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('Fender Bender: three people on one phone, pads drive their own cars', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(err))
  await page.goto('/local/fenderbender')
  await expect(page.getByTestId('fender-arena')).toBeVisible()
  await page.getByRole('button', { name: '3', exact: true }).click()
  await page.getByTestId('fender-play').click()
  // 3 · 2 · 1 · GO, then the pads go live: one per seat, P2 at the far end.
  await expect(page.getByTestId('fender-count')).toBeVisible()
  await expect(page.getByTestId('fender-count')).toHaveCount(0, { timeout: 15_000 })
  for (const seat of [0, 1, 2]) await expect(page.getByTestId(`fender-pad-${seat}`)).toBeVisible()
  await expect(page.getByTestId('fender-pad-3')).toHaveCount(0)
  const pad = await page.getByTestId('fender-pad-0').boundingBox()
  await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2)
  await page.mouse.down()
  await page.mouse.move(pad.x + pad.width / 2 + 30, pad.y + pad.height / 2, { steps: 4 })
  await page.mouse.up()
  expect(errors).toEqual([])
})
