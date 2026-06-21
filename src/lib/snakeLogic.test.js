import { describe, it, expect } from 'vitest'
import { createState, tick, getWinner, spawnFood, computeAI, GRID, START_LEN } from './snakeLogic'

describe('snakeLogic', () => {
  describe('createState', () => {
    it('creates two snakes of START_LEN at opposite sides', () => {
      const s = createState()
      expect(s.snakes.X.body).toHaveLength(START_LEN)
      expect(s.snakes.O.body).toHaveLength(START_LEN)
      expect(s.snakes.X.alive).toBe(true)
      expect(s.snakes.O.alive).toBe(true)
      expect(s.snakes.X.dir).toBe('right')
      expect(s.snakes.O.dir).toBe('left')
    })

    it('places X on the left heading right and O on the right heading left', () => {
      const s = createState()
      expect(s.snakes.X.body[0].x).toBeLessThan(s.snakes.O.body[0].x)
      expect(s.snakes.X.body[0].y).toBe(s.snakes.O.body[0].y)
    })

    it('spawns food not on any snake body', () => {
      const s = createState()
      expect(s.food).not.toBeNull()
      const onBody = [...s.snakes.X.body, ...s.snakes.O.body]
        .some(seg => seg.x === s.food.x && seg.y === s.food.y)
      expect(onBody).toBe(false)
    })

    it('starts at tick 0', () => {
      expect(createState().tick).toBe(0)
    })
  })

  describe('tick — movement', () => {
    it('moves the head one cell in the current direction', () => {
      const s = createState()
      const headX = { ...s.snakes.X.body[0] }
      const { state } = tick(s, {})
      expect(state.snakes.X.body[0].x).toBe(headX.x + 1)
      expect(state.snakes.X.body[0].y).toBe(headX.y)
    })

    it('does not mutate the input state', () => {
      const s = createState()
      const originalHead = { ...s.snakes.X.body[0] }
      tick(s, {})
      expect(s.snakes.X.body[0]).toEqual(originalHead)
    })

    it('increments the tick counter', () => {
      const s = createState()
      const { state } = tick(s, {})
      expect(state.tick).toBe(1)
    })

    it('pops the tail when not eating (length stays constant)', () => {
      const s = createState()
      const lenBefore = s.snakes.X.body.length
      const { state } = tick(s, {})
      expect(state.snakes.X.body.length).toBe(lenBefore)
    })
  })

  describe('tick — direction changes', () => {
    it('accepts a valid new direction', () => {
      const s = createState()
      const { state } = tick(s, { X: 'up' })
      expect(state.snakes.X.dir).toBe('up')
    })

    it('rejects a 180° reversal', () => {
      const s = createState()
      // X starts heading right; trying to go left should be ignored.
      const { state } = tick(s, { X: 'left' })
      expect(state.snakes.X.dir).toBe('right')
    })

    it('ignores invalid direction strings', () => {
      const s = createState()
      const { state } = tick(s, { X: 'sideways' })
      expect(state.snakes.X.dir).toBe('right')
    })
  })

  describe('tick — eating and growth', () => {
    it('grows the snake by 1 when the head lands on food', () => {
      const s = createState()
      const lenBefore = s.snakes.X.body.length
      // Place food directly in front of X's head.
      s.food = { x: s.snakes.X.body[0].x + 1, y: s.snakes.X.body[0].y }
      const { state, events } = tick(s, {})
      expect(state.snakes.X.body.length).toBe(lenBefore + 1)
      expect(events.some(e => e.type === 'eat' && e.by === 'X')).toBe(true)
      expect(state.snakes.X.eaten).toBe(1)
    })

    it('respawns food elsewhere after it is eaten', () => {
      const s = createState()
      s.food = { x: s.snakes.X.body[0].x + 1, y: s.snakes.X.body[0].y }
      const { state } = tick(s, {})
      expect(state.food).not.toBeNull()
      const onBody = [...state.snakes.X.body, ...state.snakes.O.body]
        .some(seg => seg.x === state.food.x && seg.y === state.food.y)
      expect(onBody).toBe(false)
    })
  })

  describe('tick — wall collision', () => {
    it('kills a snake that hits the top wall', () => {
      const s = createState()
      // Move X to the top row heading up.
      s.snakes.X.body = [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }]
      s.snakes.X.dir = 'up'
      const { state, events } = tick(s, { X: 'up' })
      expect(state.snakes.X.alive).toBe(false)
      expect(events.some(e => e.type === 'die' && e.by === 'X' && e.cause === 'wall')).toBe(true)
    })

    it('kills a snake that hits the right wall', () => {
      const s = createState()
      s.snakes.X.body = [{ x: GRID - 1, y: 5 }, { x: GRID - 2, y: 5 }, { x: GRID - 3, y: 5 }]
      s.snakes.X.dir = 'right'
      const { state } = tick(s, { X: 'right' })
      expect(state.snakes.X.alive).toBe(false)
    })
  })

  describe('tick — self collision', () => {
    it('kills a snake that runs into its own body', () => {
      const s = createState()
      // U-shape: head at (5,5), body at (4,5)(4,6)(5,6)(6,6). Heading right,
      // turn down → new head (5,6) hits body[3] (not the tail at (6,6)).
      s.snakes.X.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }]
      s.snakes.X.dir = 'right'
      // Place food so the snake doesn't grow (tail vacates).
      s.food = { x: 0, y: 0 }
      const { state } = tick(s, { X: 'down' })
      expect(state.snakes.X.alive).toBe(false)
    })

    it('does not kill a snake that moves into its own vacating tail cell', () => {
      const s = createState()
      // Straight line: (3,5) (2,5) (1,5), heading right.
      // After tick: head (4,5), tail (1,5) vacates, body = (4,5)(3,5)(2,5).
      // No self-collision.
      s.snakes.X.body = [{ x: 3, y: 5 }, { x: 2, y: 5 }, { x: 1, y: 5 }]
      s.snakes.X.dir = 'right'
      s.food = { x: 0, y: 0 }
      const { state } = tick(s, {})
      expect(state.snakes.X.alive).toBe(true)
    })
  })

  describe('tick — body collision with other snake', () => {
    it('kills a snake that runs into the opponent body', () => {
      const s = createState()
      // X heading right at (5,5); O has a 4-segment body with a segment at (6,5)
      // that is NOT the tail (tail is at (6,6)), so it won't vacate.
      s.snakes.X.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]
      s.snakes.X.dir = 'right'
      s.snakes.O.body = [{ x: 8, y: 5 }, { x: 7, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }]
      s.snakes.O.dir = 'up'
      s.food = { x: 0, y: 0 }
      const { state } = tick(s, {})
      expect(state.snakes.X.alive).toBe(false)
      expect(state.snakes.O.alive).toBe(true)
    })

    it('kills a snake that runs into the opponent head-to-body', () => {
      const s = createState()
      // X at (5,5) heading right; O at (6,5) heading up (O's head is at 6,5).
      s.snakes.X.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]
      s.snakes.X.dir = 'right'
      s.snakes.O.body = [{ x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 }]
      s.snakes.O.dir = 'up'
      s.food = { x: 0, y: 0 }
      const { state } = tick(s, {})
      // X moves to (6,5) which is O's old head (not tail) → X dies.
      expect(state.snakes.X.alive).toBe(false)
      expect(state.snakes.O.alive).toBe(true)
    })
  })

  describe('tick — head-on collision', () => {
    it('kills both snakes when they move to the same cell', () => {
      const s = createState()
      // X at (5,5) heading right, O at (7,5) heading left — both move to (6,5).
      s.snakes.X.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]
      s.snakes.X.dir = 'right'
      s.snakes.O.body = [{ x: 7, y: 5 }, { x: 8, y: 5 }, { x: 9, y: 5 }]
      s.snakes.O.dir = 'left'
      s.food = { x: 0, y: 0 }
      const { state } = tick(s, {})
      expect(state.snakes.X.alive).toBe(false)
      expect(state.snakes.O.alive).toBe(false)
    })
  })

  describe('tick — head-swap (adjacent head-to-head)', () => {
    it('kills both when they swap head positions', () => {
      const s = createState()
      // X at (5,5) heading right, O at (6,5) heading left.
      // After move: X head → (6,5) = O's old head, O head → (5,5) = X's old head.
      s.snakes.X.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]
      s.snakes.X.dir = 'right'
      s.snakes.O.body = [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }]
      s.snakes.O.dir = 'left'
      s.food = { x: 0, y: 0 }
      const { state } = tick(s, {})
      expect(state.snakes.X.alive).toBe(false)
      expect(state.snakes.O.alive).toBe(false)
    })
  })

  describe('getWinner', () => {
    it('returns null when both snakes are alive', () => {
      expect(getWinner(createState())).toBeNull()
    })

    it('returns X when O is dead and X is alive', () => {
      const s = createState()
      s.snakes.O.alive = false
      expect(getWinner(s)).toBe('X')
    })

    it('returns O when X is dead and O is alive', () => {
      const s = createState()
      s.snakes.X.alive = false
      expect(getWinner(s)).toBe('O')
    })

    it('returns draw when both are dead', () => {
      const s = createState()
      s.snakes.X.alive = false
      s.snakes.O.alive = false
      expect(getWinner(s)).toBe('draw')
    })
  })

  describe('spawnFood', () => {
    it('never places food on a snake body', () => {
      const s = createState()
      for (let i = 0; i < 50; i++) {
        const food = spawnFood(s.snakes)
        expect(food).not.toBeNull()
        const onBody = [...s.snakes.X.body, ...s.snakes.O.body]
          .some(seg => seg.x === food.x && seg.y === food.y)
        expect(onBody).toBe(false)
      }
    })

    it('returns null when the board is full', () => {
      const snakes = {
        X: { body: [], dir: 'right' },
        O: { body: [], dir: 'left' },
      }
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          snakes.X.body.push({ x, y })
        }
      }
      expect(spawnFood(snakes)).toBeNull()
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
        s.food = spawnFood(s.snakes)
        const dir = computeAI(s, 'O')
        expect(dir).not.toBe('right')
      }
    })

    it('avoids a wall when turning would hit it', () => {
      const s = createState()
      // O at the top row heading left; turning up must be avoided.
      s.snakes.O.body = [{ x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 0 }]
      s.snakes.O.dir = 'left'
      s.food = { x: 0, y: 0 }
      const dir = computeAI(s, 'O')
      expect(dir).not.toBe('up')
    })

    it('picks a safe move when one exists', () => {
      const s = createState()
      // Place O in open space; AI should return a direction that keeps it safe.
      s.snakes.O.body = [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }]
      s.snakes.O.dir = 'left'
      s.snakes.X.body = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }]
      s.food = { x: 10, y: 5 }
      const dir = computeAI(s, 'O')
      // Up (toward food) or left (continue) should be safe; down is also safe.
      expect(['up', 'down', 'left']).toContain(dir)
    })
  })
})
