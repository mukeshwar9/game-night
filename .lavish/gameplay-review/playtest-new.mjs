// Playtest the five new games in the demo hub (vs bot) at mobile size.
// Reuses the gameplay-review capture conventions: Firebase blocked,
// 390x844 viewport, screenshots + console errors collected.
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
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
  await page.waitForTimeout(500)
  await page.screenshot({ path: `.lavish/gameplay-review/shots/${name}.png` })
  evidence.captures.push({ name, url: page.url() })
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

// Tap a cell on an n×n board by its aria-label.
async function tapCell(label) {
  const el = page.locator(`[aria-label="${label}"]`)
  await el.click({ force: true })
  await page.waitForTimeout(350)
}

async function tapText(text) {
  await page.locator(`button:has-text("${text}")`).first().click({ force: true })
  await page.waitForTimeout(350)
}

// ─── ONITAMA ─────────────────────────────────────────────────────────────────
{
  await gotoSolo('onitama')
  const g = { taps: [] }
  try {
    // Mover's hand is the two bottom card buttons.
    const cardButtons = page.locator('button[aria-label^="onitama-card-"]')
    g.handCards = await cardButtons.evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
    // Pick the first card.
    await cardButtons.first().click({ force: true })
    await page.waitForTimeout(400)
    g.afterCardPick = { litTargets: await page.locator('button[aria-label^="on-cell-"].ring-2').count() }
    await shot('onitama-1-card-picked')
    // Tap a lit target (cta ring on cells).
    const lit = page.locator('button[aria-label^="on-cell-"]')
    const n = await lit.count()
    let moved = false
    for (let i = 0; i < n && !moved; i++) {
      const cls = await lit.nth(i).getAttribute('class')
      if (cls.includes('ring-retro-cta')) {
        await lit.nth(i).click({ force: true })
        moved = true
        g.taps.push(`cell#${i}`)
      }
    }
    await page.waitForTimeout(600)
    g.moveAccepted = moved
    // Did the turn flip to O (bot moved back)? Wait then check board changed.
    await page.waitForTimeout(1200)
    await shot('onitama-2-after-move-and-bot')
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.onitama = g
}

// ─── QUARTO ──────────────────────────────────────────────────────────────────
{
  await gotoSolo('quarto')
  const g = { taps: [] }
  try {
    // Stage 1: tap an empty cell.
    await tapCell('qrt-cell-5')
    g.taps.push('cell5')
    await page.waitForTimeout(300)
    g.cellSelected = (await page.locator('button[aria-label="qrt-cell-5"]').getAttribute('class')).includes('ring-retro-cta')
    await shot('quarto-1-cell-selected')
    // Stage 2: tap a shelf piece (enabled buttons in the shelf row).
    const shelf = page.locator('button[aria-label^="qrt-give-"]:not([disabled])')
    g.shelfEnabled = await shelf.count()
    await shelf.first().click({ force: true })
    await page.waitForTimeout(800)
    await shot('quarto-2-placed-and-given')
    // Bot should have placed too — count cells whose label grew a piece suffix.
    g.filledAfterRound = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="qrt-cell-"]')]
        .filter(b => /^qrt-cell-\d+-/.test(b.getAttribute('aria-label'))).length)
    g.cell5Label = await page.locator('button[aria-label^="qrt-cell-5"]').getAttribute('aria-label')
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.quarto = g
}

// ─── SANTORINI ───────────────────────────────────────────────────────────────
{
  await gotoSolo('santorini')
  const g = { taps: [] }
  try {
    // Stage strip says TAP A WORKER. X workers start at 20 (r4,c0) and 24 (r4,c4).
    await tapCell('st-cell-4-0-h0')
    g.taps.push('worker 20')
    await page.waitForTimeout(300)
    g.stageAfterWorker = await page.locator('span.font-pixel.text-\\[8px\\]').first().textContent()
    await shot('santorini-1-worker-picked')
    // Move up one: 15 (r3,c0).
    await tapCell('st-cell-3-0-h0')
    g.taps.push('move 15')
    await page.waitForTimeout(300)
    g.stageAfterMove = await page.locator('span.font-pixel.text-\\[8px\\]').first().textContent()
    await shot('santorini-2-moved-build-stage')
    // Build somewhere adjacent to 15: 10 (r2,c0).
    await tapCell('st-cell-2-0-h0')
    g.taps.push('build 10')
    await page.waitForTimeout(250)
    g.height10AfterMyBuild = await page.locator('[aria-label^="st-cell-2-0"]').getAttribute('aria-label')
    await page.waitForTimeout(1000)
    await shot('santorini-3-built-bot-moved')
    g.height10 = await page.locator('[aria-label^="st-cell-2-0"]').getAttribute('aria-label')
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.santorini = g
}

// ─── LINES OF ACTION ─────────────────────────────────────────────────────────
{
  await gotoSolo('loa')
  const g = { taps: [] }
  try {
    // X piece at 48 (row 6, col 0) per the opening analysis.
    await tapCell('loa-cell-6-0-X')
    g.taps.push('piece 6-0')
    await page.waitForTimeout(300)
    g.targetsLit = await page.locator('button[aria-label^="loa-cell-"]').evaluateAll(
      els => els.filter(e => e.getAttribute('class').includes('ring-inset ring-retro-cta/60')).length)
    g.capturesLit = await page.locator('button[aria-label^="loa-cell-"]').evaluateAll(
      els => els.filter(e => e.getAttribute('class').includes('ring-retro-p2/80')).length)
    await shot('loa-1-piece-selected')
    // Capture target count → move to 0 (r0,c0, up the column).
    await tapCell('loa-cell-0-0')
    g.taps.push('move 0-0')
    await page.waitForTimeout(1000)
    await shot('loa-2-moved-bot-replied')
    // X piece should now sit at (0,0) — label gains the -X suffix.
    g.pieceAtDest = await page.evaluate(() => {
      const b = document.querySelector('[aria-label="loa-cell-0-0-X"]')
      return b ? 'X piece present' : 'NOT PRESENT'
    })
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.loa = g
}

// ─── YAVALATH ────────────────────────────────────────────────────────────────
{
  await gotoSolo('yavalath')
  const g = { taps: [] }
  try {
    g.suicideHintsBefore = await page.locator('button[aria-label^="yv-hex-"]').evaluateAll(
      els => els.filter(e => e.textContent.trim() === '3!').length)
    await tapCell('yv-hex-4-4') // center
    g.taps.push('center')
    await page.waitForTimeout(900)
    await shot('yavalath-1-center-played-bot-reply')
    g.filledAfterRound = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="yv-hex-"]')]
        .filter(b => b.textContent.trim() !== '').length)
    g.suicideHintsAfter = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="yv-hex-"]')]
        .filter(b => b.textContent.trim() === '3!').length)
    await shot('yavalath-2-hints')
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.yavalath = g
}

// ─── MOBILE FEEL: smallest tappable cell per board ─────────────────────────
{
  await gotoSolo('onitama')
  const feel = {}
  const measure = async (sel) => page.evaluate((s) => {
    const els = [...document.querySelectorAll(s)]
    if (!els.length) return null
    const rects = els.map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
    return { count: els.length, minW: Math.min(...rects.map(r => r.w)), minH: Math.min(...rects.map(r => r.h)) }
  }, sel)
  feel.onitama = await measure('button[aria-label^="on-cell-"]')
  feel.quarto = await measure('button[aria-label^="qrt-cell-"]')
  feel.santorini = await measure('button[aria-label^="st-cell-"]')
  await gotoSolo('loa')
  feel.loa = await measure('button[aria-label^="loa-cell-"]')
  await gotoSolo('yavalath')
  feel.yavalath = await measure('button[aria-label^="yv-hex-"]')
  evidence.mobileFeel = feel
}

await browser.close()
import { writeFile as _wf } from 'node:fs/promises'
await _wf('.lavish/gameplay-review/new-games.json', JSON.stringify(evidence, null, 2))
const known = e => /firebase|googleapis|ERR_FAILED/.test(e.err)
console.log('GAMES:', JSON.stringify(evidence.games, null, 2))
console.log('unexpected console errors:', errors.filter(e => !known(e)).length)
