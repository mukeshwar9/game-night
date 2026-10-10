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
    for (const { page } of [alice, bob]) {
      await page.getByRole('button', { name: 'READY', exact: true }).click()
    }
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

  await test.step('each phone reports its own bike and the coordinator reports the bots', async () => {
    await expect.poll(async () => Object.keys((await readRoom(alice.page.url())).round.stats?.[rid] ?? {}).sort(), { timeout: 20_000 })
      .toEqual([aliceUid, bobUid, 'bot1', 'bot2'].sort())
    room = await readRoom(alice.page.url())
    expect(room.round.track).toBe('meadow')
    for (const id of [aliceUid, bobUid]) expect(room.round.stats[rid][id].z).toBeGreaterThan(1000)
  })

  await test.step('every rider on the rail has moved off the grid on both screens', async () => {
    for (const { page } of [alice, bob]) {
      const dots = page.getByTestId('sidekick-rail').locator('span.rounded-full')
      await expect(dots).toHaveCount(4)
      // Chrome folds the inline calc() into a percentage plus pixels, so measure where the dots sit.
      await expect.poll(async () => dots.evaluateAll((els) => {
        const rail = els[0].parentElement.getBoundingClientRect()
        return els.every((el) => el.getBoundingClientRect().left - rail.left > 5)
      }), { timeout: 20_000 }).toBe(true)
    }
  })

  await test.step('a kick Alice sends to Bob is applied on Bob\'s phone', async () => {
    // Bob may be on the ground or shielded when it arrives (nobody is steering), so send a few.
    const bobStats = async () => (await readRoom(alice.page.url())).round.stats[rid][bobUid]
    let landed = false
    for (let n = 901; n < 907 && !landed; n++) {
      const before = await bobStats()
      await patch(alice.page.url(), `/round/stats/${rid}/${aliceUid}/k`, { [n]: `${bobUid}|1` })
      for (let t = 0; t < 12 && !landed; t++) {
        await alice.page.waitForTimeout(250)
        const now = await bobStats()
        landed = now.pp < before.pp || now.dn > before.dn
      }
    }
    expect(landed).toBe(true)
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
    for (const { page } of [alice, bob]) await page.getByRole('button', { name: /^NEXT RACE/ }).click()
    await expect.poll(async () => (await readRoom(alice.page.url())).round?.track, { timeout: 20_000 }).toBe('pass')
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
