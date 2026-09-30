import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../../src/lib/ruleMedia.json', import.meta.url), 'utf8'))

async function openRules(page, type) {
  await page.addInitScript(() => {
    localStorage.setItem('onboarded', '1')
    localStorage.setItem('music', 'off')
  })
  await page.goto(`/games?game=${type}`)
  await page.getByRole('button', { name: 'HOW TO PLAY', exact: true }).click()
  return page.getByRole('dialog', { name: / rules$/ })
}

// Each category exercises the same shared modal through the catalog. Manifest
// tests check every type; these prove the interactive carousel in a real browser.
for (const type of ['connectfour', 'reaction', 'wordrace', 'wavelength', 'sos']) {
  test(`${type}: phone sheet has loaded stills, caption and manual controls`, async ({ page }) => {
    test.skip(!manifest.types[type], 'Capture driver cannot produce this demo yet; original sheet is preserved.')
    await page.setViewportSize({ width: 390, height: 844 })
    const sheet = await openRules(page, type)
    const carousel = sheet.getByRole('region', { name: 'Step by step' })
    const img = carousel.getByRole('img')
    await expect(img).toBeVisible()
    await expect.poll(() => img.evaluate(e => e.complete && e.naturalWidth > 0)).toBe(true)
    expect(await img.evaluate(e => e.getBoundingClientRect().height)).toBeLessThanOrEqual(844 * 0.3 + 1)
    await carousel.getByRole('button', { name: /STOP AUTOPLAY/ }).click()
    await carousel.getByRole('button', { name: 'Step 1 of 3', exact: true }).click()
    await carousel.getByRole('button', { name: 'Next step' }).click()
    await expect(carousel.getByRole('button', { name: 'Step 2 of 3', exact: true })).toHaveAttribute('aria-current', 'step')
    await page.waitForTimeout(3700)
    await expect(carousel.getByRole('button', { name: 'Step 2 of 3', exact: true })).toHaveAttribute('aria-current', 'step')
    await carousel.getByRole('button', { name: 'Previous step' }).click()
    await expect(carousel.getByRole('button', { name: 'Step 1 of 3', exact: true })).toHaveAttribute('aria-current', 'step')
    await carousel.getByRole('button', { name: /AUTOPLAY/ }).click()
    await expect(carousel.getByRole('button', { name: 'Step 2 of 3', exact: true })).toHaveAttribute('aria-current', 'step', { timeout: 5000 })
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(sheet).toHaveCount(0)
  })
}

test('reduced motion starts at step one and never autoplays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const sheet = await openRules(page, 'connectfour')
  await expect(sheet.getByRole('button', { name: /AUTOPLAY/ })).toHaveCount(0)
  const first = sheet.getByRole('button', { name: 'Step 1 of 3', exact: true })
  await expect(first).toHaveAttribute('aria-current', 'step')
  await page.waitForTimeout(3700)
  await expect(first).toHaveAttribute('aria-current', 'step')
  await sheet.getByRole('button', { name: 'Next step' }).click()
  await expect(sheet.getByRole('button', { name: 'Step 2 of 3', exact: true })).toHaveAttribute('aria-current', 'step')
})

test('an unsupported party game retains its text sheet', async ({ page }) => {
  const sheet = await openRules(page, 'justone')
  await expect(sheet.getByRole('region', { name: 'Step by step' })).toHaveCount(0)
  await expect(sheet.getByText('OBJECTIVE', { exact: true })).toBeVisible()
  await expect(sheet.getByText('TO WIN', { exact: true })).toBeVisible()
})
