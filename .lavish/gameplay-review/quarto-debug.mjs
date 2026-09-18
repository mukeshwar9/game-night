// Quarto-only diagnostic: dump full state after every tap, no force clicks.
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const BASE = 'http://localhost:5179'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  serviceWorkers: 'block',
})
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, r => r.abort())
const page = await context.newPage()
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)))

async function dump(tag) {
  await page.evaluate(() => document.fonts.ready)
  const s = await page.evaluate(() => ({
    filled: [...document.querySelectorAll('button[aria-label^="qrt-cell-"]')]
      .map(b => b.getAttribute('aria-label'))
      .filter(l => /^qrt-cell-\d+-/.test(l)),
    pendingBadge: !!document.querySelector('span.border-retro-cta svg, span[class*="border-retro-cta"]'),
    stage: document.querySelector('.font-pixel.text-\\[8px\\]')?.textContent ?? '(none)',
    shelfEnabled: [...document.querySelectorAll('button[aria-label^="qrt-give-"]')]
      .filter(b => !b.disabled).length,
  }))
  console.log(tag, JSON.stringify(s))
  return s
}

await page.goto(`${BASE}/solo/quarto`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => {
  localStorage.setItem('onboarded', '1')
  localStorage.setItem('playerName', 'Playtest')
})
await page.goto(`${BASE}/solo/quarto`, { waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(2000)

await dump('initial')
// Tap cell 5 WITHOUT force, after fonts settled.
await page.locator('[aria-label="qrt-cell-5"]').click()
await page.waitForTimeout(300)
await dump('after-cell5')
// Tap first enabled shelf piece, no force.
await page.locator('button[aria-label^="qrt-give-"]:not([disabled])').first().click()
await page.waitForTimeout(300)
await dump('after-give')
// Let the bot move.
await page.waitForTimeout(1500)
await dump('after-bot-window')
await page.waitForTimeout(1500)
await dump('after-bot-window-2')

// Repeat the full round 3x to shake out races.
for (let round = 2; round <= 4; round++) {
  const stage = await dump(`round${round}-start`)
  if (stage.shelfEnabled > 0) {
    // pendingCell already set? place is pending on some cell — tap any cell then give.
  }
  await page.locator('button[aria-label^="qrt-cell-"]:not([disabled])').nth(7).click()
  await page.waitForTimeout(300)
  await dump(`round${round}-after-cell`)
  const shelf = page.locator('button[aria-label^="qrt-give-"]:not([disabled])')
  if (await shelf.count() > 0) {
    await shelf.first().click()
    await page.waitForTimeout(300)
    await dump(`round${round}-after-give`)
  } else {
    console.log(`round${round}: shelf locked — pendingCell lost?`)
  }
  await page.waitForTimeout(1500)
}
await browser.close()
