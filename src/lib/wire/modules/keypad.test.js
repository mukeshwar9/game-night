import { describe, expect, it } from 'vitest'
import keypad, { GLYPH_COUNT, GLYPH_TOTAL, KEYPAD_COLUMNS, KEYPAD_KEYS, isMirroredGlyph, keypadPage, pressedCount } from './keypad'
import { applyWireAction } from '../../wireLogic'
import { makeRng } from '../rng'
import { armedFor, clearModule, soloBomb } from '../testKit'

const SEEDS = Array.from({ length: 500 }, (_, i) => i)

describe('keypad module', () => {
  it('tier I shows four glyphs from exactly one manual column, in that column order', () => {
    for (const seed of SEEDS) {
      const m = soloBomb('keypad', seed).modules[0]
      expect(m.tier).toBe(1)
      expect(m.manual.columns).toHaveLength(KEYPAD_COLUMNS)
      expect(m.device.keys).toHaveLength(KEYPAD_KEYS)
      expect([...m.device.keys].sort()).toEqual([...m.solution].sort())
      m.manual.columns.flat().forEach(g => expect(g).toBeLessThan(GLYPH_COUNT))
      const holders = m.manual.columns.filter(col => m.solution.every(g => col.includes(g)))
      expect(holders).toHaveLength(1)
      const order = m.solution.map(g => holders[0].indexOf(g))
      expect(order).toEqual([...order].sort((a, b) => a - b))
    }
  })

  it('solveNext clears every generated module', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('keypad', seed)
      const { wire, steps } = clearModule(bomb, armedFor(bomb), 0)
      expect(wire.strikes).toBe(0)
      expect(steps).toBe(KEYPAD_KEYS)
    }
  })

  it('keeps progress through a wrong press and ignores a repeat', () => {
    const bomb = soloBomb('keypad', 7)
    const sol = bomb.modules[0].solution
    const wire = applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'press', glyph: sol[0] }, 2000).wire
    expect(pressedCount(wire, 0)).toBe(1)
    const wrong = applyWireAction(wire, bomb, { mod: 0, kind: 'press', glyph: sol[2] }, 2000)
    expect(wrong.ok).toBe(false)
    expect(wrong.wire.strikes).toBe(1)
    expect(pressedCount(wrong.wire, 0)).toBe(1)
    expect(applyWireAction(wire, bomb, { mod: 0, kind: 'press', glyph: sol[0] }, 2000)).toBeNull()
    expect(applyWireAction(wire, bomb, { mod: 0, kind: 'press', glyph: 99 }, 2000)).toBeNull()
  })

  it('is deterministic per rng', () => {
    expect(keypad.generate(makeRng('d'), 1)).toEqual(keypad.generate(makeRng('d'), 1))
  })
})

const holds = (col, keys) => keys.every(g => col.includes(g))
const inOrder = (col, keys) => {
  const at = keys.map(g => col.indexOf(g))
  return at.every((p, k) => k === 0 || p > at[k - 1])
}

describe('keypad module, tier II', () => {
  it('deals 5 keys and 6 columns of 7, with exactly one column holding all five in order', () => {
    for (const seed of SEEDS) {
      const m = soloBomb('keypad', seed, 2).modules[0]
      expect(m.tier).toBe(2)
      expect(m.device.keys).toHaveLength(5)
      expect(m.solution).toHaveLength(5)
      expect(m.manual.columns).toHaveLength(6)
      m.manual.columns.forEach(c => {
        expect(c).toHaveLength(7)
        expect(new Set(c).size).toBe(7)
        c.forEach(g => expect(g).toBeLessThan(GLYPH_COUNT))
      })
      const holders = m.manual.columns.filter(c => holds(c, m.solution))
      expect(holders).toHaveLength(1)
      expect(inOrder(holders[0], m.solution)).toBe(true)
    }
  })

  it('solveNext clears every module in 5 presses', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('keypad', seed, 2)
      const { wire, steps } = clearModule(bomb, armedFor(bomb), 0)
      expect(wire.strikes).toBe(0)
      expect(steps).toBe(5)
    }
  })

  it('is deterministic per rng', () => {
    expect(keypad.generate(makeRng('d'), 2)).toEqual(keypad.generate(makeRng('d'), 2))
  })
})

describe('keypad module, tier III', () => {
  const bombFor = (seed) => soloBomb('keypad', seed, 3)

  it('deals two pages of 6x7; the serial parity picks the page, with a decoy on the other', () => {
    let pageB = 0
    for (const seed of SEEDS) {
      const bomb = bombFor(seed)
      const m = bomb.modules[0]
      expect(m.tier).toBe(3)
      const page = keypadPage(bomb.serial)
      expect(page).toBe(Number(bomb.serial.slice(-1)) % 2 === 1 ? 0 : 1)
      expect(m.page).toBe(page)
      expect(m.manual.pages).toHaveLength(2)
      m.manual.pages.forEach(cols => {
        expect(cols).toHaveLength(6)
        cols.forEach(c => { expect(c).toHaveLength(7); expect(new Set(c).size).toBe(7) })
      })
      m.manual.pages[0].flat().forEach(g => expect(g).toBeLessThan(GLYPH_COUNT))
      m.manual.pages[1].flat().forEach(g => expect(g).toBeLessThan(GLYPH_TOTAL))
      const mine = m.manual.pages[page]
      const other = m.manual.pages[1 - page]
      const holders = mine.filter(c => holds(c, m.solution))
      expect(holders).toHaveLength(1)
      expect(inOrder(holders[0], m.solution)).toBe(true)
      expect(other.some(c => holds(c, m.solution))).toBe(false)
      expect(other.some(c => m.solution.filter(g => c.includes(g)).length === 4)).toBe(true)
      if (page === 1) {
        pageB++
        expect(m.solution.filter(isMirroredGlyph)).toHaveLength(1)
      } else {
        expect(m.solution.some(isMirroredGlyph)).toBe(false)
      }
    }
    expect(pageB).toBeGreaterThan(100)
  })

  it('solveNext clears every module in 5 presses', () => {
    for (const seed of SEEDS) {
      const bomb = bombFor(seed)
      const { wire, steps } = clearModule(bomb, armedFor(bomb), 0)
      expect(wire.strikes).toBe(0)
      expect(steps).toBe(5)
    }
  })

  it('a key out of order is a strike and keeps progress; a repeat is ignored', () => {
    const bomb = bombFor(11)
    const sol = bomb.modules[0].solution
    for (let ahead = 1; ahead < 5; ahead++) {
      const res = applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'press', glyph: sol[ahead] }, 2000)
      expect(res.ok).toBe(false)
      expect(res.wire.strikes).toBe(1)
      expect(pressedCount(res.wire, 0)).toBe(0)
    }
    const one = applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'press', glyph: sol[0] }, 2000).wire
    expect(pressedCount(one, 0)).toBe(1)
    expect(applyWireAction(one, bomb, { mod: 0, kind: 'press', glyph: sol[0] }, 2000)).toBeNull()
  })

  it('is deterministic per rng and serial', () => {
    const ctx = { serial: 'AB12C3' }
    expect(keypad.generate(makeRng('d'), 3, ctx)).toEqual(keypad.generate(makeRng('d'), 3, ctx))
  })
})
