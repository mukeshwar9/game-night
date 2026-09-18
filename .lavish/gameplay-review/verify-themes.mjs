// GAMEPLAY-06 not-available card + theme sweep of Hex rails & SOS fade. v2
// Fixes: count SOS scored lines ONLY by their opacity attr (picker icons also
// emit bare svg <line>s), measure rails on the Hex page, scroll boards into
// view before screenshots.
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile } from 'node:fs/promises'

const BASE = 'http://localhost:5179'
const THEMES = ['midnight', 'phosphor', 'amber', 'synthwave', 'grid', 'mono']
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, r => r.abort())
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
const out = { themes: {}, errors }

const scoredLineCount = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('svg line'))
    .filter(l => [0.85, 0.25].includes(parseFloat(l.getAttribute('opacity')))).length
)

const setTheme = (t) => page.evaluate((id) => localStorage.setItem('retro-theme', id), t)
async function solo(type, theme) {
  await page.goto(`${BASE}/solo/${type}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Playtest') })
  if (theme) await setTheme(theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
}
async function scrollToBoard(prefix) {
  await page.evaluate((p) => {
    const el = document.querySelector(`[aria-label^="${p}"]`)
    if (el) el.scrollIntoView({ block: 'center' })
  }, prefix)
  await page.waitForTimeout(250)
}

// ── GAMEPLAY-06: not-available card ──────────────────────────────────────────
await solo('zzz') // unknown type
out.unknownCard = { showsUnknown: /UNKNOWN GAME/i.test(await page.evaluate(() => document.body.innerText)) }
await page.screenshot({ path: '.lavish/gameplay-review/shots/fix3-notavailable.png' })

await solo('known-no-demo-less-type-tictactoe').catch(() => {}) // noop guard
await solo('tictactoe') // valid deep link must still work
out.validSoloStillWorks = { showsDemo: /TTT DEMO/i.test(await page.evaluate(() => document.body.innerText)) }

// ── Theme sweep ──────────────────────────────────────────────────────────────
for (const theme of THEMES) {
  // HEX — ~8 exchanges so both colors + rails visible, then scroll + shot
  await solo('hex', theme)
  for (let i = 0; i < 8; i++) {
    try {
      const cells = page.locator('button[aria-label^="hex-cell"]')
      const n = await cells.count()
      for (let k = 0; k < n; k++) {
        const c = cells.nth((Math.floor(n / 2) + k) % n)
        if (await c.isEnabled() && !(await c.innerText()).trim()) { await c.click(); break }
      }
    } catch {}
    await page.waitForTimeout(900)
  }
  await scrollToBoard('hex-cell')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `.lavish/gameplay-review/shots/fix3-hex-${theme}.png` })
  const hex = await page.evaluate(() => ({
    stones: Array.from(document.querySelectorAll('button[aria-label^="hex-cell"] span[aria-hidden="true"]'))
      .filter(s => /^[XO]$/.test(s.textContent)).length,
    railX: document.querySelectorAll('[aria-hidden="true"].bg-retro-tint-p1').length,
    railO: document.querySelectorAll('[aria-hidden="true"].bg-retro-tint-p2').length,
  }))

  // SOS — play until >6 scored lines (recent tier) + some faded tier
  await solo('sos', theme)
  for (let i = 0; i < 30; i++) {
    const scored = await scoredLineCount()
    if (scored > 10) break
    const t = await page.evaluate(() => document.body.innerText)
    if (/NEXT ROUND|PLAY AGAIN/.test(t)) {
      const again = page.locator('button', { hasText: /PLAY AGAIN/i })
      if (await again.count()) await again.first().click().catch(() => {})
      await page.waitForTimeout(600)
      continue
    }
    try {
      const pickS = page.locator('button[aria-label="pick-letter-S"]')
      if (await pickS.count()) await pickS.click()
      const cells = page.locator('button[aria-label^="sos-cell"]')
      const n = await cells.count()
      for (let k = 0; k < n; k++) {
        const c = cells.nth(k)
        if (await c.isEnabled() && !(await c.innerText()).trim()) { await c.click(); break }
      }
    } catch {}
    await page.waitForTimeout(1100)
  }
  await scrollToBoard('sos-cell')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `.lavish/gameplay-review/shots/fix3-sos-${theme}.png` })
  const sos = await page.evaluate(() => {
    const ls = Array.from(document.querySelectorAll('svg line'))
    return {
      full: ls.filter(l => Math.abs(parseFloat(l.getAttribute('opacity')) - 0.85) < 0.01).length,
      faded: ls.filter(l => Math.abs(parseFloat(l.getAttribute('opacity')) - 0.25) < 0.01).length,
    }
  })
  out.themes[theme] = { hex, sos }
  console.log(theme, JSON.stringify(out.themes[theme]))
}

await writeFile('.lavish/gameplay-review/verify-themes.json', JSON.stringify(out, null, 2))
await browser.close()
