// Pure Space Duel simulation — no DOM, no network, no React. Deterministic and
// unit-testable. The arena is a normalized 1×1 box: x ∈ [0,1] left→right,
// y ∈ [0,1] top→bottom. Two ships duel: X (red, starts left, heading 0 = +x)
// and O (blue, starts right, heading π = −x). Ships bounce off the world walls
// (NOT toroidal — they stay inside the box); bullets DO wrap toroidally so a
// shot exits the right and re-enters the left. A round ends when one ship dies
// (hit by an enemy bullet) or the hard 60-second cap elapses — at the cap the
// ship that LANDED MORE BULLET HITS wins (needs ≥1 margin), equal hits → draw.
//
// This module is the single source of truth for physics. The /demo route runs
// it directly, and in multiplayer the HOST runs it authoritatively and streams
// snapshots over the WebRTC data channel — the guest never simulates, so
// cross-client determinism is not required.

export const SHIP_R = 0.025         // ship radius (fraction of arena)
export const BULLET_R = 0.012       // bullet radius
export const BULLET_SPEED = 0.9     // base bullet speed (arena units/sec)
export const BULLET_LIFE = 1.6      // seconds before a bullet auto-expires
export const FIRE_COOLDOWN = 0.35   // seconds between shots per ship
export const THRUST = 0.55          // thrust acceleration along heading
export const FRICTION = 0.5         // velocity decay per second (v *= exp(-FRICTION*dt))
export const ROT_SPEED = 4.2        // rotation speed (radians/sec)
export const MAX_SPEED = 1.0        // ship velocity magnitude cap
export const ROUND_CAP_S = 60      // hard round time cap (seconds)
export const HITS_WIN_MARGIN = 1    // hit differential needed to win on time cap
export const SHIP_MAX_HP = 3       // ship health points — surviving multiple hits
export const START_FIRE_DELAY = 2   // seconds after round start before firing is allowed

const TWO_PI = Math.PI * 2

/**
 * Build a fresh simulation state.
 * X starts on the left facing right (ang 0); O starts on the right facing
 * left (ang π). Both ships are stationary with fire cooldown ready.
 * @returns {{ ships: object, bullets: Array, t: number }}
 */
export function createState() {
  return {
    ships: {
      X: { x: 0.25, y: 0.5, vx: 0, vy: 0, ang: 0, alive: true, cool: START_FIRE_DELAY, hits: 0, hp: SHIP_MAX_HP },
      O: { x: 0.75, y: 0.5, vx: 0, vy: 0, ang: Math.PI, alive: true, cool: START_FIRE_DELAY, hits: 0, hp: SHIP_MAX_HP },
    },
    bullets: [],
    t: 0,
  }
}

/**
 * Advance the simulation by one fixed timestep. Pure: NEVER mutates `state`.
 * @param {object} state  previous state
 * @param {{X?:{turn?:number,thrust?:number,fire?:number}, O?:{turn?:number,thrust?:number,fire?:number}}} inputs
 *   per-side input: `turn` ∈ {-1,0,1}, `thrust` ∈ {0,1}, `fire` ∈ {0,1}.
 * @param {number} dt  seconds (use a fixed value, e.g. 1/120)
 * @returns {{ state: object, events: Array<{type:string, by?:string, victim?:string}> }}
 */
export function step(state, inputs, dt) {
  const ins = { X: inputs?.X || {}, O: inputs?.O || {} }
  // Deep clone ships + bullets so the caller's state is never mutated.
  const s = {
    ships: {
      X: { ...state.ships.X },
      O: { ...state.ships.O },
    },
    bullets: state.bullets.map(b => ({ ...b })),
    t: state.t,
  }
  const events = []

  const wrapAng = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI

  // 1–5. Per-ship: cooldown, rotate, thrust, friction, integrate, wall bounce.
  for (const side of ['X', 'O']) {
    const sh = s.ships[side]
    sh.cool = Math.max(0, sh.cool - dt)                       // 1. cooldown
    if (sh.alive) {
      sh.ang = wrapAng(sh.ang + (ins[side].turn || 0) * ROT_SPEED * dt) // 2. rotate
      if (ins[side].thrust) {                                  // 3. thrust
        sh.vx += Math.cos(sh.ang) * THRUST * dt
        sh.vy += Math.sin(sh.ang) * THRUST * dt
      }
    }
    // 4. friction
    const fr = Math.exp(-FRICTION * dt)
    sh.vx *= fr
    sh.vy *= fr
    const sp = Math.hypot(sh.vx, sh.vy)
    if (sp > MAX_SPEED) {                                      // 4. clamp speed
      sh.vx = (sh.vx / sp) * MAX_SPEED
      sh.vy = (sh.vy / sp) * MAX_SPEED
    }
    if (sh.alive) {
      sh.x += sh.vx * dt                                       // 5. integrate
      sh.y += sh.vy * dt
      // bounce off world walls (slightly bouncy, energy loss → slows ship)
      if (sh.x < SHIP_R) { sh.x = SHIP_R; sh.vx = -0.5 * sh.vx }
      else if (sh.x > 1 - SHIP_R) { sh.x = 1 - SHIP_R; sh.vx = -0.5 * sh.vx }
      if (sh.y < SHIP_R) { sh.y = SHIP_R; sh.vy = -0.5 * sh.vy }
      else if (sh.y > 1 - SHIP_R) { sh.y = 1 - SHIP_R; sh.vy = -0.5 * sh.vy }
    }
  }

  // 6. Fire (spawn a bullet if requested, alive, and cooldown ready).
  for (const side of ['X', 'O']) {
    const sh = s.ships[side]
    if (ins[side].fire && sh.alive && sh.cool <= 0) {
      const nx = sh.x + Math.cos(sh.ang) * SHIP_R * 1.2
      const ny = sh.y + Math.sin(sh.ang) * SHIP_R * 1.2
      s.bullets.push({
        x: nx, y: ny,
        vx: Math.cos(sh.ang) * BULLET_SPEED + sh.vx,
        vy: Math.sin(sh.ang) * BULLET_SPEED + sh.vy,
        life: BULLET_LIFE,
        by: side,
      })
      sh.cool = FIRE_COOLDOWN
      events.push({ type: 'fire', by: side })
    }
  }

  // 7. Update bullets: integrate, age, wrap toroidally, cull dead/expired.
  const live = []
  for (const b of s.bullets) {
    const nb = { ...b }
    nb.x += nb.vx * dt
    nb.y += nb.vy * dt
    nb.life -= dt
    // wrap (bullets do NOT bounce; they exit one side and re-enter the other)
    nb.x = ((nb.x % 1) + 1) % 1
    nb.y = ((nb.y % 1) + 1) % 1
    if (nb.life > 0 && !nb.dead) live.push(nb)
  }
  s.bullets = live

  // 8. Bullet vs ship: only an OPPOSITE-side bullet can damage (no self-fire).
  //    Each hit decrements HP; the ship dies when HP reaches 0. Every connecting
  //    bullet increments the firing ship's hits counter (for the time-cap tiebreak).
  if (s.bullets.length) {
    for (const b of s.bullets) {
      for (const side of ['X', 'O']) {
        const sh = s.ships[side]
        if (!sh.alive) continue
        if (b.by === side) continue                            // self immunity
        const dx = b.x - sh.x, dy = b.y - sh.y
        if (dx * dx + dy * dy < (SHIP_R + BULLET_R) * (SHIP_R + BULLET_R)) {
          sh.hp -= 1
          b.dead = true                                        // cull this bullet
          s.ships[b.by].hits += 1
          if (sh.hp <= 0) {
            sh.alive = false
            events.push({ type: 'kill', by: b.by, victim: side })
          } else {
            events.push({ type: 'hit', by: b.by, victim: side })
          }
          break                                                // a bullet hits at most one ship
        }
      }
    }
    s.bullets = s.bullets.filter(b => !b.dead)
  }

  // 9. Advance round time. (No RNG — the sim is deterministic.)
  s.t += dt

  return { state: s, events }
}

/**
 * Round winner given the current sim state.
 * - One alive, other dead → the survivor wins.
 * - Both dead → draw.
 * - Both alive and round time ≥ cap → most landed hits wins (needs ≥1 margin),
 *   equal hits (or within margin) → draw.
 * - Otherwise `null` (round still in progress).
 * @param {object} state
 * @returns {'X'|'O'|'draw'|null}
 */
export function getWinner(state) {
  const X = state.ships.X, O = state.ships.O
  if (X.alive && !O.alive) return 'X'
  if (O.alive && !X.alive) return 'O'
  if (!X.alive && !O.alive) return 'draw'
  if (state.t >= ROUND_CAP_S) {
    const hx = X.hits, ho = O.hits
    if (hx >= ho + HITS_WIN_MARGIN) return 'X'
    if (ho >= hx + HITS_WIN_MARGIN) return 'O'
    return 'draw'
  }
  return null
}

/**
 * Heuristic, reaction-handicapped AI input for the demo mode. Deterministic
 * move-by-move: it turns toward the opponent's predicted position (leading it a
 * little), paces its thrust so it doesn't hug a wall, and fires when roughly
 * facing the opponent with a ready cooldown. Beatable by a human.
 * @param {object} state
 * @param {'X'|'O'} side
 * @returns {{turn:-1|0|1, thrust:0|1, fire:0|1}}
 */
export function computeAI(state, side) {
  const opp = side === 'X' ? 'O' : 'X'
  const me = state.ships[side], oppS = state.ships[opp]
  if (!me.alive) return { turn: 0, thrust: 0, fire: 0 }

  const lead = 0.25
  const tx = oppS.x + oppS.vx * lead
  const ty = oppS.y + oppS.vy * lead
  let desired = Math.atan2(ty - me.y, tx - me.x)
  let diff = desired - me.ang
  // normalize to [-π, π]
  diff = ((diff + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI

  const deadzone = 0.08
  const turn = Math.abs(diff) < deadzone ? 0 : diff > 0 ? 1 : -1
  const dist = Math.hypot(tx - me.x, ty - me.y)
  const facing = Math.abs(diff) < 0.6
  const tooClose = dist < 0.12
  // Thrust paces itself deterministically (~half the time, half-second periods).
  const pace = Math.sin(Math.floor(state.t * 2))
  const thrust = facing && !tooClose && pace > -0.2 ? 1 : 0
  // Fire when roughly facing the opponent and within engagement range.
  const fire = facing && me.cool <= 0 && dist < 0.85 ? 1 : 0
  return { turn, thrust, fire }
}