import { describe, it, expect } from 'vitest'
import {
  FAVE_MIN, countLikes, favesKey, normalizeFaves, foldLikes, crowdFavourite, heartMode,
} from './sketchFavesLogic'
import { nextRoundState } from './sketchLogic'

describe('countLikes', () => {
  it('counts only hearts that are on', () => {
    expect(countLikes({ a: true, b: false, c: true })).toBe(2)
    expect(countLikes({})).toBe(0)
    expect(countLikes(null)).toBe(0)
    expect(countLikes({ a: 'yes', b: 1 })).toBe(0)
  })
})

describe('favesKey', () => {
  it('matches the gallery id of the drawing', () => {
    expect(favesKey({ cycle: 2, artist: 'ivy' })).toBe('2:ivy')
  })
})

describe('normalizeFaves', () => {
  it('keeps positive whole counts only', () => {
    expect(normalizeFaves({ '1:a': 3, '1:b': 0, '2:c': -1, '2:d': 1.5, '3:e': '4' })).toEqual({ '1:a': 3 })
    expect(normalizeFaves(null)).toEqual({})
  })
})

describe('foldLikes', () => {
  const round = { cycle: 1, artist: 'ivy', likes: { gus: true, cy: true, dee: false } }

  it('adds the round\'s hearts to the tally', () => {
    expect(foldLikes({ '1:gus': 1 }, round)).toEqual({ '1:gus': 1, '1:ivy': 2 })
  })

  it('never counts the same round twice (a retried fold)', () => {
    const once = foldLikes({}, round)
    expect(foldLikes(once, round)).toEqual(once)
  })

  it('leaves the tally alone for a drawing nobody hearted', () => {
    expect(foldLikes({ '1:gus': 2 }, { cycle: 1, artist: 'ivy' })).toEqual({ '1:gus': 2 })
    expect(foldLikes(null, null)).toEqual({})
  })
})

describe('crowdFavourite', () => {
  it('picks the most-hearted drawing', () => {
    expect(crowdFavourite({ '1:a': 2, '1:b': 4, '2:a': 3 })).toEqual({
      count: 4, entries: [{ key: '1:b', cycle: 1, artist: 'b' }],
    })
  })

  it('needs at least two hearts', () => {
    expect(FAVE_MIN).toBe(2)
    expect(crowdFavourite({ '1:a': 1, '1:b': 1 })).toBeNull()
    expect(crowdFavourite({})).toBeNull()
  })

  it('lets a tie share the award, up to three, in draw order', () => {
    const r = crowdFavourite({ '2:a': 3, '1:b': 3, '1:c': 3, '2:d': 3, '1:e': 1 })
    expect(r.count).toBe(3)
    expect(r.entries.map(e => e.key)).toEqual(['1:b', '1:c', '2:a'])
  })

  it('gives no award in a 2-player room', () => {
    expect(crowdFavourite({ '1:a': 2 }, { playerCount: 2 })).toBeNull()
    expect(crowdFavourite({ '1:a': 2 }, { playerCount: 3 })).not.toBeNull()
  })

  it('keeps an artist id with a colon in it whole', () => {
    expect(crowdFavourite({ '1:x:y': 2 }).entries[0].artist).toBe('x:y')
  })
})

describe('heartMode', () => {
  const base = { drawn: true, isPlayer: true, isArtist: false, solved: false }

  it('lets every seated non-artist heart at the reveal', () => {
    expect(heartMode({ ...base, phase: 'reveal' })).toBe('button')
    expect(heartMode({ ...base, phase: 'reveal', isArtist: true })).toBe('count')
    expect(heartMode({ ...base, phase: 'reveal', isPlayer: false })).toBe('count')
  })

  it('opens the heart early for a guesser who already got it', () => {
    expect(heartMode({ ...base, phase: 'drawing' })).toBeNull()
    expect(heartMode({ ...base, phase: 'drawing', solved: true })).toBe('button')
    expect(heartMode({ ...base, phase: 'drawing', isArtist: true })).toBe('count')
    expect(heartMode({ ...base, phase: 'drawing', isPlayer: false })).toBeNull()
  })

  it('shows nothing for an empty drawing or between drawings', () => {
    expect(heartMode({ ...base, phase: 'reveal', drawn: false })).toBeNull()
    expect(heartMode({ ...base, phase: 'choosing' })).toBeNull()
  })
})

describe('the tally across a match (nextRoundState)', () => {
  const order = ['a', 'b', 'c']
  it('carries the tally into the next round with this round\'s hearts folded in', () => {
    const r = { order, artist: 'a', cycle: 1, used: [], options: [1, 2, 3], matchSeed: 's', faves: { '1:z': 2 }, likes: { b: true, c: true } }
    const next = nextRoundState(r)
    expect(next.finished).toBe(false)
    expect(next.round.faves).toEqual({ '1:z': 2, '1:a': 2 })
    expect(next.round.likes).toBeNull()
  })

  it('hands the final tally back when the match ends', () => {
    const r = { order, artist: 'c', cycle: 2, used: [], options: [], matchSeed: 's', faves: { '1:a': 2 }, likes: { a: true, b: true, x: false } }
    expect(nextRoundState(r)).toEqual({ finished: true, faves: { '1:a': 2, '2:c': 2 } })
  })
})
