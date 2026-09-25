// Pure core of the server-authoritative results pipeline (results.js wires it
// to Firebase). No Firebase, no Node APIs: everything here takes plain room /
// state objects and returns new ones, so it is unit-tested directly
// (test/core.test.js) and bundled by esbuild (build.js) together with the SAME
// src/lib/*Logic.js modules the app plays with — the server recomputes a
// winner with exactly the code that produced it.
//
// Model (per room, stored at results/{gameId}):
//  - A match is an EPOCH. A new epoch opens when the server sees a 2P round
//    start with the scores at 0–0 (room created and joined, NEW MATCH, game
//    switch, winner-stays reseat). Round starts inside a match (PLAY AGAIN)
//    leave the epoch alone.
//  - Every round finish is checked (verifyRound) and recorded once under its
//    signature, so a replayed finish (status flipped back and forth with the
//    same board and scores) is a no-op.
//  - The finish that decides the match (isMatchOver: src/lib/matchRules.js,
//    shared with Game.jsx's recordMatch) closes the epoch and queues ONE credit in
//    `matches/{epoch}`. The Firebase layer applies queued credits to
//    leaderboard/{uid}; each row remembers its last few match keys, so a
//    retried or concurrent application never counts twice (applyCredit).

import { getWinner as getTicTacToeWinner, normalizeBoard } from '../../src/lib/gameLogic'
import { getTicTacToe4Winner } from '../../src/lib/tictactoe4Logic'
import { getConnectFourWinner, CF5 } from '../../src/lib/connectFourLogic'
import { getGomokuWinner, GOMOKU_CELL_COUNT } from '../../src/lib/gomokuLogic'
import { getHexWinner, HEX_CELL_COUNT } from '../../src/lib/hexLogic'
import { getSimWinner, SIM_EDGE_COUNT } from '../../src/lib/simLogic'
import { getReversiWinner, REVERSI_SIZE } from '../../src/lib/reversiLogic'
import { getOrderChaosWinner, OC_CELL_COUNT } from '../../src/lib/orderChaosLogic'
import { matchWinner2P } from '../../src/lib/nightLogic'
import { isSeatOnline } from '../../src/lib/presenceLogic'
import { isMatchFinish } from '../../src/lib/matchRules'

export { matchTargetFor } from '../../src/lib/matchRules'

// How many recent match keys a leaderboard row keeps for idempotency. A
// credit is applied within seconds of the finish, so a handful is plenty.
export const RECENT_KEYS = 16

// ---- Verifiable games ------------------------------------------------------
// Turn-based placement games whose round winner is a pure function of the
// final board (the registry's getWinner, or the winner function its applyMove
// hook calls). Anything not listed here is credited on trust (see README).
//  - size:       board length (normalizeBoard)
//  - alternating one stone per turn, never removed/flipped, so stone counts
//                differ by at most one and the last mover has the extra one
//  - lastMover:  who placed the finishing stone ('winner', or 'loser' in Sim,
//                where completing your own triangle loses)
//  - lineHasLast the finishing stone lies on the returned line/path — any
//                line that existed before it would have ended the round then
//  - gravity:    Connect Four family — no stone floats above an empty cell
export const VERIFIERS = {
  tictactoe: { size: 9, winner: getTicTacToeWinner, alternating: true, lastMover: 'winner', lineHasLast: true },
  tictactoe4: { size: 16, winner: getTicTacToe4Winner, alternating: true, lastMover: 'winner', lineHasLast: true },
  connectfour: {
    size: 42, winner: (b) => getConnectFourWinner(b),
    alternating: true, lastMover: 'winner', lineHasLast: true, gravity: { cols: 7, rows: 6 },
  },
  connectfour5: {
    size: 63, winner: (b) => getConnectFourWinner(b, CF5),
    alternating: true, lastMover: 'winner', lineHasLast: true, gravity: { cols: CF5.cols, rows: CF5.rows },
  },
  gomoku: { size: GOMOKU_CELL_COUNT, winner: getGomokuWinner, alternating: true, lastMover: 'winner', lineHasLast: true },
  // The swap (pie) rule recolours the lone opening stone, which keeps the
  // alternation invariant (the swapper simply becomes the side with the
  // extra stone).
  gomokuswap: { size: GOMOKU_CELL_COUNT, winner: getGomokuWinner, alternating: true, lastMover: 'winner', lineHasLast: true },
  hex: { size: HEX_CELL_COUNT, winner: getHexWinner, alternating: true, lastMover: 'winner', lineHasLast: true },
  sim: { size: SIM_EDGE_COUNT, winner: getSimWinner, alternating: true, lastMover: 'loser', lineHasLast: true },
  // Flips (Reversi) and shared letters (Order & Chaos) break the stone-count
  // invariants: only the board verdict itself is checked.
  reversi: { size: REVERSI_SIZE, winner: getReversiWinner },
  orderchaos: { size: OC_CELL_COUNT, winner: getOrderChaosWinner },
}

// 2P games with no winner/loser (both players share the result).
const COOP_GAMES = new Set(['wordcoop'])

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const other = (sym) => (sym === 'X' ? 'O' : 'X')
const isSide = (v) => v === 'X' || v === 'O'

/**
 * True when this finished room ends the match — src/lib/matchRules.js, the
 * same rule Game.jsx records the match (and the night scoreboard) on.
 */
export function isMatchOver(room) {
  return !!room && room.status === 'finished' && isMatchFinish(room)
}

/** The match result: 'X' | 'O' | 'draw' (same rule as the night scoreboard). */
export const matchOutcome = (room) => matchWinner2P(room)

/**
 * The two seated uids of a 2P room, or null when the room has no two distinct
 * seated players (party rooms are keyed by uid, not X/O, and are skipped).
 */
export function twoPlayerSeats(room) {
  if (!room || COOP_GAMES.has(room.gameType)) return null
  const x = room.players?.X?.playerId
  const o = room.players?.O?.playerId
  if (typeof x !== 'string' || typeof o !== 'string' || !x || !o || x === o) return null
  return { x, o }
}

// ---- Hashing ---------------------------------------------------------------
// FNV-1a, 64-bit, base36: stable short keys for round signatures and match
// keys (safe as RTDB keys, and a match key on a public leaderboard row does
// not reveal the room id).
export function shortHash(str) {
  let h = 0xcbf29ce484222325n
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i))
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return h.toString(36)
}

/** Per-uid idempotency key of one room's match epoch. */
export const matchKey = (gameId, epoch) => shortHash(`match|${gameId}|${epoch}`)

/** Identity of one finished round: same board, winner and scores = same round. */
export function roundSignature(room) {
  const cfg = VERIFIERS[room?.gameType]
  const board = cfg ? normalizeBoard(room.board, cfg.size).join(',') : ''
  return shortHash([
    room?.gameType, room?.winner, num(room?.scores?.X), num(room?.scores?.O), board, room?.lastMove ?? '',
  ].join('|'))
}

// ---- Round verification ----------------------------------------------------

function countOf(board, sym) {
  let n = 0
  for (const c of board) if (c === sym) n++
  return n
}

function floats(board, { cols, rows }) {
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r * cols + c] && !board[(r + 1) * cols + c]) return true
    }
  }
  return false
}

/**
 * Check one finished round of a 2P room.
 * @returns {{ verdict: 'verified'|'forfeit'|'unverified'|'trusted'|'rejected', reason?: string }}
 *  - verified:   a registry game whose board shows exactly the claimed result
 *  - forfeit:    the board is undecided but the loser's seat is offline/left —
 *                the CLAIM WIN path (useAbandonRecovery)
 *  - unverified: the board is undecided and the loser is online; not counted
 *  - trusted:    a custom / real-time game; nothing on the room to recompute
 *  - rejected:   the claim contradicts the board (or the board is impossible);
 *                taints the whole match
 */
export function verifyRound(room) {
  const claimed = room?.winner
  if (!isSide(claimed) && claimed !== 'draw') return { verdict: 'rejected', reason: 'no winner' }
  const cfg = VERIFIERS[room.gameType]
  if (!cfg) return { verdict: 'trusted' }

  const board = normalizeBoard(room.board, cfg.size)
  const result = cfg.winner(board)
  if (!result) {
    if (isSide(claimed) && !isSeatOnline(room.presence?.[other(claimed)])) return { verdict: 'forfeit' }
    // Not provably false (the loser may have reconnected since claiming), so
    // no taint — but the round does not count toward the match either.
    return { verdict: 'unverified', reason: 'board is undecided' }
  }
  if (result.winner !== claimed) return { verdict: 'rejected', reason: `board says ${result.winner}` }
  if (!isSide(claimed)) return { verdict: 'verified' }

  if (cfg.alternating) {
    const mover = cfg.lastMover === 'loser' ? other(claimed) : claimed
    const moverCount = countOf(board, mover)
    const restCount = countOf(board, other(mover))
    if (moverCount !== restCount && moverCount !== restCount + 1) {
      return { verdict: 'rejected', reason: 'impossible stone count' }
    }
    const last = room.lastMove
    if (!Number.isInteger(last) || last < 0 || last >= cfg.size || board[last] !== mover) {
      return { verdict: 'rejected', reason: 'last move is not the finishing stone' }
    }
    if (cfg.lineHasLast && !(result.line || []).includes(last)) {
      return { verdict: 'rejected', reason: 'finishing stone is off the winning line' }
    }
  }
  if (cfg.gravity && floats(board, cfg.gravity)) return { verdict: 'rejected', reason: 'floating stone' }
  return { verdict: 'verified' }
}

// ---- Results state (results/{gameId}) ---------------------------------------
// { epoch, open, x, o, gameType, startedAt, updatedAt,
//   rounds: { [sig]: { w, v, at } },  tainted: string|null,
//   closedSig, matches: { [epoch]: { winner, x, o, gameType, verdict, at, applied } } }

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    ...raw,
    epoch: num(raw.epoch),
    open: raw.open === true,
    rounds: raw.rounds && typeof raw.rounds === 'object' ? { ...raw.rounds } : {},
    matches: raw.matches && typeof raw.matches === 'object' ? { ...raw.matches } : {},
  }
}

const sameMatch = (state, seats, gameType) =>
  !!state && state.x === seats.x && state.o === seats.o && state.gameType === gameType

function openEpoch(state, seats, gameType, now) {
  return {
    epoch: (state?.epoch ?? 0) + 1,
    open: true,
    x: seats.x,
    o: seats.o,
    gameType: gameType || null,
    startedAt: now,
    updatedAt: now,
    rounds: {},
    tainted: null,
    closedSig: null,
    matches: state?.matches ?? {},
  }
}

const hasDecidedRound = (state) =>
  Object.values(state.rounds).some(r => isSide(r?.w) || r?.v === 'stale')

/**
 * A round started (status -> 'playing'). Opens a new epoch when the scores
 * are 0–0 and the open epoch is not already a fresh one for these seats and
 * game. Returns the new state, or null when nothing changes.
 */
export function reduceStart(prev, room, now) {
  const seats = twoPlayerSeats(room)
  if (!seats || room.status !== 'playing') return null
  if (num(room.scores?.X) + num(room.scores?.O) !== 0) return null
  const state = normalizeState(prev)
  if (state && state.open && sameMatch(state, seats, room.gameType) && !hasDecidedRound(state)) return null
  return openEpoch(state, seats, room.gameType, now)
}

/**
 * A round finished (status -> 'finished'). `room` is the room as read by the
 * function; `staleKey` is set (and `room` only used for its seats) when the
 * room had already moved on by the time it was read.
 * @returns {{ state: object|null, note: string, credit?: object }} state is
 *   null when nothing changes.
 */
export function reduceFinish(prev, room, { now, staleKey = null, verdict = null }) {
  const seats = twoPlayerSeats(room)
  if (!seats) return { state: null, note: 'not a 2P room' }
  let state = normalizeState(prev)

  if (staleKey) {
    // The round's board is gone; count it as a round of unknown outcome, but
    // only toward the match it belonged to.
    if (!state || !state.open || !sameMatch(state, seats, room.gameType) || state.rounds[staleKey]) {
      return { state: null, note: 'stale round ignored' }
    }
    state.rounds[staleKey] = { w: null, v: 'stale', at: now }
    state.updatedAt = now
    return { state, note: 'stale round' }
  }

  // No epoch for this match (a start we never saw: a room in play when this
  // function was deployed, or an out-of-order event) — open one now. The
  // round tally below still has to be earned inside it.
  if (!state || !sameMatch(state, seats, room.gameType)) state = openEpoch(state, seats, room.gameType, now)

  const sig = roundSignature(room)
  if (!state.open) {
    return { state: null, note: state.closedSig === sig ? 'replay of the deciding round' : 'match already closed' }
  }
  if (state.rounds[sig]) return { state: null, note: 'replayed round' }

  const v = verdict ?? verifyRound(room)
  state.rounds[sig] = { w: room.winner ?? null, v: v.verdict, at: now }
  state.updatedAt = now
  if (v.verdict === 'rejected' && !state.tainted) state.tainted = v.reason || 'rejected round'

  if (!isMatchOver(room)) return { state, note: `round ${v.verdict}` }

  // The deciding round: close the epoch either way, so it is judged once.
  state.open = false
  state.closedSig = sig
  const winner = matchOutcome(room)
  const refusal = matchRefusal(state, room, winner, v)
  if (refusal) {
    state.matches[state.epoch] = { winner, x: seats.x, o: seats.o, gameType: room.gameType, verdict: 'rejected', reason: refusal, at: now, applied: true }
    return { state, note: `match rejected: ${refusal}` }
  }
  const credit = {
    winner, x: seats.x, o: seats.o, gameType: room.gameType, verdict: v.verdict, at: now, applied: false,
    names: { X: seatName(room.players.X), O: seatName(room.players.O) },
    avatars: { X: seatAvatar(room.players.X), O: seatAvatar(room.players.O) },
  }
  state.matches[state.epoch] = credit
  return { state, note: 'match credited', credit: { epoch: state.epoch, ...credit } }
}

// Why a deciding round must not be credited, or null.
function matchRefusal(state, room, winner, v) {
  if (state.tainted) return `tainted: ${state.tainted}`
  if (v.verdict === 'rejected') return v.reason || 'rejected round'
  // Board games: the match winner must have won enough verified (or
  // forfeited) rounds in this epoch to account for their score — scores are
  // plain client writes, so a jump straight to the target is refused. A round
  // the server saw finish but could not read in time ('stale') counts for
  // either side.
  if (VERIFIERS[room.gameType] && isSide(winner)) {
    const rounds = Object.values(state.rounds)
    const won = rounds.filter(r => r.w === winner && (r.v === 'verified' || r.v === 'forfeit')).length
    const stale = rounds.filter(r => r.v === 'stale').length
    if (won + stale < num(room.scores?.[winner])) return 'score not backed by verified rounds'
  }
  return null
}

const clip = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '')
const seatName = (p) => clip(p?.name, 24) || null
const seatAvatar = (p) => clip(p?.avatar, 32) || null

/** Queued credits (closed matches not yet written to the leaderboard). */
export function pendingCredits(rawState) {
  const matches = rawState?.matches && typeof rawState.matches === 'object' ? rawState.matches : {}
  return Object.entries(matches)
    .filter(([, m]) => m && m.applied === false)
    .map(([epoch, m]) => ({ epoch: Number(epoch), ...m }))
}

// ---- Leaderboard rows (leaderboard/{uid}) ----------------------------------

function recentList(raw) {
  if (Array.isArray(raw)) return raw.filter(k => typeof k === 'string')
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, k]) => k)
      .filter(k => typeof k === 'string')
  }
  return []
}

/**
 * The leaderboard row after crediting one match, for a transaction on
 * leaderboard/{uid}. Returns undefined (abort: nothing to do) when this match
 * key was already applied. Rows not written by the server (`verified !== true`
 * — the old client-written mirror) start from zero.
 *
 * `verifiedWins` repeats `wins` on purpose: it is the leaderboard's sort key.
 * Legacy rows never have it, so they sort below every server-written row and
 * can't crowd them out of a top-N query even while they are kept.
 * @param {object|null} row
 * @param {{ key: string, outcome: 'win'|'loss'|'draw', name?: string|null, avatar?: string|null, now: number }} credit
 */
export function applyCredit(row, { key, outcome, name, avatar, now }) {
  const base = row && typeof row === 'object' && row.verified === true ? row : null
  const recent = recentList(base?.recent)
  if (recent.includes(key)) return undefined
  const won = outcome === 'win'
  const streak = won ? num(base?.streak) + 1 : 0
  const wins = num(base?.wins) + (won ? 1 : 0)
  return {
    name: clip(name, 24) || clip(base?.name, 24) || 'PLAYER',
    avatar: clip(avatar, 32) || base?.avatar || null,
    wins,
    verifiedWins: wins,
    games: num(base?.games) + 1,
    streak,
    bestStreak: Math.max(num(base?.bestStreak), streak),
    verified: true,
    recent: [key, ...recent].slice(0, RECENT_KEYS),
    updatedAt: now,
  }
}

/** 'win' | 'loss' | 'draw' for the seat `sym` given a match result. */
export const outcomeFor = (winner, sym) => (winner === 'draw' ? 'draw' : winner === sym ? 'win' : 'loss')

// ---- Error telemetry retention (errors/{day}) --------------------------------
// src/lib/telemetry.js buckets reports under UTC day keys ('2026-09-26', its
// dayKey). ISO dates sort lexicographically in date order, so "older than the
// cutoff" is a plain key comparison — and an orderByKey query.

export const ERROR_RETENTION_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** telemetry.js's dayKey: the UTC calendar day of `ts`. */
export const utcDayKey = (ts) => new Date(ts).toISOString().slice(0, 10)

/**
 * The oldest errors/{day} key to keep: today plus the previous
 * `keepDays - 1` UTC days survive (the same days telemetry's lastDayKeys(14)
 * lists); every earlier bucket is deleted.
 */
export function errorsCutoffKey(now, keepDays = ERROR_RETENTION_DAYS) {
  return utcDayKey(now - (Math.max(1, keepDays) - 1) * DAY_MS)
}

/** True for a well-formed day key that sorts before the cutoff. */
export const isExpiredErrorDay = (key, cutoffKey) => DAY_KEY.test(key) && key < cutoffKey
