import { describe, expect, it } from 'vitest'
import {
  advanceArcheryShot, advanceArcheryTimeout, archerySeats, arrowResult, arrowTurn,
  cpuAim, matchResult, normalizeShots, scoreArrow, scorecard, shootOffResult,
  steadyAim, windForShot, withSteadyAim,
} from './archeryLogic'

const seats = ['X', 'O']
const shot = (by, ax = 0, ay = 0, dr = 850) => ({ by, ax, ay, dr })

describe('archery scoring and shot replay', () => {
  it('scores WA 10-rings, line cutters, outer 1-ring and X', () => {
    expect(scoreArrow(0, 0)).toEqual({ score: 10, x: true })
    expect(scoreArrow(30, 0).x).toBe(true)
    expect(scoreArrow(31, 0).x).toBe(false)
    expect(scoreArrow(61, 0).score).toBe(10) // line cutter scores the higher ring
    expect(scoreArrow(62, 0).score).toBe(9)
    expect(scoreArrow(610, 0).score).toBe(1)
    expect(scoreArrow(611, 0).score).toBe(0)
  })

  it('replays integer aim with draw power and seeded wind', () => {
    expect(arrowResult({ ax: 0, ay: 0, dr: 850, distance: 50 })).toMatchObject({ ax: 0, ay: 0, score: 10, x: true })
    expect(arrowResult({ ay: 0, dr: 650, distance: 50 }).ay).toBe(110)
    expect(arrowResult({ dr: 850, wind: 12, distance: 50 }).ax).toBe(12)
  })

  it('normalizes sparse Firebase shot maps without shifting indices', () => {
    expect(normalizeShots({ 0: shot('X'), 2: shot('O') })).toEqual([shot('X'), null, shot('O')])
  })

  it('keeps fixed party seats and advances a removed archer’s timed-out end as misses', () => {
    const seatUids = { X: 'alice', O: 'bob', A: 'carol' }
    const seats = archerySeats(seatUids)
    const room = {
      status: 'playing', currentTurn: 'X', archeryFormat: 'quick', archerySeed: 1,
      archerySeatUids: seatUids, archeryShots: [],
    }
    const next = advanceArcheryTimeout(room, seats)

    expect(seats).toEqual(['X', 'O', 'A'])
    expect(next.currentTurn).toBe('O')
    expect(next.archeryShots).toHaveLength(3)
    expect(next.archeryShots.map(shot => shot.by)).toEqual(['X', 'X', 'X'])
    expect(scorecard(next.archeryShots, seats, room.archerySeed, 'quick').X).toMatchObject({ score: 0, arrows: 3 })
  })

  it('keeps each archer on three arrows before rotating ends', () => {
    expect([0, 2, 3, 11, 12].map(i => arrowTurn(i, seats).seat)).toEqual(['X', 'X', 'O', 'O', 'X'])
    expect(arrowTurn(24, seats).complete).toBe(true)
    expect(arrowTurn(18, seats, 'quick').complete).toBe(true)
  })

  it('ranks score first, then X count', () => {
    const shots = [
      { ...shot('X'), ax: 0, distance: 50 },
      { ...shot('O'), ax: 40, distance: 50 },
    ]
    expect(matchResult(shots, seats).winner).toBe('X')
    expect(scorecard(shots, seats).X.xCount).toBe(1)
  })

  it('uses closest-to-center after shoot-off score and repeats exact ties', () => {
    const decision = shootOffResult([
      { ...shot('X'), ax: 20, wind: 0 },
      { ...shot('O'), ax: 40, wind: 0 },
    ], seats)
    expect(decision).toMatchObject({ complete: true, winner: 'X' })
    expect(shootOffResult([shot('X')], seats).complete).toBe(false)
    expect(shootOffResult([
      { ...shot('X'), wind: 0, dr: 940 }, { ...shot('O'), wind: 0, dr: 940 },
    ], seats)).toMatchObject({ complete: true, winner: null, tied: seats })
  })

  it('starts a shoot-off when score and X counts tie after three-arrow ends', () => {
    const shots = Array.from({ length: 17 }, (_, i) => {
      const turn = arrowTurn(i, seats, 'quick')
      const distance = [30, 50, 70][turn.end]
      return { ...shot(turn.seat, 0, 0, [760, 850, 940][turn.end]), distance, shotIndex: i, wind: 0 }
    })
    const game = { status: 'playing', currentTurn: 'O', archeryFormat: 'quick', archerySeed: 1, archeryShots: shots }
    const moved = advanceArcheryShot(game, shot('O', -windForShot(1, 17, 70, 940), 0, 940), seats)
    expect(moved.archeryPhase).toBe('shootOff')
    expect(moved.archeryTied).toEqual(seats)
  })

  it('stores only replay fields, not local gesture timing', () => {
    const game = { status: 'playing', currentTurn: 'X', archeryFormat: 'quick', archerySeed: 5 }
    const moved = advanceArcheryShot(game, { ...shot('X'), drawMs: 1400 }, seats)
    expect(moved.archeryShots[0]).not.toHaveProperty('drawMs')
  })

  it('keeps the same archer for three arrows, then advances the local end', () => {
    let game = { status: 'playing', currentTurn: 'X', archeryFormat: 'quick', archerySeed: 5 }
    for (let i = 0; i < 3; i++) {
      game = { ...game, ...advanceArcheryShot(game, shot('X', 0, 0, 760), seats) }
    }
    expect(game.currentTurn).toBe('O')
    for (let i = 0; i < 3; i++) {
      game = { ...game, ...advanceArcheryShot(game, shot('O', 0, 0, 760), seats) }
    }
    expect(game.currentTurn).toBe('X')
  })

  it('bounds CPU spread and makes STEADY AIM reduce natural sway', () => {
    expect(cpuAim(3, () => 0.5)).toEqual({ ax: 0, ay: 0, dr: 940 })
    expect(cpuAim(1, () => 0.5, 50).dr).toBe(850)
    expect(steadyAim(800, false, 0.5)).toBe(1)
    expect(steadyAim(800, true, 0.5)).toBe(0)
    expect(withSteadyAim({ ax: 0, dr: 850, drawMs: 800 }, false, 0.5).sway).toBe(1)
    expect(withSteadyAim({ ax: 0, dr: 850, drawMs: 800 }, true, 0.5).sway).toBe(0)
  })
})
