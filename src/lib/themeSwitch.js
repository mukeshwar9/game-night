// @ts-check
// A player's theme pick as a transition (MO-08). Kept out of theme.js so the
// entry bundle carries none of it: the pickers import it on demand.
import { isReducedMotion } from '../hooks/useMotionPref'
import { motionPlatform } from './motion'
import { applyTheme } from './theme'

/**
 * Centre and radius of the circle that reveals a new theme from the control
 * the player tapped: from the middle of `rect`, large enough to cover the
 * farthest corner of a `width` × `height` viewport.
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {number} width
 * @param {number} height
 */
export function themeReveal(rect, width, height) {
  const x = Math.round(rect.left + rect.width / 2)
  const y = Math.round(rect.top + rect.height / 2)
  const r = Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y)))
  return { x, y, r }
}

// The latest theme switch owns data-theme-vt (see MotionRouter's vtSeq).
let themeSeq = 0

/**
 * applyTheme for a player's pick, as one change instead of a few elements
 * tweening their colours while the rest snap (MO-08). With View Transitions
 * the whole screen changes together: iOS crossfades, elsewhere the new theme
 * spreads in a circle from `from`, the tapped control's rect (measured at the
 * tap, since this module loads on demand and the control may be gone by
 * then). Element transitions are suspended for the switch (.theme-switching).
 * `alsoApply` runs inside the same change (a theme's paired font). Without
 * View Transitions, or with reduced motion, the switch is instant.
 * @param {string} id
 * @param {{ from?: { left: number, top: number, width: number, height: number } | null, alsoApply?: () => void }} [opts]
 */
export function switchTheme(id, { from = null, alsoApply } = {}) {
  const root = document.documentElement
  const apply = () => { applyTheme(id); alsoApply?.() }
  root.classList.add('theme-switching')
  const settle = () => root.classList.remove('theme-switching')
  if (typeof document.startViewTransition !== 'function' || isReducedMotion() || root.dataset.theme === id) {
    apply()
    // Two frames: the new colours paint before transitions come back.
    requestAnimationFrame(() => requestAnimationFrame(settle))
    return
  }
  const reveal = from && motionPlatform() !== 'ios'
  if (reveal) {
    const { x, y, r } = themeReveal(from, window.innerWidth, window.innerHeight)
    root.style.setProperty('--vt-x', `${x}px`)
    root.style.setProperty('--vt-y', `${y}px`)
    root.style.setProperty('--vt-r', `${r}px`)
  }
  const seq = ++themeSeq
  root.dataset.themeVt = reveal ? 'reveal' : 'fade'
  const vt = document.startViewTransition(apply)
  vt.ready.catch(() => {})
  const done = () => { if (seq === themeSeq) { delete root.dataset.themeVt; settle() } }
  vt.finished.then(done, done)
}
