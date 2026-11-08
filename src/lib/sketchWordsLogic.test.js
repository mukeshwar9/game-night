import { describe, it, expect } from 'vitest'
import {
  CUSTOM_BASE, MAX_CUSTOM, cleanWord, wordProblem, addWords, normalizeWords, wordsValue,
  customSnapshot, roundCustom, isCustomIndex, buildDeck, pickOptionsWithCustom, deckOnly,
  sitsOut, shortListWarning, addMessage,
} from './sketchWordsLogic'
import { SKETCH_WORDS } from './decks/sketch'
import { wordPattern, letterCells, planHints, deriveWord, normalize, nextRoundState, entryForWord } from './sketchLogic'
import { commit } from './commit'

describe('checking a word', () => {
  it('cleans spacing and curly apostrophes', () => {
    expect(cleanWord('  Writer’s   Block ')).toBe("Writer's Block")
  })

  it('takes 2-24 letters, up to 3 words, letters of any script', () => {
    expect(wordProblem('cat')).toBeNull()
    expect(wordProblem('ice cream cone')).toBeNull()
    expect(wordProblem('crème brûlée')).toBeNull()
    expect(wordProblem('东京')).toBeNull()
    expect(wordProblem("jack-o'-lantern")).toBeNull()
    expect(wordProblem('a')).toBe('length')
    expect(wordProblem('x'.repeat(25))).toBe('length')
    expect(wordProblem('one two three four')).toBe('words')
    expect(wordProblem('<b>hi</b>')).toBe('chars')
    expect(wordProblem('--')).toBe('chars')
  })

  it('refuses slurs and vulgarity', () => {
    expect(wordProblem('fuck')).toBe('banned')
    expect(wordProblem('big fuck')).toBe('banned')
  })
})

describe('addWords', () => {
  it('splits on commas and new lines and folds duplicates the way guesses fold', () => {
    const r = addWords(['Cat'], 'dog, cats\nfire truck,,  \n the dog ')
    expect(r.list).toEqual(['Cat', 'dog', 'fire truck'])
    expect(r).toMatchObject({ added: 2, duplicate: 2, refused: 0 })
  })

  it('counts refused words without echoing them', () => {
    const r = addWords([], 'shit, kite')
    expect(r.list).toEqual(['kite'])
    expect(r.refused).toBe(1)
    expect(addMessage(r)).toBe("1 WORD ISN'T ALLOWED — LEFT OUT")
  })

  it('stops at 100 words', () => {
    const many = Array.from({ length: MAX_CUSTOM + 5 }, (_, i) => `word ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`).join(',')
    const r = addWords([], many)
    expect(r.list).toHaveLength(MAX_CUSTOM)
    expect(r.full).toBe(5)
  })
})

describe('room value', () => {
  it('reads the list by key, in order, and drops bad entries', () => {
    expect(normalizeWords({ by: 'u', mode: 'only', list: { 2: 'c c', 0: 'aa', 1: 'x', 10: 'zz' } }))
      .toEqual({ by: 'u', mode: 'only', list: ['aa', 'c c', 'zz'] })
    expect(normalizeWords(null)).toEqual({ by: null, mode: 'mix', list: [] })
  })

  it('writes a versioned value, or removes the key for an empty mixed list', () => {
    expect(wordsValue({ by: 'u', mode: 'mix', list: ['aa', 'bb'] })).toEqual({ v: 1, by: 'u', mode: 'mix', list: { 0: 'aa', 1: 'bb' } })
    expect(wordsValue({ by: 'u', mode: 'mix', list: [] })).toBeNull()
    expect(wordsValue({ by: 'u', mode: 'only', list: [] })).toEqual({ v: 1, by: 'u', mode: 'only', list: {} })
  })

  it('snapshots into the round only when there are words, and the round carries it', () => {
    expect(customSnapshot({ by: 'u', mode: 'mix', list: { 0: 'aa' } })).toEqual({ by: 'u', mode: 'mix', list: ['aa'] })
    expect(customSnapshot({ by: 'u', mode: 'only', list: {} })).toBeNull()
    expect(roundCustom({ custom: { by: 'u', mode: 'only', list: ['aa', 'bb'] } })).toEqual({ by: 'u', mode: 'only', list: ['aa', 'bb'] })
    expect(roundCustom({})).toBeNull()
    const next = nextRoundState({ order: ['a', 'b', 'c'], artist: 'a', cycle: 1, used: [], options: [1, 1000, 3], matchSeed: 's', custom: { by: 'a', mode: 'mix', list: ['aa'] } })
    expect(next.round.custom).toEqual({ by: 'a', mode: 'mix', list: ['aa'] })
    expect(next.round.used).toEqual([1, 1000, 3])
  })
})

describe('one deck', () => {
  const custom = { by: 'host', mode: 'mix', list: ['grandma', 'office party', 'crème brûlée', 'the boss'] }
  const deck = buildDeck(SKETCH_WORDS, custom)

  it('puts custom words past the deck, which keeps its indices', () => {
    expect(CUSTOM_BASE).toBeGreaterThan(SKETCH_WORDS.length)
    expect(deck[0]).toBe(SKETCH_WORDS[0])
    expect(deck[CUSTOM_BASE + 1]).toEqual({ word: 'office party', tier: 1, custom: true })
    expect(isCustomIndex(CUSTOM_BASE)).toBe(true)
    expect(isCustomIndex(5)).toBe(false)
    expect(buildDeck(SKETCH_WORDS, null)).toBe(SKETCH_WORDS)
  })

  it('MIX offers EASY deck · CUSTOM · HARD deck', () => {
    const picks = pickOptionsWithCustom({ deck: SKETCH_WORDS, custom, seed: 42 })
    expect(picks).toHaveLength(3)
    expect(SKETCH_WORDS[picks[0]].tier).toBe(1)
    expect(isCustomIndex(picks[1])).toBe(true)
    expect(SKETCH_WORDS[picks[2]].tier).toBe(3)
    expect(pickOptionsWithCustom({ deck: SKETCH_WORDS, custom, seed: 42 })).toEqual(picks)
  })

  it('MIX falls back to the deck once every custom word was offered', () => {
    const used = custom.list.map((_, i) => CUSTOM_BASE + i)
    const picks = pickOptionsWithCustom({ deck: SKETCH_WORDS, custom, seed: 42, used })
    expect(picks.some(isCustomIndex)).toBe(false)
  })

  it('ONLY offers three custom words, and the deck fills in when fewer are left', () => {
    const only = { ...custom, mode: 'only' }
    expect(pickOptionsWithCustom({ deck: SKETCH_WORDS, custom: only, seed: 3 }).every(isCustomIndex)).toBe(true)
    const used = [CUSTOM_BASE, CUSTOM_BASE + 1, CUSTOM_BASE + 2]
    const picks = pickOptionsWithCustom({ deck: SKETCH_WORDS, custom: only, seed: 3, used })
    expect(picks).toHaveLength(3)
    expect(picks.filter(isCustomIndex)).toEqual([CUSTOM_BASE + 3])
    expect(new Set(picks).size).toBe(3)
  })

  it('keeps custom words out of the room\'s seen history', () => {
    expect(deckOnly([3, CUSTOM_BASE + 2, 7])).toEqual([3, 7])
  })

  it('derives a custom word from the public options and the commitment', async () => {
    const options = [2, CUSTOM_BASE + 2, 300]
    const { hash, salt } = await commit(normalize('crème brûlée'))
    expect(await deriveWord(deck, options, { hash, salt })).toBe('crème brûlée')
    expect(entryForWord(deck, options, 'crème brûlée').custom).toBe(true)
  })
})

describe('blanks for accented words', () => {
  it('counts a letter with its accent as one blank, however it was typed', () => {
    expect(wordPattern('crème brûlée')).toBe('5 6')
    expect(wordPattern('crème')).toBe('5')
    expect(letterCells('crème')).toEqual(['c', 'r', 'è', 'm', 'e'])
    expect(wordPattern('hot dog')).toBe('3 3')
  })

  it('hints a whole accented letter', () => {
    for (const h of planHints('crème brûlée', 9)) expect(Array.from(h.c)).toHaveLength(1)
  })
})

describe('the author sits out custom rounds', () => {
  const custom = { by: 'host', mode: 'mix', list: ['grandma'] }
  it('only on a custom word, only the author', () => {
    expect(sitsOut(custom, { word: 'grandma', custom: true }, 'host')).toBe(true)
    expect(sitsOut(custom, { word: 'grandma', custom: true }, 'gus')).toBe(false)
    expect(sitsOut(custom, { word: 'cat', tier: 1 }, 'host')).toBe(false)
    expect(sitsOut(null, { word: 'cat' }, 'host')).toBe(false)
  })
})

describe('shortListWarning', () => {
  it('warns when an ONLY list is short or empty', () => {
    expect(shortListWarning({ mode: 'only', count: 12, turns: 16 })).toBe('12 WORDS FOR 16 TURNS — THE DECK FILLS THE REST')
    expect(shortListWarning({ mode: 'only', count: 0, turns: 4 })).toBe('ADD WORDS OR SWITCH TO MIX')
    expect(shortListWarning({ mode: 'only', count: 60, turns: 16 })).toBeNull()
    expect(shortListWarning({ mode: 'mix', count: 1, turns: 16 })).toBeNull()
  })
})
