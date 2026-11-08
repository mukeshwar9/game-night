// Every solo CPU mode shows the shared EASY / NORMAL / HARD row, defaults to
// NORMAL and remembers the pick across a reload (bot-difficulty-<type>).
import { test, expect } from '@playwright/test'

const WITH_CPU_ROW = [
  'paint', 'pacmac', 'tron', 'snake', 'sumo', 'spaceduel', 'mancala', 'checkers',
  'battleship', 'artillery', 'reaction', 'aim', 'typing', 'math', 'trivia',
  'wavelength', 'fibbage', 'spyfair', 'airhockey', 'tictactoe', 'pairs',
]

test.describe.configure({ mode: 'parallel' })

for (const type of WITH_CPU_ROW) {
  test(`/solo/${type} offers a remembered CPU level`, async ({ page }) => {
    await page.goto(`/solo/${type}`)
    const row = page.getByRole('group', { name: 'CPU difficulty' })
    await expect(row).toBeVisible()
    const chip = (level) => row.getByRole('button', { name: new RegExp(`^${level}`, 'i') })
    await expect(chip('normal')).toHaveAttribute('aria-pressed', 'true')

    await chip('hard').click()
    await expect(chip('hard')).toHaveAttribute('aria-pressed', 'true')
    await expect(chip('normal')).toHaveAttribute('aria-pressed', 'false')

    await page.reload()
    await expect(chip('hard')).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate((t) => localStorage.getItem(`bot-difficulty-${t}`), type)).toBe('hard')
  })
}

test('/solo/minesweeper picks the mine count and restarts the board', async ({ page }) => {
  await page.goto('/solo/minesweeper')
  const row = page.getByRole('group', { name: 'Mine count' })
  await expect(row.getByRole('button', { name: /^normal/i })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/^💣 22$/)).toBeVisible()
  await row.getByRole('button', { name: /^hard/i }).click()
  await expect(page.getByText(/^💣 32$/)).toBeVisible()
  await row.getByRole('button', { name: /^easy/i }).click()
  await expect(page.getByText(/^💣 14$/)).toBeVisible()
  await page.reload()
  await expect(row.getByRole('button', { name: /^easy/i })).toHaveAttribute('aria-pressed', 'true')
})
