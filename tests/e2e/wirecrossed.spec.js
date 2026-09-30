// WIRE CROSSED: two players choose one shared difficulty, solve Bomb 1, swap
// Tech / Handbook roles, then play Bomb 2 without a rematch proposal. The spec
// reads a deterministic seed from the emulator (test-only) and derives each
// answer with the same pure generator the page uses.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import {
  MODULE_NAMES, TAP_MAX_MS, DIRS, generateBomb, isOpen, mazeDistances, solveLever, solveSwitchboard, solveWires, stepCell,
} from '../../src/lib/wireLogic.js'

const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000'

async function readRoom(page) {
  const id = new URL(page.url()).pathname.split('/').pop()
  const res = await fetch(`http://${DB_HOST}/games/${id}.json?ns=demo-game-night-default-rtdb`, {
    headers: { Authorization: 'Bearer owner' },
  })
  return res.json()
}

async function writeWireSeed(page, seed) {
  const id = new URL(page.url()).pathname.split('/').pop()
  const res = await fetch(`http://${DB_HOST}/games/${id}/wire/seed.json?ns=demo-game-night-default-rtdb`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify(seed),
  })
  expect(res.ok).toBe(true)
}

function seedWithSwitchboard(level) {
  return Array.from({ length: 1000 }, (_, i) => `wire-switchboard-e2e-${i}`).find(seed => {
    const module = generateBomb(seed, level, 2).modules.find(m => m.type === 'switchboard')
    return module && solveSwitchboard(module).some(Boolean)
  })
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
  } else if (m.type === 'switchboard') {
    const desired = solveSwitchboard(m)
    for (let i = 0; i < desired.length; i++) {
      const button = page.getByRole('button', { name: new RegExp(`^Switch ${i + 1},`) })
      const pressed = (await button.getAttribute('aria-pressed')) === 'true'
      if (pressed !== desired[i]) await button.click()
    }
    await page.getByRole('button', { name: 'COMMIT PATTERN' }).click()
    await expect(page.getByRole('tab', { name: /SWITCHES/ }).or(page.getByText('DEFUSED!'))).toBeVisible()
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

test('two players choose difficulty, defuse a bomb, and swap roles without a rematch proposal', async ({ browser }) => {
  test.setTimeout(150_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('P1 creates the room and P2 joins', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'WIRE CROSSED')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
  })

  await test.step('both clients enable v2; X chooses one difficulty for both bombs', async () => {
    await expect(alice.page.getByRole('button', { name: /NORMAL/ })).toBeVisible()
    await expect(bob.page.getByText('WAITING FOR TECH TO PICK…')).toBeVisible()
    await expect.poll(async () => (await readRoom(alice.page)).wire?.generatorVersion).toBe(2)
    const seed = seedWithSwitchboard(3)
    expect(seed).toBeTruthy()
    await alice.page.getByRole('button', { name: /NORMAL/ }).click()
    await expect.poll(async () => {
      const room = await readRoom(alice.page)
      return [room.wire?.difficulty, room.wire?.level]
    }).toEqual(['normal', 3])
    await writeWireSeed(alice.page, seed)
    await expect(alice.page.getByRole('button', { name: 'ARM THE BOMB' })).toBeVisible()
    await expect(bob.page.getByText('WAITING FOR THE TECH TO ARM IT…')).toBeVisible()
    await alice.page.getByRole('button', { name: 'ARM THE BOMB' }).click()
    await expect(alice.page.getByRole('timer')).toBeVisible()
    await expect(bob.page.getByRole('timer')).toBeVisible()
    await expect(bob.page.getByRole('tablist', { name: 'Manual pages' })).toBeVisible()
  })

  const room = await readRoom(alice.page)
  const bomb = generateBomb(room.wire.seed, room.wire.level, room.wire.generatorVersion)

  await test.step('a wrong move is a strike on both screens', async () => {
    const keypad = bomb.modules.find(m => m.type === 'keypad')
    const switchboard = bomb.modules.find(m => m.type === 'switchboard')
    if (switchboard) {
      await openModule(alice.page, 'switchboard')
      await alice.page.getByRole('button', { name: 'COMMIT PATTERN' }).click()
    } else if (keypad) {
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

  await test.step('NEXT BOMB swaps roles inside same match and keeps difficulty', async () => {
    await alice.page.getByRole('button', { name: 'SWAP ROLES · NEXT BOMB' }).click()
    await expect(bob.page.getByRole('button', { name: 'ARM THE BOMB' })).toBeVisible()
    await expect(alice.page.getByText('WAITING FOR THE TECH TO ARM IT…')).toBeVisible()
    const next = await readRoom(alice.page)
    expect(next.wire).toMatchObject({ bombNo: 2, difficulty: 'normal', level: 3, generatorVersion: 2, tech: 'O' })
    expect(next.wire.seed).not.toBe(room.wire.seed)
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('second bomb still runs after first bomb booms', async ({ browser }) => {
  test.setTimeout(90_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  await onboard(alice.page, 'Alice')
  await createRoom(alice.page, 'WIRE CROSSED')
  await joinViaInvite(bob.page, alice.page.url(), 'Bob')

  await expect(alice.page.getByRole('button', { name: /EASY/ })).toBeVisible()
  await expect.poll(async () => (await readRoom(alice.page)).wire?.generatorVersion).toBe(2)
  const seed = seedWithSwitchboard(1)
  expect(seed).toBeTruthy()
  await alice.page.getByRole('button', { name: /EASY/ }).click()
  await expect.poll(async () => (await readRoom(alice.page)).wire?.difficulty).toBe('easy')
  await writeWireSeed(alice.page, seed)
  await alice.page.getByRole('button', { name: 'ARM THE BOMB' }).click()
  const room = await readRoom(alice.page)
  const bomb = generateBomb(room.wire.seed, room.wire.level, room.wire.generatorVersion)
  const index = bomb.modules.findIndex(m => m.type === 'switchboard')
  expect(index).toBeGreaterThanOrEqual(0)
  await openModule(alice.page, 'switchboard')

  for (let strike = 1; strike <= 3; strike++) {
    await alice.page.getByRole('button', { name: 'COMMIT PATTERN' }).click()
    await strikes(alice.page, strike)
  }
  await expect(alice.page.getByText('BOOM', { exact: true })).toBeVisible()
  await expect(bob.page.getByText('BOOM', { exact: true })).toBeVisible()
  await alice.page.getByRole('button', { name: 'SWAP ROLES · NEXT BOMB' }).click()
  await expect(bob.page.getByRole('button', { name: 'ARM THE BOMB' })).toBeVisible()
  await expect(alice.page.getByText('WAITING FOR THE TECH TO ARM IT…')).toBeVisible()
  const next = await readRoom(alice.page)
  expect(next.wire).toMatchObject({ bombNo: 2, difficulty: 'easy', level: 1, generatorVersion: 2, tech: 'O' })
  expect(next.wire.stats).toMatchObject({ defused: 0, booms: 1 })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
