// One-phone night: a short run of pass-and-play games on a single phone, with
// the standings kept between games. Pure — no DOM, Firebase or React; the page
// (src/pages/LocalNight.jsx) renders it and keeps the night in localStorage.
//
// Local games never report a result (they are plain pass-and-play pages), so the
// group taps who won on the between-games screen. Points reuse the party-room
// night scoring (nightLogic.js): the winner takes NIGHT_POINTS[0], everyone else
// 0, and a draw is DRAW_POINTS for all.
//
// A night is plain JSON:
//   { players: [{ id, name, avatar }], games: [type], results: [{ type, winner }],
//     phase: 'intro' | 'playing' | 'judging', startedAt }
// `winner` is a player id, or null for a draw. The current game is
// games[results.length]; the night is over once every game has a result.

import { rankByScore, placementPoints } from './nightLogic'

export const NIGHT_LENGTHS = [5, 7, 10]
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4
export const DEFAULT_LENGTH = 5
export const NAME_MAX = 10

// Face per seat, from the classic avatar set (any avatar id renders anywhere).
export const SEAT_AVATARS = ['fox', 'owl', 'penguin', 'bear']

const PHASES = ['intro', 'playing', 'judging']

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/** Default seats for a night of `count` players. */
export function defaultPlayers(count) {
  const n = clamp(Math.round(Number(count)) || MIN_PLAYERS, MIN_PLAYERS, MAX_PLAYERS)
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, avatar: SEAT_AVATARS[i] }))
}

/** A trimmed, capped seat name; empty falls back to `fallback`. */
export function cleanName(raw, fallback) {
  const s = typeof raw === 'string' ? [...raw.replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX).join('').trim() : ''
  return s || fallback
}

/**
 * Whether a game can be dealt to `playerCount` people on one phone. `cfg` is the
 * registry entry; `supportsLocal` is `supportsLocalPlay` for it. The generic
 * pass-and-play board seats exactly two; a game with its own page says how many
 * it seats in `localMaxPlayers`. Variant entries (4x4 tic-tac-toe...) are left
 * out so one base game cannot be dealt twice.
 */
export function canDeal(cfg, supportsLocal, playerCount) {
  if (!cfg || !supportsLocal || cfg.variantOf) return false
  if (playerCount <= 2) return true
  return (cfg.localMaxPlayers || 2) >= playerCount
}

/** The registry types that can be dealt to `playerCount` people. */
export function dealPool(configs, supportsLocal, playerCount) {
  return configs.filter(cfg => canDeal(cfg, supportsLocal(cfg.type), playerCount)).map(cfg => cfg.type)
}

/** Fisher-Yates over a copy, with an injectable random source for tests. */
export function shuffle(list, rng = Math.random) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Deals `count` different games from `pool` (fewer when the pool is smaller). */
export function dealGames(pool, count, rng = Math.random) {
  return shuffle([...new Set(pool)], rng).slice(0, Math.max(0, count))
}

/** Replaces the game at `index` with one from `pool` that is not already in the night. */
export function redealOne(games, index, pool, rng = Math.random) {
  const fresh = shuffle(pool.filter(t => !games.includes(t)), rng)[0]
  if (!fresh || index < 0 || index >= games.length) return games
  return games.map((t, i) => (i === index ? fresh : t))
}

export function createNight({ players, games, now = Date.now() }) {
  return { players, games, results: [], phase: 'intro', startedAt: now }
}

export const isFinished = (night) => night.results.length >= night.games.length
export const currentIndex = (night) => night.results.length
export const currentGame = (night) => (isFinished(night) ? null : night.games[night.results.length])

/** Move the night to a phase; ignored once the night is over. */
export function setPhase(night, phase) {
  if (isFinished(night) || !PHASES.includes(phase)) return night
  return { ...night, phase }
}

/**
 * Records who won the current game (a player id, or null for a draw) and goes
 * back to the intro of the next one. Unknown ids and a finished night are
 * ignored so a double tap cannot score twice.
 */
export function recordResult(night, winner) {
  if (isFinished(night)) return night
  if (winner !== null && !night.players.some(p => p.id === winner)) return night
  return {
    ...night,
    results: [...night.results, { type: night.games[night.results.length], winner }],
    phase: 'intro',
  }
}

/** Takes back the last result and puts that game up for judging again. */
export function undoResult(night) {
  if (night.results.length === 0) return night
  return { ...night, results: night.results.slice(0, -1), phase: 'judging' }
}

/** Night points a single game gives each player, in the players' order. */
export function gamePoints(players, winner) {
  const entries = players.map(p => ({ uid: p.id, score: p.id === winner ? 1 : 0 }))
  return placementPoints(rankByScore(entries))
}

/**
 * Standings, best first: points, then wins, then the seat order. Every player is
 * listed from the start (a night with no result yet is all zeros), with `rank`
 * shared by players level on points and wins.
 */
export function standings(night) {
  const rows = night.players.map((p, seat) => ({ ...p, seat, points: 0, wins: 0, played: 0 }))
  for (const r of night.results) {
    for (const pts of gamePoints(night.players, r.winner)) {
      const row = rows.find(x => x.id === pts.uid)
      row.points += pts.points
      row.played += 1
      if (pts.win) row.wins += 1
    }
  }
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins || a.seat - b.seat)
  return rows.map(r => ({
    ...r,
    rank: 1 + rows.filter(o => o.points > r.points || (o.points === r.points && o.wins > r.wins)).length,
  }))
}

/** The player(s) on top once the night is over; empty before that. */
export function champions(night) {
  if (!isFinished(night) || night.games.length === 0) return []
  return standings(night).filter(r => r.rank === 1)
}

/** The player who won game `index`, or null for a draw / a game not played yet. */
export function winnerOf(night, index) {
  const r = night.results[index]
  return r && r.winner ? night.players.find(p => p.id === r.winner) ?? null : null
}

// --- Storage -------------------------------------------------------------------

/**
 * Tolerant read of a stored night: anything malformed is `null` (no night),
 * and results the games list cannot hold are dropped.
 */
export function parseNight(raw) {
  let src = raw
  if (typeof raw === 'string') {
    try { src = JSON.parse(raw) } catch { return null }
  }
  if (!src || typeof src !== 'object' || !Array.isArray(src.players) || !Array.isArray(src.games)) return null
  const players = src.players
    .filter(p => p && typeof p.id === 'string')
    .slice(0, MAX_PLAYERS)
    .map((p, i) => ({ id: p.id, name: cleanName(p.name, `P${i + 1}`), avatar: typeof p.avatar === 'string' ? p.avatar : SEAT_AVATARS[i] }))
  const games = src.games.filter(t => typeof t === 'string' && t).slice(0, Math.max(...NIGHT_LENGTHS))
  if (players.length < MIN_PLAYERS || games.length === 0) return null
  const results = (Array.isArray(src.results) ? src.results : [])
    .slice(0, games.length)
    .map((r, i) => ({ type: games[i], winner: r && players.some(p => p.id === r.winner) ? r.winner : null }))
  const night = {
    players,
    games,
    results,
    phase: PHASES.includes(src.phase) ? src.phase : 'intro',
    startedAt: Number.isFinite(src.startedAt) ? src.startedAt : 0,
  }
  return isFinished(night) ? { ...night, phase: 'intro' } : night
}

export const serializeNight = (night) => JSON.stringify(night)
