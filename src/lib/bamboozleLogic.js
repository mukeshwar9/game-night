// @ts-check
// bamboozleLogic.js — pure BAMBOOZLE rules. No DOM, no Firebase, no React.
//
// A walled garden of square tiles. Bamboo poles rest in all four walls, one
// per lane. A wall glows, then every pole on it fires across; a pole stops at
// the first boulder in its lane, so the only safe ground is behind a rock.
// Three hearts each, the last dodger standing wins.
//
// Everything that is not a dodger is a pure function of (seed, options): the
// boulders, which wall fires, when, which boulder cracks and where the next one
// lands. That is the *timeline*. It never looks at where a player stands, so
// every phone in an online race sees the same garden at the same server time
// without anything crossing Firebase, and one phone and solo play replay it
// from a seed too. The movers (dodgers, bots, grabs) live in bamboozleSim.js.
//
// All times are seconds from the moment the round goes live (t = 0).
import { mulberry32 } from './detMath'

// ── Tuning ────────────────────────────────────────────────────────────────
// Starting values, chosen to make the loop playable, not measured on people.

export const HEARTS = 3
export const MAX_HEARTS = 4
export const COINS_PER_HEART = 3
/** Rounds that take a one-phone or solo match. Online rooms use RACE_MATCH_WINS. */
export const ROUNDS_TO_WIN = 2
/** Tiles per second a dodger walks. */
export const SPEED = 2.7
/** Dodger radius in tiles. */
export const RADIUS = 0.2
/** Pole width as a share of its lane. */
export const POLE_W = 0.7
/** Share of the warning a fair walk to cover may use. */
export const REACH = 0.7

export const WARN_START = 1.15
export const WARN_FLOOR = 0.5
export const WARN_STEP = 0.045
export const GAP_START = 0.9
export const GAP_FLOOR = 0.35
export const GAP_STEP = 0.04
/** Seconds a pole takes to shoot out, stay out, and draw back. */
export const OUT = 0.14
export const HOLD = 0.45
export const BACK = 0.45
/** From this volley a second wall may fire together with the first; from DOUBLE_ALWAYS it always does. */
export const DOUBLE_FROM = 6
export const DOUBLE_ALWAYS = 14
/** From this volley the round turns brutal so it always ends: no fair-walls rule, a short warning, two walls. */
export const SUDDEN_FROM = 24
export const WARN_SUDDEN = 0.4
/** After a hit a dodger blinks and cannot be hit by the same volley again. */
export const INVULN = 1.3
/** Blocks a boulder stops before it breaks. */
export const STONE_HP = 3
/** A hit point count no volley can wear down (boulders when CRUMBLE is off). */
export const NO_BREAK = 99
/** Seconds the landing ring shows before a new boulder lands. */
export const RISE = 1.0
/** The coin shows this long before its wall fires, and vanishes when the poles go. */
export const COIN_LEAD = 0.45
/** First volleys that tint safe and exposed tiles, to teach the rule without a tutorial. */
export const HINT_VOLLEYS = 3
/** 3·2·1 before the first pause. */
export const COUNT_IN = 3.2

/** Walls: 0 top, 1 right, 2 bottom, 3 left. */
export const SIDES = [0, 1, 2, 3]

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

// ── Yard geometry ─────────────────────────────────────────────────────────

/** Tiles per side: a 4×4 yard for one or two dodgers, 5×5 for three or four. */
export function yardSize(playerCount) {
  return playerCount > 2 ? 5 : 4
}

/** Boulders on the field at once. */
export function boulderCount(n) {
  return n === 4 ? 3 : 5
}

/** The tile k steps into lane i from `side` as [col, row]. */
export function cellAt(n, side, i, k) {
  if (side === 0) return [i, k]
  if (side === 2) return [i, n - 1 - k]
  if (side === 3) return [k, i]
  return [n - 1 - k, i]
}

/** [lane, depth] of tile (c, r) as seen from `side`. */
export function laneOf(n, side, c, r) {
  if (side === 0) return [c, r]
  if (side === 2) return [c, n - 1 - r]
  if (side === 3) return [r, c]
  return [r, n - 1 - c]
}

/**
 * Tiles a pole travels before the first boulder stops it (n = nothing in the
 * way). `blocked(c, r)` says whether a tile holds a boulder.
 */
export function laneLen(n, blocked, side, i) {
  for (let k = 0; k < n; k++) {
    const [c, r] = cellAt(n, side, i, k)
    if (blocked(c, r)) return k
  }
  return n
}

/** Free tiles that no pole from any of `sides` can reach: the ones behind a rock. */
export function safeCells(n, blocked, sides) {
  /** @type {[number, number][]} */
  const out = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (blocked(c, r)) continue
      const ok = sides.every((s) => {
        const [i, k] = laneOf(n, s, c, r)
        return k > laneLen(n, blocked, s, i)
      })
      if (ok) out.push([c, r])
    }
  }
  return out
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * How well `sides` leave the yard covered: `stuck` free tiles that are exposed
 * and cannot walk to cover at all (a pocket walled off by rocks), and `worst`,
 * the longest walk in tiles from any other tile to its nearest safe tile.
 * @param {number} n @param {(c: number, r: number) => boolean} blocked @param {number[]} sides
 */
export function coverReport(n, blocked, sides) {
  /** @type {Map<number, number>} */
  const dist = new Map()
  /** @type {[number, number][]} */
  const queue = []
  for (const [c, r] of safeCells(n, blocked, sides)) { dist.set(r * n + c, 0); queue.push([c, r]) }
  for (let head = 0; head < queue.length; head++) {
    const [c, r] = queue[head]
    const d = /** @type {number} */ (dist.get(r * n + c))
    for (const [dc, dr] of NEIGHBOURS) {
      const c2 = c + dc
      const r2 = r + dr
      if (c2 < 0 || r2 < 0 || c2 >= n || r2 >= n || blocked(c2, r2) || dist.has(r2 * n + c2)) continue
      dist.set(r2 * n + c2, d + 1)
      queue.push([c2, r2])
    }
  }
  let worst = 0
  let stuck = 0
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (blocked(c, r)) continue
      if (dist.has(r * n + c)) worst = Math.max(worst, /** @type {number} */ (dist.get(r * n + c)))
      else stuck++
    }
  }
  return { worst, stuck, safe: queue.length }
}

/**
 * The longest walk, in tiles, from any free tile to its nearest safe tile for
 * `sides` (Infinity when some tile cannot reach cover at all).
 */
export function worstWalk(n, blocked, sides) {
  const { worst, stuck } = coverReport(n, blocked, sides)
  return stuck > 0 ? Infinity : worst
}

/**
 * The part of a lane a pole fills when it has travelled `ext` (0–1) of its run,
 * as [x0, y0, x1, y1] in tile units. Poles stop 0.04 short of their boulder.
 */
export function laneRect(n, lane, ext) {
  const e = Math.max(0, lane.len * ext - 0.04)
  const a = lane.i + 0.5 - POLE_W / 2
  const b = lane.i + 0.5 + POLE_W / 2
  if (lane.side === 0) return [a, 0, b, e]
  if (lane.side === 2) return [a, n - e, b, n]
  if (lane.side === 3) return [0, a, e, b]
  return [n - e, a, n, b]
}

/** Where a pole's tip is, in tile units, at `ext` of its run. */
export function tipPoint(n, lane, ext) {
  const e = lane.len * ext
  const m = lane.i + 0.5
  if (lane.side === 0) return [m, e]
  if (lane.side === 2) return [m, n - e]
  if (lane.side === 3) return [e, m]
  return [n - e, m]
}

// ── Pace ──────────────────────────────────────────────────────────────────

/** The warning before volley k: it shrinks every volley, then stays short. */
export function warnFor(k) {
  if (k >= SUDDEN_FROM) return WARN_SUDDEN
  return Math.max(WARN_FLOOR, WARN_START - WARN_STEP * k)
}

/** The pause before volley k's warning. */
export function gapFor(k) {
  return Math.max(GAP_FLOOR, GAP_START - GAP_STEP * k)
}

// ── The timeline ──────────────────────────────────────────────────────────

/**
 * @typedef {{ id: number, c: number, r: number, hp: number, max: number, shape: number, landAt: number }} Stone
 * @typedef {{ side: number, i: number, len: number, stoneId: number | null }} Lane
 * @typedef {{
 *   k: number, idleAt: number, warnAt: number, fireAt: number, impactAt: number, retractAt: number, backEnd: number,
 *   warn: number, sides: number[], lanes: Lane[], stones: Stone[], hpAfter: Record<number, number>,
 *   breaks: number[], lands: Stone[], after: Stone[], coin: { c: number, r: number, at: number } | null,
 * }} Volley
 * @typedef {'idle' | 'warn' | 'out' | 'hold' | 'back'} Phase
 */

/**
 * The garden's script for one round. `volley(k)` is built lazily and strictly
 * in order, so asking for volley 9 first and volley 3 later gives the same
 * answers as asking in order.
 *
 * Options change what the script holds, not how fast it runs: with `crumble`
 * off boulders never break; with `coins` on a coin tile is picked every pause
 * (from its own seed stream, so coins never reshuffle the volleys).
 *
 * @param {{ seed: number, n: number, crumble?: boolean, coins?: boolean }} p
 */
export function createTimeline({ seed, n, crumble = true, coins = false }) {
  const rng = mulberry32(seed)
  let nextId = 1
  /** @param {number} c @param {number} r @param {number} hp @param {number} landAt @returns {Stone} */
  const mkStone = (c, r, hp, landAt) => ({ id: nextId++, c, r, hp, max: hp, shape: Math.floor(rng() * 1e6), landAt })
  const isInner = (c, r) => c > 0 && r > 0 && c < n - 1 && r < n - 1

  /** @type {Stone[]} */
  const stones0 = []
  const want = boulderCount(n)
  for (let guard = 0; stones0.length < want && guard < 200; guard++) {
    const c = Math.floor(rng() * n)
    const r = Math.floor(rng() * n)
    if (stones0.some((s) => s.c === c && s.r === r)) continue
    // One boulder is kept off the edge, so every wall leaves some cover.
    if (stones0.length === 0 && !isInner(c, r)) continue
    // The first three get 2, 3, 4 blocks so they do not all break together.
    stones0.push(mkStone(c, r, crumble ? 2 + (stones0.length % 3) : NO_BREAK, 0))
  }

  /** @type {Volley[]} */
  const volleys = []

  /** @param {Stone[]} stones */
  const blockedBy = (stones) => (c, r) => stones.some((s) => s.c === c && s.r === r)

  /**
   * Walls for volley k: only walls whose worst walk to cover fits the warning
   * are fair game. A wall that strands a tile in a rock-walled pocket is only
   * used when every wall does.
   */
  function chooseSides(k, stones, warn) {
    const blocked = blockedBy(stones)
    const sudden = k >= SUDDEN_FROM
    const budget = Math.max(1, Math.floor(SPEED * warn * REACH))
    /** @param {number[][]} options @param {number} [maxStuck] @returns {{ o: number[], stuck: number } | null} */
    const pick = (options, maxStuck = Infinity) => {
      const scored = options
        .map((o) => ({ o, ...coverReport(n, blocked, o) }))
        .filter((x) => x.safe > 0 && x.stuck <= maxStuck)
      if (!scored.length) return null
      const fewest = Math.min(...scored.map((x) => x.stuck))
      const level = scored.filter((x) => x.stuck === fewest)
      const best = Math.min(...level.map((x) => x.worst))
      const ok = sudden ? level : level.filter((x) => x.worst <= Math.max(budget, best))
      const chosen = ok[Math.floor(rng() * ok.length)]
      return { o: chosen.o, stuck: chosen.stuck }
    }
    const one = pick(SIDES.map((s) => [s]))
    let sides = one ? one.o : [Math.floor(rng() * 4)]
    const wantTwo = sudden || k >= DOUBLE_ALWAYS || (k >= DOUBLE_FROM && rng() < 0.25 + 0.06 * (k - DOUBLE_FROM))
    if (wantTwo) {
      const first = sides[0]
      const two = pick(SIDES.filter((s) => s !== first).map((s) => [first, s]), one ? one.stuck : Infinity)
      if (two) sides = two.o
    }
    return sides
  }

  /** @param {number} k @returns {Volley} */
  function build(k) {
    const prev = k === 0 ? null : volleys[k - 1]
    /** @type {Stone[]} */
    const stones = prev ? prev.after : stones0
    const idleAt = prev ? prev.backEnd : 0
    const warnAt = idleAt + gapFor(k)
    const warn = warnFor(k)
    const fireAt = warnAt + warn
    const impactAt = fireAt + OUT
    const retractAt = impactAt + HOLD
    const backEnd = retractAt + BACK
    const sides = chooseSides(k, stones, warn)

    // Poles run through whatever has landed by the time they fire.
    const solid = stones.filter((s) => s.landAt <= fireAt)
    const solidAt = blockedBy(solid)
    /** @type {Lane[]} */
    const lanes = []
    for (const side of sides) {
      for (let i = 0; i < n; i++) {
        const len = laneLen(n, solidAt, side, i)
        const stone = len < n ? solid.find((s) => { const [c, r] = cellAt(n, side, i, len); return s.c === c && s.r === r }) : null
        lanes.push({ side, i, len, stoneId: stone ? stone.id : null })
      }
    }

    // A boulder that stops one or more poles takes one hit for the volley.
    /** @type {Record<number, number>} */
    const hpAfter = {}
    for (const s of stones) hpAfter[s.id] = s.hp
    const struck = new Set(lanes.map((l) => l.stoneId).filter((id) => id != null))
    if (crumble) for (const id of struck) hpAfter[/** @type {number} */ (id)] -= 1

    const breaks = stones.filter((s) => hpAfter[s.id] <= 0).map((s) => s.id)
    const survivors = stones.filter((s) => hpAfter[s.id] > 0).map((s) => ({ ...s, hp: hpAfter[s.id] }))

    // Each broken boulder is replaced somewhere new, announced by a ring.
    /** @type {Stone[]} */
    const lands = []
    for (const id of breaks) {
      const gone = /** @type {Stone} */ (stones.find((s) => s.id === id))
      const taken = blockedBy([...survivors, ...lands])
      /** @type {[number, number][]} */
      const free = []
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!taken(c, r) && !(c === gone.c && r === gone.r)) free.push([c, r])
      const hasInner = [...survivors, ...lands].some((s) => isInner(s.c, s.r))
      const inner = free.filter(([c, r]) => isInner(c, r))
      const from = !hasInner && inner.length ? inner : free
      if (!from.length) continue
      const [c, r] = from[Math.floor(rng() * from.length)]
      lands.push(mkStone(c, r, STONE_HP, retractAt + RISE))
    }
    const after = [...survivors, ...lands]

    let coin = null
    if (coins) {
      const cr = mulberry32((seed * 31 + k * 977 + 0xc01) | 0)
      const taken = blockedBy(stones)
      /** @type {[number, number][]} */
      const free = []
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!taken(c, r)) free.push([c, r])
      if (free.length) {
        const [c, r] = free[Math.floor(cr() * free.length)]
        coin = { c, r, at: Math.max(idleAt, warnAt - COIN_LEAD) }
      }
    }

    return { k, idleAt, warnAt, fireAt, impactAt, retractAt, backEnd, warn, sides, lanes, stones, hpAfter, breaks, lands, after, coin }
  }

  /** @param {number} k @returns {Volley} */
  function volley(k) {
    const index = Math.max(0, Math.floor(k))
    while (volleys.length <= index) volleys.push(build(volleys.length))
    return volleys[index]
  }

  let cursor = 0
  /** The volley whose interval [idleAt, backEnd) holds t. @param {number} t */
  function volleyAt(t) {
    const time = Math.max(0, t)
    if (volley(cursor).idleAt > time) cursor = 0
    while (volley(cursor).backEnd <= time) cursor++
    return volley(cursor)
  }

  /**
   * The garden at time t: which phase, how far the poles are out, which
   * boulders stand (and which are still only a ring), and the coin.
   * @param {number} t
   */
  function view(t) {
    const time = Math.max(0, t)
    const v = volleyAt(time)
    /** @type {Phase} */
    let phase = 'idle'
    let left = v.warnAt - time
    let len = v.warnAt - v.idleAt
    if (time >= v.retractAt) { phase = 'back'; left = v.backEnd - time; len = BACK }
    else if (time >= v.impactAt) { phase = 'hold'; left = v.retractAt - time; len = HOLD }
    else if (time >= v.fireAt) { phase = 'out'; left = v.impactAt - time; len = OUT }
    else if (time >= v.warnAt) { phase = 'warn'; left = v.fireAt - time; len = v.warn }

    let ext = 0
    if (phase === 'out') { const u = Math.max(0, left / OUT); ext = 1 - u * u }
    else if (phase === 'hold') ext = 1
    else if (phase === 'back') { const u = Math.max(0, left / BACK); ext = u * u * (3 - 2 * u) }

    const afterImpact = time >= v.impactAt
    const afterRetract = time >= v.retractAt
    /** @type {Stone[]} */
    let list = v.stones
    if (afterRetract) list = [...v.stones.filter((s) => !v.breaks.includes(s.id)), ...v.lands]
    const stones = list.map((s) => ({ ...s, hp: afterImpact && s.id in v.hpAfter ? v.hpAfter[s.id] : s.hp }))
    const solid = stones.filter((s) => s.landAt <= time)
    const pending = stones.filter((s) => s.landAt > time)
    const showLanes = phase === 'out' || phase === 'hold' || phase === 'back'
    const coin = v.coin && time >= v.coin.at && time < v.fireAt ? { c: v.coin.c, r: v.coin.r } : null
    return {
      k: v.k, phase, left, len, ext, warn: v.warn, sides: v.sides,
      lanes: showLanes ? v.lanes : [], allLanes: v.lanes,
      solid, pending, stones, coin, volley: v,
      sinceImpact: afterImpact ? time - v.impactAt : -1,
    }
  }

  return { n, seed, crumble, coins, initial: stones0, volley, volleyAt, view }
}

/** @typedef {ReturnType<typeof createTimeline>} Timeline */

// ── Online race: stats, ranking, ghosts ───────────────────────────────────
//
// Every phone simulates its own dodger over the shared timeline and reports
// only what changed. `reach` is how many volleys a dodger has lived through:
// the volley they fell in, or (while alive) how many have ended. Two racers
// that fall in the same volley tie. A racer who is alive but frozen (a dropped
// phone) stops gaining reach, so they cannot win by standing still.
//
// Stats node (games/{id}/round/stats/{roundId}/{uid}):
//   { hearts, v, out?, hits, coins, x, y }
//   v    volleys survived so far; out  the volley they fell in (absent while alive)
//   x, y position in hundredths of a tile, for the ghost others see

/** @param {unknown} raw */
export function normalizeBamboozleStats(raw) {
  const src = /** @type {Record<string, any>} */ (isObj(raw) ? raw : {})
  const int = (v, lo, hi, fallback) => {
    const x = Number(v)
    return Number.isFinite(x) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, Math.floor(x))) : fallback
  }
  const out = src.out == null ? null : int(src.out, 0, 9999, null)
  const x = Number(src.x)
  const y = Number(src.y)
  return {
    hearts: int(src.hearts, 0, MAX_HEARTS, HEARTS),
    v: int(src.v, 0, 9999, 0),
    out,
    hits: int(src.hits, 0, 9999, 0),
    coins: int(src.coins, 0, 9999, 0),
    x: src.x != null && Number.isFinite(x) ? Math.min(600, Math.max(-100, Math.round(x))) : null,
    y: src.y != null && Number.isFinite(y) ? Math.min(600, Math.max(-100, Math.round(y))) : null,
  }
}

/** Has this racer lost their last heart? */
export function isOutStats(raw) {
  return isObj(raw) && raw.out != null && normalizeBamboozleStats(raw).out !== null
}

/** Volleys lived through. */
export function reachOf(raw) {
  const s = normalizeBamboozleStats(raw)
  return s.out != null ? s.out : s.v
}

/**
 * Ranking entry: lived through the most volleys; at equal reach a racer who is
 * still standing beats one who fell; then hearts. No stats at all = DNF.
 */
export function bamboozleRaceEntry(stats) {
  if (!isObj(stats)) return { sortKey: null, score: null }
  const s = normalizeBamboozleStats(stats)
  const reach = s.out != null ? s.out : s.v
  return { sortKey: [-reach, s.out != null ? 1 : 0, -s.hearts], score: reach }
}

/**
 * The room-level end: once at most one racer is still standing the order can no
 * longer change. `statsById` has an entry for each racer who has reported;
 * a racer who has not reported yet counts as standing.
 * @param {Record<string, unknown>} statsById @param {string[]} racers
 */
export function bamboozleDecided(statsById, racers) {
  const list = racers || []
  if (list.length < 2) return false
  const standing = list.filter((id) => !isOutStats(statsById?.[id]))
  return standing.length <= 1
}

/** A row for RaceResults. */
export function bamboozleRow(stats) {
  if (!isObj(stats)) return { primary: '—', secondary: 'NOT IN YET', progress: null, status: 'idle', detail: '' }
  const s = normalizeBamboozleStats(stats)
  const out = s.out != null
  return {
    primary: out ? 'OUT' : `${s.hearts} HEART${s.hearts === 1 ? '' : 'S'}`,
    secondary: `${out ? s.out : s.v} VOLLEY${(out ? s.out : s.v) === 1 ? '' : 'S'} · ${s.hits} HIT${s.hits === 1 ? '' : 'S'}`,
    progress: null,
    status: out ? 'done' : 'racing',
    detail: `${out ? s.out : s.v}`,
  }
}

/**
 * The other racers as ghosts: where they stand in their own copy of the
 * garden, from the last position they reported.
 * @param {Record<string, unknown>} statsById @param {string} mySeat
 */
export function ghostsFrom(statsById, mySeat) {
  /** @type {{ id: string, x: number, y: number, hearts: number, out: boolean }[]} */
  const ghosts = []
  for (const [id, raw] of Object.entries(statsById || {})) {
    if (id === mySeat) continue
    const s = normalizeBamboozleStats(raw)
    if (s.x == null || s.y == null) continue
    ghosts.push({ id, x: s.x / 100, y: s.y / 100, hearts: s.hearts, out: s.out != null })
  }
  return ghosts
}

/** Hundredths of a tile, for the stats write. @param {number} v */
export function packCoord(v) {
  return Math.round(v * 100)
}
