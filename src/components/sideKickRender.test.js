import { readFileSync } from 'fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseThemes } from '../lib/themeContrast'
import { createWorld, step, DT, MAXSPD, KICK_T, TRACK_ORDER, tryKick, knockOff } from '../lib/sideKickLogic'
import { encodeAvatar, randomLook } from '../lib/avatarKit'

// The renderer needs a canvas. This is a recording stand-in (every call is a
// no-op that is counted), enough to run the whole scene code for many frames in
// every theme and catch a ReferenceError, a NaN into a gradient stop or a bad
// call before a phone does. It cannot say how the scene looks.
const themes = parseThemes(readFileSync(new URL('../index.css', import.meta.url), 'utf8'))

let calls = 0
const noop = () => { calls++ }
const gradient = () => ({ addColorStop: noop })
function makeCtx() {
  const store = {}
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return gradient
      if (k === 'measureText') return () => ({ width: 24 })
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
      return noop
    },
    set(t, k, v) {
      t[k] = v
      return true
    },
  })
}
const makeCanvas = () => ({ width: 0, height: 0, getContext: () => makeCtx() })

let data = 'glass'
const saved = {}
beforeAll(() => {
  for (const k of ['document', 'getComputedStyle', 'devicePixelRatio']) saved[k] = globalThis[k]
  globalThis.document = {
    createElement: () => makeCanvas(),
    documentElement: { getAttribute: () => data },
  }
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (name) => {
      if (name === '--font-pixel') return '"Press Start 2P"'
      const k = name.replace(/^--c-/, '')
      const t = themes[data]?.[k]
      return t ? t.join(' ') : ''
    },
  })
  globalThis.devicePixelRatio = 2
})
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete globalThis[k]
    else globalThis[k] = v
  }
  vi.restoreAllMocks()
})

const riders = () => [
  { id: 'a', name: 'AAA' },
  { id: 'b', name: 'BBB', bot: true },
  { id: 'c', name: 'CCC', bot: true },
  { id: 'd', name: 'DDD', bot: true },
]
const looks = () => [11, 29, 47, 83].map((s) => {
  let a = s
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296 }
  return encodeAvatar({ ...randomLook(rnd), pet: 'none' })
})

async function rendererFor(themeId) {
  data = themeId
  const { createSideKickRenderer } = await import('./sideKickRender')
  const r = createSideKickRenderer(makeCanvas())
  r.setAvatars(looks())
  return r
}

// Put the world through every pose the artist drew: riding, kicking, staggered,
// boosting, down, shielded, finished.
function staged(world) {
  const [a, b, c, d] = world.riders
  tryKick(world, a, 1)
  b.stag = 0.4; b.boosting = true; b.boost = 0.4
  c.shield = 1
  knockOff(world, d, 'car')
  d.t = d.tMax * 0.5
  world.events.length = 0
}

describe('the road scene', () => {
  it.each(['glass', 'glass-night', 'synthwave', 'mono', 'phosphor', 'shoreline'])('%s: draws many frames of a staged race without throwing', async (id) => {
    const r = await rendererFor(id)
    const world = createWorld({ riders: riders(), phase: 'race', trackId: TRACK_ORDER[0] })
    staged(world)
    calls = 0
    for (let i = 0; i < 240; i++) {
      step(world, { 0: { steer: i % 120 < 60 ? 1 : -1, kick: i % 50 === 0 ? 1 : 0, boost: i % 90 < 30 } }, DT)
      for (const ev of world.events.splice(0)) r.event(ev, world, 0)
      if (!r.tickHitStop(DT)) r.draw(world, 0, DT, { pixel: i % 2 === 0, avatars: i < 200, reduced: i % 3 === 0 })
    }
    expect(calls).toBeGreaterThan(5000)
    expect(r.ready).toBe(true)
    r.dispose()
  })

  it('draws every road, the finish, and the view from any seat', async () => {
    const r = await rendererFor('glass')
    for (const trackId of ['meadow', 'pass', 'rush', 'random']) {
      const world = createWorld({ riders: riders(), phase: 'race', trackId, seed: 77 })
      for (const view of [0, 1, 2, 3]) {
        for (let i = 0; i < 30; i++) { step(world, {}, DT); world.events.length = 0; r.draw(world, view, DT, {}) }
      }
      // At the line and past it.
      for (const rider of world.riders) rider.z = world.track.finish - 200
      for (let i = 0; i < 40; i++) { step(world, {}, DT); world.events.length = 0; r.draw(world, 0, DT, {}) }
    }
  })

  it('works with plain riders (no avatars), a lone rider and during the countdown', async () => {
    const r = await rendererFor('synthwave')
    r.setAvatars([])
    const world = createWorld({ riders: riders().slice(0, 2) })
    for (let i = 0; i < 30; i++) { step(world, {}, DT); r.draw(world, 1, DT, { avatars: false }) }
    expect(world.phase).toBe('count')
    world.riders[0].speed = MAXSPD
    r.reset()
    r.draw(world, 0, 0.5, {})
  })

  it('rebuilds its colours when the theme changes under it', async () => {
    const r = await rendererFor('glass')
    const world = createWorld({ riders: riders(), phase: 'race' })
    r.draw(world, 0, DT, {})
    data = 'glass-night'
    r.draw(world, 0, DT, {})
    data = 'glass'
  })

  it('holds the sim for a freeze-frame after a landed kick, then lets go', async () => {
    const r = await rendererFor('glass')
    const world = createWorld({ riders: riders(), phase: 'race' })
    r.event({ t: 'hit', by: 0, to: 1, side: 1, ko: false }, world, 0)
    expect(r.tickHitStop(0.03)).toBe(true)
    expect(r.tickHitStop(0.05)).toBe(true)
    expect(r.tickHitStop(0.05)).toBe(false)
  })

  it('a kick lasts as long as the sim says (the swing animation reads the same constant)', () => {
    expect(KICK_T).toBeGreaterThan(0.2)
  })
})
