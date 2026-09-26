// Pure logic for WORD HUNT (Boggle duel) — no DOM, no Firebase. Unit-tested in
// wordhuntLogic.test.js.
//
// Both players trace words on an identical seeded 4x4 grid (see generateGrid).
// A word is valid if it's >= MIN_WORD_LENGTH letters, present in the Word Hunt
// dictionary (checked by the caller — see wordhuntDictionary.js, not this file),
// and traceable through 8-directionally-adjacent tiles without reusing a tile
// (findPath). Scoring follows the classic Boggle table (scoreWord/scoreWords).

import { isBannedWord } from './wordDenylist'
import { topFamiliar } from './commonWords'
import { GRID_SIZE, CELL_COUNT, BOGGLE_DICE, generateGrid } from './wordhuntGrid'

export { GRID_SIZE, CELL_COUNT, BOGGLE_DICE, generateGrid }

export const COUNTDOWN_MS = 3_000
export const ROUND_MS = 80_000
export const MATCH_WINS = 3
export const MIN_WORD_LENGTH = 3

// Row/column <-> flat-index helpers for the 4x4 grid.
export function rowColOf(index) {
  return [Math.floor(index / GRID_SIZE), index % GRID_SIZE]
}

export function indexOf(row, col) {
  return row * GRID_SIZE + col
}

// The up-to-8 orthogonal+diagonal, in-bounds neighbor indices (excludes self).
export function neighborsOf(index) {
  const [row, col] = rowColOf(index)
  const out = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const r = row + dr
      const c = col + dc
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) out.push(indexOf(r, c))
    }
  }
  return out
}

// The one and only normalization/dedup-key function — use it everywhere a word
// is compared or stored.
export function canonicalize(word) {
  return String(word ?? '').trim().toLowerCase()
}

// Builds the lookup the page uses from the dictionary asset's lines
// (public/wordhunt-dict.txt). Pure — no fetch; wordhuntDictionary.js calls it.
//
// Content safety (G-01): the shipped file is scrubbed of banned words
// (scripts/clean-wordhunt-dict.mjs), and `has` rejects banned words again at
// lookup time as a guard, so a stale service-worker copy of the old file can
// never accept a slur. (Guarding per lookup costs microseconds; filtering all
// 125k words up front cost ~0.5 s on desktop.) Homographs (tit, ass…) stay
// findable — only lists the game shows on its own filter with isFamilySafe.
//
// `hasPrefix` (binary search over the sorted list) lets solveGrid prune.
export function createDictionary(lines) {
  const list = []
  for (const line of lines || []) {
    const word = canonicalize(line)
    if (word) list.push(word)
  }
  let sorted = true
  for (let i = 1; i < list.length; i++) {
    if (list[i - 1] > list[i]) { sorted = false; break }
  }
  if (!sorted) list.sort()
  const set = new Set(list)
  const has = (word) => {
    const w = canonicalize(word)
    return set.has(w) && !isBannedWord(w)
  }
  const hasPrefix = (prefix) => {
    const p = canonicalize(prefix)
    let lo = 0
    let hi = list.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (list[mid] < p) lo = mid + 1
      else hi = mid
    }
    return lo < list.length && list[lo].startsWith(p)
  }
  return { has, hasPrefix, size: set.size }
}


// DFS path search through the grid — pure grid-geometry, no dictionary
// membership or length checks (callers apply those separately, cheapest-check-
// first). Returns the tile-index path in traversal order, or null.
export function findPath(grid, word) {
  const target = canonicalize(word)
  if (!target) return null
  for (let start = 0; start < CELL_COUNT; start++) {
    const path = dfs(grid, target, start, new Set())
    if (path) return path
  }
  return null
}

function dfs(grid, remaining, index, visited) {
  if (visited.has(index)) return null
  // A 'q' tile consumes exactly 'qu' (2 characters) from `remaining` in one
  // step — a candidate word with 'q' not immediately followed by 'u' simply
  // fails the startsWith check below (correct: the Qu tile can't spell a bare "Q").
  const letters = grid[index] === 'q' ? 'qu' : grid[index]
  if (!remaining.startsWith(letters)) return null
  const rest = remaining.slice(letters.length)
  if (rest.length === 0) return [index] // whole word consumed exactly here
  const nextVisited = new Set(visited)
  nextVisited.add(index)
  for (const neighbor of neighborsOf(index)) {
    const sub = dfs(grid, rest, neighbor, nextVisited)
    if (sub) return [index, ...sub]
  }
  return null
}

// Classic Boggle scoring table, keyed by the letter-length of the word.
// Returns 0 for words shorter than MIN_WORD_LENGTH.
export function scoreWord(word) {
  const len = canonicalize(word).length
  if (len < MIN_WORD_LENGTH) return 0
  if (len <= 4) return 1
  if (len === 5) return 2
  if (len === 6) return 3
  if (len === 7) return 5
  return 11
}

// Sums scoreWord over a list. Assumes the caller has already deduplicated (by
// canonicalize) — this is a tally/reducer, not a dedup step.
export function scoreWords(words) {
  return (words || []).reduce((sum, w) => sum + scoreWord(w), 0)
}

// ── round resolution (moved from WordHuntGame.jsx) ──────────────────────

// Firebase returns an append-only list as a real array or a numeric-keyed
// object depending on sparsity (a failed write leaves a gap). Map by explicit
// numeric key order — never Object.values — and drop gaps.
export function normalizeWordList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(w => w != null && w !== '')
  return Object.keys(raw)
    .filter(k => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map(k => raw[k])
    .filter(w => w != null && w !== '')
}

// The next free slot in a stored word list: one past the highest numeric key
// (not the count), so a gap left by a failed write is never overwritten.
export function nextWordIndex(raw) {
  if (!raw) return 0
  if (Array.isArray(raw)) return raw.length
  let max = -1
  for (const k of Object.keys(raw)) if (/^\d+$/.test(k)) max = Math.max(max, Number(k))
  return max + 1
}

// Re-verifies a stored word list against the dictionary and the grid:
// canonical, deduped, >= MIN_WORD_LENGTH, in the dictionary (which never
// accepts a banned word) and traceable. `rejected` holds everything else.
// Scores are never trusted from the client — this is the only tally.
export function verifyWords(raw, grid, dict) {
  const seen = new Set()
  const words = []
  const rejected = []
  for (const entry of normalizeWordList(raw)) {
    const word = canonicalize(entry)
    if (!word || seen.has(word)) continue
    seen.add(word)
    if (word.length >= MIN_WORD_LENGTH && dict?.has(word) && findPath(grid, word)) words.push(word)
    else rejected.push(word)
  }
  return { words, rejected, score: scoreWords(words) }
}

export function longestWordLength(words) {
  return (words || []).reduce((max, w) => Math.max(max, canonicalize(w).length), 0)
}

// Round verdict from two verified word lists: most points wins; equal points
// go to more words, then the longer longest word; otherwise a draw.
// `decidedBy` ∈ 'points' | 'words' | 'longest' | 'draw' drives the end copy.
export function compareHunt(wordsX, wordsO) {
  const scoreX = scoreWords(wordsX)
  const scoreO = scoreWords(wordsO)
  const countX = (wordsX || []).length
  const countO = (wordsO || []).length
  const longestX = longestWordLength(wordsX)
  const longestO = longestWordLength(wordsO)
  let winner = 'draw'
  let decidedBy = 'draw'
  if (scoreX !== scoreO) { winner = scoreX > scoreO ? 'X' : 'O'; decidedBy = 'points' }
  else if (countX !== countO) { winner = countX > countO ? 'X' : 'O'; decidedBy = 'words' }
  else if (longestX !== longestO) { winner = longestX > longestO ? 'X' : 'O'; decidedBy = 'longest' }
  return { winner, decidedBy, scoreX, scoreO, countX, countO, longestX, longestO }
}

// When the round's hunting window closes (server time).
export function roundDeadline(startedAt) {
  return startedAt ? startedAt + COUNTDOWN_MS + ROUND_MS : null
}

// Transaction updater for the end of a round, safe for either client to run
// once the deadline has passed. Returns undefined (abort) until then, once the
// game is already finished, or while this client's dictionary is not loaded —
// self-reported scores are never trusted, so a client without the dictionary
// waits for the other client (or for its own load) instead of finishing.
export function finishHuntRound(current, { now, dict }) {
  if (!current || current.status === 'finished' || !dict) return undefined
  const deadline = roundDeadline(current.wordhuntStartedAt)
  if (!deadline || now < deadline) return undefined
  const grid = current.wordhuntGrid ?? ''
  const x = verifyWords(current.wordhuntWordsX, grid, dict)
  const o = verifyWords(current.wordhuntWordsO, grid, dict)
  const verdict = compareHunt(x.words, o.words)
  const scores = { ...(current.scores || {}) }
  if (verdict.winner !== 'draw') scores[verdict.winner] = (scores[verdict.winner] || 0) + 1
  return {
    ...current,
    wordhuntScoreX: verdict.scoreX,
    wordhuntScoreO: verdict.scoreO,
    winner: verdict.winner,
    status: 'finished',
    scores,
  }
}

// ── solver, grid floor and fair start ───────────────────────────────────

// A grid must hold at least this many dictionary words before a round starts
// (the worst random grid had 7; median ~89). Starting value — tune in play.
export const MIN_GRID_WORDS = 25
// Re-roll budget per start; the best grid seen is used if none reaches the
// floor (never observed in 500 sampled grids, but bounded regardless).
export const MAX_GRID_REROLLS = 40

const NEIGHBORS = Array.from({ length: CELL_COUNT }, (_, i) => neighborsOf(i))

// Every dictionary word traceable on the grid (>= MIN_WORD_LENGTH, Qu tile
// spells "qu"), longest first then A–Z. `dict` needs `has` and `hasPrefix`
// (createDictionary provides both); prefix pruning keeps this to a few ms.
export function solveGrid(grid, dict) {
  if (!dict?.has || !dict?.hasPrefix || typeof grid !== 'string' || grid.length !== CELL_COUNT) return []
  const found = new Set()
  const visited = new Array(CELL_COUNT).fill(false)
  const walk = (index, prefix) => {
    const word = prefix + (grid[index] === 'q' ? 'qu' : grid[index])
    if (!dict.hasPrefix(word)) return
    if (word.length >= MIN_WORD_LENGTH && dict.has(word)) found.add(word)
    visited[index] = true
    for (const next of NEIGHBORS[index]) if (!visited[next]) walk(next, word)
    visited[index] = false
  }
  for (let i = 0; i < CELL_COUNT; i++) walk(i, '')
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b))
}

// Keeps `grid` if it clears the floor, otherwise re-rolls fresh seeded grids
// until one does (or the budget runs out — then the best one seen).
export function ensurePlayableGrid(grid, dict, {
  minWords = MIN_GRID_WORDS, maxTries = MAX_GRID_REROLLS, random = Math.random,
} = {}) {
  let best = grid
  let bestCount = solveGrid(grid, dict).length
  for (let tries = 0; bestCount < minWords && tries < maxTries; tries++) {
    const candidate = generateGrid(Math.floor(random() * 2_147_483_647))
    const count = solveGrid(candidate, dict).length
    if (count > bestCount) { best = candidate; bestCount = count }
  }
  return best
}

// Transaction updater for the pre-round lobby. `symbol` (optional) marks that
// seat READY (`wordhuntReady{X|O}`); a seat only presses READY once its own
// dictionary has loaded. When both seats are ready, the client running this
// (it must have `dict`) lifts the grid to the word floor and stamps
// `wordhuntStartedAt` — the grid written here is the one both players get.
// Aborts (undefined) once started or finished, and when nothing changes.
export function wordhuntReadyUpdate(current, { symbol = null, now, dict, random = Math.random }) {
  if (!current || current.status === 'finished' || current.wordhuntStartedAt) return undefined
  const next = symbol ? { ...current, [`wordhuntReady${symbol}`]: true } : { ...current }
  const bothReady = !!next.wordhuntReadyX && !!next.wordhuntReadyO
  if (!bothReady || !dict) return symbol && !current[`wordhuntReady${symbol}`] ? next : undefined
  return {
    ...next,
    wordhuntGrid: ensurePlayableGrid(current.wordhuntGrid, dict, { random }),
    wordhuntStartedAt: now,
  }
}

// How many words the end screen's "TOP MISSED" list shows.
export const TOP_MISSED_COUNT = 10

// End-of-round "TOP MISSED": words on the grid that nobody found, family-safe
// only (a homograph may be found, never suggested), most familiar first, then
// by points. `found` is a list of word lists (one per player).
export function topMissedWords(grid, dict, found = [], limit = TOP_MISSED_COUNT) {
  const seen = new Set(found.flat().map(canonicalize))
  const missed = solveGrid(grid, dict).filter(w => !seen.has(w))
  return topFamiliar(missed, { limit, score: scoreWord })
}
