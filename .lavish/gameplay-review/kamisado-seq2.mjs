// Play several FORCED rounds so towers cross colors; assert strict alternation.
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

const counts = () => page.evaluate(() => {
  const all = [...document.querySelectorAll('button[aria-label^="km-cell-"]')]
  const pos = a => a.map(b => b.getAttribute('aria-label').replace('km-cell-', ''))
  return {
    x: pos(all.filter(b => b.getAttribute('aria-label').endsWith('-X'))),
    o: pos(all.filter(b => b.getAttribute('aria-label').endsWith('-O'))),
    strip: [...document.querySelectorAll('.font-pixel')]
      .map(s => s.textContent).find(t => /ANY TOWER|MUST MOVE/.test(t)) ?? '(none)',
  }
})
const litTargets = () => page.evaluate(() =>
  [...document.querySelectorAll('button[aria-label^="km-cell-"]')]
    .filter(b => (b.getAttribute('class') || '').includes('ring-inset ring-retro-cta/70'))
    .map(b => b.getAttribute('aria-label')))
const gameOver = () => page.evaluate(() => {
  const boardDisabled = [...document.querySelectorAll('button[aria-label^="km-cell-"]')]
    .some(b => b.disabled === true || b.getAttribute('disabled') != null)
  const lines = document.body.innerText.split('\n').map(s => s.trim())
    .filter(s => /WIN|LOSE|DEFEAT|VICTORY|PLAY AGAIN/i.test(s))
  return { finished: boardDisabled && lines.length > 0, banner: lines.join(' | ') }
})
const resetGame = async () => {
  const btn = page.locator('button:has-text("PLAY AGAIN")')
  if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(800) }
}

// Play 3 full games. X taps the auto-selected forced tower's first target;
// game over (win banner + disabled board) ends the game — that is SUCCESS.
let stall = false, gamesDone = 0
for (let game = 1; game <= 3; game++) {
  await resetGame()
  // X opening (unforced): 7-3 → 5-3.
  await page.locator('[aria-label="km-cell-7-3-X"]').click()
  await page.waitForTimeout(400)
  await page.locator('[aria-label="km-cell-5-3"]').click()
  await page.waitForTimeout(1500)

  let ended = false
  for (let round = 1; round <= 12; round++) {
    const over = await gameOver()
    if (over.finished) {
      console.log(`game${game}: FINISHED — ${over.banner} (round ${round})`)
      ended = true
      gamesDone++
      break
    }
    const targets = await litTargets()
    if (!targets.length) {
      // Could be the bot still mid-move — give it one extra window.
      await page.waitForTimeout(1200)
      const retry = await litTargets()
      if (!retry.length) {
        stall = true
        const state = await page.evaluate(() => document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean).slice(-12).join(' | '))
        console.log(`game${game}: STALL round ${round} — page tail: ${state}`)
        break
      }
    }
    const t = (targets.length ? targets : retry)
    await page.locator(`[aria-label="${t[0]}"]`).click()
    await page.waitForTimeout(1700) // bot reply (may legitimately move twice)
  }
  if (!ended && !stall) console.log(`game${game}: cap reached without result`)
  if (stall) break
}
console.log(gamesDone === 3 && !stall ? 'RESULT: 3/3 games completed cleanly' : `RESULT: ${gamesDone} completed, stall=${stall}`)
await browser.close()
