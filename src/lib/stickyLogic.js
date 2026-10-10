// stickyLogic.js — pure STICKY FINGERS sim. No DOM, no network.
// Same contract as the other real-time sims: createState / step / computeAI-style
// bot input / getWinner, one fixed timestep per step() call.
//
// Table: TABLE_W × TABLE_H units (a phone-shaped 9:14 table), origin top-left,
// x → right, y → down. Every player owns a safe at the edge. Loot drops into the
// middle, you press the table and your arm shoots out from your safe to your
// finger, and whatever the glove closes on follows it. Loot scores for whichever
// safe it enters, so a flick can be stolen and a dye pack can be planted.
//
// Input per player, every tick: { hands: [{ x, y } | null, ...] } — where each
// finger is, or null when it is lifted. Positions are absolute table units. The
// sim clamps them to the arm's reach, so a client can say whatever it likes.
//
// Rules (numbers are starting values to tune by playtest, see the report):
//   • a tug: a rival hand that lands on an item within CONTEST_WINDOW of its first
//     grab makes it a contest. Both keep holding; whoever lets go first loses it
//     and the last one still holding keeps the money. If nobody lets go for
//     CONTEST_CAP the item snaps and nobody gets it. Same for bills, coins, gems
//     and dye packs; a hand that arrives after the window finds the item locked
//   • coin 1, bill 3, gem 5; a dye pack is −3 and puts your hands out for a moment
//   • LAST CALL: the final 10 seconds spray loot and everything is worth double
//   • a tie at the buzzer is settled by the next loot to land in a safe
//
// step() never mutates its argument (the host hook requires it) and draws every
// random number from a seed carried in the state, so a round replays exactly.

export const TABLE_W = 360
export const TABLE_H = 560
export const ROUND_SECONDS = 60
export const LAST_CALL_SECONDS = 10
export const COUNT_IN_SECONDS = 3.4        // shows 3 · 2 · 1 then GRAB! for the last 0.4 s
export const GRAB_PAD = 13                 // a glove closes on loot this close to its edge
export const SAFE_RADIUS = 30
export const MAX_LOOT = 4                  // on the table at once (+2 during LAST CALL)
export const CONTEST_WINDOW = 0.5          // a rival hand may join an item this soon after the first grab
export const CONTEST_CAP = 3               // a contest nobody gives up on snaps the item after this long
export const SNAP_STUN = 0.4               // both hands are dazed when the item snaps
export const DYE_HANDS_OUT_SECONDS = 1.6
export const LOOT_LIFETIME = 7.5           // an unclaimed item blinks out after this
export const DROP_SECONDS = 0.42           // loot lands before it can be touched
export const REACH_FRACTION = 0.86         // arm reach, as a share of the farthest rival safe
export const DYE_PENALTY = 3

export const VALUES = { coin: 1, bill: 3, gem: 5, dye: -DYE_PENALTY }
export const RADII = { coin: 12, bill: 15, gem: 13, dye: 15 }
export const LOOT_KINDS = ['coin', 'bill', 'gem', 'dye']

const HAND_SPEED = 2600                    // table units / s while a finger is down
const HOME_SPEED = 1500                    // a lifted hand glides back this fast
const HAND_EDGE = 10                       // gloves stay this far inside the table
const SLIDE_FRICTION = 0.03                // v *= SLIDE_FRICTION^dt for free loot
const EDGE_BOUNCE = 0.6
const FLICK_CAP = 900
const GEM_LAG = 9                          // a gem trails the glove (others snap on)
const LOOT_FOLLOW = 34
const HAND_SMOOTH = 18

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)
const r1 = (n) => Math.round(n * 10) / 10
const r2 = (n) => Math.round(n * 100) / 100

// ── seats ───────────────────────────────────────────────────────────────────

/** Where each safe sits. 2 players face each other; 3 and 4 take the corners. */
export function seatsFor(n) {
  if (n <= 2) return [{ x: TABLE_W / 2, y: TABLE_H - 46 }, { x: TABLE_W / 2, y: 46 }]
  if (n === 3) return [{ x: TABLE_W / 2, y: TABLE_H - 46 }, { x: 58, y: 52 }, { x: 302, y: 52 }]
  return [{ x: 62, y: TABLE_H - 52 }, { x: 298, y: 52 }, { x: 62, y: 52 }, { x: 298, y: TABLE_H - 52 }]
}

/** Hands per player: two with a duel, one when three or four share the phone. */
export function handsFor(n) { return n <= 2 ? 2 : 1 }

/** Players the page may seat. */
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4

// ── state ───────────────────────────────────────────────────────────────────

/**
 * @param {{ players?: number, bots?: Array<string|null>, seed?: number,
 *   countIn?: number, dyePacks?: boolean, lastCall?: boolean, handsPer?: number }} [opts]
 */
export function createState(opts = {}) {
  const n = clamp(Math.round(opts.players ?? 2), MIN_PLAYERS, MAX_PLAYERS)
  const seats = seatsFor(n)
  const per = opts.handsPer ?? handsFor(n)
  const players = seats.map((safe, i) => {
    let far = 0
    for (const o of seats) far = Math.max(far, dist(safe.x, safe.y, o.x, o.y))
    const ang = Math.atan2(TABLE_H / 2 - safe.y, TABLE_W / 2 - safe.x)
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    const mouth = { x: safe.x + dx * 24, y: safe.y + dy * 24 }
    const hands = []
    for (let k = 0; k < per; k++) {
      const off = per === 2 ? (k ? 1 : -1) * 15 : 0
      const hx = mouth.x + dx * 16 - dy * off
      const hy = mouth.y + dy * 16 + dx * off
      hands.push({ x: hx, y: hy, hx, hy, tx: hx, ty: hy, vx: 0, vy: 0, active: false, loot: null, stun: 0 })
    }
    return { i, score: 0, dyed: 0, bot: opts.bots?.[i] ?? null, safe, ang, mouth, reach: far * REACH_FRACTION, hands }
  })
  const countIn = opts.countIn ?? COUNT_IN_SECONDS
  return {
    tick: 0, t: 0,
    phase: countIn > 0 ? 'count' : 'play',
    count: countIn,
    time: ROUND_SECONDS,
    sudden: false,
    lastCalled: false,
    winner: null,
    dyePacks: opts.dyePacks !== false,
    lastCall: opts.lastCall !== false,
    nextSpawn: 0.5, nextId: 1,
    rng: (opts.seed ?? 1) | 0,
    players,
    loot: [],
  }
}

function cloneState(st) {
  return {
    ...st,
    players: st.players.map((p) => ({ ...p, hands: p.hands.map((h) => ({ ...h })) })),
    loot: st.loot.map((l) => ({ ...l, holders: l.holders.slice() })),
  }
}

function rand(s) {
  s.rng = (s.rng + 0x6D2B79F5) | 0
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (s, a, b) => a + rand(s) * (b - a)

/** A stable 0..1 hash, for choices that must not depend on call order (bots). */
function hash01(n) {
  let t = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B)
  t ^= t >>> 13
  t = Math.imul(t, 0xC2B2AE35)
  t ^= t >>> 16
  return (t >>> 0) / 4294967296
}

const handKey = (p, k) => p * 2 + k
const handOf = (s, key) => s.players[key >> 1].hands[key & 1]
const lootById = (s, id) => s.loot.find((l) => l.id === id)

/** The score multiplier right now: double during LAST CALL. */
export function multiplier(s) {
  return s.lastCall && s.phase === 'play' && !s.sudden && s.time <= LAST_CALL_SECONDS ? 2 : 1
}

/** Whether the table is in its final stretch (for the clock and the banner). */
export function lastCallActive(s) { return multiplier(s) > 1 }

/** Where a hand may be: inside the table and within the arm's reach of its safe. */
export function clampToReach(player, x, y) {
  let tx = x
  let ty = y
  const d = dist(tx, ty, player.safe.x, player.safe.y)
  if (d > player.reach) {
    tx = player.safe.x + ((tx - player.safe.x) * player.reach) / d
    ty = player.safe.y + ((ty - player.safe.y) * player.reach) / d
  }
  return { x: clamp(tx, HAND_EDGE, TABLE_W - HAND_EDGE), y: clamp(ty, HAND_EDGE, TABLE_H - HAND_EDGE) }
}

// ── input ───────────────────────────────────────────────────────────────────

/** Whatever arrived off the wire, as `per` hand slots of { x, y } | null. */
export function cleanInput(input, per) {
  const out = []
  const raw = Array.isArray(input?.hands) ? input.hands : []
  for (let k = 0; k < per; k++) {
    const h = raw[k]
    const x = Number(h?.x)
    const y = Number(h?.y)
    out.push(h && Number.isFinite(x) && Number.isFinite(y) ? { x: clamp(x, 0, TABLE_W), y: clamp(y, 0, TABLE_H) } : null)
  }
  return out
}

// ── loot ────────────────────────────────────────────────────────────────────

function pickKind(s) {
  if (s.sudden) return 'coin'
  const r = rand(s)
  if (r < 0.52) return 'coin'
  if (r < 0.82) return 'bill'
  if (r < 0.9) return 'gem'
  return s.dyePacks ? 'dye' : 'coin'
}

function addLoot(s, kind, x, y, z = 1) {
  const l = { id: s.nextId++, kind, x, y, vx: 0, vy: 0, z, ttl: LOOT_LIFETIME, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false }
  s.loot.push(l)
  return l
}

function spawn(s) {
  const kind = pickKind(s)
  let x = 0
  let y = 0
  for (let tries = 0; tries < 20; tries++) {
    x = between(s, 46, TABLE_W - 46)
    y = between(s, 120, TABLE_H - 120)
    const clear = s.players.every((p) => dist(x, y, p.safe.x, p.safe.y) > 110)
      && s.loot.every((l) => dist(x, y, l.x, l.y) > 44)
    if (clear) break
  }
  return addLoot(s, kind, x, y)
}

function release(s, key, stun = 0) {
  const h = handOf(s, key)
  if (h.loot != null) {
    const l = lootById(s, h.loot)
    if (l) {
      l.holders = l.holders.filter((k) => k !== key)
      if (!l.holders.length) { l.vx = clamp(h.vx, -FLICK_CAP, FLICK_CAP); l.vy = clamp(h.vy, -FLICK_CAP, FLICK_CAP); l.held = 0 }
      if (l.holders.length === 1 && l.duel) l.held = Math.max(l.held, CONTEST_WINDOW + 1)   // whoever let go lost it for good
      l.contest = 0
      l.strain = 0
    }
    h.loot = null
  }
  if (stun) h.stun = stun
}

function deposit(s, l, p, events) {
  l.dead = true
  for (const key of l.holders) handOf(s, key).loot = null
  l.holders = []
  if (l.kind === 'dye') {
    p.score = Math.max(0, p.score + VALUES.dye)
    p.dyed = DYE_HANDS_OUT_SECONDS
    p.hands.forEach((_, k) => release(s, handKey(p.i, k), 0.3))
    events.push({ type: 'dye', by: p.i })
  } else {
    const v = VALUES[l.kind] * multiplier(s)
    p.score += v
    events.push({ type: v >= 3 ? 'bigcash' : 'cash', by: p.i })
  }
}

/** The item snaps under the strain: nobody gets it, both hands are dazed. */
function snap(s, l, events) {
  const keys = l.holders.slice()
  l.dead = true
  l.holders = []
  for (const key of keys) {
    const h = handOf(s, key)
    h.loot = null
    h.stun = SNAP_STUN
  }
  events.push({ type: 'snap' })
}

// ── hands ───────────────────────────────────────────────────────────────────

function applyHandInput(s, p, k, inp) {
  const h = p.hands[k]
  if (inp) {
    h.active = true
    h.tx = inp.x
    h.ty = inp.y
  } else {
    if (h.active && h.loot != null) release(s, handKey(p.i, k))
    h.active = false
  }
}

function stepHand(s, p, k, dt, events, canGrab) {
  const h = p.hands[k]
  const key = handKey(p.i, k)
  if (h.stun > 0) h.stun = Math.max(0, h.stun - dt)
  const goal = h.active ? clampToReach(p, h.tx, h.ty) : { x: h.hx, y: h.hy }
  let speed = h.active ? HAND_SPEED : HOME_SPEED
  if (p.bot) {
    speed = (BOT_LEVELS[p.bot] ?? BOT_LEVELS.normal).speed
    if (h.loot != null && lootById(s, h.loot)?.kind === 'gem') speed *= 0.7
    if (!h.active) speed = Math.max(speed, 900)
  }
  const ox = h.x
  const oy = h.y
  const gap = dist(h.x, h.y, goal.x, goal.y)
  const mv = speed * dt
  if (gap <= mv) { h.x = goal.x; h.y = goal.y } else { h.x += ((goal.x - h.x) / gap) * mv; h.y += ((goal.y - h.y) / gap) * mv }
  const kf = Math.min(1, dt * HAND_SMOOTH)
  h.vx += ((h.x - ox) / dt - h.vx) * kf
  h.vy += ((h.y - oy) / dt - h.vy) * kf
  if (!canGrab || !h.active || h.loot != null || h.stun > 0 || p.dyed > 0) return
  for (const l of s.loot) {
    if (l.dead || l.z > 0.05 || l.holders.length >= 2) continue
    if (l.holders.length === 1 && l.held > CONTEST_WINDOW) continue   // too late: the first grip is locked
    if (l.holders.some((hk) => (hk >> 1) === p.i)) continue   // never two of your own hands on one item
    if (dist(h.x, h.y, l.x, l.y) < RADII[l.kind] + GRAB_PAD) {
      if (!l.holders.length) l.held = 0
      l.holders.push(key)
      h.loot = l.id
      l.contest = 0
      events.push({ type: 'grab', by: p.i })
      break
    }
  }
}

// ── step ────────────────────────────────────────────────────────────────────

function finish(s, events) {
  if (s.phase === 'over') return
  s.phase = 'over'
  s.players.forEach((p) => p.hands.forEach((_, k) => release(s, handKey(p.i, k))))
  let best = 0
  s.players.forEach((p) => { if (p.score > s.players[best].score) best = p.i })
  s.winner = best
  events.push({ type: 'end' })
}

/**
 * Advance one tick. `inputs` is indexed by player. Returns { state, events }.
 * Events: grab, land, cash, bigcash, dye, tug, won, snap, expire, tick (count-in and
 * the clock's last seconds), go, lastcall, end; each may carry `by` (a player index).
 */
export function step(state, inputs, dt) {
  const s = cloneState(state)
  const events = []
  s.tick += 1
  s.t += dt
  const n = s.players.length
  const per = s.players[0].hands.length
  for (const p of s.players) if (p.dyed > 0) p.dyed = Math.max(0, p.dyed - dt)
  // Alternate who is applied first so a contested item is not always player 0's.
  const order = []
  for (let k = 0; k < n; k++) order.push((k + s.tick) % n)

  const live = s.phase === 'play'
  for (const i of order) {
    const p = s.players[i]
    const inp = s.phase === 'over' ? null : cleanInput(inputs?.[i], per)
    p.hands.forEach((_, k) => applyHandInput(s, p, k, inp ? inp[k] : null))
  }

  if (s.phase === 'count') {
    const before = Math.ceil(s.count - 0.4)
    s.count -= dt
    const after = Math.ceil(s.count - 0.4)
    if (after < before) events.push({ type: after >= 1 ? 'tick' : 'go' })
    if (s.count <= 0) { s.phase = 'play'; s.count = 0 }
  } else if (live) {
    const wholeBefore = Math.ceil(s.time)
    if (!s.sudden) s.time -= dt
    if (!s.sudden && s.time <= LAST_CALL_SECONDS && s.time > 0 && Math.ceil(s.time) < wholeBefore) events.push({ type: 'tick' })
    if (s.lastCall && !s.lastCalled && !s.sudden && s.time <= LAST_CALL_SECONDS) {
      s.lastCalled = true
      events.push({ type: 'lastcall' })
    }
    // spawn waves: faster as the clock runs down, a spray in the last call
    s.nextSpawn -= dt
    const onTable = s.loot.filter((l) => !l.dead).length
    const mult = multiplier(s)
    if (s.nextSpawn <= 0 && onTable < (s.sudden ? 1 : MAX_LOOT + (mult > 1 ? 2 : 0))) {
      spawn(s)
      s.nextSpawn = mult > 1 ? 0.5 : 1.5 - 0.6 * (1 - clamp(s.time / ROUND_SECONDS, 0, 1))
    }
  }

  for (const i of order) s.players[i].hands.forEach((_, k) => stepHand(s, s.players[i], k, dt, events, live))

  if (live) {
    const count = s.loot.length                 // loot added mid-loop (torn halves) waits for the next tick
    for (let li = 0; li < count; li++) {
      const l = s.loot[li]
      if (l.dead) continue
      if (l.z > 0) {
        l.z -= dt / DROP_SECONDS
        if (l.z <= 0) { l.z = 0; events.push({ type: 'land' }) }
        continue
      }
      l.holders = l.holders.filter((key) => handOf(s, key).loot === l.id)
      const hs = l.holders
      if (hs.length) l.held += dt
      if (hs.length === 1) {
        const h = handOf(s, hs[0])
        const kf = Math.min(1, dt * (l.kind === 'gem' ? GEM_LAG : LOOT_FOLLOW))
        l.x += (h.x - l.x) * kf
        l.y += (h.y - l.y) * kf
        l.vx = h.vx
        l.vy = h.vy
        l.contest = 0
        l.strain = 0
        if (l.duel) {                           // the other hand let go: the one still holding wins the tug
          l.duel = false
          events.push({ type: 'won', by: hs[0] >> 1 })
        }
      } else if (hs.length === 2) {
        const a = handOf(s, hs[0])
        const b = handOf(s, hs[1])
        l.x = (a.x + b.x) / 2
        l.y = (a.y + b.y) / 2
        if (!l.duel) { l.duel = true; events.push({ type: 'tug' }) }
        l.contest += dt
        l.strain = clamp(l.contest / CONTEST_CAP, 0, 1)
        if (l.contest >= CONTEST_CAP) snap(s, l, events)
      } else {
        l.duel = false
        l.x += l.vx * dt
        l.y += l.vy * dt
        const f = Math.pow(SLIDE_FRICTION, dt)
        l.vx *= f
        l.vy *= f
        const r = RADII[l.kind]
        if (l.x < r + 8) { l.x = r + 8; l.vx = Math.abs(l.vx) * EDGE_BOUNCE }
        if (l.x > TABLE_W - r - 8) { l.x = TABLE_W - r - 8; l.vx = -Math.abs(l.vx) * EDGE_BOUNCE }
        if (l.y < r + 8) { l.y = r + 8; l.vy = Math.abs(l.vy) * EDGE_BOUNCE }
        if (l.y > TABLE_H - r - 8) { l.y = TABLE_H - r - 8; l.vy = -Math.abs(l.vy) * EDGE_BOUNCE }
        l.ttl -= dt
        if (l.ttl <= 0) { l.dead = true; events.push({ type: 'expire' }) }
      }
      if (l.dead) continue
      for (const p of s.players) {
        if (dist(l.x, l.y, p.safe.x, p.safe.y) < SAFE_RADIUS) { deposit(s, l, p, events); break }
      }
    }
    s.loot = s.loot.filter((l) => !l.dead)

    const top = Math.max(...s.players.map((p) => p.score))
    const leaders = s.players.filter((p) => p.score === top)
    if (s.time <= 0 && !s.sudden) {
      if (leaders.length > 1) {
        s.sudden = true
        s.time = 0
        for (const l of s.loot) l.ttl = Math.min(l.ttl, 0.2)
      } else finish(s, events)
    } else if (s.sudden && leaders.length === 1) finish(s, events)
  }
  return { state: s, events }
}

/** The winning player's index once the round is over, else null. */
export function getWinner(state) { return state.phase === 'over' ? state.winner : null }

/** Players best first (ties keep seat order). */
export function ranking(state) {
  return state.players.map((p) => ({ i: p.i, score: p.score })).sort((a, b) => b.score - a.score || a.i - b.i)
}

/** Duel seat symbols: player 0 is X (host, bottom), player 1 is O. */
export const SEAT_SYMBOLS = ['X', 'O']
export const seatOfSymbol = (sym) => (sym === 'O' ? 1 : 0)
export function winnerSymbol(state) {
  const w = getWinner(state)
  return w == null ? null : SEAT_SYMBOLS[w] ?? null
}

// ── bots ────────────────────────────────────────────────────────────────────
// A bot obeys the same reach and hand-speed limits as a person and sees only
// the table as it is now. Harder bots look sooner, move faster and are never
// fooled by a dye pack. None of them gets a hidden advantage.

// `hold` is how long a bot keeps tugging at a contested item, on average: each
// contest draws 0.4×–1.6× of it (scaled by what the item is worth), so a bot
// lets go at a different moment every time and a patient person can outlast it.
export const BOT_LEVELS = {
  easy: { react: 0.75, speed: 250, fool: 0.6, hold: 0.6 },
  normal: { react: 0.45, speed: 370, fool: 0.2, hold: 1 },
  hard: { react: 0.22, speed: 520, fool: 0, hold: 1.4 },
}

/** How long a bot hangs on in a tug over this item before it lets go. */
export function botHoldFor(level, kind, rng = Math.random) {
  const cfg = BOT_LEVELS[level] ?? BOT_LEVELS.normal
  if (kind === 'dye') return 0.12                       // nobody wins a dye pack by holding it
  return cfg.hold * (0.4 + rng() * 1.2) * (0.7 + 0.1 * VALUES[kind])
}

/** A bot's memory between ticks: what each hand is going for and how long it waits. */
export function createBrain(per = 2) {
  return { hands: Array.from({ length: per }, () => ({ target: null, wait: 0, tug: 0, limit: 0 })), secondHand: false }
}

/**
 * Where bot `i` wants each hand this tick. `brain` is the bot's own memory and
 * is updated in place; `rng` is injectable so tests are deterministic.
 * The second hand stays home until `brain.secondHand` is set (the page sets it
 * once the person has used two fingers at once), so a mouse player is not out-handed.
 */
export function botInput(state, i, level, brain, dt, rng = Math.random) {
  const cfg = BOT_LEVELS[level] ?? BOT_LEVELS.normal
  const p = state.players[i]
  const out = []
  p.hands.forEach((h, k) => {
    const mem = brain.hands[k] ?? (brain.hands[k] = { target: null, wait: 0, tug: 0, limit: 0 })
    if (h.stun > 0 || p.dyed > 0) { mem.target = null; out.push(null); return }
    if (k > 0 && !brain.secondHand) { mem.target = null; out.push(null); return }
    if (h.loot != null) {
      const held = lootById(state, h.loot)
      if (held && held.holders.length > 1) {          // a tug: hang on, then let go at a time of its own choosing
        if (!mem.limit) { mem.tug = 0; mem.limit = botHoldFor(level, held.kind, rng) }
        mem.tug += dt
        if (mem.tug >= mem.limit) { out.push(null); return }
      } else { mem.tug = 0; mem.limit = 0 }
      out.push({ x: p.mouth.x, y: p.mouth.y })
      return
    }
    mem.tug = 0
    mem.limit = 0
    if (mem.wait > 0) { mem.wait -= dt; out.push(null); return }
    let t = mem.target != null ? state.loot.find((l) => l.id === mem.target) : null
    if (t && (t.dead || t.holders.some((hk) => (hk >> 1) === i) || t.holders.length >= 2 || (t.holders.length && t.held > CONTEST_WINDOW))) { t = null; mem.target = null }
    if (!t) {
      let best = null
      let bs = 0
      for (const l of state.loot) {
        if (l.dead || l.z > 0.4 || l.holders.length >= 2 || (l.holders.length && l.held > CONTEST_WINDOW - 0.1)) continue
        if (p.hands.some((o, ok) => ok !== k && (brain.hands[ok]?.target === l.id || o.loot === l.id))) continue
        if (l.kind === 'dye' && hash01(l.id * 31 + i * 17) >= cfg.fool) continue   // saw the light, left it
        const d = dist(l.x, l.y, p.safe.x, p.safe.y)
        if (d > p.reach) continue
        let v = Math.abs(VALUES[l.kind]) / (d + 70)
        if (l.holders.length) v *= 0.5                  // piling on a held item means a tug
        if (v > bs) { bs = v; best = l }
      }
      if (best) { mem.target = best.id; mem.wait = cfg.react * (0.7 + rng() * 0.6) }
      out.push(null)
      return
    }
    out.push({ x: t.x, y: t.y })
  })
  return { hands: out }
}

// ── wire format (online duel) ───────────────────────────────────────────────

const KIND_CODE = Object.fromEntries(LOOT_KINDS.map((k, i) => [k, i]))
const PHASES = ['count', 'play', 'over']
const LOOT_STRIDE = 12
const HAND_STRIDE = 5

/** The host's state as one small JSON frame (positions to 0.1 unit). */
export function encodeSnapshot(s) {
  const loot = []
  for (const l of s.loot) {
    loot.push(
      l.id, KIND_CODE[l.kind], r1(l.x), r1(l.y), r1(l.vx), r1(l.vy), r2(l.z), r1(l.ttl), r2(l.strain), r2(l.contest),
      l.holders.length > 0 ? l.holders[0] + 1 : 0, l.holders.length > 1 ? l.holders[1] + 1 : 0,
    )
  }
  return {
    t: 's',
    ph: PHASES.indexOf(s.phase),
    tm: r1(s.time),
    c: r1(s.count),
    sd: s.sudden ? 1 : 0,
    w: s.winner ?? -1,
    p: s.players.map((p) => [p.score, r1(p.dyed), ...p.hands.flatMap((h) => [r1(h.x), r1(h.y), h.active ? 1 : 0, r1(h.stun), h.loot ?? 0])]),
    l: loot,
  }
}

/**
 * A snapshot back into a state-shaped scene the renderer can draw, on top of
 * `base` (a createState for the same player count, which supplies the safes).
 */
export function decodeSnapshot(snap, base) {
  const players = base.players.map((bp, i) => {
    const row = snap.p?.[i] ?? []
    const hands = bp.hands.map((bh, k) => {
      const o = 2 + k * HAND_STRIDE
      const loot = row[o + 4] || null
      return { ...bh, x: row[o] ?? bh.x, y: row[o + 1] ?? bh.y, active: !!row[o + 2], stun: row[o + 3] ?? 0, loot, vx: 0, vy: 0 }
    })
    return { ...bp, score: row[0] ?? 0, dyed: row[1] ?? 0, hands }
  })
  const loot = []
  const a = snap.l ?? []
  for (let o = 0; o + LOOT_STRIDE <= a.length; o += LOOT_STRIDE) {
    const holders = []
    if (a[o + 10]) holders.push(a[o + 10] - 1)
    if (a[o + 11]) holders.push(a[o + 11] - 1)
    loot.push({
      id: a[o], kind: LOOT_KINDS[a[o + 1]] ?? 'coin', x: a[o + 2], y: a[o + 3], vx: a[o + 4], vy: a[o + 5],
      z: a[o + 6], ttl: a[o + 7], strain: a[o + 8], contest: a[o + 9], holders, held: 0, duel: holders.length > 1, dead: false,
    })
  }
  return {
    ...base,
    phase: PHASES[snap.ph] ?? 'play',
    time: snap.tm ?? base.time,
    count: snap.c ?? 0,
    sudden: !!snap.sd,
    winner: snap.w >= 0 ? snap.w : null,
    players,
    loot,
  }
}

/**
 * Carry a decoded scene `age` seconds past its snapshot: free loot keeps
 * sliding, held loot rides its holder. `mine` maps hand keys the local player
 * controls to where the finger is now, so your own glove never waits on the
 * host. Loot your own hand holds follows your glove too.
 */
export function deadReckon(scene, age, mine = {}) {
  const a = Math.min(Math.max(age, 0), 0.1)
  const players = scene.players.map((p) => ({
    ...p,
    hands: p.hands.map((h, k) => {
      const at = mine[handKey(p.i, k)]
      if (!at) return h
      const c = clampToReach(p, at.x, at.y)
      return { ...h, x: c.x, y: c.y, active: true }
    }),
  }))
  const hand = (key) => players[key >> 1]?.hands[key & 1]
  const loot = scene.loot.map((l) => {
    const hs = l.holders.map(hand).filter(Boolean)
    if (hs.length === 1) return { ...l, x: hs[0].x, y: hs[0].y }
    if (hs.length === 2) return { ...l, x: (hs[0].x + hs[1].x) / 2, y: (hs[0].y + hs[1].y) / 2 }
    const r = RADII[l.kind]
    return {
      ...l,
      x: clamp(l.x + l.vx * a, r + 8, TABLE_W - r - 8),
      y: clamp(l.y + l.vy * a, r + 8, TABLE_H - r - 8),
    }
  })
  return { ...scene, players, loot }
}
