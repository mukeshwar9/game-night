// WIRE CROSSED: two players pick a mode together, then defuse a run of bombs.
// Alice (X) proposes a mode, Bob declines once and accepts a second proposal,
// the Tech arms, takes one deliberate strike and solves every module through
// the UI while the Handbook watches; NEXT BOMB swaps the roles and level 2
// ends in MODE CLEARED. The spec reads the bomb seed from the emulator (a
// test-only shortcut: in play the Handbook reads the manual aloud) and drives
// each module with the pure generator's solveNext, the same one the unit
// tests use.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import {
  COLOR_LETTERS, DIRS, MODIFIERS, MODULES, MODULE_NAMES, TAP_MAX_MS, generateBomb, isOpen, solveWires,
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
const modePicker = (page) => page.getByRole('group', { name: 'Mode', exact: true })

async function openModule(page, index) {
  await page.getByRole('tablist', { name: 'Modules' }).getByRole('tab').nth(index).click()
}

// Do what the UI needs for one solveNext action on module `m`.
async function perform(page, m, action) {
  if (action.kind === 'cut') {
    const n = action.wire + 1
    await page.getByRole('button', { name: new RegExp(`^Wire ${n}, `) }).click()
    await page.getByRole('button', { name: `CUT WIRE ${n}` }).click()
  } else if (action.kind === 'press' && m.type === 'relay') {
    await page.getByRole('button', { name: new RegExp(`^Key position ${action.key + 1},`) }).click()
  } else if (action.kind === 'tx') {
    // Step the dial until it reads the answer, then send.
    const esc = action.freq.replace('.', '\\.')
    for (let n = 0; n < m.device.freqs.length; n++) {
      if (await page.getByLabel(new RegExp(`^Dial at ${esc} megahertz`)).count()) break
      await page.getByRole('button', { name: 'Next frequency' }).click()
    }
    await page.getByRole('button', { name: 'TX', exact: true }).click()
  } else if (action.kind === 'transmit') {
    // Spin each wheel up until it shows the answer's letter, then send.
    for (let k = 0; k < action.word.length; k++) {
      for (let n = 0; n < m.device.wheels[k].length; n++) {
        if (await page.getByLabel(`Wheel ${k + 1}, letter ${action.word[k]}`, { exact: true }).count()) break
        await page.getByRole('button', { name: `Wheel ${k + 1} up`, exact: true }).click()
      }
    }
    await page.getByRole('button', { name: 'TRANSMIT', exact: true }).click()
  } else if (action.kind === 'press') {
    const k = m.device.keys.indexOf(action.glyph) + 1
    await page.getByRole('button', { name: new RegExp(`^Glyph key ${k}`) }).click()
  } else if (action.kind === 'tap') {
    await page.getByRole('button', { name: /^Lever reading/ }).click()
  } else if (action.kind === 'release') {
    // Hold past the tap limit (and the tier III strip switch, action.held), then let go when the clock's last digit matches.
    const digit = action.clock.slice(-1)
    await page.getByRole('button', { name: /^Lever reading/ }).hover()
    await page.mouse.down()
    const started = Date.now()
    const timer = page.getByRole('timer')
    await expect.poll(async () => {
      const text = await timer.textContent()
      return Date.now() - started > Math.max(TAP_MAX_MS, action.held ?? 0) + 100 && text.slice(-1) === digit
    }, { timeout: 15_000, intervals: [100] }).toBe(true)
    await page.mouse.up()
  } else if (action.kind === 'patch') {
    const letter = COLOR_LETTERS[m.device.plugs[action.plug]]
    await page.getByRole('button', { name: new RegExp(`^Plug ${letter},`) }).click()
    await page.getByRole('button', { name: new RegExp(`^Socket ${action.socket + 1},`) }).click()
  } else if (action.kind === 'unplug') {
    const letter = COLOR_LETTERS[m.device.plugs[action.plug]]
    await page.getByRole('button', { name: new RegExp(`^Plug ${letter},`) }).click()
    await page.getByRole('button', { name: 'UNPLUG', exact: true }).click()
  } else if (action.kind === 'flip') {
    await page.getByRole('button', { name: new RegExp(`^Switch ${action.sw + 1},`) }).click()
  } else if (action.kind === 'vent') {
    await page.getByRole('button', { name: `VALVE ${action.valve}`, exact: true }).click()
  } else if (action.kind === 'move') {
    await page.getByRole('button', { name: `Move ${DIRS[action.dir].word.toLowerCase()}` }).click()
  }
}

// One loop over solveNext: read the synced node, take the next correct action,
// wait for the write to land, repeat until the module is solved.
// A "+G" bomb also has a Pressure Gauge that keeps filling. Between module steps
// the Tech vents it once the Gauge's own solveNext says the needle is in AMBER
// or RED (the emulator and the browser share this machine's clock).
async function ventGaugeIfDue(page, bomb) {
  const g = bomb.modules.findIndex(m => m.type === 'gauge')
  if (g < 0) return false
  const { wire } = await readRoom(page)
  if (wire.phase !== 'armed') return false
  const action = MODULES.gauge.solveNext(bomb.modules[g], bomb, wire, g, Date.now())
  if (!action) return false
  await openModule(page, g)
  await perform(page, bomb.modules[g], action)
  await expect.poll(async () => (await readRoom(page)).wire.gauge?.vents ?? 0, { timeout: 10_000, intervals: [100] })
    .toBeGreaterThan(wire.gauge?.vents ?? 0)
  return true
}

async function solveModule(page, bomb, i) {
  const m = bomb.modules[i]
  await openModule(page, i)
  for (let step = 0; step < 80; step++) {
    if (await ventGaugeIfDue(page, bomb)) await openModule(page, i)
    const { wire } = await readRoom(page)
    if (wire.phase !== 'armed' || wire.solved?.[i]) return
    const before = JSON.stringify([wire.mods, wire.solved, wire.phase, wire.strikes])
    await perform(page, m, MODULES[m.type].solveNext(m, bomb, wire, i, 0))
    await expect.poll(async () => {
      const now = (await readRoom(page)).wire
      return JSON.stringify([now.mods, now.solved, now.phase, now.strikes])
    }, { timeout: 10_000, intervals: [100] }).not.toBe(before)
  }
  throw new Error(`module ${i} (${m.type}) did not clear`)
}

async function solveBomb(page, bomb) {
  for (let i = 0; i < bomb.modules.length; i++) {
    if (bomb.modules[i].type !== 'gauge') await solveModule(page, bomb, i)
  }
}

const liveBomb = async (page) => {
  const { wire } = await readRoom(page)
  return generateBomb(wire.seed, wire.level, wire.mode)
}

test('two players pick EASY together and clear both levels to MODE CLEARED', async ({ browser }) => {
  test.setTimeout(240_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await test.step('P1 creates the room and P2 joins', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'WIRE CROSSED')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
  })

  await test.step('nothing can be armed until a mode is agreed', async () => {
    await expect(alice.page.getByRole('button', { name: 'PICK A MODE FIRST' })).toBeDisabled()
    await expect(modePicker(alice.page).getByRole('button', { name: /^EASY/ })).toBeVisible()
    await expect(modePicker(bob.page).getByRole('button', { name: /^HARD/ })).toBeVisible()
  })

  await test.step('a declined proposal changes nothing', async () => {
    await modePicker(alice.page).getByRole('button', { name: /^HARD/ }).click()
    await expect(modePicker(alice.page).getByRole('button', { name: 'CANCEL' })).toBeVisible()
    await expect(modePicker(bob.page).getByText('ALICE PROPOSES HARD')).toBeVisible()
    await modePicker(bob.page).getByRole('button', { name: 'DECLINE' }).click()
    await expect(modePicker(alice.page).getByRole('button', { name: 'CANCEL' })).toBeHidden()
    await expect(alice.page.getByRole('button', { name: 'PICK A MODE FIRST' })).toBeDisabled()
  })

  await test.step('Alice proposes EASY, Bob accepts', async () => {
    await modePicker(alice.page).getByRole('button', { name: /^EASY/ }).click()
    await expect(modePicker(bob.page).getByText('ALICE PROPOSES EASY')).toBeVisible()
    await modePicker(bob.page).getByRole('button', { name: 'ACCEPT' }).click()
    await expect(alice.page.getByText(/EASY · Level 1 of 2/)).toBeVisible()
    await expect(bob.page.getByText(/EASY · Level 1 of 2/)).toBeVisible()
    await expect(alice.page.getByRole('button', { name: 'ARM THE BOMB' })).toBeEnabled()
    await expect(bob.page.getByText('WAITING FOR THE TECH TO ARM IT…')).toBeVisible()
  })

  await test.step('the Tech arms; both screens run the clock', async () => {
    await alice.page.getByRole('button', { name: 'ARM THE BOMB' }).click()
    await expect(alice.page.getByRole('timer')).toBeVisible()
    await expect(bob.page.getByRole('timer')).toBeVisible()
    await expect(bob.page.getByRole('tablist', { name: 'Manual pages' })).toBeVisible()
  })

  const bomb1 = await liveBomb(alice.page)

  await test.step('a wrong move is a strike on both screens', async () => {
    const keypad = bomb1.modules.findIndex(m => m.type === 'keypad')
    if (keypad >= 0) {
      await openModule(alice.page, keypad)
      const m = bomb1.modules[keypad]
      const k = m.device.keys.indexOf(m.solution[1]) + 1
      await alice.page.getByRole('button', { name: new RegExp(`^Glyph key ${k}`) }).click()
    } else if (bomb1.modules.some(m => m.type === 'wires')) {
      const i = bomb1.modules.findIndex(m => m.type === 'wires')
      await openModule(alice.page, i)
      const right = solveWires(bomb1.modules[i], bomb1).index
      const wrong = right === 0 ? 2 : 1
      await alice.page.getByRole('button', { name: new RegExp(`^Wire ${wrong}, `) }).click()
      await alice.page.getByRole('button', { name: `CUT WIRE ${wrong}` }).click()
    } else {
      // Lever + Pipes: walk into a pipe wall.
      const i = bomb1.modules.findIndex(m => m.type === 'maze')
      const m = bomb1.modules[i]
      await openModule(alice.page, i)
      const wall = ['N', 'E', 'S', 'W'].find(d => !isOpen(m.manual.open, m.device.start, d))
      await alice.page.getByRole('button', { name: `Move ${DIRS[wall].word.toLowerCase()}` }).click()
    }
    await strikes(alice.page, 1)
    await strikes(bob.page, 1)
    await expect(bob.page.getByText(/STRIKE −15s/)).toBeVisible()
  })

  await test.step('the Tech solves level 1 and both see the defuse', async () => {
    await solveBomb(alice.page, bomb1)
    await expect(alice.page.getByText('DEFUSED!')).toBeVisible()
    await expect(bob.page.getByText('DEFUSED!')).toBeVisible()
    await expect(bob.page.getByText('TEAM ★ 1').first()).toBeVisible()
    await expect(bob.page.getByText(/NEXT: LEVEL 2 OF 2/)).toBeVisible()
  })

  await test.step('NEXT BOMB swaps the roles and deals level 2', async () => {
    await alice.page.getByRole('button', { name: 'NEXT BOMB' }).click()
    await bob.page.getByRole('button', { name: 'ACCEPT' }).click()
    await expect(bob.page.getByRole('button', { name: 'ARM THE BOMB' })).toBeVisible()
    await expect(alice.page.getByText('WAITING FOR THE TECH TO ARM IT…')).toBeVisible()
    await expect(alice.page.getByText('BOMB 2', { exact: true })).toBeVisible()
    await expect(alice.page.getByText(/EASY · Level 2 of 2/)).toBeVisible()
    // Easy level 2 deals one mild modifier: Scrambled Pages or Errata (never Blackout or Swap).
    const preview = await liveBomb(bob.page)
    expect(preview.modifiers).toHaveLength(1)
    expect(['scrambled', 'errata']).toContain(preview.modifiers[0])
    await expect(alice.page.getByText(MODIFIERS[preview.modifiers[0]].name).first()).toBeVisible()
  })

  await test.step('level 2 arms: the Handbook shows its modifier (page order or the errata slip)', async () => {
    await bob.page.getByRole('button', { name: 'ARM THE BOMB' }).click()
    await expect(alice.page.getByRole('tablist', { name: 'Manual pages' })).toBeVisible()
    const bomb2 = await liveBomb(bob.page)
    const tabs = alice.page.getByRole('tablist', { name: 'Manual pages' }).getByRole('tab')
    await expect(tabs).toHaveCount(bomb2.modules.length)
    if (bomb2.errata) {
      await tabs.nth(bomb2.errata.mod).click()
      await expect(alice.page.getByRole('note', { name: 'Errata' })).toContainText('ERRATA')
    } else {
      expect(bomb2.pageOrder).toHaveLength(bomb2.modules.length)
      for (let pos = 0; pos < bomb2.pageOrder.length; pos++) {
        await expect(tabs.nth(pos)).toHaveText(new RegExp(MODULE_NAMES[bomb2.modules[bomb2.pageOrder[pos]].type]))
      }
    }
  })

  await test.step('the new Tech solves level 2 and the run is cleared', async () => {
    await solveBomb(bob.page, await liveBomb(bob.page))
    await expect(alice.page.getByText('MODE CLEARED')).toBeVisible()
    await expect(bob.page.getByText('MODE CLEARED')).toBeVisible()
    await expect(bob.page.getByText(/EASY CLEARED · \d+:\d\d · 0 BOOMS/)).toBeVisible()
    await expect(alice.page.getByText(/EASY CLEARS 1 · BEST \d+:\d\d/)).toBeVisible()
    await expect(alice.page.getByRole('button', { name: 'RUN AGAIN' })).toBeVisible()
    await expect(alice.page.getByRole('button', { name: 'CHANGE MODE' })).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
