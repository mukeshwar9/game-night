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
    // Not the emulator's long-poll fallback (`/.lp?`): the RTDB client probes it while a
    // websocket is slow to open, and the production policy blocks the script either way.
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text()) && !/\/\.lp\?/.test(msg.text())) cspViolations.push(msg.text())
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

// GAMES (friend intent) → game card → INVITE FRIEND: a single-game room, the
// path Home's PLAY WITH FRIENDS used before START A PARTY. Returns the room URL.
export async function createRoom(page, gameLabel) {
  await page.goto('/games?intent=friend')
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

// The signed-in anonymous user ({ uid, token }), read from the Auth SDK's
// IndexedDB record. Specs run against a production build (E2E_PREVIEW=1), where
// `import('/src/…')` inside the page does not exist, so they cannot ask the app.
export async function authOf(page) {
  let found = null
  await expect.poll(async () => {
    found = await page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('firebaseLocalStorageDb')
      open.onerror = () => resolve(null)
      open.onsuccess = () => {
        const db = open.result
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null)
        const all = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll()
        all.onerror = () => resolve(null)
        all.onsuccess = () => {
          const row = all.result.find((r) => String(r.fbase_key).startsWith('firebase:authUser:'))
          resolve(row?.value?.uid ? { uid: row.value.uid, token: row.value.stsTokenManager?.accessToken ?? null } : null)
        }
      }
    }))
    return Boolean(found)
  }).toBe(true)
  return found
}

export const uidOf = async (page) => (await authOf(page)).uid
