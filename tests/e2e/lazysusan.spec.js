// Lazy Susan across two clients: the lobby starts a match, both screens turn
// the same plate, a piece taken by one player is gone for the other (a
// write-once claim in the room), and the first to the target ends the match on
// both screens (src/lib/lazySusanLogic.js, src/pages/LazySusanGame.jsx).
import { test, expect } from '@playwright/test'
import { completeOnboarding, createRoom, expectNoPageErrors, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'demo-game-night-default-rtdb'
const readRoom = async (url) => {
  const id = url.split('/').pop()
  const res = await fetch(`${DB_ORIGIN}/games/${id}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}

async function joinNamed(page, roomUrl, name) {
  await onboard(page, name)
  await page.goto(roomUrl)
  const invited = page.getByRole('heading', { name: /YOU.RE INVITED/ })
  const lobby = page.getByText(/^PLAYERS \(\d\/4\)/)
  await expect(invited.or(lobby)).toBeVisible()
  if (await invited.isVisible()) await completeOnboarding(page, name, 'JOIN GAME')
  await expect(lobby).toBeVisible()
}

const arena = (page) => page.getByTestId('lazysusan-arena')
const scores = async (page) => (await arena(page).getAttribute('data-scores'))?.split(',').map(Number) ?? []

// Taps whenever this player's gate holds something worth eating, with a pause
// between taps, until `until(el)` says stop. Runs inside the page so the tap
// lands in the same frame the gate lights up.
function playUntil(page, stopWhen, ms) {
  return page.evaluate(({ stopWhen: stop, ms: limit }) => new Promise((resolve) => {
    const el = document.querySelector('[data-testid="lazysusan-arena"]')
    const r = el.getBoundingClientRect()
    const t0 = performance.now()
    let wait = 0
    const tick = (t) => {
      const done = stop === 'over' ? el.dataset.phase === 'over' : stop === 'scored' ? el.dataset.scores.split(',').some((n) => Number(n) > 0) : false
      if (done || t - t0 > limit) { resolve({ phase: el.dataset.phase, scores: el.dataset.scores }); return }
      if (el.dataset.phase === 'play' && el.dataset.aim === 'eat' && t > wait) {
        wait = t + 300
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1 }))
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }), { stopWhen, ms })
}

test('Lazy Susan: one shared plate, a claim is final, first to the target ends it', async ({ browser }) => {
  test.setTimeout(240_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players start a match from the lobby', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'LAZY SUSAN')
    await joinNamed(bob.page, alice.page.url(), 'Bob')
    await expect(alice.page.getByText('PLAYERS (2/4)')).toBeVisible()
    await alice.page.getByRole('button', { name: 'START MATCH' }).click()
    for (const p of [alice, bob]) {
      await expect(arena(p.page)).toBeVisible()
      await expect(arena(p.page)).toHaveAttribute('data-phase', 'count')
    }
  })

  await test.step('the countdown ends on both screens and the plate is live', async () => {
    for (const p of [alice, bob]) await expect(arena(p.page)).toHaveAttribute('data-phase', 'play', { timeout: 15_000 })
  })

  await test.step('a piece Alice takes shows as her point on both screens', async () => {
    await playUntil(alice.page, 'scored', 30_000)
    await expect.poll(async () => (await scores(alice.page))[0]).toBeGreaterThan(0)
    await expect.poll(async () => (await scores(bob.page))[0]).toBeGreaterThan(0)
    const room = await readRoom(alice.page.url())
    const claims = Object.values(room.round.lsClaims ?? {})
    expect(claims.length).toBeGreaterThan(0)
    expect(new Set(claims.map((c) => c.by)).size).toBeGreaterThan(0)
    expect(claims.every((c) => typeof c.at === 'number')).toBe(true)
  })

  await test.step('both play on; the first to the target ends the match everywhere', async () => {
    await Promise.all([playUntil(alice.page, 'over', 120_000), playUntil(bob.page, 'over', 120_000)])
    for (const p of [alice, bob]) {
      await expect(arena(p.page)).toHaveAttribute('data-phase', 'over')
      await expect(p.page.getByTestId('lazysusan-result')).toBeVisible()
    }
    const a = await scores(alice.page)
    expect(await scores(bob.page)).toEqual(a)
    expect(Math.max(...a)).toBeGreaterThanOrEqual(15)

    const room = await readRoom(alice.page.url())
    expect(room.status).toBe('finished')
    expect(typeof room.winner).toBe('string')
    // Exactly one screen says YOU WIN.
    const wins = await Promise.all([alice, bob].map((p) => p.page.getByTestId('lazysusan-result').getByText('YOU WIN!').count()))
    expect(wins.reduce((s, n) => s + n, 0)).toBe(1)
  })

  await test.step('the host can start a new match', async () => {
    await alice.page.getByRole('button', { name: 'NEW MATCH' }).click()
    await expect(alice.page.getByRole('button', { name: 'START MATCH' })).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
