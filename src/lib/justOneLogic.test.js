import { describe, it, expect } from 'vitest'
import {
  JO_CARDS, seatOrder, pickWordIndex, clueError, cancelClues, isCorrectGuess, applyOutcome,
  isMatchOver, scoreRating, nextGuesser, clueGivers, wordHolders, giversNeedingSeal, readyToDeal,
  allCluesIn, pendingReveals, sealContext, clueContext, encodeDeal, decodeDeal, encodeClue, decodeClue,
  verifyClues, normalizeRound, buildCard, nextCard, judgeCard, justOnePlacements, CLUE_REVEAL_WIDTH,
} from './justOneLogic'
import { JUST_ONE_WORDS } from './decks/justone'
import { commit } from './commit'
import { generateSealKeyPair, seal, openWithKey, encryptWithKey, newSymmetricKey } from './sealed'

const ORDER = ['g', 'a', 'b', 'c']
const card = (over = {}) => ({ ...buildCard({ nonce: 'n', card: 1, played: 0, score: 0, order: ORDER, guesser: 'g' }), ...over })

describe('seatOrder', () => {
  it('sorts by joinedAt then uid', () => {
    expect(seatOrder({ b: { playerId: 'b', joinedAt: 2 }, a: { playerId: 'a', joinedAt: 2 }, c: { playerId: 'c', joinedAt: 1 } }))
      .toEqual(['c', 'a', 'b'])
  })
})

describe('pickWordIndex', () => {
  it('never repeats a word used this match', () => {
    const used = JUST_ONE_WORDS.map((_, i) => i).filter(i => i !== 7)
    expect(pickWordIndex({}, used)).toBe(7)
  })
  it('prefers words the room has not seen', () => {
    const seen = Object.fromEntries(JUST_ONE_WORDS.map((_, i) => [i, i + 1]).filter(([i]) => i !== 42))
    expect(pickWordIndex(seen, [])).toBe(42)
  })
})

describe('clueError', () => {
  it('accepts one clean word', () => {
    expect(clueError('Fruit')).toBeNull()
    expect(clueError('t-rex')).toBeNull()
  })
  it('rejects empties, phrases, long words and denied words', () => {
    expect(clueError('  ')).toBe('TYPE A CLUE')
    expect(clueError('red fruit')).toBe('ONE WORD ONLY')
    expect(clueError('x'.repeat(21))).toBe('TOO LONG')
    expect(clueError('Sh1t')).toBe('ONE WORD ONLY')
    expect(clueError('shit')).toBe('PICK ANOTHER WORD')
  })
})

describe('cancelClues', () => {
  it('cancels every copy of an identical or near-identical clue', () => {
    const { survivors, cancelled } = cancelClues({ a: 'Fruit', b: 'fruits', c: 'red', d: 'Tree' }, 'apple')
    expect(survivors).toEqual({ c: 'red', d: 'Tree' })
    expect(cancelled).toEqual({ a: 'duplicate', b: 'duplicate' })
  })

  it('cancels verb-ending variants too', () => {
    const { cancelled } = cancelClues({ a: 'swimming', b: 'SWIM', c: 'pool' }, 'fish')
    expect(cancelled).toEqual({ a: 'duplicate', b: 'duplicate' })
  })

  it('removes the mystery word itself and invalid clues', () => {
    const { survivors, cancelled } = cancelClues({ a: 'Apples', b: 'two words', c: 'pie' }, 'apple')
    expect(survivors).toEqual({ c: 'pie' })
    expect(cancelled).toEqual({ a: 'mystery', b: 'invalid' })
  })

  it('can cancel everything', () => {
    const { survivors } = cancelClues({ a: 'cat', b: 'cats' }, 'dog')
    expect(survivors).toEqual({})
  })

  it('handles no clues', () => {
    expect(cancelClues(null, 'dog')).toEqual({ survivors: {}, cancelled: {} })
  })
})

describe('isCorrectGuess', () => {
  it('forgives case and plurals', () => {
    expect(isCorrectGuess('Apples', 'apple')).toBe(true)
    expect(isCorrectGuess(' APPLE ', 'apple')).toBe(true)
    expect(isCorrectGuess('pear', 'apple')).toBe(false)
    expect(isCorrectGuess('', 'apple')).toBe(false)
  })
})

describe('applyOutcome', () => {
  it('scores a right guess and uses one card', () => {
    expect(applyOutcome({ score: 2, played: 3 }, 'correct')).toEqual({ score: 3, played: 4 })
  })
  it('a pass uses one card and scores nothing', () => {
    expect(applyOutcome({ score: 2, played: 3 }, 'skip')).toEqual({ score: 2, played: 4 })
  })
  it('a wrong guess burns the next card too', () => {
    expect(applyOutcome({ score: 2, played: 3 }, 'wrong')).toEqual({ score: 2, played: 5 })
  })
  it('a wrong guess on the last card costs a point instead (never below 0)', () => {
    expect(applyOutcome({ score: 5, played: JO_CARDS - 1 }, 'wrong')).toEqual({ score: 4, played: JO_CARDS })
    expect(applyOutcome({ score: 0, played: JO_CARDS - 1 }, 'wrong')).toEqual({ score: 0, played: JO_CARDS })
  })
  it('a wrong guess on the second-to-last card ends the match', () => {
    const r = applyOutcome({ score: 5, played: JO_CARDS - 2 }, 'wrong')
    expect(r).toEqual({ score: 5, played: JO_CARDS })
    expect(isMatchOver(r.played)).toBe(true)
  })
})

describe('scoreRating', () => {
  it('rates the whole 0–13 range', () => {
    expect(scoreRating(13)).toBe('PERFECT SCORE!')
    expect(scoreRating(12)).toBe('INCREDIBLE!')
    for (let s = 0; s <= 13; s++) expect(scoreRating(s)).toBeTruthy()
  })
})

describe('guesser rotation & roles', () => {
  it('rotates through seat order, skipping offline seats', () => {
    expect(nextGuesser(ORDER, 'g')).toBe('a')
    expect(nextGuesser(ORDER, 'c')).toBe('g')
    expect(nextGuesser(ORDER, 'g', id => id !== 'a')).toBe('b')
    expect(nextGuesser(ORDER, 'g', () => false)).toBe('g')
  })

  it('everyone but the guesser gives clues', () => {
    expect(clueGivers(card(), ORDER)).toEqual(['a', 'b', 'c'])
  })

  it('tracks word holders and stale boxes', async () => {
    const ka = await generateSealKeyPair()
    const kb = await generateSealKeyPair()
    const kg = await generateSealKeyPair()
    const keys = { a: ka.pub, b: kb.pub, g: kg.pub }
    const round = card({ sealed: { a: (await seal(ka.pub, 'x', 'c')).box } })
    expect(wordHolders(round, ORDER, keys)).toEqual(['a'])
    expect(giversNeedingSeal(round, ORDER, keys)).toEqual(['b']) // c has no key; the guesser never gets a box
  })

  it('deals once every online clue-giver has a key', () => {
    expect(readyToDeal(card(), ORDER, { a: 'k', b: 'k' })).toBe(false)
    expect(readyToDeal(card(), ORDER, { a: 'k', b: 'k' }, id => id !== 'c')).toBe(true)
    expect(readyToDeal(card(), ORDER, { g: 'k' }, () => false)).toBe(false)
  })

  it('waits for every online clue-giver to commit', () => {
    const clues = { a: { h: '1' }, b: { h: '2' } }
    expect(allCluesIn(card({ clues }), ORDER)).toBe(false)
    expect(allCluesIn(card({ clues }), ORDER, id => id !== 'c')).toBe(true)
    expect(allCluesIn(card({ clues: {} }), ORDER, () => false)).toBe(false)
  })

  it('lists committed givers still to reveal', () => {
    expect(pendingReveals(card({ clues: { a: { h: '1' }, b: { h: '2' } }, enc: { a: {} } }))).toEqual(['b'])
  })
})

describe('encoding & contexts', () => {
  it('round-trips the dealt payload and clue reveals', () => {
    expect(decodeDeal(encodeDeal({ word: 'apple', wordSalt: 's', key: 'k' }))).toEqual({ word: 'apple', wordSalt: 's', key: 'k' })
    expect(decodeDeal('nope')).toBeNull()
    expect(decodeDeal('{"w":1}')).toBeNull()
    expect(decodeClue(encodeClue({ text: 'fruit', salt: 'ab' }))).toEqual({ text: 'fruit', salt: 'ab' })
    expect(decodeClue('{"t":"x"}')).toBeNull()
  })
  it('binds boxes to room, card and player', () => {
    expect(sealContext('G', 'n', 'u')).toBe('justone|G|n|u')
    expect(clueContext('G', 'n', 'u')).toBe('justone-clue|G|n|u')
  })

  it('pads clue reveals to one width so encrypted boxes never leak clue length', async () => {
    const salt = 'ab'.repeat(16) // commit.js salts are 32 hex chars
    const longest = 'x'.repeat(24) // the clue input's maxLength
    expect(encodeClue({ text: 'a', salt })).toHaveLength(CLUE_REVEAL_WIDTH)
    expect(encodeClue({ text: longest, salt })).toHaveLength(CLUE_REVEAL_WIDTH)
    const key = newSymmetricKey()
    const short = await encryptWithKey(key, encodeClue({ text: 'a', salt }), 'aad')
    const long = await encryptWithKey(key, encodeClue({ text: longest, salt }), 'aad')
    expect(short.ct.length).toBe(long.ct.length)
    expect(decodeClue(await openWithKey(key, long, 'aad'))).toEqual({ text: longest, salt })
    expect(await openWithKey(key, long, 'other')).toBeNull()
    expect(await openWithKey(newSymmetricKey(), long, 'aad')).toBeNull()
  })
})

describe('verifyClues', () => {
  it('keeps clues that match their commitment and flags the rest', async () => {
    const a = await commit('fruit')
    const b = await commit('tree')
    const commits = { a: { h: a.hash }, b: { h: b.hash } }
    const { verified, bad } = await verifyClues(commits, {
      a: { text: 'fruit', salt: a.salt },
      b: { text: 'bush', salt: b.salt }, // swapped after committing
      c: { text: 'x', salt: 'y' },       // never committed
      d: null,
    })
    expect(verified).toEqual({ a: 'fruit' })
    expect(bad.sort()).toEqual(['b', 'c', 'd'])
  })
})

describe('normalizeRound', () => {
  it('fills defaults and normalizes lists by key', () => {
    const r = normalizeRound({ phase: 'clues', order: { 1: 'b', 0: 'a' }, history: { 0: { word: 'x' } } })
    expect(r.order).toEqual(['a', 'b'])
    expect(r.history).toEqual([{ word: 'x' }])
    expect(r.clues).toEqual({})
    expect(r.survivors).toBeNull()
    expect(normalizeRound(undefined)).toBeNull()
  })
})

describe('card flow', () => {
  it('nextCard rotates the guesser and carries score and history', () => {
    const r = card({ played: 3, score: 2, used: [1], history: [{ word: 'w' }], sealed: { a: {} } })
    const n = nextCard(r, { nonce: 'n2' })
    expect(n).toMatchObject({ phase: 'dealing', nonce: 'n2', card: 4, played: 3, score: 2, guesser: 'a', sealed: null })
    expect(n.used).toEqual([1])
    expect(n.history).toEqual([{ word: 'w' }])
    expect(nextCard({ ...r, played: JO_CARDS }, { nonce: 'x' })).toBeNull()
  })

  it('judgeCard scores the guess and logs the card', () => {
    const r = card({ played: 0, score: 0 })
    expect(judgeCard(r, { word: 'apple', guess: 'Apples' })).toMatchObject({ outcome: 'correct', score: 1, played: 1, over: false })
    expect(judgeCard(r, { word: 'apple', guess: 'pear' })).toMatchObject({ outcome: 'wrong', score: 0, played: 2 })
    const skip = judgeCard(r, { word: 'apple', guess: null })
    expect(skip).toMatchObject({ outcome: 'skip', played: 1 })
    expect(skip.entry).toEqual({ word: 'apple', outcome: 'skip', guesser: 'g', guess: null })
    expect(judgeCard({ ...r, played: JO_CARDS - 1 }, { word: 'apple', guess: 'apple' }).over).toBe(true)
  })

  it('shares one placement across the table at the end', () => {
    expect(justOnePlacements(card({ played: 5 }), ORDER)).toEqual([])
    expect(justOnePlacements(card({ played: JO_CARDS, score: 9 }), ['a', 'b']))
      .toEqual([{ id: 'a', place: 1, teamScore: 9 }, { id: 'b', place: 1, teamScore: 9 }])
  })
})
