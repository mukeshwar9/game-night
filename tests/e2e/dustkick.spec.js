// Dust Kick: SIDE KICK's engine with the Western rules. One rider against three bots on
// /solo/dustkick, and a two-client room where a lasso written by one rider ropes the other
// (src/lib/sideKickLogic.js `dust`, src/lib/dustKickLogic.js, src/pages/SideKickGame.jsx).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'
import { MAXSPD } from '../../src/lib/sideKickLogic.js'

test.describe.configure({ timeout: 180_000 })

const NS = 'demo-game-night-default-rtdb'
const roomId = (url) => url.split('/').pop()
const api = async (url, path = '', init = {}) => {
  const res = await fetch(`${DB_ORIGIN}/games/${roomId(url)}${path}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' }, ...init })
  return res.json()
}
const readRoom = (url) => api(url)
const patch = (url, path, body) => api(url, path, { method: 'PATCH', body: JSON.stringify(body) })
const uidOf = (room, name) => Object.values(room.players).find((p) => p.name === name).playerId

test('Dust Kick solo: a cup on the Western trail starts, the pad speaks Western and a buck is a whiff', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.goto('/solo/dustkick')
  await expect(page.getByTestId('sidekick-start')).toBeVisible()
  await expect(page.getByTestId('sidekick-start')).toContainText('DUST KICK')
  await expect(page.getByTestId('sidekick-arena')).toBeVisible()

  await test.step('the setup offers the three trails and no camera choice', async () => {
    for (const name of ['CUP TOUR', 'CANYON', 'PRAIRIE', 'TOWN']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await expect(page.getByTestId('sidekick-pref-cam-first')).toHaveCount(0)
    await page.getByRole('button', { name: 'PRAIRIE', exact: true }).click()
    await expect(page.getByRole('button', { name: 'PRAIRIE', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'CUP TOUR', exact: true }).click()
  })

  await test.step('START CUP begins on the canyon and the pad is relabelled', async () => {
    await page.getByTestId('sidekick-go').click()
    await expect(page.getByTestId('sidekick-count')).toBeVisible()
    await expect(page.getByText('RACE 1 OF 3 · RED CANYON')).toBeVisible()
    await expect(page.getByRole('button', { name: 'SPURS', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'BUCK L', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'BUCK R', exact: true })).toBeVisible()
    await expect(page.getByTestId('sidekick-cam')).toHaveCount(0)
  })

  await test.step('after GO the meter starts empty, a tap says SPURS EMPTY and a buck into thin air is a whiff', async () => {
    await expect(page.getByTestId('sidekick-time')).not.toHaveText('0:00.00', { timeout: 15_000 })
    await expect(page.getByTestId('sidekick-boost')).toHaveAttribute('aria-valuenow', '0')
    await page.keyboard.press('Space')
    await expect(page.getByRole('status')).toContainText('SPURS EMPTY')
    await page.keyboard.press('a')
    await expect(page.getByRole('status')).toContainText('WHIFF')
    // No coil in hand, so no lasso button, and the E key does nothing.
    await expect(page.getByTestId('dustkick-lasso')).toHaveCount(0)
    await page.keyboard.press('e')
  })

  expect(errors).toEqual([])
})

test('Dust Kick online: a lasso written by one rider ropes the other, and the room rides the canyon', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players ready up and the trail goes live', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'DUST KICK')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    await alice.page.getByRole('button', { name: 'READY', exact: true }).click()
    await expect(alice.page.getByRole('button', { name: '✓ READY' })).toBeVisible()
    await expect(bob.page.getByRole('listitem').filter({ hasText: 'Alice' }).getByText('✓ READY')).toBeVisible()
    await expect.poll(async () => {
      if (await bob.page.getByTestId('sidekick-arena').count()) return true
      const ready = bob.page.getByRole('button', { name: 'READY', exact: true })
      if (await ready.count()) await ready.click({ timeout: 2000 }).catch(() => {})
      return false
    }, { timeout: 30_000, intervals: [1000] }).toBe(true)
    for (const { page } of [alice, bob]) {
      await expect(page.getByTestId('sidekick-arena')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('sidekick-time')).not.toHaveText('0:00.00', { timeout: 20_000 })
      await expect(page.getByText('RACE 1 OF 3 · RED CANYON')).toBeVisible()
    }
  })

  const room = await readRoom(alice.page.url())
  const aliceUid = uidOf(room, 'Alice')
  const bobUid = uidOf(room, 'Bob')
  const rid = room.round.id

  await test.step('the round is a Western one: canyon first, the pad is Western, bots report', async () => {
    expect(room.gameType).toBe('dustkick')
    expect(room.round.track).toBe('canyon')
    await expect(bob.page.getByRole('button', { name: 'BUCK L', exact: true })).toBeVisible()
    await expect.poll(async () => Object.keys((await readRoom(alice.page.url())).round.stats?.[rid] ?? {}).sort(), { timeout: 20_000 })
      .toEqual([aliceUid, bobUid, 'bot1', 'bot2'].sort())
  })

  await test.step('a lasso Alice sends to Bob is applied on Bob\'s phone: his report carries the roped flag', async () => {
    // As in the Side Kick spec: Alice's report and her action go in ONE write, placing her ghost just
    // behind Bob (a lasso is thrown at a rider ahead) in the same frame his phone reads the rope.
    const stats = async () => (await readRoom(alice.page.url())).round.stats[rid]
    const ahead = (b) => (b.v / 1000) * MAXSPD * Math.max(0, Date.now() + 100 - b.at) / 1000
    const JITTER = [0, 300, -300, 600, -600]
    let roped = false
    const tries = []
    for (let n = 901; n < 926 && !roped; n++) {
      const all = await stats()
      const a = all[aliceUid]
      const b = all[bobUid]
      if (!a || !b || a.s || b.s || b.sh || b.fin) { tries.push({ n, b: b && [b.z, b.s, b.sh] }); await alice.page.waitForTimeout(100); continue }
      await patch(alice.page.url(), `/round/stats/${rid}/${aliceUid}`, { z: Math.max(0, Math.round(b.z + ahead(b) - 700 + JITTER[n % JITTER.length])), x: b.x, v: b.v, at: Date.now(), [`k/${n}`]: `${bobUid}|L` })
      for (let t = 0; t < 8 && !roped; t++) {
        await alice.page.waitForTimeout(100)
        roped = (await stats())[bobUid].ro === 1
        if (t === 7) tries.push({ n, b: { z: b.z, x: b.x } })
      }
    }
    expect(roped, JSON.stringify(tries)).toBe(true)
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
