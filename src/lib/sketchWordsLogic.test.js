import { describe, it, expect } from 'vitest'
import {
  SKETCH_WORDS_VERSION,
  MAX_CUSTOM_WORDS,
  MAX_WORD_CHARS,
  cleanWord,
  checkWord,
  wordKey,
  splitInput,
  addWords,
  addFeedback,
  normalizeWordList,
  normalizeSketchWords,
  patchSketchWords,
  roundWordsSnapshot,
  buildDeck,
  freshCustomIndices,
  pickSketchOptions,
  customRunningOut,
  sitOutFor,
  wordsSummary,
  wordsRowLabel,
  onlyModeWarning,
} from './sketchWordsLogic'
import { entryForWord, pickRoundOptions, normalize } from './sketchLogic'
import { SKETCH_WORDS } from './decks/sketch'
import { getGameConfig } from './games'

const D = SKETCH_WORDS.length

describe('cleaning and checking a word', () => {
  it('stores words lowercase, trimmed, single-spaced, with straight apostrophes', () => {
    expect(cleanWord('  Grandma’s   Sofa ')).toBe("grandma's sofa")
    expect(cleanWord('CAFÉ')).toBe('café') // composed (NFC)
    expect(cleanWord('tuk–tuk')).toBe('tuk-tuk')
    expect(cleanWord(null)).toBe('')
  })

  it('takes 2–24 characters, up to 3 words, letters of any script, digits, spaces, apostrophes, hyphens', () => {
    for (const ok of ['ox', 'grandma', "grandma's sofa", 'r2d2', 'tuk-tuk', 'crème brûlée', 'नमस्ते', 'big red fire truck'.split(' ').slice(0, 3).join(' '), 'a'.repeat(MAX_WORD_CHARS)]) {
      expect(checkWord(cleanWord(ok))).toBe('ok')
    }
    for (const bad of ['', 'a', 'a'.repeat(MAX_WORD_CHARS + 1), 'big red fire truck', 'cat!', 'hi.there', 'a/b', '#tag', '--', "'a"]) {
      expect(checkWord(cleanWord(bad))).toBe('shape')
    }
  })

  it('refuses slurs and vulgarity', () => {
    expect(checkWord('shit')).toBe('banned')
    expect(checkWord('holy shit')).toBe('banned')
  })

  it('folds duplicates the way guesses fold', () => {
    expect(wordKey('hot dogs')).toBe(wordKey('hot-dog'))
    expect(wordKey('the cat')).toBe(wordKey('cat'))
    expect(wordKey('नमस्ते')).toBe('=नमस्ते') // a script matchKey cannot read keys on the plain word
    expect(wordKey('नमस्ते')).not.toBe(wordKey('नमस्कार'))
  })
})

describe('adding words', () => {
  it('splits on commas and new lines', () => {
    expect(splitInput('cat, dog\nhot dog,,\r\n  ')).toEqual(['cat', 'dog', 'hot dog'])
  })

  it('adds new words, counting what it left out and why', () => {
    const r = addWords(['cat'], 'Cats, dog, shit, x, sun!, dog, moon')
    expect(r.list).toEqual(['cat', 'dog', 'moon'])
    expect(r).toMatchObject({ added: 2, banned: 1, invalid: 2, dupes: 2, full: 0 })
    expect(addFeedback(r)).toBe("1 WORD ISN'T ALLOWED — LEFT OUT · 2 WORDS DON'T FIT 2–24 LETTERS · UP TO 3 WORDS · 2 WORDS WERE ALREADY ON THE LIST")
    expect(addFeedback(addWords([], 'cat'))).toBe('')
  })

  it('never echoes a refused word back', () => {
    expect(addFeedback(addWords([], 'shit'))).not.toMatch(/shit/i)
  })

  it(`stops at ${MAX_CUSTOM_WORDS} words`, () => {
    const many = Array.from({ length: MAX_CUSTOM_WORDS - 1 }, (_, i) => `word${i}`)
    const r = addWords(many, 'apple, banana')
    expect(r.list).toHaveLength(MAX_CUSTOM_WORDS)
    expect(r).toMatchObject({ added: 1, full: 1 })
    expect(addFeedback(r)).toBe('LIST IS FULL — 1 WORD LEFT OUT')
  })
})

describe('reading the stored words', () => {
  it('reads a list by key, in index order, dropping bad and duplicate entries', () => {
    expect(normalizeWordList(['cat', 'dog'])).toEqual(['cat', 'dog'])
    expect(normalizeWordList({ 2: 'moon', 0: 'cat', 1: 'Cats', 3: 7, 4: 'x', 5: 'shit' })).toEqual(['cat', 'moon'])
    expect(normalizeWordList(null)).toEqual([])
    const tooMany = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [i, `word${i}`]))
    expect(normalizeWordList(tooMany)).toHaveLength(MAX_CUSTOM_WORDS)
  })

  it('defaults the mode to mix and the author to nobody', () => {
    expect(normalizeSketchWords(null)).toEqual({ by: null, mode: 'mix', list: [] })
    expect(normalizeSketchWords({ by: 'h', mode: 'only', list: ['cat'] })).toEqual({ by: 'h', mode: 'only', list: ['cat'] })
    expect(normalizeSketchWords({ by: 7, mode: 'all', list: 'cat' })).toEqual({ by: null, mode: 'mix', list: [] })
  })
})

describe('saving an editor action', () => {
  it('signs every write with the writer and keeps the list', () => {
    const v = patchSketchWords(null, 'h', { add: 'cat, dog' })
    expect(v).toEqual({ v: SKETCH_WORDS_VERSION, by: 'h', mode: 'mix', list: ['cat', 'dog'] })
    expect(patchSketchWords(v, 'h2', { add: 'moon' })).toEqual({ v: 1, by: 'h2', mode: 'mix', list: ['cat', 'dog', 'moon'] })
    expect(patchSketchWords(v, 'h', { remove: 'CAT' })).toEqual({ v: 1, by: 'h', mode: 'mix', list: ['dog'] })
    expect(patchSketchWords(v, 'h', { mode: 'only' })).toEqual({ v: 1, by: 'h', mode: 'only', list: ['cat', 'dog'] })
    expect(patchSketchWords(v, 'h', { mode: 'everything' })).toEqual(v)
  })

  it('deletes the key when nothing is left to keep', () => {
    const v = patchSketchWords(null, 'h', { add: 'cat' })
    expect(patchSketchWords(v, 'h', { remove: 'cat' })).toBeNull()
    expect(patchSketchWords(v, 'h', { clear: true })).toBeNull()
    expect(patchSketchWords({ ...v, mode: 'only' }, 'h', { clear: true })).toEqual({ v: 1, by: 'h', mode: 'only' })
  })
})

describe('the round snapshot and the combined deck', () => {
  it('START copies the words, or nothing when there are none', () => {
    expect(roundWordsSnapshot({ v: 1, by: 'h', mode: 'only', list: { 0: 'cat', 1: 'dog' } }))
      .toEqual({ custom: { by: 'h', mode: 'only', list: ['cat', 'dog'] } })
    expect(roundWordsSnapshot({ v: 1, by: 'h', mode: 'only' })).toEqual({})
    expect(roundWordsSnapshot(null)).toEqual({})
    expect(roundWordsSnapshot({ v: 1, mode: 'mix', list: ['cat'] })).toEqual({}) // no author: not trusted
  })

  it('puts custom words after the deck, paying ×1', () => {
    const deck = buildDeck(SKETCH_WORDS, { by: 'h', mode: 'mix', list: ['grandma', 'tuk tuk'] })
    expect(deck).toHaveLength(D + 2)
    expect(deck.slice(0, D)).toEqual(SKETCH_WORDS)
    expect(deck[D]).toEqual({ word: 'grandma', tier: 1, custom: true })
    expect(entryForWord(deck, [3, D + 1, 9], 'tuk tuk')).toEqual({ word: 'tuk tuk', tier: 1, custom: true })
    expect(buildDeck(SKETCH_WORDS, null)).toBe(SKETCH_WORDS)
  })

  it('knows which custom words have not been offered yet', () => {
    const custom = { by: 'h', mode: 'mix', list: ['a1', 'b2', 'c3'] }
    expect(freshCustomIndices(D, custom, [4, D + 1])).toEqual([D, D + 2])
  })
})

describe('picking a turn\'s options', () => {
  const order = ['h', 'b', 'c']
  const list = ['grandma', 'tuk tuk', 'the office', 'rubber duck', 'karaoke']
  const mix = { by: 'h', mode: 'mix', list }
  const only = { by: 'h', mode: 'only', list }
  const isCustom = i => i >= D
  const pick = (custom, over = {}) => pickSketchOptions({ deck: SKETCH_WORDS, custom, seed: 42, used: [], seen: null, order, artist: 'b', ...over })

  it('without custom words picks exactly as today', () => {
    expect(pick(null)).toEqual(pickRoundOptions(SKETCH_WORDS, 42, [], null))
    expect(pick({ by: 'h', mode: 'only', list: [] })).toEqual(pickRoundOptions(SKETCH_WORDS, 42, [], null))
  })

  it('MIX offers EASY deck · one custom word · HARD deck', () => {
    const opts = pick(mix)
    expect(opts).toHaveLength(3)
    expect(isCustom(opts[1])).toBe(true)
    expect(SKETCH_WORDS[opts[0]].tier).toBe(1)
    expect(SKETCH_WORDS[opts[2]].tier).toBe(3)
    expect(pick(mix)).toEqual(opts) // deterministic: every client agrees
  })

  it('MIX falls back to the deck\'s MEDIUM word once the custom words are used up', () => {
    const used = list.map((_, i) => D + i)
    const opts = pick(mix, { used })
    expect(opts.some(isCustom)).toBe(false)
    expect(opts.map(i => SKETCH_WORDS[i].tier)).toEqual([1, 2, 3])
  })

  it('ONLY offers three custom words, and the deck fills in when fewer are left', () => {
    expect(pick(only).every(isCustom)).toBe(true)
    const twoLeft = pick(only, { used: [D, D + 1, D + 2] })
    expect(twoLeft.filter(isCustom).sort()).toEqual([D + 3, D + 4])
    expect(twoLeft).toHaveLength(3)
    expect(SKETCH_WORDS[twoLeft[2]].tier).toBe(1)
    const none = pick(only, { used: list.map((_, i) => D + i) })
    expect(none.some(isCustom)).toBe(false)
    expect(none).toHaveLength(3)
  })

  it('never offers a custom word that was offered earlier in the match', () => {
    const used = []
    for (let turn = 0; turn < 5; turn++) {
      const opts = pick(mix, { seed: 1000 + turn, used: [...used] })
      for (const i of opts) expect(used).not.toContain(i)
      used.push(...opts)
    }
    expect(used.filter(isCustom).sort()).toEqual(list.map((_, i) => D + i))
  })

  it('offers the deck only when the list\'s author is the only one who could guess', () => {
    expect(pick(only, { order: ['h', 'b'], artist: 'b' }).some(isCustom)).toBe(false)
    expect(pick(only, { order: ['h', 'b'], artist: 'h' }).every(isCustom)).toBe(true) // the author draws their own word
  })

  it('keeps a deck word that reads the same as the custom word out of the same turn', () => {
    const cat = SKETCH_WORDS.findIndex(e => e.word === 'cat')
    expect(cat).toBeGreaterThanOrEqual(0)
    const clash = { by: 'h', mode: 'mix', list: ['cat'] }
    for (let seed = 0; seed < 40; seed++) {
      const opts = pickSketchOptions({ deck: SKETCH_WORDS, custom: clash, seed, order, artist: 'b' })
      expect(opts).toContain(D)
      expect(opts).not.toContain(cat)
      expect(new Set(opts.map(i => normalize(buildDeck(SKETCH_WORDS, clash)[i].word))).size).toBe(3)
    }
  })

  it('warns ONLY mode when fewer than three custom words are left', () => {
    expect(customRunningOut(D, only, [])).toBe(false)
    expect(customRunningOut(D, only, [D, D + 1, D + 2])).toBe(true)
    expect(customRunningOut(D, mix, [D, D + 1, D + 2, D + 3, D + 4])).toBe(false)
    expect(customRunningOut(D, null, [])).toBe(false)
  })
})

describe('the author sits out custom rounds', () => {
  const custom = { by: 'h', mode: 'mix', list: ['grandma'] }
  it('names the author when someone else draws one of their words', () => {
    expect(sitOutFor(custom, { word: 'grandma', tier: 1, custom: true }, 'b')).toBe('h')
    expect(sitOutFor(custom, { word: 'grandma', tier: 1, custom: true }, 'h')).toBeNull() // the author is drawing
    expect(sitOutFor(custom, { word: 'cat', tier: 1 }, 'b')).toBeNull()
    expect(sitOutFor(custom, null, 'b')).toBeNull()
    expect(sitOutFor(null, { word: 'x', custom: true }, 'b')).toBeNull()
  })
})

describe('copy', () => {
  it('summarises the list for the host and for everyone else', () => {
    expect(wordsSummary(12, true)).toBe('12 WORDS')
    expect(wordsSummary(12, false)).toBe('12 CUSTOM WORDS')
    expect(wordsSummary(1, false)).toBe('1 CUSTOM WORD')
    expect(wordsSummary(0, true)).toBe('')
    expect(wordsRowLabel(12, 'mix')).toBe('12 WORDS · MIXED IN')
    expect(wordsRowLabel(12, 'only')).toBe('12 WORDS · CUSTOM ONLY')
    expect(wordsRowLabel(0, 'mix')).toBe('NONE YET')
  })

  it('warns when ONLY mode runs short of words', () => {
    expect(onlyModeWarning({ count: 12, mode: 'mix', turns: 16 })).toBe('')
    expect(onlyModeWarning({ count: 0, mode: 'only', turns: 16 })).toBe('ADD WORDS OR SWITCH TO MIX')
    expect(onlyModeWarning({ count: 12, mode: 'only', turns: 16 })).toBe('12 WORDS LAST 4 OF 16 TURNS — THE DECK FILLS THE REST')
    expect(onlyModeWarning({ count: 48, mode: 'only', turns: 16 })).toBe('')
  })
})

describe('registry startRound snapshots the custom words', () => {
  const players = { h: { name: 'H', joinedAt: 1 }, b: { name: 'B', joinedAt: 2 } }

  it('copies the room\'s sketchWords into the first round', () => {
    const { round } = getGameConfig('sketch').startRound(players, { sketchWords: { v: 1, by: 'h', mode: 'only', list: { 0: 'grandma', 1: 'tuk tuk' } } })
    expect(round.custom).toEqual({ by: 'h', mode: 'only', list: ['grandma', 'tuk tuk'] })
  })

  it('a room without custom words starts a round with no custom key', () => {
    expect('custom' in getGameConfig('sketch').startRound(players, {}).round).toBe(false)
    expect('custom' in getGameConfig('sketch').startRound(players, { sketchWords: { v: 1, by: 'h', mode: 'only' } }).round).toBe(false)
  })
})
