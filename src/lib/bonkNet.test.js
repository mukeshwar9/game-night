import { describe, it, expect } from 'vitest'
import { Vec2 } from './vendor/planck-det'
import { DT, createMatch, step } from './bonkLogic'
import {
  viewOf, staticView, encodeSnapshot, decodeSnapshot, extrapolate, encodeEvent, decodeEvent, MAX_SNAPSHOT_EVENTS,
} from './bonkNet'
import { ARENA_IDS } from './bonkArenas'

const NONE = { d: 0, hop: false }
const advance = (m, seconds, inputs = { X: { d: 1, hop: false }, O: { d: -1, hop: false } }) => {
  const events = []
  for (let k = 0; k < Math.round(seconds / DT); k++) events.push(...step(m, inputs, DT).events)
  return events
}

describe('view', () => {
  it('describes both buggies, the tide and the score', () => {
    const m = createMatch({ leadCount: 0.1 })
    advance(m, 0.6)
    const v = viewOf(m)
    expect(v.phase).toBe('play')
    expect(v.cars).toHaveLength(2)
    expect(v.cars[0].wheels).toHaveLength(2)
    expect(v.score).toEqual([0, 0])
    expect(v.arena).toBe(m.r.arena.id)
    expect(v.tideLeft).toBeGreaterThan(8)
    expect(v.winner).toBe(null)
  })

  it('a still view has two buggies on the arena surface, one per end', () => {
    for (const id of ARENA_IDS) {
      const v = staticView(id)
      expect(v.cars[0].x).toBeLessThan(0)
      expect(v.cars[1].x).toBeGreaterThan(0)
      expect(v.cars[0].dir).toBe(1)
      expect(v.cars[1].dir).toBe(-1)
    }
  })
})

describe('snapshot', () => {
  it('round-trips the positions the renderer reads', () => {
    const m = createMatch({ leadCount: 0.1, score: [3, 0] })
    advance(m, 1.2)
    const v = viewOf(m)
    const back = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(m))))
    expect(back.phase).toBe(v.phase)
    expect(back.arena).toBe(v.arena)
    expect(back.score).toEqual(v.score)
    expect(back.round).toBe(v.round)
    for (const i of [0, 1]) {
      expect(back.cars[i].x).toBeCloseTo(v.cars[i].x, 2)
      expect(back.cars[i].y).toBeCloseTo(v.cars[i].y, 2)
      expect(back.cars[i].a).toBeCloseTo(v.cars[i].a, 2)
      expect(back.cars[i].dir).toBe(v.cars[i].dir)
      expect(back.cars[i].shield).toBe(v.cars[i].shield)
      expect(back.cars[i].wheels[1].x).toBeCloseTo(v.cars[i].wheels[1].x, 2)
    }
    expect(back.cars[1].shield).toBe(true)   // seat 1 trails 3–0
  })

  it('carries the knockout and the loser’s two cards', () => {
    const m = createMatch({ leadCount: 0.1, seed: 4 })
    advance(m, 0.3, { X: NONE, O: NONE })
    m.r.cars[1].chassis.setPosition(new Vec2(0, 0.1))
    advance(m, 0.3, { X: NONE, O: NONE })
    let v = decodeSnapshot(encodeSnapshot(m))
    expect(v.phase).toBe('ko')
    expect(v.outcome).toMatchObject({ winner: 0, reason: 'sunk', loser: 1, double: false })
    expect(v.cars[1].alive).toBe(false)
    expect(v.cars[1].out.reason).toBe('sunk')
    while (m.phase !== 'pick') advance(m, DT, { X: NONE, O: NONE })
    v = decodeSnapshot(encodeSnapshot(m))
    expect(v.phase).toBe('pick')
    expect(v.pick.by).toBe(1)
    expect(v.pick.options).toEqual(m.pick.options)
    expect(v.pick.left).toBeGreaterThan(4)
  })

  it('names the winner once the match is over', () => {
    const m = createMatch({ leadCount: 0.1, score: [4, 0] })
    advance(m, 0.3, { X: NONE, O: NONE })
    m.r.cars[1].chassis.setPosition(new Vec2(0, 0.1))
    while (m.phase !== 'over') advance(m, DT, { X: NONE, O: NONE })
    expect(decodeSnapshot(encodeSnapshot(m)).winner).toBe('X')
  })

  it('stays small enough for one data-channel message', () => {
    const m = createMatch({ leadCount: 0.1 })
    advance(m, 1)
    expect(JSON.stringify(encodeSnapshot(m)).length).toBeLessThan(1100)
  })

  it('falls back to a still scene for a short or missing snapshot', () => {
    expect(decodeSnapshot(null).cars).toHaveLength(2)
    expect(decodeSnapshot({ t: 's', c: [] }).cars).toHaveLength(2)
    expect(decodeSnapshot({ t: 's', ar: 99, c: [] }).arena).toBe(ARENA_IDS[0])
  })

  it('keeps only the newest events', () => {
    const m = createMatch({ leadCount: 0.1 })
    const many = Array.from({ length: 40 }, (_, i) => ({ type: 'hit', x: i, y: 1, power: 2, cars: true }))
    expect(encodeSnapshot(m, many).ev).toHaveLength(MAX_SNAPSHOT_EVENTS)
    expect(encodeSnapshot(m, many).ev[MAX_SNAPSHOT_EVENTS - 1][1]).toBe(39)
  })
})

describe('events', () => {
  it.each([
    [{ type: 'hit', x: 1.5, y: 2.25, power: 3.5, cars: true, wheel: false }],
    [{ type: 'splash', x: -2, y: 0.5, power: 4 }],
    [{ type: 'hop', x: 0, y: 3, ux: 0.25, uy: 0.97, car: 1 }],
    [{ type: 'shield', x: 1, y: 4, car: 0 }],
    [{ type: 'bonk', x: 1, y: 4, car: 0, by: 'O' }],
    [{ type: 'point', x: 1, y: 4, winner: 1, double: false, reason: 'bonk' }],
    [{ type: 'count', digit: 2 }],
    [{ type: 'pick', by: 'X' }],
    [{ type: 'chose', arena: 'drum' }],
    [{ type: 'go' }],
  ])('round-trips %j', (e) => {
    expect(decodeEvent(encodeEvent(e))).toMatchObject(e)
  })

  it('drops an unknown event and survives garbage', () => {
    expect(encodeEvent({ type: 'nope' })).toBe(null)
    expect(decodeEvent([99, 0, 0, 0, 0, 0])).toBe(null)
    expect(decodeEvent('x')).toBe(null)
  })
})

describe('dead reckoning', () => {
  const view = (phase) => ({
    phase,
    cars: [{ x: 0, y: 3, a: 0, vx: 4, vy: 1, w: 2, alive: true, wheels: [{ x: -0.5, y: 2.7, a: 0 }, { x: 0.5, y: 2.7, a: 0 }] }],
  })

  it('moves a running buggy along its velocity, capped at a tenth of a second', () => {
    const v = extrapolate(view('play'), 0.05)
    expect(v.cars[0].x).toBeCloseTo(0.2)
    expect(v.cars[0].wheels[1].x).toBeCloseTo(0.7)
    expect(extrapolate(view('play'), 5).cars[0].x).toBeCloseTo(0.4)
  })

  it('leaves slow-motion, counting and knocked-out buggies alone', () => {
    const ko = view('ko')
    expect(extrapolate(ko, 0.1)).toBe(ko)
    const dead = view('play')
    dead.cars[0].alive = false
    expect(extrapolate(dead, 0.1).cars[0].x).toBe(0)
    const still = view('play')
    expect(extrapolate(still, 0)).toBe(still)
  })
})
