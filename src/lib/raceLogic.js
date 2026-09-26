// Shared N-player race logic for the simultaneous races (Reaction Time, Aim
// Trainer, Typing Race, Mental Math, Mine Race). A race room is a party room
// (players keyed by uid); every racer plays the same seeded content at the
// same time and the round ranks everyone at once. Pure — no DOM/Firebase/React.
//
// Round node (`games/{id}/round` while a race is live or just finished):
//   { id, gameType, seed, startedAt, endsAt, racers: { uid: true },
//     stats: { [id]: { uid: {...per-game stats} } }, ready: { uid: true }, ...extras }
// Stats sit under the round id so a late write from a previous round (a
// debounced progress sync) lands in a dead branch instead of the live round.
// While the room is in its lobby the node is `null` or just `{ ready }`.
//
// Round result (`games/{id}/raceResult`, written once by the finish transaction):
//   { roundId, gameType, order, ranks, scores, dnf, points, at }
// — the shape the game-night scoreboard records placements from.
import { markSeen } from './seenHistory'

export const RACE_MIN_PLAYERS = 2
export const RACE_MAX_PLAYERS = 8
// Round wins that take the match (the 2P races were best-of-5 before).
export const RACE_MATCH_WINS = 3
export const RACE_COUNTDOWN_MS = 3000
// A racer who is still racing but has been offline this long no longer holds
// the round open once everyone online has finished.
export const OFFLINE_GRACE_MS = 10_000

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** Is this seat online? Missing presence counts as online (`online !== false`). */
export function isSeatOnline(players, id) {
  return players?.[id]?.online !== false
}

/** Seated uids in join order (joinedAt, then uid), ignoring malformed seats. */
export function seatedIds(players) {
  return Object.entries(players || {})
    .filter(([, p]) => isObj(p))
    .map(([id, p]) => ({ id: p.playerId || id, at: Number(p.joinedAt) || 0 }))
    .sort((a, b) => (a.at - b.at) || a.id.localeCompare(b.id))
    .map(p => p.id)
}

/** Uids flagged true in a `{ uid: true }` map (Firebase drops false/null keys anyway). */
export function flaggedIds(map) {
  if (!isObj(map)) return []
  return Object.keys(map).filter(k => map[k])
}

/**
 * Normalize whatever Firebase returned for `round` into
 * `{ id, gameType, seed, startedAt, endsAt, racers: string[], stats: {uid: obj}, ready: string[], extras }`.
 * `stats` is already the current round's branch. Returns null for an absent node.
 */
export function normalizeRaceRound(raw) {
  if (!isObj(raw)) return null
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null
  const branch = id && isObj(raw.stats) && isObj(raw.stats[id]) ? raw.stats[id] : {}
  const stats = {}
  for (const [uid, s] of Object.entries(branch)) if (isObj(s)) stats[uid] = s
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)
  return {
    id,
    gameType: raw.gameType ?? null,
    seed: num(raw.seed),
    startedAt: num(raw.startedAt),
    endsAt: num(raw.endsAt),
    racers: flaggedIds(raw.racers).sort(),
    stats,
    ready: flaggedIds(raw.ready),
    raw,
  }
}

/** A short unique-enough round id (keys the stats branch and dedupes night records). */
export function newRoundId(now = Date.now(), rng = Math.random) {
  return `r${Math.floor(now).toString(36)}${Math.floor(rng() * 36 ** 4).toString(36).padStart(4, '0')}`
}

/**
 * Build a fresh round. `durationMs` null = no deadline (timers off): the round
 * then ends only when everyone is done or the coordinator ends it.
 */
export function buildRaceRound({
  id, gameType, racers, now, seed, durationMs, countdownMs = RACE_COUNTDOWN_MS, extras = {},
}) {
  const startedAt = Math.floor(now)
  const racerMap = {}
  for (const uid of racers || []) racerMap[uid] = true
  return {
    ...extras,
    id,
    gameType,
    seed: seed ?? null,
    startedAt,
    endsAt: durationMs == null ? null : startedAt + countdownMs + durationMs,
    racers: racerMap,
  }
}

/** 'countdown' before the go signal, then 'racing' (deadline checks are separate). */
export function racePhase(round, now, countdownMs = RACE_COUNTDOWN_MS) {
  if (!round?.startedAt) return 'idle'
  return now < round.startedAt + countdownMs ? 'countdown' : 'racing'
}

/** The instant the race goes live (after the countdown). */
export function raceGoAt(round, countdownMs = RACE_COUNTDOWN_MS) {
  return round?.startedAt != null ? round.startedAt + countdownMs : null
}

function compareKeys(a, b) {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * Rank racers. Each entry is `{ id, sortKey }` where `sortKey` is an array of
 * numbers compared lexicographically, SMALLER = better (callers negate
 * higher-is-better metrics), or null for a DNF. Equal keys share a rank
 * (competition ranking: 1, 1, 3). DNFs come last, all tied.
 *
 * @returns {{ order: string[], ranks: Record<string, number>, dnf: Record<string, true> }}
 */
export function rankRace(entries) {
  const list = (entries || []).filter(e => e && e.id)
  const finished = list.filter(e => Array.isArray(e.sortKey))
  const dnfList = list.filter(e => !Array.isArray(e.sortKey))
  finished.sort((a, b) => compareKeys(a.sortKey, b.sortKey) || a.id.localeCompare(b.id))
  dnfList.sort((a, b) => a.id.localeCompare(b.id))
  const ranks = {}
  finished.forEach((e, i) => {
    const prev = finished[i - 1]
    ranks[e.id] = prev && compareKeys(prev.sortKey, e.sortKey) === 0 ? ranks[prev.id] : i + 1
  })
  const dnf = {}
  for (const e of dnfList) {
    ranks[e.id] = finished.length + 1
    dnf[e.id] = true
  }
  return { order: [...finished, ...dnfList].map(e => e.id), ranks, dnf }
}

/**
 * Placement points for the night scoreboard: `racerCount - rank` (so the last
 * finisher and every DNF score 0; tied racers score the same).
 */
export function placementPoints(ranks, dnf, racerCount) {
  const points = {}
  for (const [id, rank] of Object.entries(ranks || {})) {
    points[id] = dnf?.[id] ? 0 : Math.max(0, racerCount - rank)
  }
  return points
}

/** Rank-1 racers who actually finished (empty when every racer DNF'd). */
export function raceWinners(ranks, dnf) {
  return Object.entries(ranks || {})
    .filter(([id, rank]) => rank === 1 && !dnf?.[id])
    .map(([id]) => id)
    .sort()
}

/**
 * The `raceResult` node. `entries` are `{ id, sortKey, score }` — `score` is
 * the per-game display metric (null for a DNF).
 */
export function buildRaceResult({ roundId, gameType, entries, now }) {
  const { order, ranks, dnf } = rankRace(entries)
  const scores = {}
  for (const e of entries || []) if (e?.id) scores[e.id] = e.score ?? null
  return {
    roundId, gameType, order, ranks, scores, dnf,
    points: placementPoints(ranks, dnf, order.length),
    at: Math.floor(now),
  }
}

/**
 * Apply a finished round to the room: status/result/winner plus +1 match
 * score for every rank-1 finisher. Returns the new room object (pure; safe
 * inside a runTransaction update function).
 */
export function applyRaceFinish(current, result) {
  const winners = raceWinners(result.ranks, result.dnf)
  const scores = { ...(isObj(current.scores) ? current.scores : {}) }
  for (const id of winners) scores[id] = (Number(scores[id]) || 0) + 1
  return {
    ...current,
    status: 'finished',
    raceResult: result,
    winner: winners.length === 1 ? winners[0] : 'draw',
    scores,
    lastActivityAt: result.at,
  }
}

/** Uids whose match score reached `target` (the match is over when non-empty). */
export function matchChampions(scores, target = RACE_MATCH_WINS) {
  if (!isObj(scores)) return []
  return Object.entries(scores)
    .filter(([, n]) => (Number(n) || 0) >= target)
    .map(([id]) => id)
    .sort()
}

/**
 * Should the live round end now? True when the deadline has passed, a
 * game-specific `decided` flag says the ranking can no longer change, every
 * racer is done, or every racer still going has been offline for at least
 * OFFLINE_GRACE_MS (so a dropped phone never holds the room hostage).
 *
 * @param {object} p
 * @param {string[]} p.racers
 * @param {(id: string) => boolean} p.isDone
 * @param {(id: string) => number|null} [p.offlineSince] - ms the racer was
 *   first seen offline (continuously), or null while online.
 * @param {number|null} p.endsAt
 * @param {number} p.now
 * @param {boolean} [p.decided]
 */
export function canEndRace({ racers, isDone, offlineSince = () => null, endsAt, now, decided = false }) {
  const list = racers || []
  if (list.length === 0) return true
  if (endsAt != null && now >= endsAt) return true
  if (decided) return true
  const pending = list.filter(id => !isDone(id))
  if (pending.length === 0) return true
  return pending.every(id => {
    const since = offlineSince(id)
    return since != null && now - since >= OFFLINE_GRACE_MS
  })
}

/**
 * Lobby / rematch readiness: every online seated player is ready and at least
 * RACE_MIN_PLAYERS are seated online. Offline seats never block a start.
 */
export function allReady(players, readyIds) {
  const ready = new Set(readyIds || [])
  const online = seatedIds(players).filter(id => isSeatOnline(players, id))
  return online.length >= RACE_MIN_PLAYERS && online.every(id => ready.has(id))
}

/** Racers for a new round: the online seats (an offline seat would only DNF). */
export function rosterForStart(players, starterId = null) {
  return seatedIds(players).filter(id => id === starterId || isSeatOnline(players, id))
}

/** A random 31-bit seed for a round's shared content. */
export function newRaceSeed(rng = Math.random) {
  return Math.floor(rng() * 2 ** 31)
}

/**
 * Deterministic fraction in [0, 1) from (seed, index, slot) — every client
 * derives the same value, so seeded content (delays, target positions) is
 * identical for all racers without shipping it through Firebase.
 */
export function seededFraction(seed, index, slot = 0) {
  let h = ((Number(seed) | 0) + Math.imul(index | 0, 1000003) + Math.imul(slot | 0, 999983)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32
}

/** Ordinal label for a rank: 1 → '1ST', 2 → '2ND', 11 → '11TH'. */
export function ordinal(rank) {
  const n = Math.floor(Number(rank))
  if (!Number.isFinite(n) || n < 1) return '—'
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' }[n % 10] || 'TH')
  return `${n}${suffix}`
}

/** Normalize a stored raceResult (Firebase may drop empty maps/arrays). */
export function normalizeRaceResult(raw) {
  if (!isObj(raw)) return null
  const order = Array.isArray(raw.order)
    ? raw.order.filter(Boolean)
    : isObj(raw.order)
      ? Object.keys(raw.order).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b).map(k => raw.order[k]).filter(Boolean)
      : []
  return {
    roundId: raw.roundId ?? null,
    gameType: raw.gameType ?? null,
    order,
    ranks: isObj(raw.ranks) ? raw.ranks : {},
    scores: isObj(raw.scores) ? raw.scores : {},
    dnf: isObj(raw.dnf) ? raw.dnf : {},
    points: isObj(raw.points) ? raw.points : {},
    at: raw.at ?? null,
  }
}

// ── Room transitions (pure; run inside runTransaction on games/{id}) ──────
// Each returns the next room object, or undefined to abort the transaction.

/** Is the match decided (someone reached RACE_MATCH_WINS)? */
export function isMatchOver(room) {
  return matchChampions(room?.scores).length > 0
}

/**
 * Start the next round: a fresh seeded round for every online seat, status
 * 'playing', the previous result cleared. Refused while a round is live, once
 * the match is over (NEW MATCH first), with fewer than RACE_MIN_PLAYERS online
 * seats, or — unless `force` (the coordinator's START NOW) — before every
 * online seat is ready. `seen` ({ deck, index }) records a deck card in the
 * room's seen history (see seenHistory.js).
 */
export function startRaceRound(cur, {
  gameType, starterId = null, force = false, now, id, seed, durationMs, extras = {}, seen = null,
}) {
  if (!isObj(cur) || cur.gameType !== gameType || cur.status === 'playing') return undefined
  if (cur.status === 'finished' && isMatchOver(cur)) return undefined
  if (!force && !allReady(cur.players, flaggedIds(cur.round?.ready))) return undefined
  const racers = rosterForStart(cur.players, starterId)
  if (racers.length < RACE_MIN_PLAYERS) return undefined
  const round = buildRaceRound({ id, gameType, racers, now, seed, durationMs, extras })
  // nightMark: the night recorder's "already counted" signature (nightLogic.js)
  // — a fresh round must never inherit it.
  const next = {
    ...cur, status: 'playing', winner: null, raceResult: null, proposal: null, nightMark: null, round,
    lastActivityAt: Math.floor(now),
  }
  if (seen && Number.isInteger(seen.index) && seen.deck) {
    const seenRoot = isObj(cur.seen) ? cur.seen : {}
    next.seen = { ...seenRoot, [seen.deck]: markSeen(seenRoot[seen.deck], [seen.index]) }
  }
  return next
}

/**
 * Toggle `me`'s ready flag (lobby READY / results PLAY AGAIN). Only seated
 * players, never while a round is live or once the match is over.
 */
export function toggleRaceReady(cur, me, gameType) {
  if (!isObj(cur) || cur.gameType !== gameType || cur.status === 'playing') return undefined
  if (!me || !isObj(cur.players?.[me])) return undefined
  if (cur.status === 'finished' && isMatchOver(cur)) return undefined
  const round = isObj(cur.round) ? { ...cur.round } : {}
  const ready = { ...(isObj(round.ready) ? round.ready : {}) }
  if (ready[me]) delete ready[me]
  else ready[me] = true
  round.ready = ready
  return { ...cur, round }
}

/**
 * End the live round `roundId` and rank it — only when canEndRace agrees (or
 * `force`: the coordinator's END ROUND with timers off). `entryOf(stats,
 * round)` / `isDone(stats)` / `decidedBy(statsById, racers)` come from the
 * game's logic module.
 */
export function finishRaceRound(cur, {
  gameType, roundId, now, entryOf, isDone = () => false, decidedBy = null,
  offlineSince = () => null, force = false,
}) {
  if (!isObj(cur) || cur.status !== 'playing' || cur.gameType !== gameType) return undefined
  const r = normalizeRaceRound(cur.round)
  if (!r || !r.id || r.id !== roundId) return undefined
  const ok = force || canEndRace({
    racers: r.racers,
    isDone: (id) => isDone(r.stats[id]),
    offlineSince,
    endsAt: r.endsAt,
    now,
    decided: !!decidedBy?.(r.stats, r.racers),
  })
  if (!ok) return undefined
  const entries = r.racers.map(id => ({ id, ...entryOf(r.stats[id], r) }))
  return applyRaceFinish(cur, buildRaceResult({ roundId: r.id, gameType, entries, now }))
}

/** Ids sharing their rank with someone else (for "=2ND" labels). */
export function tiedIds(ranks) {
  const count = {}
  for (const r of Object.values(ranks || {})) count[r] = (count[r] || 0) + 1
  return new Set(Object.entries(ranks || {}).filter(([, r]) => count[r] > 1).map(([id]) => id))
}
