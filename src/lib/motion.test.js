import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DISC_LAND_MS, DUR, EASE, SPRINGS, moveFeedbackPlan, isSettled, motionPlatform, pressReleaseDelay, releaseVelocity, rubberBand,
  shouldDismiss, springLinear, springPreset, stepSpring,
} from './motion'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

/** The value of `--name` inside the first rule whose selector is exactly `selector`. */
function cssVar(selector, name) {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return null
  const body = css.slice(start, css.indexOf('}', start))
  const m = body.match(new RegExp(`--${name}:\\s*([^;]+);`))
  return m ? m[1].trim() : null
}

function settleTime(spring) {
  let s = { x: 0, v: 0 }
  for (let t = 0; t < 3; t += 0.001) {
    s = stepSpring(s, 1, spring, 0.001)
    if (isSettled(s, 1, 0.005)) return t
  }
  return Infinity
}

describe('motion tokens', () => {
  it('durations and easings match the report', () => {
    expect(DUR).toEqual({ press: 80, fast: 150, base: 220, page: 300 })
    expect(EASE.standard).toBe('cubic-bezier(0.2, 0, 0, 1)')
    expect(cssVar(':root', 'dur-press')).toBe('80ms')
    expect(cssVar(':root', 'ease-enter')).toBe(EASE.enter)
    expect(cssVar(':root', 'ease-exit')).toBe(EASE.exit)
  })

  it('CSS spring curves are the presets sampled by springLinear', () => {
    const check = (selector, name, spring) => {
      const { easing, durationMs } = springLinear(spring)
      expect(cssVar(selector, `spring-${name}`)).toBe(easing)
      expect(cssVar(selector, `spring-${name}-dur`)).toBe(`${durationMs}ms`)
    }
    check(':root', 'ui', { k: 700, z: 0.9 })
    check(':root', 'pop', { k: 500, z: 0.55 })
    check(':root', 'press', SPRINGS.web.press)
    check(':root', 'page', SPRINGS.web.page)
    check('[data-native="ios"]', 'press', SPRINGS.ios.press)
    check('[data-native="ios"]', 'page', SPRINGS.ios.page)
    check('[data-native="android"]', 'press', SPRINGS.android.press)
    check('[data-native="android"]', 'page', SPRINGS.android.page)
  })
})

describe('platform presets', () => {
  it('maps the native shell to its family and everything else to the web', () => {
    expect(motionPlatform('ios')).toBe('ios')
    expect(motionPlatform('android')).toBe('android')
    expect(motionPlatform(null)).toBe('web')
    expect(motionPlatform('windows')).toBe('web')
  })

  it('uses the Material 3 standard spatial spring on Android sheets', () => {
    expect(springPreset('sheet', 'android')).toEqual({ k: 700, z: 0.9 })
  })

  it('iOS page spring is SwiftUI .smooth (0.5 s, no bounce)', () => {
    const { k, z } = springPreset('page', 'ios')
    expect(z).toBe(1)
    expect(Math.round((2 * Math.PI) / Math.sqrt(k) * 100) / 100).toBe(0.5)
  })

  it('every preset settles within a second and critically damped ones never overshoot', () => {
    for (const family of Object.values(SPRINGS)) {
      for (const spring of Object.values(family)) {
        expect(settleTime(spring)).toBeLessThan(1)
        if (spring.z >= 1) {
          let s = { x: 0, v: 0 }
          let peak = 0
          for (let i = 0; i < 1500; i++) { s = stepSpring(s, 1, spring, 0.001); peak = Math.max(peak, s.x) }
          expect(peak).toBeLessThanOrEqual(1.0005)
        }
      }
    }
  })
})

describe('stepSpring', () => {
  it('moves toward the target and keeps an initial velocity', () => {
    const still = stepSpring({ x: 0, v: 0 }, 100, { k: 300, z: 1 }, 0.016)
    const flung = stepSpring({ x: 0, v: 2000 }, 100, { k: 300, z: 1 }, 0.016)
    expect(still.x).toBeGreaterThan(0)
    expect(flung.x).toBeGreaterThan(still.x)
  })

  it('stays stable across a long dropped frame', () => {
    const s = stepSpring({ x: 0, v: 0 }, 1, { k: 1400, z: 0.9 }, 0.5)
    expect(Number.isFinite(s.x)).toBe(true)
    expect(Math.abs(s.x - 1)).toBeLessThan(0.01)
  })
})

describe('springLinear', () => {
  it('starts at 0, ends at 1 and overshoots only when underdamped', () => {
    const bouncy = springLinear({ k: 500, z: 0.55 })
    const smooth = springLinear({ k: 380, z: 1 })
    const nums = (e) => e.slice(7, -1).split(', ').map(Number)
    expect(nums(bouncy.easing)[0]).toBe(0)
    expect(nums(bouncy.easing).at(-1)).toBe(1)
    expect(Math.max(...nums(bouncy.easing))).toBeGreaterThan(1.05)
    expect(Math.max(...nums(smooth.easing))).toBeLessThanOrEqual(1)
    expect(smooth.durationMs % 10).toBe(0)
  })
})

describe('gesture helpers', () => {
  it('releaseVelocity reads px/s from the last 100 ms', () => {
    expect(releaseVelocity([])).toBe(0)
    expect(releaseVelocity([[0, 0], [50, 50], [100, 100]])).toBe(1000)
    // A slow start long ago does not dilute a fast final flick.
    expect(releaseVelocity([[0, 0], [10, 500], [110, 550], [210, 600]])).toBe(2000)
  })

  it('rubberBand resists more the further it goes, never past c × size', () => {
    expect(rubberBand(0, 400)).toBe(0)
    const a = rubberBand(50, 400)
    const b = rubberBand(500, 400)
    expect(a).toBeLessThan(50)
    expect(b - a).toBeLessThan(500 - 50)
    expect(rubberBand(1e9, 400)).toBeLessThanOrEqual(400)
  })

  it('shouldDismiss closes on distance or a downward flick, not on an upward one', () => {
    expect(shouldDismiss(30, 900, 500)).toBe(true)
    expect(shouldDismiss(200, 0, 500)).toBe(true)
    expect(shouldDismiss(60, 0, 500)).toBe(false)
    expect(shouldDismiss(200, -500, 500)).toBe(false)
    // Short sheets need proportionally less travel.
    expect(shouldDismiss(80, 0, 200)).toBe(true)
  })

  it('pressReleaseDelay guarantees a minimum visible dip', () => {
    expect(pressReleaseDelay(10)).toBe(60)
    expect(pressReleaseDelay(70)).toBe(0)
    expect(pressReleaseDelay(300)).toBe(0)
  })
})

describe('moveFeedbackPlan', () => {
  it('plays at once for pieces that appear in place', () => {
    expect(moveFeedbackPlan(0, { touch: true })).toEqual([{ at: 0, kind: 'move' }])
  })

  it('ticks on touch and lands the move on the contact frame for dropped discs', () => {
    expect(moveFeedbackPlan(DISC_LAND_MS, { touch: true })).toEqual([{ at: 0, kind: 'touch' }, { at: 210, kind: 'move' }])
    // The opponent's disc: no touch of theirs to answer, only the landing.
    expect(moveFeedbackPlan(DISC_LAND_MS)).toEqual([{ at: 210, kind: 'move' }])
  })

  it('lands disc feedback where disc-drop reaches the slot (70% of 300 ms)', () => {
    expect(css).toMatch(/@keyframes disc-drop \{[^}]*\}[^}]*70%\s*\{ transform: translateY\(6%\)/)
    expect(DISC_LAND_MS).toBe(Math.round(300 * 0.7))
  })
})
