import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile, mkdir } from 'node:fs/promises'

// Captures evidence shots for the axi review (Sept 22, 2026 full-platform pass).
// Server: live dev server on :5173 (SHOT_BASE to override).
const OUT = '.lavish/axi'
const BASE = process.env.SHOT_BASE || 'http://localhost:5173'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    reducedMotion: 'no-preference', serviceWorkers: 'block',
  })
  // Keep Firebase away: the review evidence should show app UI, not env banners.
  await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, route => route.abort())
  await context.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = `
      [role="status"][class*="top-16"] { display: none !important; }
      [data-sonner-toast] { display: none !important; }
    `
    const add = () => document.head.appendChild(style)
    document.head ? add() : document.addEventListener('DOMContentLoaded', add)
  })
  return { context, page: await context.newPage(), base: BASE }
}

const shots = []
async function shot(pg, name, caption) {
  await pg.evaluate(() => document.fonts.ready)
  await pg.waitForTimeout(450)
  const path = `${OUT}/${name}.png`
  await pg.screenshot({ path })
  shots.push({ name, path, caption, url: pg.url() })
  console.log('shot', name)
}

// ── 1. Landing (context: coin screen still opens the product) ────────────────
{
  const { context, page } = await newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'PLAY AS GUEST', exact: true }).waitFor({ timeout: 20000 })
  await shot(page, '01-landing', 'Landing — coin screen. Review context: the shell around 67 games is in good shape; this pass focused on what the games themselves do.')
  await context.close()
}

// ── 2. Reversi: last color-only board (finding R6) ───────────────────────────
{
  const { context, page } = await newPage()
  await page.goto(`${BASE}/solo/reversi`, { waitUntil: 'load' })
  await page.locator('[aria-label^="reversi-cell"]').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(900)
  await shot(page, '02-reversi-color-only', 'Finding R6 — Reversi is the last color-only board: bare pink/cyan discs with no glyph. Checkers fixed the identical problem with side letters (GAMEPLAY-04); Reversi should adopt the same treatment.')
  await context.close()
}

// ── 3. Checkers: the reference pattern (finding R6 fix precedent) ────────────
{
  const { context, page } = await newPage()
  await page.goto(`${BASE}/solo/checkers`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await shot(page, '03-checkers-glyph-pattern', 'The reference pattern — Checkers prints the side letter on every piece, men and kings. Reversi needs this exact class of fix for colorblind players.')
  await context.close()
}

// ── 4. Practice hub (F-41 regression: header reverted to bare "Demo") ──────
{
  const { context, page } = await newPage()
  await page.goto(`${BASE}/demo`, { waitUntil: 'load' })
  await page.getByText('VS CPU').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200)
  await shot(page, '04-practice-hub', 'Finding R7 (new) — the quick-wins branch renamed this header to "PRACTICE · VS CPU" with a catalog cross-link, but main still ships the bare "Demo" header: the branch was only partially merged. Tile VS CPU tags (F-40) did land. Also visible: volume findings R4/R5 — Fibbage draws from a 27-fact deck and Trivia from 60 questions, both below the ~100 burn bar.')
  await context.close()
}

// ── 5. Daily (party games build zero stats — finding R3) ─────────────────────
{
  const { context, page } = await newPage()
  await page.goto(`${BASE}/daily`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await shot(page, '05-daily', 'Stats context — recordMatch is still 2P-only, so party/nPlayer wins (Chain Reaction 4P, Herd, Trivia, Fibbage, Spyfair, Sketch) never reach users/{uid}/stats or the friends leaderboard. Extending recordMatch is the cheapest retention win left.')
  await context.close()
}

// ── 6. Home catalog after guest flow (hygiene: 67 entries, docs say 44) ─────
{
  const { context, page } = await newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Nova') })
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await shot(page, '06-home-catalog', 'Hygiene — the catalog is at 67 registry entries while backlog.md still shows Arrows work in-flight and UX-IMPROVEMENTS.md lists F-39..F-46 as Open though shipped. Docs lag the code by a full game wave.')
  await context.close()
}

await browser.close()
await writeFile(`${OUT}/shots.json`, JSON.stringify(shots, null, 2))
console.log('done:', shots.length, 'shots')
