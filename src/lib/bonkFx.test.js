import { describe, it, expect } from 'vitest'
import { mulberry32 } from './detMath'
import { createFx, emit, applyEvent, ambient, stepFx, cameraTarget, stepCamera, tideChip, bannerFor, NEW_CAMERA } from './bonkFx'
import { staticView } from './bonkNet'
import { T } from './bonkLogic'

const fx = () => createFx(mulberry32(3))

describe('particles', () => {
  it('caps the live count and expires them', () => {
    const f = fx()
    emit(f, 'dust', 0, 0, 1000, { life: 0.3 })
    expect(f.parts.length).toBeLessThanOrEqual(260)
    stepFx(f, 0.31)
    expect(f.parts).toHaveLength(0)
  })

  it('gravity pulls sparks down and dust slows', () => {
    const f = fx()
    emit(f, 'spark', 0, 5, 1, { speed: 0, g: 10, life: 1 })
    const y0 = f.parts[0].y
    stepFx(f, 0.1)
    expect(f.parts[0].y).toBeLessThan(y0)
  })
})

describe('events', () => {
  it('a bonk sprays stars, shakes and flashes, and asks for the bonk sound', () => {
    const f = fx()
    const cues = applyEvent(f, { type: 'bonk', x: 1, y: 3, car: 0, by: 'O' })
    expect(cues).toEqual([{ cue: 'bonk' }])
    expect(f.parts.some((p) => p.type === 'star')).toBe(true)
    expect(f.shake).toBeGreaterThan(0)
    expect(f.flash).toBeGreaterThan(0)
  })

  it('reduced motion keeps the sound but not the shake or the flash', () => {
    const f = fx()
    const cues = applyEvent(f, { type: 'bonk', x: 1, y: 3, car: 0, by: 'O' }, { reduced: true })
    expect(cues).toEqual([{ cue: 'bonk' }])
    expect(f.shake).toBe(0)
    expect(f.flash).toBe(0)
  })

  it('ignores a soft touch but sounds a hard clash', () => {
    const f = fx()
    expect(applyEvent(f, { type: 'hit', x: 0, y: 0, power: 1, cars: true, wheel: false })).toEqual([])
    expect(applyEvent(f, { type: 'hit', x: 0, y: 0, power: 4, cars: true, wheel: false })[0].cue).toBe('clash')
  })

  it('maps the countdown and the splash', () => {
    const f = fx()
    expect(applyEvent(f, { type: 'count', digit: 2 })).toEqual([{ cue: 'tick', digit: 2 }])
    expect(applyEvent(f, { type: 'splash', x: 0, y: 0.4, power: 3 })).toEqual([{ cue: 'splash' }])
  })

  it('smokes a wreck but not one that sank', () => {
    const f = createFx(() => 0)
    const v = staticView()
    v.phase = 'ko'
    v.cars[0].alive = false
    v.cars[0].out = { reason: 'bonk', x: 0, y: 0 }
    v.cars[1].alive = false
    v.cars[1].out = { reason: 'sunk', x: 0, y: 0 }
    ambient(f, v, 1 / 60)
    expect(f.parts.filter((p) => p.type === 'smoke')).toHaveLength(1)
  })
})

describe('camera', () => {
  it('shows the whole arena before play, then closes in as the buggies meet', () => {
    const v = staticView('halfpipe')
    const wide = cameraTarget(v)
    expect(wide.x).toBe(0)
    const play = { ...v, phase: 'play', cars: v.cars.map((c, i) => ({ ...c, x: i ? 1.5 : -1.5 })) }
    const close = cameraTarget(play)
    expect(close.z).toBeGreaterThan(wide.z)
  })

  it('zooms onto the impact during a knockout, but not when reduced', () => {
    const v = { ...staticView('humps'), phase: 'ko' }
    const focus = { x: 3, y: 5 }
    const zoomed = cameraTarget(v, { focus })
    const calm = cameraTarget(v, { focus, reduced: true })
    expect(zoomed.z).toBeGreaterThan(calm.z)
    expect(zoomed.x).toBeGreaterThan(calm.x)
  })

  it('eases toward its target without overshooting', () => {
    const cam = { ...NEW_CAMERA }
    stepCamera(cam, { x: 4, y: 7, z: 1 }, 0.1, 'play')
    expect(cam.x).toBeGreaterThan(0)
    expect(cam.x).toBeLessThan(4)
    for (let i = 0; i < 100; i++) stepCamera(cam, { x: 4, y: 7, z: 1 }, 0.1, 'ko')
    expect(cam.x).toBeCloseTo(4, 3)
  })
})

describe('words', () => {
  const names = { X: 'YOU', O: 'BOB' }
  it('counts 3 · 2 · 1 with the arena name, then GO for half a second', () => {
    expect(bannerFor({ ...staticView('drum'), digit: 3 }, names)).toEqual({ big: '3', small: 'THE DRUM', kind: 'count' })
    expect(bannerFor({ ...staticView('drum'), digit: 0 }, names)).toBe(null)
    expect(bannerFor({ ...staticView(), phase: 'play', timer: 0.2 }, names).big).toBe('GO')
    expect(bannerFor({ ...staticView(), phase: 'play', timer: 0.8 }, names)).toBe(null)
  })

  it('names the cause and the scorer', () => {
    const base = { ...staticView(), phase: 'ko' }
    expect(bannerFor({ ...base, outcome: { winner: 0, reason: 'bonk', double: false } }, names)).toEqual({ big: 'BONK!', small: 'YOU SCORE', kind: 'ko' })
    expect(bannerFor({ ...base, outcome: { winner: 1, reason: 'self', double: false } }, names)).toEqual({ big: 'OWN LID!', small: 'BOB SCORES', kind: 'ko' })
    expect(bannerFor({ ...base, outcome: { winner: 0, reason: 'sunk', double: false } }, names).big).toBe('SPLASH!')
    expect(bannerFor({ ...base, outcome: { winner: -1, reason: 'sunk', double: true } }, names).small).toBe('NO POINT · REPLAY')
  })

  it('shows the tide chip as a countdown, a warning, then a flood', () => {
    expect(tideChip({ ...staticView(), phase: 'count' }).text).toBe(`TIDE IN ${T.tideStart}`)
    expect(tideChip({ ...staticView(), phase: 'play', tideLeft: 2.4 })).toEqual({ text: 'TIDE IN 3', hot: false, warn: true })
    expect(tideChip({ ...staticView(), phase: 'play', tideLeft: -1 })).toEqual({ text: 'TIDE RISING', hot: true, warn: false })
  })
})
