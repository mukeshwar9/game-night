// The game-art style pref: CUT PAPER is the default, TOON / PIXEL SCENE /
// ICONS are the other choices, and a saved pref for a retired style (the pixel
// OBJECT and CAST looks, the old BOLD png and SOFT svg) lands on CUT PAPER.
import { afterEach, describe, expect, it, vi } from 'vitest'

function stubStorage(initial) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) })
  return store
}

// The module reads the pref once at import time, so each case imports it fresh.
async function load(initial = {}) {
  vi.resetModules()
  const store = stubStorage(initial)
  const mod = await import('./gameArtStyle')
  return { mod, store }
}

afterEach(() => vi.unstubAllGlobals())

describe('game art style pref', () => {
  it('offers CUT PAPER, TOON, PIXEL SCENE and ICONS, in that order', async () => {
    const { mod } = await load()
    expect(mod.ART_STYLES.map(s => s.id)).toEqual(['cutpaper', 'toon', 'scene', 'icons'])
    expect(mod.PIXEL_ART_SIZES).toEqual({ scene: 64 })
  })

  it('defaults to CUT PAPER', async () => {
    const { mod } = await load()
    expect(mod.DEFAULT_ART_STYLE).toBe('cutpaper')
    expect(mod.getGameArtStyle()).toBe('cutpaper')
  })

  it.each(['object', 'cast'])('migrates a saved retired pixel %s style to CUT PAPER', async (retired) => {
    const { mod, store } = await load({ 'retro-gameart': retired })
    expect(mod.getGameArtStyle()).toBe('cutpaper')
    expect(store.get('retro-gameart')).toBe('cutpaper')
  })

  it.each(['png', 'svg', 'nonsense'])('reads the retired %s id as CUT PAPER', async (retired) => {
    const { mod } = await load({ 'retro-gameart': retired })
    expect(mod.getGameArtStyle()).toBe('cutpaper')
  })

  it.each(['cutpaper', 'toon', 'scene', 'icons'])('keeps a saved %s choice', async (id) => {
    const { mod, store } = await load({ 'retro-gameart': id })
    expect(mod.getGameArtStyle()).toBe(id)
    expect(store.get('retro-gameart')).toBe(id)
  })

  it('applyGameArtStyle stores a valid id and falls back to the default for an unknown one', async () => {
    const { mod, store } = await load()
    expect(mod.applyGameArtStyle('toon')).toBe('toon')
    expect(store.get('retro-gameart')).toBe('toon')
    expect(mod.applyGameArtStyle('object')).toBe('cutpaper')
    expect(store.get('retro-gameart')).toBe('cutpaper')
  })

  it('works without storage', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
    const mod = await import('./gameArtStyle')
    expect(mod.getGameArtStyle()).toBe('cutpaper')
    expect(mod.applyGameArtStyle('toon')).toBe('toon')
  })
})
