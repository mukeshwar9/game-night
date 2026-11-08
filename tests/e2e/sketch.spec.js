// SKETCH stage screen and letter hints, two real players: the artist's phone
// publishes the hint (only it knows the word), the guesser's blanks fill in,
// wrong guesses float over the drawing, and a right guess ends the round.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const stage = (page, phase) => page.locator(`[data-testid="sketch-stage"][data-phase="${phase}"]`)

test('hints appear on the guesser\'s blanks at half time, from the artist only', async ({ browser }) => {
  const host = await newPlayer(browser)
  const guest = await newPlayer(browser)
  let word = ''
  let gameId = ''

  await test.step('two players start a round and the artist picks a word', async () => {
    await onboard(host.page, 'Ivy')
    await createRoom(host.page, 'SKETCH')
    gameId = host.page.url().split('/').pop()
    await joinViaInvite(guest.page, host.page.url(), 'Gus')
    await expect(host.page.getByText(/^PLAYERS \(2\)/)).toBeVisible()
    await host.page.getByRole('button', { name: 'START ROUND' }).click()
    // Ivy joined first, so she draws first.
    await host.page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first().click()
    await expect(stage(host.page, 'drawing')).toBeVisible()
    await expect(stage(guest.page, 'drawing')).toBeVisible()
    word = (await host.page.getByTestId('sketch-word').innerText()).trim()
    expect(word.length).toBeGreaterThan(2)
  })

  await test.step('the stage: faces on top, blanks above the drawing, the guess box under it', async () => {
    await expect(guest.page.getByTestId('sketch-faces')).toBeVisible()
    await expect(guest.page.getByTestId('sketch-blanks')).toBeVisible()
    await expect(guest.page.locator('[data-hint]')).toHaveCount(0)
    await expect(guest.page.getByRole('textbox', { name: 'Your guess' })).toBeVisible()
    await expect(host.page.getByTestId('sketch-dock')).toBeVisible()
    // REPORT is not a stage button any more: it lives in the artist's face menu.
    await expect(guest.page.getByRole('button', { name: 'REPORT DRAWING' })).toHaveCount(0)
  })

  await test.step('a wrong guess floats over the drawing for everyone', async () => {
    await guest.page.getByRole('textbox', { name: 'Your guess' }).fill('qzxwv')
    await guest.page.getByRole('button', { name: 'GO', exact: true }).click()
    await expect(guest.page.getByTestId('sketch-bubbles')).toContainText('qzxwv')
    await expect(host.page.getByTestId('sketch-bubbles')).toContainText('qzxwv')
  })

  await test.step('at half time the artist\'s phone publishes a hint and the blank fills in', async () => {
    // Move the round's start back so the 50% mark has passed (test data only).
    const start = Date.now() - 45_000
    const res = await fetch(`${DB_ORIGIN}/games/${gameId}/round/drawStartedAt.json?ns=demo-game-night-default-rtdb`, {
      method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(start),
    })
    expect(res.ok).toBe(true)
    await expect(guest.page.locator('[data-hint]')).toHaveCount(1, { timeout: 20_000 })
    const hinted = await guest.page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-testid="sketch-blanks"] > span > span')]
      const i = cells.findIndex(c => c.hasAttribute('data-hint'))
      return { i, ch: cells[i]?.textContent, count: cells.length }
    })
    const flat = word.replace(/\s+/g, '')
    expect(hinted.count).toBe(flat.length)
    expect(hinted.ch.toLowerCase()).toBe(flat[hinted.i].toLowerCase())
    // The artist never sees blanks, so nothing changed for them.
    await expect(host.page.locator('[data-hint]')).toHaveCount(0)
  })

  await test.step('holding the artist\'s face opens the menu with REPORT DRAWING', async () => {
    const face = guest.page.getByRole('button', { name: /^Ivy.*Hold for menu/ })
    const box = await face.boundingBox()
    await guest.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await guest.page.mouse.down()
    await guest.page.waitForTimeout(700)
    await guest.page.mouse.up()
    const menu = guest.page.getByRole('dialog', { name: 'Artist menu' })
    await expect(menu.getByRole('button', { name: 'REPORT DRAWING' })).toBeVisible()
    await menu.getByRole('button', { name: 'CLOSE' }).click()
    await expect(menu).toBeHidden()
  })

  await test.step('the artist draws a line and the guesser sees it', async () => {
    const box = await host.page.getByTestId('sketch-canvas').boundingBox()
    await host.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3)
    await host.page.mouse.down()
    for (let i = 1; i <= 8; i++) {
      await host.page.mouse.move(box.x + box.width * (0.2 + i * 0.07), box.y + box.height * (0.3 + i * 0.04))
      await host.page.waitForTimeout(30)
    }
    await host.page.mouse.up()
    await expect(guest.page.getByTestId('sketch-canvas').locator('polyline').first()).toBeVisible()
  })

  await test.step('a right guess ends the round on the reveal, and the drawing replays on both screens', async () => {
    // Guesses are throttled to one per 500 ms, so a faster one is dropped silently.
    await guest.page.waitForTimeout(700)
    await guest.page.getByRole('textbox', { name: 'Your guess' }).fill(word)
    await guest.page.getByRole('button', { name: 'GO', exact: true }).click()
    await expect(stage(guest.page, 'reveal')).toBeVisible()
    await expect(stage(host.page, 'reveal')).toBeVisible()
    await expect(guest.page.getByTestId('sketch-word')).toHaveText(word.toUpperCase())
    // The coordinator stamped the replay's start on the round for every screen.
    const res = await fetch(`${DB_ORIGIN}/games/${gameId}/round/revealAt.json?ns=demo-game-night-default-rtdb`, {
      headers: { Authorization: 'Bearer owner' },
    })
    expect(typeof (await res.json())).toBe('number')
    await expect(guest.page.getByTestId('sketch-replay')).toContainText('TAP TO SKIP')
    await expect(host.page.getByTestId('sketch-replay')).toContainText('TAP TO SKIP')
    // Tapping skips to the finished picture on that phone only.
    await guest.page.getByTestId('sketch-replay').click()
    await expect(guest.page.getByTestId('sketch-replay')).toHaveCount(0)
    await expect(guest.page.getByTestId('sketch-canvas').locator('polyline').first()).toBeVisible()
    // The other phone finishes on its own and the picture holds.
    await expect(host.page.getByTestId('sketch-replay')).toHaveCount(0, { timeout: 6_000 })
    await expect(host.page.getByTestId('sketch-canvas').locator('polyline').first()).toBeVisible()
    await expect(host.page.getByTestId('sketch-nothing-drawn')).toHaveCount(0)
  })

  expectNoPageErrors(host, guest)
  await host.context.close()
  await guest.context.close()
})
