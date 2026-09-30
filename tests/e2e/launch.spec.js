// Launch-readiness flows: ad attribution and the funnel counters, the hidden
// leaderboard, the static legal pages, "Delete my data", and the public lobby
// ignoring poisoned and unmoderated listings. Database contents are read and
// seeded through the emulator's REST API as the owner (rules bypassed).
import { test, expect } from '@playwright/test'
import { newPlayer, onboard } from './helpers.js'

const DB = 'http://127.0.0.1:9000'
const NS = 'demo-game-night-default-rtdb'
const OWNER = { Authorization: 'Bearer owner' }
const today = () => new Date().toISOString().slice(0, 10)

async function readDb(path) {
  const res = await fetch(`${DB}/${path}.json?ns=${NS}`, { headers: OWNER })
  return res.json()
}
async function putDb(path, value) {
  await fetch(`${DB}/${path}.json?ns=${NS}`, { method: 'PUT', headers: OWNER, body: JSON.stringify(value) })
}

test('an ad landing is attributed once and counted in the funnel', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await page.goto('/solo/connectfour?utm_source=Instagram&utm_medium=paid&utm_campaign=e2elaunch&fbclid=abc')
  await expect(page.getByRole('main').or(page.locator('#root'))).toBeVisible()

  const base = `funnelDaily/${today()}/instagram/e2elaunch`
  await expect.poll(() => readDb(`${base}/landed`)).toBe(1)
  await expect.poll(() => readDb(`${base}/started`)).toBe(1)

  // The first touch is stored once on the account, from this first visit.
  const seen = await readDb('funnelSeen')
  const uids = Object.entries(seen || {}).filter(([, steps]) => steps.landed).map(([uid]) => uid)
  expect(uids.length).toBeGreaterThan(0)
  const attribution = await Promise.any(uids.map(async uid => {
    const value = await readDb(`users/${uid}/attribution`)
    if (!value) throw new Error('none')
    return value
  }))
  expect(attribution).toMatchObject({ source: 'instagram', medium: 'paid', campaign: 'e2elaunch', click: 'fbclid', landing: '/solo/connectfour' })

  // A later visit from another campaign neither re-counts nor rewrites the first touch.
  await page.goto('/?utm_source=tiktok&utm_campaign=other')
  await page.reload()
  await page.waitForTimeout(500)
  expect(await readDb(`${base}/landed`)).toBe(1)
  expect(await readDb(`funnelDaily/${today()}/tiktok`)).toBe(null)
  await player.context.close()
})

test('the leaderboard is hidden for launch', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await onboard(page, 'Hida')
  await page.goto('/leaderboard')
  await expect(page.getByText('PAGE NOT FOUND')).toBeVisible()
  await expect(page.getByRole('link', { name: /leaderboard/i })).toHaveCount(0)
  await player.context.close()
})

test('the privacy policy and terms are static pages with a contact', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await page.goto('/privacy.html')
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
  await expect(page.getByText(/delete/i).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'CONTACT_EMAIL_TBD' }).first()).toBeVisible()
  await page.goto('/terms.html')
  await expect(page.getByRole('heading', { name: 'Terms of Use' })).toBeVisible()
  await expect(page.getByText(/at least 13/)).toBeVisible()
  await player.context.close()
})

test('onboarding links the terms and privacy pages', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'WHAT SHOULD WE CALL YOU?' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms.html')
  await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy.html')
  await player.context.close()
})

test('Delete my data removes the account rows and starts over', async ({ browser }) => {
  const player = await newPlayer(browser)
  const { page } = player
  await onboard(page, 'Delia')
  await page.goto('/profile')
  await expect(page.getByRole('button', { name: 'DELETE MY DATA' })).toBeVisible()

  const users = await readDb('users')
  const [uid, row] = Object.entries(users).find(([, u]) => u.displayName === 'Delia')
  expect(row.code).toBeTruthy()
  expect(await readDb(`codes/${row.code}`)).toBe(uid)

  await page.getByRole('button', { name: 'DELETE MY DATA' }).click()
  await page.getByRole('button', { name: 'YES, DELETE' }).click()

  await expect.poll(() => readDb(`users/${uid}`)).toBe(null)
  expect(await readDb(`profiles/${uid}`)).toBe(null)
  expect(await readDb(`codes/${row.code}`)).toBe(null)
  // Back at the first-run flow as a brand-new visitor.
  await expect(page.getByRole('heading', { name: 'WHAT SHOULD WE CALL YOU?' })).toBeVisible()
  await player.context.close()
})

test('the public lobby masks host names and ignores future-dated listings', async ({ browser }) => {
  const now = Date.now()
  const room = (id, hostName, createdAt, expiresAt) => ({
    game: { gameType: 'tictactoe', status: 'waiting', visibility: 'public', createdAt: now, lastActivityAt: now, players: { X: { name: hostName, joinedAt: now, playerId: `host-${id}` } }, scores: { X: 0, O: 0 } },
    listing: { gameId: id, gameType: 'tictactoe', visibility: 'public', hostUid: `host-${id}`, hostName, hostOnline: true, createdAt, updatedAt: createdAt, expiresAt },
  })
  const clean = room('E2ECLN', 'fuck yeti', now, now + 3_600_000)
  const poisoned = room('E2EPOI', 'Poisoned Pal', 9e15, 9e15)
  await putDb('games/E2ECLN', clean.game)
  await putDb('matchmaking/E2ECLN', clean.listing)
  await putDb('games/E2EPOI', poisoned.game)
  await putDb('matchmaking/E2EPOI', poisoned.listing)

  const player = await newPlayer(browser)
  const { page } = player
  await onboard(page, 'Lobbo')
  await page.goto('/online')
  await expect(page.getByText('••• yeti')).toBeVisible()
  await expect(page.getByText('fuck yeti')).toHaveCount(0)
  await expect(page.getByText('Poisoned Pal')).toHaveCount(0)
  await player.context.close()
})
