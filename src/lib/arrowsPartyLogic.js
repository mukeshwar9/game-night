// Arrows Party — pure logic for the shared-board race (2–4 players). No DOM,
// no Firebase, no React.
//
// Every racer clears an identical puzzle at the same time. The puzzle is one
// seeded zone board (`partyLevel`); the room draws one copy of it per racer on
// a shared picture, each copy turned or mirrored so the picture reads as a
// face-off (`transformLevel`). A zone is walled off by void cells (a shaped
// board), so an arrow leaves at its own zone's border and no rival can ever
// block it: each racer's puzzle depends on nothing but the seed.
//
// The picture is drawn from the viewer's seat: your zone sits at the bottom,
// the others above (and beside, with four). `buildPartyPicture` lists the
// arrows seat by seat, so an arrow's index is stable whichever way the picture
// is turned — seat s owns indexes [s * perZone, (s + 1) * perZone), and a
// racer's cleared set is `round/stats/{round}/{uid}/g/{index within zone}`.
import {
  ARROWS_DIRS, ARROWS_LIVES, ARROWS_TIER_SPECS, generateArrowsLevel, normalizeGone, countGone,
  arrowRoute, seededRng, solveArrows, applyArrowTap,
} from './arrowsLogic'

export const PARTY_TIERS = ['easy', 'medium', 'hard']
export const PARTY_ROUND_CHOICES = [3, 5, 7]
export const PARTY_MIN_PLAYERS = 2
export const PARTY_MAX_PLAYERS = 4
export const PARTY_LIVES = ARROWS_LIVES
/** 3–4 racers: a blocked tap freezes the board this long instead of costing a life. */
export const PARTY_FREEZE_MS = 2000
/** The round clock per tier (ms); a racer still clearing at the end is a DNF. */
export const PARTY_ROUND_MS = { easy: 90_000, medium: 120_000, hard: 150_000 }
/** Gap between zones, in cells (void: an arrow reaching it has left). */
const GUTTER = 1

// ── transformLevel ──────────────────────────────────────────────────────

/** Name → cell map on a w × h board. */
const CELL_MAPS = {
  id: (x, y) => [x, y],
  flipX: (x, y, w) => [w - 1 - x, y],
  flipY: (x, y, w, h) => [x, h - 1 - y],
  rot180: (x, y, w, h) => [w - 1 - x, h - 1 - y],
}
export const PARTY_TRANSFORMS = Object.keys(CELL_MAPS)

const dirIndex = (dx, dy) => ARROWS_DIRS.findIndex(([u, v]) => u === dx && v === dy)

/**
 * A copy of a race-tier zone board turned or mirrored: `id`, `flipX` (left ↔
 * right), `flipY` (top ↔ bottom) or `rot180`. Cells move with the transform,
 * each heading moves with its linear part, and a mirror swaps a hook's turn
 * (clockwise ↔ counter-clockwise); a turn by 180° keeps it. Arrows keep their
 * order, so index i of the copy is index i of the original: a clear set made on
 * one copy is valid on every other. The copy is exactly as hard: same depth, same
 * number of arrows free at the start (arrowsPartyLogic.test.js proves it on
 * generated boards).
 *
 * Only plain boards are supported: fixed pieces, shaped boards, double arrows and
 * twist arrows (endless-only) are refused rather than mapped wrongly.
 * @param {any} level
 * @param {'id' | 'flipX' | 'flipY' | 'rot180'} t
 */
export function transformLevel(level, t) {
  const f = CELL_MAPS[t]
  if (!f) throw new Error(`transformLevel: unknown transform "${t}"`)
  if (level.mask || level.mirrors || level.portals || level.tunnels || level.crates) {
    throw new Error('transformLevel: only plain race boards can be transformed')
  }
  const { cols, rows } = level
  const [ox, oy] = f(0, 0, cols, rows)
  const [ux, uy] = f(1, 1, cols, rows)
  // The linear part: (sx, sy) are the signs the axes were scaled by.
  const sx = ux - ox
  const sy = uy - oy
  const mirrored = sx * sy < 0
  const arrows = level.arrows.map((a) => {
    if (a.double || a.twist) throw new Error('transformLevel: double and twist arrows are not supported')
    const [dx, dy] = ARROWS_DIRS[a.dir]
    const out = {
      ...a,
      cells: a.cells.map(([x, y]) => f(x, y, cols, rows)),
      dir: dirIndex(dx * sx, dy * sy),
    }
    if (a.turn) out.turn = mirrored ? -a.turn : a.turn
    return out
  })
  return { ...level, arrows }
}

// ── zone boards ─────────────────────────────────────────────────────────

// Zone size (cols × rows) per player count and tier. Zones are bigger than the
// phone is wide: the shared picture opens zoomed on your zone and pans/pinches
// (ArrowsBoard's camera). Cells stay at the race tiers' size.
export const PARTY_ZONE_SIZES = {
  2: { easy: [7, 6], medium: [8, 7], hard: [10, 8] },
  3: { easy: [7, 4], medium: [8, 5], hard: [10, 6] },
  4: { easy: [4, 5], medium: [5, 6], hard: [6, 7] },
}

export const PARTY_LAYOUT_INFO = {
  2: { id: 'faceoff', label: 'FACE-OFF', blurb: 'TWO ZONES, FACE TO FACE' },
  3: { id: 'lanes', label: 'LANES', blurb: 'THREE LANES, YOURS AT THE BOTTOM' },
  4: { id: 'quads', label: 'TALL QUADS', blurb: 'FOUR QUADRANTS, YOURS BOTTOM-LEFT' },
}

export const partyTier = (tier) => (PARTY_TIERS.includes(tier) ? tier : 'medium')
export const clampPartyPlayers = (n) => Math.min(PARTY_MAX_PLAYERS, Math.max(PARTY_MIN_PLAYERS, Math.floor(Number(n)) || PARTY_MIN_PLAYERS))

/** [cols, rows] of one zone. */
export function partyZoneSize(n, tier) {
  return PARTY_ZONE_SIZES[clampPartyPlayers(n)][partyTier(tier)]
}

/** The generator spec of one zone: the race tier's mix at this zone's size. */
export function partyZoneSpec(n, tier) {
  const name = partyTier(tier)
  const [cols, rows] = partyZoneSize(n, name)
  const base = ARROWS_TIER_SPECS[name]
  return { ...base, cols, rows, maxLen: Math.min(base.maxLen, Math.max(3, Math.max(cols, rows) - 1)), name }
}

/** The one puzzle every racer solves: the seeded zone board. */
export function partyLevel(seed, n, tier) {
  return generateArrowsLevel(seed, partyZoneSpec(n, tier))
}

// ── the shared picture ──────────────────────────────────────────────────

/**
 * Where each seat's zone sits in the picture seen by seat `viewer` (-1 or null
 * for a spectator, who sees seat 0's frame). Returns `{ cols, rows, zones }`,
 * `zones[seat] = { seat, x, y, w, h, t }`: top-left cell and the transform from
 * the base board to that copy.
 *
 * 2 racers FACE-OFF: you at the bottom, the rival above, turned 180°.
 * 3 racers LANES: three bands, you at the bottom, the others above in seat order.
 * 4 racers TALL QUADS: a 2 × 2 cross; you bottom-left, the next seat to your
 * right (mirrored), the one after diagonal (turned 180°), the last above you
 * (mirrored).
 * @param {number} n racers (2–4)
 * @param {number} w zone cols
 * @param {number} h zone rows
 * @param {number | null} [viewer]
 */
export function partyViewZones(n, w, h, viewer = null) {
  const count = clampPartyPlayers(n)
  const v = viewer != null && viewer >= 0 && viewer < count ? viewer : 0
  const at = (k) => (v + k) % count
  const zones = []
  const put = (seat, x, y, t) => { zones[seat] = { seat, x, y, w, h, t } }
  if (count === 2) {
    put(at(0), 0, h + GUTTER, 'id')
    put(at(1), 0, 0, 'rot180')
    return { cols: w, rows: 2 * h + GUTTER, zones }
  }
  if (count === 3) {
    put(at(0), 0, 2 * (h + GUTTER), 'id')
    put(at(1), 0, h + GUTTER, 'id')
    put(at(2), 0, 0, 'id')
    return { cols: w, rows: 3 * h + 2 * GUTTER, zones }
  }
  put(at(0), 0, h + GUTTER, 'id')
  put(at(1), w + GUTTER, h + GUTTER, 'flipX')
  put(at(2), w + GUTTER, 0, 'rot180')
  put(at(3), 0, 0, 'flipY')
  return { cols: 2 * w + GUTTER, rows: 2 * h + GUTTER, zones }
}

/**
 * The whole picture as one shaped Arrows level for the viewer's frame, plus the
 * zone rectangles. Gutters are void, so each zone is its own sealed puzzle.
 * Arrows are listed seat by seat (`first`..`first + per - 1`), identical in
 * every viewer's frame.
 * @param {{ base: any, n: number, viewer?: number | null }} p
 */
export function buildPartyPicture({ base, n, viewer = null, crates = null }) {
  const count = clampPartyPlayers(n)
  const { cols: w, rows: h } = base
  const { cols, rows, zones } = partyViewZones(count, w, h, viewer)
  const per = base.arrows.length
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'))
  const arrows = []
  zones.forEach((z) => {
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) grid[z.y + y][z.x + x] = '#'
    const moved = transformLevel(base, z.t)
    moved.arrows.forEach((a) => arrows.push({ ...a, cells: a.cells.map(([x, y]) => [x + z.x, y + z.y]) }))
  })
  const level = { seed: base.seed, tier: base.tier, cols, rows, arrows, mask: grid.map((r) => r.join('')) }
  const placed = placeCrates(zones, crates, per, w, h)
  if (placed.length) level.crates = placed
  return {
    level,
    per,
    count,
    zones: zones.map((z) => ({ ...z, first: z.seat * per, count: per })),
  }
}

// Crates a rival dropped, in each victim's base frame (`crates[seat] = [{ x, y, k }]`),
// moved into that seat's zone as drawn in this view. A crate counts only the clears
// of its own zone (`from` / `to`, see crateCleared), so a rival's clears never open it.
function placeCrates(zones, crates, per, w, h) {
  const out = []
  zones.forEach((z) => {
    for (const c of crates?.[z.seat] ?? []) {
      const [x, y] = CELL_MAPS[z.t](c.x, c.y, w, h)
      out.push({ x: x + z.x, y: y + z.y, k: c.k, from: z.seat * per, to: (z.seat + 1) * per })
    }
  })
  return out
}

/** The picture again with new crates, sharing the arrows and mask so a board need not rebuild. */
export function withPartyCrates(picture, crates) {
  const { level } = picture
  const { w, h } = { w: picture.zones[0].w, h: picture.zones[0].h }
  const placed = placeCrates(picture.zones, crates, picture.per, w, h)
  const next = { ...level }
  if (placed.length) next.crates = placed
  else delete next.crates
  return { ...picture, level: next }
}

/** Seat that owns arrow `index` of a picture (arrows are listed seat by seat). */
export const seatOfArrow = (index, per) => (per > 0 ? Math.floor(index / per) : -1)

/** One flat gone array for the whole picture from each seat's own cleared set. */
export function pictureGone(perSeat, per) {
  const out = []
  perSeat.forEach((g) => {
    for (let i = 0; i < per; i += 1) out.push(!!g?.[i])
  })
  return out
}

// ── sabotage: crate drops ───────────────────────────────────────────────
//
// With the host's SABOTAGE switch on, a racer who clears SABOTAGE_STREAK arrows in
// a row without a blocked tap sends a crate to the leader: the racer furthest ahead
// of them. The drop is one write-once record, `round/drops/{victim}/{n}` =
// `"{victim's cleared count}|{round id}|{sender}"`; every phone turns it into the
// same crate (`placeCrate` is a pure function of the puzzle, the victim's seat, the
// drop number and the drops before it). A crate blocks the routes through its cell
// until its zone has cleared `at + SABOTAGE_CLEARS` arrows, then opens for good.
// It is placed where it can never trap a racer: see placeCrate.
export const SABOTAGE_STREAK = 3
export const SABOTAGE_CLEARS = 2
export const PARTY_MAX_DROPS = 3

export const dropValue = (at, roundId, from) => `${Math.max(0, Math.floor(at))}|${roundId}|${from}`

/** A drop record → { at, roundId, from }, or null for anything malformed. */
export function parseDrop(value) {
  if (typeof value !== 'string') return null
  const m = /^(\d{1,3})\|([^|]{1,64})\|(.{1,128})$/.exec(value)
  return m ? { at: Number(m[1]), roundId: m[2], from: m[3] } : null
}

/**
 * The drops under `round/drops` for this round, per victim, in the order they were
 * written: `{ [victimUid]: [{ n, at, from }] }`. Records for another round, from a
 * non-racer, from the victim themself or past PARTY_MAX_DROPS are ignored.
 */
export function normalizeDrops(raw, { roundId, racers }) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  // Bots neither send nor receive crates.
  const allowed = new Set(racers.filter((id) => !isBotId(id)))
  for (const [victim, list] of Object.entries(raw)) {
    if (!allowed.has(victim) || !list || typeof list !== 'object') continue
    const rows = []
    for (const [key, value] of Object.entries(list)) {
      const n = Number(key)
      const d = parseDrop(value)
      if (!Number.isInteger(n) || n < 0 || n >= PARTY_MAX_DROPS || !d) continue
      if (d.roundId !== roundId || d.from === victim || !allowed.has(d.from)) continue
      rows.push({ n, at: d.at, from: d.from })
    }
    rows.sort((a, b) => a.n - b.n)
    if (rows.length) out[victim] = rows
  }
  return out
}

/**
 * Who a crate from `from` lands on: the racer furthest ahead who is still racing,
 * and only when they are strictly ahead of the sender (the leader is the target, a
 * trailing racer the one who sends). `standings` = [{ uid, cleared, done }]; the
 * drop slots already used come from `used` ({ uid: count }). Null when nobody qualifies.
 */
export function dropTarget({ standings, from, used = {} }) {
  const me = standings.find((r) => r.uid === from)
  if (!me || me.done || isBotId(from)) return null
  let best = null
  for (const r of standings) {
    if (r.uid === from || r.done || isBotId(r.uid) || r.cleared <= me.cleared) continue
    if ((used[r.uid] ?? 0) >= PARTY_MAX_DROPS) continue
    if (!best || r.cleared > best.cleared) best = r
  }
  return best ? best.uid : null
}

/**
 * Where drop number `n` (landing when the victim had cleared `at`) puts its crate,
 * in the base board's frame: `{ x, y, k }` or null when no safe cell exists.
 *
 * A crate sits on an empty cell some arrow's route crosses. It is safe when the
 * arrows it blocks (X) are ones nothing else waits on, i.e. no other arrow's route
 * passes over a cell of an X arrow, so the rest of the board can always be cleared
 * on its own; and its count `at + SABOTAGE_CLEARS` is within what the rest can supply
 * (`per - |X|`). Then a crate can delay a racer but never trap them, whatever order
 * they clear in. `solveArrows` re-checks the board with every crate in place.
 * The cell is a seeded pick among the safe ones, the same on every phone.
 * @param {{ base: any, seed: number, seat: number, n: number, at: number, taken?: Array<{x:number,y:number,k:number}> }} p
 */
export function placeCrate({ base, seed, seat, n, at, taken = [] }) {
  const { cols } = base
  const per = base.arrows.length
  const occupied = new Set()
  base.arrows.forEach((a) => a.cells.forEach(([x, y]) => occupied.add(y * cols + x)))
  const routes = base.arrows.map((a) => new Set(arrowRoute(base, a).cells))
  const crossing = (cell) => base.arrows.map((_, i) => i).filter((i) => routes[i].has(cell))
  const used = new Set(taken.map((c) => c.y * cols + c.x))
  const blockedBy = new Set()
  for (const c of taken) crossing(c.y * cols + c.x).forEach((i) => blockedBy.add(i))

  const safe = (cell) => {
    const hit = crossing(cell)
    if (!hit.length) return null
    const x = new Set([...blockedBy, ...hit])
    const xCells = new Set()
    x.forEach((i) => base.arrows[i].cells.forEach(([cx, cy]) => xCells.add(cy * cols + cx)))
    for (let i = 0; i < per; i += 1) {
      if (x.has(i)) continue
      for (const c of routes[i]) if (xCells.has(c)) return null
    }
    const k = at + SABOTAGE_CLEARS
    return k <= per - x.size ? { k } : null
  }

  const cells = []
  for (let c = 0; c < cols * base.rows; c += 1) if (!occupied.has(c) && !used.has(c)) cells.push(c)
  const rng = seededRng((Number(seed) ^ Math.imul(seat + 1, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca6b)) >>> 0)
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[cells[i], cells[j]] = [cells[j], cells[i]]
  }
  for (const cell of cells) {
    const ok = safe(cell)
    if (!ok) continue
    const crate = { x: cell % cols, y: Math.floor(cell / cols), k: ok.k }
    const trial = { ...base, crates: [...taken, crate] }
    if (solveArrows(trial).solvable) return crate
  }
  return null
}

/** Every crate a victim's drops have placed, in order (a drop with no safe cell places none). */
export function partyCrates({ base, seed, seat, drops }) {
  const crates = []
  for (const d of drops ?? []) {
    const crate = placeCrate({ base, seed, seat, n: d.n, at: d.at, taken: crates })
    if (crate) crates.push(crate)
  }
  return crates
}

// ── AI racers ───────────────────────────────────────────────────────────
//
// The host can fill empty seats (up to PARTY_MAX_PLAYERS in all) with AI racers
// `bot1`..`bot3`. A bot is a racer like any other: it sits in `round/racers`, has
// its own zone and writes the same `round/stats/{round}/{bot}` paths. Its whole run
// is a pure function of the puzzle (`botTimeline`), so it is the same for anyone who
// computes it; the room host's phone plays the timeline out against the server clock
// (rules let only `round/botHost` write a bot's stats).
export const PARTY_MAX_BOTS = PARTY_MAX_PLAYERS - 1
/** Beat length per bot speed (ms between taps, before jitter) and its chance of tapping a blocked arrow. */
export const BOT_SPEEDS = {
  easy: { beatMs: 1700, fumble: 0.1 },
  medium: { beatMs: 1500, fumble: 0.07 },
  hard: { beatMs: 1300, fumble: 0.04 },
}
export const BOT_NAME_PREFIX = 'AI'

export const isBotId = (id) => /^bot[1-3]$/.test(String(id))
export const botName = (id) => `${BOT_NAME_PREFIX} ${String(id).slice(3)}`

/** Bot seat ids for a room: as many as asked, never past the seat limit. */
export function botIdsFor(humans, wanted) {
  const free = Math.max(0, PARTY_MAX_PLAYERS - Math.max(0, Math.floor(humans)))
  const n = Math.min(PARTY_MAX_BOTS, free, Math.max(0, Math.floor(Number(wanted)) || 0))
  return Array.from({ length: n }, (_, i) => `bot${i + 1}`)
}

/**
 * A bot's whole run on the zone board `base`, as events in time order:
 * `{ at, type: 'clear', index }`, `{ at, type: 'miss' }`, then `{ at, type: 'fin' }`
 * once the zone is clear, or `{ at, type: 'out' }` when a two-racer round takes the
 * last life. `at` is ms from the go signal. One tap per beat on its own zone, a
 * blocked arrow now and then (a life with two racers, a PARTY_FREEZE_MS freeze with
 * more), exactly like a rival hand: the old practice bot, made deterministic.
 * @param {{ base: any, seed: number, slot: number, speed: string, lives: boolean }} p
 */
export function botTimeline({ base, seed, slot, speed, lives }) {
  const spec = BOT_SPEEDS[partyTier(speed)]
  const rng = seededRng((Number(seed) ^ Math.imul(slot + 1, 0x2545f491) ^ 0x9e3779b9) >>> 0)
  const per = base.arrows.length
  let gone = Array(per).fill(false)
  let misses = 0
  let t = 0
  const events = []
  for (let guard = 0; guard < per * 40; guard += 1) {
    t += Math.round(spec.beatMs * (0.75 + rng() * 0.5))
    const open = []
    const shut = []
    for (let i = 0; i < per; i += 1) {
      if (gone[i]) continue
      const r = applyArrowTap(base, gone, PARTY_LIVES, i)
      ;(r.result === 'cleared' ? open : shut).push(i)
    }
    const fumble = shut.length > 0 && rng() < spec.fumble
    if (fumble) {
      misses += 1
      events.push({ at: t, type: 'miss' })
      if (lives && misses >= PARTY_LIVES) {
        events.push({ at: t, type: 'out' })
        return events
      }
      if (!lives) t += PARTY_FREEZE_MS
      continue
    }
    const index = open[Math.floor(rng() * open.length)]
    gone = gone.slice()
    gone[index] = true
    events.push({ at: t, type: 'clear', index })
    if (countGone(gone) >= per) {
      events.push({ at: t, type: 'fin' })
      return events
    }
  }
  return events
}

/** What a bot's stats node should hold once `elapsed` ms of its timeline have passed: an `update` patch against nothing written yet. */
export function botPatch(events, elapsed) {
  const patch = {}
  let misses = 0
  for (const e of events) {
    if (e.at > elapsed) break
    if (e.type === 'clear') patch[`g/${e.index}`] = true
    else if (e.type === 'miss') misses += 1
    else if (e.type === 'fin') patch.fin = Math.max(1, e.at)
    else if (e.type === 'out') patch.x = 1
  }
  if (misses) patch.m = misses
  return patch
}

// ── stats, ranking, config ──────────────────────────────────────────────

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)

/**
 * A racer's stats node: `g` = cleared arrows { index: true }, `m` = blocked taps,
 * `fin` = ms from the go signal to the last clear, `x` = 1 once knocked out (2
 * racers only). Whatever Firebase returned in, a fixed shape out.
 */
export function normalizePartyStats(raw, per) {
  const s = raw && typeof raw === 'object' ? raw : {}
  const gone = normalizeGone(s.g, per)
  const fin = num(s.fin)
  return {
    gone,
    cleared: countGone(gone),
    misses: Math.max(0, num(s.m) ?? 0),
    fin: fin != null && fin > 0 ? fin : null,
    out: s.x === 1 || s.x === true,
  }
}

/** Has this racer finished (cleared everything) or been knocked out? */
export function partyIsDone(raw) {
  if (!raw || typeof raw !== 'object') return false
  return (num(raw.fin) ?? 0) > 0 || raw.x === 1 || raw.x === true
}

/**
 * RaceShell `entry`: finish time then fewer blocked taps ranks the round (smaller
 * is better); a racer who never finished or was knocked out is a DNF.
 */
export function partyEntry(raw) {
  const fin = num(raw?.fin)
  const out = raw?.x === 1 || raw?.x === true
  if (out || fin == null || fin <= 0) return { sortKey: null, score: null }
  return { sortKey: [fin, Math.max(0, num(raw?.m) ?? 0)], score: fin }
}

/** Live standing key: more cleared first, then fewer blocked taps; a finisher by time. */
export function partyLiveKey(raw, per) {
  const s = normalizePartyStats(raw, per)
  if (s.out) return null
  if (s.fin != null) return [-per - 1, s.fin, s.misses]
  return [-s.cleared, s.misses]
}

/** Blocked taps become lives in a 2-racer round, and a freeze with 3–4. */
export const partyUsesLives = (n) => n <= 2
export const partyLivesLeft = (misses) => Math.max(0, PARTY_LIVES - misses)

/** "1:07.3"-style finish time. */
export function formatPartyTime(ms) {
  if (!(ms > 0)) return '—'
  const total = Math.round(ms / 100) / 10
  const m = Math.floor(total / 60)
  const s = total - m * 60
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}s`
}

export const DEFAULT_PARTY_CONFIG = { version: 1, tier: 'medium', rounds: 3, sabotage: false, bots: 0, botSpeed: null }

/** The room's `arrowsPartyConfig`, with every field coerced into range. */
export function normalizePartyConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    version: 1,
    tier: partyTier(r.tier),
    rounds: PARTY_ROUND_CHOICES.includes(Number(r.rounds)) ? Number(r.rounds) : DEFAULT_PARTY_CONFIG.rounds,
    sabotage: r.sabotage === true,
    bots: Math.min(PARTY_MAX_BOTS, Math.max(0, Math.floor(Number(r.bots)) || 0)),
    // null = the bots race at the room's difficulty
    botSpeed: PARTY_TIERS.includes(r.botSpeed) ? r.botSpeed : null,
  }
}

export const describePartyConfig = (c) => (
  `${c.tier.toUpperCase()} · ${c.rounds}-ROUND CUP${c.sabotage ? ' · SABOTAGE' : ''}${c.bots ? ` · ${c.bots} AI` : ''}`
)
