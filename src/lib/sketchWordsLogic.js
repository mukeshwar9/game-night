// @ts-check
// SKETCH custom words (room key `games/{id}/sketchWords`): the host's own
// word list, edited in the lobby's MATCH SETUP sheet and either mixed into
// the deck (one of the three choices each turn) or used on its own (all
// three choices, until the list runs out and the deck fills in).
//
// Stored shape: { v: 1, by: uid, mode: 'mix' | 'only', list: { 0: word, … } }.
// `by` is whoever last saved the list (the rules insist it is the writer),
// so that player knows every word and sits out the rounds that draw one.
// The key lives outside FIELD_NULLS, so NEW MATCH and game switches keep it.
//
// START copies the list into the round (`round.custom`, same shape without
// `v`), so a change in the lobby never reaches a match in flight. Custom
// words get deck indices after the bundled deck (deck length + i): `used`,
// `options`, deriveWord and entryForWord all work on one combined deck, while
// the room's seen history (`seen/sketch`) keeps recording deck indices only.
//
// Pure — no DOM/Firebase/React.

import { normalize, pickRoundOptions, seededShuffle, isBannedGuess } from './sketchLogic'
import { matchKey } from './textMatchLogic'

export const SKETCH_WORDS_KEY = 'sketchWords'
export const SKETCH_WORDS_VERSION = 1
export const MAX_CUSTOM_WORDS = 100
export const MIN_WORD_CHARS = 2
export const MAX_WORD_CHARS = 24
export const MAX_WORD_PARTS = 3
export const WORD_MODES = /** @type {const} */ (['mix', 'only'])
export const DEFAULT_WORD_MODE = 'mix'
// Options a turn offers; ONLY mode wants this many custom words a turn.
export const CHOICES_PER_TURN = 3

/** @typedef {{ by: string|null, mode: 'mix'|'only', list: string[] }} CustomWords */

// Letters (any script, with their marks), digits, spaces, apostrophes, hyphens.
const WORD_SHAPE = /^[\p{L}\p{M}\p{N}' -]+$/u
const COUNTED = /[\p{L}\p{N}]/gu

/**
 * A typed or pasted word in its stored form: NFC, lowercase, curly
 * apostrophes straightened, whitespace trimmed and collapsed.
 * @param {unknown} raw
 */
export function cleanWord(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[‐-—]/g, '-')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Check one cleaned word. `shape`: off the 2–24 / up-to-3-words / allowed
 * characters rule; `banned`: refused by the slur/vulgarity list.
 * @param {string} word - already cleanWord()ed
 * @returns {'ok'|'shape'|'banned'}
 */
export function checkWord(word) {
  if (!word || word.length < MIN_WORD_CHARS || word.length > MAX_WORD_CHARS) return 'shape'
  if (!WORD_SHAPE.test(word)) return 'shape'
  if (word.split(' ').length > MAX_WORD_PARTS) return 'shape'
  if ((word.match(COUNTED) || []).length < MIN_WORD_CHARS) return 'shape'
  if (isBannedGuess(word)) return 'banned'
  return 'ok'
}

/**
 * The key duplicates fold on: guesses' own matchKey (plurals, spacing,
 * hyphens, a leading article), or the plain normalized word for scripts
 * matchKey cannot read.
 * @param {string} word
 */
export function wordKey(word) {
  return matchKey(word) || `=${normalize(word)}`
}

/** Split the editor's text on commas and new lines. */
export function splitInput(text) {
  return String(text ?? '').split(/[,\n\r]+/).map(cleanWord).filter(Boolean)
}

/**
 * Add the editor's text to a list. Returns the new list and what happened,
 * for the editor's feedback line: refused words are counted, never echoed.
 * @param {string[]} list
 * @param {string} text
 */
export function addWords(list, text) {
  const out = [...list]
  const keys = new Set(out.map(wordKey))
  let added = 0, banned = 0, invalid = 0, dupes = 0, full = 0
  for (const word of splitInput(text)) {
    const verdict = checkWord(word)
    if (verdict === 'banned') { banned++; continue }
    if (verdict === 'shape') { invalid++; continue }
    const key = wordKey(word)
    if (keys.has(key)) { dupes++; continue }
    if (out.length >= MAX_CUSTOM_WORDS) { full++; continue }
    keys.add(key)
    out.push(word)
    added++
  }
  return { list: out, added, banned, invalid, dupes, full }
}

/**
 * The editor's feedback after ADD, or '' when every word went in.
 * @param {{ added: number, banned: number, invalid: number, dupes: number, full: number }} r
 */
export function addFeedback(r) {
  const n = (count, one, many) => `${count} ${count === 1 ? one : many}`
  const parts = []
  if (r.banned) parts.push(`${n(r.banned, "WORD ISN'T", "WORDS AREN'T")} ALLOWED — LEFT OUT`)
  if (r.invalid) parts.push(`${n(r.invalid, "WORD DOESN'T", "WORDS DON'T")} FIT 2–24 LETTERS · UP TO 3 WORDS`)
  if (r.dupes) parts.push(`${n(r.dupes, 'WORD WAS', 'WORDS WERE')} ALREADY ON THE LIST`)
  if (r.full) parts.push(`LIST IS FULL — ${n(r.full, 'WORD', 'WORDS')} LEFT OUT`)
  return parts.join(' · ')
}

/**
 * Whatever Firebase returned for a word list (an array, or a numeric-keyed
 * object), read by key in index order: valid, deduplicated, capped words.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeWordList(raw) {
  if (!raw || typeof raw !== 'object') return []
  const entries = Object.entries(raw)
    .map(([k, v]) => [Number(k), v])
    .filter(([i, v]) => Number.isInteger(i) && i >= 0 && typeof v === 'string')
    .sort((a, b) => /** @type {number} */ (a[0]) - /** @type {number} */ (b[0]))
  const out = []
  const keys = new Set()
  for (const [, v] of entries) {
    const word = cleanWord(v)
    if (checkWord(word) !== 'ok') continue
    const key = wordKey(word)
    if (keys.has(key)) continue
    keys.add(key)
    out.push(word)
    if (out.length >= MAX_CUSTOM_WORDS) break
  }
  return out
}

/**
 * The room's (or the round's) custom words, every field checked.
 * @param {unknown} raw
 * @returns {CustomWords}
 */
export function normalizeSketchWords(raw) {
  const r = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  return {
    by: typeof r.by === 'string' && r.by ? r.by : null,
    mode: r.mode === 'only' ? 'only' : DEFAULT_WORD_MODE,
    list: normalizeWordList(r.list),
  }
}

/**
 * The value to write after one editor action, signed by the writer: the
 * room's current words with the change applied. Null (delete the key) when
 * the list is empty and the mode is the default, so an untouched room keeps
 * no key at all.
 * @param {unknown} current - the room's `sketchWords` as read inside the transaction
 * @param {string} uid - the writer (the rules require `by === auth.uid`)
 * @param {{ add?: string, remove?: string, mode?: string, clear?: boolean }} change
 */
export function patchSketchWords(current, uid, change) {
  const cur = normalizeSketchWords(current)
  let list = cur.list
  let mode = cur.mode
  if (change.clear) list = []
  if (typeof change.add === 'string') list = addWords(list, change.add).list
  if (typeof change.remove === 'string') {
    const key = wordKey(cleanWord(change.remove))
    list = list.filter(w => wordKey(w) !== key)
  }
  if (change.mode === 'mix' || change.mode === 'only') mode = change.mode
  if (list.length === 0 && mode === DEFAULT_WORD_MODE) return null
  /** @type {{ v: number, by: string, mode: string, list?: string[] }} */
  const out = { v: SKETCH_WORDS_VERSION, by: uid, mode }
  if (list.length) out.list = list
  return out
}

/**
 * What START copies into the first round (every later round carries it on):
 * `{ custom }`, or nothing when there are no words to use.
 * @param {unknown} raw - the room's `sketchWords`
 * @returns {{ custom?: CustomWords }}
 */
export function roundWordsSnapshot(raw) {
  const w = normalizeSketchWords(raw)
  if (!w.by || w.list.length === 0) return {}
  return { custom: { by: w.by, mode: w.mode, list: w.list } }
}

/**
 * One combined deck: the bundled words, then the custom ones (index
 * deck.length + i). Custom entries pay ×1 (tier 1) and carry `custom: true`.
 * @template {{ word: string, tier: number }} T
 * @param {T[]} deck
 * @param {unknown} custom - the round's `custom`
 * @returns {(T | { word: string, tier: number, custom: true })[]}
 */
export function buildDeck(deck, custom) {
  const { list } = normalizeSketchWords(custom)
  if (list.length === 0) return deck
  return [...deck, ...list.map(word => ({ word, tier: 1, custom: /** @type {const} */ (true) }))]
}

/** Custom word indices (in the combined deck) not yet offered this match. */
export function freshCustomIndices(deckSize, custom, used = []) {
  const { list } = normalizeSketchWords(custom)
  const usedSet = new Set(used)
  return list.map((_, i) => deckSize + i).filter(i => !usedSet.has(i))
}

/**
 * A turn's three options from the combined deck, deterministic from `seed`
 * and the room state so every client agrees.
 * - No custom words, or nobody but the list's author could guess this turn
 *   (a two-player room where the other player draws): the deck as today.
 * - MIX: EASY deck · one custom word · HARD deck; MEDIUM deck in the middle
 *   once the custom words are used up.
 * - ONLY: up to three custom words, the deck (easy first) filling the rest.
 * A deck word that reads the same as a chosen custom word is never offered
 * beside it, so the drawn word always maps back to one option.
 * @param {{ deck: { word: string, tier: number }[], custom: unknown, seed: number,
 *   used?: number[], seen?: unknown, order?: string[], artist?: string|null }} p
 * @returns {number[]}
 */
export function pickSketchOptions({ deck, custom, seed, used = [], seen = null, order = [], artist = null }) {
  const words = normalizeSketchWords(custom)
  const someoneElseGuesses = (order || []).some(id => id !== artist && id !== words.by)
  if (words.list.length === 0 || !someoneElseGuesses) return pickRoundOptions(deck, seed, used, seen)
  const want = words.mode === 'only' ? CHOICES_PER_TURN : 1
  const picks = seededShuffle(freshCustomIndices(deck.length, words, used), (seed + 101) >>> 0).slice(0, want)
  const pickedForms = new Set(picks.map(i => normalize(words.list[i - deck.length])))
  const clash = []
  deck.forEach((entry, i) => { if (pickedForms.has(normalize(entry.word))) clash.push(i) })
  const fromDeck = pickRoundOptions(deck, seed, [...used, ...clash], seen)
  if (picks.length === 0) return fromDeck
  if (words.mode === 'only') return [...picks, ...fromDeck].slice(0, CHOICES_PER_TURN)
  return [fromDeck[0], picks[0], fromDeck[2] ?? fromDeck[1]].filter(i => i != null)
}

/**
 * ONLY mode is about to run short: fewer than three custom words were left
 * when this turn's options were drawn, so the deck is filling in.
 * @param {number} deckSize
 * @param {unknown} custom
 * @param {number[]} used - the round's `used` (before this turn's options)
 */
export function customRunningOut(deckSize, custom, used = []) {
  const words = normalizeSketchWords(custom)
  if (words.mode !== 'only' || words.list.length === 0) return false
  return freshCustomIndices(deckSize, words, used).length < CHOICES_PER_TURN
}

/**
 * Who sits this round out: the list's author when the drawn word is one of
 * their custom words and someone else is drawing it; otherwise null.
 * @param {unknown} custom - the round's `custom`
 * @param {{ custom?: boolean } | null | undefined} entry - entryForWord() on the combined deck
 * @param {string|null|undefined} artist
 * @returns {string|null}
 */
export function sitOutFor(custom, entry, artist) {
  if (!entry?.custom) return null
  const { by } = normalizeSketchWords(custom)
  return by && by !== artist ? by : null
}

// ---- Copy ---------------------------------------------------------------

/** The lobby summary's words part: "12 WORDS" for the host, "12 CUSTOM WORDS" for everyone else; '' with none. */
export function wordsSummary(count, forHost) {
  if (!count) return ''
  return forHost ? `${count} WORD${count === 1 ? '' : 'S'}` : `${count} CUSTOM WORD${count === 1 ? '' : 'S'}`
}

/** The MATCH SETUP sheet's row: "12 WORDS · MIXED IN" / "12 WORDS · CUSTOM ONLY" / "NONE YET". */
export function wordsRowLabel(count, mode) {
  if (!count) return mode === 'only' ? 'NONE YET · CUSTOM ONLY' : 'NONE YET'
  return `${count} WORD${count === 1 ? '' : 'S'} · ${mode === 'only' ? 'CUSTOM ONLY' : 'MIXED IN'}`
}

/**
 * ONLY mode's warning for the row and the editor, or '' when the list is
 * long enough: each turn offers three custom words.
 * @param {{ count: number, mode: string, turns: number }} p
 */
export function onlyModeWarning({ count, mode, turns }) {
  if (mode !== 'only') return ''
  if (!count) return 'ADD WORDS OR SWITCH TO MIX'
  const covered = Math.ceil(count / CHOICES_PER_TURN)
  if (covered >= turns) return ''
  return `${count} WORD${count === 1 ? '' : 'S'} LAST ${covered} OF ${turns} TURNS — THE DECK FILLS THE REST`
}

export const MODE_COPY = {
  mix: { label: 'MIX WITH DECK', blurb: 'ONE OF THE 3 CHOICES EACH TURN IS YOURS' },
  only: { label: 'CUSTOM ONLY', blurb: 'ALL 3 CHOICES ARE YOURS UNTIL THEY RUN OUT' },
}
