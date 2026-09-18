// Verify P2 readability fixes: Hex rails+glyphs, Gomoku/Checkers glyphs, SOS fade.
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile } from 'node:fs/promises'

const BASE = 'http://localhost:5179'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, r => r.abort())
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
const out = {}

async function solo(type) {
  await page.goto(`${BASE}/solo/${type}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Playtest') })
  await page.waitForTimeout(2200)
}

async function shot(name, cycles, step, doneRe = /NEXT ROUND|PLAY AGAIN|DRAW\b|WINS/i) {
  await solo(name)
  for (let i = 0; i < cycles; i++) {
    try { await step() } catch {}
    await page.waitForTimeout(850)
    const t = await page.evaluate(() => document.body.innerText)
    if (doneRe.test(t) && i > cycles * 0.4) break
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.lavish/gameplay-review/shots/fix2-${name}.png` })
}

// HEX — play ~14 exchanges so both colors show; then scroll board into view
await shot('hex', 14, async () => {
  const cells = page.locator('button[aria-label^="hex-cell"]')
  const n = await cells.count()
  for (let k = 0; k < n; k++) {
    const c = cells.nth((Math.floor(n / 2) + k) % n)
    if (await c.isEnabled() && !(await c.innerText()).trim()) { await c.click(); return }
  }
})

// GOMOKU — ~12 exchanges near center
await shot('gomoku', 12, async () => {
  const cells = page.locator('button[aria-label^="gomoku-cell"]')
  const n = await cells.count()
  for (let k = 0; k < n; k++) {
    const c = cells.nth((Math.floor(n / 2) + k) % n)
    if (await c.isEnabled()) { await c.click(); return }
  }
})

// CHECKERS — select+move loop
await shot('checkers', 8, async () => {
  const cells = page.locator('button[aria-label]')
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    const label = (await c.getAttribute('aria-label')) || ''
    if (/^\d{2} /.test(label) && await c.isEnabled()) { await c.click().catch(() => {}); await page.waitForTimeout(250); break }
  }
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    const label = (await c.getAttribute('aria-label')) || ''
    if (/^\d{2} /.test(label) && await c.isEnabled()) { await c.click().catch(() => {}); return }
  }
}, /NEXT ROUND|PLAY AGAIN|DRAW|WIN|LOSE/i)

// SOS — play long enough to accrue many lines, then verify fade present
await shot('sos', 45, async () => {
  const pick = page.locator('button[aria-label^="pick-letter"]')
  if (await pick.count()) await pick.nth(Math.floor(Math.random() * 2)).click()
  const cells = page.locator('button[aria-label^="sos-cell"]')
  const n = await cells.count()
  for (let k = 0; k < n; k++) {
    const c = cells.nth((Math.floor(n / 2) + k) % n)
    if (await c.isEnabled() && !(await c.innerText()).trim()) { await c.click(); return }
  }
}, /NEXT ROUND|PLAY AGAIN|DRAW\b/)

// SOS DOM check: count svg lines at the two opacity levels
await solo('sos')
const sosOpacity = await page.evaluate(() => {
  const lines = Array.from(document.querySelectorAll('svg line'))
  const full = lines.filter(l => Math.abs(parseFloat(l.getAttribute('opacity')) - 0.85) < 0.01).length
  const faded = lines.filter(l => Math.abs(parseFloat(l.getAttribute('opacity')) - 0.25) < 0.01).length
  return { total: lines.length, full, faded }
})
out.sosOpacity = sosOpacity
out.errors = errors
await writeFile('.lavish/gameplay-review/verify-p2.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
