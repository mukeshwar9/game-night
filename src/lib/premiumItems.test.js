import { describe, expect, it } from 'vitest'
import { THEMES } from './theme'
import { FONTS } from './font'
import { PACKS } from './premiumCatalog'
import { allPremiumItems, premiumItems } from './premiumItems'
import { isUnlocked } from './premium'

describe('premium registry entries', () => {
  it('every premium or seasonal theme and font is flagged, and packs exist', () => {
    for (const list of [THEMES, FONTS]) {
      for (const entry of list.filter(e => e.tier)) {
        expect(entry.premium, `${entry.id} has a tier but is not gated`).toBe(true)
      }
    }
    for (const t of THEMES.filter(e => e.premium)) {
      expect(PACKS.some(p => p.id === t.pack && p.kind === 'theme'), `${t.id} pack`).toBe(true)
    }
  })

  it('keeps every launch-era free theme and font ungated', () => {
    for (const id of ['matcha', 'midnight', 'phosphor', 'sakura', 'cotton-candy', 'arctic-frost']) {
      expect(isUnlocked({ kind: 'theme', ...THEMES.find(t => t.id === id) }, {})).toBe(true)
    }
    for (const id of ['press-start', 'silkscreen', 'pixelify']) {
      expect(isUnlocked({ kind: 'font', ...FONTS.find(f => f.id === id) }, {})).toBe(true)
    }
  })

  it('the shop lists the premium themes and emotes', () => {
    expect(premiumItems('theme').map(t => t.id)).toEqual(expect.arrayContaining(['campfire', 'pumpkin']))
    expect(premiumItems('emote').length).toBeGreaterThan(0)
    expect(allPremiumItems().every(i => i.premium === true)).toBe(true)
  })

  it('locks a premium theme without an entitlement and opens it with the pack', () => {
    const campfire = { kind: 'theme', ...THEMES.find(t => t.id === 'campfire') }
    expect(isUnlocked(campfire, { ent: null })).toBe(false)
    expect(isUnlocked(campfire, { ent: { packs: { 'themes-seasonal': true } } })).toBe(true)
  })
})
