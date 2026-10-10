// In-app browsers (Instagram, TikTok, Facebook): Google sign-in cannot work
// there, so first-run shows an "open in browser" hint instead of the Google
// button, and everything else (onboarding, playing) still works.
import { test, expect } from '@playwright/test'
import { completeOnboarding } from './helpers.js'
import { APP_PORT } from './emulator.js'

const INSTAGRAM_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 Instagram 340.0.0.24.108 (iPhone14,5; iOS 17_4; en_US; scale=3.00)'
const FACEBOOK_ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.38.108;]'

test('an Instagram webview gets the open-in-browser hint and can still play', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: INSTAGRAM_IOS })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'WHAT SHOULD WE CALL YOU?' })).toBeVisible()
  await expect(page.getByRole('note').getByText(/does not work inside Instagram/)).toBeVisible()
  await expect(page.getByRole('button', { name: /SIGN IN WITH GOOGLE/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'COPY LINK' })).toBeVisible()
  await completeOnboarding(page, 'Insta', "LET'S PLAY")
  await page.goto('/solo/tictactoe')
  await expect(page.getByRole('button', { name: /^Row 1, column 1/ }).first()).toBeVisible()
  expect(errors).toEqual([])
  await context.close()
})

test('an Android webview offers the Chrome intent link', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: FACEBOOK_ANDROID })
  const page = await context.newPage()
  await page.goto('/')
  const link = page.getByRole('link', { name: 'OPEN IN CHROME' })
  await expect(link).toHaveAttribute('href', `intent://localhost:${APP_PORT}/#Intent;scheme=http;package=com.android.chrome;end`)
  await context.close()
})

test('a regular browser still shows the Google button', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('button', { name: /SIGN IN WITH GOOGLE/ })).toBeVisible()
  await expect(page.getByRole('note')).toHaveCount(0)
  await context.close()
})
