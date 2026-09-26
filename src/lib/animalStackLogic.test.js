import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PIECES, ROT_STEPS, FALL_Y, pieceSequence, pieceAt, roundSeed, startDrop, stepDrop, runDrop, replay,
  hashState, encodePoses, decodePoses, normalizeDrop, stateTop, spawnY, heartsFor, nextAlive,
  createMatch, applyOutcome, simResult,
} from './animalStackLogic'
import { mulberry32 } from './detMath'

// A seeded game: centre-biased drops that keep the tower standing a while.
function scriptedDrops(seed, n, spread = 60) {
  const rng = mulberry32(seed * 31 + 5), seq = pieceSequence(seed, n)
  return seq.map(k => ({ k, x: Math.round(rng() * spread * 2 - spread), r: [0, 0, 12, 6, 18][Math.floor(rng() * 5)] }))
}

describe('vendored planck', () => {
  it('calls no native Math.sin/Math.cos (determinism across JS engines)', () => {
    const src = readFileSync(new URL('./vendor/planck-det.js', import.meta.url), 'utf8')
    const code = src.split('\n').filter(l => !l.trimStart().startsWith('//')).join('\n')
    expect(code).not.toMatch(/Math\.(sin|cos)\b/)
    expect(code).toMatch(/__detSin/)
  })
})

describe('pieces', () => {
  it('has twelve animals of convex parts within planck limits', () => {
    expect(PIECES).toHaveLength(12)
    for (const p of PIECES) {
      expect(p.parts.length).toBeGreaterThan(0)
      for (const part of p.parts) {
        expect(part.length).toBeGreaterThanOrEqual(3)
        expect(part.length).toBeLessThanOrEqual(8)
      }
      expect(p.radius).toBeGreaterThan(0.2)
      expect(['p1', 'p2', 'p3', 'p4']).not.toContain(p.tone)
    }
  })

  it('deals every animal once per 12-bag, reproducibly', () => {
    const seq = pieceSequence(99, 24)
    expect(new Set(seq.slice(0, 12)).size).toBe(12)
    expect(new Set(seq.slice(12)).size).toBe(12)
    expect(pieceSequence(99, 24)).toEqual(seq)
    expect(pieceSequence(100, 24)).not.toEqual(seq)
    expect(pieceAt(99, 17)).toBe(seq[17])
  })

  it('gives each tower of a match its own seed', () => {
    expect(roundSeed(5, 1)).not.toBe(roundSeed(5, 2))
    expect(roundSeed(5, 2)).toBe(roundSeed(5, 2))
  })
})

describe('drops', () => {
  it('normalizes aim to integer cm in range and a 0-23 rotation step', () => {
    expect(normalizeDrop({ k: 1, x: 999.6, r: -1 })).toEqual({ k: 1, x: 320, r: ROT_STEPS - 1 })
    expect(normalizeDrop({ k: 1, x: -12.4, r: 25 })).toEqual({ k: 1, x: -12, r: 1 })
  })

  it('lands a centred drop on the empty island and settles', () => {
    const r = runDrop([], { k: 7, x: 0, r: 0 })
    expect(r.fell).toBe(false)
    expect(r.state).toHaveLength(1)
    expect(r.state[0].y).toBeGreaterThan(0)
    expect(Math.abs(r.state[0].x)).toBeLessThan(0.05)
  })

  it('topples when a piece is dropped off the island', () => {
    const r = runDrop([], { k: 3, x: 320, r: 0 })
    expect(r.fell).toBe(true)
    expect(r.state).toBeNull()
  })

  it('releases the piece just above the tower', () => {
    const sim = startDrop([], { k: 0, x: 0, r: 0 })
    expect(sim.dropBody.getPosition().y).toBeCloseTo(spawnY(0, 0), 9)
    stepDrop(sim)
    expect(sim.ticks).toBe(1)
    expect(sim.done).toBe(false)
  })

  it('detects a fall below FALL_Y within the tick cap', () => {
    const sim = startDrop([], { k: 11, x: -320, r: 0 })
    while (!sim.done) stepDrop(sim)
    expect(sim.fell).toBe(true)
    expect(sim.fellTick).toBeGreaterThan(0)
    expect(simResult(sim).fell).toBe(true)
    expect(FALL_Y).toBeLessThan(0)
  })
})

describe('replay determinism', () => {
  it('replaying seed + drops rebuilds the identical tower', () => {
    const drops = scriptedDrops(2, 6)
    const live = []
    let state = []
    for (const d of drops) {
      const r = runDrop(state, d)
      if (r.fell) break
      state = r.state; live.push(d)
    }
    expect(live.length).toBeGreaterThan(2)
    const again = replay(live)
    expect(again.fell).toBe(false)
    expect(again.hash).toBe(hashState(state))
    expect(again.state).toEqual(state)
  })

  it('stepwise and one-shot simulation agree tick for tick', () => {
    const first = runDrop([], { k: 3, x: 10, r: 0 }).state
    const d = { k: 5, x: -20, r: 6 }
    const sim = startDrop(first, d)
    while (!sim.done) stepDrop(sim)
    expect(simResult(sim).hash).toBe(runDrop(first, d).hash)
  })

  it('round-trips a tower through the checkpoint pose string', () => {
    const second = runDrop(runDrop([], { k: 3, x: 0, r: 0 }).state, { k: 7, x: 0, r: 0 })
    expect(second.fell).toBe(false)
    const state = second.state
    expect(decodePoses(encodePoses(state))).toEqual(state)
    expect(hashState(decodePoses(encodePoses(state)))).toBe(hashState(state))
    expect(decodePoses('')).toEqual([])
    expect(decodePoses('99,1,2,3;x')).toEqual([])
  })

  it('measures tower height from the canonical state', () => {
    expect(stateTop([])).toBe(0)
    const s = runDrop([], { k: 2, x: 0, r: 0 }).state
    expect(stateTop(s)).toBeGreaterThan(1)
  })
})

describe('match rules', () => {
  it('starts 3 hearts in a duel, 2 with 3-4 players, 1 in CLIMB', () => {
    expect(heartsFor(1)).toBe(1)
    expect(heartsFor(2)).toBe(3)
    expect(heartsFor(3)).toBe(2)
    expect(heartsFor(4)).toBe(2)
    expect(createMatch(3, 7).hearts).toEqual([2, 2, 2])
  })

  it('skips seats with no hearts', () => {
    expect(nextAlive([2, 0, 1], 0)).toBe(2)
    expect(nextAlive([2, 0, 1], 2)).toBe(0)
  })

  it('a standing drop grows the tower and passes the turn', () => {
    const m = createMatch(2, 1)
    const d = { k: 0, x: 0, r: 0 }
    const { match, event } = applyOutcome(m, d, runDrop([], d))
    expect(event).toBe('stand')
    expect(match.drops).toEqual([d])
    expect(match.turn).toBe(1)
    expect(match.maxHeight).toBeGreaterThan(0.5)
  })

  it('a topple costs the dropper a heart and restarts with them', () => {
    const m = { ...createMatch(3, 1), turn: 1 }
    const { match, event } = applyOutcome(m, { k: 0, x: 320, r: 0 }, { fell: true })
    expect(event).toBe('topple')
    expect(match.hearts).toEqual([2, 1, 2])
    expect(match.round).toBe(2)
    expect(match.state).toEqual([])
    expect(match.turn).toBe(1)
    expect(match.seed).toBe(roundSeed(1, 2))
  })

  it('an eliminated toppler hands the next tower on; last one standing wins', () => {
    const m = { ...createMatch(3, 1), hearts: [1, 1, 0], turn: 0 }
    const r1 = applyOutcome(m, { k: 0, x: 0, r: 0 }, { fell: true })
    expect(r1.event).toBe('win')
    expect(r1.match.winner).toBe(1)

    const m2 = { ...createMatch(3, 1), hearts: [1, 2, 2], turn: 0 }
    const r2 = applyOutcome(m2, { k: 0, x: 0, r: 0 }, { fell: true })
    expect(r2.event).toBe('topple')
    expect(r2.match.turn).toBe(1)
  })

  it('CLIMB ends on the first topple with no winner', () => {
    const r = applyOutcome(createMatch(1, 1), { k: 0, x: 0, r: 0 }, { fell: true })
    expect(r.event).toBe('win')
    expect(r.match.winner).toBeNull()
  })
})
