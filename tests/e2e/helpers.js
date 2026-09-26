// Shared player flows for the e2e specs. Each player is its own browser
// context, so it has its own localStorage/IndexedDB and therefore its own
// anonymous Auth-emulator uid — exactly like two people on two devices.
import { expect } from '@playwright/test'

export const ROOM_URL = /\/game\/[A-Z0-9]{6}$/
// ErrorBoundary.jsx's heading — seeing it means a render crashed.
export const ERROR_BOUNDARY_TEXT = 'SOMETHING BROKE'

// Opens a fresh player and records uncaught page errors on `player.errors`.
export async function newPlayer(browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(err))
  return { context, page, errors }
}

// First visit to `/`: the Onboarding coin screen, then the name step.
export async function onboard(page, name) {
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY AS GUEST' }).click()
  await expect(page.getByRole('heading', { name: 'CHOOSE YOUR FIGHTER' })).toBeVisible()
  await page.getByPlaceholder(/^GUEST-/).fill(name)
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'CHOOSE YOUR FIGHTER' })).toBeHidden()
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

// A brand-new visitor opening an invite link: YOU'RE INVITED! → name → JOIN GAME.
export async function joinViaInvite(page, roomUrl, name) {
  await page.goto(roomUrl)
  await expect(page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeVisible()
  await page.getByRole('textbox', { name: 'Your name' }).fill(name)
  await page.getByRole('button', { name: 'JOIN GAME' }).click()
  await expect(page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeHidden()
}

export function expectNoPageErrors(...players) {
  for (const { errors } of players) {
    expect(errors.map(e => e.message)).toEqual([])
  }
}
