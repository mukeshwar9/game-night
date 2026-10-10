// @ts-check
// bamboozleSim.js — the movers in a BAMBOOZLE garden: dodgers, bots, hearts,
// coins and the GRAB twist. Pure: no DOM, no Firebase, no React.
//
// The garden itself (boulders, which wall fires and when) is the seeded
// timeline in bamboozleLogic.js and never depends on a player. This module
// only adds what the players do inside it, so the same `stepSim` runs the
// one-phone page, the solo page and each phone's own dodger in an online race.
//
//   const sim = createSim({ seed, players: [{ bot: false }, { bot: true }] })
//   const events = stepSim(sim, [{ x, y, grab }], 1 / 60)
//
// `events` carry everything the page reacts to (sounds, particles, haptics).
import { mulberry32 } from './detMath'
import {
  COIN_LEAD, COINS_PER_HEART, COUNT_IN, HEARTS, HOLD, INVULN, MAX_HEARTS, RADIUS, SPEED,
  createTimeline, laneRect, safeCells, yardSize,
} from './bamboozleLogic'

export { COUNT_IN }

// ── GRAB twist ────────────────────────────────────────────────────────────
// Hold a rival beside you and walk them out of cover; let go and they are
// thrown the way you face. Needs contact, so it is for one phone and solo.

/** How close (tiles, edge to edge) a rival must be to be grabbed. */
export const GRAB_REACH = 0.14
/** The longest hold, in seconds, before the rival is thrown anyway. */
export const GRAB_MAX = 1.4
/** Seconds of pushing their own pad that frees a held dodger. */
export const GRAB_BREAK = 0.5
/** Recharge after a hold. A grab that finds nobody costs only GRAB_MISS. */
export const GRAB_RECHARGE = 3
export const GRAB_MISS = 0.25
/** The grabber walks at this share of full speed. */
export const GRAB_SLOW = 0.7
/** Throw speed in tiles per second; it decays quickly. */
export const GRAB_FLING = 6

// ── Bots ──────────────────────────────────────────────────────────────────

export const BOT_LEVELS = ['easy', 'normal', 'hard']

/** Reaction window (s), chance to freeze for a whole warning, speed share, and how often it grabs. */
export const BOTS = {
  easy: { react: [0.45, 0.7], freeze: 0.18, speed: 0.82, mean: 0.2 },
  normal: { react: [0.24, 0.4], freeze: 0.06, speed: 0.92, mean: 0.5 },
  hard: { react: [0.1, 0.2], freeze: 0, speed: 1, mean: 0.75 },
}

const KNOCK_DECAY = 0.0006

/**
 * @typedef {{
 *   i: number, id: string | null, bot: boolean,
 *   x: number, y: number, vx: number, vy: number, kx: number, ky: number, fx: number, fy: number,
 *   hp: number, inv: number, out: boolean, outT: number, outVolley: number | null,
 *   coins: number, hits: number, squash: number, walk: number, sx: number, sy: number,
 *   grab: number | null, heldBy: number | null, grabT: number, grabCd: number, struggle: number,
 *   brain: { react: number, frozen: boolean, mean: boolean, grab: boolean, roam: [number, number] | null, idleT: number },
 * }} Dodger
 */

/**
 * A fresh round.
 * `endless` keeps the garden running after the round is decided (an online
 * racer who is out keeps watching the same volleys); otherwise the poles finish
 * their pull-back and rest.
 * @param {{
 *   seed: number, players: { id?: string | null, bot?: boolean }[], n?: number,
 *   crumble?: boolean, coins?: boolean, grab?: boolean, botLevel?: string, countIn?: number, hearts?: number,
 *   endless?: boolean,
 * }} p
 */
export function createSim({
  seed, players, n, crumble = true, coins = false, grab = false, botLevel = 'normal', countIn = COUNT_IN, hearts = HEARTS,
  endless = false,
}) {
  const size = n ?? yardSize(players.length)
  const tl = createTimeline({ seed, n: size, crumble, coins })
  const spawn = mulberry32((seed ^ 0x5bd1e995) | 0)
  /** @type {[number, number][]} */
  const used = []
  /** @type {Dodger[]} */
  const dodgers = players.map((p, i) => {
    let c = 0
    let r = 0
    for (let guard = 0; guard < 200; guard++) {
      c = Math.floor(spawn() * size)
      r = Math.floor(spawn() * size)
      if (tl.initial.some((s) => s.c === c && s.r === r)) continue
      if (used.some(([uc, ur]) => uc === c && ur === r)) continue
      break
    }
    used.push([c, r])
    return {
      i, id: p.id ?? null, bot: !!p.bot,
      x: c + 0.5, y: r + 0.5, vx: 0, vy: 0, kx: 0, ky: 0, fx: 0, fy: 1,
      hp: hearts, inv: 0, out: false, outT: 0, outVolley: null,
      coins: 0, hits: 0, squash: 0, walk: 0, sx: 0, sy: 0,
      grab: null, heldBy: null, grabT: 0, grabCd: 0, struggle: 0,
      brain: { react: 0, frozen: false, mean: false, grab: false, roam: null, idleT: 0 },
    }
  })
  return {
    n: size, seed, tl, opts: { crumble, coins, grab, botLevel, endless },
    t: -countIn, clock: 0,
    players: dodgers,
    k: -1, phase: /** @type {string} */ ('count'),
    view: tl.view(0),
    coinTaken: -1,
    over: false, winner: /** @type {number | null} */ (null), endAt: /** @type {number | null} */ (null),
    rng: mulberry32((seed ^ 0x9e3779b9) | 0),
  }
}

/** @typedef {ReturnType<typeof createSim>} Sim */

/** Dodgers still standing. @param {Sim} sim */
export function alive(sim) {
  return sim.players.filter((p) => !p.out)
}

/** The coin on the ground right now, in tile units, or null. @param {Sim} sim */
export function liveCoin(sim) {
  const c = sim.view.coin
  return c && sim.coinTaken !== sim.view.k ? { x: c.c + 0.5, y: c.r + 0.5, c: c.c, r: c.r } : null
}

/** Is tile (c, r) cover for the volley that is about to fire (or just fired)? @param {Sim} sim */
export function coverTiles(sim) {
  const v = sim.view
  const blocked = (c, r) => v.stones.some((s) => s.c === c && s.r === r)
  return safeCells(sim.n, blocked, v.sides)
}

/** Pole width exposure: is a point inside a pole that is out right now? */
export function inPole(sim, x, y, margin = 0) {
  for (const lane of sim.view.lanes) {
    const [x0, y0, x1, y1] = laneRect(sim.n, lane, sim.view.ext)
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) continue
    const cx = Math.min(x1, Math.max(x0, x))
    const cy = Math.min(y1, Math.max(y0, y))
    if (Math.hypot(x - cx, y - cy) < RADIUS * 0.92 + margin) return true
  }
  return false
}

// ── Stepping ──────────────────────────────────────────────────────────────

/**
 * Advance the round by `dt` seconds.
 * @param {Sim} sim
 * @param {({ x?: number, y?: number, grab?: boolean } | null | undefined)[]} inputs one per dodger; ignored for bots
 * @param {number} dt
 * @returns {{ type: string, [k: string]: any }[]}
 */
export function stepSim(sim, inputs, dt) {
  /** @type {{ type: string, [k: string]: any }[]} */
  const events = []
  const wasCounting = sim.t < 0
  sim.t += dt
  sim.clock += dt
  const live = !sim.over || sim.opts.endless
  // After the round is decided the poles finish their pull-back and rest.
  const viewT = sim.endAt != null ? Math.min(sim.t, sim.endAt) : sim.t
  const prevView = sim.view
  const v = sim.tl.view(Math.max(0, viewT))
  sim.view = v

  if (sim.t < 0) {
    for (const p of sim.players) { p.sx = 0; p.sy = 0; p.vx = 0; p.vy = 0 }
    return events
  }
  if (wasCounting) events.push({ type: 'go' })

  if (sim.k !== v.k || sim.phase !== v.phase) {
    const newVolley = sim.k !== v.k
    sim.k = v.k
    sim.phase = v.phase
    if (live) {
      if (v.phase === 'warn') {
        events.push({ type: 'warn', k: v.k, sides: v.sides })
        for (const p of sim.players) if (p.bot && !p.out) armBot(sim, p)
      } else if (v.phase === 'out') events.push({ type: 'fire', k: v.k, sides: v.sides })
      else if (v.phase === 'hold') {
        events.push({ type: 'impact', k: v.k, lanes: v.lanes })
        for (const l of v.lanes) if (l.stoneId != null) events.push({ type: 'struck', stoneId: l.stoneId, k: v.k })
      } else if (v.phase === 'back') {
        events.push({ type: 'retract', k: v.k })
        for (const id of v.volley.breaks) {
          const s = v.volley.stones.find((x) => x.id === id)
          if (s) events.push({ type: 'crack', c: s.c, r: s.r })
        }
      }
      if (newVolley && v.k > 0) events.push({ type: 'volley', k: v.k })
    }
  }
  // Boulders landing since the last step.
  const before = prevView.pending.map((s) => s.id)
  for (const s of v.solid) if (before.includes(s.id)) events.push({ type: 'land', c: s.c, r: s.r })

  movePlayers(sim, inputs, dt, events)

  if (!sim.over && (v.phase === 'out' || v.phase === 'hold')) hitTest(sim, events)

  if (!sim.over) {
    const left = alive(sim)
    const decided = sim.players.length >= 2 ? left.length <= 1 : left.length === 0
    if (decided) {
      sim.over = true
      sim.winner = left.length === 1 ? left[0].i : null
      if (!sim.opts.endless) sim.endAt = sim.tl.volleyAt(Math.max(0, sim.t)).backEnd
      events.push({ type: 'over', winner: sim.winner })
    }
  }
  return events
}

/**
 * Skip a late joiner or a reloaded phone ahead to time `t` without resolving
 * hits for the volleys that went by. The caller restores hearts from its own
 * stats; this only moves the clock and what stands in the garden.
 * @param {Sim} sim @param {number} t
 */
export function fastForward(sim, t) {
  if (t <= sim.t) return
  sim.t = t
  const v = sim.tl.view(Math.max(0, t))
  sim.view = v
  sim.k = v.k
  sim.phase = v.phase
  for (const p of sim.players) { p.inv = 0; p.vx = 0; p.vy = 0; p.kx = 0; p.ky = 0 }
}

// ── Hearts ────────────────────────────────────────────────────────────────

/** @param {Sim} sim @param {Dodger} p @param {any[]} events */
function hurt(sim, p, events) {
  if (p.grab != null) letGo(sim, p, false, events)
  p.hp -= 1
  p.hits += 1
  p.inv = INVULN + HOLD
  p.squash = 1
  events.push({ type: 'hit', i: p.i, x: p.x, y: p.y, hp: p.hp })
  if (p.hp <= 0) {
    p.out = true
    p.outT = 0
    p.outVolley = sim.view.k
    if (p.heldBy != null) { const g = sim.players[p.heldBy]; if (g) letGo(sim, g, false, events) }
    events.push({ type: 'out', i: p.i, x: p.x, y: p.y, k: sim.view.k })
  }
}

/** @param {Sim} sim @param {any[]} events */
function hitTest(sim, events) {
  const v = sim.view
  for (const p of alive(sim)) {
    if (p.inv > 0) continue
    for (const lane of v.lanes) {
      const [x0, y0, x1, y1] = laneRect(sim.n, lane, v.ext)
      if (x1 - x0 < 0.02 || y1 - y0 < 0.02) continue
      const cx = Math.min(x1, Math.max(x0, p.x))
      const cy = Math.min(y1, Math.max(y0, p.y))
      if (Math.hypot(p.x - cx, p.y - cy) < RADIUS * 0.92) { hurt(sim, p, events); break }
    }
  }
}

// ── Movement ──────────────────────────────────────────────────────────────

/** @param {Dodger} p @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
function pushOutOfBox(p, x0, y0, x1, y1) {
  const r = RADIUS
  const cx = Math.min(x1, Math.max(x0, p.x))
  const cy = Math.min(y1, Math.max(y0, p.y))
  const dx = p.x - cx
  const dy = p.y - cy
  const d = Math.hypot(dx, dy)
  if (d >= r) return
  if (d > 0.0001) { p.x = cx + (dx / d) * r; p.y = cy + (dy / d) * r; return }
  const l = p.x - x0
  const rr = x1 - p.x
  const t = p.y - y0
  const b = y1 - p.y
  const m = Math.min(l, rr, t, b)
  if (m === l) p.x = x0 - r
  else if (m === rr) p.x = x1 + r
  else if (m === t) p.y = y0 - r
  else p.y = y1 + r
}

/** @param {Sim} sim @param {Dodger} p @param {boolean} thrown @param {any[]} events */
function letGo(sim, p, thrown, events) {
  const q = p.grab != null ? sim.players[p.grab] : null
  p.grab = null
  p.grabCd = GRAB_RECHARGE
  if (!q) return
  q.heldBy = null
  if (thrown && !q.out) {
    q.kx += p.fx * GRAB_FLING
    q.ky += p.fy * GRAB_FLING
    events.push({ type: 'throw', i: p.i, j: q.i, x: q.x, y: q.y })
  } else if (!q.out) {
    p.kx -= p.fx * 3
    p.ky -= p.fy * 3
    events.push({ type: 'free', i: p.i, j: q.i, x: p.x, y: p.y })
  }
}

/** @param {Sim} sim @param {Dodger} p @param {{ grab?: boolean } | null | undefined} input */
function wantsGrab(sim, p, input) {
  if (!sim.opts.grab) return false
  return p.bot ? p.brain.grab : !!input?.grab
}

/** @param {Sim} sim @param {any[]} inputs @param {number} dt @param {any[]} events */
function updateGrabs(sim, inputs, dt, events) {
  const over = sim.over
  for (const p of sim.players) {
    p.grabCd = Math.max(0, p.grabCd - dt)
    const want = !p.out && !over && sim.t >= 0 && wantsGrab(sim, p, inputs[p.i])
    if (p.grab == null) {
      if (!want || p.grabCd > 0 || p.heldBy != null) continue
      let best = null
      let bd = RADIUS * 2 + GRAB_REACH
      for (const q of sim.players) {
        if (q === p || q.out || q.heldBy != null || q.grab != null) continue
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        if (d < bd) { bd = d; best = q }
      }
      if (best) {
        p.grab = best.i
        best.heldBy = p.i
        p.grabT = 0
        best.struggle = 0
        const d = Math.hypot(best.x - p.x, best.y - p.y) || 1
        p.fx = (best.x - p.x) / d
        p.fy = (best.y - p.y) / d
        events.push({ type: 'grab', i: p.i, j: best.i })
      } else if (!p.bot) p.grabCd = GRAB_MISS
    } else {
      const q = sim.players[p.grab]
      p.grabT += dt
      q.struggle += Math.hypot(q.sx, q.sy) * dt
      if (q.out || p.out) letGo(sim, p, false, events)
      else if (q.struggle >= GRAB_BREAK) letGo(sim, p, false, events)
      else if (!want || p.grabT >= GRAB_MAX) letGo(sim, p, true, events)
    }
  }
}

/** @param {Sim} sim @param {any[]} inputs @param {number} dt @param {any[]} events */
function movePlayers(sim, inputs, dt, events) {
  const n = sim.n
  const v = sim.view
  const counting = sim.t < 0
  if (!counting) updateGrabs(sim, inputs, dt, events)
  const botSpeed = BOTS[/** @type {'easy'|'normal'|'hard'} */ (sim.opts.botLevel)] ?? BOTS.normal

  for (const p of sim.players) {
    p.inv = Math.max(0, p.inv - dt)
    p.squash = Math.max(0, p.squash - dt * 3)
    let sx = 0
    let sy = 0
    if (!counting) {
      if (p.bot) [sx, sy] = botStick(sim, p, dt)
      else {
        const inp = inputs[p.i]
        sx = Number(inp?.x) || 0
        sy = Number(inp?.y) || 0
        const m = Math.hypot(sx, sy)
        if (m > 1) { sx /= m; sy /= m }
      }
    }
    p.sx = sx
    p.sy = sy
    if (p.out) { p.outT += dt; continue }
    if (sim.over && alive(sim).length === 1) { sx *= 0.5; sy *= 0.5 }
    const sp = SPEED * (p.bot ? botSpeed.speed : 1) * (p.grab != null ? GRAB_SLOW : 1)
    if (p.heldBy != null) { sx = 0; sy = 0 }
    const a = Math.min(1, dt * 16)
    p.vx += (sx * sp - p.vx) * a
    p.vy += (sy * sp - p.vy) * a
    p.kx *= Math.pow(KNOCK_DECAY, dt)
    p.ky *= Math.pow(KNOCK_DECAY, dt)
    p.x += (p.vx + p.kx) * dt
    p.y += (p.vy + p.ky) * dt
    const speed = Math.hypot(p.vx, p.vy)
    if (speed > 0.3) { p.fx = p.vx / speed; p.fy = p.vy / speed; p.walk += dt * speed * 3.2 }
  }

  const standing = alive(sim)
  // A held dodger is carried in front of whoever holds them.
  for (const p of standing) {
    if (p.grab == null) continue
    const q = sim.players[p.grab]
    const tx = p.x + p.fx * (RADIUS * 2 + 0.02)
    const ty = p.y + p.fy * (RADIUS * 2 + 0.02)
    const a = Math.min(1, dt * 22)
    q.x += (tx - q.x) * a
    q.y += (ty - q.y) * a
    q.vx = p.vx
    q.vy = p.vy
    q.fx = -p.fx
    q.fy = -p.fy
  }
  // Dodgers do not overlap, except the pair that is holding.
  for (let a = 0; a < standing.length; a++) {
    for (let b = a + 1; b < standing.length; b++) {
      const p = standing[a]
      const q = standing[b]
      if (p.grab === q.i || q.grab === p.i) continue
      const dx = q.x - p.x
      const dy = q.y - p.y
      const d = Math.hypot(dx, dy) || 0.001
      const min = RADIUS * 2
      if (d >= min) continue
      const ov = min - d
      p.x -= (dx / d) * ov * 0.5
      p.y -= (dy / d) * ov * 0.5
      q.x += (dx / d) * ov * 0.5
      q.y += (dy / d) * ov * 0.5
    }
  }
  const coin = liveCoin(sim)
  for (const p of standing) {
    for (const s of v.solid) pushOutOfBox(p, s.c + 0.06, s.r + 0.06, s.c + 0.94, s.r + 0.94)
    p.x = Math.min(n - RADIUS, Math.max(RADIUS, p.x))
    p.y = Math.min(n - RADIUS, Math.max(RADIUS, p.y))
    if (coin && sim.coinTaken !== v.k && !sim.over && Math.hypot(coin.x - p.x, coin.y - p.y) < RADIUS + 0.18) {
      sim.coinTaken = v.k
      p.coins += 1
      events.push({ type: 'coin', i: p.i, x: coin.x, y: coin.y })
      if (p.coins >= COINS_PER_HEART && p.hp < MAX_HEARTS) {
        p.coins -= COINS_PER_HEART
        p.hp += 1
        events.push({ type: 'heal', i: p.i, hp: p.hp })
      }
      p.coins = Math.min(p.coins, COINS_PER_HEART)
    }
  }
}

// ── Bots ──────────────────────────────────────────────────────────────────

/** @param {Sim} sim @param {Dodger} p */
function armBot(sim, p) {
  const b = BOTS[/** @type {'easy'|'normal'|'hard'} */ (sim.opts.botLevel)] ?? BOTS.normal
  p.brain.react = b.react[0] + sim.rng() * (b.react[1] - b.react[0])
  p.brain.frozen = sim.rng() < b.freeze
  p.brain.mean = sim.rng() < b.mean
}

/**
 * Shortest walk over free tiles to any goal, as a list of tiles (from first).
 * @param {number} n @param {[number, number]} from @param {[number, number][]} goals @param {(c: number, r: number) => boolean} blocked
 */
export function pathTo(n, from, goals, blocked) {
  const key = (c, r) => r * n + c
  const goalSet = new Set(goals.map(([c, r]) => key(c, r)))
  /** @type {Map<number, number>} */
  const prev = new Map([[key(from[0], from[1]), -1]])
  /** @type {[number, number][]} */
  const queue = [from]
  for (let head = 0; head < queue.length; head++) {
    const [c, r] = queue[head]
    if (goalSet.has(key(c, r))) {
      /** @type {[number, number][]} */
      const path = []
      let k = key(c, r)
      while (k !== -1) { path.unshift([k % n, Math.floor(k / n)]); k = /** @type {number} */ (prev.get(k)) }
      return path
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c2 = c + dc
      const r2 = r + dr
      if (c2 < 0 || r2 < 0 || c2 >= n || r2 >= n || blocked(c2, r2) || prev.has(key(c2, r2))) continue
      prev.set(key(c2, r2), key(c, r))
      queue.push([c2, r2])
    }
  }
  return null
}

/** @param {Sim} sim @param {Dodger} p @param {number} dt @returns {[number, number]} */
function botStick(sim, p, dt) {
  const n = sim.n
  const v = sim.view
  const b = p.brain
  if (p.out || sim.over) { b.grab = false; return [0, 0] }
  if (v.phase !== 'warn') b.grab = false
  const solidAt = (c, r) => v.solid.some((s) => s.c === c && s.r === r)
  const soonAt = (c, r) => v.stones.some((s) => s.c === c && s.r === r)
  /** @type {[number, number]} */
  const here = [Math.min(n - 1, Math.floor(p.x)), Math.min(n - 1, Math.floor(p.y))]
  /** @type {[number, number][] | null} */
  let goal = null
  if (v.phase === 'warn' || v.phase === 'out' || v.phase === 'hold') {
    if (b.frozen) return [0, 0]
    b.react -= dt
    if (b.react > 0) return [0, 0]
    const safe = safeCells(n, soonAt, v.sides)
    if (safe.some(([c, r]) => c === here[0] && r === here[1])) goal = [here]
    else goal = pathTo(n, here, safe, solidAt)
    if (sim.opts.grab && v.phase === 'warn' && b.mean && p.heldBy == null) {
      // Drag a neighbour out of cover: aim at the nearest exposed tile, let go just before the poles fire.
      if (p.grab != null) {
        const q = sim.players[p.grab]
        b.grab = v.left > 0.1
        /** @type {[number, number] | null} */
        let best = null
        let bd = 99
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (solidAt(c, r) || safe.some(([sc, sr]) => sc === c && sr === r)) continue
            const d = Math.hypot(c + 0.5 - q.x, r + 0.5 - q.y)
            if (d < bd) { bd = d; best = [c, r] }
          }
        }
        if (best) {
          const dx = best[0] + 0.5 - p.x
          const dy = best[1] + 0.5 - p.y
          const d = Math.hypot(dx, dy) || 1
          return [dx / d, dy / d]
        }
      } else if (p.grabCd <= 0 && v.left < 0.8 && v.left > 0.25) {
        b.grab = sim.players.some((q) => q !== p && !q.out && q.heldBy == null
          && Math.hypot(q.x - p.x, q.y - p.y) < RADIUS * 2 + GRAB_REACH
          && safe.some(([sc, sr]) => sc === Math.floor(q.x) && sr === Math.floor(q.y)))
      } else b.grab = false
    } else b.grab = false
  } else {
    b.idleT -= dt
    const coin = liveCoin(sim)
    if (coin) goal = pathTo(n, here, [[coin.c, coin.r]], solidAt)
    else if (b.idleT <= 0 || !b.roam) {
      b.idleT = 0.8 + sim.rng() * 1.2
      /** @type {[number, number][]} */
      const near = []
      for (const s of v.solid) {
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = s.c + dc
          const r = s.r + dr
          if (c >= 0 && r >= 0 && c < n && r < n && !solidAt(c, r)) near.push([c, r])
        }
      }
      b.roam = near.length ? near[Math.floor(sim.rng() * near.length)] : here
    }
    if (!goal && b.roam) goal = pathTo(n, here, [b.roam], solidAt)
  }
  if (!goal || !goal.length) return [0, 0]
  const next = goal.length > 1 ? goal[1] : goal[0]
  const dx = next[0] + 0.5 - p.x
  const dy = next[1] + 0.5 - p.y
  const d = Math.hypot(dx, dy)
  if (d < 0.06) return [0, 0]
  return [dx / d, dy / d]
}

// ── Input mapping ─────────────────────────────────────────────────────────

/** Pixels of thumb travel for full speed, and how far the pad follows a drifting thumb. */
export const PAD_FULL = 40
export const PAD_FOLLOW = 44
const PAD_DEAD = 0.12

/**
 * A thumb pad: the stick vector for a drag of (dx, dy) pixels from where the
 * thumb went down. Unit length at most; a small deadzone keeps a resting thumb still.
 * @param {number} dx @param {number} dy @returns {[number, number]}
 */
export function padVector(dx, dy) {
  let x = dx / PAD_FULL
  let y = dy / PAD_FULL
  const m = Math.hypot(x, y)
  if (m > 1) { x /= m; y /= m }
  return m < PAD_DEAD ? [0, 0] : [x, y]
}

/**
 * The pad's origin after the thumb moved to (x, y): it stays put until the
 * thumb drifts more than PAD_FOLLOW away, then trails it.
 * @param {number} ox @param {number} oy @param {number} x @param {number} y @returns {[number, number]}
 */
export function followPad(ox, oy, x, y) {
  const d = Math.hypot(x - ox, y - oy)
  if (d <= PAD_FOLLOW) return [ox, oy]
  return [x - ((x - ox) / d) * PAD_FOLLOW, y - ((y - oy) / d) * PAD_FOLLOW]
}

/** Keyboard layouts, one per seat: up, right, down, left, then grab keys (by `event.code`). */
export const SEAT_KEYS = [
  { move: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], grab: ['Space', 'ShiftRight'] },
  { move: ['KeyW', 'KeyD', 'KeyS', 'KeyA'], grab: ['KeyQ', 'ShiftLeft'] },
  { move: ['KeyI', 'KeyL', 'KeyK', 'KeyJ'], grab: ['KeyU'] },
  { move: ['KeyT', 'KeyH', 'KeyG', 'KeyF'], grab: ['KeyR'] },
]

/**
 * The stick vector a set of held keys makes for one layout.
 * @param {Set<string>} down @param {string[]} move [up, right, down, left]
 * @returns {[number, number]}
 */
export function keyVector(down, move) {
  let x = 0
  let y = 0
  if (down.has(move[0])) y -= 1
  if (down.has(move[2])) y += 1
  if (down.has(move[3])) x -= 1
  if (down.has(move[1])) x += 1
  const m = Math.hypot(x, y)
  return m > 1 ? [x / m, y / m] : [x, y]
}

/**
 * Where each seat's thumb strip sits on one phone, by player count:
 * [top row, bottom row] of seat indexes. Top-row strips read from across the table.
 */
export const LOCAL_LAYOUT = {
  2: [[1], [0]],
  3: [[1, 2], [0]],
  4: [[1, 2], [3, 0]],
}

// ── Match bookkeeping (one phone and solo) ────────────────────────────────

/**
 * Tally a finished round into per-seat wins. Returns the new wins, who (if
 * anyone) took the match, and whether the round was a draw.
 * @param {number[]} wins @param {number | null} winner @param {number} toWin
 */
export function tallyRound(wins, winner, toWin) {
  const next = wins.slice()
  if (winner == null) return { wins: next, matchWinner: null, draw: true }
  next[winner] = (next[winner] || 0) + 1
  return { wins: next, matchWinner: next[winner] >= toWin ? winner : null, draw: false }
}

/** The coin's window, for tests and HUD hints. */
export const COIN_WINDOW = COIN_LEAD
