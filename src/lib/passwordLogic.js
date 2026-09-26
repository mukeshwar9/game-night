import { editDistance, isCloseMatch, matchKey, normalizeText as normalizeMatchText } from './textMatchLogic'
import { isBannedWord } from './wordDenylist'

// Co-op scoring (captain decision D1, 2026-09-26 — reversible). The approved
// option was "the clue-giver scores like the guesser": both players earn the
// same points every round. In a two-player game that is one shared team score
// (a 1v1 under that rule would always tie), so Password is played as a team:
// each round's 5/4/3/2/1 points go to a team total over a fixed 12 rounds —
// 6 guessing turns each, roles alternating from `starter` — and the match
// ends with a star rating instead of a winner. To go back to head-to-head,
// credit only `lastDelta.player` and restore a first-to target.
export const MAX_ROUNDS = 12
export const MAX_CLUES = 5
export const CLUE_POINTS = [5, 4, 3, 2, 1]
export const MAX_TEAM_SCORE = MAX_ROUNDS * CLUE_POINTS[0]
// Kept for Game.jsx's `matchTargetFor` import. Co-op Password has no
// first-to target — the match is always MAX_ROUNDS long — so the "target" is
// the perfect team score, which can never end a match early.
export const TARGET_SCORE = MAX_TEAM_SCORE
// Team score needed for one, two and three stars (out of MAX_TEAM_SCORE).
// Starting values to playtest.
export const STAR_THRESHOLDS = [20, 30, 40]
export const INTRO_MS = 2000
export const REVEAL_MS = 5000
// Guess clock per clue number (1-indexed): the first two guesses get 30s,
// the next two 25s, the last 20s. Guessing gets tenser as clues run out.
export const GUESS_SECONDS = [30, 30, 25, 25, 20]
// Clue clock: the clue-giver has this long to send each clue. Expiry burns
// that clue slot as a miss (like a timed-out guess), so a stalling or
// disconnected clue-giver can never freeze the room. Starting value.
export const CLUE_SECONDS = 45
export const CLUE_MS = CLUE_SECONDS * 1000
// How long the partner must be offline before the online player is offered
// END MATCH (finishing with the current team score). Starting value.
export const PARTNER_OFFLINE_MS = 30_000

export function guessSecondsForClueNumber(clueNumber) {
  const n = Number(clueNumber)
  if (!Number.isFinite(n) || n < 1) return GUESS_SECONDS[0]
  return GUESS_SECONDS[Math.min(Math.floor(n), GUESS_SECONDS.length) - 1]
}

export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
}

// ── Clue rules ────────────────────────────────────────────────────────────
// A clue is one word of 3–16 letters (no digits, spaces or hyphens) that is
// not banned and does not give the password away. "Gives it away" means:
//   - it IS the password, a plural of it, or an inflection of it
//     (apples/apple, glass/glasses, baking/bake, happier/happy, running/run);
//   - it is the password spelled backwards (elppa);
//   - it shares a 5+ letter stem — a common prefix — with it (plane/planet,
//     mounting/mountain, birthmark/birthday);
//   - one contains the other (snow/snowman, plan/planet, ear/heart), unless
//     they differ only by one letter at the very start or end — that is
//     almost always a different real word (car/care, center/enter,
//     growl/grow, ideal/idea), so it stays allowed;
//   - it is within one edit of the password — one substitution, one letter
//     added or dropped inside the word, or two neighbouring letters swapped
//     (ample, aple, appel for apple) — with the same start/end exception.
// Foreign-language translations (manzana) can't be detected without a
// dictionary and stay an honour-system rule.
export const MIN_CLUE_LENGTH = 3
export const MAX_CLUE_LENGTH = 16
export const SHARED_STEM_LENGTH = 5

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

/** Inflected forms of a lowercase base word: plurals, -ed/-ing/-er/-est
 * (with e-drop, y→i and a doubled final consonant: stop → stopped). */
export function inflectionsOf(base) {
  const w = String(base ?? '')
  const forms = new Set()
  if (w.length < 2) return forms
  const last = w[w.length - 1]
  const prev = w[w.length - 2]
  const add = (stem, suffixes) => suffixes.forEach(suffix => forms.add(stem + suffix))
  add(w, ['s', 'ly'])
  if (/(s|x|z|ch|sh|o)$/.test(w)) add(w, ['es'])
  if (last === 'y' && !VOWELS.has(prev)) {
    add(w.slice(0, -1), ['ies', 'ied', 'ier', 'iers', 'iest', 'ily', 'iness'])
    add(w, ['ing'])
  } else if (last === 'e') {
    add(w, ['d', 'r', 'rs', 'st'])
    add(w.slice(0, -1), ['ing', 'ings'])
  } else {
    add(w, ['ed', 'ing', 'ings', 'er', 'ers', 'est', 'ness'])
    const cvc = w.length >= 3 && !VOWELS.has(last) && !'wxy'.includes(last) && VOWELS.has(prev) && !VOWELS.has(w[w.length - 3])
    if (cvc) add(w + last, ['ed', 'ing', 'er', 'ers', 'est'])
  }
  return forms
}

function isInflectionPair(a, b) {
  return inflectionsOf(a).has(b) || inflectionsOf(b).has(a)
}

function commonPrefixLength(a, b) {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1
  return n
}

// One word is the other plus a single letter at the very start or end
// (car/care, enter/center): usually a different real word, so allowed.
function differsOnlyAtEdge(a, b) {
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  if (long.length - short.length !== 1) return false
  return long.slice(1) === short || long.slice(0, -1) === short
}

// Within one edit: Levenshtein ≤ 1, or two neighbouring letters swapped.
function isOneEditOrSwap(a, b) {
  if (editDistance(a, b, 1) <= 1) return true
  if (a.length !== b.length) return false
  const diffs = []
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diffs.push(i)
  return diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]]
}

function reject(reason) {
  return { valid: false, reason }
}

export function validateClue({ clue, word, previousClues = [] }) {
  const raw = String(clue ?? '').trim()
  const normalizedClue = normalizeMatchText(raw)
  const normalizedWord = normalizeMatchText(word).replace(/ /g, '')
  if (!raw) return reject('CLUE CANNOT BE BLANK')
  if (!normalizedClue) return reject('USE LETTERS A–Z')
  if (normalizedClue.includes(' ')) return reject('ONE WORD ONLY — NO SPACES OR HYPHENS')
  if (/[0-9]/.test(normalizedClue)) return reject('LETTERS ONLY — NO NUMBERS')
  if (normalizedClue.length > MAX_CLUE_LENGTH) return reject(`CLUE MUST BE ${MAX_CLUE_LENGTH} LETTERS OR LESS`)
  if (normalizedClue.length < MIN_CLUE_LENGTH) return reject(`CLUE MUST BE AT LEAST ${MIN_CLUE_LENGTH} LETTERS`)
  if (isBannedWord(normalizedClue)) return reject('THAT CLUE IS NOT ALLOWED')
  if (normalizedWord) {
    const c = normalizedClue
    const w = normalizedWord
    if (c === w || spellingKey(c) === spellingKey(w)) return reject('CLUE CANNOT BE THE PASSWORD')
    if (isInflectionPair(c, w)) return reject('NO FORMS OF THE PASSWORD (PLURALS, -ING, -ED…)')
    if (c === [...w].reverse().join('')) return reject('NO SPELLING THE PASSWORD BACKWARDS')
    const edge = differsOnlyAtEdge(c, w)
    if (!edge && w.includes(c)) return reject('CLUE CANNOT BE PART OF THE PASSWORD')
    if (!edge && c.includes(w)) return reject('CLUE CANNOT CONTAIN THE PASSWORD')
    if (commonPrefixLength(c, w) >= SHARED_STEM_LENGTH) return reject('CLUE SHARES TOO MUCH OF THE PASSWORD')
    if (!edge && isOneEditOrSwap(c, w)) return reject('TOO CLOSE TO THE PASSWORD')
  }
  const key = matchKey(normalizedClue)
  if (toList(previousClues).some(item => {
    const text = item?.text ?? item
    return typeof text === 'string' && text && matchKey(text) === key
  })) {
    return reject('CLUE ALREADY USED')
  }
  return { valid: true, value: normalizedClue }
}

// ── Guess matching ────────────────────────────────────────────────────────
// Guesses are typed on a phone under a 20–30 s clock, so a right answer must
// not miss on spelling: plurals, spacing/hyphens and a leading article fold
// away (`matchKey`: apples/apple, birth day/birthday, glass/glasses), US/UK
// spellings are one word (theatre/theater), and passwords of TYPO_MIN_LENGTH+
// letters forgive one typo (elephnt, elpehant). Short passwords stay exact so
// "aple" never scores for APPLE and "car" never for CARE.
export const TYPO_MIN_LENGTH = 6

// US/UK (and common alternate) spellings; the first of each pair is the
// canonical form both fold to.
export const SPELLING_VARIANTS = [
  ['theater', 'theatre'], ['color', 'colour'], ['gray', 'grey'], ['center', 'centre'],
  ['favorite', 'favourite'], ['organize', 'organise'], ['honor', 'honour'], ['neighbor', 'neighbour'],
  ['flavor', 'flavour'], ['harbor', 'harbour'], ['humor', 'humour'], ['labor', 'labour'],
  ['meter', 'metre'], ['liter', 'litre'], ['fiber', 'fibre'], ['jewelry', 'jewellery'],
  ['pajamas', 'pyjamas'], ['donut', 'doughnut'], ['tire', 'tyre'], ['aluminum', 'aluminium'],
  ['mustache', 'moustache'], ['cozy', 'cosy'], ['plow', 'plough'], ['airplane', 'aeroplane'],
  ['catalog', 'catalogue'], ['defense', 'defence'], ['license', 'licence'], ['traveler', 'traveller'],
  ['realize', 'realise'], ['apologize', 'apologise'], ['analyze', 'analyse'], ['yogurt', 'yoghurt'],
  ['mom', 'mum'], ['ax', 'axe'], ['program', 'programme'], ['sulfur', 'sulphur'],
  ['armor', 'armour'], ['behavior', 'behaviour'], ['odor', 'odour'], ['rumor', 'rumour'],
  ['vapor', 'vapour'], ['kilometer', 'kilometre'], ['skeptic', 'sceptic'], ['gauge', 'gage'],
]

const SPELLING_CANON = new Map()
for (const [canonical, ...variants] of SPELLING_VARIANTS) {
  for (const variant of variants) SPELLING_CANON.set(matchKey(variant), matchKey(canonical))
}

/** `matchKey` with US/UK spellings folded to one form. */
export function spellingKey(text) {
  const key = matchKey(text)
  return SPELLING_CANON.get(key) ?? key
}

export function isCorrectGuess(guess, word) {
  const g = spellingKey(guess)
  const a = spellingKey(word)
  if (!g || !a) return false
  if (isCloseMatch(g, a, { typoMinLength: TYPO_MIN_LENGTH })) return true
  // One swapped pair of neighbouring letters is also a single typo.
  return a.length >= TYPO_MIN_LENGTH && isOneEditOrSwap(g, a)
}

export function scoreForClueNumber(clueNumber) {
  return CLUE_POINTS[Number(clueNumber) - 1] ?? 0
}

/** Stars (0–3) a team total earns against STAR_THRESHOLDS. */
export function starRating(teamScore) {
  const total = Number(teamScore) || 0
  return STAR_THRESHOLDS.filter(threshold => total >= threshold).length
}

/** Both seats carry the team total so shared UI (player cards, history)
 * never shows the partners as rivals. */
export function teamScoresFor(teamScore) {
  const total = Math.max(0, Number(teamScore) || 0)
  return { X: total, O: total }
}

/** Firebase returns append-only lists as arrays, numeric-keyed objects, or
 * nothing at all (empty arrays are deleted) — map by explicit key. */
export function toList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(item => item != null)
  const out = []
  Object.entries(raw).forEach(([key, value]) => {
    const index = parseInt(key, 10)
    if (Number.isInteger(index) && index >= 0 && value != null) out[index] = value
  })
  return out.filter(item => item != null)
}

/** The highest-scoring round of a match recap (earliest wins a tie), or null
 * when the team never scored. */
export function bestRound(history) {
  let best = null
  for (const entry of toList(history)) {
    if ((entry?.points || 0) > (best?.points || 0)) best = entry
  }
  return best
}

export function nextRoles(currentClueGiver) {
  const clueGiver = currentClueGiver === 'O' ? 'X' : 'O'
  return { clueGiver, guesser: clueGiver === 'X' ? 'O' : 'X' }
}

function seededRandom(seed) {
  let value = 2166136261
  for (const char of String(seed ?? '')) {
    value ^= char.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return () => {
    value += 0x6D2B79F5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickWord(deck, seed, used = []) {
  if (!Array.isArray(deck) || deck.length === 0) return -1
  const usedSet = new Set(used.map(Number))
  const available = deck.map((_, index) => index).filter(index => !usedSet.has(index))
  const pool = available.length ? available : deck.map((_, index) => index)
  const random = seededRandom(seed)
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool[0]
}

// Difficulty curve: rounds 1–4 draw tier-1 words, 5–8 tier 2, 9–12 tier 3.
export const ROUNDS_PER_TIER = 4

export function tierForRound(roundNum) {
  const n = Math.max(1, Math.floor(Number(roundNum) || 1))
  return Math.min(3, Math.ceil(n / ROUNDS_PER_TIER))
}

/** Seeded, no-repeat word pick for a round, from that round's tier. Falls
 * back to any unused word when the tier is exhausted, then to the whole deck
 * (so it never fails). Returns a deck index, or -1 for an empty deck. */
export function pickWordForRound(deck, seed, used = [], roundNum = 1) {
  if (!Array.isArray(deck) || deck.length === 0) return -1
  const usedSet = new Set(toList(used).map(Number))
  const tier = tierForRound(roundNum)
  const all = deck.map((_, index) => index)
  const unused = all.filter(index => !usedSet.has(index))
  const inTier = unused.filter(index => Number(deck[index]?.tier) === tier)
  const pool = inTier.length ? inTier : unused.length ? unused : all
  const random = seededRandom(`${seed ?? ''}:${roundNum}`)
  return pool[Math.floor(random() * pool.length)]
}

export function createInitialRound({ starter = 'X', seed, wordIndex, wordLength = null }) {
  const clueGiver = starter === 'O' ? 'O' : 'X'
  return {
    phase: 'intro',
    roundNum: 1,
    clueGiver,
    guesser: clueGiver === 'X' ? 'O' : 'X',
    matchSeed: String(seed ?? ''),
    used: [wordIndex],
    wordIndex,
    wordPattern: wordLength ? String(wordLength) : '',
    clues: [],
    guesses: [],
    lastDelta: null,
    teamScore: 0,
    history: [],
    endsAt: null,
  }
}

// Close out a round: record it in the match recap, bank its points into the
// team total, and hand over to the reveal.
function resolveRound(round, { points = 0, clueNumber = 0, guesses, now }) {
  const entry = {
    roundNum: round.roundNum,
    wordIndex: round.wordIndex,
    clueGiver: round.clueGiver,
    guesser: round.guesser,
    points,
    clueNumber: points ? clueNumber : 0,
  }
  return {
    ...round,
    phase: 'reveal',
    guesses,
    lastDelta: points ? { player: round.guesser, points, clueNumber } : null,
    teamScore: (Number(round.teamScore) || 0) + points,
    history: [...toList(round.history), entry],
    endsAt: now + REVEAL_MS,
  }
}

/** Intro deadline reached: open the clue phase with the clue clock armed.
 * Null when the intro is not over (or the round already moved on). */
export function startCluePhase(round, now = Date.now()) {
  if (!round || round.phase !== 'intro') return null
  if (round.endsAt && now < round.endsAt) return null
  return { ...round, phase: 'clue', endsAt: now + CLUE_MS }
}

// A clue slot left to expire: burns it as a miss (a blank timed-out clue plus
// a timed-out guess, so the next clue scores one step less) and re-arms the
// clue clock — or reveals the word when that was the last slot. Null when the
// timeout does not apply (wrong phase, stale clock, already moved).
export function applyClueTimeout(round, now = Date.now()) {
  const clues = toList(round?.clues)
  if (!round || round.phase !== 'clue' || clues.length >= MAX_CLUES) return null
  if (!round.endsAt || now <= round.endsAt) return null
  const nextClues = [...clues, { text: '', at: now, timeout: true }]
  const nextGuesses = [...toList(round.guesses), { text: '', at: now, correct: false, timeout: true, noClue: true }]
  if (nextClues.length >= MAX_CLUES) return resolveRound({ ...round, clues: nextClues }, { guesses: nextGuesses, now })
  return {
    ...round,
    clues: nextClues,
    guesses: nextGuesses,
    lastDelta: null,
    endsAt: now + CLUE_MS,
  }
}

/** True once the partner has been offline for PARTNER_OFFLINE_MS. */
export function canEndForAbsence(offlineSince, now = Date.now()) {
  return Number.isFinite(offlineSince) && offlineSince != null && now - offlineSince >= PARTNER_OFFLINE_MS
}

/** END MATCH while the partner is away: finish now with the team score
 * banked so far (rounds already revealed stay in the recap). Co-op, so the
 * result is a 'draw', like a full match. Null once the match is over. */
export function endMatchEarly(round, scores = {}) {
  if (!round || round.phase === 'finished') return null
  const teamScore = teamScoreOf(round, scores)
  return {
    winner: 'draw',
    status: 'finished',
    scores: teamScoresFor(teamScore),
    round: { ...round, teamScore, phase: 'finished', endsAt: null, endedEarly: true },
  }
}

export function applyClue(round, clue, now = Date.now()) {
  const clues = toList(round?.clues)
  if (!round || round.phase !== 'clue' || clues.length >= MAX_CLUES) return null
  // Late clues lose the race to the clock — the timeout owns the slot.
  if (round.endsAt && now > round.endsAt) return null
  const check = validateClue({ clue, word: round.word ?? '', previousClues: clues })
  if (!check.valid) return null
  const clueNumber = clues.length + 1
  const next = {
    ...round,
    phase: 'guess',
    clues: [...clues, { text: check.value, at: now }],
    endsAt: now + guessSecondsForClueNumber(clueNumber) * 1000,
  }
  delete next.word
  return next
}

export function applyGuess(round, guess, word, now = Date.now()) {
  const clueNumber = toList(round?.clues).length
  if (!round || round.phase !== 'guess' || clueNumber < 1) return null
  // Late guesses lose the race to the clock — the timeout owns the slot.
  if (round.endsAt && now > round.endsAt) return null
  const text = normalizeText(guess)
  if (!text || text.length > 24) return null
  const correct = isCorrectGuess(text, word)
  const nextGuesses = [...toList(round.guesses), { text, at: now, correct }]
  if (correct) return resolveRound(round, { points: scoreForClueNumber(clueNumber), clueNumber, guesses: nextGuesses, now })
  if (clueNumber >= MAX_CLUES) return resolveRound(round, { guesses: nextGuesses, now })
  return {
    ...round,
    phase: 'clue',
    guesses: nextGuesses,
    lastDelta: null,
    endsAt: now + CLUE_MS,
  }
}

// A guess slot left to expire: records a timed-out miss and hands play back
// to the clue giver with the clue clock armed (or to reveal when the last
// clue is spent). Returns null
// when the timeout does not apply (wrong phase, stale clock, already moved).
export function applyGuessTimeout(round, now = Date.now()) {
  const clueNumber = toList(round?.clues).length
  if (!round || round.phase !== 'guess' || clueNumber < 1) return null
  if (!round.endsAt || now <= round.endsAt) return null
  const nextGuesses = [...toList(round.guesses), { text: '', at: now, correct: false, timeout: true }]
  if (clueNumber >= MAX_CLUES) return resolveRound(round, { guesses: nextGuesses, now })
  return {
    ...round,
    phase: 'clue',
    guesses: nextGuesses,
    lastDelta: null,
    endsAt: now + CLUE_MS,
  }
}

/** Co-op: the match is over after MAX_ROUNDS rounds, and nobody loses — the
 * result is always 'draw' (the team score and stars are the outcome).
 * The first argument (seat scores) is kept for backward compatibility and
 * no longer decides anything. */
export function getMatchWinner(...args) {
  const roundNum = args[1] ?? 0
  return Number(roundNum) >= MAX_ROUNDS ? 'draw' : null
}

/** The team total a round carries, falling back to the seat scores for
 * rounds written before co-op scoring existed. */
export function teamScoreOf(round, scores = {}) {
  const stored = Number(round?.teamScore)
  if (round?.teamScore != null && Number.isFinite(stored)) return stored
  return Math.max(Number(scores?.X) || 0, Number(scores?.O) || 0)
}

export function advanceAfterReveal(round, scores = {}, deck, now = Date.now()) {
  if (!round || round.phase !== 'reveal') return null
  const teamScore = teamScoreOf(round, scores)
  const team = teamScoresFor(teamScore)
  const winner = getMatchWinner(team, round.roundNum)
  if (winner) return { winner, status: 'finished', scores: team, round: { ...round, teamScore, phase: 'finished', endsAt: null } }
  const used = toList(round.used)
  const roundNum = round.roundNum + 1
  const index = pickWordForRound(deck, round.matchSeed, used, roundNum)
  const roles = nextRoles(round.clueGiver)
  const next = {
    ...round,
    phase: 'intro',
    roundNum,
    clueGiver: roles.clueGiver,
    guesser: roles.guesser,
    used: [...used, index],
    wordIndex: index,
    wordPattern: deck?.[index]?.word ? String(deck[index].word.length) : '',
    clues: [],
    guesses: [],
    lastDelta: null,
    teamScore,
    endsAt: now + INTRO_MS,
  }
  return { winner: null, status: 'playing', scores: team, round: next }
}
