// Pure sim for the Playground hub — a free-roam avatar world that drops the
// player into a solo demo when they walk up to a cabinet. No DOM/Firebase/React.
// World is WORLD_W × WORLD_H normalized units; (0,0) top-left.

export const WORLD_W = 3
export const WORLD_H = 3

export const SPEED = 0.35 // world units/sec
export const AVATAR_HALF = 0.045

// Kickable ball + goal net (top-center wall).
export const BALL_HALF = 0.028
export const BALL_FRICTION = 2.2 // exponential velocity decay rate, /sec
export const BALL_REST_EPS = 0.002 // speed below which the ball is snapped to rest
export const KICK_BASE_SPEED = 0.5 // base kick impulse; avatar's own speed is added on top
export const BALL_SPAWN = { x: 1.5, y: 1.25 }
export const GOAL = { x: 1.32, y: 0.10, w: 0.36, h: 0.16 }

// Wandering NPCs.
export const NPC_SPEED = SPEED * 0.35
export const NPC_WAIT_MIN = 1
export const NPC_WAIT_MAX = 3
export const TALK_RADIUS = 0.12

export const NPCS = [
  {
    id: 'wizard', avatar: 'wizard.av3', kind: 'daily',
    home: { x: 1.15, y: 1.55 }, wanderR: 0.5,
  },
  {
    id: 'robot', avatar: 'robot.av1', kind: 'flavor',
    home: { x: 2.30, y: 0.70 }, wanderR: 0.45,
    lines: [
      'HIGH SCORE OR IT DIDN\'T HAPPEN.',
      'INSERT COIN? THIS ONE\'S FREE.',
      'BEEP BOOP. GOOD LUCK OUT THERE.',
      'I ONCE BEAT MYSELF AT PONG.',
    ],
  },
  {
    id: 'frog', avatar: 'frog.av2', kind: 'flavor',
    home: { x: 0.70, y: 2.30 }, wanderR: 0.45,
    lines: [
      'RIBBIT. NICE MOVES OUT THERE.',
      'HOP ON OVER TO WORD YARD.',
      'I LIKE LONG WALKS ON LILY PADS.',
      'CROAK IF YOU LOVE ARCADES.',
    ],
  },
  {
    id: 'ghost', avatar: 'ghost.av4', kind: 'flavor',
    home: { x: 1.80, y: 2.20 }, wanderR: 0.45,
    lines: [
      'BOO! ...TOO SOON?',
      'I HAUNT THE WORD YARD MOSTLY.',
      'SPOOKY GOOD GAMES AROUND HERE.',
      'WOOO. ANYWAY, CARRY ON.',
    ],
  },
]

// Curated cabinets spread around the world in four districts. Types must have
// solo/:type support (present in both GAME_TYPES in src/lib/games.js and the
// DEMOS list in Demo.jsx).
export const STATIONS = [
  // Board Plaza
  { type: 'tictactoe', x: 0.45, y: 0.50, r: 0.09 },
  { type: 'connectfour', x: 1.00, y: 0.35, r: 0.09 },
  { type: 'reversi', x: 0.40, y: 1.00, r: 0.09 },
  { type: 'checkers', x: 0.95, y: 0.90, r: 0.09 },
  // Reflex Arcade
  { type: 'pong', x: 2.00, y: 0.35, r: 0.09 },
  { type: 'snake', x: 2.55, y: 0.50, r: 0.09 },
  { type: 'pacmac', x: 2.60, y: 1.00, r: 0.09 },
  { type: 'tron', x: 2.05, y: 0.90, r: 0.09 },
  // Memory Corner
  { type: 'simon', x: 0.40, y: 2.05, r: 0.09 },
  { type: 'chimp', x: 0.95, y: 2.20, r: 0.09 },
  { type: 'visualmemory', x: 0.50, y: 2.60, r: 0.09 },
  // Word Yard
  { type: 'hangwoman', x: 2.05, y: 2.15, r: 0.09 },
  { type: 'wordduel', x: 2.60, y: 2.05, r: 0.09 },
  { type: 'wordhunt', x: 2.30, y: 2.60, r: 0.09 },
]

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function initialNpc(def) {
  return {
    id: def.id,
    x: def.home.x, y: def.home.y,
    tx: def.home.x, ty: def.home.y,
    waitT: 1.5,
    facing: 'right',
    moving: false,
  }
}

export function createState() {
  return {
    x: 1.5,
    y: 1.5,
    facing: 'right',
    moving: false,
    ball: { x: BALL_SPAWN.x, y: BALL_SPAWN.y, vx: 0, vy: 0 },
    ballKicked: false,
    goals: 0,
    goalScored: false,
    npcs: NPCS.map(initialNpc),
  }
}

// Ball physics: integrate by current velocity, damp via exponential friction, bounce off
// the world's walls, snap to rest below BALL_REST_EPS, score+respawn on entering GOAL,
// then (unless it just scored) resolve a kick if the avatar's circle (AVATAR_HALF)
// overlaps the ball's (BALL_HALF) — impulse along the overlap normal, magnitude
// KICK_BASE_SPEED + the avatar's own speed this frame, ball separated out of the overlap
// so it doesn't get stuck re-triggering next frame. Returns { ball, kicked, scored }.
export function stepBall(ball, avatarPos, avatarSpeed, dt) {
  let { x, y, vx, vy } = ball
  x += vx * dt
  y += vy * dt

  const decay = Math.exp(-BALL_FRICTION * dt)
  vx *= decay
  vy *= decay

  if (x < BALL_HALF) { x = BALL_HALF; vx = Math.abs(vx) }
  else if (x > WORLD_W - BALL_HALF) { x = WORLD_W - BALL_HALF; vx = -Math.abs(vx) }
  if (y < BALL_HALF) { y = BALL_HALF; vy = Math.abs(vy) }
  else if (y > WORLD_H - BALL_HALF) { y = WORLD_H - BALL_HALF; vy = -Math.abs(vy) }

  if (Math.hypot(vx, vy) < BALL_REST_EPS) { vx = 0; vy = 0 }

  let scored = false
  if (x >= GOAL.x && x <= GOAL.x + GOAL.w && y >= GOAL.y && y <= GOAL.y + GOAL.h) {
    scored = true
    x = BALL_SPAWN.x
    y = BALL_SPAWN.y
    vx = 0
    vy = 0
  }

  let kicked = false
  if (!scored) {
    const ddx = x - avatarPos.x
    const ddy = y - avatarPos.y
    const dist = Math.hypot(ddx, ddy)
    const minDist = AVATAR_HALF + BALL_HALF
    if (dist < minDist) {
      kicked = true
      const nx = dist > 1e-6 ? ddx / dist : 1
      const ny = dist > 1e-6 ? ddy / dist : 0
      const speed = KICK_BASE_SPEED + avatarSpeed
      vx = nx * speed
      vy = ny * speed
      x = clamp(avatarPos.x + nx * minDist, BALL_HALF, WORLD_W - BALL_HALF)
      y = clamp(avatarPos.y + ny * minDist, BALL_HALF, WORLD_H - BALL_HALF)
    }
  }

  return { ball: { x, y, vx, vy }, kicked, scored }
}

function pickWaypoint(rand, home, wanderR) {
  return {
    tx: clamp(home.x + (rand() * 2 - 1) * wanderR, AVATAR_HALF, WORLD_W - AVATAR_HALF),
    ty: clamp(home.y + (rand() * 2 - 1) * wanderR, AVATAR_HALF, WORLD_H - AVATAR_HALF),
  }
}

// NPC wander: waits waitT seconds, then walks NPC_SPEED toward a random waypoint within
// def.home ± def.wanderR (rand injected for deterministic tests, defaults to Math.random),
// arrives, picks a fresh wait (NPC_WAIT_MIN..NPC_WAIT_MAX) and repeats. Freezes in place
// (still, not walking) whenever the avatar is within TALK_RADIUS, for the chat beat.
export function stepNpc(npc, def, dt, rand = Math.random, avatarPos = null) {
  if (avatarPos && Math.hypot(avatarPos.x - npc.x, avatarPos.y - npc.y) <= TALK_RADIUS) {
    return { ...npc, moving: false }
  }

  if (npc.waitT > 0) {
    const waitT = npc.waitT - dt
    if (waitT > 0) return { ...npc, waitT, moving: false }
    const { tx, ty } = pickWaypoint(rand, def.home, def.wanderR)
    return { ...npc, tx, ty, waitT: 0, moving: false }
  }

  const dx = npc.tx - npc.x
  const dy = npc.ty - npc.y
  const dist = Math.hypot(dx, dy)
  const move = NPC_SPEED * dt
  if (dist <= move) {
    const waitT = NPC_WAIT_MIN + rand() * (NPC_WAIT_MAX - NPC_WAIT_MIN)
    return { ...npc, x: npc.tx, y: npc.ty, waitT, moving: false }
  }
  const ux = dx / dist
  const uy = dy / dist
  const facing = ux > 0 ? 'right' : ux < 0 ? 'left' : npc.facing
  return { ...npc, x: npc.x + ux * move, y: npc.y + uy * move, facing, moving: true }
}

// Index into state.npcs of the closest NPC within TALK_RADIUS, or -1 when none are near.
export function nearestNpcIndex(state) {
  let best = -1
  let bestDist = Infinity
  state.npcs.forEach((npc, i) => {
    const d = Math.hypot(state.x - npc.x, state.y - npc.y)
    if (d <= TALK_RADIUS && d < bestDist) { bestDist = d; best = i }
  })
  return best
}

export function step(state, input, dt, rand = Math.random) {
  const dx = input?.dx ?? 0
  const dy = input?.dy ?? 0
  const len = Math.hypot(dx, dy)
  let x = state.x
  let y = state.y
  if (len > 0) {
    const ux = dx / len
    const uy = dy / len
    x += ux * SPEED * dt
    y += uy * SPEED * dt
  }
  x = clamp(x, AVATAR_HALF, WORLD_W - AVATAR_HALF)
  y = clamp(y, AVATAR_HALF, WORLD_H - AVATAR_HALF)
  const facing = dx > 0 ? 'right' : dx < 0 ? 'left' : state.facing
  const moving = len > 0
  const avatarSpeed = moving ? SPEED : 0

  const { ball, kicked, scored } = stepBall(state.ball, { x, y }, avatarSpeed, dt)
  const npcs = state.npcs.map((npc, i) => stepNpc(npc, NPCS[i], dt, rand, { x, y }))

  return {
    x,
    y,
    facing,
    moving,
    ball,
    ballKicked: kicked,
    goals: state.goals + (scored ? 1 : 0),
    goalScored: scored,
    npcs,
  }
}

const EPS = 1e-9 // float-safe tolerance so an exact-radius hit still counts as inclusive

export function activeStation(state) {
  for (const s of STATIONS) {
    if (Math.hypot(state.x - s.x, state.y - s.y) <= s.r + EPS) return s
  }
  return null
}
