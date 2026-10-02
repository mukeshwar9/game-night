// Memory shelf flows that only show up in a real browser: the pass-and-play
// handoff gate, the pause after a slip in a solo run, and the Simon pad identity.
import { test, expect } from '@playwright/test'
import { onboard } from './helpers.js'

const litLabels = page => page.locator('button[aria-label$=", lit"]').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))

test('pass-and-play Simon hides the next flash until the next player taps ready', async ({ page }) => {
  await page.goto('/local/simon')
  // Player 1 is gated too, so nobody's reveal starts on a phone that is still being passed.
  await expect(page.getByText('PASS THE DEVICE')).toBeVisible()
  await page.getByRole('button', { name: "I'M READY" }).click()

  // The first turn only adds a pad.
  await page.getByRole('button', { name: /^green pad, top left/ }).click()

  // The turn passes: the board is replaced by the gate, so player 2's flash cannot
  // play in player 1's hands (it used to start 150 ms after the pad).
  await expect(page.getByText('PASS THE DEVICE')).toBeVisible()
  await expect(page.getByText('PLAYER 2', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('WATCH CAREFULLY')).toHaveCount(0)

  await page.getByRole('button', { name: "I'M READY" }).click()
  await expect(page.getByText('WATCH CAREFULLY')).toBeVisible()
})

test('Simon pads are named by colour and corner, and light up on your own press', async ({ page }) => {
  await page.goto('/solo/simon')
  for (const name of ['green pad, top left', 'red pad, top right', 'yellow pad, bottom left', 'blue pad, bottom right']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  // Watch the one-pad sequence, then repeat it: the pressed pad lights.
  await page.getByRole('button', { name: 'WATCH AGAIN (1)' }).click()
  let first = null
  await expect.poll(async () => { const l = await litLabels(page); if (l.length) first = l[0]; return first }, { timeout: 5000 }).not.toBeNull()
  await expect(page.getByText(/REPEAT FROM MEMORY/)).toBeVisible()
  const name = first.replace(', lit', '')
  const pad = page.getByRole('button', { name: new RegExp(`^${name}`) })
  await pad.click()
  await expect(page.getByRole('button', { name: `${name}, lit` })).toBeVisible()
})

test('a Visual Memory slip holds the board on the mistake until TRY AGAIN', async ({ page }) => {
  await page.goto('/solo/visualmemory')
  const tiles = page.locator('button[aria-label^="row "]')
  // Remount the run so the reveal starts while we watch.
  await page.getByRole('button', { name: /CHIMP\s*TEST/ }).click()
  await page.getByRole('button', { name: /VIS\s*MEMORY/ }).click()
  let lit = []
  await expect.poll(async () => {
    lit = await tiles.evaluateAll(els => els.map((e, i) => (e.getAttribute('aria-label').endsWith(', lit') ? i : -1)).filter(i => i >= 0))
    return lit.length
  }, { timeout: 5000 }).toBeGreaterThan(0)
  await expect(page.getByText(/TAP THE TILES YOU SAW/)).toBeVisible()
  const count = await tiles.count()
  const wrong = [...Array(count).keys()].find(i => !lit.includes(i))
  await tiles.nth(wrong).click()

  await expect(page.getByText('WRONG TILE — DASHED TILES WERE THE PATTERN')).toBeVisible()
  const tryAgain = page.getByRole('button', { name: 'TRY AGAIN · 2 LIVES LEFT' })
  await expect(tryAgain).toBeVisible()
  // The same pattern is still on the board (nothing re-dealt behind the message).
  await expect(page.locator('button[aria-label$="was in the pattern"]')).toHaveCount(lit.length)
  await tryAgain.click()
  await expect(page.getByText('MEMORIZE THE LIT TILES')).toBeVisible()
})

test('a Chimp solo run starts at 0 numbers and the tab says solo run', async ({ page }) => {
  await page.goto('/solo/chimp')
  await expect(page.getByText(/^NUMBERS\s*0$/)).toBeVisible()
  await expect(page).toHaveTitle('Chimp test — solo run — Game Night')
  await expect(page.getByText('BEAT YOUR BEST')).toBeVisible()
})

test('tapping a catalog chip keeps that chip lit, also on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await onboard(page, 'Chip Tester')
  await page.goto('/games')
  for (const chip of ['MEMORY', 'WORD', 'REFLEX', 'MEMORY']) {
    await page.getByRole('button', { name: new RegExp(`^${chip} \\d+$`) }).click()
    // The chip used to flip back to the section above once the smooth scroll ended.
    await page.waitForTimeout(1500)
    await expect(page.getByRole('button', { name: new RegExp(`^${chip} \\d+$`) })).toHaveAttribute('aria-pressed', 'true')
  }
})
