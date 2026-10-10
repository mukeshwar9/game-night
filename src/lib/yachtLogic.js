// @ts-check
// yachtLogic.js — pure Yacht (five dice, three rolls, thirteen boxes). No DOM,
// no Firebase, no React.
//
// The whole match lives in one `round` object, written under the room's
// `round` node with y-prefixed keys:
//   ySeats      uid[]            turn order (join order at START)
//   yTurn       number           index into ySeats
//   yDice       number[5]        0 = not rolled yet this turn
//   yHeld       number[5]        1 = kept for the next roll
//   yRollsLeft  number           3 at the start of a turn
//   ySeed       string           the match's roll seed
//   yRollIndex  number           how many rolls have been resolved
//   yReq        { i, by, at }    a roll request stamped with server time
//   yLastReq    { i, at }        the request the current dice came from
//   ySheets     { uid: { boxId: points } }
//   yLast       { by, box, pts } the last box scored (for the announce)
//
// A roll is requested with the server's clock and resolved from
// (seed, roll index, server time), so the roller cannot choose the faces and
// every other client can recompute them (lastRollMatches).

import { rollFaces } from './diceLogic'

export const DICE = 5
export const ROLLS_PER_TURN = 3
export const UPPER_BONUS = 35
export const UPPER_BONUS_AT = 63
export const FULL_HOUSE_PTS = 25
export const SHORT_RUN_PTS = 30
export const LONG_RUN_PTS = 40
export const YACHT_PTS = 50
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4
// An away player's turn is passed after this long; they score 0 in a box.
export const YACHT_AWAY_GRACE_MS = 20000

/** The thirteen boxes, in sheet order. The first six are the number boxes. */
export const BOXES = [
  { id: 'ones', label: 'ONES', face: 1 },
  { id: 'twos', label: 'TWOS', face: 2 },
  { id: 'threes', label: 'THREES', face: 3 },
  { id: 'fours', label: 'FOURS', face: 4 },
  { id: 'fives', label: 'FIVES', face: 5 },
  { id: 'sixes', label: 'SIXES', face: 6 },
  { id: 'k3', label: '3 OF A KIND' },
  { id: 'k4', label: '4 OF A KIND' },
  { id: 'fh', label: 'FULL HOUSE' },
  { id: 'sr', label: 'SHORT RUN' },
  { id: 'lr', label: 'LONG RUN' },
  { id: 'y', label: 'YACHT' },
  { id: 'ch', label: 'CHANCE' },
]
const BOX_IDS = BOXES.map((b) => b.id)
const isFace = (v) => Number.isInteger(v) && v >= 1 && v <= 6

/** Points `dice` would score in box `id`. Dice not rolled yet score nothing. */
export function scoreBox(id, dice) {
  if (!Array.isArray(dice) || dice.length !== DICE || !dice.every(isFace)) return 0
  const n = [0, 0, 0, 0, 0, 0, 0]
  let sum = 0
  for (const v of dice) { n[v] += 1; sum += v }
  const box = BOXES.find((b) => b.id === id)
  if (!box) return 0
  if (box.face) return n[box.face] * box.face
  const most = Math.max(...n)
  const has = (faces) => faces.every((f) => n[f] > 0)
  switch (id) {
    case 'k3': return most >= 3 ? sum : 0
    case 'k4': return most >= 4 ? sum : 0
    case 'fh': return n.includes(3) && n.includes(2) ? FULL_HOUSE_PTS : 0
    case 'sr': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? SHORT_RUN_PTS : 0
    case 'lr': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? LONG_RUN_PTS : 0
    case 'y': return most === DICE ? YACHT_PTS : 0
    default: return sum // chance
  }
}

/** A sheet as Firebase returns it (missing, or with junk) → { boxId: points }. */
export function normalizeSheet(raw) {
  const sheet = {}
  if (raw && typeof raw === 'object') {
    for (const id of BOX_IDS) if (Number.isFinite(raw[id])) sheet[id] = raw[id]
  }
  return sheet
}

/** Sheet totals: the number boxes, the bonus they earn, and the grand total. */
export function sheetTotals(rawSheet) {
  const sheet = normalizeSheet(rawSheet)
  let upper = 0
  let lower = 0
  BOXES.forEach((b, i) => { const v = sheet[b.id] ?? 0; if (i < 6) upper += v; else lower += v })
  const bonus = upper >= UPPER_BONUS_AT ? UPPER_BONUS : 0
  return { upper, bonus, total: upper + bonus + lower, filled: Object.keys(sheet).length }
}

export const sheetFull = (rawSheet) => Object.keys(normalizeSheet(rawSheet)).length === BOXES.length

/** The open box worth the most with these dice, or null when every open box scores 0. */
export function bestBox(rawSheet, dice) {
  const sheet = normalizeSheet(rawSheet)
  let best = null
  let top = 0
  for (const id of BOX_IDS) {
    if (sheet[id] != null) continue
    const v = scoreBox(id, dice)
    if (v > top) { top = v; best = id }
  }
  return best
}

// Firebase returns a real array or a numeric-keyed object depending on
// sparsity; map by explicit key so values never shift index.
function fixedArray(raw, length, fallback = 0) {
  const out = Array(length).fill(fallback)
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const i = parseInt(k, 10)
      if (i >= 0 && i < length && Number.isFinite(v)) out[i] = v
    }
  }
  return out
}

/** The round as the page should read it: fixed-length arrays, a sheet per seat. */
export function normalizeRound(raw) {
  if (!raw || typeof raw !== 'object' || !raw.ySeats) return null
  const seats = Object.entries(raw.ySeats)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([, uid]) => uid)
    .filter((uid) => typeof uid === 'string')
  const sheets = {}
  for (const uid of seats) sheets[uid] = normalizeSheet(raw.ySheets?.[uid])
  const turn = Number.isInteger(raw.yTurn) && raw.yTurn >= 0 && raw.yTurn < seats.length ? raw.yTurn : 0
  return {
    seats,
    turn,
    dice: fixedArray(raw.yDice, DICE).map((v) => (isFace(v) ? v : 0)),
    held: fixedArray(raw.yHeld, DICE).map((v) => (v ? 1 : 0)),
    rollsLeft: Number.isInteger(raw.yRollsLeft) ? Math.max(0, Math.min(ROLLS_PER_TURN, raw.yRollsLeft)) : ROLLS_PER_TURN,
    seed: typeof raw.ySeed === 'string' ? raw.ySeed : '',
    rollIndex: Number.isInteger(raw.yRollIndex) ? raw.yRollIndex : 0,
    req: raw.yReq && typeof raw.yReq === 'object' ? raw.yReq : null,
    lastReq: raw.yLastReq && typeof raw.yLastReq === 'object' ? raw.yLastReq : null,
    sheets,
    last: raw.yLast && typeof raw.yLast === 'object' ? raw.yLast : null,
  }
}

const ZEROS = () => Array(DICE).fill(0)

/** A fresh match for these seats (2–4 uids, in turn order). */
export function createRound(seats, seed) {
  const order = seats.slice(0, MAX_PLAYERS)
  return {
    ySeats: order, yTurn: 0, yDice: ZEROS(), yHeld: ZEROS(), yRollsLeft: ROLLS_PER_TURN,
    ySeed: seed, yRollIndex: 0, yReq: null, yLastReq: null, ySheets: {}, yLast: null,
  }
}

/** Whose turn it is (uid), or null. */
export function turnOwner(raw) {
  const r = normalizeRound(raw)
  return r ? r.seats[r.turn] ?? null : null
}

/** The roll request still waiting to be resolved, else null. */
export function pendingRoll(raw) {
  const r = normalizeRound(raw)
  const req = r?.req
  if (!req || req.i !== r.rollIndex || !Number.isFinite(req.at)) return null
  if (req.by !== r.seats[r.turn] || r.rollsLeft <= 0) return null
  return req
}

/** May `uid` ask for a roll right now? */
export function canRoll(raw, uid) {
  const r = normalizeRound(raw)
  return !!r && r.seats[r.turn] === uid && r.rollsLeft > 0 && !pendingRoll(raw) && !r.held.every(Boolean)
}

/**
 * The round after resolving its pending roll: held dice stay, the rest take
 * the faces of (seed, roll index, server time). Null when nothing is pending.
 */
export function resolveRoll(raw) {
  const req = pendingRoll(raw)
  const r = normalizeRound(raw)
  if (!req || !r || !r.seed) return null
  const faces = rollFaces(r.seed, req.i, req.at, DICE)
  const first = r.rollsLeft === ROLLS_PER_TURN
  const dice = r.dice.map((v, k) => (!first && r.held[k] && v ? v : faces[k]))
  return {
    ...raw,
    yDice: dice,
    yHeld: first ? ZEROS() : r.held,
    yRollsLeft: r.rollsLeft - 1,
    yRollIndex: r.rollIndex + 1,
    yLastReq: { i: req.i, at: req.at },
    yReq: null,
    yLast: null,
  }
}

/**
 * Do the dice on the table match the request they came from? Held dice are
 * carried over, so only a changed die is checked against the roll. Null when
 * there is nothing to check; false means the dice were not rolled fairly.
 * `before` is the round as it stood before that roll resolved.
 */
export function lastRollMatches(raw, before) {
  const r = normalizeRound(raw)
  const b = normalizeRound(before)
  if (!r || !b || !r.lastReq || r.rollIndex !== b.rollIndex + 1) return null
  if (r.lastReq.i !== b.rollIndex || !Number.isFinite(r.lastReq.at)) return false
  const faces = rollFaces(b.seed, r.lastReq.i, r.lastReq.at, DICE)
  const first = b.rollsLeft === ROLLS_PER_TURN
  return r.dice.every((v, k) => v === (!first && b.held[k] && b.dice[k] ? b.dice[k] : faces[k]))
}

/** The round with die `k` kept or released. Null when `uid` may not hold now. */
export function toggleHold(raw, uid, k) {
  const r = normalizeRound(raw)
  if (!r || r.seats[r.turn] !== uid || k < 0 || k >= DICE) return null
  // Holding only means something between rolls.
  if (!r.dice[k] || r.rollsLeft <= 0 || r.rollsLeft === ROLLS_PER_TURN || pendingRoll(raw)) return null
  const held = r.held.slice()
  held[k] = held[k] ? 0 : 1
  return { ...raw, yHeld: held }
}

function advance(raw, r, sheets, last) {
  const done = r.seats.every((uid) => sheetFull(sheets[uid]))
  const next = { ...raw, ySheets: sheets, yLast: last, yDice: ZEROS(), yHeld: ZEROS(), yRollsLeft: ROLLS_PER_TURN, yReq: null }
  if (done) return { round: next, result: { winner: winnerOf(r.seats, sheets) } }
  // Pass to the next seat that still has a box to fill.
  let turn = r.turn
  for (let step = 0; step < r.seats.length; step++) {
    turn = (turn + 1) % r.seats.length
    if (!sheetFull(sheets[r.seats[turn]])) break
  }
  return { round: { ...next, yTurn: turn }, result: null }
}

/** The uid with the highest total, or 'draw' when the top score is shared. */
export function winnerOf(seats, sheets) {
  let top = -1
  let who = []
  for (const uid of seats) {
    const t = sheetTotals(sheets?.[uid]).total
    if (t > top) { top = t; who = [uid] } else if (t === top) who.push(uid)
  }
  return who.length === 1 ? who[0] : 'draw'
}

/**
 * `uid` banks the dice in box `id`. Returns { round, result } where result is
 * null or { winner } when that was the last box of the match; null when the
 * move is not legal (not their turn, dice not rolled, box already used).
 */
export function scoreTurn(raw, uid, id) {
  const r = normalizeRound(raw)
  if (!r || r.seats[r.turn] !== uid || !BOX_IDS.includes(id)) return null
  if (r.rollsLeft === ROLLS_PER_TURN || pendingRoll(raw) || r.sheets[uid][id] != null) return null
  const pts = scoreBox(id, r.dice)
  const sheets = { ...r.sheets, [uid]: { ...r.sheets[uid], [id]: pts } }
  return advance(raw, r, sheets, { by: uid, box: id, pts })
}

/**
 * Pass an away player's turn: their first open box takes whatever the dice on
 * the table score there (0 before the first roll), so the match still ends.
 * Null when the player to move is not `uid`.
 */
export function skipTurn(raw, uid) {
  const r = normalizeRound(raw)
  if (!r || r.seats[r.turn] !== uid) return null
  const id = BOX_IDS.find((b) => r.sheets[uid][b] == null)
  if (!id) return null
  const pts = r.rollsLeft === ROLLS_PER_TURN ? 0 : scoreBox(id, r.dice)
  const sheets = { ...r.sheets, [uid]: { ...r.sheets[uid], [id]: pts } }
  return advance(raw, r, sheets, { by: uid, box: id, pts, away: true })
}

// ---------------------------------------------------------------------------
// Bot (solo page). EASY keeps nothing and takes the best box on the table;
// NORMAL keeps its most common face; HARD also chases runs and will not burn a
// high box on a poor roll.
// ---------------------------------------------------------------------------
export const BOT_LEVELS = ['easy', 'normal', 'hard']

/** Which dice the bot keeps before its next roll: number[5] of 0/1. */
export function botHolds(dice, rawSheet, level = 'normal') {
  if (level === 'easy' || !dice.every(isFace)) return ZEROS()
  const sheet = normalizeSheet(rawSheet)
  const n = [0, 0, 0, 0, 0, 0, 0]
  for (const v of dice) n[v] += 1
  if (level === 'hard' && (sheet.lr == null || sheet.sr == null)) {
    // Four of a run in hand: keep one of each and roll for the rest.
    for (const run of [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]]) {
      if (run.filter((f) => n[f] > 0).length >= 4) {
        const seen = new Set()
        return dice.map((v) => (run.includes(v) && !seen.has(v) ? (seen.add(v), 1) : 0))
      }
    }
  }
  // Keep the most common face; among ties prefer the higher face.
  let face = 1
  for (let f = 1; f <= 6; f++) if (n[f] >= n[face]) face = f
  if (n[face] < 2 && level !== 'hard') return ZEROS()
  return dice.map((v) => (v === face ? 1 : 0))
}

/** The box the bot banks. Always an open box. */
export function botBox(dice, rawSheet, level = 'normal') {
  const sheet = normalizeSheet(rawSheet)
  const open = BOX_IDS.filter((id) => sheet[id] == null)
  const best = bestBox(sheet, dice)
  if (level !== 'hard') return best ?? open[0]
  // HARD: weigh each box by how its score compares with a typical one, so a
  // 9 in CHANCE does not beat three sixes in SIXES.
  const par = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17, k3: 20, k4: 12, fh: 20, sr: 24, lr: 26, y: 15, ch: 22 }
  let pick = open[0]
  let top = -Infinity
  for (const id of open) {
    const v = scoreBox(id, dice) - par[id]
    if (v > top) { top = v; pick = id }
  }
  return pick
}
