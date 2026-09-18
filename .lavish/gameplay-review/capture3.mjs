// Re-runs: tictactoe4 (robust cell select) + battleship (full place → battle flow)
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile, readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:5179'
mkdirSync('.lavish/gameplay-review/shots', { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, route => route.abort())
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push({ page: page.url(), err: String(e).slice(0, 300) }))

let evidence = {}
try { evidence = JSON.parse(await readFile('.lavish/gameplay-review/evidence.json', 'utf8')) } catch {}
evidence.consoleErrors = (evidence.consoleErrors || []).concat(errors)

async function gotoSolo(type) {
  await page.goto(`${BASE}/solo/${type}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Playtest') })
  await page.waitForURL(`**/solo/${type}**`, { timeout: 15000 }).catch(() => {})
  await page.goto(`${BASE}/solo/${type}`, { waitUntil: 'load' }).catch(() => {})
  await page.waitForSelector('button', { timeout: 15000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => document.body.innerText)
}
const txt = () => page.evaluate(() => document.body.innerText)

// ── tictactoe4 ───────────────────────────────────────────────────────────────
await gotoSolo('tictactoe4')
let last = ''
for (let i = 0; i < 30; i++) {
  const cells = page.locator('button[aria-label*="column"]')
  const n = await cells.count()
  let clicked = false
  for (let k = 0; k < n; k++) {
    const c = cells.nth(k)
    if (await c.isEnabled() && /empty/.test(await c.getAttribute('aria-label') || '')) { await c.click(); clicked = true; break }
  }
  if (!clicked) break
  await page.waitForTimeout(850)
  last = await txt()
  if (/NEXT ROUND|PLAY AGAIN|DRAW\b/i.test(last)) break
}
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(500)
await page.screenshot({ path: '.lavish/gameplay-review/shots/solo-tictactoe4.png' })
evidence.games.tictactoe4 = { endText: last.split('\n').filter(l => l.trim()).slice(0, 14).join(' | ') }
await writeFile('.lavish/gameplay-review/evidence.json', JSON.stringify(evidence, null, 2))

// ── battleship ──────────────────────────────────────────────────────────────
await gotoSolo('battleship')
last = ''
for (let i = 0; i < 60; i++) {
  const t = await txt()
  if (/PLACE|PLACING|FLEET|ROTATE/i.test(t)) {
    // place each ship: AUTO/RANDOM then READY/START if enabled
    const auto = page.getByRole('button', { name: /AUTO|RANDOM/i }).first()
    if (await auto.count()) { await auto.click().catch(() => {}); await page.waitForTimeout(350) }
    const ready = page.getByRole('button', { name: /READY|START|BATTLE|TO BATTLE/i }).first()
    if (await ready.count()) {
      const enabled = await ready.isEnabled()
      if (enabled) { await ready.click().catch(() => {}); await page.waitForTimeout(500); continue }
    }
    await page.waitForTimeout(600)
    continue
  }
  // battle: click first enabled grid cell (A1-style labels)
  const cells = page.locator('button[aria-label]')
  const n = await cells.count()
  let fired = false
  for (let k = 0; k < n; k++) {
    const c = cells.nth(k)
    const label = (await c.getAttribute('aria-label')) || ''
    if (/^[A-J](10|[1-9])$/.test(label) && await c.isEnabled()) { await c.click().catch(() => {}); fired = true; break }
  }
  await page.waitForTimeout(800)
  last = await txt()
  if (/WIN|LOSE|Sunk|SUNK all|FLEET DESTROYED|PLAY AGAIN/i.test(last)) break
  if (!fired && i > 8) break
}
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(500)
await page.screenshot({ path: '.lavish/gameplay-review/shots/solo-battleship.png' })
evidence.games.battleship = { endText: last.split('\n').filter(l => l.trim()).slice(0, 14).join(' | ') }
await writeFile('.lavish/gameplay-review/evidence.json', JSON.stringify(evidence, null, 2))

console.log(JSON.stringify({ tictactoe4: evidence.games.tictactoe4, battleship: evidence.games.battleship, errors }, null, 2))
await browser.close()
