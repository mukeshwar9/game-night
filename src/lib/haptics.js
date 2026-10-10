// @ts-check
// One entry point for tactile feedback. Takes exactly what navigator.vibrate
// takes (a duration in ms, or a [pause, buzz, pause, buzz, …] pattern).
//
// Web: navigator.vibrate?.(pattern), unchanged. iOS Safari and the iOS
// WebView have no navigator.vibrate, so inside the Capacitor shell the same
// pattern is translated to @capacitor/haptics calls. The plugin is loaded with
// a dynamic import only on native, so the web bundle never carries it.

import { isNative } from './platform'

// The player's HAPTICS switch (Settings › Audio). On unless turned off.
const HAPTICS_KEY = 'retro-haptics'

export function getHapticsOn() {
  try { return localStorage.getItem(HAPTICS_KEY) !== 'off' } catch { return true }
}

/** @param {boolean} on */
export function setHapticsOn(on) {
  try { localStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off') } catch { /* storage unavailable */ }
}

/** Where tactile feedback can happen at all: the shell, or a browser with navigator.vibrate. */
export function hapticsAvailable() {
  return isNative || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
}

/**
 * Outcome feedback, in the platform's own vocabulary: 'SUCCESS' (a win),
 * 'WARNING' (a refused move), 'ERROR' (a loss or a bust). On the web the same
 * outcome becomes a vibrate pattern.
 * @typedef {'SUCCESS' | 'WARNING' | 'ERROR'} HapticNotice
 */
/** @type {Record<HapticNotice, number[]>} */
export const NOTICE_PATTERNS = {
  SUCCESS: [0, 40, 30, 70],
  WARNING: [0, 30],
  ERROR: [0, 60, 40, 60],
}

// Longest window a pattern may occupy and the most taps one pattern may fire:
// a runaway pattern must not turn into a second of buzzing.
export const MAX_TOTAL_MS = 1000
export const MAX_EVENTS = 8
// A single buzz at least this long is a real vibration, not a tap.
export const LONG_BUZZ_MS = 100

/**
 * @typedef {{ at: number, kind: 'impact', style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }
 *   | { at: number, kind: 'vibrate', duration: number }} HapticStep
 */

/** @param {number} ms */
function classify(ms) {
  if (ms >= LONG_BUZZ_MS) return /** @type {const} */ ({ kind: 'vibrate', duration: Math.min(ms, MAX_TOTAL_MS) })
  if (ms <= 12) return /** @type {const} */ ({ kind: 'impact', style: 'LIGHT' })
  if (ms <= 40) return /** @type {const} */ ({ kind: 'impact', style: 'MEDIUM' })
  return /** @type {const} */ ({ kind: 'impact', style: 'HEAVY' })
}

/** @param {unknown} v */
function ms(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Pure: a navigator.vibrate argument -> the native calls to make and when
 * (ms from now). Zero, empty and malformed input plan nothing. Array patterns
 * alternate pause, buzz, pause, buzz…; each buzz becomes one step at the moment
 * it would start. Steps past MAX_TOTAL_MS, or beyond MAX_EVENTS, are dropped.
 * @param {number | number[] | null | undefined} pattern
 * @returns {HapticStep[]}
 */
export function planHaptics(pattern) {
  if (typeof pattern === 'number') {
    const d = ms(pattern)
    return d ? [{ at: 0, ...classify(d) }] : []
  }
  if (!Array.isArray(pattern)) return []
  /** @type {HapticStep[]} */
  const steps = []
  let t = 0
  for (let i = 0; i < pattern.length && steps.length < MAX_EVENTS; i++) {
    const d = ms(pattern[i])
    if (i % 2 === 0) { t += d; continue }
    if (t > MAX_TOTAL_MS) break
    if (d) steps.push({ at: Math.round(t), ...classify(d) })
    t += d
  }
  return steps
}

/**
 * The side-effecting part, with its environment injected so tests can drive it.
 * @param {{
 *   native?: boolean,
 *   nav?: { vibrate?: (p: number | number[]) => boolean } | undefined,
 *   loadPlugin?: () => Promise<any>,
 *   schedule?: (fn: () => void, ms: number) => unknown,
 *   enabled?: () => boolean,
 * }} [env]
 */
export function createHaptic({
  native = isNative,
  nav = typeof navigator === 'undefined' ? undefined : navigator,
  loadPlugin = () => import('@capacitor/haptics'),
  schedule = (fn, delay) => setTimeout(fn, delay),
  enabled = getHapticsOn,
} = {}) {
  /** @type {Promise<any> | null} */
  let plugin = null
  const load = () => (plugin ??= Promise.resolve().then(loadPlugin).catch(() => null))

  /** @param {number | number[]} pattern */
  function haptic(pattern) {
    if (!enabled()) return
    if (!native) {
      try { nav?.vibrate?.(pattern) } catch { /* unsupported */ }
      return
    }
    const steps = planHaptics(pattern)
    if (!steps.length) return
    load().then((mod) => {
      const h = mod?.Haptics
      if (!h) return
      for (const step of steps) {
        const fire = () => {
          const call = step.kind === 'vibrate' ? h.vibrate({ duration: step.duration }) : h.impact({ style: step.style })
          Promise.resolve(call).catch(() => {})
        }
        if (step.at > 0) schedule(fire, step.at)
        else fire()
      }
    })
  }

  /** @param {HapticNotice} type */
  function notify(type) {
    if (!enabled()) return
    if (!native) {
      try { nav?.vibrate?.(NOTICE_PATTERNS[type] || NOTICE_PATTERNS.WARNING) } catch { /* unsupported */ }
      return
    }
    load().then((mod) => {
      const h = mod?.Haptics
      if (!h) return
      Promise.resolve(h.notification({ type })).catch(() => {})
    })
  }

  return { haptic, notify, preload: () => { if (native) load() } }
}

const instance = createHaptic()

/** Buzz like navigator.vibrate(pattern); a no-op where there is no haptic motor. */
export const haptic = instance.haptic

/** A win, a refused move or a loss, as the platform's own notification haptic. */
export const hapticNotify = instance.notify

// Load the plugin ahead of the first tap so a move's feedback is not late.
instance.preload()
