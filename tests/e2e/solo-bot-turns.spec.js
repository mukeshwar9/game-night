// Solo bots that take several turns in a row must keep playing.
//
// Regression: BattleshipDemo and MancalaDemo drove the bot from an effect that
// only re-ran when `turn` changed. A bot hit (Battleship) or a sow into the
// store (Mancala) leaves `turn === 'bot'`, React bails out of the same-value
// update, the effect never fires again and the page sits on "RIVAL AIMS…" /
// "RIVAL SOWS…" forever. Math.random is seeded so both games replay the same
// way every run.
import { test, expect } from '@playwright/test'

// mulberry32, installed before any app code runs.
const seedRandom = (seed) => {
  let a = seed >>> 0
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ROWS = 'ABCDEFGHIJ'
const CELLS = Array.from({ length: 100 }, (_, i) => `${ROWS[Math.floor(i / 10)]}${(i % 10) + 1}`)

test('solo Battleship: the bot keeps firing after a hit', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(seedRandom, 7)
  await page.goto('/solo/battleship')
  await page.getByRole('button', { name: /RANDOM/ }).click()
  await page.getByRole('button', { name: 'READY — BATTLE STATIONS' }).click()

  const yourShot = page.getByText('YOUR SHOT', { exact: true })
  const over = page.getByText(/YOU WIN|YOUR FLEET IS LOST/)
  // Only cells on your own waters carry "your ship", so this counts the
  // bot's hits and not yours.
  const botHits = page.getByLabel(/^[A-J]\d+, (hit|sunk), your ship/)

  for (const cell of CELLS) {
    await expect(yourShot.or(over)).toBeVisible({ timeout: 10_000 })
    // Back on our turn after the bot has hit: it fired on past the hit.
    if ((await over.isVisible()) || (await botHits.count()) >= 1) break
    await page.getByTestId(`bs-cell-${cell}`).first().click()
  }
  expect(await botHits.count()).toBeGreaterThanOrEqual(1)
})

test('solo Mancala: the bot keeps sowing after an extra turn', async ({ page }) => {
  await page.addInitScript(seedRandom, 7)
  await page.goto('/solo/mancala')
  const yourSow = page.getByText('YOUR SOW', { exact: true })
  await expect(yourSow).toBeVisible()
  // Pit 1 sows 4 seeds into pits 2–5: no extra turn, so the bot moves next.
  // Its greedy opener (rival pit 3) ends in its store and earns an extra turn.
  await page.getByTestId('pit 0').click()
  await expect(page.getByText('RIVAL SOWS…')).toBeVisible()
  await expect(yourSow).toBeVisible({ timeout: 10_000 })
  // The rival store got the extra-turn seed plus at least one more move.
  await expect(page.getByText(/^\d+ RIVAL$/)).not.toHaveText('0 RIVAL')
})

test('solo board games keep your record against each CPU level', async ({ page }) => {
  await page.addInitScript(seedRandom, 7)
  await page.goto('/solo/tictactoe')
  await page.getByRole('button', { name: /^hard, your record/ }).click()
  await expect(page.getByRole('button', { name: 'hard, your record not played yet' })).toBeVisible()

  const result = page.getByText(/^(DRAW!|YOU WIN!|CPU WINS!)$/)
  const open = page.getByRole('button', { name: /^Row \d, column \d, empty/ }).and(page.locator(':enabled'))
  while (!(await result.isVisible())) {
    if (await open.count()) await open.first().click()
    await page.waitForTimeout(150)
  }
  // Hard tic-tac-toe never loses: the game is a draw or a CPU win.
  const record = page.getByTestId('bot-record-hard')
  await expect(record).toHaveText(/^0–[01](–[01])?$/)
  await expect(page.getByRole('button', { name: /^hard, your record 0 wins, / })).toBeVisible()

  // It is kept on this device across visits.
  await page.reload()
  await expect(page.getByTestId('bot-record-hard')).toHaveText(await record.textContent() ?? '')
})
