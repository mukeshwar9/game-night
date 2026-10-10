import { describe, it, expect } from 'vitest'
import { legacyToLook, migrateLegacyAvatar } from './migrate.js'
import { isValidKitAvatar, decodeAvatar, optionsFor, FIELDS } from './catalog.js'
import { resolveAvatar, canonicalAvatarId, snapSize } from './index.js'
import { SHAPES, HUMANOIDS, TONES, SKIN_TONES, HAIR_STYLES, ACCESSORIES, makeHumanoid, makeAvatar, defaultAvatarForId } from '../avatars.js'

describe('legacy -> kit migration', () => {
  it('maps a full legacy humanoid onto the new catalogs', () => {
    const look = legacyToLook('punk.cta-p2-dim-text-s4-curly-av4-crown')
    expect(look).toMatchObject({
      skin: 's7', hair: 'curly', hairColor: 'hbrown', hat: 'crown', outfit: 'casual',
      topColor: 'pink', bottomColor: 'grey', shoeColor: 'white',
    })
  })

  it('girl becomes a dress, cape accessory becomes the hero cape, glasses carry over', () => {
    expect(legacyToLook('girl.p2').outfit).toBe('dress')
    expect(legacyToLook(makeHumanoid('boy', { cap: 'none', shirt: 'p1', pants: 'dim', shoes: 'text', acc: 'cape' })).outfit).toBe('cape')
    expect(legacyToLook(makeHumanoid('boy', { cap: 'none', shirt: 'p1', pants: 'dim', shoes: 'text', acc: 'glasses' })).glasses).toBe('round')
  })

  it('a cap becomes a cap in the old cap colour; no cap means no hat', () => {
    expect(legacyToLook('boy.cta-p1-dim-text')).toMatchObject({ hat: 'cap', hatColor: 'yellow' })
    expect(legacyToLook(makeHumanoid('boy', { cap: 'none', shirt: 'p1', pants: 'dim', shoes: 'text' })).hat).toBe('none')
  })

  it('every legacy humanoid combination migrates to a valid kit string', () => {
    let n = 0
    for (const shape of HUMANOIDS) {
      for (const skin of SKIN_TONES) {
        for (const hair of HAIR_STYLES) {
          for (const acc of ACCESSORIES) {
            for (const tone of TONES) {
              const id = makeHumanoid(shape, { cap: tone, shirt: tone, pants: 'dim', shoes: 'text', skin, hair, hairColor: tone, acc })
              const s = migrateLegacyAvatar(id)
              expect(isValidKitAvatar(s)).toBe(true)
              n++
            }
          }
        }
      }
    }
    expect(n).toBe(4 * 5 * 6 * 5 * 10)
  })

  it('legacy defaults for brand-new users migrate too', () => {
    for (let i = 0; i < 100; i++) expect(isValidKitAvatar(migrateLegacyAvatar(defaultAvatarForId(`u${i}`)))).toBe(true)
  })

  it('creatures stay classic (null), as do unknown ids', () => {
    for (const shape of SHAPES.filter(s => !HUMANOIDS.includes(s))) {
      expect(migrateLegacyAvatar(shape)).toBeNull()
      expect(migrateLegacyAvatar(makeAvatar(shape, 'p2'))).toBeNull()
    }
  })

  it('same legacy id always gets the same backdrop', () => {
    expect(legacyToLook('kid.p1').bgColor).toBe(legacyToLook('kid.p1').bgColor)
    for (const f of FIELDS) expect(optionsFor(f.key)).toContain(legacyToLook('kid.p1')[f.key])
  })
})

describe('resolveAvatar - nothing renders blank', () => {
  it('resolves every kind of stored value', () => {
    expect(resolveAvatar('ghost.p2')).toEqual({ kind: 'classic', id: 'ghost.p2' })
    expect(resolveAvatar('ghost').kind).toBe('classic')
    expect(resolveAvatar('kid.cta-p2-dim-text-s2-spiky-p1-glasses').kind).toBe('kit')
    expect(resolveAvatar('boy').kind).toBe('kit')
    expect(resolveAvatar(canonicalAvatarId('girl.p2')).kind).toBe('kit')
    for (const bad of [undefined, null, '', 42, 'zzz', 'K1', 'K1!!', {}, 'nonsense.thing']) {
      const r = resolveAvatar(bad)
      expect(['kit', 'classic']).toContain(r.kind)
      if (r.kind === 'kit') for (const f of FIELDS) expect(optionsFor(f.key)).toContain(r.look[f.key])
    }
  })

  it('canonicalAvatarId upgrades humanoids, keeps creatures and kit strings', () => {
    const up = canonicalAvatarId('girl.p2')
    expect(up.startsWith('K1')).toBe(true)
    expect(canonicalAvatarId(up)).toBe(up)
    expect(canonicalAvatarId('ghost.p2')).toBe('ghost.p2')
    expect(decodeAvatar(up).outfit).toBe('dress')
  })
})

describe('snapSize', () => {
  it('moves every in-app size onto the 24 / 48 / 72 / 96 / 144 ladder', () => {
    const want = { 16: 24, 20: 24, 22: 24, 26: 24, 28: 24, 30: 48, 32: 48, 36: 48, 40: 48, 44: 48, 56: 48, 72: 72, 88: 96, 96: 96, 120: 96, 128: 144, 144: 144, 400: 144 }
    for (const [from, to] of Object.entries(want)) expect(snapSize(Number(from))).toBe(to)
    expect(snapSize(0)).toBe(24)
    expect(snapSize(NaN)).toBe(24)
  })
})
