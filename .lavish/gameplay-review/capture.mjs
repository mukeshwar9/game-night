// Gameplay playtest: play each board game vs its demo bot, screenshot, record state.
// Firebase blocked to keep the session in local-guest mode (no rooms/profiles written).
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'

const PORT = process.env.PORT || '5179'
const BASE = `http://localhost:${PORT}`
mkdirSync('.lavish/gameplay-review/shots', { recursive: true })

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

const evidence = { base: BASE, viewport: '390x844', captures: [], games: {}, consoleErrors: errors }

async function shot(name) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `.lavish/gameplay-review/shots/${name}.png` })
  evidence.captures.push({ name, url: page.url(), scrollH: await page.evaluate(() => document.documentElement.scrollHeight) })
}

async function gotoSolo(type) {
  await page.goto(`${BASE}/solo/${type}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.setItem('onboarded', '1')
    localStorage.setItem('playerName', 'Playtest')
  })
  await page.goto(`${BASE}/solo/${type}`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2200)
}

const txt = () => page.evaluate(() => document.body.innerText)

// Drive a game: run the click loop each cycle; stop when the page shows an end state.
async function drive(type, step, { cycles = 60, settle = 950 } = {}) {
  await gotoSolo(type)
  let last = ''
  for (let i = 0; i < cycles; i++) {
    try { await step(page) } catch { /* click became stale — fine */ }
    await page.waitForTimeout(settle)
    last = await txt()
    if (/NEXT ROUND|PLAY AGAIN|YOU WIN|YOU LOSE|MATCH:|DRAWS|DRAW\b/i.test(last)) break
  }
  await shot(`solo-${type}`)
  evidence.games[type] = {
    endText: last.split('\n').filter(l => l.trim()).slice(0, 14).join(' | '),
  }
  return last
}

// Generic BotBoardDemo cell clicker: click first clickable empty cell on an
// aria-labelled grid (used by tictactoe/tictactoe4 variants, gomoku, hex).
async function clickFirstEmpty(sel) {
  const cells = page.locator(sel)
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    if (await c.isEnabled() && /empty/.test(await c.getAttribute('aria-label') || '')) { await c.click(); return true }
  }
  return false
}

// ─── 1. TIC TAC TOE (3×3 and 4×4 share the Cell pattern) ─────────────────────
await drive('tictactoe', async () => { await clickFirstEmpty('main button, body button') })
await drive('tictactoe4', async () => { await clickFirstEmpty('button[aria-label*="column"]') })

// ─── 2. ULTIMATE TTT ─────────────────────────────────────────────────────────
await drive('ultimatettt', async () => {
  const cells = page.locator('button[aria-label^="Board "]')
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    if (await c.isEnabled() && /empty/.test(await c.getAttribute('aria-label') || '')) { await c.click(); return }
  }
})

// ─── 3. CONNECT FOUR (+5 / POP) — click top-of-column drop buttons ──────────
async function cfDrop() {
  // Drop zones: buttons whose aria-label contains 'column' and 'drop'
  const drops = page.locator('button[aria-label*="rop"]')
  const n = await drops.count()
  const idx = Math.floor(Math.random() * Math.max(n, 1))
  if (n > 0) await drops.nth(Math.min(idx, n - 1)).click()
}
await drive('connectfour', cfDrop)
await drive('connectfour5', cfDrop)
await drive('connectfourpop', async () => { await cfDrop() })

// ─── 4. GOMOKU / HEX ─────────────────────────────────────────────────────────
await drive('gomoku', async () => {
  const cells = page.locator('button[aria-label^="gomoku-cell"]')
  // prefer center area for a saner game
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    if (await c.isEnabled()) { await c.click(); return }
  }
})
await drive('hex', async () => {
  const cells = page.locator('button[aria-label^="hex-cell"]')
  const n = await cells.count()
  const start = Math.floor(n / 2) - 6
  for (let k = 0; k < n; k++) {
    const c = cells.nth(((start + k) % n + n) % n)
    if (await c.isEnabled() && !(await c.innerText()).trim()) { await c.click(); return }
  }
})

// ─── 5. REVERSI — legal moves only; board marks them ─────────────────────────
await drive('reversi', async () => {
  const cells = page.locator('button[aria-label^="reversi-cell"]')
  const n = await cells.count()
  const enabled = []
  for (let i = 0; i < n; i++) if (await cells.nth(i).isEnabled()) enabled.push(i)
  if (enabled.length) await cells.nth(enabled[Math.floor(Math.random() * enabled.length)]).click()
})

// ─── 6. ORDER & CHAOS — arm a letter then click a cell ──────────────────────
await drive('orderchaos', async () => {
  const pick = page.locator('button[aria-label^="pick-letter"]')
  if (await pick.count()) await pick.nth(Math.floor(Math.random() * 2)).click()
  const cells = page.locator('button[aria-label^="oc-cell"]')
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    if (await c.isEnabled() && !(await c.innerText()).trim()) { await c.click(); return }
  }
})

// ─── 7. SOS — arm letter, click cell ────────────────────────────────────────
await drive('sos', async () => {
  const pick = page.locator('button[aria-label^="pick-letter"]')
  if (await pick.count()) await pick.nth(Math.floor(Math.random() * 2)).click()
  const cells = page.locator('button[aria-label^="sos-cell"]')
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    if (await c.isEnabled() && !(await c.innerText()).trim()) { await c.click(); return }
  }
})

// ─── 8. DOTS & BOXES (6×6 + 4×4) — click a safe-looking edge ────────────────
async function dbStep() {
  const edges = page.locator('button[aria-label^="edge-"]')
  const n = await edges.count()
  for (let i = 0; i < n; i++) {
    const e = edges.nth(i)
    if (await e.isEnabled()) { await e.click(); return }
  }
}
await drive('dotsandboxes', dbStep, { cycles: 80 })
await drive('dotsandboxes4', dbStep, { cycles: 60 })

// ─── 9. CHAIN REACTION (both sizes) ─────────────────────────────────────────
async function crStep() {
  const cells = page.locator('button[aria-label^="cr-cell"]')
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    if (await c.isEnabled()) { await c.click(); return }
  }
}
await drive('chainreaction', crStep, { cycles: 80 })
await drive('chainreaction6', crStep, { cycles: 60 })

// ─── 10. BLOCKADE — pawn mode default; click own pawn then a forward cell ───
await drive('blockade', async () => {
  // ensure pawn mode
  const pawnMode = page.locator('button[aria-label^="mode-"]').first()
  if (await pawnMode.count()) { /* leave as default */ }
  const cells = page.locator('button[aria-label^="blockade-cell"]')
  const n = await cells.count()
  // Click X's pawn (bottom rows) then any enabled cell
  const pawn = page.locator('button[aria-label="blockade-cell-8-4"], button[aria-label="blockade-cell-7-4"], button[aria-label="blockade-cell-8-3"], button[aria-label="blockade-cell-7-3"]').first()
  if (await pawn.count()) { await pawn.click().catch(() => {}); await page.waitForTimeout(250) }
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    if (await c.isEnabled()) { await c.click().catch(() => {}); return }
  }
}, { cycles: 50 })

// ─── 11. PAIRS — flip two cards per turn ────────────────────────────────────
await drive('pairs', async () => {
  const cards = page.locator('button[type="button"]')
  const n = await cards.count()
  let flipped = 0
  for (let i = 0; i < n && flipped < 2; i++) {
    const c = cards.nth(i)
    const label = (await c.getAttribute('aria-label')) || ''
    if (/card|pair/i.test(label) && await c.isEnabled()) { await c.click(); flipped++; await page.waitForTimeout(400) }
  }
}, { cycles: 70 })

// ─── 12. DICE (PIG) — roll until 16+, bank ──────────────────────────────────
await drive('dice', async () => {
  const roll = page.locator('button[aria-label^="Roll the dice"]')
  const bank = page.locator('button[aria-label^="Bank"]')
  const t = await txt()
  const turnScore = parseInt((t.match(/(\d+)\s*\/\s*100/) || [])[1] ?? '0', 10)
  if (turnScore >= 16 && await bank.count()) await bank.first().click()
  else if (await roll.count()) await roll.first().click()
}, { cycles: 70 })

// ─── 13. MANCALA — click an own pit with seeds (side buttons) ────────────────
await drive('mancala', async () => {
  const pits = page.locator('button[aria-label^="pit "]')
  const n = await pits.count()
  for (let i = 0; i < n; i++) {
    const p = pits.nth(i)
    if (await p.isEnabled() && !(await p.getAttribute('aria-label')).match(/store/i)) { await p.click().catch(() => {}); return }
  }
}, { cycles: 60 })

// ─── 14. CHECKERS — select a movable piece, then a target ───────────────────
await drive('checkers', async () => {
  const cells = page.locator('button[aria-label^="0"], button[aria-label^="1"], button[aria-label^="2"]')
  const all = page.locator('main button:visible, body button:visible')
  // Try: click an enabled cell that has a piece, then an enabled empty cell
  const n = await all.count()
  for (let i = 0; i < n; i++) {
    const c = all.nth(i)
    const label = (await c.getAttribute('aria-label')) || ''
    if (/^\d/.test(label) && await c.isEnabled()) { await c.click().catch(() => {}); await page.waitForTimeout(200); break }
  }
  for (let i = 0; i < n; i++) {
    const c = all.nth(i)
    const label = (await c.getAttribute('aria-label')) || ''
    if (/^\d/.test(label) && await c.isEnabled()) { await c.click().catch(() => {}); return }
  }
}, { cycles: 40 })

// ─── 15. BATTLESHIP — place fleet via AUTO, then fire at bot grid ───────────
await drive('battleship', async () => {
  const t = await txt()
  if (/PLACING|PLACE|AUTO/i.test(t)) {
    const auto = page.getByRole('button', { name: /AUTO|RANDOM/i }).first()
    if (await auto.count()) { await auto.click().catch(() => {}); await page.waitForTimeout(300) }
    const ready = page.getByRole('button', { name: /READY|START|BATTLE/i }).first()
    if (await ready.count() && await ready.isEnabled()) { await ready.click().catch(() => {}); return }
  }
  // battle: fire at first enabled enemy cell (aria-label like A1..J10)
  const cells = page.locator('button[aria-label^="B"], button[aria-label^="A"], button[aria-label^="C"], button[aria-label^="D"], button[aria-label^="E"], button[aria-label^="F"], button[aria-label^="G"], button[aria-label^="H"], button[aria-label^="J"]')
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i)
    if (await c.isEnabled()) { await c.click().catch(() => {}); return }
  }
}, { cycles: 90 })

console.log(JSON.stringify(evidence, null, 2))
await writeFile('.lavish/gameplay-review/evidence.json', JSON.stringify(evidence, null, 2))
await browser.close()
