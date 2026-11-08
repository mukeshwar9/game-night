// @ts-check
// SKETCH custom words (S3): the host's own list, mixed into the deck. Pure:
// no DOM, Firebase or React; unit-tested in sketchWordsLogic.test.js.
//
// Room key `sketchWords` (room-level, not in FIELD_NULLS; a new room starts
// empty): { v: 1, by: uid, mode: 'mix' | 'only', list: { 0: 'word', ... } }
// START copies it into the round as `round.custom` ({ by, mode, list }), so
// edits can't change a match in flight.
//
// One deck: custom word i sits at index CUSTOM_BASE + i, past any deck the
// app will ship, so `used`, the options and deriveWord work on one index
// space. The room's seen history (`seen/sketch`) records deck indices only.
//
// MIX: each turn offers EASY deck · CUSTOM · HARD deck. ONLY: three custom
// words, the deck filling in when fewer than three are left. The list's author
// knows every word, so on a custom round they watch instead of guessing and
// sit out that round's scoring.

import { seededShuffle } from './fibbageLogic'
import { matchKey } from './textMatchLogic'
import { isBannedWord } from './wordDenylist'
import { pickRoundOptions } from './sketchLogic'

export const CUSTOM_BASE = 1000
export const MAX_CUSTOM = 100
export const MIN_LETTERS = 2
export const MAX_LETTERS = 24
export const MAX_WORDS_IN_ONE = 3
export const MODES = ['mix', 'only']

// Letters (any script, with their accents), digits, spaces, apostrophes, hyphens.
const ALLOWED = /^[\p{L}\p{M}\p{N} '’-]+$/u

/** One word or phrase cleaned up: NFC, single spaces, trimmed. */
export function cleanWord(raw) {
  return String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().replace(/’/g, "'")
}

/** Why a cleaned word can't go in the list, or null when it can. */
export function wordProblem(word) {
  const w = cleanWord(word)
  const len = Array.from(w).length
  if (len < MIN_LETTERS || len > MAX_LETTERS) return 'length'
  if (!ALLOWED.test(w) || !/[\p{L}\p{N}]/u.test(w)) return 'chars'
  if (w.split(' ').length > MAX_WORDS_IN_ONE) return 'words'
  const lower = w.toLowerCase()
  if (isBannedWord(lower) || lower.split(/[ '-]/).some(isBannedWord) || isBannedWord(lower.replace(/[ '-]/g, ''))) return 'banned'
  return null
}

/**
 * Adds typed or pasted text to a list: splits on commas and new lines,
 * checks each word, folds duplicates the way guesses fold (matchKey), and
 * stops at MAX_CUSTOM. Refused words are counted, never echoed back.
 * @param {string[]} list
 * @param {string} text
 * @returns {{ list: string[], added: number, refused: number, duplicate: number, full: number }}
 */
export function addWords(list, text) {
  const out = [...(list || [])]
  const keys = new Set(out.map(matchKey))
  let added = 0; let refused = 0; let duplicate = 0; let full = 0
  for (const piece of String(text ?? '').split(/[,\n\r]+/)) {
    const w = cleanWord(piece)
    if (!w) continue
    if (wordProblem(w)) { refused++; continue }
    const k = matchKey(w)
    if (!k || keys.has(k)) { duplicate++; continue }
    if (out.length >= MAX_CUSTOM) { full++; continue }
    out.push(w)
    keys.add(k)
    added++
  }
  return { list: out, added, refused, duplicate, full }
}

/** The room's list, read back by key (never Object.values), with bad entries dropped. */
export function normalizeWords(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const list = []
  const src = r.list
  if (Array.isArray(src)) src.forEach(w => { if (typeof w === 'string' && !wordProblem(w)) list.push(cleanWord(w)) })
  else if (src && typeof src === 'object') {
    Object.entries(src)
      .map(([k, w]) => [Number(k), w])
      .filter(([k, w]) => Number.isInteger(k) && typeof w === 'string')
      .sort((a, b) => a[0] - b[0])
      .forEach(([, w]) => { if (!wordProblem(w)) list.push(cleanWord(w)) })
  }
  return {
    by: typeof r.by === 'string' ? r.by : null,
    mode: MODES.includes(r.mode) ? r.mode : 'mix',
    list: list.slice(0, MAX_CUSTOM),
  }
}

/** The room value to write; null removes the key when the list is empty and mixed. */
export function wordsValue({ by, mode, list }) {
  if (!list.length && mode === 'mix') return null
  return { v: 1, by, mode, list: Object.fromEntries(list.map((w, i) => [i, w])) }
}

/** What START copies into the round, or null for no custom words. */
export function customSnapshot(raw) {
  const w = normalizeWords(raw)
  if (!w.list.length) return null
  return { by: w.by, mode: w.mode, list: w.list }
}

/** A round's custom words read back ({ by, mode, list }), or null. */
export function roundCustom(round) {
  const c = round?.custom
  if (!c) return null
  const w = normalizeWords(c)
  return w.list.length ? w : null
}

/** True for an index in the custom range. */
export function isCustomIndex(i) {
  return Number.isInteger(i) && i >= CUSTOM_BASE
}

/**
 * The deck with this match's custom words at CUSTOM_BASE + i (a sparse array:
 * deck lookups by index keep working). Custom words pay ×1 (tier 1).
 * @template T
 * @param {T[]} deck
 * @param {{ list: string[] } | null} custom
 */
export function buildDeck(deck, custom) {
  if (!custom?.list?.length) return deck
  const out = deck.slice()
  custom.list.forEach((word, i) => { out[CUSTOM_BASE + i] = /** @type {any} */ ({ word, tier: 1, custom: true }) })
  return out
}

/**
 * A turn's three options. Without custom words: the deck (pickRoundOptions).
 * MIX: EASY deck · CUSTOM · HARD deck. ONLY: up to three custom words, the
 * deck filling the rest. Deterministic from `seed` and the shared state.
 * @returns {number[]}
 */
export function pickOptionsWithCustom({ deck, custom, seed, used = [], seen = null }) {
  const deckPicks = () => pickRoundOptions(deck, seed, used.filter(i => !isCustomIndex(i)), seen)
  if (!custom?.list?.length) return deckPicks()
  const usedSet = new Set(used)
  const fresh = custom.list.map((_, i) => CUSTOM_BASE + i).filter(i => !usedSet.has(i))
  if (custom.mode === 'only') {
    const picks = seededShuffle(fresh, seed + 7).slice(0, 3)
    if (picks.length === 3) return picks
    return [...picks, ...deckPicks().slice(0, 3 - picks.length)]
  }
  const d = deckPicks()
  if (fresh.length === 0 || d.length < 3) return d
  return [d[0], seededShuffle(fresh, seed + 7)[0], d[2]]
}

/** The options' deck indices only, for the room's seen history. */
export function deckOnly(indices) {
  return (indices || []).filter(i => !isCustomIndex(i))
}

/**
 * Who guesses (and scores) this round: everyone but the artist, and on a
 * custom word also not the list's author (they know the word).
 */
export function sitsOut(custom, entry, uid) {
  return !!(entry?.custom && custom?.by && custom.by === uid)
}

/** "12 WORDS FOR 16 TURNS — THE DECK FILLS THE REST" when an ONLY list is short, else null. */
export function shortListWarning({ mode, count, turns }) {
  if (mode !== 'only') return null
  if (count === 0) return 'ADD WORDS OR SWITCH TO MIX'
  if (count < turns * 3) return `${count} WORD${count === 1 ? '' : 'S'} FOR ${turns} TURN${turns === 1 ? '' : 'S'} — THE DECK FILLS THE REST`
  return null
}

/** "1 WORD ISN'T ALLOWED — LEFT OUT" and friends, after ADD. */
export function addMessage({ refused, duplicate, full }) {
  const parts = []
  if (refused) parts.push(`${refused} WORD${refused === 1 ? " ISN'T" : "S AREN'T"} ALLOWED — LEFT OUT`)
  if (duplicate) parts.push(`${duplicate} ALREADY IN THE LIST`)
  if (full) parts.push(`LIST FULL (${MAX_CUSTOM})`)
  return parts.join(' · ')
}
