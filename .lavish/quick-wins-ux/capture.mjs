import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile, mkdir } from 'node:fs/promises'

const OUT = '.lavish/quick-wins-ux'
const BASE = process.env.SHOT_BASE || 'http://localhost:5174'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    reducedMotion: 'no-preference', serviceWorkers: 'block',
  })
  await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, route => route.abort())
  const page = await context.newPage()
  // Fresh clone has no .env.local — hide the config banner + toast so the
  // screenshots show the features, not the environment warning. Init script
  // re-injects the style after every navigation.
  await context.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = `
      [role="status"][class*="top-16"] { display: none !important; }
      [data-sonner-toast] { display: none !important; }
    `
    const add = () => document.head.appendChild(style)
    document.head ? add() : document.addEventListener('DOMContentLoaded', add)
  })
  return { context, page, base: BASE }
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

// ── 1. Onboarding splash (F-39 pitch line) ───────────────────────────────────
{
  const { context, page, base } = await newPage()
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'PLAY AS GUEST', exact: true }).waitFor({ timeout: 20000 })
  await shot(page, '01-onboarding-pitch', 'F-39 — the start screen now tells visitors what this is before any click: 44 GAMES · SHARE A LINK · NO ACCOUNT.')
  await context.close()
}

// ── 2. Home with START HERE rail (F-45) ──────────────────────────────────────
{
  const { context, page, base } = await newPage()
  await page.goto(`${base}/`, { waitUntil: 'load' })
  const guest = page.getByRole('button', { name: 'PLAY AS GUEST', exact: true })
  if (await guest.count()) {
    await guest.waitFor({ timeout: 20000 }); await page.waitForTimeout(1500); await guest.click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /GUEST/ }).first().click().catch(() => {})
    await page.waitForTimeout(500)
  }
  await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Nova') })
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.getByText('START HERE').waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200)
  await shot(page, '02-home-start-here', 'F-45 — the START HERE rail sits above the game picker for brand-new visitors: 4 picked games in order, self-hiding once they play or dismiss it.')
  await context.close()
}

// ── 3. Practice hub (F-40 + F-41) ────────────────────────────────────────────
{
  const { context, page, base } = await newPage()
  await page.goto(`${base}/demo`, { waitUntil: 'load' })
  await page.getByText('PRACTICE · VS CPU').waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200)
  await shot(page, '03-practice-hub', 'F-40 + F-41 — the hub now says PRACTICE · VS CPU, links to the full catalog, tiles are tagged VS CPU, and CHECKERS / SANTORINI no longer break mid-word.')
  await context.close()
}

// ── 4. SOS extra-turn MomentFlash (F-44) ────────────────────────────────────
{
  const { context, page, base } = await newPage()
  await page.goto(`${base}/demo`, { waitUntil: 'load' })
  await page.getByText('PRACTICE · VS CPU').waitFor({ timeout: 20000 })
  // Open the SOS demo via pass-and-play (local mode — both seats human)
  await page.goto(`${base}/local/sos`, { waitUntil: 'load' })
  await page.getByLabel('sos-cell-0-0').waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
  await page.getByLabel('sos-cell-0-0').click()
  await page.getByLabel('pick-letter-O').click()
  await page.getByLabel('sos-cell-0-1').click()
  await page.getByLabel('pick-letter-S').click()
  await page.getByLabel('sos-cell-0-2').click()
  await page.waitForTimeout(280)  // catch the ~1s MomentFlash near its peak
  await shot(page, '04-extra-turn-flash', 'F-44 — completing an S-O-S now fires a full-screen MomentFlash with the dedicated extra-turn feel. The persistent "GO AGAIN!" text stays after the flash fades.')
  await page.waitForTimeout(1200)
  await shot(page, '05-extra-turn-persistent', 'F-44 — the inline GO AGAIN! state that remains, so the extra turn stays readable after the celebration.')
  await context.close()
}

// ── 5. Mancala extra turn + end screen share (F-44/F-46) ────────────────────
{
  const { context, page, base } = await newPage()
  await page.goto(`${base}/solo/mancala`, { waitUntil: 'load' })
  await page.getByLabel('pit 3').waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
  await page.getByLabel('pit 3').click()
  await page.evaluate(() => document.fonts.ready)
  // My sow hands the turn over; the bot replies after 700ms and its seeds
  // land in its own store — the 'RIVAL GOES AGAIN' flash fires right then.
  await page.waitForTimeout(950)
  await page.screenshot({ path: `${OUT}/06-mancala-flash.png` })
  shots.push({ name: '06-mancala-flash', caption: 'F-44 — Mancala extra-turn beat: the rival lands seeds in its own store and the full-screen RIVAL GOES AGAIN flash fires.' })
  console.log('shot 06-mancala-flash')
  await context.close()
}

// ── 6. Local TTT end screen with ShareResultButton (F-46) ───────────────────
{
  const { context, page, base } = await newPage()
  await page.goto(`${base}/local/tictactoe`, { waitUntil: 'load' })
  await page.getByLabel('Row 1, column 1, empty').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(600)
  // X wins: 0, 3, 6 down the first column (O takes 1 and 4 in between)
  for (const [pos, delay] of [
    ['Row 1, column 1, empty', 0],
    ['Row 1, column 2, empty', 260],
    ['Row 2, column 1, empty', 260],
    ['Row 2, column 2, empty', 260],
    ['Row 3, column 1, empty', 260],
  ]) {
    const btn = page.getByLabel(pos).first()
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(delay) }
  }
  await page.waitForTimeout(700)
  const shareBtn = page.getByRole('button', { name: 'SHARE', exact: true })
  if (await shareBtn.count()) {
    await shareBtn.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(500)
    await shot(page, '07-end-screen-share', 'F-46 — end screens now follow the same checklist: PLAY AGAIN · SHARE · TRY NEXT · SWITCH GAME.')
  } else {
    console.log('share button not found on end screen')
    await shot(page, '07-end-screen-share', 'End screen after a finished local match.')
  }
  await context.close()
}

// ── 7. F-51 dev launcher (needs dev:test server) ────────────────────────────
const DEVTEST = process.env.SHOT_BASE_DEVTEST || 'http://localhost:5175'
try {
  const { context, page } = await newPage()
  await page.goto(`${DEVTEST}/`, { waitUntil: 'load' })
  await page.getByText('DEV MULTIPLAYER LAUNCHER').waitFor({ timeout: 8000 })
  await page.waitForTimeout(800)
  await shot(page, '08-dev-launcher', 'F-51 — with the emulators mode on, an ordinary tab becomes the launcher: open P1–P8 or a spectator, each as its own player.')
  await context.close()
} catch (e) {
  console.log('launcher shot skipped (dev:test not running):', e.message?.slice(0, 80))
}

// ── 8. Slot tab with dev badge (F-51) ───────────────────────────────────────
try {
  const { context, page } = await newPage()
  await page.goto(`${DEVTEST}/?devPlayer=p1`, { waitUntil: 'load' })
  await page.getByLabel('DEVELOPER PLAYER BADGE').waitFor({ timeout: 10000 })
  await page.waitForTimeout(1500)
  await shot(page, '09-dev-badge', 'F-51 — a slot tab shows the persistent DEV P1 badge: slot, uid, and emulator connection (EMU-DOWN here because the emulators were not running for the capture).')
  await context.close()
} catch (e) {
  console.log('badge shot skipped:', e.message?.slice(0, 80))
}

await browser.close()
await writeFile(`${OUT}/shots.json`, JSON.stringify(shots, null, 2))
console.log('done:', shots.length, 'shots')
