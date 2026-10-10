// Sticky Fingers: the online duel across two clients (the host's sim is the one
// table both screens draw, and a stash by either player scores on both), the
// solo table against a bot, and the one-phone table seating 2-4
// (src/lib/stickyLogic.js, src/pages/StickyFingersGame.jsx, StickyFingersDemo.jsx).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const TABLE_W = 360
const TABLE_H = 560

const table = (page) => page.getByTestId('sticky-table')
const score = async (page, seat) => {
  const label = await page.getByTestId(`sticky-score-${seat}`).getAttribute('aria-label')
  return Number(label.split(': ').pop())
}
const lootOf = async (page) => JSON.parse((await table(page).getAttribute('data-loot')) || '[]')

// Table units → screen point. The guest's table is drawn turned around.
async function toScreen(page, x, y, flipped) {
  const box = await table(page).boundingBox()
  const fx = flipped ? TABLE_W - x : x
  const fy = flipped ? TABLE_H - y : y
  return { x: box.x + (fx / TABLE_W) * box.width, y: box.y + (fy / TABLE_H) * box.height }
}

// Press on the nearest landed, un-held, non-dye item and drag it into the safe.
async function stash(page, safe, flipped) {
  const loot = await expect.poll(async () => {
    const all = await lootOf(page)
    return all.filter(([, kind, , , held]) => (kind === 'coin' || kind === 'bill' || kind === 'gem') && !held)
  }, { timeout: 20_000 }).not.toHaveLength(0).then(() => lootOf(page))
  const [, , x, y] = loot
    .filter(([, kind, , , held]) => (kind === 'coin' || kind === 'bill' || kind === 'gem') && !held)
    .sort((a, b) => Math.hypot(a[2] - safe.x, a[3] - safe.y) - Math.hypot(b[2] - safe.x, b[3] - safe.y))[0]
  const from = await toScreen(page, x, y, flipped)
  const home = await toScreen(page, safe.x, safe.y, flipped)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.waitForTimeout(250)
  await page.mouse.move(home.x, home.y, { steps: 12 })
  await page.waitForTimeout(300)
  await page.mouse.up()
}

test('Sticky Fingers: a stash by either player scores on both screens', async ({ browser }) => {
  test.setTimeout(150_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players open a room and the table goes live', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'STICKY FINGERS')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    for (const p of [alice, bob]) {
      await expect(table(p.page)).toBeVisible()
      // The connecting / countdown overlay sits on the table until play starts.
      await expect(p.page.getByTestId('sticky-overlay')).toHaveCount(0, { timeout: 30_000 })
      expect(await score(p.page, 0)).toBe(0)
      expect(await score(p.page, 1)).toBe(0)
    }
  })

  await test.step('the host drags loot into their safe', async () => {
    await stash(alice.page, { x: 180, y: TABLE_H - 46 }, false)
    for (const p of [alice, bob]) await expect.poll(() => score(p.page, 0), { timeout: 15_000 }).toBeGreaterThan(0)
  })

  await test.step('the guest drags loot into theirs, from the table turned around', async () => {
    await stash(bob.page, { x: 180, y: 46 }, true)
    for (const p of [alice, bob]) await expect.poll(() => score(p.page, 1), { timeout: 15_000 }).toBeGreaterThan(0)
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('Sticky Fingers: solo table against a bot, and one phone for 2-4', async ({ browser }) => {
  const me = await newPlayer(browser)
  await me.page.goto('/solo/stickyfingers')
  await expect(table(me.page)).toBeVisible()
  await expect(me.page.getByTestId('sticky-score-0')).toHaveAttribute('aria-label', 'YOU: 0')
  await expect(me.page.getByTestId('sticky-score-1')).toHaveAttribute('aria-label', 'BOT: 0')

  await me.page.getByRole('button', { name: '3 BOTS' }).click()
  await expect(me.page.getByTestId('sticky-score-3')).toBeVisible()

  await me.page.getByRole('button', { name: 'ONE PHONE' }).click()
  await me.page.getByRole('button', { name: '3 PLAYERS' }).click()
  await expect(me.page.getByTestId('sticky-score-2')).toBeVisible()
  await expect(me.page.getByTestId('sticky-score-3')).toHaveCount(0)

  await me.page.goto('/local/stickyfingers')
  await expect(table(me.page)).toBeVisible()
  await expect(me.page.getByRole('button', { name: 'SOLO', exact: true })).toHaveCount(0)
  await me.page.getByRole('button', { name: '4 PLAYERS' }).click()
  await expect(me.page.getByTestId('sticky-score-3')).toBeVisible()

  expectNoPageErrors(me)
  await me.context.close()
})

// Two fingers on one item at the same moment is a tug: whoever lets go first
// loses it, the last hand still holding keeps it, and if nobody lets go the
// item snaps (CONTEST_WINDOW 0.5 s, CONTEST_CAP 3 s in src/lib/stickyLogic.js).
test('Sticky Fingers: two hands on one item is a tug, the last one holding keeps it, and it snaps at the cap', async ({ browser }) => {
  test.setTimeout(90_000)
  const me = await newPlayer(browser)
  await me.page.goto('/local/stickyfingers')
  await expect(table(me.page)).toBeVisible()

  // A synthetic finger: its own pointer id, in table units.
  const finger = (type, id, x, y) => me.page.evaluate(([t, pid, tx, ty]) => {
    const cv = document.querySelector('[data-testid="sticky-table"]')
    const r = cv.getBoundingClientRect()
    cv.dispatchEvent(new PointerEvent(t, {
      bubbles: true, cancelable: true, pointerId: pid, pointerType: 'touch', isPrimary: pid === 1,
      clientX: r.left + (tx / 360) * r.width, clientY: r.top + (ty / 560) * r.height,
    }))
  }, [type, id, x, y])
  const holdersOf = async (id) => (await lootOf(me.page)).find(([lid]) => lid === id)?.[4] ?? null

  // Wait for a landed coin / bill / gem, then put one finger from each end of the table on it.
  let target
  await expect.poll(async () => {
    target = (await lootOf(me.page)).find(([, kind, , , held]) => (kind === 'coin' || kind === 'bill' || kind === 'gem') && !held)
    return Boolean(target)
  }, { timeout: 30_000 }).toBe(true)
  const [id, , x, y] = target
  await finger('pointerdown', 1, x, 470)    // nearest the bottom safe: player 1's hand
  await finger('pointerdown', 2, x, 90)     // nearest the top safe: player 2's hand
  await finger('pointermove', 1, x, y)
  await finger('pointermove', 2, x, y)
  await expect.poll(() => holdersOf(id), { timeout: 5_000 }).toBe(2)

  await test.step('the hand that lets go first loses it; the other keeps holding', async () => {
    await finger('pointerup', 2, x, y)
    await expect.poll(() => holdersOf(id), { timeout: 5_000 }).toBe(1)
    await finger('pointerup', 1, x, y)
  })

  await test.step('nobody lets go: the item snaps and nobody scores', async () => {
    let next
    await expect.poll(async () => {
      next = (await lootOf(me.page)).find(([lid, kind, , , held]) => lid !== id && (kind === 'coin' || kind === 'bill' || kind === 'gem') && !held)
      return Boolean(next)
    }, { timeout: 20_000 }).toBe(true)
    const [nid, , nx, ny] = next
    await finger('pointerdown', 3, nx, 470)
    await finger('pointerdown', 4, nx, 90)
    await finger('pointermove', 3, nx, ny)
    await finger('pointermove', 4, nx, ny)
    await expect.poll(() => holdersOf(nid), { timeout: 5_000 }).toBe(2)
    await expect.poll(() => holdersOf(nid), { timeout: 6_000 }).toBeNull()      // gone: snapped, not stashed
    expect(await score(me.page, 0)).toBe(0)
    expect(await score(me.page, 1)).toBe(0)
    await finger('pointerup', 3, nx, ny)
    await finger('pointerup', 4, nx, ny)
  })

  expectNoPageErrors(me)
  await me.context.close()
})
