import { describe, expect, it } from 'vitest'
import callsign, { callsignAnswer, callsignTransmit, shiftWord, trueWheels } from './callsign'
import { callsignWords } from '../callsignWords'
import { makeRng } from '../rng'
import { makeShell, serialLastDigit } from '../shell'

const SEEDS = Array.from({ length: 500 }, (_, i) => i)
const TIERS = [1, 2, 3]

function soloBomb(seed, tier) {
  const rng = makeRng(`kit:callsign:${seed}`)
  const shell = makeShell(rng)
  const module = callsign.generate(rng, tier, { level: 1, mode: 'easy', serial: shell.serial, indicators: shell.indicators })
  return { seed: String(seed), level: 1, ...shell, modules: [module] }
}

const judge = (bomb, action) => callsign.judge(bomb.modules[0], bomb, {}, 0, action)
const spellable = (word, wheels) => word.length === wheels.length && Array.from(word).every((ch, k) => wheels[k].includes(ch))

describe('callsign module', () => {
  it('deals 4 wheels of 4 letters at tier I and 5 wheels of 6 at tiers II-III', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const m = soloBomb(seed, tier).modules[0]
        const n = tier === 1 ? 4 : 5
        const size = tier === 1 ? 4 : 6
        expect(m.tier).toBe(tier)
        expect(m.manual.length).toBe(n)
        expect(m.device.wheels).toHaveLength(n)
        m.device.wheels.forEach(w => {
          expect(w).toMatch(/^[A-Z]+$/)
          expect(w).toHaveLength(size)
          expect(new Set(w).size).toBe(size)
        })
      }
    }
  })

  it('exactly one list word is spellable and at least 3 survive the first wheel', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const m = soloBomb(seed, tier).modules[0]
        const words = callsignWords(m.manual.length)
        const wheels = trueWheels(m)
        expect(words.filter(w => spellable(w, wheels))).toHaveLength(1)
        expect(words.filter(w => wheels[0].includes(w[0])).length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('solveNext clears the module with no strike, at every tier', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const bomb = soloBomb(seed, tier)
        const action = callsign.solveNext(bomb.modules[0], bomb, {}, 0)
        expect(action).toMatchObject({ mod: 0, kind: 'transmit' })
        const res = judge(bomb, action)
        expect(res.ok).toBe(true)
        expect(res.solved).toBe(true)
      }
    }
  })

  it('a wrong word is a strike and does not solve', () => {
    for (const tier of TIERS) {
      const bomb = soloBomb(7, tier)
      const right = callsign.solveNext(bomb.modules[0], bomb, {}, 0).word
      const wrong = right.slice(1) + right[0] === right ? right.replace(right[0], right[0] === 'Z' ? 'Y' : 'Z') : right.slice(1) + right[0]
      const res = judge(bomb, { kind: 'transmit', word: wrong })
      expect(res.ok).toBe(false)
      expect(res.solved).toBe(false)
      expect(res.text).toMatch(/NO ANSWER/)
    }
  })

  it('returns null for bad payloads', () => {
    const bomb = soloBomb(3, 1)
    expect(judge(bomb, { kind: 'transmit', word: 'AB' })).toBeNull()
    expect(judge(bomb, { kind: 'transmit', word: 'abcd' })).toBeNull()
    expect(judge(bomb, { kind: 'transmit', word: 1234 })).toBeNull()
    expect(judge(bomb, { kind: 'transmit' })).toBeNull()
    expect(judge(bomb, { kind: 'wiggle', word: 'ABCD' })).toBeNull()
  })

  it('is deterministic per rng', () => {
    for (const tier of TIERS) {
      const ctx = { serial: 'AB12C7', indicators: [] }
      expect(callsign.generate(makeRng('d'), tier, ctx)).toEqual(callsign.generate(makeRng('d'), tier, ctx))
    }
  })
})

describe('callsign module, tier III shift', () => {
  it('shiftWord shifts forward mod 26: digit 4 turns LEMON into PIQSR', () => {
    expect(shiftWord('LEMON', 4)).toBe('PIQSR')
    expect(shiftWord('PIQSR', -4)).toBe('LEMON')
    expect(shiftWord('XYZ', 4)).toBe('BCD')
    expect(shiftWord('LEMON', 0)).toBe('LEMON')
  })

  it('the wheels show the true letters shifted by the serial last digit; the transmit word is shifted too', () => {
    let nonZero = 0
    for (const seed of SEEDS) {
      const bomb = soloBomb(seed, 3)
      const m = bomb.modules[0]
      const digit = serialLastDigit(bomb.serial)
      expect(m.manual.shift).toBe(digit)
      const answer = callsignAnswer(m)
      const transmit = callsignTransmit(m)
      expect(transmit).toBe(shiftWord(answer, digit))
      // the shifted word is spellable from the wheels as shown
      expect(spellable(transmit, m.device.wheels)).toBe(true)
      expect(callsign.solveNext(m, bomb, {}, 0).word).toBe(transmit)
      if (digit) {
        nonZero++
        expect(judge(bomb, { kind: 'transmit', word: answer })?.ok).toBe(transmit === answer)
      }
    }
    expect(nonZero).toBeGreaterThan(0)
  })

  it('a hand-built digit-4 module: the wheels show PIQSR for LEMON', () => {
    const m = { type: 'callsign', tier: 3, manual: { length: 5, shift: 4 }, device: { wheels: ['PGKTUV', 'IAWXYB', 'QCDFHJ', 'SZELMN', 'RBOTUV'] } }
    expect(callsignAnswer(m)).toBe('LEMON')
    expect(callsignTransmit(m)).toBe('PIQSR')
    expect(callsign.judge(m, {}, {}, 0, { kind: 'transmit', word: 'PIQSR' }).solved).toBe(true)
    expect(callsign.judge(m, {}, {}, 0, { kind: 'transmit', word: 'LEMON' }).ok).toBe(false)
  })

  it('tiers I and II are not shifted', () => {
    for (const tier of [1, 2]) expect(soloBomb(1, tier).modules[0].manual.shift).toBe(0)
  })
})
