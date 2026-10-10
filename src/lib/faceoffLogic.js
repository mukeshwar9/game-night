// @ts-check
// faceoffLogic.js — pure Face Off (guess the hidden face). No DOM, no
// Firebase, no React.
//
// Both players see the same 24 faces, dealt from the room's seed out of the
// avatar kit. Each secretly picks one and publishes only a salted commitment
// (commit.js). On your turn you ask one yes/no question about your rival's
// face; their client answers from the face's real traits. Faces the answer
// rules out flip down. Instead of asking you may name the face: right wins
// the round, wrong loses it.
//
// The round lives under the room's `round` node with f-prefixed keys:
//   fSeed      string                 the deal
//   fTurn      'X' | 'O'              who asks next
//   fCommit    { X, O }               sha256(index + salt) of each secret
//   fAsks      [{ by, q, a }]         append-only; `a` (0/1) arrives from the other client
//   fName      { by, i }              a naming guess; ends the asking
//   fReveal    { X: { i, salt }, O }  both secrets, published once fName exists
//
// Nothing stops a tampered client from answering falsely while the round is
// live, so the end is checked: every answer a player gave must match the face
// they reveal, and the reveal must match their commitment (judge()).

import { mulberry32 } from './detMath'
import { randomLook, encodeAvatar } from './avatarKit'
import { NAME_POOL } from './nameTagsLogic'

export const FACE_COUNT = 24
export const GRID_COLS = 6

/** The six questions. `id` is also the trait key on a face. */
export const QUESTIONS = [
  { id: 'hat', label: 'HAT?' },
  { id: 'glasses', label: 'GLASSES?' },
  { id: 'beard', label: 'BEARD?' },
  { id: 'long', label: 'LONG HAIR?' },
  { id: 'dark', label: 'DARK HAIR?' },
  { id: 'smile', label: 'SMILING?' },
]
const Q_IDS = QUESTIONS.map((q) => q.id)

// Kit parts chosen so each trait reads at a glance on a 48 px bust: no hats
// that hide the hair, no in-between hair colours, no ambiguous mouths.
const PARTS = {
  hat: { 1: ['cap', 'crown', 'party', 'beret'], 0: ['none'] },
  glasses: { 1: ['round', 'square', 'shades'], 0: ['none'] },
  beard: { 1: ['beard', 'goatee'], 0: ['none'] },
  long: { 1: ['long', 'wavy', 'braids'], 0: ['crop', 'spiky', 'sweep', 'pixie'] },
  dark: { 1: ['hblack', 'hdark'], 0: ['hblonde', 'hplat', 'hginger'] },
  smile: { 1: ['smile', 'grin'], 0: ['flat', 'frown', 'o'] },
}
const PLAIN_EYES = ['bright', 'dots', 'calm', 'happy', 'lashes']
const LOOK_KEY = { hat: 'hat', glasses: 'glasses', beard: 'beard', long: 'hair', dark: 'hairColor', smile: 'mouth' }

function seedInt(seed) {
  let h = 2166136261
  const s = String(seed)
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function shuffled(arr, rand) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/**
 * The 24 faces for a seed: `{ name, avatar, traits }`, the same on every
 * client. No two faces share all six traits, and every question splits the
 * board at least 8 / 16, so no question is a wasted turn on a fresh board.
 * @returns {Array<{ name: string, avatar: string, traits: Record<string, 0 | 1> }>}
 */
export function dealFaces(seed) {
  const rand = mulberry32(seedInt(seed))
  // Pick 24 distinct trait combinations out of the 64, re-drawing until each
  // trait is reasonably balanced.
  let combos = []
  for (let attempt = 0; attempt < 200; attempt++) {
    combos = shuffled(Array.from({ length: 64 }, (_, n) => n), rand).slice(0, FACE_COUNT)
    const ok = Q_IDS.every((_, bit) => {
      const yes = combos.filter((n) => (n >> bit) & 1).length
      return yes >= 8 && yes <= 16
    })
    if (ok) break
  }
  const names = shuffled(NAME_POOL, rand).slice(0, FACE_COUNT).sort()
  const pick = (/** @type {string[]} */ a) => a[Math.floor(rand() * a.length)]
  return combos.map((n, i) => {
    /** @type {Record<string, 0 | 1>} */
    const traits = {}
    // Plain eyes only: heart or starry eyes read as glasses at this size.
    const look = /** @type {any} */ ({ ...randomLook(rand), eyes: pick(PLAIN_EYES), extra: 'none', pet: 'none', frame: 'none' })
    Q_IDS.forEach((id, bit) => {
      const v = /** @type {0 | 1} */ ((n >> bit) & 1)
      traits[id] = v
      look[LOOK_KEY[id]] = pick(PARTS[id][v])
    })
    return { name: names[i], avatar: encodeAvatar(look), traits }
  })
}

/** 1 or 0: does face `i` have trait `q`? Null for anything out of range. */
export function traitOf(faces, i, q) {
  const f = faces[i]
  return f && Q_IDS.includes(q) ? f.traits[q] : null
}

const isSide = (s) => s === 'X' || s === 'O'
export const otherSide = (s) => (s === 'X' ? 'O' : 'X')

/** The round as the page should read it (Firebase arrays arrive sparse). */
export function normalizeRound(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const asks = []
  if (r.fAsks && typeof r.fAsks === 'object') {
    for (const [k, v] of Object.entries(r.fAsks)) {
      const i = parseInt(k, 10)
      if (i >= 0 && v && isSide(v.by) && Q_IDS.includes(v.q)) asks[i] = { by: v.by, q: v.q, a: v.a === 0 || v.a === 1 ? v.a : null }
    }
  }
  const reveal = {}
  for (const s of ['X', 'O']) {
    const v = r.fReveal?.[s]
    reveal[s] = v && Number.isInteger(v.i) && typeof v.salt === 'string' ? { i: v.i, salt: v.salt } : null
  }
  const name = r.fName && isSide(r.fName.by) && Number.isInteger(r.fName.i) ? { by: r.fName.by, i: r.fName.i } : null
  return {
    seed: typeof r.fSeed === 'string' ? r.fSeed : '',
    turn: isSide(r.fTurn) ? r.fTurn : 'X',
    commit: { X: typeof r.fCommit?.X === 'string' ? r.fCommit.X : null, O: typeof r.fCommit?.O === 'string' ? r.fCommit.O : null },
    // A hole in the log would shift every later answer; stop at the first gap.
    asks: asks.slice(0, asks.findIndex((a) => a === undefined) === -1 ? asks.length : asks.findIndex((a) => a === undefined)),
    name,
    reveal,
  }
}

/**
 * Where the round is:
 *   'pick'   someone has not committed a secret face yet
 *   'answer' the last question is waiting for its answer
 *   'ask'    the player to move may ask or name
 *   'reveal' a face was named; waiting for both secrets
 *   'judge'  both secrets are in; the result can be decided
 */
export function phaseOf(raw) {
  const r = normalizeRound(raw)
  if (!r.commit.X || !r.commit.O) return 'pick'
  if (r.name) return r.reveal.X && r.reveal.O ? 'judge' : 'reveal'
  const last = r.asks[r.asks.length - 1]
  return last && last.a == null ? 'answer' : 'ask'
}

/** The question waiting for an answer, with its index in the log, or null. */
export function pendingAsk(raw) {
  const r = normalizeRound(raw)
  const i = r.asks.length - 1
  return i >= 0 && r.asks[i].a == null && !r.name ? { ...r.asks[i], index: i } : null
}

/** Questions `side` has already asked. */
export function askedBy(raw, side) {
  return normalizeRound(raw).asks.filter((a) => a.by === side).map((a) => a.q)
}

/** May `side` ask `q` now? */
export function canAsk(raw, side, q) {
  const r = normalizeRound(raw)
  return phaseOf(raw) === 'ask' && r.turn === side && Q_IDS.includes(q) && !askedBy(raw, side).includes(q)
}

/** May `side` name a face now? */
export function canName(raw, side) {
  return phaseOf(raw) === 'ask' && normalizeRound(raw).turn === side
}

/** Faces still standing on `side`'s board: every answered question of theirs agrees. */
export function remainingFor(faces, raw, side) {
  const mine = normalizeRound(raw).asks.filter((a) => a.by === side && a.a != null)
  const out = []
  faces.forEach((f, i) => { if (mine.every((a) => f.traits[a.q] === a.a)) out.push(i) })
  return out
}

/** How a question would split `side`'s standing faces: { yes, no }. */
export function splitFor(faces, raw, side, q) {
  const left = remainingFor(faces, raw, side)
  const yes = left.filter((i) => faces[i].traits[q] === 1).length
  return { yes, no: left.length - yes }
}

/** The round with `side`'s question appended. Null when not allowed. */
export function askQuestion(raw, side, q) {
  if (!canAsk(raw, side, q)) return null
  const r = normalizeRound(raw)
  return { ...raw, fAsks: [...r.asks.map(strip), { by: side, q }] }
}

const strip = (a) => (a.a == null ? { by: a.by, q: a.q } : { by: a.by, q: a.q, a: a.a })

/**
 * The round with the pending question answered by `side` (the player who was
 * asked) and the turn passed to them. Null when there is nothing for them to
 * answer.
 */
export function answerQuestion(raw, side, answer) {
  const p = pendingAsk(raw)
  if (!p || p.by === side || (answer !== 0 && answer !== 1)) return null
  const r = normalizeRound(raw)
  const asks = r.asks.map(strip)
  asks[p.index] = { by: p.by, q: p.q, a: answer }
  return { ...raw, fAsks: asks, fTurn: side }
}

/** The round with `side` naming face `i`. Null when not allowed. */
export function nameFace(raw, side, i) {
  if (!canName(raw, side) || !Number.isInteger(i) || i < 0 || i >= FACE_COUNT) return null
  return { ...raw, fName: { by: side, i } }
}

/**
 * Decide a round once both secrets are revealed. `valid[side]` says whether
 * that side's reveal matched its commitment (the page checks the hash).
 * A player whose reveal is invalid, or who answered any question falsely,
 * forfeits; if both did, the round is a draw.
 * @returns {{ winner: 'X' | 'O' | 'draw', reason: 'named' | 'wrong' | 'cheat', cheats: string[] } | null}
 */
export function judge(faces, raw, valid) {
  const r = normalizeRound(raw)
  if (!r.name || !r.reveal.X || !r.reveal.O) return null
  const cheats = ['X', 'O'].filter((side) => {
    if (!valid?.[side]) return true
    const secret = r.reveal[side].i
    if (!faces[secret]) return true
    // Questions asked BY the other side were answered by this one.
    return r.asks.some((a) => a.by !== side && a.a != null && faces[secret].traits[a.q] !== a.a)
  })
  if (cheats.length === 2) return { winner: 'draw', reason: 'cheat', cheats }
  if (cheats.length === 1) return { winner: otherSide(cheats[0]), reason: 'cheat', cheats }
  const target = r.reveal[otherSide(r.name.by)].i
  return r.name.i === target
    ? { winner: r.name.by, reason: 'named', cheats }
    : { winner: otherSide(r.name.by), reason: 'wrong', cheats }
}

// ---------------------------------------------------------------------------
// Bot (solo page).
// ---------------------------------------------------------------------------
export const BOT_LEVELS = ['easy', 'normal', 'hard']

/**
 * The bot's move for `side`: { name: i } or { ask: q }.
 * EASY asks a random open question and only names when one face is left.
 * NORMAL asks the question with the most even split. HARD does the same and
 * gambles on a 50/50 when its rival is one question from certain.
 */
export function botMove(faces, raw, side, level = 'normal', rng = Math.random) {
  const left = remainingFor(faces, raw, side)
  const open = Q_IDS.filter((q) => !askedBy(raw, side).includes(q))
  const guess = () => ({ name: left[Math.floor(rng() * left.length)] ?? 0 })
  if (left.length <= 1 || !open.length) return guess()
  if (level === 'hard' && left.length === 2 && remainingFor(faces, raw, otherSide(side)).length <= 2) return guess()
  if (level === 'easy') return { ask: open[Math.floor(rng() * open.length)] }
  let best = open[0]
  let top = -1
  for (const q of open) {
    const s = splitFor(faces, raw, side, q)
    const even = Math.min(s.yes, s.no)
    if (even > top) { top = even; best = q }
  }
  // Every open question is one-sided: nothing left to learn, so guess.
  return top === 0 ? guess() : { ask: best }
}
