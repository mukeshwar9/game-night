import { describe, it, expect } from 'vitest'
import { createState, tick, getWinner, computeAI, GRID } from './tronLogic'

describe('tronLogic', () => {
  describe('createState', () => {
    it('creates two single-cell cycles at opposite sides', () => {
      const s = createState()
      expect(s.cycles.X.body).toHaveLength(1)
      expect(s.cycles.O.body).toHaveLength(1)
      expect(s.cycles.X.alive).toBe(true)
      expect(s.cycles.O.alive).toBe(true)
      expect(s.cycles.X.dir).toBe('right')
      expect(s.cycles.O.dir).toBe('left')
    })

    it('places X on the left heading right and O on the right heading left', () => {
      const s = createState()
      expect(s.cycles.X.body[0].x).toBeLessThan(s.cycles.O.body[0].x)
      expect(s.cycles.X.body[0].y).toBe(s.cycles.O.body[0].y)
    })

    it('starts at tick 0', () => {
      expect(createState().tick).toBe(0)
    })
  })

  describe('tick — movement', () => {
    it('moves the head one cell in the current direction', () => {
      const s = createState()
      const headX = { ...s.cycles.X.body[0] }
      const { state } = tick(s, {})
      expect(state.cycles.X.body[0].x).toBe(headX.x + 1)
      expect(state.cycles.X.body[0].y).toBe(headX.y)
    })

    it('does not mutate the input state', () => {
      const s = createState()
      const originalHead = { ...s.cycles.X.body[0] }
      tick(s, {})
      expect(s.cycles.X.body[0]).toEqual(originalHead)
    })

    it('increments the tick counter', () => {
      const s = createState()
      const { state } = tick(s, {})
      expect(state.tick).toBe(1)
    })

    it('grows the trail by one every tick (no pop)', () => {
      const s = createState()
      const lenBefore = s.cycles.X.body.length
      const { state: s1 } = tick(s, {})
      expect(s1.cycles.X.body.length).toBe(lenBefore + 1)
      const { state: s2 } = tick(s1, {})
      expect(s2.cycles.X.body.length).toBe(lenBefore + 2)
    })
  })

  describe('tick — direction changes', () => {
    it('accepts a valid new direction', () => {
      const s = createState()
      const { state } = tick(s, { X: 'up' })
      expect(state.cycles.X.dir).toBe('up')
    })

    it('rejects a 180° reversal (dir unchanged)', () => {
      const s = createState()
      const { state } = tick(s, { X: 'left' })
      expect(state.cycles.X.dir).toBe('right')
    })

    it('ignores invalid direction strings', () => {
      const s = createState()
      const { state } = tick(s, { X: 'sideways' })
      expect(state.cycles.X.dir).toBe('right')
    })
  })

  describe('tick — wall wrap-around', () => {
    it('wraps a cycle that exits the right wall to the left', () => {
      const s = createState()
      s.cycles.X.body = [{ x: GRID - 1, y: 5 }]
      s.cycles.X.dir = 'right'
      const { state } = tick(s, { X: 'right' })
      expect(state.cycles.X.alive).toBe(true)
      expect(state.cycles.X.body[0]).toEqual({ x: 0, y: 5 })
    })

    it('wraps a cycle that exits the left wall to the right', () => {
      const s = createState()
      s.cycles.X.body = [{ x: 0, y: 5 }]
      s.cycles.X.dir = 'left'
      const { state } = tick(s, { X: 'left' })
      expect(state.cycles.X.alive).toBe(true)
      expect(state.cycles.X.body[0]).toEqual({ x: GRID - 1, y: 5 })
    })
  })

  describe('tick — self-trail collision', () => {
    it('kills a cycle that runs into its own trail', () => {
      const s = createState()
      // U-shape: head (5,5), trail (4,5)(4,6)(5,6). Heading right, turn down
      // → new head (5,6) is on the own trail.
      s.cycles.X.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }]
      s.cycles.X.dir = 'right'
      const { state, events } = tick(s, { X: 'down' })
      expect(state.cycles.X.alive).toBe(false)
      expect(events.some(e => e.type === 'die' && e.by === 'X' && e.cause === 'self')).toBe(true)
    })

    it('does not kill a cycle that moves onto its own (moving) head cell', () => {
      const s = createState()
      // Single-cell cycle; the new head is adjacent — no self collision.
      s.cycles.X.body = [{ x: 5, y: 5 }]
      s.cycles.X.dir = 'right'
      const { state } = tick(s, {})
      expect(state.cycles.X.alive).toBe(true)
    })
  })

  describe('tick — opponent trail collision', () => {
    it('kills a cycle that runs into the opponent trail', () => {
      const s = createState()
      s.cycles.X.body = [{ x: 5, y: 5 }]
      s.cycles.X.dir = 'right'
      s.cycles.O.body = [{ x: 10, y: 10 }, { x: 6, y: 5 }, { x: 7, y: 5 }]
      s.cycles.O.dir = 'up'
      const { state, events } = tick(s, {})
      expect(state.cycles.X.alive).toBe(false)
      expect(state.cycles.O.alive).toBe(true)
      expect(events.some(e => e.type === 'die' && e.by === 'X' && e.cause === 'other')).toBe(true)
    })
  })

  describe('tick — head-on collision', () => {
    it('kills both cycles when they move to the same cell → draw', () => {
      const s = createState()
      s.cycles.X.body = [{ x: 5, y: 5 }]
      s.cycles.X.dir = 'right'
      s.cycles.O.body = [{ x: 7, y: 5 }]
      s.cycles.O.dir = 'left'
      const { state, events } = tick(s, {})
      expect(state.cycles.X.alive).toBe(false)
      expect(state.cycles.O.alive).toBe(false)
      expect(events.filter(e => e.type === 'die' && e.cause === 'headon')).toHaveLength(2)
    })
  })

  describe('getWinner', () => {
    it('returns null when both cycles are alive', () => {
      expect(getWinner(createState())).toBeNull()
    })

    it('returns X when O is dead and X is alive', () => {
      const s = createState()
      s.cycles.O.alive = false
      expect(getWinner(s)).toBe('X')
    })

    it('returns O when X is dead and O is alive', () => {
      const s = createState()
      s.cycles.X.alive = false
      expect(getWinner(s)).toBe('O')
    })

    it('returns draw when both are dead', () => {
      const s = createState()
      s.cycles.X.alive = false
      s.cycles.O.alive = false
      expect(getWinner(s)).toBe('draw')
    })
  })

  describe('computeAI', () => {
    it('returns a valid direction', () => {
      const s = createState()
      const dir = computeAI(s, 'O')
      expect(['up', 'down', 'left', 'right']).toContain(dir)
    })

    it('never returns a 180° reversal', () => {
      const s = createState()
      // O starts heading left; AI must not return 'right'.
      for (let i = 0; i < 20; i++) {
        const dir = computeAI(s, 'O')
        expect(dir).not.toBe('right')
      }
    })

    it('picks a safe move when one exists', () => {
      const s = createState()
      s.cycles.O.body = [{ x: 10, y: 10 }]
      s.cycles.O.dir = 'left'
      s.cycles.X.body = [{ x: 0, y: 0 }]
      const dir = computeAI(s, 'O')
      expect(['up', 'down', 'left']).toContain(dir)
    })

    it('falls back to current direction when no safe move exists', () => {
      const s = createState()
      // Box the O cycle in on all non-reversing sides.
      s.cycles.O.body = [{ x: 5, y: 5 }]
      s.cycles.O.dir = 'right'
      s.cycles.X.body = [
        { x: 6, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 6 }, { x: 4, y: 5 },
      ]
      const dir = computeAI(s, 'O')
      // right is reversing→blocked; up/down/left all hit a trail → keep 'right'.
      expect(dir).toBe('right')
    })
  })
})
