// Memory shelf flows that only show up in a real browser: the pass-and-play
// handoff gate, the pause after a slip in a solo run, and the Simon pad identity.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

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
  await page.getByRole('button', { name: 'TAP TO START' }).click()
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
  // Nothing is revealed until the player taps start.
  await expect(tiles).toHaveCount(0)
  await page.getByRole('button', { name: 'TAP TO START' }).click()
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

// Lit tiles (Visual Memory) or numbered tiles (Chimp) by their aria-labels, as a player sees them.
const litTiles = page => page.locator('button[aria-label^="row "]').evaluateAll(els =>
  els.map((e, i) => (e.getAttribute('aria-label').endsWith(', lit') ? i : -1)).filter(i => i >= 0))
const numberedTiles = page => page.locator('button[aria-label^="row "]').evaluateAll(els =>
  els.map((e, i) => { const m = e.getAttribute('aria-label').match(/tile (\d+)$/); return m ? [Number(m[1]), i] : null })
    .filter(Boolean).sort((a, b) => a[0] - b[0]).map(([, i]) => i))

async function duel(browser, label) {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  await onboard(alice.page, 'Alice')
  await createRoom(alice.page, label)
  await joinViaInvite(bob.page, alice.page.url(), 'Bob')
  return { alice, bob }
}

test('Visual Memory duel: both see the same pattern, and a slip waits for the other player', async ({ browser }) => {
  const { alice, bob } = await duel(browser, 'VISUAL MEMORY')
  // A shared 3-2-1, then the same lit tiles on both screens.
  await expect(alice.page.getByText('GET READY')).toBeVisible()
  let litA = []
  await expect.poll(async () => (litA = await litTiles(alice.page)).length, { timeout: 10_000 }).toBeGreaterThan(0)
  const litB = await litTiles(bob.page)
  expect(litB).toEqual(litA)
  await expect(alice.page.getByText(/TAP THE TILES YOU SAW/)).toBeVisible()

  // Bob slips: the round is NOT over yet.
  const tilesB = bob.page.locator('button[aria-label^="row "]')
  const wrong = [...Array(await tilesB.count()).keys()].find(i => !litA.includes(i))
  await tilesB.nth(wrong).click()
  await expect(bob.page.getByText('YOU SLIPPED — ALICE MUST CLEAR LEVEL 3 TO WIN')).toBeVisible()
  await expect(alice.page.getByText(/BOB SLIPPED — CLEAR IT TO WIN/)).toBeVisible()

  // Alice clears the level and takes the round.
  const tilesA = alice.page.locator('button[aria-label^="row "]')
  for (const i of litA) await tilesA.nth(i).click()
  await expect(alice.page.getByText('YOU WIN!')).toBeVisible()
  await expect(bob.page.getByText('ALICE WINS!')).toBeVisible()
  expectNoPageErrors(alice, bob)
})

test('Chimp duel: a slip only loses once the opponent clears the level', async ({ browser }) => {
  const { alice, bob } = await duel(browser, 'CHIMP TEST')
  await expect(alice.page.getByText('GET READY')).toBeVisible()
  let order = []
  await expect.poll(async () => (order = await numberedTiles(alice.page)).length, { timeout: 10_000 }).toBe(4)
  expect(await numberedTiles(bob.page)).toEqual(order)

  // Bob taps the wrong tile first.
  await bob.page.locator('button[aria-label^="row "]').nth(order[1]).click()
  await expect(bob.page.getByText('YOU SLIPPED — ALICE MUST CLEAR LEVEL 4 TO WIN')).toBeVisible()
  await expect(alice.page.getByText('BOB SLIPPED — CLEAR THIS LEVEL TO WIN')).toBeVisible()
  await expect(alice.page.getByText(/WINS!|YOU WIN/)).toHaveCount(0)

  for (const i of order) await alice.page.locator('button[aria-label^="row "]').nth(i).click()
  await expect(alice.page.getByText('YOU WIN!')).toBeVisible()
  await expect(bob.page.getByText('ALICE WINS!')).toBeVisible()
  expectNoPageErrors(alice, bob)
})

test('Number Memory solo: GOT IT ends the reveal and the answer is marked digit by digit', async ({ page }) => {
  await page.goto('/solo/numbermemory')
  await expect(page.getByRole('button', { name: 'TAP TO START' })).toBeVisible()
  await page.keyboard.press('Enter') // Space/Enter starts a run too
  await expect(page.getByText('MEMORIZE THIS NUMBER')).toBeVisible()
  await page.getByRole('button', { name: 'GOT IT' }).click()
  const answer = page.getByRole('textbox', { name: 'Your answer' })
  await expect(answer).toBeFocused()
  await answer.fill('0')
  await page.getByRole('button', { name: 'SUBMIT' }).click()
  await expect(page.getByText('THE NUMBER WAS')).toBeVisible()
  await expect(page.getByLabel(/^0, 0 of 1 digits in the right place$/)).toBeVisible()
})

test('Number Memory duel: a shared 3-2-1, then GOT IT from both players skips to recall', async ({ browser }) => {
  const { alice, bob } = await duel(browser, 'NUMBER MEMORY')
  await expect(alice.page.getByText('GET READY')).toBeVisible()
  await expect(alice.page.getByText('MEMORIZE THIS NUMBER')).toBeVisible({ timeout: 10_000 })
  await alice.page.getByRole('button', { name: /^GOT IT/ }).click()
  await expect(alice.page.getByText('READY — WAITING FOR OPPONENT…')).toBeVisible()
  await expect(bob.page.getByRole('button', { name: 'GOT IT · OPPONENT IS READY' })).toBeVisible()
  await bob.page.getByRole('button', { name: /^GOT IT/ }).click()
  await expect(alice.page.getByRole('textbox', { name: /answer/i })).toBeVisible()
  await expect(bob.page.getByRole('textbox', { name: /answer/i })).toBeVisible()
  expectNoPageErrors(alice, bob)
})

test('Pairs vs CPU offers three levels, and PAIRS 4×4 deals 16 cards', async ({ page }) => {
  await page.goto('/solo/pairs')
  const levels = page.getByRole('group', { name: 'CPU difficulty' })
  for (const level of ['easy', 'normal', 'hard']) await expect(levels.getByRole('button', { name: level })).toBeVisible()
  await expect(page.locator('button[aria-label$="face down"]')).toHaveCount(36)
  await page.goto('/solo/pairs4')
  await expect(page.locator('button[aria-label$="face down"]')).toHaveCount(16)
  await page.locator('button[aria-label$="face down"]').first().click()
  await expect(page.locator('button[aria-label*="first pick"]')).toHaveCount(1)
})
