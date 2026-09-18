// Verify GAMEPLAY-01 fix: /solo/tictactoe4, /solo/connectfour5, /solo/dice-big
// each render their OWN game (not the fallback), then play a few moves.
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile } from 'node:fs/promises'

const BASE = 'http://localhost:5179'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, route => route.abort())
const page = await context.newPage()
const results = {}

async function solo(type) {
  await page.goto(`${BASE}/solo/${type}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Playtest') })
  await page.waitForTimeout(2200)
}

async function playFew(type, step, wantTitle) {
  await solo(type)
  const title = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('p')).find(p => /DEMO/.test(p.innerText))
    return h ? h.innerText.trim() : ''
  })
  // play up to 6 exchanges
  for (let i = 0; i < 6; i++) {
    try { await step() } catch {}
    await page.waitForTimeout(850)
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.lavish/gameplay-review/shots/fix-${type}.png` })
  const boardInfo = await page.evaluate(() => {
    const grids = Array.from(document.querySelectorAll('[style*="grid-template-columns"]'))
    const g = grids.sort((a, b) => b.querySelectorAll('button').length - a.querySelectorAll('button').length)[0]
    return g ? { cells: g.querySelectorAll('button').length, cols: g.style.gridTemplateColumns.split(' ').length } : null
  })
  results[type] = { title, boardInfo }
}

// tictactoe4: 16 cells
await playFew('tictactoe4', async () => {
  const cells = page.locator('button[aria-label*="column"]')
  const n = await cells.count()
  for (let k = 0; k < n; k++) {
    const c = cells.nth(k)
    if (await c.isEnabled() && /empty/.test(await c.getAttribute('aria-label') || '')) { await c.click(); return }
  }
}, 'TTT 4×4 DEMO')

// connectfour5: 63-cell board, 9 cols
await playFew('connectfive', async () => {}, '') // placeholder no-op (replaced below)

results.connectfour5 = {}
await solo('connectfour5')
{
  const title = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('p')).find(p => /DEMO/.test(p.innerText))
    return h ? h.innerText.trim() : ''
  })
  for (let i = 0; i < 6; i++) {
    try {
      const drops = page.locator('button[aria-label*="rop"]')
      const n = await drops.count()
      if (n) await drops.nth(Math.floor(Math.random() * n)).click()
    } catch {}
    await page.waitForTimeout(850)
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: '.lavish/gameplay-review/shots/fix-connectfour5.png' })
  const boardInfo = await page.evaluate(() => {
    const grids = Array.from(document.querySelectorAll('[style*="grid-template-columns"]'))
    const g = grids.sort((a, b) => b.querySelectorAll('button').length - a.querySelectorAll('button').length)[0]
    return g ? { cells: g.querySelectorAll('button').length, cols: g.style.gridTemplateColumns.split(' ').length } : null
  })
  results.connectfour5 = { title, boardInfo }
}

// dice-big: roll twice, bank once
await solo('dice-big')
{
  const title = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('p')).find(p => /DEMO/.test(p.innerText))
    return h ? h.innerText.trim() : ''
  })
  for (let i = 0; i < 6; i++) {
    try {
      const roll = page.locator('button[aria-label^="Roll the dice"]')
      const bank = page.locator('button[aria-label^="Bank"]')
      const t = await page.evaluate(() => document.body.innerText)
      const m = t.match(/(\d+)\s*\/\s*100/)
      if (parseInt(m?.[1] ?? '0', 10) >= 16 && await bank.count()) await bank.first().click()
      else if (await roll.count()) await roll.first().click()
    } catch {}
    await page.waitForTimeout(900)
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: '.lavish/gameplay-review/shots/fix-dice-big.png' })
  const twoDice = await page.evaluate(() => document.body.innerText.includes('/ 100') || document.body.innerText.includes('PIG BIG'))
  results['dice-big'] = { title, twoDice }
}

await writeFile('.lavish/gameplay-review/verify-fixes.json', JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
await browser.close()
