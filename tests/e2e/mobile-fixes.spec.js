// Phone-playability regressions (games-mobile-playability audit): solo Trivia
// must start, Mancala pass & play must hand the turn to Player 2, and the solo
// result line must stay above the fixed PLAY AGAIN bar on a short screen.
import { test, expect } from '@playwright/test'

const PHONE = { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true }

test.describe('phone fixes', () => {
  test.use(PHONE)

  test('solo Trivia starts: the clock runs and answering settles the round', async ({ page }) => {
    await page.goto('/solo/trivia')
    await expect(page.getByText(/⏱ \d+\.\ds/)).toBeVisible()
    const first = await page.getByText(/⏱ (\d+\.\d)s/).innerText()
    await page.waitForTimeout(800)
    const later = await page.getByText(/⏱ (\d+\.\d)s/).innerText()
    expect(later).not.toEqual(first)
    await page.locator('main button:has(span[aria-hidden])').filter({ hasText: /^[▲■●◆]/ }).first().tap()
    await expect(page.getByText(/LOCKED IN/)).toBeVisible()
    // The bots answer on their own, so the round always settles and moves on.
    await expect(page.getByText('Q2/10')).toBeVisible({ timeout: 25_000 })
  })

  test('Mancala pass & play: player 2 can move after player 1', async ({ page }) => {
    await page.goto('/local/mancala')
    await expect(page.getByText("PLAYER 1'S TURN").first()).toBeVisible()
    await page.getByTestId('pit 0').tap()
    // Player 1 sowed 4 seeds into pits 1-4; wait for the hand-off.
    await expect(page.getByText("PLAYER 2'S TURN").first()).toBeVisible()
    // The board turns to face Player 2: their pits (7-12) are the playable row.
    const pit = page.getByTestId('pit 7')
    await expect(pit).toBeEnabled()
    await pit.tap()
    await expect(page.getByText("PLAYER 1'S TURN").first()).toBeVisible()
  })

  test('solo result line clears the PLAY AGAIN bar', async ({ page }) => {
    await page.goto('/solo/tictactoe')
    const free = page.getByRole('button', { name: /empty/i })
    await expect(free.first()).toBeVisible()
    // Play until the game ends (a human can't be forced to win, a draw/loss both show a result).
    for (let i = 0; i < 9; i++) {
      if (await page.getByRole('button', { name: 'PLAY AGAIN' }).isVisible()) break
      if (await free.count() === 0) break
      await free.first().tap().catch(() => {})
      await page.waitForTimeout(700)
    }
    const result = page.getByText(/YOU WIN!|CPU WINS!|DRAW!/).first()
    await expect(result).toBeVisible({ timeout: 10_000 })
    const [r, bar] = await Promise.all([
      result.boundingBox(),
      page.getByRole('button', { name: 'PLAY AGAIN' }).boundingBox(),
    ])
    expect(r.y + r.height).toBeLessThanOrEqual(bar.y + 1)
  })
})
