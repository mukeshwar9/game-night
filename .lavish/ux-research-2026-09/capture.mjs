import { chromium } from '/Users/mukeshwarvarmaspurge/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFile } from 'node:fs/promises'
const OUT = '.lavish/ux-research-2026-09'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
await context.route(/(googleapis\.com|firebaseio\.com|firebasedatabase\.app)/, route => route.abort())
const page = await context.newPage()
const evidence = { date: '2026-09-16', setup: 'localhost:5173; Firebase blocked; isolated guest; independent pass (not prior review reuse).', journeys: [], heuristics: {} }
async function shot(name) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  const meta = {
    name,
    url: page.url(),
    viewport: page.viewportSize(),
    scrollHeight: await page.evaluate(() => document.documentElement.scrollHeight),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  }
  evidence.journeys.push(meta)
  return meta
}
try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  // Prefer welcome if present; else seed and continue
  const guest = page.getByRole('button', { name: 'PLAY AS GUEST', exact: true })
  if (await guest.count()) {
    await guest.waitFor({ timeout: 15000 })
    await page.waitForTimeout(4000)
    await shot('01-welcome')
    await guest.click()
    await shot('02-identity')
    await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Research Guest') })
  } else {
    await page.evaluate(() => { localStorage.setItem('onboarded', '1'); localStorage.setItem('playerName', 'Research Guest') })
  }
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.getByPlaceholder(/SEARCH GAMES/).waitFor({ timeout: 20000 })
  await page.waitForTimeout(4000)
  await shot('03-home')
  evidence.heuristics.firstCard = await page.getByRole('button', { name: /TIC TAC TOE/ }).first().evaluate(el => ({
    text: el.innerText,
    top: el.getBoundingClientRect().top,
    height: el.getBoundingClientRect().height,
    typography: Array.from(el.querySelectorAll('p, span')).map(n => ({ text: n.textContent.trim(), size: getComputedStyle(n).fontSize, display: getComputedStyle(n).display })),
  }))
  await page.getByRole('button', { name: /TIC TAC TOE/ }).first().click()
  await page.locator('[role=dialog]').waitFor()
  await shot('04-options')
  evidence.heuristics.focusOnOpen = await page.evaluate(() => ({
    insideDialog: !!document.activeElement?.closest('[role=dialog]'),
    tag: document.activeElement?.tagName,
    label: document.activeElement?.getAttribute('aria-label') || document.activeElement?.innerText?.slice(0, 40),
  }))
  await page.keyboard.press('Tab')
  evidence.heuristics.focusAfterTab = await page.evaluate(() => ({
    insideDialog: !!document.activeElement?.closest('[role=dialog]'),
    label: document.activeElement?.getAttribute('aria-label') || document.activeElement?.innerText?.slice(0, 40),
  }))
  // Count focusable outside while dialog open
  evidence.heuristics.backgroundFocusablesWhileOpen = await page.evaluate(() => {
    const dialog = document.querySelector('[role=dialog]')
    return [...document.querySelectorAll('button, a, input, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !dialog?.contains(el) && el.offsetParent !== null).length
  })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.goto('http://localhost:5173/solo/tictactoe', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await shot('05-solo')
  evidence.heuristics.solo = await page.evaluate(() => {
    const header = document.body.innerText.slice(0, 200)
    const pickerButtons = [...document.querySelectorAll('button')].filter(b => /TIC|CONNECT|HANG|DOTS|SOS|PONG/i.test(b.innerText)).length
    const boardish = document.querySelector('[class*="grid"]')
    return {
      demoBadge: /Demo/i.test(document.body.innerText),
      pickerishButtons: pickerButtons,
      boardTop: boardish ? boardish.getBoundingClientRect().top : null,
      firstViewportText: header,
    }
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.evaluate(() => { sessionStorage.removeItem('gn-home-scrollY'); window.scrollTo(0, 0) })
  await page.waitForTimeout(2000)
  await shot('06-home-desktop')
  // Join field label check
  evidence.heuristics.homeInputs = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].map(i => ({
      placeholder: i.placeholder,
      id: i.id,
      labelledBy: i.getAttribute('aria-labelledby'),
      hasLabel: !!(i.id && document.querySelector(`label[for="${i.id}"]`)),
      ariaLabel: i.getAttribute('aria-label'),
    }))
    return inputs
  })
  await writeFile(`${OUT}/evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  await browser.close()
}
