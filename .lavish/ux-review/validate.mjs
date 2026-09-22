import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { resolve } from 'node:path'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto('file://' + resolve('.lavish/ux-review/index.html'))
  await page.evaluate(() => document.fonts.ready)
  const checks = []
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const screen of ['solo', 'home', 'welcome']) {
      await page.selectOption('#screen', screen)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      if (overflow) throw new Error(`Horizontal overflow: ${width}, ${screen}`)
      checks.push(`${width}px / ${screen}: no horizontal overflow`)
    }
  }
  await page.selectOption('#screen', 'home')
  await page.click('[data-mode="friend"]')
  if (await page.locator('.play-preview').first().innerText() !== 'Create room') throw new Error('Mode preview did not update')
  await page.selectOption('#screen', 'welcome')
  await page.click('#start-preview')
  if (await page.inputValue('#screen') !== 'home') throw new Error('Guest preview did not open home')
  await page.evaluate(() => { window.queueCalls = []; window.lavish = { queuePrompt: (...args) => window.queueCalls.push(args) } })
  await page.locator('[name=direction]').nth(1).check()
  if (await page.evaluate(() => window.queueCalls.length) !== 0) throw new Error('Selection queued prematurely')
  await page.fill('#feedback', 'Keep the pixel branding.')
  await page.locator('#decision-form button[type=submit]').click()
  if (await page.evaluate(() => window.queueCalls.length) !== 1) throw new Error('Submission did not queue exactly once')
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.selectOption('#screen', 'solo')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: '.lavish/ux-review/review-desktop.png' })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(checks.join('\n'))
  console.log('Passed: mode preview, guest preview, local-only choice state, single queued submission, no page errors.')
} finally { await browser.close() }
