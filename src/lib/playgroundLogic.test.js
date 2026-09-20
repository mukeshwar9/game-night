import { describe, it, expect } from 'vitest'
import {
  createState, step, activeStation, SPEED, SPRINT_MULT, AVATAR_HALF, WORLD_W, WORLD_H, STATIONS,
  DISTRICTS,
  stepBall, BALL_HALF, BALL_FRICTION, KICK_BASE_SPEED, BALL_SPAWN, GOAL,
  stepNpc, nearestNpcIndex, NPCS, NPC_SPEED, NPC_WAIT_MIN, NPC_WAIT_MAX, TALK_RADIUS,
} from './playgroundLogic'
import { isValidAvatar } from './avatars'

describe('createState', () => {
  it('starts centred, facing right, not moving', () => {
    const s = createState()
    expect(s.x).toBeCloseTo(WORLD_W / 2)
    expect(s.y).toBeCloseTo(WORLD_H / 2)
    expect(s.facing).toBe('right')
    expect(s.moving).toBe(false)
  })

  it('seeds a resting ball, no goals yet, and one waiting NPC per NPCS entry', () => {
    const s = createState()
    expect(s.ball).toEqual({ x: BALL_SPAWN.x, y: BALL_SPAWN.y, vx: 0, vy: 0 })
    expect(s.ballKicked).toBe(false)
    expect(s.goals).toBe(0)
    expect(s.goalScored).toBe(false)
    expect(s.npcs).toHaveLength(NPCS.length)
    s.npcs.forEach((npc, i) => {
      expect(npc.x).toBeCloseTo(NPCS[i].home.x)
      expect(npc.y).toBeCloseTo(NPCS[i].home.y)
      expect(npc.waitT).toBeGreaterThan(0)
      expect(npc.moving).toBe(false)
    })
  })
})

describe('step — movement', () => {
  it('moves exactly SPEED * dt along a cardinal direction', () => {
    const s = createState()
    const next = step(s, { dx: 1, dy: 0 }, 0.1)
    expect(next.x).toBeCloseTo(s.x + SPEED * 0.1)
    expect(next.y).toBeCloseTo(s.y)
  })

  it('diagonal speed equals cardinal speed (normalized via hypot)', () => {
    const s = createState()
    const cardinal = step(s, { dx: 1, dy: 0 }, 0.1)
    const diagonal = step(s, { dx: 1, dy: 1 }, 0.1)
    const cardinalDist = Math.hypot(cardinal.x - s.x, cardinal.y - s.y)
    const diagonalDist = Math.hypot(diagonal.x - s.x, diagonal.y - s.y)
    expect(diagonalDist).toBeCloseTo(cardinalDist)
  })

  it('dt=0 does not move', () => {
    const s = createState()
    const next = step(s, { dx: 1, dy: 1 }, 0)
    expect(next.x).toBeCloseTo(s.x)
    expect(next.y).toBeCloseTo(s.y)
  })

  it('does not mutate the input state', () => {
    const s = createState()
    const copy = { ...s }
    step(s, { dx: 1, dy: -1 }, 0.1)
    expect(s).toEqual(copy)
  })
})

describe('step — clamping to world bounds', () => {
  it('clamps to the right/bottom edge with a large dt', () => {
    const s = createState()
    const next = step(s, { dx: 1, dy: 1 }, 100)
    expect(next.x).toBeCloseTo(WORLD_W - AVATAR_HALF)
    expect(next.y).toBeCloseTo(WORLD_H - AVATAR_HALF)
  })

  it('clamps to the left/top edge with a large dt', () => {
    const s = createState()
    const next = step(s, { dx: -1, dy: -1 }, 100)
    expect(next.x).toBeCloseTo(AVATAR_HALF)
    expect(next.y).toBeCloseTo(AVATAR_HALF)
  })

  it('clamps to the right edge alone', () => {
    const next = step(createState(), { dx: 1, dy: 0 }, 100)
    expect(next.x).toBeCloseTo(WORLD_W - AVATAR_HALF)
  })

  it('clamps to the top edge alone', () => {
    const next = step(createState(), { dx: 0, dy: -1 }, 100)
    expect(next.y).toBeCloseTo(AVATAR_HALF)
  })
})

describe('step — facing', () => {
  it('faces left when dx < 0, then keeps facing left when dx = 0', () => {
    const s = createState()
    const walked = step(s, { dx: -1, dy: 0 }, 0.1)
    expect(walked.facing).toBe('left')
    const stopped = step(walked, { dx: 0, dy: 1 }, 0.1)
    expect(stopped.facing).toBe('left')
  })

  it('faces right when dx > 0', () => {
    const next = step(createState(), { dx: 1, dy: 0 }, 0.1)
    expect(next.facing).toBe('right')
  })
})

describe('step — moving flag', () => {
  it('is true while input has magnitude', () => {
    expect(step(createState(), { dx: 1, dy: 0 }, 0.1).moving).toBe(true)
  })

  it('is false with zero input', () => {
    expect(step(createState(), { dx: 0, dy: 0 }, 0.1).moving).toBe(false)
  })
})

describe('activeStation', () => {
  it('returns the station when standing on its center', () => {
    const target = STATIONS[0]
    const found = activeStation({ x: target.x, y: target.y, facing: 'right', moving: false })
    expect(found).toBe(target)
  })

  it('returns null when not near any station', () => {
    // Top-left corner sits outside every curated station's radius.
    const found = activeStation({ x: 0.02, y: 0.02, facing: 'right', moving: false })
    expect(found).toBeNull()
  })

  it('is exactly on the boundary (r away) — inclusive', () => {
    const target = STATIONS[0]
    const found = activeStation({ x: target.x + target.r, y: target.y, facing: 'right', moving: false })
    expect(found).toBe(target)
  })

  it('is just past the boundary — miss', () => {
    const target = STATIONS[0]
    const found = activeStation({ x: target.x + target.r + 0.001, y: target.y, facing: 'right', moving: false })
    expect(found).not.toBe(target)
  })

  it('has 15 stations, all unique types, all inside the world bounds', () => {
    expect(STATIONS).toHaveLength(15)
    expect(new Set(STATIONS.map(s => s.type)).size).toBe(15)
    STATIONS.forEach(s => {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(WORLD_W)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(WORLD_H)
    })
  })
})

const FAR_AVATAR = { x: 2.9, y: 2.9 } // clear of every ball position used below

describe('stepBall — friction and rest', () => {
  it('decays velocity by exp(-BALL_FRICTION * dt) and moves by the pre-decay velocity', () => {
    const ball = { x: 1.5, y: 1.5, vx: 1, vy: 0 }
    const { ball: next } = stepBall(ball, FAR_AVATAR, 0, 0.1)
    expect(next.x).toBeCloseTo(1.5 + 1 * 0.1)
    expect(next.vx).toBeCloseTo(1 * Math.exp(-BALL_FRICTION * 0.1))
  })

  it('snaps to rest once speed drops below the rest epsilon', () => {
    const ball = { x: 1.5, y: 1.5, vx: 0.0005, vy: 0 }
    const { ball: next } = stepBall(ball, FAR_AVATAR, 0, 0.1)
    expect(next.vx).toBe(0)
    expect(next.vy).toBe(0)
  })

  it('a ball already at rest stays put', () => {
    const ball = { x: 0.4, y: 0.4, vx: 0, vy: 0 }
    const { ball: next, kicked, scored } = stepBall(ball, FAR_AVATAR, 0, 0.5)
    expect(next).toEqual(ball)
    expect(kicked).toBe(false)
    expect(scored).toBe(false)
  })

  it('does not mutate the input ball', () => {
    const ball = { x: 1.5, y: 1.5, vx: 1, vy: 0.5 }
    const copy = { ...ball }
    stepBall(ball, FAR_AVATAR, 0, 0.1)
    expect(ball).toEqual(copy)
  })
})

describe('stepBall — wall bounce (world bounds)', () => {
  it('bounces off the left wall', () => {
    const { ball } = stepBall({ x: BALL_HALF + 0.001, y: 1.5, vx: -1, vy: 0 }, FAR_AVATAR, 0, 0.05)
    expect(ball.x).toBeCloseTo(BALL_HALF)
    expect(ball.vx).toBeGreaterThan(0)
  })

  it('bounces off the right wall', () => {
    const { ball } = stepBall({ x: WORLD_W - BALL_HALF - 0.001, y: 1.5, vx: 1, vy: 0 }, FAR_AVATAR, 0, 0.05)
    expect(ball.x).toBeCloseTo(WORLD_W - BALL_HALF)
    expect(ball.vx).toBeLessThan(0)
  })

  it('bounces off the top wall', () => {
    // Offset off the goal's x-band so this exercises the wall bounce, not the goal.
    const { ball } = stepBall({ x: 2.5, y: BALL_HALF + 0.001, vx: 0, vy: -1 }, FAR_AVATAR, 0, 0.05)
    expect(ball.y).toBeCloseTo(BALL_HALF)
    expect(ball.vy).toBeGreaterThan(0)
  })

  it('bounces off the bottom wall', () => {
    const { ball } = stepBall({ x: 1.5, y: WORLD_H - BALL_HALF - 0.001, vx: 0, vy: 1 }, FAR_AVATAR, 0, 0.05)
    expect(ball.y).toBeCloseTo(WORLD_H - BALL_HALF)
    expect(ball.vy).toBeLessThan(0)
  })
})

describe('stepBall — kick', () => {
  it('pushes the ball away from the avatar along the overlap normal', () => {
    const avatar = { x: 1.5, y: 1.5 }
    const ball = { x: 1.45, y: 1.5, vx: 0, vy: 0 } // overlapping, ball sits left of avatar
    const { ball: next, kicked } = stepBall(ball, avatar, SPEED, 0.016)
    expect(kicked).toBe(true)
    expect(next.vx).toBeCloseTo(-(KICK_BASE_SPEED + SPEED))
    expect(next.vy).toBeCloseTo(0)
    expect(next.x).toBeLessThan(ball.x) // separated further from the avatar, not stuck
  })

  it('does not kick when the circles do not overlap', () => {
    const { kicked } = stepBall({ x: 0.1, y: 0.1, vx: 0, vy: 0 }, { x: 2.9, y: 2.9 }, SPEED, 0.016)
    expect(kicked).toBe(false)
  })
})

describe('stepBall — goal', () => {
  const goalCenter = { x: GOAL.x + GOAL.w / 2, y: GOAL.y + GOAL.h / 2 }

  it('scores and respawns the ball at BALL_SPAWN with zero velocity when it enters the goal rect', () => {
    const ball = { x: goalCenter.x, y: goalCenter.y + 0.1, vx: 0, vy: -1 }
    const { ball: next, scored } = stepBall(ball, FAR_AVATAR, 0, 0.05)
    expect(scored).toBe(true)
    expect(next).toEqual({ x: BALL_SPAWN.x, y: BALL_SPAWN.y, vx: 0, vy: 0 })
  })

  it('does not score just adjacent to the goal rect', () => {
    const ball = { x: GOAL.x - 0.05, y: GOAL.y + GOAL.h / 2, vx: 0, vy: 0 }
    const { scored } = stepBall(ball, FAR_AVATAR, 0, 0.05)
    expect(scored).toBe(false)
  })

  it('the goalScored edge fires for exactly one frame', () => {
    let state = createState()
    state = { ...state, ball: { x: goalCenter.x, y: goalCenter.y + 0.1, vx: 0, vy: -1 } }
    const scoring = step(state, {}, 0.05)
    expect(scoring.goalScored).toBe(true)
    const after = step(scoring, {}, 0.05)
    expect(after.goalScored).toBe(false)
  })

  it('consecutive goals increment the count', () => {
    let state = createState()
    for (let i = 0; i < 2; i++) {
      state = { ...state, ball: { x: goalCenter.x, y: goalCenter.y + 0.1, vx: 0, vy: -1 } }
      state = step(state, {}, 0.05)
    }
    expect(state.goals).toBe(2)
  })
})

describe('stepNpc', () => {
  const def = { home: { x: 0.5, y: 0.5 }, wanderR: 0.4 }

  it('walks toward its waypoint at NPC_SPEED', () => {
    const npc = { x: 0, y: 0, tx: 1, ty: 0, waitT: 0, facing: 'right', moving: false }
    const next = stepNpc(npc, def, 0.1, Math.random)
    expect(next.x).toBeCloseTo(NPC_SPEED * 0.1)
    expect(next.y).toBeCloseTo(0)
    expect(next.facing).toBe('right')
    expect(next.moving).toBe(true)
  })

  it('arrives and starts waiting once within one step of the waypoint', () => {
    const npc = { x: 0.999, y: 0, tx: 1, ty: 0, waitT: 0, facing: 'right', moving: true }
    const next = stepNpc(npc, def, 0.1, () => 0.5)
    expect(next.x).toBeCloseTo(1)
    expect(next.moving).toBe(false)
    expect(next.waitT).toBeCloseTo(NPC_WAIT_MIN + 0.5 * (NPC_WAIT_MAX - NPC_WAIT_MIN))
  })

  it('is deterministic given the same injected rng', () => {
    const npc = { x: 0.999, y: 0, tx: 1, ty: 0, waitT: 0, facing: 'right', moving: true }
    const rand = () => 0.3
    expect(stepNpc(npc, def, 0.1, rand)).toEqual(stepNpc(npc, def, 0.1, rand))
  })

  it('picks a fresh waypoint within home ± wanderR once the wait timer elapses', () => {
    const npc = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, waitT: 0.05, facing: 'right', moving: false }
    const next = stepNpc(npc, def, 0.1, () => 0.25)
    expect(next.waitT).toBe(0)
    const offset = (0.25 * 2 - 1) * def.wanderR
    expect(next.tx).toBeCloseTo(def.home.x + offset)
    expect(next.ty).toBeCloseTo(def.home.y + offset)
    expect(next.tx).toBeGreaterThanOrEqual(def.home.x - def.wanderR - 1e-9)
    expect(next.tx).toBeLessThanOrEqual(def.home.x + def.wanderR + 1e-9)
  })

  it('stops in place when the avatar is within TALK_RADIUS', () => {
    const npc = { x: 0.5, y: 0.5, tx: 1, ty: 0.5, waitT: 0, facing: 'right', moving: true }
    const avatar = { x: 0.5 + TALK_RADIUS - 0.01, y: 0.5 }
    const next = stepNpc(npc, def, 0.1, Math.random, avatar)
    expect(next.x).toBeCloseTo(npc.x)
    expect(next.y).toBeCloseTo(npc.y)
    expect(next.moving).toBe(false)
  })

  it('every NPCS entry has a valid, distinct avatar key', () => {
    NPCS.forEach(def => {
      expect(isValidAvatar(def.avatar)).toBe(true)
    })
    expect(new Set(NPCS.map(d => d.avatar)).size).toBe(NPCS.length)
  })
})

describe('nearestNpcIndex', () => {
  it('returns -1 when no NPC is within TALK_RADIUS', () => {
    const s = createState()
    // NPC homes are all far from the world center spawn point in this layout.
    expect(nearestNpcIndex(s)).toBe(-1)
  })

  it('returns the index of the closest NPC among several in range', () => {
    const s = createState()
    s.npcs = s.npcs.map((npc, i) => ({ ...npc, x: s.x, y: s.y + (i + 1) * 0.02 }))
    expect(nearestNpcIndex(s)).toBe(0)
  })
})

describe('step — sprint', () => {
  it('sprint input moves SPRINT_MULT times farther', () => {
    const s = createState()
    const walk = step(s, { dx: 1, dy: 0 }, 0.1)
    const sprint = step(s, { dx: 1, dy: 0, sprint: true }, 0.1)
    expect(sprint.x - s.x).toBeCloseTo((walk.x - s.x) * SPRINT_MULT)
  })

  it('sprint kicks the ball harder than walking', () => {
    const s = createState()
    const overlap = { ...s, ball: { x: s.x + AVATAR_HALF, y: s.y, vx: 0, vy: 0 } }
    const walk = step(overlap, { dx: 1, dy: 0 }, 0.1)
    const sprint = step(overlap, { dx: 1, dy: 0, sprint: true }, 0.1)
    expect(Math.hypot(sprint.ball.vx, sprint.ball.vy))
      .toBeGreaterThan(Math.hypot(walk.ball.vx, walk.ball.vy))
  })
})

describe('districts + goal best', () => {
  it('labels the four districts inside the world bounds', () => {
    expect(DISTRICTS.map(d => d.id).sort()).toEqual(['board', 'memory', 'reflex', 'word'])
    DISTRICTS.forEach(d => {
      expect(d.x).toBeGreaterThanOrEqual(0)
      expect(d.x).toBeLessThanOrEqual(WORLD_W)
      expect(d.y).toBeGreaterThanOrEqual(0)
      expect(d.y).toBeLessThanOrEqual(WORLD_H)
    })
  })
})

describe('step — NPCs advance independently', () => {
  it('each NPC steps against its own def (different homes/wander), not a shared one', () => {
    const s = createState()
    const next = step(s, {}, 0.1)
    expect(next.npcs).toHaveLength(NPCS.length)
    next.npcs.forEach((npc, i) => {
      // Still resting at its own home (waitT started > dt), independent per NPC.
      expect(npc.x).toBeCloseTo(NPCS[i].home.x)
      expect(npc.y).toBeCloseTo(NPCS[i].home.y)
    })
  })
})
