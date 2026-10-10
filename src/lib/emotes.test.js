import { describe, it, expect, beforeAll } from 'vitest'

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let EMOTES_FACES, EMOTES_PICKER_ALL, EMOTES_PICKER_FACES, EMOTES_PICKER_GESTURES, hasReactionCoverage

beforeAll(async () => {
  ;({
    EMOTES_FACES,
    EMOTES_PICKER_ALL,
    EMOTES_PICKER_FACES,
    EMOTES_PICKER_GESTURES,
  } = await import('./emotes'))
  ;({ hasReactionCoverage } = await import('./sounds'))
})

describe('emotes registry', () => {
  it('has no duplicate glyphs in picker lists', () => {
    expect(EMOTES_PICKER_FACES.length).toBe(new Set(EMOTES_PICKER_FACES).size)
    expect(EMOTES_PICKER_GESTURES.length).toBe(new Set(EMOTES_PICKER_GESTURES).size)
    expect(EMOTES_PICKER_ALL.length).toBe(new Set(EMOTES_PICKER_ALL).size)
  })

  it('includes a large face catalog', () => {
    expect(EMOTES_FACES.length).toBeGreaterThanOrEqual(70)
  })

  it('covers every picker glyph with reaction audio', () => {
    for (const glyph of EMOTES_PICKER_ALL) {
      expect(hasReactionCoverage(glyph), `missing sound for ${glyph}`).toBe(true)
    }
  })
})

describe('premium emote pack', () => {
  it('is flagged premium, in the pixel pack, and distinct from the free emotes', async () => {
    const { EMOTES_PREMIUM } = await import('./emotes')
    const { PACKS } = await import('./premiumCatalog')
    const glyphs = EMOTES_PREMIUM.map(e => e.glyph)
    expect(new Set(glyphs).size).toBe(glyphs.length)
    expect(new Set(EMOTES_PREMIUM.map(e => e.id)).size).toBe(EMOTES_PREMIUM.length)
    for (const e of EMOTES_PREMIUM) {
      expect(e).toMatchObject({ kind: 'emote', premium: true })
      expect(PACKS.some(p => p.id === e.pack && p.kind === 'emote')).toBe(true)
      expect(EMOTES_PICKER_ALL, `${e.glyph} would be free twice`).not.toContain(e.glyph)
    }
  })
})
