// Word Race presentation fixes (word games audit, 2026-10-02): each board's
// label wears its seat's colour (O read "YOU" in purple on the rail but in
// green on their own board), and when a solo round ends the result card sits
// above the boards instead of below the fold.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test.describe.configure({ timeout: 120_000 })

const PHONE = { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

test('each Word Race board label wears its seat colour', async ({ browser }) => {
  const host = await newPlayer(browser, PHONE)
  const guest = await newPlayer(browser, PHONE)
  await onboard(host.page, 'Asha')
  const url = await createRoom(host.page, 'WORD RACE')
  await joinViaInvite(guest.page, url, 'Ben')

  // O's own board: "YOU · Ben" in the O colour, the opponent's in the X colour.
  await expect(guest.page.getByText('YOU · Ben', { exact: true })).toHaveClass(/text-retro-p2/)
  await expect(guest.page.getByText('OPPONENT · Asha', { exact: true })).toHaveClass(/text-retro-p1/)
  await expect(host.page.getByText('YOU · Asha', { exact: true })).toHaveClass(/text-retro-p1/)
  expectNoPageErrors(host, guest)
  await host.context.close()
  await guest.context.close()
})

test('solo Word Race shows the round result above the boards', async ({ browser }) => {
  const player = await newPlayer(browser, PHONE)
  const { page } = player
  await page.goto('/solo/wordrace')
  await page.getByRole('button', { name: 'START RACE' }).click()
  // Six wrong guesses end your board; SKIP AHEAD runs the CPU to the reveal.
  for (const word of ['fuzzy', 'jumpy', 'vivid', 'mommy', 'puppy', 'kayak']) {
    await page.keyboard.type(word)
    await page.keyboard.press('Enter')
  }
  await page.getByRole('button', { name: /SKIP AHEAD/ }).click()
  const answer = page.getByText('ANSWER', { exact: true })
  await expect(answer).toBeVisible()
  const board = page.getByRole('region', { name: /^YOU/ }).first()
  const [answerBox, boardBox] = [await answer.boundingBox(), await board.boundingBox()]
  expect(answerBox.y).toBeLessThan(boardBox.y)
  expectNoPageErrors(player)
  await player.context.close()
})
