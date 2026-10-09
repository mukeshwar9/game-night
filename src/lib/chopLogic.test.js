import { describe, it, expect } from 'vitest'
import {
  CHOP_GAME_MS, CHOP_VISIBLE, CHOP_WARN_CRATES, GHOST_LEVELS, GHOST_RATES,
  beamAt, normalizeChopStats, visibleRows, sideDanger, warnsStill, applyChop, chopRaceEntry, chopRow, ghostChops,
} from './chopLogic'
import { rankRace } from './raceLogic'

const SEED = 123456789
const safeSide = (seed, stats) => (sideDanger(seed, stats, 'L') ? 'R' : 'L')
// First row at or after `from` whose beam is `side`.
const rowWith = (seed, side, from = 1) => { for (let k = from; k < from + 500; k++) if (beamAt(seed, k) === side) return k; throw new Error('no beam') }
const at = (chops, extra = {}) => ({ chops, bonks: 0, streak: 0, best: 0, ...extra })

describe('beamAt', () => {
  it('is the same stack for the same seed', () => {
    const a = Array.from({ length: 80 }, (_, k) => beamAt(SEED, k))
    expect(Array.from({ length: 80 }, (_, k) => beamAt(SEED, k))).toEqual(a)
    expect(Array.from({ length: 80 }, (_, k) => beamAt(SEED + 1, k))).not.toEqual(a)
    // Reading rows out of order gives the same answers.
    expect(beamAt(SEED, 40)).toBe(a[40])
    expect(beamAt(SEED + 1, 3)).toBe(beamAt(SEED + 1, 3))
    expect(beamAt(SEED, 12)).toBe(a[12])
  })

  it('leaves the first crate clear and never stacks two beams in a row', () => {
    for (const seed of [1, 2, 3, SEED]) {
      expect(beamAt(seed, 0)).toBe('')
      for (let k = 1; k < 400; k++) if (beamAt(seed, k)) expect(beamAt(seed, k - 1), `${seed}:${k}`).toBe('')
    }
  })

  it('mixes left beams, right beams and clear crates', () => {
    const rows = Array.from({ length: 400 }, (_, k) => beamAt(SEED, k))
    for (const kind of ['L', 'R', '']) expect(rows.filter((b) => b === kind).length).toBeGreaterThan(40)
  })
})

describe('applyChop', () => {
  it('knocks out the bottom crate and builds a streak', () => {
    let s = null
    for (let i = 0; i < 20; i++) {
      const r = applyChop(SEED, s, safeSide(SEED, s))
      expect(r).toMatchObject({ chopped: true, bonk: false })
      s = r.stats
    }
    expect(s).toMatchObject({ chops: 20, bonks: 0, streak: 20, best: 20 })
  })

  it('always has a safe side', () => {
    let s = null
    for (let i = 0; i < 300; i++) {
      expect(sideDanger(SEED, s, 'L') && sideDanger(SEED, s, 'R')).toBe(false)
      s = applyChop(SEED, s, safeSide(SEED, s)).stats
    }
  })

  it('drops a beam on you when the next crate carries one on your side', () => {
    const k = rowWith(SEED, 'L')
    const r = applyChop(SEED, at(k - 1, { streak: 4, best: 4 }), 'L')
    // The crate still counts; the streak is gone; that beam is spent.
    expect(r).toMatchObject({ chopped: true, bonk: true })
    expect(r.stats).toMatchObject({ chops: k, bonks: 1, streak: 0, best: 5, cleared: k })
    expect(visibleRows(SEED, r.stats)[0]).toEqual({ row: k, beam: '' })
    expect(applyChop(SEED, r.stats, 'L')).toMatchObject({ chopped: true, bonk: false })
  })

  it('stops you walking into a beam that is already at the bottom', () => {
    const k = rowWith(SEED, 'R')
    // Stand on the left while the beam arrives, then step right into it.
    const r = applyChop(SEED, at(k, { streak: 3, best: 3 }), 'R')
    expect(r).toMatchObject({ chopped: false, bonk: true })
    expect(r.stats).toMatchObject({ chops: k, bonks: 1, streak: 0, best: 3, cleared: k })
  })

  it('ignores anything that is not LEFT or RIGHT', () => {
    expect(applyChop(SEED, at(3), 'X')).toMatchObject({ chopped: false, bonk: false, stats: { chops: 3 } })
  })
})

describe('what the racer sees', () => {
  it('shows the next crates from the bottom up', () => {
    const rows = visibleRows(SEED, at(7))
    expect(rows).toHaveLength(CHOP_VISIBLE)
    expect(rows.map((r) => r.row)).toEqual([7, 8, 9, 10, 11])
    expect(rows.map((r) => r.beam)).toEqual([7, 8, 9, 10, 11].map((k) => beamAt(SEED, k)))
  })

  it('flags the side a beam is on, at the bottom or about to land', () => {
    const k = rowWith(SEED, 'L')
    expect(sideDanger(SEED, at(k - 1), 'L')).toBe(true)   // lands on the next chop
    expect(sideDanger(SEED, at(k), 'L')).toBe(true)       // already at the bottom
    expect(sideDanger(SEED, at(k - 1), 'R')).toBe(false)
  })

  it('warns on the buttons only for the first crates', () => {
    expect(warnsStill(null)).toBe(true)
    expect(warnsStill(at(CHOP_WARN_CRATES - 1))).toBe(true)
    expect(warnsStill(at(CHOP_WARN_CRATES))).toBe(false)
  })

  it('reads junk stats as zero', () => {
    expect(normalizeChopStats({ chops: -3, bonks: 'x', streak: 2.9 })).toEqual({ chops: 0, bonks: 0, streak: 2, best: 0, cleared: -1 })
    expect(normalizeChopStats(undefined)).toEqual({ chops: 0, bonks: 0, streak: 0, best: 0, cleared: -1 })
  })
})

describe('race hooks', () => {
  it('ranks by crates, then by fewer beams, and treats no stats as a no-show', () => {
    expect(chopRaceEntry(null)).toEqual({ sortKey: null, score: null })
    const stats = { a: at(30, { bonks: 2 }), b: at(30, { bonks: 1 }), c: at(41, { bonks: 5 }) }
    const ranked = rankRace(['a', 'b', 'c', 'd'].map((id) => ({ id, ...chopRaceEntry(stats[id]) })))
    expect(ranked.order).toEqual(['c', 'b', 'a', 'd'])
  })

  it('labels a results row', () => {
    expect(chopRow(at(12, { bonks: 1, best: 9 }))).toMatchObject({ primary: '12 CRATES', secondary: '1 BEAM · BEST ×9', status: 'racing' })
    expect(chopRow(null)).toMatchObject({ primary: '0 CRATES', status: 'idle' })
  })
})

describe('ghostChops', () => {
  it('climbs steadily and stops at the bell', () => {
    for (const level of GHOST_LEVELS) {
      expect(ghostChops(level, 0)).toBe(0)
      expect(ghostChops(level, 10_000)).toBe(Math.floor(GHOST_RATES[level] * 10))
      expect(ghostChops(level, CHOP_GAME_MS * 2)).toBe(ghostChops(level, CHOP_GAME_MS))
    }
    expect(ghostChops('hard', CHOP_GAME_MS)).toBeGreaterThan(ghostChops('normal', CHOP_GAME_MS))
    expect(ghostChops('normal', CHOP_GAME_MS)).toBeGreaterThan(ghostChops('easy', CHOP_GAME_MS))
  })
})
