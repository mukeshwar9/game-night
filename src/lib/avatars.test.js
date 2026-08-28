import { describe, it, expect } from 'vitest'
import {
  SHAPES, TONES, CLASSIC_TONES, HUMANOIDS, PARTS, PICKER_SHAPES,
  SKIN_TONES, HAIR_STYLES, ACCESSORIES,
  makeAvatar, parseAvatar, canonicalAvatar,
  isValidAvatar, defaultAvatarForId,
  isHumanoid, makeHumanoid, outfitFromTone,
  OUTFIT_PRESETS, TONE_LABEL, SKIN_LABEL, HAIR_LABEL, ACCESSORY_LABEL,
} from './avatars'

describe('SHAPES', () => {
  it('has exactly 24 unique string keys', () => {
    expect(SHAPES.length).toBe(24)
    expect(new Set(SHAPES).size).toBe(24)
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

  it('appends boy, girl, kid, punk last in order (wire format — must never reorder)', () => {
    expect(SHAPES.slice(20)).toEqual(['boy', 'girl', 'kid', 'punk'])
  })
})

describe('TONES', () => {
  it('pins exact wire-format array', () => {
    expect(TONES).toEqual(['p1', 'p2', 'cta', 'win', 'text', 'dim', 'av1', 'av2', 'av3', 'av4'])
  })
})

describe('SKIN_TONES / HAIR_STYLES / ACCESSORIES', () => {
  it('pins exact wire-format arrays', () => {
    expect(SKIN_TONES).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(HAIR_STYLES).toEqual(['none', 'short', 'spiky', 'long', 'bob', 'curly'])
    expect(ACCESSORIES).toEqual(['none', 'glasses', 'headphones', 'crown', 'cape'])
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

  it('pins boy/girl/kid/punk classic tones', () => {
    expect(CLASSIC_TONES.boy).toBe('p1')
    expect(CLASSIC_TONES.girl).toBe('p2')
    expect(CLASSIC_TONES.kid).toBe('win')
    expect(CLASSIC_TONES.punk).toBe('cta')
  })
})

describe('HUMANOIDS / PARTS / PICKER_SHAPES', () => {
  it('HUMANOIDS is exactly boy, girl, kid, punk', () => {
    expect(HUMANOIDS).toEqual(['boy', 'girl', 'kid', 'punk'])
  })

  it('PARTS is exactly cap, shirt, pants, shoes', () => {
    expect(PARTS).toEqual(['cap', 'shirt', 'pants', 'shoes'])
  })

  it('PICKER_SHAPES is HUMANOIDS', () => {
    expect(PICKER_SHAPES).toBe(HUMANOIDS)
  })

  it('isHumanoid true only for boy/girl/kid/punk', () => {
    expect(isHumanoid('boy')).toBe(true)
    expect(isHumanoid('girl')).toBe(true)
    expect(isHumanoid('kid')).toBe(true)
    expect(isHumanoid('punk')).toBe(true)
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
  it('makeHumanoid with only the 4 legacy parts emits the 4-tuple', () => {
    expect(makeHumanoid('boy', { cap: 'p1', shirt: 'p2', pants: 'dim', shoes: 'text' }))
      .toBe('boy.p1-p2-dim-text')
  })

  it('makeHumanoid emits the 8-tuple when any v2 extra is non-default', () => {
    expect(makeHumanoid('boy', { cap: 'p1', shirt: 'p2', pants: 'dim', shoes: 'text', hair: 'spiky' }))
      .toBe('boy.p1-p2-dim-text-s3-spiky-p1-none')
    expect(makeHumanoid('boy', { cap: 'p1', shirt: 'p2', pants: 'dim', shoes: 'text', skin: 's5' }))
      .toBe('boy.p1-p2-dim-text-s5-none-p1-none')
    expect(makeHumanoid('boy', { cap: 'p1', shirt: 'p2', pants: 'dim', shoes: 'text', acc: 'cape' }))
      .toBe('boy.p1-p2-dim-text-s3-none-p1-cape')
    expect(makeHumanoid('boy', { cap: 'p1', shirt: 'p2', pants: 'dim', shoes: 'text', hairColor: 'cta' }))
      .toBe('boy.p1-p2-dim-text-s3-none-cta-none')
  })

  it('makeHumanoid emits the 8-tuple when cap is none, even with all other defaults', () => {
    expect(makeHumanoid('boy', { cap: 'none', shirt: 'p2', pants: 'dim', shoes: 'text' }))
      .toBe('boy.none-p2-dim-text-s3-none-p1-none')
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

  it('bare humanoid key → classic tone + derived extended parts', () => {
    expect(parseAvatar('boy')).toEqual({
      shape: 'boy', tone: 'p1',
      parts: { cap: 'p1', shirt: 'p1', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p1', acc: 'none' },
    })
    expect(parseAvatar('girl')).toEqual({
      shape: 'girl', tone: 'p2',
      parts: { cap: 'p2', shirt: 'p2', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p2', acc: 'none' },
    })
    expect(parseAvatar('kid')).toEqual({
      shape: 'kid', tone: 'win',
      parts: { cap: 'win', shirt: 'win', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'win', acc: 'none' },
    })
    expect(parseAvatar('punk')).toEqual({
      shape: 'punk', tone: 'cta',
      parts: { cap: 'cta', shirt: 'cta', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'cta', acc: 'none' },
    })
  })

  it('valid 4-tuple humanoid → shape, tone = shirt, full 8-key parts map (v2 extras at default)', () => {
    expect(parseAvatar('boy.p1-p2-dim-text')).toEqual({
      shape: 'boy',
      tone: 'p2',
      parts: { cap: 'p1', shirt: 'p2', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p1', acc: 'none' },
    })
    expect(parseAvatar('girl.cta-p2-dim-text')).toEqual({
      shape: 'girl',
      tone: 'p2',
      parts: { cap: 'cta', shirt: 'p2', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p2', acc: 'none' },
    })
  })

  it('single-tone humanoid expands to a derived extended outfit', () => {
    expect(parseAvatar('boy.p1')).toEqual({
      shape: 'boy', tone: 'p1',
      parts: { cap: 'p1', shirt: 'p1', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p1', acc: 'none' },
    })
  })

  it('malformed humanoid tuples fall back safely (like an unknown tone)', () => {
    const expected = {
      shape: 'boy', tone: 'p1',
      parts: { cap: 'p1', shirt: 'p1', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p1', acc: 'none' },
    }
    expect(parseAvatar('boy.p1-p2')).toEqual(expected)
    expect(parseAvatar('boy.p1-p2-x-win')).toEqual(expected)
  })

  describe('v2 8-tuple round-trip', () => {
    const samples = [
      { cap: 'p1', shirt: 'p2', pants: 'cta', shoes: 'win', skin: 's1', hair: 'short', hairColor: 'text', acc: 'glasses' },
      { cap: 'none', shirt: 'dim', pants: 'text', shoes: 'p1', skin: 's5', hair: 'long', hairColor: 'av2', acc: 'headphones' },
      { cap: 'av1', shirt: 'av2', pants: 'av3', shoes: 'av4', skin: 's3', hair: 'curly', hairColor: 'av4', acc: 'crown' },
      { cap: 'cta', shirt: 'win', pants: 'dim', shoes: 'text', skin: 's2', hair: 'bob', hairColor: 'cta', acc: 'cape' },
    ]

    it('parses every shape x sample correctly', () => {
      for (const shape of HUMANOIDS) {
        for (const parts of samples) {
          const id = `${shape}.${parts.cap}-${parts.shirt}-${parts.pants}-${parts.shoes}-${parts.skin}-${parts.hair}-${parts.hairColor}-${parts.acc}`
          expect(parseAvatar(id)).toEqual({ shape, tone: parts.shirt, parts })
        }
      }
    })
  })

  describe('v2 per-slot fallback', () => {
    const base = ['p1', 'p2', 'dim', 'text', 's3', 'short', 'p1', 'glasses']
    const classic = CLASSIC_TONES.boy // 'p1'

    function withBadSlot(i, badValue) {
      const segs = [...base]
      segs[i] = badValue
      return `boy.${segs.join('-')}`
    }

    it('bad cap falls back to classic tone', () => {
      expect(parseAvatar(withBadSlot(0, 'zzz')).parts.cap).toBe(classic)
    })
    it('bad shirt falls back to classic tone', () => {
      expect(parseAvatar(withBadSlot(1, 'zzz')).parts.shirt).toBe(classic)
    })
    it('bad pants falls back to classic tone', () => {
      expect(parseAvatar(withBadSlot(2, 'zzz')).parts.pants).toBe(classic)
    })
    it('bad shoes falls back to classic tone', () => {
      expect(parseAvatar(withBadSlot(3, 'zzz')).parts.shoes).toBe(classic)
    })
    it('bad skin falls back to s3', () => {
      expect(parseAvatar(withBadSlot(4, 'zzz')).parts.skin).toBe('s3')
    })
    it('bad hair falls back to none', () => {
      expect(parseAvatar(withBadSlot(5, 'zzz')).parts.hair).toBe('none')
    })
    it('bad hairColor falls back to classic tone', () => {
      expect(parseAvatar(withBadSlot(6, 'zzz')).parts.hairColor).toBe(classic)
    })
    it('bad acc falls back to none', () => {
      expect(parseAvatar(withBadSlot(7, 'zzz')).parts.acc).toBe('none')
    })
    it('cap additionally accepts "none" (not a fallback)', () => {
      expect(parseAvatar(withBadSlot(0, 'none')).parts.cap).toBe('none')
    })
    it('other slots do not accept "none" and fall back', () => {
      expect(parseAvatar(withBadSlot(1, 'none')).parts.shirt).toBe(classic)
    })
  })

  it('rejects segment counts 2, 3, 5, 6, 7 as malformed humanoid tuples', () => {
    const expected = {
      shape: 'boy', tone: 'p1',
      parts: { cap: 'p1', shirt: 'p1', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p1', acc: 'none' },
    }
    expect(parseAvatar('boy.p1-p2')).toEqual(expected) // 2
    expect(parseAvatar('boy.p1-p2-dim')).toEqual(expected) // 3
    expect(parseAvatar('boy.p1-p2-dim-text-s3')).toEqual(expected) // 5
    expect(parseAvatar('boy.p1-p2-dim-text-s3-none')).toEqual(expected) // 6
    expect(parseAvatar('boy.p1-p2-dim-text-s3-none-p1')).toEqual(expected) // 7
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

  it('is idempotent on valid 8-tuple humanoids', () => {
    const id = 'punk.av1-av2-av3-av4-s4-curly-cta-crown'
    expect(canonicalAvatar(id)).toBe(id)
  })

  it('collapses an 8-tuple with all-default extras back to a 4-tuple', () => {
    expect(canonicalAvatar('boy.p1-p2-dim-text-s3-none-p1-none')).toBe('boy.p1-p2-dim-text')
  })
})

describe('makeAvatar + round-trip', () => {
  it('makeAvatar then parseAvatar round-trips for all shape×tone pairs', () => {
    for (const shape of SHAPES) {
      for (const tone of TONES) {
        const composite = makeAvatar(shape, tone)
        if (isHumanoid(shape)) {
          expect(parseAvatar(composite)).toEqual({
            shape, tone,
            parts: { ...outfitFromTone(tone), skin: 's3', hair: 'none', hairColor: CLASSIC_TONES[shape], acc: 'none' },
          })
        } else {
          expect(parseAvatar(composite)).toEqual({ shape, tone })
        }
      }
    }
  })

  it('makeHumanoid then parseAvatar round-trips for sampled 4-part combos', () => {
    const combos = [
      { cap: 'p1', shirt: 'p2', pants: 'cta', shoes: 'win' },
      { cap: 'dim', shirt: 'text', pants: 'p1', shoes: 'p2' },
      { cap: 'win', shirt: 'win', pants: 'win', shoes: 'win' },
      { cap: 'cta', shirt: 'dim', pants: 'text', shoes: 'cta' },
    ]
    for (const shape of HUMANOIDS) {
      for (const parts of combos) {
        const id = makeHumanoid(shape, parts)
        expect(parseAvatar(id)).toEqual({
          shape, tone: parts.shirt,
          parts: { ...parts, skin: 's3', hair: 'none', hairColor: CLASSIC_TONES[shape], acc: 'none' },
        })
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
    expect(isValidAvatar('kid')).toBe(true)
    expect(isValidAvatar('punk')).toBe(true)
  })

  it('accepts valid 4-tuple humanoid ids', () => {
    expect(isValidAvatar('boy.p1-p2-dim-text')).toBe(true)
    expect(isValidAvatar('girl.cta-p2-dim-text')).toBe(true)
  })

  it('accepts valid 8-tuple humanoid ids, cap "none" included', () => {
    expect(isValidAvatar('kid.none-p2-dim-text-s2-spiky-p1-glasses')).toBe(true)
    expect(isValidAvatar('punk.av1-av2-av3-av4-s5-curly-av4-crown')).toBe(true)
  })

  it('rejects an 8-tuple with any slot out of vocab', () => {
    expect(isValidAvatar('boy.zzz-p2-dim-text-s3-none-p1-none')).toBe(false)
    expect(isValidAvatar('boy.p1-p2-dim-text-zzz-none-p1-none')).toBe(false)
    expect(isValidAvatar('boy.p1-p2-dim-text-s3-zzz-p1-none')).toBe(false)
    expect(isValidAvatar('boy.p1-p2-dim-text-s3-none-zzz-none')).toBe(false)
    expect(isValidAvatar('boy.p1-p2-dim-text-s3-none-p1-zzz')).toBe(false)
  })

  it('rejects malformed humanoid tuples of length 2, 3, 5, 6, 7', () => {
    expect(isValidAvatar('boy.p1-p2')).toBe(false)
    expect(isValidAvatar('boy.p1-p2-dim')).toBe(false)
    expect(isValidAvatar('boy.p1-p2-dim-text-s3')).toBe(false)
    expect(isValidAvatar('boy.p1-p2-dim-text-s3-none')).toBe(false)
    expect(isValidAvatar('boy.p1-p2-dim-text-s3-none-p1')).toBe(false)
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

  it('always assigns acc "none"', () => {
    for (const id of ['a', 'bb', 'ccc', 'user-42', 'firebase-uid-xyz']) {
      expect(parseAvatar(defaultAvatarForId(id)).parts.acc).toBe('none')
    }
  })

  it('spreads 200 ids across multiple avatars (not all identical)', () => {
    const picks = new Set(Array.from({ length: 200 }, (_, i) => defaultAvatarForId(`user-${i}`)))
    expect(picks.size).toBeGreaterThan(1)
  })

  it('spreads across all 4 bodies and multiple skins over 200 ids', () => {
    const shapes = new Set()
    const skins = new Set()
    const outfits = new Set()
    for (let i = 0; i < 200; i++) {
      const { shape, parts } = parseAvatar(defaultAvatarForId(`user-${i}`))
      shapes.add(shape)
      skins.add(parts.skin)
      outfits.add(JSON.stringify(parts))
    }
    expect(shapes.size).toBe(4)
    expect(skins.size).toBeGreaterThan(1)
    expect(outfits.size).toBeGreaterThan(1)
  })
})

describe('OUTFIT_PRESETS', () => {
  it('has 7 presets with id, label and a full part set', () => {
    expect(OUTFIT_PRESETS.length).toBe(7)
    for (const preset of OUTFIT_PRESETS) {
      expect(typeof preset.id).toBe('string')
      expect(typeof preset.label).toBe('string')
      for (const key of ['cap', 'shirt', 'pants', 'shoes', 'skin', 'hair', 'hairColor', 'acc']) {
        expect(preset.parts).toHaveProperty(key)
      }
    }
  })

  it('has unique ids', () => {
    const ids = OUTFIT_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset is valid via makeHumanoid for every shape', () => {
    for (const preset of OUTFIT_PRESETS) {
      for (const shape of HUMANOIDS) {
        expect(isValidAvatar(makeHumanoid(shape, preset.parts))).toBe(true)
      }
    }
  })

  it('includes at least one preset with cap "none" paired with a hair style', () => {
    const hasCapNoneWithHair = OUTFIT_PRESETS.some(p => p.parts.cap === 'none' && p.parts.hair !== 'none')
    expect(hasCapNoneWithHair).toBe(true)
  })
})

describe('label maps', () => {
  it('TONE_LABEL covers every tone', () => {
    for (const tone of TONES) expect(typeof TONE_LABEL[tone]).toBe('string')
    expect(Object.keys(TONE_LABEL).length).toBe(TONES.length)
  })

  it('SKIN_LABEL covers every skin tone', () => {
    for (const skin of SKIN_TONES) expect(typeof SKIN_LABEL[skin]).toBe('string')
    expect(Object.keys(SKIN_LABEL).length).toBe(SKIN_TONES.length)
  })

  it('HAIR_LABEL covers every hair style', () => {
    for (const hair of HAIR_STYLES) expect(typeof HAIR_LABEL[hair]).toBe('string')
    expect(Object.keys(HAIR_LABEL).length).toBe(HAIR_STYLES.length)
  })

  it('ACCESSORY_LABEL covers every accessory', () => {
    for (const acc of ACCESSORIES) expect(typeof ACCESSORY_LABEL[acc]).toBe('string')
    expect(Object.keys(ACCESSORY_LABEL).length).toBe(ACCESSORIES.length)
  })
})
