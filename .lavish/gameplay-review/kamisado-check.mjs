// Kamisado-only check: did the bot actually reply after my move?
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

const oTowers = () => page.evaluate(() =>
  [...document.querySelectorAll('button[aria-label^="km-cell-"]')]
    .filter(b => b.getAttribute('aria-label').endsWith('-O'))
    .map(b => b.getAttribute('aria-label')))
const stripText = () => page.evaluate(() =>
  [...document.querySelectorAll('.font-pixel')]
    .map(s => s.textContent).find(t => /ANY TOWER|MUST MOVE/.test(t)) ?? '(strip not found)')

console.log('initial O towers:', JSON.stringify(await oTowers()))
console.log('strip:', await stripText())

await page.locator('[aria-label="km-cell-7-3-X"]').click()
await page.waitForTimeout(400)
await page.locator('[aria-label="km-cell-5-3"]').click()
console.log('moved 7-3 → 5-3')

for (const ms of [500, 1000, 1500, 2000]) {
  await page.waitForTimeout(ms)
  const towers = await oTowers()
  const offHome = towers.filter(l => !/^km-cell-0-/.test(l))
  console.log(`+${ms}ms: O towers off home row = ${offHome.length}`, JSON.stringify(offHome))
  if (offHome.length) break
}
console.log('strip after move:', await stripText())
await browser.close()
