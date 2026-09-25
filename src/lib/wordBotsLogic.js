// Pure bot logic for the word games' solo demos (Hangwoman, Word Duel, Word
// Race; Word Hunt and Anagrams later) — no DOM, no React, no timers. Pages
// own the clock: they ask these helpers WHAT the bot does and schedule WHEN
// with the think-time helpers below.
//
// Every "skill" knob is a handicap so the bot plays like a decent human, not
// a solver: it picks among the top few candidates instead of the best one.
// The numbers are starting values to tune in play.

import { markGuess, WORD_LENGTH, MAX_GUESSES } from './wordduelLogic'
import { isFamilySafe } from './wordDenylist'

// ── Wordle solver (Word Duel / Word Race CPU) ────────────────────────────────

// Human-style openers (all answer-list words, so a guess is always playable).
export const WORDLE_OPENERS = [
  'crane', 'slate', 'trace', 'crate', 'stare', 'raise', 'heart', 'least',
  'train', 'stone', 'plant', 'house', 'audio', 'arise', 'alert', 'later',
]

// 0..1 — how often the bot plays like a strong solver. The bot picks at
// random among the top `1 + round((1 - skill) * WORDLE_TOP_SPREAD)` ranked
// candidates, so 1 always plays the best-ranked word.
export const WORDLE_BOT_SKILL = 0.6
export const WORDLE_TOP_SPREAD = 10
// Chance that each word still possible "comes to mind" on a turn. A perfect
// memory of the answer list averages ~3.5 guesses; people blank on words.
// When nothing comes to mind the bot plays a probe word that keeps its greens
// and known letters but may ignore other clues, as a person would.
export const WORDLE_BOT_RECALL = 0.2
// Node budget for the fallback search over the full guess list (used only
// when the setter chose a word outside the answer list). ~0.1 s at worst.
export const WORDLE_ENUM_BUDGET = 200_000

// Simulated seconds a human-ish CPU spends on a Wordle row (row 0 is the
// opener). Starting values: a whole solve lands around 30–60 s.
export const WORDLE_THINK_MS = { opener: [3_000, 6_000], row: [6_000, 13_000] }

function lower(word) {
  return String(word ?? '').trim().toLowerCase()
}

function pickFrom(list, random) {
  if (!list.length) return null
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]
}

/** Does `word` produce exactly the recorded marks for every guess in `history`? */
export function isConsistent(word, history = []) {
  const w = lower(word)
  if (w.length !== WORD_LENGTH) return false
  return history.every(h => h?.word && h?.marks && markGuess(h.word, w) === h.marks)
}

/** The words of `pool` still possible after `history` ({ word, marks }[]). */
export function filterCandidates(pool = [], history = []) {
  return pool.map(lower).filter(w => isConsistent(w, history))
}

// Letter/position frequency among the remaining candidates: a word scores
// the number of candidates sharing each of its distinct letters, plus a bonus
// for letters in a common position. High = likely to split the pool well.
export function rankCandidates(candidates = []) {
  const words = [...new Set(candidates.map(lower))]
  const letterCount = {}
  const posCount = Array.from({ length: WORD_LENGTH }, () => ({}))
  for (const w of words) {
    for (const ch of new Set(w)) letterCount[ch] = (letterCount[ch] || 0) + 1
    for (let i = 0; i < w.length; i++) posCount[i][w[i]] = (posCount[i][w[i]] || 0) + 1
  }
  const score = (w) => {
    let s = 0
    for (const ch of new Set(w)) s += letterCount[ch] || 0
    for (let i = 0; i < w.length; i++) s += (posCount[i][w[i]] || 0) / 2
    return s
  }
  return words
    .map(w => ({ w, s: score(w) }))
    .sort((a, b) => b.s - a.s || a.w.localeCompare(b.w))
    .map(x => x.w)
}

// Constraints implied by a history: fixed greens, letters barred from each
// spot, and min/max counts per letter.
function wordleConstraints(history) {
  const green = Array(WORD_LENGTH).fill(null)
  const notAt = Array.from({ length: WORD_LENGTH }, () => new Set())
  const min = {}
  const max = {}
  for (const h of history) {
    const w = lower(h?.word)
    const m = String(h?.marks ?? '')
    if (w.length !== WORD_LENGTH || m.length !== WORD_LENGTH) continue
    const inWord = {}
    const blanked = new Set()
    for (let i = 0; i < WORD_LENGTH; i++) {
      const ch = w[i]
      if (m[i] === 'G') { green[i] = ch; inWord[ch] = (inWord[ch] || 0) + 1 }
      else {
        notAt[i].add(ch)
        if (m[i] === 'Y') inWord[ch] = (inWord[ch] || 0) + 1
        else blanked.add(ch)
      }
    }
    for (const [ch, n] of Object.entries(inWord)) min[ch] = Math.max(min[ch] || 0, n)
    for (const ch of blanked) max[ch] = Math.min(max[ch] ?? WORD_LENGTH, inWord[ch] || 0)
  }
  return { green, notAt, min, max }
}

/**
 * Every word `isWord` accepts that fits `history`, found by walking the
 * letters each spot still allows. Returns null when the walk would exceed
 * `budget` nodes (too early in the round to search blind).
 */
export function enumerateWordleCandidates(history = [], isWord, { budget = WORDLE_ENUM_BUDGET } = {}) {
  if (typeof isWord !== 'function') return null
  const { green, notAt, min, max } = wordleConstraints(history)
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const out = []
  const used = {}
  let nodes = 0
  const minEntries = Object.entries(min)
  const need = () => {
    let n = 0
    for (const [ch, k] of minEntries) n += Math.max(0, k - (used[ch] || 0))
    return n
  }
  const open = Array.from({ length: WORD_LENGTH }, (_, i) =>
    (green[i] ? [green[i]] : letters.split('').filter(ch => !notAt[i].has(ch))))
  const walk = (prefix) => {
    if (++nodes > budget) return false
    const i = prefix.length
    if (i === WORD_LENGTH) {
      if (isWord(prefix) && isConsistent(prefix, history)) out.push(prefix)
      return true
    }
    for (const ch of open[i]) {
      if ((used[ch] || 0) + 1 > (max[ch] ?? WORD_LENGTH)) continue
      used[ch] = (used[ch] || 0) + 1
      const ok = need() <= WORD_LENGTH - i - 1
      const keepGoing = ok ? walk(prefix + ch) : true
      used[ch] -= 1
      if (!keepGoing) return false
    }
    return true
  }
  return walk('') ? out : null
}

// A probe word keeps every green in place and uses every letter known to be
// in the answer — the clues people hold on to when they blank on the word.
function keepsKnownLetters(word, history) {
  for (const h of history) {
    const w = lower(h?.word)
    const m = String(h?.marks ?? '')
    for (let i = 0; i < w.length; i++) {
      if (m[i] === 'G' && word[i] !== w[i]) return false
      if (m[i] === 'Y' && !word.includes(w[i])) return false
    }
  }
  return true
}

/** How many ranked candidates the bot chooses between at `skill`. */
export function wordleTopK(skill = WORDLE_BOT_SKILL) {
  const s = Math.max(0, Math.min(1, Number(skill)))
  return 1 + Math.round((1 - s) * WORDLE_TOP_SPREAD)
}

/**
 * The bot's next Wordle guess (lowercase).
 *   pool    — answer list the bot "knows" (its candidate pool)
 *   history — its graded guesses so far, { word, marks }[]
 *   isWord  — optional full guess-list check, used only if the pool runs dry
 *             (the setter picked a word outside the answer list)
 * Plays hard mode: every guess after the opener fits all clues so far.
 */
export function pickWordleGuess({
  pool = [], history = [], skill = WORDLE_BOT_SKILL, recall = WORDLE_BOT_RECALL, random = Math.random,
  isWord = null, openers = WORDLE_OPENERS,
} = {}) {
  const tried = new Set(history.map(h => lower(h?.word)))
  if (!history.length) {
    const fresh = openers.map(lower).filter(w => !tried.has(w))
    const opener = pickFrom(fresh, random)
    if (opener) return opener
  }
  let candidates = filterCandidates(pool, history).filter(w => !tried.has(w))
  if (candidates.length > 1 && recall < 1) {
    const recalled = candidates.filter(() => random() < recall)
    if (recalled.length) candidates = recalled
    else {
      const probes = pool.map(lower).filter(w => !tried.has(w) && keepsKnownLetters(w, history))
      if (probes.length) candidates = probes
    }
  }
  if (!candidates.length && isWord) {
    candidates = (enumerateWordleCandidates(history, isWord) || []).filter(w => !tried.has(w))
  }
  if (!candidates.length) {
    // Nothing fits (the blind search was too big): play the pool word that
    // fits the most clues so far — a real word, just not a clever one.
    const scored = pool.map(lower).filter(w => !tried.has(w) && w.length === WORD_LENGTH)
      .map(w => ({ w, fit: history.filter(h => markGuess(h.word, w) === h.marks).length }))
    const best = Math.max(-1, ...scored.map(x => x.fit))
    candidates = scored.filter(x => x.fit === best).map(x => x.w)
    if (!candidates.length) return null
  }
  const ranked = rankCandidates(candidates)
  return pickFrom(ranked.slice(0, wordleTopK(skill)), random)
}

/**
 * Plays a whole Wordle board against `answer`: the guesses (with marks and
 * simulated think time per row) the bot would make, stopping at a solve or
 * MAX_GUESSES. Pages reveal the rows on their own clock.
 */
export function playWordleBoard({
  answer, pool = [], skill = WORDLE_BOT_SKILL, recall = WORDLE_BOT_RECALL, random = Math.random, isWord = null,
} = {}) {
  const target = lower(answer)
  const rows = []
  for (let r = 0; r < MAX_GUESSES; r++) {
    const word = pickWordleGuess({ pool, history: rows, skill, recall, random, isWord })
    if (!word) break
    const marks = markGuess(word, target)
    rows.push({ word, marks, thinkMs: wordleThinkMs(r, random) })
    if (marks === 'G'.repeat(WORD_LENGTH)) break
  }
  return rows
}

/** Simulated think time before row `row` (0-based). */
export function wordleThinkMs(row, random = Math.random) {
  const [lo, hi] = row === 0 ? WORDLE_THINK_MS.opener : WORDLE_THINK_MS.row
  return Math.round(lo + random() * (hi - lo))
}

/** A random family-safe answer (lowercase) for the CPU to set, avoiding `used`. */
export function pickCpuSecret(answerList = [], { random = Math.random, used = [] } = {}) {
  const skip = new Set(used.map(lower))
  const safe = answerList.map(lower).filter(w => w.length === WORD_LENGTH && isFamilySafe(w))
  const fresh = safe.filter(w => !skip.has(w))
  return pickFrom(fresh.length ? fresh : safe, random)
}

// ── Timed bot boards and match tally (Word Duel / Word Race demos) ─────────

/** Round-clock time (ms) at which each bot row lands: the running sum of thinkMs. */
export function botRowTimes(rows = []) {
  let t = 0
  return rows.map(r => (t += Math.max(0, Number(r?.thinkMs) || 0)))
}

/** How many bot rows have landed `elapsedMs` into the round. */
export function botRowsShown(rows = [], elapsedMs = 0) {
  return botRowTimes(rows).filter(t => t <= elapsedMs).length
}

/** The bot board's done state { solved, guesses, at } — `at` is its simulated finish time. */
export function botDoneState(rows = []) {
  if (!rows.length) return null
  const times = botRowTimes(rows)
  return {
    solved: rows[rows.length - 1].marks === 'G'.repeat(WORD_LENGTH),
    guesses: rows.length,
    at: times[times.length - 1],
  }
}

/**
 * A human board's done state from its graded guesses ({ word, marks, at },
 * `at` = ms since the round started), or null while still in play.
 */
export function playerDoneState(guesses = []) {
  const list = guesses.filter(Boolean)
  const solvedAt = list.findIndex(g => g.marks === 'G'.repeat(WORD_LENGTH))
  if (solvedAt >= 0) return { solved: true, guesses: solvedAt + 1, at: list[solvedAt].at }
  if (list.length >= MAX_GUESSES) return { solved: false, guesses: list.length, at: list[list.length - 1].at }
  return null
}

/** Round wins per side from a list of round winners ('X' | 'O' | 'draw'). */
export function tallyWins(winners = []) {
  const scores = { X: 0, O: 0 }
  for (const w of winners) if (w === 'X' || w === 'O') scores[w] += 1
  return scores
}

/** 'X' | 'O' once a side reaches `target` round wins, else null. */
export function matchWinner(scores, target) {
  if ((scores?.X || 0) >= target) return 'X'
  if ((scores?.O || 0) >= target) return 'O'
  return null
}

// ── Hangwoman CPU ────────────────────────────────────────────────────────────

// The CPU word-keeper's words: common, family-safe, 4–9 letters, each in the
// Word Hunt dictionary, with a category shown as the hint.
const KEEPER_WORDS = {
  ANIMAL: 'giraffe penguin dolphin elephant kangaroo turtle rabbit octopus squirrel hamster lobster panther gorilla cheetah ostrich peacock sparrow buffalo camel zebra tiger monkey donkey parrot beaver salmon spider beetle lizard walrus',
  FOOD: 'pancake sandwich avocado broccoli pretzel noodle biscuit cheese popcorn muffin pumpkin carrot tomato banana cherry lemonade oatmeal waffle burrito pickle bagel yogurt peanut cupcake',
  SPORT: 'tennis soccer hockey cricket boxing archery bowling cycling surfing karate baseball skating rowing fencing',
  JOB: 'doctor teacher farmer pilot dentist plumber baker nurse lawyer painter sailor engineer driver waiter barber judge scientist librarian',
  'AROUND THE HOUSE': 'blanket pillow candle kettle toaster mirror ladder bucket curtain carpet teapot blender freezer scissors umbrella bathtub',
  NATURE: 'volcano mountain rainbow glacier island forest canyon desert meadow waterfall thunder blizzard tornado sunshine breeze crystal',
  TRANSPORT: 'bicycle scooter tractor airplane submarine rocket train canoe sailboat truck ambulance balloon',
  MUSIC: 'guitar violin trumpet piano harmonica trombone clarinet banjo orchestra melody',
  SPACE: 'planet comet galaxy asteroid astronaut telescope meteor orbit',
  CLOTHING: 'jacket sweater scarf mittens sandals pajamas sneaker necklace bracelet slipper',
  PLACE: 'library museum airport bakery castle hospital stadium beach garden kitchen theater market school palace harbor',
  TOY: 'puzzle kite marble domino chess robot',
}

export const HANGMAN_CPU_WORDS = Object.entries(KEEPER_WORDS).flatMap(([hint, words]) =>
  words.split(' ').map(word => ({ word: word.toUpperCase(), hint })))

/** A keeper word { word, hint } for the CPU, avoiding words already used. */
export function pickKeeperWord({ random = Math.random, used = [] } = {}) {
  const skip = new Set(used.map(w => String(w).toUpperCase()))
  const fresh = HANGMAN_CPU_WORDS.filter(e => !skip.has(e.word))
  return pickFrom(fresh.length ? fresh : HANGMAN_CPU_WORDS, random)
}

// Letters by how many dictionary words contain them — the guess order when
// the bot can't narrow the word down yet.
export const HANGMAN_LETTER_ORDER = 'EAISRNOTLCUDPMHGBYFKVWZXJQ'
// Chance per guess that the CPU guesser slips and picks the 2nd or 3rd best
// letter instead of the best one (0 = perfect play). Starting value.
export const HANGMAN_BOT_SLIP = 0.3
// hasPrefix calls allowed per candidate search (~0.1 s); over budget, the
// bot falls back to plain letter frequency for that guess.
export const HANGMAN_ENUM_BUDGET = 60_000
// Real time between the CPU's letter guesses.
export const HANGMAN_THINK_MS = [900, 1_800]

/** The revealed pattern: a letter where guessed, null where hidden. */
export function hangmanPattern(word, guesses = {}) {
  return String(word ?? '').toUpperCase().split('').map(ch => {
    if (ch === ' ') return ' '
    const hit = guesses[ch]
    return Array.isArray(hit) && hit.length ? ch : null
  })
}

/**
 * Dictionary words that fit `pattern` given the letters already guessed.
 * Hangwoman reveals every copy of a hit letter, so a hidden spot can't hold
 * any guessed letter. `dict` is { has, hasPrefix } (loadDictionary()).
 * Returns uppercase words, or null when the search would exceed `budget`.
 */
export function hangmanCandidates({ pattern = [], guessed = [], dict, budget = HANGMAN_ENUM_BUDGET } = {}) {
  if (!dict?.has || !dict?.hasPrefix || !pattern.length || pattern.includes(' ')) return null
  const barred = new Set([...guessed].map(ch => String(ch).toLowerCase()))
  const allowed = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(ch => !barred.has(ch))
  const fixed = pattern.map(ch => (ch ? String(ch).toLowerCase() : null))
  const out = []
  let calls = 0
  const walk = (prefix) => {
    const i = prefix.length
    if (i === fixed.length) {
      if (dict.has(prefix)) out.push(prefix.toUpperCase())
      return true
    }
    for (const ch of fixed[i] ? [fixed[i]] : allowed) {
      if (++calls > budget) return false
      const next = prefix + ch
      if (dict.hasPrefix(next) && !walk(next)) return false
    }
    return true
  }
  return walk('') ? out : null
}

/**
 * The CPU guesser's next letter. With `candidates` (words that still fit)
 * it picks the letter found in the most of them; without, it follows
 * HANGMAN_LETTER_ORDER. Either way it slips to the 2nd/3rd best letter with
 * probability `slip`.
 */
export function pickHangmanGuess({
  guessed = [], candidates = null, slip = HANGMAN_BOT_SLIP, random = Math.random,
} = {}) {
  const done = new Set([...guessed].map(ch => String(ch).toUpperCase()))
  let ranked
  if (candidates && candidates.length) {
    const count = {}
    for (const w of candidates) {
      for (const ch of new Set(String(w).toUpperCase())) {
        if (/[A-Z]/.test(ch) && !done.has(ch)) count[ch] = (count[ch] || 0) + 1
      }
    }
    ranked = Object.keys(count).sort((a, b) => count[b] - count[a]
      || HANGMAN_LETTER_ORDER.indexOf(a) - HANGMAN_LETTER_ORDER.indexOf(b))
    // One word left: every remaining letter is a sure hit, so no slip.
    if (candidates.length === 1 && ranked.length) return ranked[0]
  }
  if (!ranked?.length) ranked = HANGMAN_LETTER_ORDER.split('').filter(ch => !done.has(ch))
  if (!ranked.length) return null
  if (ranked.length > 1 && random() < slip) {
    return ranked[1 + Math.floor(random() * Math.min(2, ranked.length - 1))]
  }
  return ranked[0]
}

/** Real delay before the CPU guesser's next letter. */
export function hangmanThinkMs(random = Math.random) {
  const [lo, hi] = HANGMAN_THINK_MS
  return Math.round(lo + random() * (hi - lo))
}
