// @ts-check
// The motion system (.claude/rules/motion-rules.md): duration and easing
// tokens and spring presets per platform. The spring solver and gesture
// helpers live in spring.js, which only lazily loaded code (sheets, press
// feedback) imports, so the entry bundle carries none of it. The CSS side
// of the same tokens lives in src/index.css (--dur-*, --ease-*, --spring-*);
// motion.test.js checks that the CSS spring curves match the presets here.
//
// Two grammars, one rule: what a finger or the system moves (sheets, pages,
// presses) uses springs that keep velocity; what the game announces (pieces,
// stamps, loaders) may use the pixel steps() grammar. Reduced motion swaps
// movement for a short crossfade rather than removing the cue.

import { nativePlatform } from './platform'

/** Durations in ms. */
export const DUR = /* @__PURE__ */ Object.freeze({ press: 80, fast: 150, base: 220, page: 300 })

/** When a dropped Connect Four disc lands: 70% into its 300 ms disc-drop (index.css). */
export const DISC_LAND_MS = 210

/**
 * When a move's feedback plays (MO-05): the move's sound and haptic on the
 * frame its piece lands (`landMs` after the touch; 0 = it appears in place),
 * plus a light tick at the touch itself for the mover when the landing comes
 * later. Never tied to the network acknowledgement.
 * @param {number} landMs
 * @param {{ touch?: boolean }} [opts]
 * @returns {Array<{ at: number, kind: 'touch' | 'move' }>}
 */
export function moveFeedbackPlan(landMs, { touch = false } = {}) {
  const at = Math.max(0, landMs || 0)
  if (!at) return [{ at: 0, kind: 'move' }]
  return touch ? [{ at: 0, kind: 'touch' }, { at, kind: 'move' }] : [{ at, kind: 'move' }]
}

/** Cubic-bezier easings (Material 3 standard / emphasized). */
export const EASE = /* @__PURE__ */ Object.freeze({
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
})

/** @typedef {{ k: number, z: number }} Spring stiffness (mass 1) and damping ratio */
/** @typedef {'ios' | 'android' | 'web'} MotionPlatform */
/** @typedef {'page' | 'sheet' | 'press' | 'pop'} SpringRole */

// iOS values are SwiftUI's presets converted with k = (2π / duration)² and
// ζ = 1 - bounce (.smooth 0.5 s, .snappy 0.4 s / 0.1). Android values are the
// Material 3 spring tokens (AndroidX StandardMotionTokens /
// ExpressiveMotionTokens).
/** @type {Readonly<Record<MotionPlatform, Readonly<Record<SpringRole, Spring>>>>} */
export const SPRINGS = /* @__PURE__ */ Object.freeze({
  ios: /* @__PURE__ */ Object.freeze({ page: { k: 158, z: 1 }, sheet: { k: 247, z: 0.9 }, press: { k: 700, z: 0.6 }, pop: { k: 500, z: 0.55 } }),
  android: /* @__PURE__ */ Object.freeze({ page: { k: 700, z: 0.9 }, sheet: { k: 700, z: 0.9 }, press: { k: 1400, z: 0.9 }, pop: { k: 800, z: 0.6 } }),
  web: /* @__PURE__ */ Object.freeze({ page: { k: 380, z: 1 }, sheet: { k: 380, z: 0.95 }, press: { k: 900, z: 0.7 }, pop: { k: 500, z: 0.6 } }),
})

/**
 * Which preset family applies: the native shell's platform, else the web.
 * @param {string | null} [native]
 * @returns {MotionPlatform}
 */
export function motionPlatform(native = nativePlatform) {
  return native === 'ios' || native === 'android' ? native : 'web'
}

/**
 * @param {SpringRole} role
 * @param {MotionPlatform} [platform]
 * @returns {Spring}
 */
export function springPreset(role, platform = motionPlatform()) {
  return SPRINGS[platform][role]
}
