import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, r => r.abort())
const page = await context.newPage()
await page.goto('http://localhost:5179/solo/connectfour5', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'P') })
await page.waitForTimeout(2200)
const info = await page.evaluate(() => {
  const drops = Array.from(document.querySelectorAll('button')).filter(b => /rop/i.test(b.getAttribute('aria-label') || ''))
  const holes = Array.from(document.querySelectorAll('button')).filter(b => /olumn/i.test(b.getAttribute('aria-label') || '') && !/rop/i.test(b.getAttribute('aria-label') || ''))
  return {
    dropButtons: drops.length,
    columnButtons: holes.length,
    sampleDropLabel: drops[0]?.getAttribute('aria-label'),
    sampleColLabel: holes[0]?.getAttribute('aria-label'),
    lastColLabel: holes[holes.length - 1]?.getAttribute('aria-label'),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
