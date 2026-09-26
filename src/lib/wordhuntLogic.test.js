import { describe, it, expect } from 'vitest'
import { seededShuffle } from './fibbageLogic'
import {
  BOGGLE_DICE, GRID_SIZE, CELL_COUNT,
  generateGrid, rowColOf, indexOf, neighborsOf,
  canonicalize, findPath, scoreWord, scoreWords, createDictionary,
  normalizeWordList, nextWordIndex, verifyWords, compareHunt, finishHuntRound,
  roundDeadline, COUNTDOWN_MS, ROUND_MS,
  solveGrid, ensurePlayableGrid, wordhuntReadyUpdate, MIN_GRID_WORDS,
  topMissedWords, TOP_MISSED_COUNT,
} from './wordhuntLogic'

// NOTE: this file must never import wordhuntDictionary.js (the lazy loader
// that fetches the huge public/wordhunt-dict.txt word list) — it tests pure
// grid/path/scoring logic only.

// ── helpers to build small hand-authored test grids ────────────────────────

function buildGrid(overrides) {
  const letters = Array(CELL_COUNT).fill('x')
  for (const [idx, letter] of Object.entries(overrides)) {
    letters[Number(idx)] = letter
  }
  return letters.join('')
}

describe('generateGrid', () => {
  it('is deterministic for the same seed', () => {
    expect(generateGrid(42)).toBe(generateGrid(42))
    expect(generateGrid(123456)).toBe(generateGrid(123456))
  })

  it('differs across at least one of several seed pairs', () => {
    const seeds = [1, 2, 3, 4, 5]
    const grids = seeds.map(s => generateGrid(s))
    const allSame = grids.every(g => g === grids[0])
    expect(allSame).toBe(false)
  })

  it('always outputs exactly 16 characters', () => {
    for (const seed of [0, 1, 999, 1_000_000]) {
      expect(generateGrid(seed).length).toBe(CELL_COUNT)
    }
  })

  it('every character is a lowercase letter (a-z)', () => {
    for (const seed of [7, 88, 4242]) {
      const grid = generateGrid(seed)
      for (const ch of grid) {
        expect(/^[a-z]$/.test(ch)).toBe(true)
      }
    }
  })

  it('uses each of the 16 BOGGLE_DICE exactly once (dice coverage)', () => {
    for (const seed of [1, 2, 3, 100]) {
      const diceOrder = seededShuffle(BOGGLE_DICE, seed)
      expect(diceOrder.length).toBe(BOGGLE_DICE.length)
      expect([...diceOrder].sort()).toEqual([...BOGGLE_DICE].sort())
    }
  })

  it('exactly one cell is produced by the himnqu die, and its letter is one of h,i,m,n,q,u', () => {
    for (const seed of [1, 2, 3, 100]) {
      const diceOrder = seededShuffle(BOGGLE_DICE, seed)
      const quCellIndex = diceOrder.indexOf('himnqu')
      expect(quCellIndex).toBeGreaterThanOrEqual(0)
      // only one die is 'himnqu'
      expect(diceOrder.filter(d => d === 'himnqu').length).toBe(1)

      const grid = generateGrid(seed)
      expect('himnqu'.includes(grid[quCellIndex])).toBe(true)
    }
  })
})

describe('rowColOf / indexOf', () => {
  it('round-trips', () => {
    for (let i = 0; i < CELL_COUNT; i++) {
      const [r, c] = rowColOf(i)
      expect(indexOf(r, c)).toBe(i)
    }
  })
})

describe('neighborsOf', () => {
  it('corner cell (0) has exactly 3 neighbors', () => {
    expect(neighborsOf(0).length).toBe(3)
  })

  it('edge, non-corner cell (1) has exactly 5 neighbors', () => {
    expect(neighborsOf(1).length).toBe(5)
  })

  it('interior cell (5) has exactly 8 neighbors', () => {
    expect(neighborsOf(5).length).toBe(8)
  })

  it('never includes the input index itself', () => {
    for (let i = 0; i < CELL_COUNT; i++) {
      expect(neighborsOf(i).includes(i)).toBe(false)
    }
  })

  it('GRID_SIZE is 4', () => {
    expect(GRID_SIZE).toBe(4)
  })
})

describe('findPath', () => {
  it('finds a simple adjacent word', () => {
    // 0='c', 1='a', 2='t' — all in row 0, mutually adjacent in sequence
    const grid = buildGrid({ 0: 'c', 1: 'a', 2: 't' })
    const path = findPath(grid, 'cat')
    expect(path).not.toBeNull()
    // decodes back to "cat" and each consecutive pair is adjacent
    const word = path.map(i => grid[i]).join('')
    expect(word).toBe('cat')
    for (let i = 0; i < path.length - 1; i++) {
      expect(neighborsOf(path[i])).toContain(path[i + 1])
    }
  })

  it('returns null when the letters do not appear in the grid at all', () => {
    const grid = buildGrid({ 0: 'c', 1: 'a', 2: 't' })
    expect(findPath(grid, 'dog')).toBeNull()
  })

  it('returns null when letters exist but are never adjacent in the required order', () => {
    // c at 0, a at 2 (not a neighbor of 0 — same row, 2 cols apart), t at 3
    const grid = buildGrid({ 0: 'c', 2: 'a', 3: 't' })
    expect(findPath(grid, 'cat')).toBeNull()
  })

  it('does not allow reusing a tile', () => {
    // a=0, b=1 (adjacent). Every other neighbor of 1 is 'x', so "aba" would
    // require revisiting tile 0 — must fail.
    const grid = buildGrid({ 0: 'a', 1: 'b' })
    expect(findPath(grid, 'aba')).toBeNull()
  })

  it('qu tile consumes 2 characters in a single step', () => {
    // 0='q', 1='i', 2='e', 3='t' — chain spells "qu"+"i"+"e"+"t" = "quiet"
    const grid = buildGrid({ 0: 'q', 1: 'i', 2: 'e', 3: 't' })
    const path = findPath(grid, 'quiet')
    expect(path).not.toBeNull()
    expect(path).toEqual([0, 1, 2, 3])
    // path length (4 tiles) is less than the word length (5 letters)
    expect(path.length).toBeLessThan('quiet'.length)
  })

  it('honors 8-direction (diagonal) adjacency', () => {
    // c=0 (row0,col0), a=5 (row1,col1 — diagonal neighbor of 0),
    // t=10 (row2,col2 — diagonal neighbor of 5). No orthogonal path exists.
    const grid = buildGrid({ 0: 'c', 5: 'a', 10: 't' })
    expect(neighborsOf(0)).toContain(5)
    expect(neighborsOf(5)).toContain(10)
    const path = findPath(grid, 'cat')
    expect(path).toEqual([0, 5, 10])
  })

  it('returns null for empty/whitespace input', () => {
    const grid = buildGrid({ 0: 'c', 1: 'a', 2: 't' })
    expect(findPath(grid, '')).toBeNull()
    expect(findPath(grid, '   ')).toBeNull()
  })
})

describe('scoreWord', () => {
  it('follows the classic Boggle table boundaries', () => {
    expect(scoreWord('ab')).toBe(0)          // length 2
    expect(scoreWord('abc')).toBe(1)         // length 3
    expect(scoreWord('abcd')).toBe(1)        // length 4
    expect(scoreWord('abcde')).toBe(2)       // length 5
    expect(scoreWord('abcdef')).toBe(3)      // length 6
    expect(scoreWord('abcdefg')).toBe(5)     // length 7
    expect(scoreWord('abcdefgh')).toBe(11)   // length 8
    expect(scoreWord('abcdefghi')).toBe(11)  // length 9 — still 8+ bucket
  })
})

describe('scoreWords', () => {
  it('sums correctly over a mixed-length list', () => {
    // cat(1) + house(2) + wonders(5) = 8
    expect(scoreWords(['cat', 'house', 'wonders'])).toBe(8)
  })

  it('returns 0 for an empty list', () => {
    expect(scoreWords([])).toBe(0)
    expect(scoreWords(undefined)).toBe(0)
  })
})

describe('canonicalize', () => {
  it('trims whitespace and lowercases', () => {
    expect(canonicalize('  CaT  ')).toBe('cat')
  })

  it('handles undefined/null', () => {
    expect(canonicalize(undefined)).toBe('')
    expect(canonicalize(null)).toBe('')
  })
})

describe('createDictionary — content safety (G-01)', () => {
  const G01 = [
    'nigger', 'niggers', 'cunt', 'cunts', 'fuck', 'fucks', 'fucked', 'fucker',
    'fuckers', 'fucking', 'fuckup', 'motherfucker',
  ]

  it('regression G-01: slurs and vulgar words (and inflections) are never valid, even if listed', () => {
    const dict = createDictionary(['cat', ...G01, 'dog'])
    for (const word of G01) {
      expect(dict.has(word), word).toBe(false)
      expect(dict.has(word.toUpperCase()), word).toBe(false)
    }
    expect(dict.has('cat')).toBe(true)
    expect(dict.has('DOG')).toBe(true)
  })

  it('keeps homographs findable (only missed-word displays hide them)', () => {
    const dict = createDictionary(['tit', 'ass', 'cock', 'screw'])
    for (const word of ['tit', 'ass', 'cock', 'screw']) expect(dict.has(word), word).toBe(true)
  })

  it('canonicalizes lines, drops blanks and answers prefix queries on unsorted input', () => {
    const dict = createDictionary(['Dog\r', '', '  cat ', 'catalog'])
    expect(dict.size).toBe(3)
    expect(dict.has('cat')).toBe(true)
    expect(dict.hasPrefix('cata')).toBe(true)
    expect(dict.hasPrefix('do')).toBe(true)
    expect(dict.hasPrefix('dox')).toBe(false)
    expect(dict.hasPrefix('zz')).toBe(false)
  })

  it('regression G-01: the shipped dictionary file contains no banned word', async () => {
    const { readFileSync } = await import('node:fs')
    const { isBannedWord } = await import('./wordDenylist')
    const text = readFileSync(new URL('../../public/wordhunt-dict.txt', import.meta.url), 'utf8')
    const raw = text.split('\n').filter(Boolean)
    expect(raw.filter(isBannedWord)).toEqual([])
    const dict = createDictionary(raw)
    for (const word of G01) expect(dict.has(word), word).toBe(false)
    expect(dict.has('planet')).toBe(true)
  })
})

// Row 0: C A T S · row 1: D O G x — cat/cats/dog/god/cog/dot/tog traceable,
// "act" is a word but not traceable (C and T are not adjacent).
const HUNT_GRID = 'catsdogxxxxxxxxx'
const HUNT_DICT = createDictionary(['cat', 'cats', 'dog', 'god', 'cog', 'act', 'dot', 'tog', 'plane'])

describe('normalizeWordList / nextWordIndex', () => {
  it('orders numeric keys numerically and drops gaps', () => {
    expect(normalizeWordList({ 10: 'c', 2: 'b', 0: 'a' })).toEqual(['a', 'b', 'c'])
    expect(normalizeWordList(['a', null, 'b'])).toEqual(['a', 'b'])
    expect(normalizeWordList(null)).toEqual([])
  })

  it('never reuses a slot left by a failed write', () => {
    expect(nextWordIndex(null)).toBe(0)
    expect(nextWordIndex(['a', 'b'])).toBe(2)
    expect(nextWordIndex({ 0: 'a', 2: 'c' })).toBe(3)
  })
})

describe('verifyWords', () => {
  it('keeps canonical, deduped, dictionary, traceable words only', () => {
    const out = verifyWords(['cat', 'CAT', 'act', 'zzz', 'at', 'dog', null], HUNT_GRID, HUNT_DICT)
    expect(out.words).toEqual(['cat', 'dog'])
    expect(out.rejected).toEqual(['act', 'zzz', 'at'])
    expect(out.score).toBe(2)
  })

  it('verifies nothing without a dictionary', () => {
    expect(verifyWords(['cat'], HUNT_GRID, null).words).toEqual([])
  })
})

describe('compareHunt', () => {
  it('most points wins', () => {
    expect(compareHunt(['plane'], ['cat'])).toMatchObject({ winner: 'X', decidedBy: 'points', scoreX: 2, scoreO: 1 })
  })

  it('equal points: more words wins', () => {
    expect(compareHunt(['plane'], ['cat', 'dog'])).toMatchObject({ winner: 'O', decidedBy: 'words', scoreX: 2, scoreO: 2 })
  })

  it('equal points and words: longest word wins', () => {
    expect(compareHunt(['cats', 'dog'], ['cat', 'dog'])).toMatchObject({ winner: 'X', decidedBy: 'longest', longestX: 4, longestO: 3 })
  })

  it('otherwise a draw', () => {
    expect(compareHunt(['cat'], ['dog'])).toMatchObject({ winner: 'draw', decidedBy: 'draw' })
    expect(compareHunt([], [])).toMatchObject({ winner: 'draw', decidedBy: 'draw' })
  })
})

describe('finishHuntRound', () => {
  const startedAt = 1_000
  const end = roundDeadline(startedAt)
  const game = (extra = {}) => ({
    status: 'playing', scores: { X: 1, O: 0 }, wordhuntGrid: HUNT_GRID, wordhuntStartedAt: startedAt,
    wordhuntWordsX: ['cat'], wordhuntWordsO: ['cats', 'dog'], ...extra,
  })

  it('computes the deadline from the start stamp', () => {
    expect(end).toBe(startedAt + COUNTDOWN_MS + ROUND_MS)
    expect(roundDeadline(null)).toBe(null)
  })

  it('aborts before the deadline, once finished, or without a dictionary', () => {
    expect(finishHuntRound(game(), { now: end - 1, dict: HUNT_DICT })).toBeUndefined()
    expect(finishHuntRound(game({ status: 'finished' }), { now: end, dict: HUNT_DICT })).toBeUndefined()
    expect(finishHuntRound(game(), { now: end, dict: null })).toBeUndefined()
    expect(finishHuntRound(null, { now: end, dict: HUNT_DICT })).toBeUndefined()
  })

  it('awards the round from verified words', () => {
    const next = finishHuntRound(game(), { now: end, dict: HUNT_DICT })
    expect(next).toMatchObject({ status: 'finished', winner: 'O', wordhuntScoreX: 1, wordhuntScoreO: 2 })
    expect(next.scores).toEqual({ X: 1, O: 1 })
  })

  it('regression: self-reported scores and forged words are never trusted', () => {
    const next = finishHuntRound(game({
      wordhuntScoreX: 99, wordhuntWordsX: ['act', 'zzzzzzzz', 'cat', 'cat'], wordhuntWordsO: ['dog'],
    }), { now: end, dict: HUNT_DICT })
    expect(next).toMatchObject({ wordhuntScoreX: 1, wordhuntScoreO: 1, winner: 'draw' })
    expect(next.scores).toEqual({ X: 1, O: 0 })
  })

  it('breaks equal points by word count', () => {
    const next = finishHuntRound(game({ wordhuntWordsX: ['cat', 'dog'], wordhuntWordsO: ['cats'] }), { now: end, dict: HUNT_DICT })
    expect(next.winner).toBe('X')
  })
})

// The real shipped dictionary, read from disk (no fetch), shared by the
// solver/grid-floor tests below.
let realDict = null
async function loadRealDict() {
  if (!realDict) {
    const { readFileSync } = await import('node:fs')
    realDict = createDictionary(readFileSync(new URL('../../public/wordhunt-dict.txt', import.meta.url), 'utf8').split('\n'))
  }
  return realDict
}

// Deterministic Math.random stand-in for re-roll tests.
function seededRandom(seed) {
  let x = seed >>> 0
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0
    return x / 4_294_967_296
  }
}

describe('solveGrid', () => {
  it('finds every traceable dictionary word, longest first', () => {
    expect(solveGrid(HUNT_GRID, HUNT_DICT)).toEqual(['cats', 'cat', 'cog', 'dog', 'dot', 'god', 'tog'])
  })

  it('returns [] without a usable dictionary or grid', () => {
    expect(solveGrid(HUNT_GRID, null)).toEqual([])
    expect(solveGrid(HUNT_GRID, { has: () => true })).toEqual([])
    expect(solveGrid('abc', HUNT_DICT)).toEqual([])
  })

  it('spells the Qu tile as "qu"', () => {
    const grid = buildGrid({ 0: 'q', 1: 'i', 2: 't' })
    expect(solveGrid(grid, createDictionary(['quit', 'qit']))).toEqual(['quit'])
  })

  it('agrees with findPath and the dictionary on real grids', async () => {
    const dict = await loadRealDict()
    for (const seed of [1, 2, 3]) {
      const grid = generateGrid(seed)
      const words = solveGrid(grid, dict)
      expect(words.length).toBeGreaterThan(0)
      for (const w of words) {
        expect(dict.has(w), w).toBe(true)
        expect(findPath(grid, w), w).not.toBeNull()
      }
    }
  })
})

describe('grid floor', () => {
  const WORST = 'ecttzbrhhdmyxnsr' // 7 words in the review's 500-grid sample

  it('regression: a starved grid is re-rolled up to the word floor', async () => {
    const dict = await loadRealDict()
    expect(solveGrid(WORST, dict).length).toBeLessThan(MIN_GRID_WORDS)
    const lifted = ensurePlayableGrid(WORST, dict, { random: seededRandom(7) })
    expect(lifted).not.toBe(WORST)
    expect(lifted).toHaveLength(16)
    expect(solveGrid(lifted, dict).length).toBeGreaterThanOrEqual(MIN_GRID_WORDS)
  })

  it('keeps a grid that already clears the floor', () => {
    const rich = createDictionary(['cat', 'cats', 'dog'])
    expect(ensurePlayableGrid(HUNT_GRID, rich, { minWords: 3, random: () => { throw new Error('no re-roll') } })).toBe(HUNT_GRID)
  })

  it('stops after the re-roll budget and keeps the best grid seen', () => {
    const grid = ensurePlayableGrid(HUNT_GRID, HUNT_DICT, { minWords: 1_000, maxTries: 3, random: seededRandom(1) })
    expect(grid).toHaveLength(16)
  })
})

describe('wordhuntReadyUpdate — both players ready before the clock starts', () => {
  const lobby = (extra = {}) => ({ status: 'playing', wordhuntGrid: HUNT_GRID, ...extra })
  const rich = createDictionary(['cat', 'cats', 'dog'])
  const opts = { now: 5_000, dict: rich, random: seededRandom(3) }

  it('regression: one READY no longer starts both clocks', () => {
    const next = wordhuntReadyUpdate(lobby(), { ...opts, symbol: 'X' })
    expect(next.wordhuntReadyX).toBe(true)
    expect(next.wordhuntStartedAt).toBeUndefined()
  })

  it('starts when the second seat readies, lifting the grid to the floor', () => {
    const next = wordhuntReadyUpdate(lobby({ wordhuntReadyX: true }), { ...opts, symbol: 'O' })
    expect(next).toMatchObject({ wordhuntReadyX: true, wordhuntReadyO: true, wordhuntStartedAt: 5_000 })
    expect(next.wordhuntGrid).toHaveLength(16)
  })

  it('writes the lifted grid, not the lobby grid, when the lobby grid is starved', async () => {
    const dict = await loadRealDict()
    const starved = 'ecttzbrhhdmyxnsr'
    const next = wordhuntReadyUpdate(lobby({ wordhuntGrid: starved, wordhuntReadyX: true }), { ...opts, dict, symbol: 'O' })
    expect(next.wordhuntStartedAt).toBe(5_000)
    expect(next.wordhuntGrid).not.toBe(starved)
    expect(solveGrid(next.wordhuntGrid, dict).length).toBeGreaterThanOrEqual(MIN_GRID_WORDS)
  })

  it('either client can start once both flags are set (no seat)', () => {
    expect(wordhuntReadyUpdate(lobby({ wordhuntReadyX: true, wordhuntReadyO: true }), opts).wordhuntStartedAt).toBe(5_000)
  })

  it('never starts without a dictionary on the running client', () => {
    const next = wordhuntReadyUpdate(lobby({ wordhuntReadyX: true }), { ...opts, dict: null, symbol: 'O' })
    expect(next).toMatchObject({ wordhuntReadyO: true })
    expect(next.wordhuntStartedAt).toBeUndefined()
    expect(wordhuntReadyUpdate(lobby({ wordhuntReadyX: true, wordhuntReadyO: true }), { ...opts, dict: null })).toBeUndefined()
  })

  it('aborts once started, finished, or when nothing changes', () => {
    expect(wordhuntReadyUpdate(lobby({ wordhuntStartedAt: 1 }), { ...opts, symbol: 'X' })).toBeUndefined()
    expect(wordhuntReadyUpdate(lobby({ status: 'finished' }), { ...opts, symbol: 'X' })).toBeUndefined()
    expect(wordhuntReadyUpdate(lobby({ wordhuntReadyX: true }), { ...opts, symbol: 'X' })).toBeUndefined()
    expect(wordhuntReadyUpdate(null, { ...opts, symbol: 'X' })).toBeUndefined()
  })
})

describe('topMissedWords', () => {
  it('lists words nobody found, most familiar first', () => {
    // tog is a dictionary word but not an everyday one, so it ranks last.
    expect(topMissedWords(HUNT_GRID, HUNT_DICT, [['cat'], ['DOG']])).toEqual(['cats', 'cog', 'dot', 'god', 'tog'])
  })

  it('never suggests a word that is not family-safe, though it stays findable', () => {
    const grid = buildGrid({ 0: 't', 1: 'i', 2: 't', 4: 'p', 5: 'e', 6: 't' })
    const dict = createDictionary(['tit', 'pet', 'pit'])
    expect(solveGrid(grid, dict)).toContain('tit')
    expect(topMissedWords(grid, dict, [])).not.toContain('tit')
  })

  it('caps the list', async () => {
    const dict = await loadRealDict()
    const grid = generateGrid(11)
    expect(topMissedWords(grid, dict, [])).toHaveLength(TOP_MISSED_COUNT)
    expect(topMissedWords(grid, dict, [], 3)).toHaveLength(3)
  })
})
