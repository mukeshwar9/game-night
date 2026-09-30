import { test, expect } from '@playwright/test'
import { onboard } from './helpers.js'

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`settings choices stay reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await onboard(page, 'Settings Tester')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Settings', exact: true })
    const theme = sheet.locator('summary').filter({ hasText: /^THEME\s*MATCHA/ })
    const font = sheet.locator('summary').filter({ hasText: /^FONT FAMILY/ })
    const help = sheet.locator('summary').filter({ hasText: 'HELP & RESET' })
    await expect(theme).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'PHOSPHOR', exact: true })).toBeHidden()
    await expect(sheet.getByRole('button', { name: /^SILKSCREEN/ })).toBeHidden()
    await expect(sheet.getByRole('button', { name: 'RESET ALL TO DEFAULTS' })).toBeHidden()

    // Tab must pass the preview switch into the collapsed groups rather
    // than loop early because the modal trap omitted native summaries.
    await sheet.getByRole('switch', { name: 'Show theme preview' }).focus()
    await page.keyboard.press('Tab')
    await expect(sheet.locator('summary').filter({ hasText: 'LOOK & FEEL' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(sheet.locator('summary').filter({ hasText: /^AUDIO/ })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(help).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(sheet.getByRole('button', { name: 'RESET ALL TO DEFAULTS' })).toBeVisible()

    await theme.focus()
    await page.keyboard.press('Enter')
    await sheet.getByRole('button', { name: 'PHOSPHOR', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'phosphor')
    await font.click()
    await sheet.getByRole('button', { name: /^SILKSCREEN/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-font', 'silkscreen')
    await sheet.getByRole('button', { name: 'CLOSE', exact: true }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(sheet.locator('summary').filter({ hasText: /^THEME\s*PHOSPHOR/ })).toBeVisible()
    await expect(sheet.locator('summary').filter({ hasText: /^FONT FAMILY\s*SILKSCREEN/ })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'PHOSPHOR', exact: true })).toBeHidden()
    await help.click()
    await sheet.getByRole('button', { name: 'RESET ALL TO DEFAULTS' }).click()
    await sheet.getByRole('button', { name: 'SURE? TAP AGAIN TO RESET' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'matcha')
    await expect(page.locator('html')).toHaveAttribute('data-font', 'press-start')
  })
}
