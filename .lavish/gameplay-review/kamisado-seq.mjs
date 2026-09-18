// Reconstruct the exact Kamisado move sequence after X's opening.
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const BASE = 'http://localhost:5179'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block',
})
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, r => r.abort())
const page = await context.newPage()
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)))

await page.goto(`${BASE}/solo/kamisado`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Playtest') })
await page.goto(`${BASE}/solo/kamisado`, { waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(2000)

const towers = () => page.evaluate(() => {
  const all = [...document.querySelectorAll('button[aria-label^="km-cell-"]')]
  const x = all.filter(b => b.getAttribute('aria-label').endsWith('-X')).map(b => b.getAttribute('aria-label'))
  const o = all.filter(b => b.getAttribute('aria-label').endsWith('-O')).map(b => b.getAttribute('aria-label'))
  return { x, o }
})
const strip = () => page.evaluate(() =>
  [...document.querySelectorAll('.font-pixel')]
    .map(s => s.textContent).find(t => /ANY TOWER|MUST MOVE/.test(t)) ?? '(none)')

// Human moves X 7-3 → 5-3, then poll after each bot timer window.
console.log('t0 strip:', await strip())
await page.locator('[aria-label="km-cell-7-3-X"]').click()
await page.waitForTimeout(400)
await page.locator('[aria-label="km-cell-5-3"]').click()
console.log('X: 7-3 → 5-3 (lands on square color → forces O tower of that color)')

for (let i = 1; i <= 4; i++) {
  await page.waitForTimeout(700)
  const { x, o } = await towers()
  const s = await strip()
  const oOff = o.filter(l => !/^km-cell-0-/.test(l))
  const xOff = x.filter(l => !/^km-cell-7-/.test(l))
  console.log(`t${i}: strip="${s}" O-off=${JSON.stringify(oOff)} X-off=${JSON.stringify(xOff)}`)
}
await browser.close()
