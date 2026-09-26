// WIRE CROSSED: two players defuse a bomb together. The Tech (X on bomb 1)
// arms it, takes one deliberate strike, then solves every module through the
// UI while the Handbook watches the same strike and result arrive; NEXT BOMB
// then swaps the roles. The spec reads the bomb seed from the emulator (a
// test-only shortcut: in play the Handbook reads the manual aloud) and
// derives the solutions with the same pure generator the page uses.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import {
  MODULE_NAMES, TAP_MAX_MS, DIRS, generateBomb, isOpen, mazeDistances, solveLever, solveWires, stepCell,
} from '../../src/lib/wireLogic.js'

const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000'

async function readRoom(page) {
  const id = new URL(page.url()).pathname.split('/').pop()
  const res = await fetch(`http://${DB_HOST}/games/${id}.json?ns=demo-game-night-default-rtdb`, {
    headers: { Authorization: 'Bearer owner' },
  })
  return res.json()
}

const strikes = (page, n) => expect(page.getByRole('img', { name: `Strikes ${n} of 3` })).toBeVisible()

async function openModule(page, type) {
  await page.getByRole('tab', { name: new RegExp(MODULE_NAMES[type]) }).click()
}

async function solveModule(page, bomb, m) {
  await openModule(page, m.type)
  if (m.type === 'wires') {
    const n = solveWires(m, bomb).index + 1
    await page.getByRole('button', { name: new RegExp(`^Wire ${n}, `) }).click()
    await page.getByRole('button', { name: `CUT WIRE ${n}` }).click()
  } else if (m.type === 'keypad') {
    for (const g of m.solution) {
      const k = m.device.keys.indexOf(g) + 1
      const key = page.getByRole('button', { name: new RegExp(`^Glyph key ${k}`) })
      if ((await key.getAttribute('aria-label')).includes('pressed')) continue
      await key.click()
      // The last glyph clears the module and the device hops to the next one.
      await expect(page.getByRole('button', { name: `Glyph key ${k}, pressed` })
        .or(page.getByRole('tab', { name: /solved GLYPHS/ }))
        .or(page.getByText('DEFUSED!'))).toBeVisible()
    }
  } else if (m.type === 'lever') {
    const sol = solveLever(m, bomb)
    const lever = page.getByRole('button', { name: /^Lever reading/ })
    if (sol.tap) {
      await lever.click()
    } else {
      await lever.hover()
      await page.mouse.down()
      const started = Date.now()
      const timer = page.getByRole('timer')
      await expect.poll(async () => {
        const text = await timer.textContent()
        return Date.now() - started > TAP_MAX_MS + 100 && text.includes(String(sol.digit))
      }, { timeout: 15_000, intervals: [100] }).toBe(true)
      await page.mouse.up()
    }
  } else if (m.type === 'maze') {
    const dist = mazeDistances(m.manual.open, m.device.exit)
    let pos = m.device.start
    while (pos !== m.device.exit) {
      const dir = ['N', 'E', 'S', 'W'].find(d => isOpen(m.manual.open, pos, d) && dist[stepCell(pos, d)] === dist[pos] - 1)
      pos = stepCell(pos, dir)
      await page.getByRole('button', { name: `Move ${DIRS[dir].word.toLowerCase()}` }).click()
      if (pos !== m.device.exit) {
        await expect(page.getByText(new RegExp(`YOU ● ${'ABCDEF'[pos % 6]}${Math.floor(pos / 6) + 1} `))).toBeVisible()
      }
    }
  }
}

test('two players defuse a WIRE CROSSED bomb and swap roles', async ({ browser }) => {
  test.setTimeout(150_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('P1 creates the room and P2 joins', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'WIRE CROSSED')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
  })

  await test.step('X is the Tech on bomb 1; the Handbook waits', async () => {
    await expect(alice.page.getByRole('button', { name: 'ARM THE BOMB' })).toBeVisible()
    await expect(bob.page.getByText('WAITING FOR THE TECH TO ARM IT…')).toBeVisible()
    await alice.page.getByRole('button', { name: 'ARM THE BOMB' }).click()
    await expect(alice.page.getByRole('timer')).toBeVisible()
    await expect(bob.page.getByRole('timer')).toBeVisible()
    await expect(bob.page.getByRole('tablist', { name: 'Manual pages' })).toBeVisible()
  })

  const room = await readRoom(alice.page)
  const bomb = generateBomb(room.wire.seed, room.wire.level)

  await test.step('a wrong move is a strike on both screens', async () => {
    const keypad = bomb.modules.find(m => m.type === 'keypad')
    if (keypad) {
      await openModule(alice.page, 'keypad')
      const k = keypad.device.keys.indexOf(keypad.solution[1]) + 1
      await alice.page.getByRole('button', { name: new RegExp(`^Glyph key ${k}`) }).click()
    } else {
      const wires = bomb.modules.find(m => m.type === 'wires')
      await openModule(alice.page, 'wires')
      const right = solveWires(wires, bomb).index
      const wrong = right === 0 ? 2 : 1
      await alice.page.getByRole('button', { name: new RegExp(`^Wire ${wrong}, `) }).click()
      await alice.page.getByRole('button', { name: `CUT WIRE ${wrong}` }).click()
    }
    await strikes(alice.page, 1)
    await strikes(bob.page, 1)
    await expect(bob.page.getByText(/STRIKE −15s/)).toBeVisible()
  })

  await test.step('the Tech solves every module and both see the defuse', async () => {
    for (const m of bomb.modules) await solveModule(alice.page, bomb, m)
    await expect(alice.page.getByText('DEFUSED!')).toBeVisible()
    await expect(bob.page.getByText('DEFUSED!')).toBeVisible()
    await expect(bob.page.getByText('TEAM ★ 1').first()).toBeVisible()
  })

  await test.step('NEXT BOMB swaps the roles', async () => {
    await alice.page.getByRole('button', { name: 'NEXT BOMB' }).click()
    await bob.page.getByRole('button', { name: 'ACCEPT' }).click()
    await expect(bob.page.getByRole('button', { name: 'ARM THE BOMB' })).toBeVisible()
    await expect(alice.page.getByText('WAITING FOR THE TECH TO ARM IT…')).toBeVisible()
    await expect(alice.page.getByText('BOMB 2', { exact: true })).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
