// Playtest batch-1 games (Sim, Chomp, Breakthrough, Ataxx, Kamisado) in the
// demo hub at mobile size. Same conventions as playtest-new.mjs:
// Firebase blocked → guest mode, 390x844, screenshots + console errors.
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

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

async function tap(label, tag) {
  await page.locator(`[aria-label="${label}"]`).click()
  await page.waitForTimeout(350)
}

// Select-then-move helper: click source, then enumerate lit targets.
// `ringClass` differs per board (BT/Ataxx targets /60, Kamisado /70).
async function selectAndMove(sourceLabel, ringClass = 'ring-inset ring-retro-cta/60') {
  await tap(sourceLabel)
  await page.waitForTimeout(350)
  const targets = await page.evaluate((rc) =>
    [...document.querySelectorAll('button[aria-label]')]
      .filter(b => (b.getAttribute('class') || '').includes(rc))
      .map(b => b.getAttribute('aria-label'))
      .filter(l => !l.includes('undefined')), ringClass)
  return targets
}

// ─── SIM ─────────────────────────────────────────────────────────────────────
// Single-tap edges until a triangle appears. Ramsey: always ≤15 taps total.
{
  await gotoSolo('sim')
  const g = { taps: [], claims: [] }
  try {
    // Tap up to 8 edges, waiting between taps so React settles; a claimed edge
    // renders disabled, so poll AFTER the wait (never mid-transition).
    for (let i = 0; i < 8; i++) {
      const last = await page.evaluate(() => document.querySelector('.font-pixel.text-\\[8px\\]')?.textContent ?? '')
      if (last.startsWith('LAST:')) g.lastLine = last
      const bodyText = await page.evaluate(() => document.body.innerText)
      if (/TRIANGLE|WINS|LOSE/i.test(bodyText)) {
        g.finished = bodyText.match(/(TRIANGLE[^\n]*|X WINS[^\n]*|O WINS[^\n]*)/i)?.[1]
        break
      }
      const free = await page.evaluate(() =>
        [...document.querySelectorAll('button[aria-label^="edge-"]')]
          .filter(b => !b.disabled).map(b => b.getAttribute('aria-label')))
      if (free.length < 2) { g.done = `only ${free.length} free — board filling up`; break }
      await tap(free[0])
      g.taps.push(free[0])
      await page.waitForTimeout(900) // bot reply
    }
    await shot('sim-1-midgame')
    g.disabledFinal = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="edge-"]')].filter(b => b.disabled).length)
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.sim = g
}

// ─── CHOMP ───────────────────────────────────────────────────────────────────
// Single-tap: bite a square, everything up-right gets eaten. Try to force the
// bot to eat poison — bite (4,1) leaving the L shape; loop a few rounds.
{
  await gotoSolo('chomp')
  const g = { taps: [] }
  try {
    await shot('chomp-1-fresh')
    await tap('chomp-cell-4-1') // classic losing-gift opening for the bot
    g.taps.push('4-1')
    await page.waitForTimeout(900)
    g.eatenAfterRound1 = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="chomp-cell-"]')].filter(b => b.disabled).length)
    await shot('chomp-2-after-bite')
    // Round 2: bite another square if available (bot already replied).
    const free = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="chomp-cell-"]:not([disabled])')]
        .filter(b => !b.getAttribute('aria-label').includes('poison'))
        .map(b => b.getAttribute('aria-label')))
    if (free.length) {
      await tap(free[free.length - 1])
      g.taps.push(free[free.length - 1])
      await page.waitForTimeout(900)
    }
    g.eatenAfterRound2 = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="chomp-cell-"]')].filter(b => b.disabled).length)
    g.poisonStill = (await page.locator('[aria-label="chomp-cell-0-0-poison"]').count()) === 1
      ? (await page.locator('[aria-label="chomp-cell-0-0-poison"]').getAttribute('disabled')) === null
        ? 'alive & enabled' : 'alive & disabled' : 'MISSING'
    await shot('chomp-3-later')
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.chomp = g
}

// ─── BREAKTHROUGH ────────────────────────────────────────────────────────────
// Select a front-rank X pawn (row 6), tap a lit advance/capture target.
{
  await gotoSolo('breakthrough')
  const g = { taps: [] }
  try {
    // Pick pawn at (6,3) — middle of X's top home row.
    await tap('bt-cell-6-3-X')
    g.taps.push('select 6-3')
    await page.waitForTimeout(250)
    const targets = await selectAndMove('bt-cell-6-3-X')
    g.targets = targets
    await shot('breakthrough-1-targets')
    // Prefer a straight advance (6,3)→(5,3): label bt-cell-5-3 (no suffix).
    const advance = targets.find(t => /^bt-cell-5-3$/.test(t))
    const dest = advance ?? targets[0]
    if (dest) {
      await tap(dest)
      g.taps.push(`move ${dest}`)
      await page.waitForTimeout(1000)
    }
    // After the bot's reply, X pawn count should be unchanged or +? Bot moves O.
    g.xPawns = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="bt-cell-"]')]
        .filter(b => b.getAttribute('aria-label').endsWith('-X')).length)
    g.oPawns = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="bt-cell-"]')]
        .filter(b => b.getAttribute('aria-label').endsWith('-O')).length)
    await shot('breakthrough-2-after-bot')
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.breakthrough = g
}

// ─── ATAXX ───────────────────────────────────────────────────────────────────
// X starts bottom-left (7,0), O top-right (0,7). Clone one step; verify the
// clone leaves the origin occupied AND converts adjacent O (none nearby —
// just verify piece count grows 2 → 3 after the round).
{
  await gotoSolo('ataxx')
  const g = { taps: [] }
  try {
    g.piecesBefore = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="ataxx-cell-"]')]
        .filter(b => /-(X|O)$/.test(b.getAttribute('aria-label'))).length)
    await tap('ataxx-cell-6-0-X') // 7×7: X starts bottom-left (6,0)
    g.taps.push('select 6-0')
    await page.waitForTimeout(250)
    const targets = await selectAndMove('ataxx-cell-6-0-X')
    g.targets = targets
    await shot('ataxx-1-targets')
    // Tap (5,0) or (5,1) — a clone target adjacent to start.
    const clone = targets.find(t => /^ataxx-cell-6-[01]$/.test(t)) ?? targets[0]
    await tap(clone)
    g.taps.push(`move ${clone}`)
    await page.waitForTimeout(1100)
    g.piecesAfter = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="ataxx-cell-"]')]
        .filter(b => /-(X|O)$/.test(b.getAttribute('aria-label'))).length)
    await shot('ataxx-2-after-bot')
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.ataxx = g
}

// ─── KAMISADO ────────────────────────────────────────────────────────────────
// X's row-7 tower must march forward. Select a row-7 tower, count ~19 targets,
// move to row 5, wait for the bot (which replies with its color-matched tower).
{
  await gotoSolo('kamisado')
  const g = { taps: [] }
  try {
    await tap('km-cell-7-3-X')
    g.taps.push('select 7-3')
    const targets = await selectAndMove('km-cell-7-3-X', 'ring-inset ring-retro-cta/70')
    g.targetCount = targets.length
    g.targets = targets.slice(0, 6)
    await shot('kamisado-1-targets')
    // Straight-ahead two-square: (5,3).
    const dest = targets.find(t => /^km-cell-5-3$/.test(t)) ?? targets[0]
    await tap(dest)
    g.taps.push(`move ${dest}`)
    await page.waitForTimeout(1200)
    g.xTowers = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="km-cell-"]')]
        .filter(b => b.getAttribute('aria-label').endsWith('-X')).length)
    g.oTowers = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="km-cell-"]')]
        .filter(b => b.getAttribute('aria-label').endsWith('-O')).length)
    // Bot's reply: an O tower should now sit on some row 1–2 square.
    g.botReplyRow = await page.evaluate(() => {
      const o = [...document.querySelectorAll('button[aria-label^="km-cell-"]')]
        .find(b => b.getAttribute('aria-label').endsWith('-O') && /^km-cell-[12]-/.test(b.getAttribute('aria-label')))
      return o ? o.getAttribute('aria-label') : 'no O advanced?'
    })
    await shot('kamisado-2-after-bot')
  } catch (e) { g.error = String(e).slice(0, 300) }
  evidence.games.kamisado = g
}

// ─── MOBILE FEEL: smallest tappable cell per board ─────────────────────────
{
  const measure = async (sel) => page.evaluate((s) => {
    const els = [...document.querySelectorAll(s)]
    if (!els.length) return null
    const rects = els.map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
    return { count: els.length, minW: Math.min(...rects.map(r => r.w)), minH: Math.min(...rects.map(r => r.h)) }
  }, sel)
  // Measure each board while we're already on its page (right after its section).
  // We re-navigate at the end for the two games whose sections ran earlier.
  await gotoSolo('sim')
  evidence.mobileFeel = {}
  evidence.mobileFeel.sim = await measure('button[aria-label^="edge-"]')
  await gotoSolo('chomp')
  evidence.mobileFeel.chomp = await measure('button[aria-label^="chomp-cell-"]')
  await gotoSolo('breakthrough')
  evidence.mobileFeel.breakthrough = await measure('button[aria-label^="bt-cell-"]')
  await gotoSolo('ataxx')
  evidence.mobileFeel.ataxx = await measure('button[aria-label^="ataxx-cell-"]')
  await gotoSolo('kamisado')
  evidence.mobileFeel.kamisado = await measure('button[aria-label^="km-cell-"]')
}

await writeFile('.lavish/gameplay-review/batch1-games.json', JSON.stringify(evidence, null, 2))
await browser.close()
const known = e => /firebase|googleapis|ERR_FAILED/.test(e.err)
console.log('GAMES:', JSON.stringify(evidence.games, null, 2))
console.log('FEEL:', JSON.stringify(evidence.mobileFeel, null, 2))
console.log('unexpected console errors:', errors.filter(e => !known(e)).length)
