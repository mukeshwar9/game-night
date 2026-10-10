import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI_LEVELS as PONG_LEVELS, createState as pongState, computeAI as pongAI } from './pongLogic'
import {
  createState as hockeyState, step as hockeyStep, computeAI as hockeyAI, MAX_MALLET_SPEED, COURT_W, COURT_H,
} from './airhockeyLogic'
import { AI_DIFFICULTIES as PAINT_LEVELS, createState as paintState } from './paintLogic'
import { createState as sumoState, computeAI as sumoAI } from './sumoLogic'
import { pickShot } from './battleshipLogic'

// Players read a CPU that seems to cheat as a rigged game: the top complaint in
// the competitor review (JindoBlu's Two Player Games) was a HARD bot that
// "knows where your ships are" or "moves faster than the player's car". Our
// bots get harder by thinking better and reacting sooner, never by getting
// physics or information the player doesn't have. These cases pin that down.

describe('bots play by the same physics as the player', () => {
  it('pong: every bot level steers with the same -1..1 input a player has', () => {
    for (const level of Object.values(PONG_LEVELS)) {
      const s = pongState({ mode: 'classic', serveTo: 'O' })
      for (let i = 0; i < 50; i++) {
        s.balls = [{ ...s.balls[0], x: 0.5, y: i / 50, vx: 0.5, vy: 0.1 }]
        expect([-1, 0, 1]).toContain(pongAI(s, 'O', level))
      }
    }
  })

  // A player's mallet follows the finger with no travel cap; the bot's is
  // capped at 3.6 court units/s even on HARD.
  it('air hockey: no bot level moves its mallet faster than 3.6 court units a second', () => {
    for (const level of ['easy', 'normal', 'hard']) {
      const s = hockeyState()
      s.puck = { x: 0.1, y: 0.4, vx: 0, vy: 0 }
      const dt = 1 / 120
      const target = hockeyAI(s, level, dt)
      const speed = Math.hypot(target.x - s.mallets.O.x, target.y - s.mallets.O.y) / dt
      expect(speed, level).toBeLessThanOrEqual(3.6)
    }
  })

  it('air hockey: the speed cap on a hit is the same for both mallets', () => {
    const s = hockeyState()
    // Both mallets jump across their half in one tick.
    const { state } = hockeyStep(s, {
      X: { x: COURT_W - 0.05, y: COURT_H - 0.05 },
      O: { x: COURT_W - 0.05, y: 0.05 },
    }, 1 / 120)
    const vX = Math.hypot(state.velocities.X.vx, state.velocities.X.vy)
    const vO = Math.hypot(state.velocities.O.vx, state.velocities.O.vy)
    expect(vX).toBeCloseTo(MAX_MALLET_SPEED, 6)
    expect(vO).toBeCloseTo(MAX_MALLET_SPEED, 6)
  })

  it('paint: no bot level is faster than the player (speed cap at most 1)', () => {
    expect(paintState().players.X.speedCap).toBe(1)
    for (const [id, level] of Object.entries(PAINT_LEVELS)) expect(level.speedCap, id).toBeLessThanOrEqual(1)
  })

  it('sumo: the bot taps at most five times a second', () => {
    const s = sumoState()
    s.blobs.O = { ...s.blobs.O, x: s.blobs.X.x + 0.1, y: s.blobs.X.y }
    let taps = 0
    let held = false
    for (let t = 0; t < 2; t += 1 / 60) {
      s.t = t
      const press = !!sumoAI(s, 'O').press
      if (press && !held) taps++
      held = press
    }
    expect(taps).toBeLessThanOrEqual(10)
  })

  it('snake, tron, sumo and space duel bots take no difficulty that could change their physics', () => {
    for (const file of ['snakeLogic.js', 'tronLogic.js', 'sumoLogic.js', 'spaceduelLogic.js']) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
      expect(src, file).toMatch(/export function computeAI\(state, side\) \{/)
    }
  })
})

describe('bots get no hidden information', () => {
  it('battleship: the bot picks shots from its own shot history only', () => {
    // pickShot never receives the player's fleet, so it cannot aim at it.
    expect(pickShot.length).toBeLessThanOrEqual(1)
    const rng = () => 0.42
    expect(pickShot([], rng)).toBe(pickShot([], rng))
  })
})
