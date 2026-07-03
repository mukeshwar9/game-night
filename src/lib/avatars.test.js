import { describe, it, expect } from 'vitest'
import {
  SHAPES, TONES, CLASSIC_TONES,
  makeAvatar, parseAvatar, canonicalAvatar,
  isValidAvatar, defaultAvatarForId,
} from './avatars'

describe('SHAPES', () => {
  it('has exactly 20 unique string keys', () => {
    expect(SHAPES.length).toBe(20)
    expect(new Set(SHAPES).size).toBe(20)
    for (const key of SHAPES) expect(typeof key).toBe('string')
  })

  it('pins the original 12 legacy keys in order (wire format — must never rename)', () => {
    expect(SHAPES.slice(0, 12)).toEqual([
      'invader', 'robot', 'ghost', 'alien', 'skull', 'cat',
      'ufo', 'wizard', 'ninja', 'crown', 'dino', 'heart',
    ])
  })

  it('includes all 8 new shapes', () => {
    for (const key of ['frog', 'star', 'mushroom', 'bolt', 'moon', 'fish', 'sword', 'slime']) {
      expect(SHAPES).toContain(key)
    }
  })
})

describe('TONES', () => {
  it('pins exact wire-format array', () => {
    expect(TONES).toEqual(['p1', 'p2', 'cta', 'win', 'text', 'dim'])
  })
})

describe('CLASSIC_TONES', () => {
  it('has an entry for every shape with a value in TONES', () => {
    for (const shape of SHAPES) {
      expect(CLASSIC_TONES).toHaveProperty(shape)
      expect(TONES).toContain(CLASSIC_TONES[shape])
    }
  })

  it('pins the 12 legacy pairings exactly (color must never shift for bare keys)', () => {
    expect(CLASSIC_TONES.invader).toBe('win')
    expect(CLASSIC_TONES.robot).toBe('p1')
    expect(CLASSIC_TONES.ghost).toBe('text')
    expect(CLASSIC_TONES.alien).toBe('win')
    expect(CLASSIC_TONES.skull).toBe('text')
    expect(CLASSIC_TONES.cat).toBe('p2')
    expect(CLASSIC_TONES.ufo).toBe('cta')
    expect(CLASSIC_TONES.wizard).toBe('p1')
    expect(CLASSIC_TONES.ninja).toBe('text')
    expect(CLASSIC_TONES.crown).toBe('cta')
    expect(CLASSIC_TONES.dino).toBe('win')
    expect(CLASSIC_TONES.heart).toBe('p2')
  })
})

describe('makeAvatar', () => {
  it('joins shape and tone with a dot', () => {
    expect(makeAvatar('ghost', 'p2')).toBe('ghost.p2')
    expect(makeAvatar('invader', 'win')).toBe('invader.win')
  })
})

describe('parseAvatar', () => {
  it('bare legacy key → classic tone', () => {
    expect(parseAvatar('ghost')).toEqual({ shape: 'ghost', tone: 'text' })
    expect(parseAvatar('invader')).toEqual({ shape: 'invader', tone: 'win' })
  })

  it('valid composite → exact { shape, tone }', () => {
    expect(parseAvatar('ghost.p2')).toEqual({ shape: 'ghost', tone: 'p2' })
    expect(parseAvatar('frog.dim')).toEqual({ shape: 'frog', tone: 'dim' })
  })

  it('valid shape, unknown tone → shape classic tone', () => {
    expect(parseAvatar('ghost.p9')).toEqual({ shape: 'ghost', tone: 'text' })
  })

  it('unknown shape, valid tone → invader with that tone', () => {
    expect(parseAvatar('zzz.p1')).toEqual({ shape: 'invader', tone: 'p1' })
  })

  it('empty string / null / undefined / non-string → invader with classic tone', () => {
    const fallback = { shape: 'invader', tone: 'win' }
    expect(parseAvatar('')).toEqual(fallback)
    expect(parseAvatar(null)).toEqual(fallback)
    expect(parseAvatar(undefined)).toEqual(fallback)
    expect(parseAvatar(42)).toEqual(fallback)
  })

  it('a.b.c → invader (first-dot split; shape=a invalid, tone=b.c invalid)', () => {
    expect(parseAvatar('a.b.c')).toEqual({ shape: 'invader', tone: 'win' })
  })
})

describe('canonicalAvatar', () => {
  it('bare legacy key → composite string', () => {
    expect(canonicalAvatar('ghost')).toBe('ghost.text')
    expect(canonicalAvatar('invader')).toBe('invader.win')
  })

  it('is idempotent on valid composites', () => {
    expect(canonicalAvatar('ghost.p2')).toBe('ghost.p2')
    expect(canonicalAvatar('frog.dim')).toBe('frog.dim')
  })
})

describe('makeAvatar + round-trip', () => {
  it('makeAvatar then parseAvatar round-trips for all shape×tone pairs', () => {
    for (const shape of SHAPES) {
      for (const tone of TONES) {
        const composite = makeAvatar(shape, tone)
        expect(parseAvatar(composite)).toEqual({ shape, tone })
      }
    }
  })
})

describe('isValidAvatar', () => {
  it('accepts all bare shapes', () => {
    for (const key of SHAPES) expect(isValidAvatar(key)).toBe(true)
  })

  it('accepts all valid composites', () => {
    for (const shape of SHAPES) {
      for (const tone of TONES) {
        expect(isValidAvatar(makeAvatar(shape, tone))).toBe(true)
      }
    }
  })

  it('rejects malformed / unknown values', () => {
    expect(isValidAvatar('ghost.')).toBe(false)
    expect(isValidAvatar('.p1')).toBe(false)
    expect(isValidAvatar('ghost.p9')).toBe(false)
    expect(isValidAvatar('zzz.p1')).toBe(false)
    expect(isValidAvatar('')).toBe(false)
    expect(isValidAvatar(null)).toBe(false)
    expect(isValidAvatar(undefined)).toBe(false)
  })
})

describe('defaultAvatarForId', () => {
  it('is deterministic for the same id', () => {
    expect(defaultAvatarForId('same-id')).toBe(defaultAvatarForId('same-id'))
  })

  it('returns a valid composite avatar', () => {
    for (const id of ['abc123', 'firebase-uid-xyz', 'A', 'zzzzzzzzzz']) {
      const av = defaultAvatarForId(id)
      expect(isValidAvatar(av)).toBe(true)
    }
  })

  it('tolerates empty / nullish ids', () => {
    expect(isValidAvatar(defaultAvatarForId(''))).toBe(true)
    expect(isValidAvatar(defaultAvatarForId(undefined))).toBe(true)
    expect(isValidAvatar(defaultAvatarForId(null))).toBe(true)
  })

  it('spreads 200 ids across multiple avatars (not all identical)', () => {
    const picks = new Set(Array.from({ length: 200 }, (_, i) => defaultAvatarForId(`user-${i}`)))
    expect(picks.size).toBeGreaterThan(1)
  })
})
