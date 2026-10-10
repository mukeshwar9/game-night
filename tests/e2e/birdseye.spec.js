// BIRDSEYE online duel: two seats throw at one fort, alternating, three birds
// each. A throw is a real pointer drag on the canvas (pull back anywhere,
// release); the rival's phone replays the very same shot from the room's
// bsShots list, so both clients must agree on the pops. A third context joins
// as a spectator and watches the same duel.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const RESULT = /YOU WIN!|YOU LOSE THIS ROUND|DRAW!/

// Pull the sling back and down-left of the grab point (a ~35° lob at ~60 % power).
async function throwBird(page) {
  const box = await page.getByTestId('birdseye-canvas').boundingBox()
  const x = box.x + box.width * 0.5, y = box.y + box.height * 0.45
  const dx = box.height * 0.2, dy = box.height * 0.14
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - dx / 2, y + dy / 2, { steps: 4 })
  await page.mouse.move(x - dx, y + dy, { steps: 4 })
  await page.mouse.up()
}

async function pops(page) {
  const text = await page.locator('body').innerText()
  const me = text.match(/YOU · (\d+) POP/), rival = text.match(/RIVAL · (\d+) POP/)
  return { me: Number(me?.[1]), rival: Number(rival?.[1]) }
}

test('two players alternate three birds each at one fort and the duel ends with a result', async ({ browser }) => {
  test.setTimeout(240_000)
  const host = await newPlayer(browser)
  const guest = await newPlayer(browser)
  const watcher = await newPlayer(browser)
  const players = [host, guest]

  await test.step('host creates the room, guest joins, the duel starts', async () => {
    await onboard(host.page, 'Ari')
    await createRoom(host.page, 'BIRDSEYE')
    await joinViaInvite(guest.page, host.page.url(), 'Bea')
    for (const { page } of players) await expect(page.getByTestId('birdseye-canvas')).toBeVisible()
    await expect(host.page.getByText(/YOUR BIRD/)).toBeVisible()
    await expect(guest.page.getByText('RIVAL IS AIMING…')).toBeVisible()
  })

  await test.step('a third visitor spectates the same duel', async () => {
    await joinViaInvite(watcher.page, host.page.url(), 'Cal')
    await expect(watcher.page.getByTestId('birdseye-canvas')).toBeVisible()
    await expect(watcher.page.getByText(/YOUR BIRD|RIVAL IS AIMING/)).toHaveCount(0)
  })

  await test.step('turns alternate and the rival sees each shot replayed', async () => {
    const result = (p) => p.page.getByText(RESULT).first()
    for (let n = 0; n < 6; n++) {
      const seat = players[n % 2], other = players[(n + 1) % 2]
      const aiming = seat.page.getByText(/YOUR BIRD/)
      await expect(aiming.or(result(seat))).toBeVisible({ timeout: 60_000 })
      if (await result(seat).isVisible()) break // the fort was cleared early
      await expect(other.page.getByText('RIVAL IS AIMING…')).toBeVisible()
      await throwBird(seat.page)
      // The shot lands in the room, then the rival's phone replays it live.
      await expect(other.page.getByText(/RIVAL.S SHOT/).or(result(other))).toBeVisible({ timeout: 60_000 })
    }
  })

  await test.step('both seats and the spectator see a result, and agree on the pops', async () => {
    for (const { page } of [...players, watcher]) await expect(page.getByText(RESULT).first()).toBeVisible({ timeout: 60_000 })
    const [h, g] = await Promise.all(players.map(({ page }) => pops(page)))
    expect(Number.isInteger(h.me) && Number.isInteger(g.me)).toBe(true)
    expect(h.me).toBe(g.rival)
    expect(h.rival).toBe(g.me)
    if (h.me !== h.rival) {
      const winner = h.me > h.rival ? host : guest, loser = winner === host ? guest : host
      await expect(winner.page.getByText('YOU WIN!')).toBeVisible()
      await expect(loser.page.getByText('YOU LOSE THIS ROUND')).toBeVisible()
    }
    await expect(host.page.getByRole('button', { name: 'PLAY AGAIN' })).toBeVisible()
  })

  expectNoPageErrors(host, guest, watcher)
  for (const { context } of [host, guest, watcher]) await context.close()
})
