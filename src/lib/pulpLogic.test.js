import { describe, expect, it } from 'vitest'
import {
  ARENA_H, ARENA_W, DOUBLE_CHOP_MS, DUEL_MS, GRAVITY, HARVEST_TARGET_PER_PLAYER, PIECE_R, ROT_PENALTY, STUN_MS, TEAM_HEARTS,
  applySwipe, buildCourse, comboGain, countDropped, createField, fieldHearts, fieldScore, harvestDecided, harvestEntry,
  harvestTeam, normalizePulpStats, piecesInFlight, positionAt, pulpRaceEntry, pulpRow, pulpStats, segmentHitsCircle,
} from './pulpLogic'

// A swipe straight through a piece's position at `t` (horizontal, fast).
function swipeThrough(piece, t, dx = 0.2) {
  const pos = positionAt(piece, t)
  return { ax: pos.x - dx, ay: pos.y, bx: pos.x + dx, by: pos.y, t0: t - 20, t1: t }
}

// A hand-built piece launched at (x, y) at t = 1000 ms. Explicit swipes in
// these tests happen at t1 = 1000, where it sits exactly at (x, y).
function pieceAt(id, x, y, extra = {}) {
  return { id, kind: 'fruit', sprite: 'lime', owner: null, launchAt: 1000, x0: x, y0: y, vx: 0, vy: 0, flightMs: 100_000, spin: 0, ...extra }
}

describe('buildCourse', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(buildCourse(42, DUEL_MS)).toEqual(buildCourse(42, DUEL_MS))
    expect(buildCourse(42, DUEL_MS)).not.toEqual(buildCourse(43, DUEL_MS))
  })

  it('launches everything inside the round, sorted, with a rot-free opening', () => {
    const course = buildCourse(7, DUEL_MS)
    expect(course.length).toBeGreaterThan(20)
    for (let i = 1; i < course.length; i++) expect(course[i].launchAt).toBeGreaterThanOrEqual(course[i - 1].launchAt)
    expect(course.at(-1).launchAt).toBeLessThan(DUEL_MS)
    expect(course.filter(p => p.launchAt < 2500).every(p => p.kind === 'fruit')).toBe(true)
  })

  it('seeds some rotten apples, at most one per wave', () => {
    const rots = [1, 2, 3, 4, 5].flatMap(s => buildCourse(s, DUEL_MS).filter(p => p.kind === 'rot'))
    expect(rots.length).toBeGreaterThan(0)
  })

  it('keeps every arc on screen: peaks inside the field, lands inside the walls', () => {
    for (const piece of buildCourse(99, DUEL_MS)) {
      const apexT = piece.vy / GRAVITY
      const apexY = piece.y0 - piece.vy * apexT + 0.5 * GRAVITY * apexT * apexT
      expect(apexY).toBeGreaterThan(0)
      expect(apexY).toBeLessThan(ARENA_H)
      const land = piece.x0 + piece.vx * piece.flightMs / 1000
      expect(land).toBeGreaterThanOrEqual(0.09)
      expect(land).toBeLessThanOrEqual(ARENA_W - 0.09)
    }
  })

  it('assigns owners only in two-tone mode and never to rotten apples', () => {
    expect(buildCourse(3, DUEL_MS).every(p => p.owner === null)).toBe(true)
    const tt = buildCourse(3, 60_000, { twoTone: true })
    expect(tt.filter(p => p.kind === 'rot').every(p => p.owner === null)).toBe(true)
    const owners = new Set(tt.filter(p => p.kind === 'fruit').map(p => p.owner))
    expect(owners).toEqual(new Set(['X', 'O', 'both']))
  })
})

describe('positionAt / piecesInFlight', () => {
  it('starts below the field, rises, and is absent outside its flight', () => {
    const piece = buildCourse(11, DUEL_MS)[0]
    expect(positionAt(piece, piece.launchAt - 1)).toBeNull()
    expect(positionAt(piece, piece.launchAt).y).toBeCloseTo(ARENA_H + PIECE_R)
    expect(positionAt(piece, piece.launchAt + piece.flightMs / 2).y).toBeLessThan(ARENA_H)
    expect(positionAt(piece, piece.launchAt + piece.flightMs + 1)).toBeNull()
    expect(piecesInFlight([piece], piece.launchAt + 10)).toEqual([piece])
    expect(piecesInFlight([piece], piece.launchAt + piece.flightMs + 10)).toEqual([])
  })
})

describe('segmentHitsCircle', () => {
  it('measures distance to the segment, not the infinite line', () => {
    expect(segmentHitsCircle(0, 0, 1, 0, 0.5, 0.05, 0.1)).toBe(true)
    expect(segmentHitsCircle(0, 0, 1, 0, 0.5, 0.2, 0.1)).toBe(false)
    expect(segmentHitsCircle(0, 0, 1, 0, 1.5, 0, 0.1)).toBe(false)
    expect(segmentHitsCircle(0.2, 0.2, 0.2, 0.2, 0.25, 0.2, 0.1)).toBe(true)
  })
})

describe('applySwipe', () => {
  it('slices a fruit for a point and never slices it twice', () => {
    const course = [pieceAt(0, 0.5, 0.5)]
    const a = applySwipe(createField(), course, 'me', swipeThrough(course[0], 1000))
    expect(a.events.map(e => e.type)).toEqual(['slice'])
    expect(a.field.players.me).toMatchObject({ score: 1, sliced: 1 })
    const b = applySwipe(a.field, course, 'me', swipeThrough(course[0], 1100))
    expect(b.events).toEqual([])
  })

  it('ignores a slow drag (a resting finger)', () => {
    const course = [pieceAt(0, 0.5, 0.5)]
    const slow = { ax: 0.49, ay: 0.5, bx: 0.51, by: 0.5, t0: 0, t1: 1000 }
    expect(applySwipe(createField(), course, 'me', slow).events).toEqual([])
  })

  it('pays combos: 1, 1, then +4 on the third (6 total), then +2', () => {
    expect([1, 2, 3, 4, 5].map(comboGain)).toEqual([1, 1, 4, 2, 2])
    const course = [pieceAt(0, 0.2, 0.5), pieceAt(1, 0.5, 0.5), pieceAt(2, 0.8, 0.5)]
    const { field, events } = applySwipe(createField(), course, 'me', { ax: 0.05, ay: 0.5, bx: 0.95, by: 0.5, t0: 980, t1: 1000 })
    expect(events.map(e => e.combo)).toEqual([1, 2, 3])
    expect(field.players.me).toMatchObject({ score: 6, sliced: 3, best: 3 })
  })

  it('breaks the chain after the combo window', () => {
    const course = [pieceAt(0, 0.2, 0.5), pieceAt(1, 0.8, 0.5)]
    const a = applySwipe(createField(), course, 'me', swipeThrough(course[0], 1000, 0.05))
    const b = applySwipe(a.field, course, 'me', swipeThrough(course[1], 2000, 0.05))
    expect(b.field.players.me.combo).toBe(1)
  })

  it('a rotten apple costs points (never below zero), stuns, and ends the swipe', () => {
    const course = [pieceAt(0, 0.3, 0.5, { kind: 'rot', sprite: 'rot' }), pieceAt(1, 0.7, 0.5)]
    let field = createField()
    field = { ...field, players: { me: { ...field.players.me, score: 3 } } }
    const hit = applySwipe(field, course, 'me', { ax: 0.1, ay: 0.5, bx: 0.9, by: 0.5, t0: 980, t1: 1000 })
    expect(hit.events.map(e => e.type)).toEqual(['rot'])
    expect(hit.field.players.me).toMatchObject({ score: 0, rot: 1, stunUntil: 1000 + STUN_MS })
    expect(ROT_PENALTY).toBe(5)
    const stunned = applySwipe(hit.field, course, 'me', swipeThrough(course[1], 1500))
    expect(stunned.events).toEqual([])
    const after = applySwipe(hit.field, course, 'me', swipeThrough(course[1], 1000 + STUN_MS + 10))
    expect(after.events.map(e => e.type)).toEqual(['slice'])
  })

  it('does not touch the caller\'s field', () => {
    const course = [pieceAt(0, 0.5, 0.5)]
    const field = createField()
    applySwipe(field, course, 'me', swipeThrough(course[0], 1000))
    expect(field).toEqual(createField())
  })
})

describe('two-tone co-op', () => {
  const opts = { twoTone: true }

  it('slicing your partner\'s colour costs a heart instead of scoring', () => {
    const course = [pieceAt(0, 0.5, 0.5, { owner: 'O' })]
    const { field, events } = applySwipe(createField(['X', 'O']), course, 'X', swipeThrough(course[0], 1000), opts)
    expect(events.map(e => e.type)).toEqual(['wrong'])
    expect(field.players.X).toMatchObject({ score: 0, wrong: 1 })
    expect(fieldHearts(course, field, 1000)).toBe(TEAM_HEARTS - 1)
  })

  it('a 2× piece needs both partners inside the double-chop window', () => {
    const course = [pieceAt(0, 0.5, 0.5, { owner: 'both' })]
    const first = applySwipe(createField(['X', 'O']), course, 'X', swipeThrough(course[0], 1000), opts)
    expect(first.events.map(e => e.type)).toEqual(['half'])
    expect(first.field.gone[0]).toBeUndefined()
    const same = applySwipe(first.field, course, 'X', swipeThrough(course[0], 1100), opts)
    expect(same.field.gone[0]).toBeUndefined()
    const late = applySwipe(first.field, course, 'O', swipeThrough(course[0], 1000 + DOUBLE_CHOP_MS + 1), opts)
    expect(late.events.map(e => e.type)).toEqual(['half'])
    const both = applySwipe(first.field, course, 'O', swipeThrough(course[0], 1000 + DOUBLE_CHOP_MS), opts)
    expect(both.events.map(e => e.type)).toEqual(['double'])
    expect(both.field.gone[0]).toBe(true)
    expect(fieldScore(both.field)).toBe(6)
  })
})

describe('drops and hearts', () => {
  it('counts only fallen, unsliced fruit', () => {
    const course = [pieceAt(0, 0.5, 0.5, { flightMs: 500 }), pieceAt(1, 0.5, 0.5, { flightMs: 500, kind: 'rot' }), pieceAt(2, 0.5, 0.5, { flightMs: 5000 })]
    const field = createField()
    expect(countDropped(course, field, 1400)).toBe(0)
    expect(countDropped(course, field, 1600)).toBe(1)
    expect(countDropped(course, { ...field, gone: { 0: true } }, 1600)).toBe(0)
    expect(pulpStats(course, field, 'me', 1600)).toEqual({ score: 0, sliced: 0, best: 0, rot: 0, dropped: 1 })
  })
})

describe('race hooks', () => {
  it('normalizes stats to whole non-negative counts', () => {
    expect(normalizePulpStats({ score: '7.9', sliced: -2, best: null, rot: 'x' })).toEqual({ score: 7, sliced: 0, best: 0, rot: 0, dropped: 0 })
  })

  it('ranks DUEL by score then slices, no stats = DNF', () => {
    expect(pulpRaceEntry(null)).toEqual({ sortKey: null, score: null })
    expect(pulpRaceEntry({ score: 12, sliced: 9 })).toEqual({ sortKey: [-12, -9], score: 12 })
    expect(pulpRow({ score: 4, sliced: 3, best: 2, rot: 1 }).secondary).toBe('3 SLICED · 2× BEST · 1 ROT')
  })

  it('HARVEST: the team fills a basket that scales with its size, or runs out of hearts', () => {
    const racers = ['a', 'b']
    const target = HARVEST_TARGET_PER_PLAYER * 2
    const full = { a: { score: target - 10 }, b: { score: 10 } }
    expect(harvestTeam(full, racers)).toMatchObject({ pulp: target, target, won: true, failed: false })
    expect(harvestDecided(full, racers)).toBe(true)
    expect(harvestEntry(full.a, { stats: full, racers })).toEqual({ sortKey: [0], score: target - 10 })

    const broke = { a: { score: 5, dropped: TEAM_HEARTS - 1 }, b: { rot: 1 } }
    expect(harvestTeam(broke, racers)).toMatchObject({ hearts: 0, failed: true, won: false })
    expect(harvestDecided(broke, racers)).toBe(true)
    expect(harvestEntry(broke.a, { stats: broke, racers })).toEqual({ sortKey: null, score: null })

    const going = { a: { score: 5, dropped: 1 } }
    expect(harvestDecided(going, racers)).toBe(false)
  })
})
