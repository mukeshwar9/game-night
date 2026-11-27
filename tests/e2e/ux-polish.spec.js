// Mobile polish batch 1: the catalog search starts empty each visit with a
// way out of a dead end, the focus ring is the theme's, solo intros set their
// sentences in the body face, and solo Trivia waits for START.
import { test, expect } from '@playwright/test'
import { onboard } from './helpers.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

test('catalog search starts empty each visit; a no-match search can be cleared or replaced', async ({ page }) => {
  await onboard(page, 'Searcher')
  await page.goto('/games')
  const box = page.getByRole('textbox', { name: 'Search games' })
  await expect(box).toHaveValue('')
  await box.fill('zzzz')
  const empty = page.getByTestId('catalog-search-empty')
  await expect(empty).toContainText('No games match')
  await empty.getByRole('button', { name: 'CLEAR SEARCH' }).click()
  await expect(box).toHaveValue('')
  await box.fill('zzzz')
  await empty.getByRole('button', { name: 'word', exact: true }).click()
  await expect(box).toHaveValue('word')
  await expect(empty).toHaveCount(0)
  // A new visit does not bring the old query back.
  await box.fill('zzzz')
  await page.goto('/games')
  await expect(page.getByRole('textbox', { name: 'Search games' })).toHaveValue('')
})

test('keyboard focus draws the theme ring, not the browser default', async ({ page }) => {
  await onboard(page, 'Focuser')
  await page.goto('/games')
  await expect(page.getByRole('textbox', { name: 'Search games' })).toBeVisible()
  // Tab until a button or link has focus (text fields keep their own border
  // highlight), then read what the browser drew around it.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    if (await page.evaluate(() => ['BUTTON', 'A'].includes(document.activeElement?.tagName))) break
  }
  const outline = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement)
    return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, cta: getComputedStyle(document.documentElement).getPropertyValue('--c-cta').trim() }
  })
  expect(outline.style).toBe('solid')
  expect(outline.width).toBe('2px')
  // rgb(r, g, b) built from the --c-cta triplet.
  const [r, g, b] = outline.cta.split(/\s+/)
  expect(outline.color).toBe(`rgb(${r}, ${g}, ${b})`)
})

test('solo intros: sentences are mono, tiles explain the colours', async ({ page }) => {
  await onboard(page, 'Reader')
  await page.goto('/solo/wordduel')
  await expect(page.getByText('Fewer guesses = more points')).toBeVisible()
  const family = await page.getByText('Fewer guesses = more points').evaluate(el => getComputedStyle(el).fontFamily)
  expect(family).not.toMatch(/Press Start/i)
  const legend = page.getByRole('list', { name: 'What the tile colours mean' })
  await expect(legend.getByRole('img')).toHaveCount(3)
  await expect(legend).toContainText('Right spot')
})
