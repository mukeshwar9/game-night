import { describe, it, expect } from 'vitest'
import {
  FIELDS, DEFAULTS, PREFIX, optionsFor, encodeAvatar, decodeAvatar, isKitAvatar, isValidKitAvatar, canonicalKit,
  randomLook, shuffleAvatar, defaultKitAvatar, optionInfo, premiumItems, isPremiumTier,
} from './catalog.js'

function seeded(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

describe('catalog stability (append-only wire format)', () => {
  // These heads are what saved avatars index into. If this test fails you reordered or
  // removed an entry - append instead.
  it('pins the head of each list', () => {
    expect(FIELDS.map(f => f.key)).toEqual([
      'skin', 'hair', 'hairColor', 'eyes', 'eyeColor', 'brows', 'nose', 'mouth', 'marks', 'beard', 'hat', 'hatColor',
      'hatAccent', 'glasses', 'extra', 'outfit', 'topColor', 'bottomColor', 'shoeColor', 'pet', 'bg', 'bgColor', 'frame',
    ])
    expect(optionsFor('skin').slice(0, 3)).toEqual(['s1', 's2', 's3'])
    expect(optionsFor('hair').slice(0, 4)).toEqual(['bald', 'buzz', 'crop', 'spiky'])
    expect(optionsFor('eyes').slice(0, 3)).toEqual(['bright', 'dots', 'calm'])
    expect(optionsFor('hat').slice(0, 3)).toEqual(['none', 'cap', 'beanie'])
    expect(optionsFor('outfit').slice(0, 3)).toEqual(['casual', 'hoodie', 'shirt'])
    expect(optionsFor('hatColor').slice(0, 3)).toEqual(['red', 'orange', 'yellow'])
    expect(optionsFor('hatColor').slice(14)).toEqual(['holo', 'galaxy', 'goldfx', 'lava', 'neon', 'ice'])
    expect(optionsFor('bgColor')).toHaveLength(14)
    // Arrows rewards were appended after the original entries, never inserted.
    expect(optionsFor('hat').slice(-2)).toEqual(['arrowband', 'arrowcrown'])
    expect(optionsFor('bg').slice(-2)).toEqual(['arrowfield', 'portalsky'])
    expect(optionsFor('frame').slice(-3)).toEqual(['portalrim', 'arrowchase', 'goldarrow'])
    expect(optionsFor('pet').slice(-5)).toEqual(['snakeegg', 'arrowsnake', 'portalpy', 'hooky', 'goldsnake'])
    expect(optionsFor('outfit').slice(-1)).toEqual(['arrowtee'])
    expect(optionsFor('glasses').slice(-1)).toEqual(['portal'])
  })

  it('keeps every list within one base-36 character', () => {
    for (const f of FIELDS) expect(optionsFor(f.key).length).toBeLessThanOrEqual(36)
  })

  it('has unique ids per list', () => {
    for (const f of FIELDS) {
      const ids = optionsFor(f.key)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('defaults are valid ids', () => {
    for (const f of FIELDS) expect(optionsFor(f.key)).toContain(DEFAULTS[f.key])
  })
})

describe('encode / decode', () => {
  it('round-trips random looks, always short enough for every length cap', () => {
    const rand = seeded(7)
    for (let i = 0; i < 400; i++) {
      const look = randomLook(rand, { premium: i % 2 === 0 })
      const s = encodeAvatar(look)
      expect(s.startsWith(PREFIX)).toBe(true)
      expect(s.length).toBe(PREFIX.length + FIELDS.length)
      expect(s.length).toBeLessThanOrEqual(32) // leaderboard copy clips at 32
      expect(isValidKitAvatar(s)).toBe(true)
      expect(decodeAvatar(s)).toEqual(look)
    }
  })

  it('is total: short, garbled or out-of-range strings decode to a full look', () => {
    for (const s of ['K1', 'K1zzzzzzzzzzzzzzzzzzzzzzz', 'K1!!!!', 'K1' + '9'.repeat(40), 'K']) {
      const look = decodeAvatar(s)
      for (const f of FIELDS) expect(optionsFor(f.key)).toContain(look[f.key])
    }
    expect(decodeAvatar('K1')).toEqual(DEFAULTS)
  })

  it('later fields fall back to defaults when an older, shorter string is read', () => {
    const full = encodeAvatar({ ...DEFAULTS, hair: 'locs' })
    const look = decodeAvatar(full.slice(0, 6))
    expect(look.hair).toBe('locs')
    expect(look.frame).toBe(DEFAULTS.frame)
  })

  it('canonicalises and detects kit strings', () => {
    expect(isKitAvatar('K1abc')).toBe(true)
    expect(isKitAvatar('kid.p1')).toBe(false)
    expect(isKitAvatar(null)).toBe(false)
    expect(canonicalKit('K1')).toBe(encodeAvatar(DEFAULTS))
    expect(isValidKitAvatar('K1')).toBe(false)
  })
})

describe('premium flags', () => {
  it('flags paid items and keeps today\'s wardrobe free', () => {
    expect(optionInfo('hat', 'crown').tier).toBe('free')
    expect(optionInfo('glasses', 'round').tier).toBe('free')
    expect(optionInfo('hat', 'halo').tier).toBe('pass')
    expect(optionInfo('hat', 'royal')).toMatchObject({ tier: 'pack', pack: 'royal' })
    expect(optionInfo('outfit', 'pjs').tier).toBe('earn')
    expect(optionInfo('hairColor', 'holo').tier).toBe('pass')
    expect(optionInfo('hairColor', 'hblack').tier).toBe('free')
    expect(isPremiumTier('pass')).toBe(true)
    expect(isPremiumTier('earn')).toBe(false)
  })

  it('lists what a look wears that is not free', () => {
    const items = premiumItems({ ...DEFAULTS, hat: 'halo', outfit: 'pjs' })
    expect(items.map(i => i.id).sort()).toEqual(['halo', 'pjs'])
  })

  it('SHUFFLE never rolls pass or pack items unless asked', () => {
    const rand = seeded(3)
    for (let i = 0; i < 300; i++) {
      expect(premiumItems(randomLook(rand)).filter(p => isPremiumTier(p.tier))).toEqual([])
    }
    let sawPaid = false
    for (let i = 0; i < 300 && !sawPaid; i++) sawPaid = premiumItems(randomLook(rand, { premium: true })).some(p => isPremiumTier(p.tier))
    expect(sawPaid).toBe(true)
  })
})

describe('shuffle and default', () => {
  it('shuffle visibly changes the avatar', () => {
    const rand = seeded(11)
    let cur = defaultKitAvatar('uid-1')
    for (let i = 0; i < 20; i++) {
      const next = shuffleAvatar(rand, cur)
      expect(next).not.toBe(cur)
      cur = next
    }
  })

  it('default avatar is stable per uid, valid, and varies between uids', () => {
    expect(defaultKitAvatar('abc')).toBe(defaultKitAvatar('abc'))
    expect(isValidKitAvatar(defaultKitAvatar('abc'))).toBe(true)
    const set = new Set(Array.from({ length: 30 }, (_, i) => defaultKitAvatar(`uid-${i}`)))
    expect(set.size).toBeGreaterThan(25)
    expect(isValidKitAvatar(defaultKitAvatar(''))).toBe(true)
  })
})
