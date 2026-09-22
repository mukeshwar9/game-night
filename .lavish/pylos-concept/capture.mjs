import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
try {
  await page.goto(pathToFileURL(resolve('.lavish/pylos-concept/index.html')).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const names = ['01-place-from-reserve', '02-move-up', '03-reclaim']
  const shots = page.locator('.shot')
  for (let i = 0; i < names.length; i++) {
    await shots.nth(i).screenshot({ path: `.lavish/pylos-concept/${names[i]}.png` })
  }
  await page.screenshot({ path: '.lavish/pylos-concept/overview.png', fullPage: true })
  const checks = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    shots: [...document.querySelectorAll('.shot')].map(el => {
      const r = el.getBoundingClientRect()
      return { width: Math.round(r.width), height: Math.round(r.height) }
    }),
  }))
  console.log(JSON.stringify(checks))
} finally {
  await browser.close()
}
