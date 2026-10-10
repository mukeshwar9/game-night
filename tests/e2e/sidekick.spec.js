// Side Kick: one rider against three bots on /solo/sidekick, and a two-client
// room where both phones sim their own bike, the coordinator drives the bots, a
// kick written by one rider lands on the other, and a finished race scores the
// cup (src/lib/sideKickLogic.js, src/pages/SideKickGame.jsx, RaceShell).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

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

test('Side Kick solo: a cup starts, the countdown runs, the bike answers and focus mode opens', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.goto('/solo/sidekick')
  await expect(page.getByTestId('sidekick-start')).toBeVisible()
  await expect(page.getByTestId('sidekick-arena')).toBeVisible()

  await test.step('settings stick and START CUP begins the countdown', async () => {
    await page.getByRole('button', { name: 'HARD', exact: true }).click()
    await expect(page.getByRole('button', { name: 'HARD', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('sidekick-go').click()
    await expect(page.getByTestId('sidekick-start')).toHaveCount(0)
    await expect(page.getByTestId('sidekick-count')).toBeVisible()
    await expect(page.getByTestId('sidekick-place')).toContainText('/4')
  })

  await test.step('after GO the clock runs and a kick into thin air is a whiff', async () => {
    await expect(page.getByTestId('sidekick-time')).not.toHaveText('0:00.00', { timeout: 15_000 })
    await page.keyboard.press('a')
    await expect(page.getByRole('status')).toContainText('WHIFF')
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(400)
    await page.keyboard.up('ArrowRight')
  })

  await test.step('focus mode puts the road and the pad on the stage and Escape leaves it', async () => {
    await page.getByTestId('focus-enter').click()
    const stage = page.locator('[data-focus-stage]')
    await expect(stage).toBeVisible()
    await expect(stage.getByTestId('sidekick-arena')).toBeVisible()
    await expect(stage.getByTestId('sidekick-pad')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(stage).toHaveCount(0)
    await expect(page.getByTestId('sidekick-arena')).toBeVisible()
  })

  expect(errors).toEqual([])
})

test('Side Kick online: both phones race, a kick lands, and a finished race scores the cup', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players ready up, the road goes live and bots fill the grid', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'SIDE KICK')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    // One at a time, each tap confirmed, so neither toggle is lost to the other's transaction.
    await alice.page.getByRole('button', { name: 'READY', exact: true }).click()
    await expect(alice.page.getByRole('button', { name: '✓ READY' })).toBeVisible()
    await expect(bob.page.getByRole('listitem').filter({ hasText: 'Alice' }).getByText('✓ READY')).toBeVisible()
    // A tap can land while the lobby re-renders, so tap again until the road is up.
    await expect.poll(async () => {
      if (await bob.page.getByTestId('sidekick-arena').count()) return true
      const ready = bob.page.getByRole('button', { name: 'READY', exact: true })
      if (await ready.count()) await ready.click({ timeout: 2000 }).catch(() => {})
      return false
    }, { timeout: 30_000, intervals: [1000] }).toBe(true)
    for (const { page } of [alice, bob]) {
      await expect(page.getByTestId('sidekick-arena')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('sidekick-count')).toBeVisible()
      await expect(page.getByTestId('sidekick-time')).not.toHaveText('0:00.00', { timeout: 20_000 })
    }
  })

  let room = await readRoom(alice.page.url())
  const aliceUid = uidOf(room, 'Alice')
  const bobUid = uidOf(room, 'Bob')
  const rid = room.round.id

  await test.step('a kick Alice sends to Bob is applied on Bob\'s phone', async () => {
    // A kick only counts from a rider who is level with the victim (as a real one is), so send it
    // while both are riding within a bike length or two of each other: the first seconds after GO.
    const stats = async () => (await readRoom(alice.page.url())).round.stats[rid]
    let landed = false
    for (let n = 901; n < 960 && !landed; n++) {
      const all = await stats()
      const a = all[aliceUid]
      const b = all[bobUid]
      if (!a || !b || a.s || b.s || b.sh || Math.abs(a.z - b.z) > 650) { await alice.page.waitForTimeout(100); continue }
      await patch(alice.page.url(), `/round/stats/${rid}/${aliceUid}/k`, { [n]: `${bobUid}|1` })
      for (let t = 0; t < 8 && !landed; t++) {
        await alice.page.waitForTimeout(150)
        const now = (await stats())[bobUid]
        landed = now.pp < b.pp || now.dn > b.dn
      }
    }
    expect(landed).toBe(true)
  })

  await test.step('each phone reports its own bike and the coordinator reports the bots', async () => {
    await expect.poll(async () => Object.keys((await readRoom(alice.page.url())).round.stats?.[rid] ?? {}).sort(), { timeout: 20_000 })
      .toEqual([aliceUid, bobUid, 'bot1', 'bot2'].sort())
    room = await readRoom(alice.page.url())
    expect(room.round.track).toBe('meadow')
    for (const id of [aliceUid, bobUid]) expect(room.round.stats[rid][id].z).toBeGreaterThan(1000)
  })

  await test.step('every rider on the rail has left the grid on both screens (a rider may already be down at the first car)', async () => {
    for (const { page } of [alice, bob]) {
      const dots = page.getByTestId('sidekick-rail').locator('span.rounded-full')
      await expect(dots).toHaveCount(4)
      // Chrome folds the inline calc() into a percentage plus pixels, so measure where the dots sit.
      const offsets = () => dots.evaluateAll((els) => {
        const rail = els[0].parentElement.getBoundingClientRect()
        return els.map((el) => Math.round(el.getBoundingClientRect().left - rail.left))
      })
      await expect.poll(async () => (await offsets()).every((v) => v > 2), { timeout: 20_000, message: 'rail offsets (px)' }).toBe(true)
    }
  })

  await test.step('the deadline passes: the road is ranked with the bots in it and the cup has points and a count', async () => {
    await patch(alice.page.url(), '/round', { endsAt: Date.now() - 1000 })
    await expect.poll(async () => (await readRoom(alice.page.url())).status, { timeout: 30_000 }).toBe('finished')
    room = await readRoom(alice.page.url())
    expect(room.cupRaces).toBe(1)
    expect(room.raceResult.order).toHaveLength(2)
    expect(room.raceResult.grid).toHaveLength(4)
    expect(Object.keys(room.raceResult.points).sort()).toEqual([aliceUid, bobUid].sort())
    const pts = room.raceResult.points
    expect(pts[aliceUid] + pts[bobUid]).toBeLessThanOrEqual(5)
    expect(room.scores[aliceUid]).toBe(pts[aliceUid])
    for (const { page } of [alice, bob]) {
      await expect(page.getByTestId('sidekick-final')).toBeVisible()
      await expect(page.getByRole('button', { name: /^NEXT RACE/ })).toBeVisible()
    }
  })

  await test.step('NEXT RACE rides the second road with last place at the front of the grid', async () => {
    await expect.poll(async () => {
      if ((await readRoom(alice.page.url())).round?.track === 'pass') return true
      for (const { page } of [alice, bob]) {
        const next = page.getByRole('button', { name: /^NEXT RACE/ })
        if (await next.count()) await next.click({ timeout: 2000 }).catch(() => {})
      }
      return false
    }, { timeout: 40_000, intervals: [1500] }).toBe(true)
    room = await readRoom(alice.page.url())
    expect(room.round.grid).toHaveLength(4)
    for (const { page } of [alice, bob]) await expect(page.getByTestId('sidekick-arena')).toBeVisible({ timeout: 20_000 })
  })

  await test.step('the shared full-screen mode opens from the room page too', async () => {
    await alice.page.getByTestId('focus-enter').click()
    const stage = alice.page.locator('[data-focus-stage]')
    await expect(stage.getByTestId('sidekick-pad')).toBeVisible()
    await alice.page.keyboard.press('Escape')
    await expect(stage).toHaveCount(0)
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
