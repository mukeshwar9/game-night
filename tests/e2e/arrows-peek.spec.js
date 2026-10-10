// Arrows solo route peek: press and hold an arrow (touch) to see its dotted
// route; letting go sends nothing. A quick tap on the same arrow still acts.
import { test, expect } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

const status = (page) => page.locator('p.sr-only[aria-live="polite"]').filter({ hasText: /cleared, \d lives|Board clear|Out of lives/ })

// Real touch input through the browser (CDP), so the board sees genuine
// pointer events with pointerType 'touch'.
async function touch(page, cdp, x, y, holdMs) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await page.waitForTimeout(holdMs)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('hold an arrow to see its route (no tap on release); a quick tap still sends it', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.addInitScript(() => {
    localStorage.setItem('onboarded', '1')
    localStorage.setItem('music', 'off')
  })
  await page.goto('/solo/arrows')
  await expect(page.getByRole('heading', { name: 'ARROWS' })).toBeVisible()

  // Hub → chapter 1 → level 1.
  const tile = page.getByRole('button', { name: /^Level 1(,|$)/ })
  if (!(await tile.isVisible())) {
    const chapter = page.getByRole('region', { name: /^Chapter 1,/ })
    if (!(await chapter.isVisible())) await page.getByRole('button', { name: /SOLO/ }).click()
    const head = chapter.getByRole('button').first()
    if ((await head.getAttribute('aria-expanded')) === 'false') await head.click()
  }
  await tile.click()

  const svg = page.locator('svg.arrows-svg')
  await expect(svg).toBeVisible()
  const hit = page.locator('.ar-hit').first()
  await expect(hit).toBeAttached()
  const box = await hit.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const before = await status(page).textContent()
  const cdp = await page.context().newCDPSession(page)

  await test.step('a long hold shows the route and sends nothing on release', async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await expect(svg.locator('.ar-route')).toHaveCount(1, { timeout: 3000 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    // Still there during the linger, gone after it.
    await expect(svg.locator('.ar-route')).toHaveCount(1)
    await expect(svg.locator('.ar-route')).toHaveCount(0, { timeout: 4000 })
    expect(await status(page).textContent()).toBe(before)
  })

  await test.step('a quick tap on the same arrow still acts', async () => {
    await touch(page, cdp, x, y, 60)
    await expect(svg.locator('.ar-route')).toHaveCount(0)
    await expect.poll(() => status(page).textContent()).not.toBe(before)
  })

  expect(errors).toEqual([])
})
