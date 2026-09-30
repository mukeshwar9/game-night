import { describe, expect, it } from 'vitest'
import sw, { describeCond, describeLock, describeShort, isLocked, isShort, switchPath, switchState, switchTarget } from './switch'
import { applyWireAction, generateBomb } from '../../wireLogic'
import { makeRng } from '../rng'
import { armedFor, clearModule, soloBomb } from '../testKit'

const SEEDS = Array.from({ length: 500 }, (_, i) => i)
const TIERS = [1, 2, 3]
const N = { 1: 4, 2: 5, 3: 5 }

const act = (bomb, wire, action) => applyWireAction(wire, bomb, { mod: 0, ...action }, 2000)

describe('switch module', () => {
  it('deals 4/5/5 switches with 0/2/3 short circuits and a lock only at tier III', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const m = soloBomb('switch', seed, tier).modules[0]
        expect(m.tier).toBe(tier)
        expect(m.device.lights).toHaveLength(N[tier])
        m.device.lights.forEach(l => expect([null, 'red', 'yellow', 'green', 'blue']).toContain(l))
        expect(m.manual.shorts).toHaveLength([0, 0, 2, 3][tier])
        m.manual.shorts.forEach(s => expect(s.sw.length).toBeGreaterThanOrEqual(2))
        expect(m.manual.rules).toHaveLength(3)
        expect(m.manual.rules[2].cond).toBeNull()
        expect(!!m.manual.lock).toBe(tier === 3)
        if (m.manual.lock) expect(m.manual.lock.sw).not.toBe(m.manual.lock.until)
      }
    }
  })

  it('solveNext clears every module with no strike, at every tier', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const bomb = soloBomb('switch', seed, tier)
        const { wire } = clearModule(bomb, armedFor(bomb), 0)
        expect(wire.strikes).toBe(0)
        expect(wire.phase).toBe('over')
      }
    }
  })

  it('start and target are not short circuits, a path exists, and at tiers II-III the naive order fails', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const m = soloBomb('switch', seed, tier).modules[0]
        const { start } = m.device
        const target = switchTarget(m)
        expect(isShort(m, start)).toBe(false)
        expect(isShort(m, target)).toBe(false)
        expect(switchPath(m, start, target)).not.toBeNull()
        if (tier < 2) continue
        let state = start
        let hit = false
        for (let k = 0; k < N[tier]; k++) {
          if (((state ^ target) >> k & 1) === 0) continue
          if (isLocked(m, state, k) || isShort(m, state ^ (1 << k))) { hit = true; break }
          state ^= 1 << k
        }
        expect(hit).toBe(true)
      }
    }
  })

  it('flipping into a short circuit strikes and the flip is undone', () => {
    let checked = 0
    for (const seed of SEEDS) {
      const bomb = soloBomb('switch', seed, 2)
      const m = bomb.modules[0]
      const { start } = m.device
      const k = Array.from({ length: 5 }, (_, j) => j).find(j => isShort(m, start ^ (1 << j)))
      if (k === undefined) continue
      const res = act(bomb, armedFor(bomb), { kind: 'flip', sw: k })
      expect(res.ok).toBe(false)
      expect(res.wire.strikes).toBe(1)
      expect(switchState(res.wire, 0, m)).toBe(start)
      expect(res.wire.last.text).toMatch(/SHORT CIRCUIT/)
      checked++
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('a flip on a locked switch returns null: no write, no strike', () => {
    let checked = 0
    for (const seed of SEEDS) {
      const bomb = soloBomb('switch', seed, 3)
      const m = bomb.modules[0]
      const { sw: locked } = m.manual.lock
      if (!isLocked(m, m.device.start, locked)) continue
      expect(act(bomb, armedFor(bomb), { kind: 'flip', sw: locked })).toBeNull()
      checked++
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('isLocked and isShort are pure functions of the board', () => {
    const m = {
      device: { lights: [null, null, null, null, null], start: 0 },
      manual: { shorts: [{ sw: [2, 3], up: [true, true] }], lock: { sw: 4, until: 2 }, rules: [] },
    }
    expect(isShort(m, 0b01100)).toBe(true)
    expect(isShort(m, 0b11100)).toBe(true)
    expect(isShort(m, 0b00100)).toBe(false)
    expect(isLocked(m, 0b00000, 4)).toBe(true)
    expect(isLocked(m, 0b00100, 4)).toBe(false)
    expect(isLocked(m, 0b00000, 1)).toBe(false)
    expect(isLocked(m, 0b00000)).toBe(true)
    expect(isLocked({ manual: {} }, 0, 0)).toBe(false)
  })

  it('returns null for bad payloads and clears when the board equals the target', () => {
    const bomb = soloBomb('switch', 5, 1)
    const wire = armedFor(bomb)
    expect(act(bomb, wire, { kind: 'flip', sw: 9 })).toBeNull()
    expect(act(bomb, wire, { kind: 'flip', sw: -1 })).toBeNull()
    expect(act(bomb, wire, { kind: 'flip', sw: 0.5 })).toBeNull()
    expect(act(bomb, wire, { kind: 'wiggle', sw: 0 })).toBeNull()
    const { wire: done } = clearModule(bomb, wire, 0)
    expect(done.solved[0]).toBe(true)
  })

  it('is deterministic per rng', () => {
    for (const tier of TIERS) {
      expect(sw.generate(makeRng('d'), tier)).toEqual(sw.generate(makeRng('d'), tier))
    }
  })

  it('a bitmask of 0 is a real value that round-trips through a Firebase-shaped read', () => {
    const m = soloBomb('switch', 3, 1).modules[0]
    expect(m.device.start).not.toBe(0)
    expect(switchState({ mods: { 0: { touched: true, sw: 0 } } }, 0, m)).toBe(0)
    expect(switchState({ mods: { 0: { touched: true } } }, 0, m)).toBe(0)
    expect(switchState({ mods: { 0: { touched: true, sw: '5' } } }, 0, m)).toBe(5)
    expect(switchState({ mods: { 0: { touched: true, sw: 99 } } }, 0, m)).toBe(m.device.start)
    expect(switchState({ mods: {} }, 0, m)).toBe(m.device.start)
    expect(switchState(null, 0, m)).toBe(m.device.start)
  })

  it('describes conditions, short circuits and the lock in manual words', () => {
    expect(describeCond({ kind: 'colorCount', colors: ['red', 'yellow'], min: 2 })).toBe('two or more lights RED or YELLOW')
    expect(describeCond({ kind: 'dark', sw: 2 })).toBe('light 3 dark')
    expect(describeCond({ kind: 'color', sw: 0, color: 'blue' })).toBe('light 1 BLUE')
    expect(describeShort({ sw: [2, 3], up: [true, true] })).toBe('switches 3 and 4 both ▲')
    expect(describeShort({ sw: [0, 1, 4], up: [false, false, false] })).toBe('switches 1, 2 and 5 all ▼')
    expect(describeShort({ sw: [1, 3], up: [true, false] })).toBe('switch 2 ▲ and switch 4 ▼')
    expect(describeLock({ sw: 4, until: 2 })).toBe('switch 5 is locked until switch 3 is ▲')
  })

  it('deals switch in medium and hard bombs but never in easy', () => {
    const seen = new Set()
    for (const mode of ['easy', 'medium', 'hard']) {
      for (let s = 0; s < 60; s++) generateBomb(`s${s}`, 1, mode).modules.forEach(m => m.type === 'switch' && seen.add(mode))
    }
    expect([...seen].sort()).toEqual(['hard', 'medium'])
  })
})
