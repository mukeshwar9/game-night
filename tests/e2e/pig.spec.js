// Pig's fair dice across two clients: the seed coin flip completes, each ROLL
// is a request stamped with the server's time that a client resolves in a
// transaction, and both screens agree on every roll with no mismatch warning
// (src/lib/diceLogic.js, src/hooks/room/pigSeedProtocol.js).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'
import { rollFace } from '../../src/lib/diceLogic.js'

const NS = 'demo-game-night-default-rtdb'
const readRoom = async (url) => {
  const id = url.split('/').pop()
  const res = await fetch(`${DB_ORIGIN}/games/${id}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}

const atRisk = (page) => page.getByText('AT RISK', { exact: true }).locator('xpath=following-sibling::div[1]')
const rollButton = (page) => page.getByRole('button', { name: /^(Roll the dice|Rolling, please wait)/ })
const mismatch = (page) => page.getByText('ROLL MISMATCH — TAMPERING SUSPECTED')

test('Pig rolls resolve the same on both screens', async ({ browser }) => {
  test.setTimeout(120_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('two players open a Pig room', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'PIG')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
  })

  await test.step('the seed coin flip completes on both sides', async () => {
    for (const p of [alice, bob]) {
      await expect(p.page.getByRole('button', { name: 'How fair roll verification works' })).toBeVisible()
    }
  })

  await test.step('rolls land identically for both players', async () => {
    let rolls = 0
    for (let i = 0; i < 8; i++) {
      const mover = (await alice.page.getByText('YOUR TURN').isVisible()) ? alice : bob
      await expect(mover.page.getByText('YOUR TURN')).toBeVisible()
      const before = await mover.page.evaluate(() => document.body.innerText)
      await rollButton(mover.page).click()
      // The request resolves (by either client) and the button frees up again
      // on whichever screen now has the turn.
      await expect.poll(async () => (await mover.page.evaluate(() => document.body.innerText)) !== before).toBe(true)
      await expect(alice.page.getByText('ROLLING…')).toHaveCount(0)
      await expect(bob.page.getByText('ROLLING…')).toHaveCount(0)
      await expect.poll(async () => (await atRisk(alice.page).textContent()) === (await atRisk(bob.page).textContent())).toBe(true)
      rolls++
    }
    expect(rolls).toBe(8)
  })

  await test.step('a bank reaches both players', async () => {
    const mover = (await alice.page.getByText('YOUR TURN').isVisible()) ? alice : bob
    // Roll until there is something at risk to bank.
    while ((await atRisk(mover.page).textContent()) === '0' && await mover.page.getByText('YOUR TURN').isVisible()) {
      await rollButton(mover.page).click()
      await expect(mover.page.getByText('ROLLING…')).toHaveCount(0)
    }
    if (await mover.page.getByText('YOUR TURN').isVisible()) {
      await mover.page.getByRole('button', { name: /^Bank \d+ points/ }).click()
      await expect(atRisk(alice.page)).toHaveText('0')
      await expect(atRisk(bob.page)).toHaveText('0')
    }
  })

  await test.step('the stored rolls come from server-stamped requests', async () => {
    const room = await readRoom(alice.page.url())
    expect(room.diceRollIndex).toBeGreaterThanOrEqual(8)
    // The last request carries the server's clock, and its face is the one shown.
    expect(room.diceRoll.i).toBe(room.diceRollIndex - 1)
    expect(Math.abs(room.diceRoll.at - Date.now())).toBeLessThan(5 * 60_000)
    if (room.diceLast != null) expect(room.diceLast).toBe(rollFace(room.diceSeed, room.diceRoll.i, room.diceRoll.at))
  })

  await expect(mismatch(alice.page)).toHaveCount(0)
  await expect(mismatch(bob.page)).toHaveCount(0)
  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
