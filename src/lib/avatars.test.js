import { describe, it, expect } from 'vitest'
import {
  SHAPES, TONES, CLASSIC_TONES, HUMANOIDS, PARTS, PICKER_SHAPES,
  makeAvatar, parseAvatar, canonicalAvatar,
  isValidAvatar, defaultAvatarForId,
  isHumanoid, makeHumanoid, outfitFromTone,
} from './avatars'

describe('SHAPES', () => {
  it('has exactly 22 unique string keys', () => {
    expect(SHAPES.length).toBe(22)
    expect(new Set(SHAPES).size).toBe(22)
    for (const key of SHAPES) expect(typeof key).toBe('string')
  })

  it('pins the original 12 legacy keys in order (wire format — must never rename)', () => {
    expect(SHAPES.slice(0, 12)).toEqual([
      'invader', 'robot', 'ghost', 'alien', 'skull', 'cat',
      'ufo', 'wizard', 'ninja', 'crown', 'dino', 'heart',
    ])
  })

  it('includes all 8 second-wave shapes', () => {
    for (const key of ['frog', 'star', 'mushroom', 'bolt', 'moon', 'fish', 'sword', 'slime']) {
      expect(SHAPES).toContain(key)
    }
  })

  it('appends boy and girl last (wire format — must never reorder)', () => {
    expect(SHAPES.slice(20)).toEqual(['boy', 'girl'])
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

  it('pins boy/girl classic tones', () => {
    expect(CLASSIC_TONES.boy).toBe('p1')
    expect(CLASSIC_TONES.girl).toBe('p2')
  })
})

describe('HUMANOIDS / PARTS / PICKER_SHAPES', () => {
  it('HUMANOIDS is exactly boy, girl', () => {
    expect(HUMANOIDS).toEqual(['boy', 'girl'])
  })

  it('PARTS is exactly cap, shirt, pants, shoes', () => {
    expect(PARTS).toEqual(['cap', 'shirt', 'pants', 'shoes'])
  })

  it('PICKER_SHAPES is HUMANOIDS', () => {
    expect(PICKER_SHAPES).toBe(HUMANOIDS)
  })

  it('isHumanoid true only for boy/girl', () => {
    expect(isHumanoid('boy')).toBe(true)
    expect(isHumanoid('girl')).toBe(true)
    expect(isHumanoid('ghost')).toBe(false)
    expect(isHumanoid('zzz')).toBe(false)
  })
})

describe('makeAvatar', () => {
  it('joins shape and tone with a dot', () => {
    expect(makeAvatar('ghost', 'p2')).toBe('ghost.p2')
    expect(makeAvatar('invader', 'win')).toBe('invader.win')
  })
})

describe('makeHumanoid / outfitFromTone', () => {
  it('makeHumanoid joins shape and 4 dash-separated parts', () => {
    expect(makeHumanoid('boy', { cap: 'p1', shirt: 'p2', pants: 'dim', shoes: 'text' }))
      .toBe('boy.p1-p2-dim-text')
  })

  it('outfitFromTone derives a full part map from one tone', () => {
    expect(outfitFromTone('cta')).toEqual({ cap: 'cta', shirt: 'cta', pants: 'dim', shoes: 'text' })
    for (const tone of TONES) {
      const outfit = outfitFromTone(tone)
      for (const part of PARTS) expect(TONES).toContain(outfit[part])
    }
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

  it('bare humanoid key → classic tone + derived outfit', () => {
    expect(parseAvatar('boy')).toEqual({ shape: 'boy', tone: 'p1', parts: outfitFromTone('p1') })
    expect(parseAvatar('girl')).toEqual({ shape: 'girl', tone: 'p2', parts: outfitFromTone('p2') })
  })

  it('valid 4-tuple humanoid → shape, tone = shirt, full parts map', () => {
    expect(parseAvatar('boy.p1-p2-dim-text')).toEqual({
      shape: 'boy',
      tone: 'p2',
      parts: { cap: 'p1', shirt: 'p2', pants: 'dim', shoes: 'text' },
    })
    expect(parseAvatar('girl.cta-p2-dim-text')).toEqual({
      shape: 'girl',
      tone: 'p2',
      parts: { cap: 'cta', shirt: 'p2', pants: 'dim', shoes: 'text' },
    })
  })

  it('single-tone humanoid expands to a derived outfit', () => {
    expect(parseAvatar('boy.p1')).toEqual({ shape: 'boy', tone: 'p1', parts: outfitFromTone('p1') })
  })

  it('malformed humanoid tuples fall back safely (like an unknown tone)', () => {
    expect(parseAvatar('boy.p1-p2')).toEqual({ shape: 'boy', tone: 'p1', parts: outfitFromTone('p1') })
    expect(parseAvatar('boy.p1-p2-x-win')).toEqual({ shape: 'boy', tone: 'p1', parts: outfitFromTone('p1') })
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

  it('normalizes a single-tone humanoid to a 4-tuple', () => {
    expect(canonicalAvatar('boy.p1')).toBe('boy.p1-p1-dim-text')
  })

  it('is idempotent on valid 4-tuple humanoids', () => {
    expect(canonicalAvatar('girl.cta-p2-dim-text')).toBe('girl.cta-p2-dim-text')
  })
})

describe('makeAvatar + round-trip', () => {
  it('makeAvatar then parseAvatar round-trips for all shape×tone pairs', () => {
    for (const shape of SHAPES) {
      for (const tone of TONES) {
        const composite = makeAvatar(shape, tone)
        if (isHumanoid(shape)) {
          expect(parseAvatar(composite)).toEqual({ shape, tone, parts: outfitFromTone(tone) })
        } else {
          expect(parseAvatar(composite)).toEqual({ shape, tone })
        }
      }
    }
  })

  it('makeHumanoid then parseAvatar round-trips for sampled part combos', () => {
    const combos = [
      { cap: 'p1', shirt: 'p2', pants: 'cta', shoes: 'win' },
      { cap: 'dim', shirt: 'text', pants: 'p1', shoes: 'p2' },
      { cap: 'win', shirt: 'win', pants: 'win', shoes: 'win' },
      { cap: 'cta', shirt: 'dim', pants: 'text', shoes: 'cta' },
    ]
    for (const shape of HUMANOIDS) {
      for (const parts of combos) {
        const id = makeHumanoid(shape, parts)
        expect(parseAvatar(id)).toEqual({ shape, tone: parts.shirt, parts })
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

  it('accepts bare humanoid keys', () => {
    expect(isValidAvatar('boy')).toBe(true)
    expect(isValidAvatar('girl')).toBe(true)
  })

  it('accepts valid 4-tuple humanoid ids', () => {
    expect(isValidAvatar('boy.p1-p2-dim-text')).toBe(true)
    expect(isValidAvatar('girl.cta-p2-dim-text')).toBe(true)
  })

  it('rejects malformed humanoid tuples', () => {
    expect(isValidAvatar('boy.p1-p2')).toBe(false)
    expect(isValidAvatar('boy.p1-p2-x-win')).toBe(false)
  })
})

describe('defaultAvatarForId', () => {
  it('is deterministic for the same id', () => {
    expect(defaultAvatarForId('same-id')).toBe(defaultAvatarForId('same-id'))
  })

  it('returns a valid humanoid avatar', () => {
    for (const id of ['abc123', 'firebase-uid-xyz', 'A', 'zzzzzzzzzz']) {
      const av = defaultAvatarForId(id)
      expect(isValidAvatar(av)).toBe(true)
      expect(HUMANOIDS).toContain(parseAvatar(av).shape)
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

  it('spreads across both shapes and multiple outfits', () => {
    const shapes = new Set()
    const outfits = new Set()
    for (let i = 0; i < 200; i++) {
      const { shape, parts } = parseAvatar(defaultAvatarForId(`user-${i}`))
      shapes.add(shape)
      outfits.add(JSON.stringify(parts))
    }
    expect(shapes.size).toBe(2)
    expect(outfits.size).toBeGreaterThan(1)
  })
})
