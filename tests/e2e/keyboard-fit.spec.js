// Keyboard fit on a real phone height (word games audit, 2026-10-02). At
// 390×664 — an iPhone with Safari's bars showing — the on-screen keyboard of
// every 5-letter word game must be fully on screen once the round starts:
// Word Race's bottom row used to start at y=843 even on a 844 px screen, and
// Word Co-op's whole keyboard sat below the fold at 664.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test.describe.configure({ timeout: 120_000 })

const PHONE = { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

// The bottom key row (↵ Z … M ⌫) must end inside the viewport without scrolling.
async function expectKeyboardOnScreen(page) {
  const z = page.getByRole('group', { name: 'Keyboard' }).getByRole('button', { name: /^Z\b/ })
  await expect(z).toBeVisible()
  const { bottom, vh, scrollY } = await z.evaluate(el => ({
    bottom: el.getBoundingClientRect().bottom, vh: window.innerHeight, scrollY: window.scrollY,
  }))
  expect(scrollY, 'the page must not need scrolling to reach the keyboard').toBe(0)
  expect(bottom, `bottom key row ends at ${bottom}px on a ${vh}px screen`).toBeLessThanOrEqual(vh)
}

for (const { label, type } of [
  { label: 'WORD RACE', type: 'wordrace' },
  { label: 'WORD CO-OP', type: 'wordcoop' },
  { label: 'WORD DUEL', type: 'wordduel' },
]) {
  test(`${label}: the keyboard fits a 390×664 phone in a room`, async ({ browser }) => {
    const host = await newPlayer(browser, PHONE)
    const guest = await newPlayer(browser, PHONE)
    await onboard(host.page, 'Asha')
    const url = await createRoom(host.page, label)
    await joinViaInvite(guest.page, url, 'Ben')

    if (type === 'wordduel') {
      // Duel opens on the setter step; both set a word, then the guess keyboard shows.
      for (const { page } of [host, guest]) {
        await expect(page.getByRole('heading', { name: 'PICK A WORD' })).toBeVisible({ timeout: 15_000 })
        await page.keyboard.type('crane')
        await page.getByRole('button', { name: 'LOCK IN', exact: true }).click()
      }
      await expect(host.page.getByRole('heading', { name: 'PICK A WORD' })).toBeHidden({ timeout: 15_000 })
    }
    for (const player of [host, guest]) {
      await player.page.evaluate(() => window.scrollTo(0, 0))
      await expectKeyboardOnScreen(player.page)
    }
    expectNoPageErrors(host, guest)
    await host.context.close()
    await guest.context.close()
  })
}

test('WORD RACE solo: the keyboard fits a 390×664 phone once the race starts', async ({ browser }) => {
  const player = await newPlayer(browser, PHONE)
  await player.page.goto('/solo/wordrace')
  await player.page.getByRole('button', { name: 'START RACE' }).click()
  const z = player.page.getByRole('group', { name: 'Keyboard' }).getByRole('button', { name: /^Z\b/ })
  await expect(z).toBeVisible()
  // The solo page brings the race card to the top of the screen on start.
  await expect.poll(() => z.evaluate(el => el.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true)
  expectNoPageErrors(player)
  await player.context.close()
})
