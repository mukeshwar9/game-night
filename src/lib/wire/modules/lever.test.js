import { describe, expect, it } from 'vitest'
import lever, { STRIP_SWITCH_MS, describeLeverRule, solveLever } from './lever'
import { bombCondHolds } from '../shell'
import { applyWireAction } from '../../wireLogic'
import { makeRng } from '../rng'
import { armedFor, clearModule, soloBomb } from '../testKit'

const SEEDS = Array.from({ length: 500 }, (_, i) => i)
const tapping = (bomb) => solveLever(bomb.modules[0], bomb).tap

describe('lever module', () => {
  it('taps on a label match, else holds for the strip digit', () => {
    const bomb = { serial: 'AB12C4', indicators: [{ label: 'SIG', lit: false }, { label: 'NAV', lit: false }] }
    const m = {
      type: 'lever',
      device: { color: 'blue', label: 'VENT', strip: 'yellow' },
      manual: {
        tapRules: [{ label: 'VENT' }, { color: 'red', cond: { kind: 'serialEven' } }],
        stripDigits: { red: 1, blue: 2, yellow: 7, white: 4, green: 5 },
      },
    }
    expect(solveLever(m, bomb)).toMatchObject({ tap: true, rule: 1 })
    m.device.label = 'LOCK'
    expect(solveLever(m, bomb)).toEqual({ tap: false, digit: 7 })
    m.device.color = 'red'
    expect(solveLever(m, bomb)).toMatchObject({ tap: true, rule: 2 })
  })

  it('solveNext clears every generated module', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('lever', seed)
      expect(clearModule(bomb, armedFor(bomb), 0).wire.strikes).toBe(0)
    }
  })

  it('F-04: release matches only the last clock digit', () => {
    const seed = SEEDS.find(s => !tapping(soloBomb('lever', s)))
    const bomb = soloBomb('lever', seed)
    const { digit } = solveLever(bomb.modules[0], bomb)
    const other = (digit + 1) % 10
    const release = (clock) => applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'release', clock }, 2000)
    expect(release(`0:0${digit}`).ok).toBe(true)
    expect(release(`${digit}:5${digit}`).ok).toBe(true)
    // the digit elsewhere in m:ss no longer passes
    expect(release(`${digit}:${other}${other}`).ok).toBe(false)
    expect(release(`1:${digit}${other}`).ok).toBe(false)
    expect(release('').ok).toBe(false)
  })

  it('a blind release now passes about one time in ten', () => {
    let passes = 0
    let total = 0
    for (const seed of SEEDS) {
      const bomb = soloBomb('lever', seed)
      if (tapping(bomb)) continue
      for (let s = 0; s < 180; s++) {
        const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
        total++
        if (applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'release', clock }, 2000).ok) passes++
      }
      if (total > 20_000) break
    }
    expect(passes / total).toBeCloseTo(0.1, 1)
  })

  it('strikes on a wrong action kind for the lever', () => {
    const tapBomb = soloBomb('lever', SEEDS.find(s => tapping(soloBomb('lever', s))))
    const holdBomb = soloBomb('lever', SEEDS.find(s => !tapping(soloBomb('lever', s))))
    expect(applyWireAction(armedFor(tapBomb), tapBomb, { mod: 0, kind: 'release', clock: '0:00' }, 2000).ok).toBe(false)
    expect(applyWireAction(armedFor(holdBomb), holdBomb, { mod: 0, kind: 'tap' }, 2000).ok).toBe(false)
    expect(applyWireAction(armedFor(holdBomb), holdBomb, { mod: 0, kind: 'cut', wire: 0 }, 2000)).toBeNull()
  })

  it('is deterministic per rng', () => {
    expect(lever.generate(makeRng('d'), 1)).toEqual(lever.generate(makeRng('d'), 1))
  })
})

const holdBomb = (tier) => soloBomb('lever', SEEDS.find(s => !tapping(soloBomb('lever', s, tier))), tier)
const tapBomb = (tier) => soloBomb('lever', SEEDS.find(s => tapping(soloBomb('lever', s, tier))), tier)

describe('lever module, tier II', () => {
  it('deals 3 tap rules, the third keyed on the serial and the label first letter', () => {
    let serialTaps = 0
    for (const seed of SEEDS) {
      const bomb = soloBomb('lever', seed, 2)
      const m = bomb.modules[0]
      expect(m.tier).toBe(2)
      expect(m.manual.tapRules).toHaveLength(3)
      expect(m.manual.tapRules[2]).toEqual({ serialLetter: true })
      expect(describeLeverRule(m.manual.tapRules[2], 2)).toMatch(/first letter/)
      const sol = solveLever(m, bomb)
      const earlier = m.device.label === m.manual.tapRules[0].label
        || (m.device.color === m.manual.tapRules[1].color && bombCondHolds(m.manual.tapRules[1].cond, bomb))
      if (!earlier) expect(sol.tap).toBe(bomb.serial.includes(m.device.label[0]))
      if (sol.rule === 3) serialTaps++
    }
    expect(serialTaps).toBeGreaterThan(0)
  })

  it('solveNext clears every module; the wrong action kind is a strike', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('lever', seed, 2)
      expect(clearModule(bomb, armedFor(bomb), 0).wire.strikes).toBe(0)
    }
    const t = tapBomb(2)
    const h = holdBomb(2)
    expect(applyWireAction(armedFor(t), t, { mod: 0, kind: 'release', clock: '0:00' }, 2000).ok).toBe(false)
    expect(applyWireAction(armedFor(h), h, { mod: 0, kind: 'tap' }, 2000).ok).toBe(false)
  })

  it('is deterministic per rng', () => {
    expect(lever.generate(makeRng('d'), 2)).toEqual(lever.generate(makeRng('d'), 2))
  })
})

describe('lever module, tier III', () => {
  it('deals a second strip that differs from the first; only the second counts', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('lever', seed, 3)
      const m = bomb.modules[0]
      expect(m.tier).toBe(3)
      expect(m.device.strip2).toBeDefined()
      expect(m.device.strip2).not.toBe(m.device.strip)
      const sol = solveLever(m, bomb)
      if (!sol.tap) expect(sol.digit).toBe(m.manual.stripDigits[m.device.strip2])
    }
  })

  it('solveNext clears every module, releasing after the 2000 ms switch', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('lever', seed, 3)
      const action = lever.solveNext(bomb.modules[0], bomb, null, 0)
      if (action.kind === 'release') expect(action.held).toBe(STRIP_SWITCH_MS)
      expect(clearModule(bomb, armedFor(bomb), 0).wire.strikes).toBe(0)
    }
  })

  it('a release held under 2000 ms is a strike, even on the right digit', () => {
    const bomb = holdBomb(3)
    const { digit } = solveLever(bomb.modules[0], bomb)
    const release = (held) => applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'release', clock: `0:0${digit}`, held }, 2000)
    expect(release(STRIP_SWITCH_MS).ok).toBe(true)
    expect(release(STRIP_SWITCH_MS + 500).ok).toBe(true)
    expect(release(STRIP_SWITCH_MS - 1).ok).toBe(false)
    expect(release(700).ok).toBe(false)
    expect(release(undefined).ok).toBe(false)
    expect(release(STRIP_SWITCH_MS).wire.strikes).toBe(0)
  })

  it('the first strip digit is a strike; a tap on a hold lever and a release on a tap lever too', () => {
    const bomb = holdBomb(3)
    const m = bomb.modules[0]
    const first = m.manual.stripDigits[m.device.strip]
    const res = applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'release', clock: `0:0${first}`, held: 2500 }, 2000)
    expect(res.ok).toBe(false)
    expect(applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'tap' }, 2000).ok).toBe(false)
    const t = tapBomb(3)
    expect(applyWireAction(armedFor(t), t, { mod: 0, kind: 'release', clock: '0:00', held: 3000 }, 2000).ok).toBe(false)
  })

  it('is deterministic per rng', () => {
    expect(lever.generate(makeRng('d'), 3)).toEqual(lever.generate(makeRng('d'), 3))
  })
})
