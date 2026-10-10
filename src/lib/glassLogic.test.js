import { describe, expect, it } from 'vitest'
import {
  GLASS_THEME_IDS, GLYPH_KINDS, MAX_LENS_SIDE, STEP, displacementMap, glassGlyphs, glassMode, highlightFromPointer,
  highlightFromTilt, initialStep, isBlinkEngine, isGlassTheme, isJanky, isLowEndAndroid, lensGeometry, nextStep,
} from './glassLogic'
import { THEMES } from './theme'

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const EDGE = `${CHROME} Edg/126.0.0.0`
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1'
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36'
const ANDROID_OLD_WEBVIEW = ANDROID_WEBVIEW.replace('Chrome/124', 'Chrome/105')

describe('theme ids', () => {
  it('lists exactly the GLASS entries of the registry, each drawing the glass backdrop', () => {
    const ids = THEMES.filter(t => t.id.startsWith('glass')).map(t => t.id)
    expect(ids.sort()).toEqual([...GLASS_THEME_IDS].sort())
    for (const id of ids) expect(THEMES.find(t => t.id === id).backdrop).toBe('glass')
  })

  it('isGlassTheme is true for the two variants only', () => {
    expect(isGlassTheme('glass')).toBe(true)
    expect(isGlassTheme('glass-night')).toBe(true)
    for (const id of ['matcha', 'midnight', 'shoreline', 'glassy', '', null, undefined]) expect(isGlassTheme(id)).toBe(false)
  })
})

describe('isBlinkEngine (the lens is gated by engine, never by @supports)', () => {
  it('is true on Chrome, Edge and a current Android WebView', () => {
    expect(isBlinkEngine({ userAgent: CHROME })).toBe(true)
    expect(isBlinkEngine({ userAgent: EDGE })).toBe(true)
    expect(isBlinkEngine({ userAgent: ANDROID_WEBVIEW })).toBe(true)
  })

  it('trusts the Chromium brand when the user agent is reduced', () => {
    expect(isBlinkEngine({ userAgent: CHROME, brands: [{ brand: 'Chromium' }, { brand: 'Not A;Brand' }] })).toBe(true)
  })

  it('is false on Safari, Firefox and every iOS browser', () => {
    expect(isBlinkEngine({ userAgent: SAFARI_MAC })).toBe(false)
    expect(isBlinkEngine({ userAgent: SAFARI_IOS })).toBe(false)
    expect(isBlinkEngine({ userAgent: FIREFOX })).toBe(false)
    // Chrome on iOS is WebKit with a Chrome name.
    expect(isBlinkEngine({ userAgent: CHROME_IOS })).toBe(false)
    // iPadOS reports as a Mac.
    expect(isBlinkEngine({ userAgent: CHROME, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(false)
  })

  it('is false below the Android WebView floor and with no signal at all', () => {
    expect(isBlinkEngine({ userAgent: ANDROID_OLD_WEBVIEW })).toBe(false)
    expect(isBlinkEngine({})).toBe(false)
    expect(isBlinkEngine()).toBe(false)
  })
})

describe('glassMode', () => {
  const ok = { blink: true, glassTheme: true, reducedTransparency: false, step: STEP.FULL }

  it('draws the lens on Blink in a GLASS theme', () => {
    expect(glassMode(ok)).toBe('lens')
    expect(glassMode({ ...ok, step: STEP.STILL_ART })).toBe('lens')
  })

  it('stays clear glass on WebKit and Gecko (iOS, Safari, Firefox)', () => {
    expect(glassMode({ ...ok, blink: false })).toBe('clear')
  })

  it('drops the lens for reduced transparency, a non-glass theme and the last step-down', () => {
    expect(glassMode({ ...ok, reducedTransparency: true })).toBe('clear')
    expect(glassMode({ ...ok, glassTheme: false })).toBe('clear')
    expect(glassMode({ ...ok, step: STEP.CLEAR })).toBe('clear')
  })
})

describe('low-end step-down', () => {
  it('flags Android with little memory or few cores, never other platforms', () => {
    expect(isLowEndAndroid({ android: true, deviceMemory: 2, hardwareConcurrency: 8 })).toBe(true)
    expect(isLowEndAndroid({ android: true, deviceMemory: 8, hardwareConcurrency: 4 })).toBe(true)
    expect(isLowEndAndroid({ android: true, deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false)
    expect(isLowEndAndroid({ android: true })).toBe(false)
    expect(isLowEndAndroid({ android: false, deviceMemory: 1, hardwareConcurrency: 2 })).toBe(false)
  })

  it('starts a low-end phone with the art frozen and others at full', () => {
    expect(initialStep({ lowEnd: false })).toBe(STEP.FULL)
    expect(initialStep({ lowEnd: true })).toBe(STEP.STILL_ART)
  })

  it('keeps a step learned earlier but never starts above the device baseline', () => {
    expect(initialStep({ lowEnd: false, saved: 2 })).toBe(STEP.CLEAR)
    expect(initialStep({ lowEnd: true, saved: 0 })).toBe(STEP.STILL_ART)
    expect(initialStep({ lowEnd: false, saved: 9 })).toBe(STEP.CLEAR)
    expect(initialStep({ lowEnd: false, saved: Number.NaN })).toBe(STEP.FULL)
  })

  const smooth = Array(60).fill(16.7)
  const slow = Array(60).fill(40)

  it('reads a window of slow frames as janky and ignores too few or paused samples', () => {
    expect(isJanky(smooth)).toBe(false)
    expect(isJanky(slow)).toBe(true)
    expect(isJanky(Array(10).fill(80))).toBe(false)
    // A locked screen leaves one huge gap, which is not a slow frame.
    expect(isJanky([...smooth, 5000, 5000, 5000, 5000])).toBe(false)
  })

  it('freezes the art first, then drops the lens, and stops there', () => {
    expect(nextStep(STEP.FULL, smooth)).toBe(STEP.FULL)
    expect(nextStep(STEP.FULL, slow)).toBe(STEP.STILL_ART)
    expect(nextStep(STEP.STILL_ART, slow)).toBe(STEP.CLEAR)
    expect(nextStep(STEP.CLEAR, slow)).toBe(STEP.CLEAR)
  })
})

describe('lensGeometry', () => {
  it('rounds to whole pixels and keys the cache by size and radius', () => {
    const a = lensGeometry(120.4, 44.6, 22)
    expect(a).toMatchObject({ w: 120, h: 45, r: 22, key: '120x45r22' })
    expect(lensGeometry(120, 45, 22).key).toBe(a.key)
    expect(lensGeometry(120, 45, 14).key).not.toBe(a.key)
  })

  it('fits the radius to the box and keeps bezel and scale in range', () => {
    expect(lensGeometry(40, 20, 999).r).toBe(10)
    expect(lensGeometry(40, 20, -5).r).toBe(0)
    for (const [w, h] of [[10, 10], [60, 24], [360, 56], [400, 900]]) {
      const g = lensGeometry(w, h, 12)
      expect(g.bezel).toBeGreaterThanOrEqual(6)
      expect(g.bezel).toBeLessThanOrEqual(22)
      expect(g.scale).toBeGreaterThanOrEqual(10)
      expect(g.scale).toBeLessThanOrEqual(56)
    }
  })

  it('clamps absurd sizes', () => {
    expect(lensGeometry(5000, 1, 0)).toMatchObject({ w: MAX_LENS_SIDE, h: 8 })
  })
})

describe('displacementMap', () => {
  const geo = lensGeometry(120, 48, 24)
  const map = displacementMap(geo)
  const at = (x, y) => { const i = (y * geo.w + x) * 4; return [map[i], map[i + 1], map[i + 2], map[i + 3]] }

  it('is one opaque RGBA pixel per cell', () => {
    expect(map).toHaveLength(geo.w * geo.h * 4)
    for (let i = 3; i < map.length; i += 4) expect(map[i]).toBe(255)
  })

  it('leaves the middle flat: no displacement, blue channel neutral', () => {
    expect(at(60, 24)).toEqual([128, 128, 128, 255])
  })

  it('pushes the rim along its normal, mirrored on opposite edges', () => {
    const [lr, lg] = at(0, 24)
    const [rr, rg] = at(119, 24)
    expect(lr).toBeGreaterThan(128 + 20)
    expect(rr).toBeLessThan(128 - 20)
    expect(Math.abs(lg - 128)).toBeLessThan(6)
    expect(Math.abs(rg - 128)).toBeLessThan(6)
    const [, tg] = at(60, 0)
    const [, bg] = at(60, 47)
    expect(tg).toBeGreaterThan(128 + 20)
    expect(bg).toBeLessThan(128 - 20)
  })

  it('is symmetric left to right', () => {
    const [lr] = at(3, 24)
    const [rr] = at(116, 24)
    expect(lr - 128).toBeCloseTo(128 - rr, 0)
  })
})

describe('highlight', () => {
  it('rests at the top-left sheen with no viewport and follows the pointer otherwise', () => {
    expect(highlightFromPointer(10, 10, 0, 0)).toEqual({ mx: 22, my: -10 })
    expect(highlightFromPointer(200, 400, 400, 800)).toEqual({ mx: 50, my: 20 })
  })

  it('stays inside a sane range however far the pointer goes', () => {
    const far = highlightFromPointer(99999, -99999, 400, 800)
    expect(far.mx).toBeLessThanOrEqual(130)
    expect(far.my).toBeGreaterThanOrEqual(-30)
  })

  it('walks the sheen with the tilt and rests when held level', () => {
    expect(highlightFromTilt(45, 0)).toEqual({ mx: 50, my: -10 })
    expect(highlightFromTilt(45, 45).mx).toBeGreaterThan(highlightFromTilt(45, -45).mx)
    expect(highlightFromTilt(null, undefined)).toEqual({ mx: 50, my: -10 })
  })
})

describe('glassGlyphs', () => {
  it('is deterministic for a seed and size', () => {
    expect(glassGlyphs(7, 390, 844)).toEqual(glassGlyphs(7, 390, 844))
    expect(glassGlyphs(8, 390, 844)).not.toEqual(glassGlyphs(7, 390, 844))
  })

  it('scales with the screen, capped', () => {
    expect(glassGlyphs(7, 390, 844).length).toBeGreaterThan(40)
    expect(glassGlyphs(7, 3000, 2000)).toHaveLength(140)
    expect(glassGlyphs(7, 0, 0)).toHaveLength(0)
  })

  it('uses only known glyphs drawn from theme tokens, inside the screen', () => {
    for (const g of glassGlyphs(7, 390, 844)) {
      expect(GLYPH_KINDS).toContain(g.kind)
      expect(g.tone).toMatch(/^--c-(art-[1-4]|p[12])$/)
      expect(g.x).toBeGreaterThanOrEqual(0)
      expect(g.x).toBeLessThanOrEqual(390)
      expect(g.size).toBeGreaterThanOrEqual(14)
    }
  })

  it('uses every glyph shape', () => {
    expect(new Set(glassGlyphs(7, 390, 844).map(g => g.kind)).size).toBe(GLYPH_KINDS.length)
  })
})
