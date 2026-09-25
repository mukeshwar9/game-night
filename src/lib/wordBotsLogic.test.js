import { describe, it, expect, beforeAll } from 'vitest'
import {
  WORDLE_OPENERS, WORDLE_THINK_MS,
  isConsistent, filterCandidates, rankCandidates, enumerateWordleCandidates,
  wordleTopK, pickWordleGuess, playWordleBoard, wordleThinkMs, pickCpuSecret,
  botRowTimes, botRowsShown, botDoneState, playerDoneState, tallyWins, matchWinner,
  HANGMAN_CPU_WORDS, HANGMAN_LETTER_ORDER, HANGMAN_THINK_MS,
  pickKeeperWord, hangmanPattern, hangmanCandidates, pickHangmanGuess, hangmanThinkMs,
} from './wordBotsLogic'
import { markGuess, MAX_GUESSES } from './wordduelLogic'
import { getAnswerList, has, isAnswerWord } from './dictionary'
import { isFamilySafe } from './wordDenylist'
import { createDictionary } from './wordhuntLogic'
import {
  applyGuess, isWordGuessed, countWrong, MAX_WRONG, validateSetterWord, hintRevealsWord, WORD_RULE_DICTIONARY,
} from './hangmanLogic'

// Deterministic PRNG so bot behaviour (and the strength checks) is stable.
function seeded(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const row = (word, answer) => ({ word, marks: markGuess(word, answer) })

describe('Wordle candidate filter', () => {
  it('keeps only words that reproduce every recorded mark', () => {
    const history = [row('crane', 'light'), row('moist', 'light')]
    expect(isConsistent('light', history)).toBe(true)
    expect(isConsistent('fight', history)).toBe(true)
    expect(isConsistent('sight', history)).toBe(false) // MOIST's S would be yellow
    expect(isConsistent('night', history)).toBe(false) // CRANE's N would be yellow
    expect(isConsistent('crane', history)).toBe(false)
    expect(filterCandidates(['LIGHT', 'fight', 'sight', 'night', 'crane'], history)).toEqual(['light', 'fight'])
  })

  it('rejects words of the wrong length', () => {
    expect(isConsistent('lights', [])).toBe(false)
  })

  it('ranks words made of common letters first', () => {
    const ranked = rankCandidates(['fizzy', 'stare', 'tears', 'rates', 'jazzy'])
    expect(ranked.slice(0, 3).sort()).toEqual(['rates', 'stare', 'tears'])
    expect(ranked).toHaveLength(5)
  })
})

describe('enumerateWordleCandidates', () => {
  const words = new Set(['light', 'night', 'sight', 'fight', 'eight', 'crane'])
  const isWord = w => words.has(w)

  it('finds every listed word that fits the clues', () => {
    const history = [row('crane', 'light'), row('moist', 'light')]
    expect(enumerateWordleCandidates(history, isWord).sort()).toEqual(['fight', 'light'])
  })

  it('returns null when the search is too big for its budget', () => {
    expect(enumerateWordleCandidates([], isWord, { budget: 1000 })).toBeNull()
  })

  it('returns null without a word check', () => {
    expect(enumerateWordleCandidates([], null)).toBeNull()
  })
})

describe('pickWordleGuess', () => {
  const pool = getAnswerList()

  it('opens with a human-style opener', () => {
    expect(WORDLE_OPENERS).toContain(pickWordleGuess({ pool, random: seeded(3) }))
  })

  it('every opener is an answer word, so it is always playable', () => {
    for (const w of WORDLE_OPENERS) {
      expect(isAnswerWord(w)).toBe(true)
      expect(has(w)).toBe(true)
    }
  })

  it('plays hard mode: later guesses fit every clue when recall is perfect', () => {
    const random = seeded(7)
    const history = [row('crane', 'plumb')]
    for (let i = 0; i < 20; i++) {
      const g = pickWordleGuess({ pool, history, recall: 1, skill: 0.5, random })
      expect(isConsistent(g, history)).toBe(true)
    }
  })

  it('plays the best-ranked candidate at full skill and recall', () => {
    const history = [row('crane', 'plumb')]
    const best = rankCandidates(filterCandidates(pool, history))[0]
    expect(pickWordleGuess({ pool, history, skill: 1, recall: 1, random: seeded(1) })).toBe(best)
  })

  it('never repeats a word it already tried', () => {
    const history = [row('crane', 'crane'.replace('e', 'y'))]
    const g = pickWordleGuess({ pool, history, recall: 1, random: seeded(2) })
    expect(g).not.toBe('crane')
  })

  it('searches the full guess list when the setter picked a non-answer word', () => {
    const secret = 'xylyl'
    expect(pool).not.toContain(secret)
    const rows = playWordleBoard({ answer: secret, pool, isWord: has, random: seeded(5) })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(MAX_GUESSES)
    for (const r of rows) expect(has(r.word)).toBe(true)
  }, 30_000)

  it('topK widens as skill drops', () => {
    expect(wordleTopK(1)).toBe(1)
    expect(wordleTopK(0)).toBeGreaterThan(wordleTopK(0.6))
  })
})

describe('playWordleBoard', () => {
  const pool = getAnswerList()

  it('stops at the solve and grades every row against the answer', () => {
    const rows = playWordleBoard({ answer: 'plant', pool, random: seeded(11) })
    expect(rows.length).toBeLessThanOrEqual(MAX_GUESSES)
    for (const r of rows) expect(r.marks).toBe(markGuess(r.word, 'plant'))
    const solvedAt = rows.findIndex(r => r.marks === 'GGGGG')
    if (solvedAt >= 0) expect(solvedAt).toBe(rows.length - 1)
  })

  it('gives each row a human-paced think time', () => {
    const rows = playWordleBoard({ answer: 'ghost', pool, random: seeded(4) })
    expect(rows[0].thinkMs).toBeGreaterThanOrEqual(WORDLE_THINK_MS.opener[0])
    expect(rows[0].thinkMs).toBeLessThanOrEqual(WORDLE_THINK_MS.opener[1])
    for (const r of rows.slice(1)) {
      expect(r.thinkMs).toBeGreaterThanOrEqual(WORDLE_THINK_MS.row[0])
      expect(r.thinkMs).toBeLessThanOrEqual(WORDLE_THINK_MS.row[1])
    }
    expect(wordleThinkMs(0, () => 0)).toBe(WORDLE_THINK_MS.opener[0])
  })

  it('plays like a decent human, not a solver (≈3.6–4.2 guesses, few fails)', () => {
    const random = seeded(2026)
    let solvedRows = 0
    let solved = 0
    const sample = pool.filter((_, i) => i % 15 === 0)
    for (const answer of sample) {
      const rows = playWordleBoard({ answer, pool, random })
      if (rows.at(-1)?.marks === 'GGGGG') { solved++; solvedRows += rows.length }
    }
    const avg = solvedRows / solved
    expect(avg).toBeGreaterThan(3.5)
    expect(avg).toBeLessThan(4.3)
    expect(solved / sample.length).toBeGreaterThan(0.9)
  }, 60_000)
})

describe('pickCpuSecret', () => {
  it('serves a family-safe 5-letter answer and avoids used words', () => {
    const list = ['plant', 'ghost', 'crane']
    const w = pickCpuSecret(list, { random: () => 0, used: ['PLANT'] })
    expect(w).toBe('ghost')
    expect(isFamilySafe(w)).toBe(true)
  })

  it('reuses the list once every word has been used', () => {
    expect(pickCpuSecret(['plant'], { used: ['plant'] })).toBe('plant')
  })

  it('never serves a word that is not family-safe', () => {
    expect(pickCpuSecret(['boobs', 'plant'], { random: () => 0 })).toBe('plant')
  })
})

describe('timed bot boards and match tally', () => {
  const rows = [
    { word: 'crane', marks: 'BYBBB', thinkMs: 4000 },
    { word: 'moist', marks: 'BBYBG', thinkMs: 8000 },
    { word: 'light', marks: 'GGGGG', thinkMs: 9000 },
  ]

  it('lands each bot row at the running sum of its think times', () => {
    expect(botRowTimes(rows)).toEqual([4000, 12000, 21000])
    expect(botRowsShown(rows, 0)).toBe(0)
    expect(botRowsShown(rows, 12000)).toBe(2)
    expect(botRowsShown(rows, 60000)).toBe(3)
  })

  it('reports the bot finish at its simulated time', () => {
    expect(botDoneState(rows)).toEqual({ solved: true, guesses: 3, at: 21000 })
    expect(botDoneState([])).toBeNull()
    const failed = Array.from({ length: MAX_GUESSES }, () => ({ word: 'crane', marks: 'BBBBB', thinkMs: 1000 }))
    expect(botDoneState(failed)).toEqual({ solved: false, guesses: MAX_GUESSES, at: MAX_GUESSES * 1000 })
  })

  it('a human board is done on a solve or a full board, timed by the deciding guess', () => {
    expect(playerDoneState([{ word: 'CRANE', marks: 'BBBBB', at: 5000 }])).toBeNull()
    expect(playerDoneState([
      { word: 'CRANE', marks: 'BBBBB', at: 5000 },
      { word: 'LIGHT', marks: 'GGGGG', at: 20000 },
    ])).toEqual({ solved: true, guesses: 2, at: 20000 })
    const full = Array.from({ length: MAX_GUESSES }, (_, i) => ({ word: 'CRANE', marks: 'BBBBB', at: i * 1000 }))
    expect(playerDoneState(full)).toEqual({ solved: false, guesses: MAX_GUESSES, at: 5000 })
  })

  it('tallies round wins and ignores draws', () => {
    expect(tallyWins(['X', 'draw', 'O', 'X'])).toEqual({ X: 2, O: 1 })
    expect(matchWinner({ X: 3, O: 1 }, 3)).toBe('X')
    expect(matchWinner({ X: 1, O: 2 }, 2)).toBe('O')
    expect(matchWinner({ X: 2, O: 2 }, 3)).toBeNull()
  })
})

describe('Hangwoman CPU keeper words', () => {
  let dict
  beforeAll(async () => {
    const { readFileSync } = await import('node:fs')
    dict = createDictionary(readFileSync(new URL('../../public/wordhunt-dict.txt', import.meta.url), 'utf8').split('\n'))
  })

  it('are common dictionary words, 4–9 letters, family-safe and unique', () => {
    expect(HANGMAN_CPU_WORDS.length).toBeGreaterThanOrEqual(100)
    const seen = new Set()
    for (const { word, hint } of HANGMAN_CPU_WORDS) {
      expect(word).toMatch(/^[A-Z]{4,9}$/)
      expect(isFamilySafe(word)).toBe(true)
      expect(validateSetterWord(word, { rule: WORD_RULE_DICTIONARY, dictionary: dict }).ok).toBe(true)
      expect(hintRevealsWord(hint, word)).toBe(false)
      expect(seen.has(word)).toBe(false)
      seen.add(word)
    }
  })

  it('pickKeeperWord avoids used words, then recycles', () => {
    const first = pickKeeperWord({ random: () => 0 })
    expect(pickKeeperWord({ random: () => 0, used: [first.word] }).word).not.toBe(first.word)
    const all = HANGMAN_CPU_WORDS.map(e => e.word)
    expect(all).toContain(pickKeeperWord({ used: all }).word)
  })
})

describe('Hangwoman CPU guesser', () => {
  const small = createDictionary(['cat', 'cot', 'cut', 'cast', 'coat', 'cart', 'dog', 'dig'])

  it('hangmanPattern shows hit letters only', () => {
    expect(hangmanPattern('COAT', { C: [0], E: false, T: [3] })).toEqual(['C', null, null, 'T'])
  })

  it('finds dictionary words that fit, never with a guessed letter in a hidden spot', () => {
    expect(hangmanCandidates({ pattern: ['C', null, 'T'], guessed: ['C', 'T'], dict: small }).sort()).toEqual(['CAT', 'COT', 'CUT'])
    expect(hangmanCandidates({ pattern: ['C', null, 'T'], guessed: ['C', 'T', 'A'], dict: small }).sort()).toEqual(['COT', 'CUT'])
    expect(hangmanCandidates({ pattern: ['C', null, null, 'T'], guessed: ['C', 'T', 'O'], dict: small }).sort()).toEqual(['CART', 'CAST'])
  })

  it('returns null when over budget, for phrases, or without a dictionary', () => {
    expect(hangmanCandidates({ pattern: [null, null, null], guessed: [], dict: small, budget: 3 })).toBeNull()
    expect(hangmanCandidates({ pattern: ['A', ' ', 'B'], guessed: [], dict: small })).toBeNull()
    expect(hangmanCandidates({ pattern: [null], guessed: [] })).toBeNull()
  })

  it('guesses the letter found in the most candidates', () => {
    expect(pickHangmanGuess({ guessed: ['C', 'T'], candidates: ['CAT', 'CUT', 'CAST'], slip: 0 })).toBe('A')
  })

  it('never slips when only one word fits', () => {
    const g = pickHangmanGuess({ guessed: ['C', 'T'], candidates: ['COAT'], slip: 1, random: () => 0.99 })
    expect(['O', 'A']).toContain(g)
  })

  it('falls back to letter frequency and skips guessed letters', () => {
    expect(pickHangmanGuess({ guessed: [], slip: 0 })).toBe(HANGMAN_LETTER_ORDER[0])
    expect(pickHangmanGuess({ guessed: ['E', 'A'], candidates: null, slip: 0 })).toBe(HANGMAN_LETTER_ORDER[2])
    expect(pickHangmanGuess({ guessed: HANGMAN_LETTER_ORDER.split('') })).toBeNull()
  })

  it('slips to the 2nd or 3rd best letter', () => {
    const g = pickHangmanGuess({ guessed: [], slip: 1, random: () => 0.9 })
    expect(HANGMAN_LETTER_ORDER.slice(1, 3)).toContain(g)
  })

  it('think time stays in range', () => {
    expect(hangmanThinkMs(() => 0)).toBe(HANGMAN_THINK_MS[0])
    expect(hangmanThinkMs(() => 0.999999)).toBeLessThanOrEqual(HANGMAN_THINK_MS[1])
  })

  it('solves most common words but not all (a beatable opponent)', async () => {
    const { readFileSync } = await import('node:fs')
    const dict = createDictionary(readFileSync(new URL('../../public/wordhunt-dict.txt', import.meta.url), 'utf8').split('\n'))
    const random = seeded(99)
    const words = HANGMAN_CPU_WORDS.filter((_, i) => i % 3 === 0).map(e => e.word)
    let won = 0
    for (const word of words) {
      const guesses = {}
      for (;;) {
        const pattern = hangmanPattern(word, guesses)
        const candidates = hangmanCandidates({ pattern, guessed: Object.keys(guesses), dict })
        const letter = pickHangmanGuess({ guessed: Object.keys(guesses), candidates, random })
        const pos = applyGuess(word, letter)
        guesses[letter] = pos.length ? pos : false
        if (isWordGuessed(word, guesses)) { won++; break }
        if (countWrong(guesses) >= MAX_WRONG) break
      }
    }
    const rate = won / words.length
    expect(rate).toBeGreaterThan(0.6)
    expect(rate).toBeLessThan(0.97)
  }, 60_000)
})
