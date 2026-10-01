// Premium gating end to end: the local-development bypass opens everything, the
// locked UI and paywall appear with it off, and a server-written entitlement
// (the same record the payment webhook writes) unlocks items live. Clients can
// never write that record; the emulator's owner token stands in for the server.
import { test, expect } from '@playwright/test'
import { newPlayer, onboard, expectNoPageErrors } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'demo-game-night-default-rtdb'
const OWNER = { Authorization: 'Bearer owner' }
const api = (path) => `${DB_ORIGIN}/${path}.json?ns=${NS}`
const readDb = async (path) => (await fetch(api(path), { headers: OWNER })).json()
const writeDb = (path, value) => fetch(api(path), { method: 'PUT', headers: OWNER, body: JSON.stringify(value) })

async function uidFor(name) {
  const profiles = (await readDb('profiles')) || {}
  const hit = Object.entries(profiles).find(([, p]) => p.displayName === name)
  expect(hit, `profile for ${name}`).toBeTruthy()
  return hit[0]
}

test('shop: bypass unlocks, locked UI asks to buy, entitlements unlock live', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await player.context.addInitScript(() => localStorage.setItem('gn-monetization', 'on'))
  await onboard(page, 'Shopper One')
  const uid = await uidFor('Shopper One')

  // Local development: everything open.
  await page.goto('/shop')
  await expect(page.getByText('DEV MODE')).toBeVisible()
  await page.getByRole('tab', { name: 'EMOTES' }).click()
  await expect(page.getByRole('button', { name: 'DISCO', exact: true })).toBeVisible()

  // Bypass off: the same items are locked.
  await page.evaluate(() => localStorage.setItem('gn-premium-bypass', 'off'))
  await page.reload()
  await expect(page.getByText('GAME NIGHT PASS').first()).toBeVisible()
  await page.getByRole('tab', { name: 'EMOTES' }).click()
  await page.getByRole('button', { name: 'DISCO, locked' }).click()
  const paywall = page.getByRole('dialog', { name: 'DISCO is a premium item' })
  await expect(paywall.getByRole('button', { name: /GET THE PASS/ })).toBeVisible()

  // A guest is asked to sign in with Google before buying.
  await paywall.getByRole('button', { name: /BUY PIXEL EMOTES/ }).click()
  const purchase = page.getByRole('dialog', { name: 'Buy PIXEL EMOTES' })
  await expect(purchase.getByRole('button', { name: 'SIGN IN WITH GOOGLE' })).toBeVisible()
  await purchase.getByRole('button', { name: 'CANCEL' }).click()
  await expect(purchase).toBeHidden()

  // The owned pack unlocks live, with no reload.
  await writeDb(`entitlements/${uid}/packs/emotes-pixel`, true)
  await expect(page.getByRole('button', { name: 'DISCO', exact: true })).toBeVisible()
  await expect(page.getByText('OWNED')).toBeVisible()

  // Revoked again (a refund): locked.
  await writeDb(`entitlements/${uid}/packs/emotes-pixel`, null)
  await expect(page.getByRole('button', { name: 'DISCO, locked' })).toBeVisible()

  // An active Pass unlocks everything and says so.
  await writeDb(`entitlements/${uid}/pass`, { status: 'active', plan: 'yearly', currentPeriodEnd: Date.now() + 86_400_000 * 30 })
  await expect(page.getByText('PASS ACTIVE')).toBeVisible()
  await expect(page.getByRole('button', { name: 'DISCO', exact: true })).toBeVisible()

  // A lapsed Pass locks again.
  await writeDb(`entitlements/${uid}/pass`, { status: 'active', plan: 'yearly', currentPeriodEnd: Date.now() - 1000 })
  await expect(page.getByRole('button', { name: 'DISCO, locked' })).toBeVisible()

  // The server-set admin flag (the email allowlist) unlocks too.
  await writeDb(`entitlements/${uid}/admin`, true)
  await expect(page.getByText('ADMIN ACCESS')).toBeVisible()
  await expect(page.getByRole('button', { name: 'DISCO', exact: true })).toBeVisible()

  expectNoPageErrors(player)
})

test('shop item taps open the paywall when the bypass is off', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await player.context.addInitScript(() => localStorage.setItem('gn-monetization', 'on'))
  await onboard(page, 'Shopper Two')
  await page.evaluate(() => localStorage.setItem('gn-premium-bypass', 'off'))
  await page.goto('/shop')
  await page.getByRole('tab', { name: 'EMOTES' }).click()
  await expect(page.getByRole('button', { name: 'UFO, locked' })).toBeVisible()
  await page.getByRole('button', { name: 'UFO, locked' }).click()
  await expect(page.getByRole('dialog', { name: 'UFO is a premium item' })).toBeVisible()
  expectNoPageErrors(player)
})

test('settings: a premium theme is locked, opens the paywall, and applies once owned', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await player.context.addInitScript(() => localStorage.setItem('gn-monetization', 'on'))
  await onboard(page, 'Shopper Three')
  const uid = await uidFor('Shopper Three')
  await page.evaluate(() => localStorage.setItem('gn-premium-bypass', 'off'))
  await page.reload()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Settings', exact: true })
  await sheet.locator('summary').filter({ hasText: /^THEME(?! &)/ }).click()
  await sheet.getByRole('button', { name: /^CAMPFIRE/ }).click()
  await expect(page.getByRole('dialog', { name: 'CAMPFIRE is a premium item' })).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'campfire')
  await page.keyboard.press('Escape')

  await writeDb(`entitlements/${uid}/packs/themes-seasonal`, true)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await sheet.locator('summary').filter({ hasText: /^THEME(?! &)/ }).click()
  await sheet.getByRole('button', { name: /^CAMPFIRE/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'campfire')
  expectNoPageErrors(player)
})

test('avatar picker refuses a locked item and opens the paywall', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await player.context.addInitScript(() => localStorage.setItem('gn-monetization', 'on'))
  await onboard(page, 'Shopper Four')
  await page.evaluate(() => localStorage.setItem('gn-premium-bypass', 'off'))
  await page.goto('/profile#look')
  await page.getByRole('tab', { name: 'BACKDROP' }).click()
  await page.getByRole('radio', { name: /CONFETTI.*locked/ }).click()
  await expect(page.getByRole('dialog', { name: 'CONFETTI is a premium item' })).toBeVisible()
  expectNoPageErrors(player)
})

test('monetization off (the default): everything is open and nothing sells', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await onboard(page, 'Free Player')

  // No shop or Pass routes.
  await page.goto('/shop')
  await expect(page.getByText('GAME NIGHT PASS')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'EMOTES' })).toHaveCount(0)
  await page.goto('/pass')
  await expect(page.getByText('GAME NIGHT PASS')).toHaveCount(0)

  // No entry points: settings has no SHOP & PASS, profile has no shop section.
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(sheet.getByRole('link', { name: /SHOP/ })).toHaveCount(0)

  // A premium theme is unlocked for everyone: no lock, applies directly.
  await sheet.locator('summary').filter({ hasText: /^THEME(?! &)/ }).click()
  const campfire = sheet.getByRole('button', { name: /^CAMPFIRE/ })
  await expect(campfire).not.toContainText('locked')
  await campfire.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'campfire')
  await expect(page.getByRole('dialog', { name: /premium item/ })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // A premium avatar item can be picked with no paywall and no pass or pack badge.
  await page.goto('/profile#look')
  await expect(page.getByText('SHOP & PASS')).toHaveCount(0)
  await page.getByRole('tab', { name: 'BACKDROP' }).click()
  const confetti = page.getByRole('radio', { name: /^CONFETTI/ })
  await expect(confetti).not.toHaveAttribute('aria-label', /locked|PACK/)
  await confetti.click()
  await expect(confetti).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('dialog', { name: /premium item/ })).toHaveCount(0)
  expectNoPageErrors(player)
})
