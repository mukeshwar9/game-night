// SOS fade retest — deterministic: always S, strictly sequential empty cells.
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile } from 'node:fs/promises'

const BASE = 'http://localhost:5179'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, r => r.abort())
const page = await context.newPage()

await page.goto(`${BASE}/solo/sos`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Playtest') })
await page.waitForTimeout(2200)

for (let i = 0; i < 30; i++) {
  const done = await page.evaluate(() => /NEXT ROUND|PLAY AGAIN|DRAW\b/.test(document.body.innerText))
  if (done) break
  try {
    // arm S explicitly
    const pickS = page.locator('button[aria-label="pick-letter-S"]')
    if (await pickS.count()) await pickS.click()
    // click first empty cell in row-major order
    const cells = page.locator('button[aria-label^="sos-cell"]')
    const n = await cells.count()
    for (let k = 0; k < n; k++) {
      const c = cells.nth(k)
      if (await c.isEnabled() && !(await c.innerText()).trim()) { await c.click(); break }
    }
  } catch {}
  await page.waitForTimeout(1100)
}
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)
await page.screenshot({ path: '.lavish/gameplay-review/shots/fix2-sos.png' })
const out = await page.evaluate(() => {
  const ls = Array.from(document.querySelectorAll('svg line'))
  const full = ls.filter(l => Math.abs(parseFloat(l.getAttribute('opacity')) - 0.85) < 0.01).length
  const faded = ls.filter(l => Math.abs(parseFloat(l.getAttribute('opacity')) - 0.25) < 0.01).length
  const counts = document.body.innerText.match(/X (\d+)[\s\S]{0,40}?(\d+) O/)
  return { total: ls.length, full, faded, xScore: counts?.[1], oScore: counts?.[2] }
})
await writeFile('.lavish/gameplay-review/verify-sos.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
