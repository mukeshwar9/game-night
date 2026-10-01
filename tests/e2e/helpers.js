// Shared player flows for the e2e specs. Each player is its own browser
// context, so it has its own localStorage/IndexedDB and therefore its own
// anonymous Auth-emulator uid — exactly like two people on two devices.
import { expect } from '@playwright/test'

export const ROOM_URL = /\/game\/[A-Z0-9]{6}$/
// ErrorBoundary.jsx's heading — seeing it means a render crashed.
export const ERROR_BOUNDARY_TEXT = 'SOMETHING BROKE'

// Opens a fresh player and records uncaught page errors on `player.errors`.
export async function newPlayer(browser, contextOptions = {}) {
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  const errors = []
  const cspViolations = []
  page.on('pageerror', (err) => errors.push(err))
  // Chrome logs a blocked request as a console error; with E2E_CSP=1 the app
  // runs under the production policy, so any of these is a real regression.
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) cspViolations.push(msg.text())
  })
  return { context, page, errors, cspViolations }
}

// Onboarding's two steps: NAME (pre-filled with a suggestion) → LOOK → the
// final button (LET'S PLAY on Home, JOIN GAME from an invite link).
export async function completeOnboarding(page, name, finalButton) {
  await expect(page.getByRole('heading', { name: 'WHAT SHOULD WE CALL YOU?' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Your name' }).fill(name)
  await page.getByRole('button', { name: /^NEXT: PICK A LOOK/ }).click()
  await expect(page.getByRole('heading', { name: 'PICK YOUR LOOK' })).toBeVisible()
  await page.getByRole('button', { name: finalButton, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'PICK YOUR LOOK' })).toBeHidden()
}

// First visit to `/`: the two-step first-run flow.
export async function onboard(page, name) {
  await page.goto('/')
  await completeOnboarding(page, name, "LET'S PLAY")
}

// Home → PLAY WITH FRIENDS → game card → INVITE FRIEND. Returns the room URL.
export async function createRoom(page, gameLabel) {
  await page.getByRole('link', { name: 'PLAY WITH FRIENDS' }).click()
  await expect(page.getByRole('heading', { name: 'CHOOSE YOUR GAME' })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`^${gameLabel}\\b`) }).first().click()
  const sheet = page.getByRole('dialog', { name: new RegExp(`^${gameLabel}\\b`) })
  await sheet.getByRole('button', { name: /^INVITE FRIEND/ }).click()
  await page.waitForURL(ROOM_URL)
  return page.url()
}

// A brand-new visitor opening an invite link: YOU'RE INVITED! → name → look → JOIN GAME.
export async function joinViaInvite(page, roomUrl, name) {
  await page.goto(roomUrl)
  await expect(page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeVisible()
  await completeOnboarding(page, name, 'JOIN GAME')
  await expect(page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeHidden()
}

export function expectNoPageErrors(...players) {
  for (const { errors, cspViolations = [] } of players) {
    expect(errors.map(e => e.message)).toEqual([])
    expect(cspViolations).toEqual([])
  }
}
