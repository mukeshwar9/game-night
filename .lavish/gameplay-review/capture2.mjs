// Gameplay playtest runner v2 — incremental evidence, per-game CLI selection.
// Usage: node capture2.mjs dice mancala ...
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile, readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'

const PORT = process.env.PORT || '5179'
const BASE = `http://localhost:${PORT}`
mkdirSync('.lavish/gameplay-review/shots', { recursive: true })

const only = process.argv.slice(2)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  serviceWorkers: 'block',
})
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, route => route.abort())
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push({ page: page.url(), err: String(e).slice(0, 300) }))
page.on('console', m => { if (m.type() === 'error') errors.push({ page: page.url(), err: m.text().slice(0, 200) }) })

let evidence = { base: BASE, viewport: '390x844', captures: [], games: {}, consoleErrors: [] }
try { evidence = JSON.parse(await readFile('.lavish/gameplay-review/evidence.json', 'utf8')) } catch {}
evidence.consoleErrors = errors

async function saveEvidence() {
  await writeFile('.lavish/gameplay-review/evidence.json', JSON.stringify(evidence, null, 2))
}

async function shot(name) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `.lavish/gameplay-review/shots/${name}.png` })
  const hit = evidence.captures.find(c => c.name === name)
  const rec = { name, url: page.url(), scrollH: await page.evaluate(() => document.documentElement.scrollHeight) }
  if (hit) Object.assign(hit, rec)
  else evidence.captures.push(rec)
}

async function gotoSolo(type) {
  await page.goto(`${BASE}/solo/${type}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.setItem('onboarded', '1')
    localStorage.setItem('playerName', 'Playtest')
  })
  await page.goto(`${BASE}/solo/${type}`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2000)
}

const txt = () => page.evaluate(() => document.body.innerText)

async function drive(type, step, { cycles = 30, settle = 800 } = {}) {
  await gotoSolo(type)
  let last = ''
  for (let i = 0; i < cycles; i++) {
    try { await step(page) } catch {}
    await page.waitForTimeout(settle)
    last = await txt()
    if (/NEXT ROUND|PLAY AGAIN|YOU WIN|YOU LOSE|MATCH:|DRAW\b/i.test(last)) break
  }
  await shot(`solo-${type}`)
  evidence.games[type] = { endText: last.split('\n').filter(l => l.trim()).slice(0, 14).join(' | ') }
  await saveEvidence()
}

// first empty "…, empty" aria-labelled cell
async function clickFirstEmpty(sel) {
  const cells = page.locator(sel)
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    if (await c.isEnabled() && /empty/.test(await c.getAttribute('aria-label') || '')) { await c.click(); return true }
  }
  return false
}

const GAMES = {
  // re-run candidates + the four that never ran
  tictactoe:  { fn: () => drive('tictactoe', async () => { await clickFirstEmpty('main button, body button') }) },
  tictactoe4: { fn: () => drive('tictactoe4', async () => { await clickFirstEmpty('button[aria-label*="column"]') }) },
  dice: {
    fn: () => drive('dice', async () => {
      const roll = page.locator('button[aria-label^="Roll the dice"]')
      const bank = page.locator('button[aria-label^="Bank"]')
      const t = await txt()
      const m = t.match(/TURN\s*POT[^\d]*(\d+)/i) || t.match(/(\d+)\s*\/\s*100/)
      const turnScore = parseInt(m?.[1] ?? '0', 10)
      if (turnScore >= 16 && await bank.count()) await bank.first().click()
      else if (await roll.count()) await roll.first().click()
    }, { cycles: 45 }),
  },
  mancala: {
    fn: () => drive('mancala', async () => {
      const pits = page.locator('button[aria-label^="pit "]')
      const n = await pits.count()
      for (let i = 0; i < n; i++) {
        const p = pits.nth(i)
        if (await p.isEnabled()) { await p.click().catch(() => {}); return }
      }
    }, { cycles: 40 }),
  },
  checkers: {
    fn: () => drive('checkers', async () => {
      const cells = page.locator('button[aria-label]')
      const n = await cells.count()
      // first pass: pick a piece cell (label like "0123" digits = r c + state)
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
    }, { cycles: 30 }),
  },
  battleship: {
    fn: () => drive('battleship', async () => {
      const t = await txt()
      if (/PLACE|PLACING|FLEET/i.test(t)) {
        const auto = page.getByRole('button', { name: /AUTO|RANDOM/i }).first()
        if (await auto.count()) { await auto.click().catch(() => {}); await page.waitForTimeout(250) }
        const ready = page.getByRole('button', { name: /READY|START|BATTLE/i }).first()
        if (await ready.count() && await ready.isEnabled()) { await ready.click().catch(() => {}); return }
      }
      const cells = page.locator('button[aria-label$="1"], button[aria-label$="2"], button[aria-label$="3"], button[aria-label$="4"], button[aria-label$="5"], button[aria-label$="6"], button[aria-label$="7"], button[aria-label$="8"], button[aria-label$="9"], button[aria-label$="0"]')
      const n = await cells.count()
      for (let i = 0; i < n; i++) {
        const c = cells.nth(i)
        if (await c.isEnabled()) { await c.click().catch(() => {}); return }
      }
    }, { cycles: 55 }),
  },
}

for (const [name, g] of Object.entries(GAMES)) {
  if (only.length && !only.includes(name)) continue
  try { await g.fn() } catch (e) { evidence.games[name] = { error: String(e).slice(0, 300) }; await saveEvidence() }
}

console.log(JSON.stringify(evidence.games, null, 2))
await browser.close()
