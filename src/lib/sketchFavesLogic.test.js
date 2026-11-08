import { describe, it, expect } from 'vitest'
import {
  MIN_FAVE_HEARTS,
  MAX_FAVES_SHOWN,
  MAX_HEART_FLOATS,
  faveKey,
  parseFaveKey,
  likers,
  likeCount,
  normalizeFaves,
  foldLikes,
  heartView,
  heartAriaLabel,
  newHeartsFrom,
  crowdFavourite,
  heartsOf,
} from './sketchFavesLogic'

const order = ['ivy', 'gus', 'kai', 'lea']
const round = (over = {}) => ({ phase: 'reveal', cycle: 1, artist: 'ivy', order, correct: {}, likes: null, ...over })

describe('tally keys', () => {
  it('names a drawing by cycle and artist, like the gallery entry id', () => {
    expect(faveKey(round())).toBe('1:ivy')
    expect(faveKey(round({ cycle: 2, artist: 'kai' }))).toBe('2:kai')
  })

  it('reads a key back, and refuses a malformed one', () => {
    expect(parseFaveKey('2:kai')).toEqual({ cycle: 2, artist: 'kai' })
    expect(parseFaveKey('1:a:b')).toEqual({ cycle: 1, artist: 'a:b' })
    expect(parseFaveKey('0:kai')).toBeNull()
    expect(parseFaveKey('x:kai')).toBeNull()
    expect(parseFaveKey('2:')).toBeNull()
    expect(parseFaveKey(null)).toBeNull()
  })
})

describe('counting hearts', () => {
  it('counts only true entries, whatever Firebase hands back', () => {
    expect(likeCount(null)).toBe(0)
    expect(likeCount(undefined)).toBe(0)
    expect(likeCount({ gus: true, kai: true })).toBe(2)
    expect(likeCount({ gus: true, kai: false, lea: 'yes' })).toBe(1)
    expect(likers({ kai: true, gus: true })).toEqual(['gus', 'kai'])
  })

  it('normalizes the tally to positive whole counts under valid keys', () => {
    expect(normalizeFaves(null)).toEqual({})
    expect(normalizeFaves({ '1:ivy': 3, '1:gus': 0, '2:kai': 1.5, bad: 4, '2:lea': '2', '2:ivy': 2 }))
      .toEqual({ '1:ivy': 3, '2:ivy': 2 })
  })
})

describe('foldLikes', () => {
  it('adds the round\'s hearts to the match tally', () => {
    expect(foldLikes(null, round({ likes: { gus: true, kai: true } }))).toEqual({ '1:ivy': 2 })
    expect(foldLikes({ '1:ivy': 2 }, round({ artist: 'gus', likes: { ivy: true } }))).toEqual({ '1:ivy': 2, '1:gus': 1 })
  })

  it('folding the same round twice never counts twice (coordinator hand-off)', () => {
    const r = round({ likes: { gus: true, kai: true, lea: true } })
    const once = foldLikes(null, r)
    expect(foldLikes(once, r)).toEqual(once)
    expect(once).toEqual({ '1:ivy': 3 })
  })

  it('a round with no hearts leaves the tally as it was, and an empty tally is null', () => {
    expect(foldLikes({ '1:ivy': 2 }, round({ artist: 'gus' }))).toEqual({ '1:ivy': 2 })
    expect(foldLikes(null, round())).toBeNull()
    expect(foldLikes(null, round({ likes: {} }))).toBeNull()
  })

  it('refolding the last drawing after its hearts were cleared keeps its count', () => {
    // The final fold writes the tally and clears round/likes; a second
    // coordinator that still sees the reveal must not wipe the entry.
    const last = round({ cycle: 2, likes: { gus: true, kai: true } })
    const faves = foldLikes(null, last)
    expect(foldLikes(faves, { ...last, likes: null })).toEqual({ '2:ivy': 2 })
  })

  it('does not change the tally it was given', () => {
    const faves = { '1:ivy': 2 }
    foldLikes(faves, round({ artist: 'gus', likes: { ivy: true } }))
    expect(faves).toEqual({ '1:ivy': 2 })
  })
})

describe('heartView', () => {
  const view = (over) => heartView({ round: round(), uid: 'gus', isPlayer: true, hasDrawing: true, ...over })

  it('gives everyone seated but the artist a button at the reveal', () => {
    expect(view()).toBe('button')
    expect(view({ uid: 'ivy' })).toBe('count')
  })

  it('shows a spectator the count with no button', () => {
    expect(view({ uid: 'zed', isPlayer: false })).toBe('count')
    expect(view({ uid: null, isPlayer: false })).toBe('count')
  })

  it('during the drawing: a button only for guessers who already got it', () => {
    expect(view({ round: round({ phase: 'drawing' }) })).toBeNull()
    expect(view({ round: round({ phase: 'drawing', correct: { gus: { at: 1 } } }) })).toBe('button')
    expect(view({ round: round({ phase: 'drawing' }), uid: 'ivy' })).toBe('count')
  })

  it('no heart while choosing, or for a drawing with nothing on it', () => {
    expect(view({ round: round({ phase: 'choosing' }) })).toBeNull()
    expect(view({ hasDrawing: false })).toBeNull()
    expect(view({ round: null })).toBeNull()
  })
})

describe('heart copy and floats', () => {
  it('labels the button for screen readers', () => {
    expect(heartAriaLabel(0)).toBe('Love this drawing, 0 hearts')
    expect(heartAriaLabel(1)).toBe('Love this drawing, 1 heart')
    expect(heartAriaLabel(3)).toBe('Love this drawing, 3 hearts')
  })

  it('floats only hearts that just came from someone else', () => {
    expect(newHeartsFrom(null, { gus: true, kai: true }, 'gus')).toEqual(['kai'])
    expect(newHeartsFrom({ kai: true }, { gus: true, kai: true }, 'lea')).toEqual(['gus'])
    expect(newHeartsFrom({ kai: true }, {}, 'lea')).toEqual([])
  })

  it(`floats at most ${MAX_HEART_FLOATS} at once`, () => {
    const many = Object.fromEntries('abcdefg'.split('').map(u => [u, true]))
    expect(newHeartsFrom(null, many, 'z')).toHaveLength(MAX_HEART_FLOATS)
    expect(MAX_HEART_FLOATS).toBe(4)
  })

  it('says how many could have hearted', () => {
    expect(heartsOf(4, ['a', 'b', 'c', 'd', 'e', 'f'])).toBe('♥ 4 OF 5')
    expect(heartsOf(2, ['a', 'b', 'c'])).toBe('♥ 2 OF 2')
  })
})

describe('crowdFavourite', () => {
  it(`needs at least ${MIN_FAVE_HEARTS} hearts`, () => {
    expect(MIN_FAVE_HEARTS).toBe(2)
    expect(crowdFavourite({ '1:ivy': 1, '1:gus': 1 }, { order })).toBeNull()
    expect(crowdFavourite({ '1:ivy': 2, '1:gus': 1 }, { order })).toEqual({ hearts: 2, keys: ['1:ivy'] })
    expect(crowdFavourite(null, { order })).toBeNull()
  })

  it('picks the most-hearted drawing', () => {
    expect(crowdFavourite({ '1:ivy': 2, '2:kai': 3, '1:lea': 1 }, { order })).toEqual({ hearts: 3, keys: ['2:kai'] })
  })

  it('ties share it, in play order (cycle, then seat)', () => {
    expect(crowdFavourite({ '2:ivy': 3, '1:lea': 3, '1:gus': 3 }, { order }))
      .toEqual({ hearts: 3, keys: ['1:gus', '1:lea', '2:ivy'] })
  })

  it(`a tie shows at most ${MAX_FAVES_SHOWN} drawings`, () => {
    expect(MAX_FAVES_SHOWN).toBe(3)
    const faves = { '1:ivy': 2, '1:gus': 2, '1:kai': 2, '1:lea': 2 }
    expect(crowdFavourite(faves, { order }).keys).toEqual(['1:ivy', '1:gus', '1:kai'])
  })

  it('gives no award in a 2-player room (one voter per drawing)', () => {
    expect(crowdFavourite({ '1:ivy': 2 }, { order: ['ivy', 'gus'] })).toBeNull()
    expect(crowdFavourite({ '1:ivy': 2 }, {})).toBeNull()
  })

  it('places an artist who left the order after everyone still in it', () => {
    expect(crowdFavourite({ '1:gone': 2, '1:lea': 2 }, { order }).keys).toEqual(['1:lea', '1:gone'])
  })
})
