import { describe, expect, it } from 'vitest'
import { FIELDS, DEFAULTS, optionsFor, optionInfo } from './avatarKit/catalog.js'
import { PACKS } from './premiumCatalog'
import { isUnlocked } from './premium'
import { avatarItem, avatarShopItems, lockedInLook } from './avatarGate'

const premiumOptions = FIELDS.flatMap(f => optionsFor(f.key).map(o => [f.key, o])).filter(([k, o]) => ['pass', 'pack'].includes(optionInfo(k, o).tier))

describe('avatar gate', () => {
  it('gates exactly the pass and pack options, never free or earned ones', () => {
    expect(premiumOptions.length).toBeGreaterThan(0)
    for (const f of FIELDS) {
      for (const o of optionsFor(f.key)) {
        const tier = optionInfo(f.key, o).tier
        const item = avatarItem(f.key, o)
        expect(Boolean(item), `${f.key}:${o} (${tier})`).toBe(tier === 'pass' || tier === 'pack')
      }
    }
  })

  it('maps every kit pack to a sellable avatar pack', () => {
    for (const [k, o] of premiumOptions) {
      const item = avatarItem(k, o)
      if (optionInfo(k, o).tier === 'pack') expect(PACKS.some(p => p.id === item.pack && p.kind === 'avatar'), `${k}:${o} -> ${item.pack}`).toBe(true)
      else expect(item.pack).toBeUndefined()
    }
  })

  it('locks a pass-only item for a free viewer and opens it with the Pass, admin or bypass', () => {
    const halo = avatarItem('hair', optionsFor('hair').find(o => optionInfo('hair', o).tier === 'pass') ?? '')
    const item = halo ?? avatarItem('bg', 'stars')
    expect(isUnlocked(item, { ent: null })).toBe(false)
    expect(isUnlocked(item, { ent: { admin: true } })).toBe(true)
    expect(isUnlocked(item, { bypass: true })).toBe(true)
    expect(isUnlocked(item, { ent: { pass: { status: 'active', currentPeriodEnd: Date.now() + 1000 } } })).toBe(true)
  })

  it('a pack item opens with its pack only', () => {
    const confetti = avatarItem('bg', 'confetti')
    expect(confetti.pack).toBe('avatars-party')
    expect(isUnlocked(confetti, { ent: { packs: { 'avatars-party': true } } })).toBe(true)
    expect(isUnlocked(confetti, { ent: { packs: { 'avatars-royal': true } } })).toBe(false)
  })

  it('lists what a look wears that is still locked', () => {
    const look = { ...DEFAULTS, bg: 'confetti', frame: 'holo' }
    const locked = lockedInLook(look, item => isUnlocked(item, { ent: null }))
    expect(locked.map(i => i.id).sort()).toEqual(['bg:confetti', 'frame:holo'])
    expect(lockedInLook(look, () => true)).toEqual([])
    expect(lockedInLook({ ...DEFAULTS }, item => isUnlocked(item, { ent: null }))).toEqual([])
  })

  it('shop items are all flagged, unique and render a preview', () => {
    const items = avatarShopItems()
    expect(items.length).toBeGreaterThan(10)
    expect(new Set(items.map(i => i.id)).size).toBe(items.length)
    expect(items.every(i => i.premium && i.preview.startsWith('K1'))).toBe(true)
  })
})
