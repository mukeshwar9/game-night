// @ts-check
// firstCutLogic.js — pure FIRST CUT (a katana reflex duel for 2 to 4 on one
// phone, or 2 to 8 online). No DOM, no Firebase, no React.
//
// One item at a time sits on the plate: fruit, or a round lookalike ("twin").
// Tap while a fruit shows and your katana swings through it. Tap a twin and
// the blade stops dead at its edge: it does not cut, and you stay blocked for
// the rest of that item AND the whole next one, so you miss the next fruit.
// First to the target takes the game.
//
// Everything is a pure function of the seed, the config and the players'
// reports, so every client derives the same game without a server:
//   * the timetable (what shows when, for how long) comes from (seed, config);
//   * a player reports `t[k]` (ms after item k appeared, a cut attempt on a
//     fruit) or `j[k]` (a wrong tap on item k, a block);
//   * who owns item k is the fastest legal report, and a dead heat is void.
// The same `resolveRound` scores one phone, the bot page and the online race.
import { raceGoAt, seededFraction } from './raceLogic'

// ── Constants ─────────────────────────────────────────────────────────────

/** One phone / solo: first to this many points wins the game. */
export const FC_TARGET = 10
/** Online: first to this many points wins the round (3 round wins take the match). */
export const FC_ONLINE_TARGET = 5
/** Online round deadline; the most points wins if nobody reaches the target. */
export const FC_ROUND_MS = 75_000
/** A gold fruit is worth this much. */
export const FC_GOLD_POINTS = 3
/** A rotten fruit takes this many points off the player who cuts it. */
export const FC_ROTTEN_PENALTY = 1
/** A player this far behind the leader is freed sooner (GOLD & ROTTEN). */
export const FC_UNDERDOG_GAP = 3
/** Real items between rule cards (RULE FLIP). */
export const FC_FLIP_EVERY = 6
/** The pause when a new rule card appears. Nothing to cut while it shows. */
export const FC_BEAT_MS = 1100
/** A gold fruit stays only this long. */
export const FC_GOLD_MS = 800
/** Share of items that are cuttable. */
export const FC_HIT_CHANCE = 0.42
/** Never more than this many un-cuttable items in a row. */
export const FC_MAX_DRY = 3
/** How long an item stays, per pace, in ms (a seeded value in range). */
export const FC_PACES = {
  slow: { min: 1200, max: 1900 },
  medium: { min: 950, max: 1500 },
}
export const FC_PACE_IDS = /** @type {const} */ (['slow', 'medium'])
/** A report may not claim a time later than the item's own length plus this. */
export const FC_REPORT_SLACK_MS = 120
/** Online: a faster report must arrive within this long of the first one. */
export const FC_SETTLE_MS = 600
/** One-phone countdown. */
export const FC_COUNTDOWN_STEPS = 3

/** @typedef {{ id: string, fruit: boolean, citrus: boolean, color: string, twin: string }} ItemDef */
/** The eight things that can sit on the plate: four fruit and their round lookalikes. */
export const ITEMS = /** @type {ItemDef[]} */ ([
  { id: 'melon', fruit: true, citrus: false, color: 'green', twin: 'beach' },
  { id: 'orange', fruit: true, citrus: true, color: 'orange', twin: 'hoop' },
  { id: 'apple', fruit: true, citrus: false, color: 'red', twin: 'bauble' },
  { id: 'lemon', fruit: true, citrus: true, color: 'yellow', twin: 'tennis' },
  { id: 'beach', fruit: false, citrus: false, color: 'green', twin: 'melon' },
  { id: 'hoop', fruit: false, citrus: false, color: 'orange', twin: 'orange' },
  { id: 'bauble', fruit: false, citrus: false, color: 'red', twin: 'apple' },
  { id: 'tennis', fruit: false, citrus: false, color: 'yellow', twin: 'lemon' },
])
const ITEM_BY_ID = new Map(ITEMS.map(i => [i.id, i]))
export const itemDef = (/** @type {string|null} */ id) => (id ? ITEM_BY_ID.get(id) ?? null : null)

/** @typedef {{ id: string, label: string, short: string, ok: (it: ItemDef) => boolean }} Rule */
/** What counts as a cut. RULE FLIP walks through these. */
export const RULES = /** @type {Rule[]} */ ([
  { id: 'any', label: 'ANY FRUIT', short: 'FRUIT', ok: it => it.fruit },
  { id: 'citrus', label: 'CITRUS ONLY', short: 'CITRUS', ok: it => it.fruit && it.citrus },
  { id: 'nocitrus', label: 'NO CITRUS', short: 'NO CITRUS', ok: it => it.fruit && !it.citrus },
  { id: 'redgreen', label: 'RED OR GREEN FRUIT', short: 'RED / GREEN', ok: it => it.fruit && (it.color === 'red' || it.color === 'green') },
])
const RULE_BY_ID = new Map(RULES.map(r => [r.id, r]))
export const ruleDef = (/** @type {string} */ id) => RULE_BY_ID.get(id) ?? RULES[0]

// ── Config ────────────────────────────────────────────────────────────────

export const FC_CONFIG_VERSION = 1

/** @typedef {{ version: 1, flip: boolean, gold: boolean, pace: 'slow' | 'medium' }} FirstCutConfig */
/** @type {FirstCutConfig} */
export const DEFAULT_FC_CONFIG = { version: FC_CONFIG_VERSION, flip: false, gold: false, pace: 'slow' }

/** Lobby options as stored in the room, clamped to what exists. */
export function normalizeFcConfig(raw) {
  return {
    version: FC_CONFIG_VERSION,
    flip: raw?.flip === true,
    gold: raw?.gold === true,
    pace: raw?.pace === 'medium' ? 'medium' : 'slow',
  }
}

export function isValidFcConfig(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && raw.version === FC_CONFIG_VERSION
    && typeof raw.flip === 'boolean' && typeof raw.gold === 'boolean'
    && FC_PACE_IDS.includes(raw.pace)
    && Object.keys(raw).every(k => ['version', 'flip', 'gold', 'pace'].includes(k))
}

/** A short label for the lobby / header. */
export function describeFcConfig(raw) {
  const c = normalizeFcConfig(raw)
  const twists = [c.flip && 'RULE FLIP', c.gold && 'GOLD & ROTTEN'].filter(Boolean)
  return `${twists.length ? twists.join(' + ') : 'PLAIN'} · ${c.pace.toUpperCase()} PACE`
}

// ── The timetable ─────────────────────────────────────────────────────────

/**
 * @typedef {object} Entry
 * @property {number} i            position in the timetable
 * @property {'item' | 'beat'} kind  a beat is the rule-card pause: nothing to cut
 * @property {string | null} id    ITEMS id (null for a beat)
 * @property {string} rule         the rule in force (a beat carries the NEW one)
 * @property {boolean} hit         cuttable: a fruit the rule allows, not rotten
 * @property {boolean} gold
 * @property {boolean} rotten
 * @property {number} ms           how long it stays
 * @property {number} start        ms from the start of play
 */

/** @type {Map<string, { entries: Entry[], dry: number, last: string | null, since: number, rule: string }>} */
const cache = new Map()
const keyOf = (seed, cfg) => `${Number(seed) | 0}|${cfg.flip ? 1 : 0}${cfg.gold ? 1 : 0}|${cfg.pace}`

function sequenceFor(seed, rawCfg) {
  const cfg = normalizeFcConfig(rawCfg)
  const key = keyOf(seed, cfg)
  let seq = cache.get(key)
  if (!seq) {
    if (cache.size >= 6) cache.clear() // one game at a time; never grow without bound
    seq = { entries: [], dry: 0, last: null, since: 0, rule: 'any' }
    cache.set(key, seq)
  }
  return { seq, cfg }
}

function extend(seq, cfg, seed, upTo) {
  const pace = FC_PACES[cfg.pace]
  while (seq.entries.length <= upTo) {
    const i = seq.entries.length
    const start = i === 0 ? 0 : seq.entries[i - 1].start + seq.entries[i - 1].ms
    /** @type {Entry} */
    let entry
    if (cfg.flip && i > 0 && seq.since >= FC_FLIP_EVERY) {
      const others = RULES.filter(r => r.id !== seq.rule)
      const next = others[Math.floor(seededFraction(seed, i, 1) * others.length)] ?? others[0]
      seq.rule = next.id
      seq.since = 0
      entry = { i, kind: 'beat', id: null, rule: next.id, hit: false, gold: false, rotten: false, ms: FC_BEAT_MS, start }
    } else {
      const rule = ruleDef(seq.rule)
      const wantHit = seq.dry >= FC_MAX_DRY || seededFraction(seed, i, 2) < FC_HIT_CHANCE
      let pool = ITEMS.filter(it => rule.ok(it) === wantHit && it.id !== seq.last)
      if (!pool.length) pool = ITEMS.filter(it => it.id !== seq.last)
      const it = pool[Math.floor(seededFraction(seed, i, 3) * pool.length)]
      const allowed = rule.ok(it)
      let gold = false
      let rotten = false
      if (cfg.gold && allowed) {
        const r = seededFraction(seed, i, 4)
        if (r < 0.13) gold = true
        else if (r < 0.3) rotten = true
      }
      const hit = allowed && !rotten
      const ms = gold ? FC_GOLD_MS : Math.round(pace.min + seededFraction(seed, i, 5) * (pace.max - pace.min))
      seq.dry = hit ? 0 : seq.dry + 1
      seq.last = it.id
      seq.since += 1
      entry = { i, kind: 'item', id: it.id, rule: seq.rule, hit, gold, rotten, ms, start }
    }
    seq.entries.push(entry)
  }
}

/** The timetable entry at position `i` (generated on demand, identical for everyone). */
export function entryAt(seed, rawCfg, i) {
  const index = Math.max(0, Math.floor(i))
  const { seq, cfg } = sequenceFor(seed, rawCfg)
  extend(seq, cfg, seed, index)
  return seq.entries[index]
}

/** Which entry is showing `tMs` after the start of play? -1 before it begins. */
export function indexAt(seed, rawCfg, tMs) {
  if (!(tMs >= 0)) return -1
  const { seq, cfg } = sequenceFor(seed, rawCfg)
  let i = 0
  // Walk forward from the nearest generated entry; items are 1 s long, so this is tiny.
  for (;;) {
    extend(seq, cfg, seed, i)
    const e = seq.entries[i]
    if (tMs < e.start + e.ms) return i
    i += 1
  }
}

/**
 * First index at which a player blocked on item `k` may cut again. The block
 * lasts the rest of item `k` and the whole next real item (a rule beat in
 * between does not count as that item). `quick` (the underdog) is freed as
 * soon as item `k` leaves.
 */
export function freeIndexAfter(seed, rawCfg, k, quick = false) {
  if (quick) return k + 1
  let n = k + 1
  while (entryAt(seed, rawCfg, n).kind === 'beat') n += 1
  return n + 1
}

/** What a tap on item `k` does: cut it, be blocked by it, or nothing (a rule beat). */
export function classifyTap(seed, rawCfg, k) {
  const e = entryAt(seed, rawCfg, k)
  if (e.kind === 'beat') return 'none'
  return e.hit ? 'cut' : 'block'
}

// ── Reports and scoring ───────────────────────────────────────────────────

/** @typedef {{ t: Record<string, number>, j: Record<string, boolean> }} Reports */

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Whatever Firebase returned for a racer's stats, as `{ t, j }`. Keys that are
 * not item numbers and times that are not finite are dropped.
 * @returns {Reports}
 */
export function normalizeReports(raw) {
  /** @type {Reports} */
  const out = { t: {}, j: {} }
  if (!isObj(raw)) return out
  const index = (k) => (/^\d{1,5}$/.test(String(k)) ? Number(k) : null)
  const each = (node, fn) => {
    if (Array.isArray(node)) node.forEach((v, k) => { if (v != null) fn(k, v) })
    else if (isObj(node)) Object.entries(node).forEach(([k, v]) => fn(k, v))
  }
  each(raw.t, (k, v) => {
    const n = index(k)
    const ms = Number(v)
    if (n != null && Number.isFinite(ms) && ms >= 0 && ms < 600_000) out.t[n] = Math.round(ms)
  })
  each(raw.j, (k, v) => {
    const n = index(k)
    if (n != null && v) out.j[n] = true
  })
  return out
}

/**
 * Score a game from everyone's reports. Items are walked in order: the
 * fastest legal cut owns a fruit (a dead heat is void), a wrong tap blocks the
 * player and a rotten fruit also costs a point. Stops at the item where
 * someone reaches `target`.
 *
 * @param {object} p
 * @param {number} p.seed
 * @param {unknown} p.config
 * @param {Record<string, unknown>} p.stats      racer id → reports (raw or normalized)
 * @param {string[]} p.racers
 * @param {number} [p.target]
 * @param {number | null} [p.settleAt]  online: only items whose answer is final by this
 *   time (ms from the start of play) count towards the decision; null counts everything
 * @param {number | null} [p.upto]     ignore items after this index
 */
export function resolveRound({ seed, config, stats, racers, target = FC_TARGET, settleAt = null, upto = null }) {
  const cfg = normalizeFcConfig(config)
  const reports = {}
  for (const id of racers) reports[id] = normalizeReports(stats?.[id])
  const scores = Object.fromEntries(racers.map(id => [id, 0]))
  const jams = Object.fromEntries(racers.map(id => [id, 0]))
  const cuts = Object.fromEntries(racers.map(id => [id, 0]))
  const rts = Object.fromEntries(racers.map(id => [id, /** @type {number[]} */ ([])]))
  /** @type {Record<string, { at: number, until: number } | null>} */
  const blocked = Object.fromEntries(racers.map(id => [id, null]))
  /** @type {Record<number, string | null>} */
  const owners = {}
  /** @type {Record<number, number>} */
  const points = {}
  /** @type {Set<number>} */
  const ties = new Set()
  /** @type {Record<number, string[]>} */
  const blockedOn = {}
  let decidedAt = null
  let winner = null

  const reported = new Set()
  for (const id of racers) {
    Object.keys(reports[id].t).forEach(k => reported.add(Number(k)))
    Object.keys(reports[id].j).forEach(k => reported.add(Number(k)))
  }
  const last = Math.min(upto ?? Infinity, reported.size ? Math.max(...reported) : -1)

  for (let k = 0; k <= last; k++) {
    const e = entryAt(seed, cfg, k)
    if (e.kind === 'beat' || !reported.has(k)) continue
    const free = (id) => !(blocked[id] && k < blocked[id].until)

    // Cuts: legal attempts on a cuttable fruit, fastest wins, a dead heat is void.
    if (e.hit) {
      /** @type {{ id: string, ms: number }[]} */
      const tries = []
      for (const id of racers) {
        const ms = reports[id].t[k]
        if (ms == null || ms > e.ms + FC_REPORT_SLACK_MS || !free(id)) continue
        tries.push({ id, ms })
      }
      if (tries.length) {
        const best = Math.min(...tries.map(x => x.ms))
        const leaders = tries.filter(x => x.ms === best)
        if (settleAt != null && e.start + best + FC_SETTLE_MS > settleAt) {
          // Not final yet: a faster report may still be on its way.
          break
        }
        if (leaders.length === 1) {
          const id = leaders[0].id
          const p = e.gold ? FC_GOLD_POINTS : 1
          owners[k] = id
          points[k] = p
          scores[id] += p
          cuts[id] += 1
          rts[id].push(best)
        } else {
          owners[k] = null
          ties.add(k)
        }
      }
    }

    // Blocks: a wrong tap on something that cannot be cut.
    if (!e.hit) {
      for (const id of racers) {
        if (!reports[id].j[k] || !free(id)) continue
        jams[id] += 1
        if (e.rotten) scores[id] = Math.max(0, scores[id] - FC_ROTTEN_PENALTY)
        const lead = Math.max(...racers.map(r => scores[r]))
        const quick = cfg.gold && lead - scores[id] >= FC_UNDERDOG_GAP
        blocked[id] = { at: k, until: freeIndexAfter(seed, cfg, k, quick) }
        ;(blockedOn[k] ||= []).push(id)
      }
    }

    // The game ends the moment someone reaches the target.
    if (owners[k] && scores[owners[k]] >= target) {
      decidedAt = k
      winner = owners[k]
      break
    }
  }

  return { scores, jams, cuts, rts, blocked, owners, points, ties, blockedOn, decidedAt, winner, cfg }
}

/**
 * What a tap by `id` at `t` ms into play does, given the current scoring.
 * Blocked players are ignored; a tap during a rule pause does nothing; a tap
 * on a fruit is a cut attempt (with its time); anything else is a block.
 * @returns {{ kind: 'ignored' | 'none' | 'cut' | 'block', k?: number, ms?: number, reason?: string }}
 */
export function planTap({ seed, config, res, id, t }) {
  if (!(t >= 0)) return { kind: 'ignored', reason: 'early' }
  const k = indexAt(seed, config, t)
  const e = entryAt(seed, config, k)
  if (katanaPhase(res.blocked[id], k) !== 'ready') return { kind: 'ignored', reason: 'blocked', k }
  const kind = classifyTap(seed, config, k)
  if (kind === 'none') return { kind: 'none', k }
  if (kind === 'cut') return { kind: 'cut', k, ms: Math.max(0, Math.round(t - e.start)) }
  return { kind: 'block', k }
}

/**
 * `reports` with one planned tap added. A second report on the same item keeps
 * the earlier time, so mashing never makes you slower. Returns the same object
 * when nothing changes.
 */
export function addReport(reports, id, plan) {
  if (plan.kind !== 'cut' && plan.kind !== 'block') return reports
  const mine = normalizeReports(reports?.[id])
  if (plan.kind === 'cut') {
    const prev = mine.t[plan.k]
    if (prev != null && prev <= plan.ms) return reports
    return { ...reports, [id]: { ...mine, t: { ...mine.t, [plan.k]: plan.ms } } }
  }
  if (mine.j[plan.k]) return reports
  return { ...reports, [id]: { ...mine, j: { ...mine.j, [plan.k]: true } } }
}

/** The one thing a client needs about its own katana right now. */
export function katanaPhase(blocked, index) {
  if (!blocked || index >= blocked.until) return 'ready'
  return index <= blocked.at ? 'stopped' : 'drawing'
}

/** Average of a list of times, rounded, or null when empty. */
export function averageMs(list) {
  if (!list?.length) return null
  return Math.round(list.reduce((a, b) => a + b, 0) / list.length)
}

// ── Online (race) hooks — see raceLogic.js ────────────────────────────────

/**
 * Race entry for one racer: most points when the round ends, then fewest
 * blocks. A racer with no stats node at all is DNF.
 */
export function fcRaceEntry(stats, round, id) {
  if (!stats) return { sortKey: null, score: null }
  const res = resolveFromRound(round)
  const score = res.scores[id] ?? 0
  return { sortKey: [-score, res.jams[id] ?? 0], score }
}

/** The round's configuration as written when it started. */
export function roundConfig(round) {
  return normalizeFcConfig(round?.raw?.firstcutConfig)
}

/** Resolve a normalized race round (final: everything reported counts). */
export function resolveFromRound(round, { settleAt = null } = {}) {
  return resolveRound({
    seed: Number(round?.seed) | 0,
    config: roundConfig(round),
    stats: round?.stats ?? {},
    racers: round?.racers ?? [],
    target: FC_ONLINE_TARGET,
    settleAt,
  })
}

/** `decided` hook: someone has reached the target on an item whose answer is final. */
export function fcDecided(stats, racers, ctx) {
  const round = ctx?.round
  if (!round || ctx.now == null || round.startedAt == null) return false
  const goAt = raceGoAt(round)
  const res = resolveRound({
    seed: Number(round.seed) | 0,
    config: roundConfig(round),
    stats,
    racers,
    target: FC_ONLINE_TARGET,
    settleAt: ctx.now - goAt,
  })
  return res.winner != null
}

/** The lobby / live table row for a racer. */
export function fcRow(stats, round, id) {
  if (!stats) return { primary: '—', secondary: '', progress: null, status: 'idle', detail: '' }
  const res = resolveFromRound(round)
  const score = res.scores[id] ?? 0
  const blocks = res.jams[id] ?? 0
  return {
    primary: `${score} / ${FC_ONLINE_TARGET}`,
    secondary: `${res.cuts[id] ?? 0} CUT${(res.cuts[id] ?? 0) === 1 ? '' : 'S'} · ${blocks} BLOCKED`,
    progress: Math.min(1, score / FC_ONLINE_TARGET),
    status: 'racing',
    detail: `${score}`,
  }
}

// ── Bots ──────────────────────────────────────────────────────────────────

export const BOT_LEVELS = /** @type {const} */ (['easy', 'normal', 'hard'])
/** Mean reaction, spread and the rate it falls for a twin. Untuned starting values. */
export const BOTS = {
  easy: { mean: 760, sd: 130, slip: 0.16 },
  normal: { mean: 560, sd: 100, slip: 0.09 },
  hard: { mean: 420, sd: 70, slip: 0.04 },
}

/** A normal-ish number with mean 0 and sd ~1, from four uniform draws. */
function gauss(rand) {
  let u = 0
  for (let k = 0; k < 4; k++) u += rand()
  return (u - 2) / 0.58
}

/**
 * When (ms after the item appeared) a bot taps this entry, or null if it
 * leaves it alone. It can only cut what it can still reach in time, and it
 * sometimes swings at a twin or a rotten fruit.
 */
export function botTapAt(level, entry, rand = Math.random) {
  const b = BOTS[level] ?? BOTS.normal
  if (!entry || entry.kind === 'beat') return null
  const limit = entry.ms - 90
  if (entry.hit) {
    const ms = Math.max(230, Math.round(b.mean + gauss(rand) * b.sd))
    return ms < limit ? ms : null
  }
  const slip = b.slip * (entry.rotten ? 2 : 1)
  if (rand() >= slip) return null
  const ms = Math.max(260, Math.round(b.mean + 60 + gauss(rand) * b.sd))
  return ms < limit ? ms : null
}

// ── Results ───────────────────────────────────────────────────────────────

/** Per-seat end-of-game receipt. */
export function receipt(res, racers) {
  return racers.map(id => ({
    id,
    score: res.scores[id] ?? 0,
    cuts: res.cuts[id] ?? 0,
    avgMs: averageMs(res.rts[id]),
    blocks: res.jams[id] ?? 0,
  }))
}
