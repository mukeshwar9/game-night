import { describe, expect, it } from 'vitest'
import pulse, {
  LONG_ON_MS, OFF_MS, PAUSE_MS, SHORT_ON_MS, cycleMs, expandFlashes, flashAt, toFlashes,
} from './pulse'
import { makeRng } from '../rng'
import { makeShell } from '../shell'

const SEEDS = Array.from({ length: 500 }, (_, i) => i)
const TIERS = [1, 2, 3]

// pulse is not in the registry yet, so drive its judge directly.
function soloPulse(seed, tier) {
  const rng = makeRng(`kit:pulse:${seed}`)
  const shell = makeShell(rng)
  const module = pulse.generate(rng, tier, { level: 1, mode: 'medium', serial: shell.serial, indicators: shell.indicators })
  return { bomb: { seed: String(seed), level: 1, ...shell, modules: [module] }, module }
}

const rotations = (s) => Array.from({ length: s.length - 1 }, (_, k) => s.slice(k + 1) + s.slice(0, k + 1)).filter(r => r !== s)

describe('pulse module', () => {
  it('deals the codebook size, unique patterns and unique frequencies per tier', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const { module: m } = soloPulse(seed, tier)
        const entries = m.manual.entries
        expect(m.tier).toBe(tier)
        expect(entries).toHaveLength(tier === 1 ? 8 : 12)
        expect(new Set(entries.map(e => e.pattern)).size).toBe(entries.length)
        expect(new Set(entries.map(e => e.freq)).size).toBe(entries.length)
        entries.forEach(e => {
          expect(e.pattern).toMatch(tier === 3 ? /^[RBGY]{5}$/ : /^[RBGY]{4}$/)
          expect(e.freq).toMatch(/^[3-9]\.\d\d$/)
        })
      }
    }
  })

  it("the lamp's pattern is exactly one codebook entry and names the answer", () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const { module: m } = soloPulse(seed, tier)
        const hits = m.manual.entries.filter(e => e.pattern === expandFlashes(m.device.flashes))
        expect(hits).toHaveLength(1)
        expect(hits[0].freq).toBe(m.answer)
      }
    }
  })

  it('dial frequencies are the codebook frequencies, sorted ascending', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS.slice(0, 100)) {
        const { module: m } = soloPulse(seed, tier)
        const freqs = m.device.freqs
        expect([...freqs].sort()).toEqual(m.manual.entries.map(e => e.freq).sort())
        freqs.slice(1).forEach((f, k) => expect(Number(f)).toBeGreaterThan(Number(freqs[k])))
      }
    }
  })

  it('tier I: no two entries share a 2-flash prefix and there are no long flashes', () => {
    for (const seed of SEEDS) {
      const { module: m } = soloPulse(seed, 1)
      expect(new Set(m.manual.entries.map(e => e.pattern.slice(0, 2))).size).toBe(8)
      expect(m.device.flashes.some(f => f.long)).toBe(false)
    }
  })

  it('tier II: prefixes are shared and a rotation of the lamp pattern is also in the codebook', () => {
    for (const seed of SEEDS) {
      const { module: m } = soloPulse(seed, 2)
      const target = expandFlashes(m.device.flashes)
      const patterns = m.manual.entries.map(e => e.pattern)
      expect(new Set(patterns.map(p => p.slice(0, 2))).size).toBeLessThan(12)
      expect(patterns.filter(p => p.slice(0, 2) === target.slice(0, 2)).length).toBeGreaterThan(1)
      expect(rotations(target).some(r => patterns.includes(r))).toBe(true)
      expect(m.device.flashes.some(f => f.long)).toBe(false)
    }
  })

  it('tier III: the lamp uses long flashes, counted double, and the manual lists expanded forms', () => {
    for (const seed of SEEDS) {
      const { module: m } = soloPulse(seed, 3)
      const target = expandFlashes(m.device.flashes)
      const patterns = m.manual.entries.map(e => e.pattern)
      expect(m.device.flashes.some(f => f.long)).toBe(true)
      expect(m.device.flashes.length).toBeLessThan(target.length)
      expect(target).toHaveLength(5)
      expect(rotations(target).some(r => patterns.includes(r))).toBe(true)
      patterns.forEach(p => expect(p).not.toMatch(/[^RBGY]/))
    }
  })

  it('a long flash counts as two of that colour', () => {
    const flashes = [{ color: 'red', long: true }, { color: 'blue', long: false }, { color: 'green', long: false }]
    expect(expandFlashes(flashes)).toBe('RRBG')
    expect(toFlashes('RRBG', true)).toEqual(flashes)
    expect(toFlashes('RRBG')).toEqual([
      { color: 'red', long: false }, { color: 'red', long: false }, { color: 'blue', long: false }, { color: 'green', long: false },
    ])
  })

  it('solveNext solves every module with no strike, at every tier', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const { bomb, module } = soloPulse(seed, tier)
        const action = pulse.solveNext(module, bomb, {}, 0, 2000)
        expect(action).toEqual({ mod: 0, kind: 'tx', freq: module.answer })
        const verdict = pulse.judge(module, bomb, {}, 0, action, 2000)
        expect(verdict.ok).toBe(true)
        expect(verdict.solved).toBe(true)
      }
    }
  })

  it('every other codebook frequency is a strike and does not solve', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS.slice(0, 100)) {
        const { bomb, module } = soloPulse(seed, tier)
        module.device.freqs.filter(f => f !== module.answer).forEach(freq => {
          const verdict = pulse.judge(module, bomb, {}, 0, { mod: 0, kind: 'tx', freq }, 2000)
          expect(verdict.ok).toBe(false)
          expect(verdict.solved).toBe(false)
          expect(verdict.progress).toEqual({ touched: true, last: freq })
          expect(verdict.text).toMatch(/WRONG FREQUENCY/)
        })
      }
    }
  })

  it('returns null for a frequency off the dial and for other action kinds', () => {
    const { bomb, module } = soloPulse(3, 1)
    expect(pulse.judge(module, bomb, {}, 0, { mod: 0, kind: 'tx', freq: '1.00' }, 2000)).toBeNull()
    expect(pulse.judge(module, bomb, {}, 0, { mod: 0, kind: 'tx' }, 2000)).toBeNull()
    expect(pulse.judge(module, bomb, {}, 0, { mod: 0, kind: 'flip', freq: module.answer }, 2000)).toBeNull()
  })

  it('accepts a numeric-looking frequency string exactly as dealt', () => {
    const { bomb, module } = soloPulse(9, 2)
    expect(pulse.judge(module, bomb, {}, 0, { mod: 0, kind: 'tx', freq: module.answer }, 2000).ok).toBe(true)
  })

  it('is deterministic per rng', () => {
    for (const tier of TIERS) {
      expect(pulse.generate(makeRng('d'), tier, {})).toEqual(pulse.generate(makeRng('d'), tier, {}))
    }
  })
})

describe('pulse timeline', () => {
  const module = {
    device: { flashes: [{ color: 'red', long: false }, { color: 'blue', long: true }, { color: 'green', long: false }] },
  }
  const armedAt = 10_000

  it('cycle is the pause, every flash, and a gap between flashes', () => {
    expect(cycleMs(module)).toBe(PAUSE_MS + SHORT_ON_MS + LONG_ON_MS + SHORT_ON_MS + OFF_MS * 2)
  })

  it('the pause marks the start of the loop, and the first flash follows it', () => {
    expect(flashAt(module, armedAt, armedAt)).toMatchObject({ pause: true, on: false, index: -1, color: null })
    expect(flashAt(module, armedAt, armedAt + PAUSE_MS - 1).pause).toBe(true)
    expect(flashAt(module, armedAt, armedAt + PAUSE_MS)).toEqual({ pause: false, on: true, color: 'red', long: false, index: 0 })
  })

  it('walks short and long flashes with their gaps', () => {
    const at = (t) => flashAt(module, armedAt, armedAt + PAUSE_MS + t)
    expect(at(SHORT_ON_MS - 1)).toMatchObject({ on: true, index: 0 })
    expect(at(SHORT_ON_MS)).toMatchObject({ on: false, index: 0, color: 'red' })
    expect(at(SHORT_ON_MS + OFF_MS - 1)).toMatchObject({ on: false, index: 0 })
    const second = SHORT_ON_MS + OFF_MS
    expect(at(second)).toEqual({ pause: false, on: true, color: 'blue', long: true, index: 1 })
    expect(at(second + LONG_ON_MS - 1).on).toBe(true)
    expect(at(second + LONG_ON_MS).on).toBe(false)
    const third = second + LONG_ON_MS + OFF_MS
    expect(at(third)).toMatchObject({ on: true, color: 'green', index: 2 })
    expect(at(third + SHORT_ON_MS - 1).on).toBe(true)
    expect(at(third + SHORT_ON_MS)).toMatchObject({ pause: true, on: false })
  })

  it('repeats every cycle and stays in the pause before arming', () => {
    const cycle = cycleMs(module)
    for (const t of [0, 1700, 2400, 3000, cycle - 1]) {
      expect(flashAt(module, armedAt, armedAt + t + cycle * 7)).toEqual(flashAt(module, armedAt, armedAt + t))
    }
    expect(flashAt(module, armedAt, armedAt - 5000).pause).toBe(true)
    expect(flashAt(module, undefined, 5).pause).toBe(true)
  })

  it('depends only on its arguments', () => {
    expect(flashAt.length).toBe(3)
    const first = flashAt(module, armedAt, armedAt + 2500)
    expect(flashAt(module, armedAt, armedAt + 2500)).toEqual(first)
  })

  it('works on generated modules at every tier', () => {
    for (const tier of TIERS) {
      const { module: m } = soloPulse(4, tier)
      const cycle = cycleMs(m)
      const seen = new Set()
      for (let t = 0; t < cycle; t += 25) {
        const f = flashAt(m, 0, t)
        if (f.on) seen.add(f.index)
      }
      expect(seen.size).toBe(m.device.flashes.length)
    }
  })
})
