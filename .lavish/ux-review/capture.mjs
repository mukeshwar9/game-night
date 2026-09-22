// Read-only screenshots of the running app. Firebase calls are blocked to avoid
// creating profiles, rooms, or presence records during this visual review.
import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, route => route.abort())
const page = await context.newPage()
const evidence = { setup: 'Local app on localhost:5173; Firebase traffic blocked; isolated local-guest context. No live multiplayer verification.', captures: [] }
async function capture(name) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(700)
  await page.screenshot({ path: `.lavish/ux-review/${name}.png` })
  evidence.captures.push({ name, url: page.url(), viewport: page.viewportSize(), scrollHeight: await page.evaluate(() => document.documentElement.scrollHeight), horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) })
}
try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'PLAY AS GUEST', exact: true }).waitFor({ timeout: 30000 })
  await page.waitForTimeout(5500)
  await capture('current-welcome-mobile')
  await page.getByRole('button', { name: 'PLAY AS GUEST', exact: true }).click()
  await capture('current-identity-mobile')
  // Seed local-only onboarding state rather than clicking START (a profile write).
  await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'UX Guest') })
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('SEARCH GAMES…').waitFor()
  await page.waitForTimeout(5500)
  await capture('current-home-mobile')
  evidence.mobileCard = await page.getByRole('button', { name: /TIC TAC TOE/ }).first().evaluate(el => ({ text: el.innerText, bounds: el.getBoundingClientRect().toJSON(), typography: Array.from(el.querySelectorAll('p, span')).map(n => ({ text: n.textContent, size: getComputedStyle(n).fontSize, display: getComputedStyle(n).display })) }))
  await page.getByRole('button', { name: /TIC TAC TOE/ }).first().click()
  await capture('current-options-mobile')
  evidence.focusOnOpen = await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 240), insideDialog: !!document.activeElement?.closest('[role=dialog]') }))
  await page.keyboard.press('Tab')
  evidence.focusAfterTab = await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 240), insideDialog: !!document.activeElement?.closest('[role=dialog]') }))
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => { sessionStorage.removeItem('gn-home-scrollY'); window.scrollTo(0, 0) })
  await capture('current-home-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:5173/solo/tictactoe', { waitUntil: 'networkidle' })
  await page.waitForTimeout(5500)
  await capture('current-solo-mobile')
  console.log(JSON.stringify(evidence, null, 2))
  await writeFile('.lavish/ux-review/evidence.json', JSON.stringify(evidence, null, 2))
} finally { await browser.close() }
