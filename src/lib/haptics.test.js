import { describe, it, expect, vi } from 'vitest'
import { planHaptics, createHaptic, MAX_EVENTS, MAX_TOTAL_MS, NOTICE_PATTERNS } from './haptics'

describe('planHaptics: single pulses', () => {
  it('plans nothing for zero, negative, NaN, empty and non-patterns', () => {
    for (const p of [0, -5, NaN, Infinity, [], [0], [0, 0], [50], null, undefined, 'x', {}]) {
      expect(planHaptics(/** @type {any} */ (p))).toEqual([])
    }
  })
  it('maps short pulses to impact styles by duration', () => {
    expect(planHaptics(4)).toEqual([{ at: 0, kind: 'impact', style: 'LIGHT' }])
    expect(planHaptics(12)).toEqual([{ at: 0, kind: 'impact', style: 'LIGHT' }])
    expect(planHaptics(13)).toEqual([{ at: 0, kind: 'impact', style: 'MEDIUM' }])
    expect(planHaptics(40)).toEqual([{ at: 0, kind: 'impact', style: 'MEDIUM' }])
    expect(planHaptics(41)).toEqual([{ at: 0, kind: 'impact', style: 'HEAVY' }])
    expect(planHaptics(99)).toEqual([{ at: 0, kind: 'impact', style: 'HEAVY' }])
  })
  it('maps long buzzes (>=100ms) to vibrate, capped at 1s', () => {
    expect(planHaptics(100)).toEqual([{ at: 0, kind: 'vibrate', duration: 100 }])
    expect(planHaptics(160)).toEqual([{ at: 0, kind: 'vibrate', duration: 160 }])
    expect(planHaptics(5000)).toEqual([{ at: 0, kind: 'vibrate', duration: MAX_TOTAL_MS }])
  })
})

describe('planHaptics: array patterns', () => {
  it('schedules each buzz at its start, treating even indexes as pauses', () => {
    // sounds.js "buzz": a 0 pause, then two 60ms buzzes 40ms apart
    expect(planHaptics([0, 60, 40, 60])).toEqual([
      { at: 0, kind: 'impact', style: 'HEAVY' },
      { at: 100, kind: 'impact', style: 'HEAVY' },
    ])
  })
  it('honours a leading pause', () => {
    expect(planHaptics([30, 10])).toEqual([{ at: 30, kind: 'impact', style: 'LIGHT' }])
  })
  it('skips zero-length buzzes but keeps the clock moving', () => {
    expect(planHaptics([0, 0, 20, 10])).toEqual([{ at: 20, kind: 'impact', style: 'LIGHT' }])
  })
  it('uses vibrate for a long buzz inside a pattern', () => {
    expect(planHaptics([0, 40, 50, 140])).toEqual([
      { at: 0, kind: 'impact', style: 'MEDIUM' },
      { at: 90, kind: 'vibrate', duration: 140 },
    ])
  })
  it('handles an accelerating reaction pattern in order', () => {
    const plan = planHaptics([0, 5, 10, 15, 20])
    expect(plan.map((s) => s.at)).toEqual([0, 15])
    expect(plan.map((s) => (s.kind === 'impact' ? s.style : s.kind))).toEqual(['LIGHT', 'MEDIUM'])
  })
  it('caps the event count', () => {
    const p = [0]
    for (let i = 0; i < 40; i++) p.push(5, 5)
    expect(planHaptics(p)).toHaveLength(MAX_EVENTS)
  })
  it('drops buzzes that would start after the total cap', () => {
    const plan = planHaptics([0, 10, 900, 10, 200, 10])
    expect(plan.map((s) => s.at)).toEqual([0, 910])
  })
  it('ignores malformed entries', () => {
    expect(planHaptics(/** @type {any} */ ([0, 'a', NaN, 20]))).toEqual([{ at: 0, kind: 'impact', style: 'MEDIUM' }])
  })
})

describe('createHaptic', () => {
  const plugin = () => ({
    Haptics: { impact: vi.fn(() => Promise.resolve()), vibrate: vi.fn(() => Promise.resolve()) },
  })

  it('web: calls navigator.vibrate with the original argument, untouched', () => {
    const vibrate = vi.fn()
    const loadPlugin = vi.fn()
    const { haptic } = createHaptic({ native: false, nav: { vibrate }, loadPlugin })
    haptic([0, 40, 30, 70])
    haptic(9)
    expect(vibrate).toHaveBeenNthCalledWith(1, [0, 40, 30, 70])
    expect(vibrate).toHaveBeenNthCalledWith(2, 9)
    expect(loadPlugin).not.toHaveBeenCalled()
  })
  it('web: is a no-op without navigator.vibrate (iOS Safari) and swallows throws', () => {
    expect(() => createHaptic({ native: false, nav: {} }).haptic(10)).not.toThrow()
    expect(() => createHaptic({ native: false, nav: undefined }).haptic(10)).not.toThrow()
    const nav = { vibrate: () => { throw new Error('blocked') } }
    expect(() => createHaptic({ native: false, nav }).haptic(10)).not.toThrow()
  })
  it('native: fires an impact for a short pulse and never touches navigator', async () => {
    const mod = plugin()
    const vibrate = vi.fn()
    const { haptic } = createHaptic({ native: true, nav: { vibrate }, loadPlugin: async () => mod })
    haptic(9)
    await vi.waitFor(() => expect(mod.Haptics.impact).toHaveBeenCalledWith({ style: 'LIGHT' }))
    expect(vibrate).not.toHaveBeenCalled()
  })
  it('native: long single buzz uses vibrate({duration})', async () => {
    const mod = plugin()
    const { haptic } = createHaptic({ native: true, loadPlugin: async () => mod })
    haptic(160)
    await vi.waitFor(() => expect(mod.Haptics.vibrate).toHaveBeenCalledWith({ duration: 160 }))
  })
  it('native: schedules later buzzes of a pattern at their offsets', async () => {
    const mod = plugin()
    const scheduled = []
    const schedule = (fn, ms) => { scheduled.push(ms); fn() }
    const { haptic } = createHaptic({ native: true, loadPlugin: async () => mod, schedule })
    haptic([0, 60, 40, 60])
    await vi.waitFor(() => expect(mod.Haptics.impact).toHaveBeenCalledTimes(2))
    expect(scheduled).toEqual([100])
  })
  it('native: zero/empty never loads the plugin', async () => {
    const loadPlugin = vi.fn()
    const { haptic } = createHaptic({ native: true, loadPlugin })
    haptic(0)
    haptic([])
    await Promise.resolve()
    expect(loadPlugin).not.toHaveBeenCalled()
  })
  it('native: loads the plugin once, and a failed load is silent', async () => {
    const mod = plugin()
    const loadPlugin = vi.fn(async () => mod)
    const { haptic } = createHaptic({ native: true, loadPlugin })
    haptic(9); haptic(9)
    await vi.waitFor(() => expect(mod.Haptics.impact).toHaveBeenCalledTimes(2))
    expect(loadPlugin).toHaveBeenCalledTimes(1)

    const bad = createHaptic({ native: true, loadPlugin: async () => { throw new Error('chunk') } })
    expect(() => bad.haptic(9)).not.toThrow()
    await Promise.resolve()
  })
  it('native: a rejecting plugin call does not leak an unhandled rejection', async () => {
    const mod = { Haptics: { impact: vi.fn(() => Promise.reject(new Error('no motor'))), vibrate: vi.fn() } }
    const { haptic } = createHaptic({ native: true, loadPlugin: async () => mod })
    haptic(9)
    await vi.waitFor(() => expect(mod.Haptics.impact).toHaveBeenCalled())
  })
  it('preload only loads on native', () => {
    const loadPlugin = vi.fn(async () => plugin())
    createHaptic({ native: false, loadPlugin }).preload()
    expect(loadPlugin).not.toHaveBeenCalled()
    createHaptic({ native: true, loadPlugin }).preload()
    return vi.waitFor(() => expect(loadPlugin).toHaveBeenCalledTimes(1))
  })
})

describe('the HAPTICS switch and outcome notices', () => {
  const flush = () => new Promise(r => setTimeout(r, 0))

  it('does nothing at all while the player has haptics off', async () => {
    const vibrate = vi.fn()
    const mod = { Haptics: { impact: vi.fn(), vibrate: vi.fn(), notification: vi.fn() } }
    const web = createHaptic({ native: false, nav: { vibrate }, enabled: () => false })
    web.haptic(30); web.notify('SUCCESS')
    const app = createHaptic({ native: true, loadPlugin: async () => mod, enabled: () => false })
    app.haptic(30); app.notify('ERROR')
    await flush()
    expect(vibrate).not.toHaveBeenCalled()
    expect(mod.Haptics.impact).not.toHaveBeenCalled()
    expect(mod.Haptics.notification).not.toHaveBeenCalled()
  })

  it('sends a win, a refused move or a loss as the native notification haptic', async () => {
    const mod = { Haptics: { notification: vi.fn().mockResolvedValue(undefined) } }
    const app = createHaptic({ native: true, loadPlugin: async () => mod })
    app.notify('SUCCESS')
    await flush()
    expect(mod.Haptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' })
  })

  it('falls back to a vibrate pattern on the web', () => {
    const vibrate = vi.fn()
    createHaptic({ native: false, nav: { vibrate } }).notify('ERROR')
    expect(vibrate).toHaveBeenCalledWith(NOTICE_PATTERNS.ERROR)
  })
})
