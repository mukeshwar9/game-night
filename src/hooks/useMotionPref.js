import { useSyncExternalStore } from 'react'

// Reduced-motion preference for JS-driven animation (framer-motion, rAF
// loops, staged setTimeout replays). CSS animation is already covered by
// index.css; this is the same source of truth for code.
//
// Source of truth: `data-motion` on <html>, written by Settings → Look & feel
// (lib/displayPrefs.js applyMotion: 'reduced' | 'full'). When it's unset
// (before boot, or outside the app shell) the OS `prefers-reduced-motion`
// query decides. Changes to either are observed live, so flipping the
// setting mid-game takes effect without a reload.

const QUERY = '(prefers-reduced-motion: reduce)'

function osReduced() {
  try { return window.matchMedia(QUERY).matches } catch { return false }
}

// Snapshot: 'reduced' | 'full' when the in-app setting is present,
// 'os-reduced' | 'os-full' when falling back to the OS. A plain string keeps
// useSyncExternalStore's identity check trivially stable.
function getSnapshot() {
  const attr = typeof document !== 'undefined' ? document.documentElement.dataset.motion : undefined
  if (attr === 'reduced' || attr === 'full') return attr
  return osReduced() ? 'os-reduced' : 'os-full'
}

function getServerSnapshot() {
  return 'os-full'
}

function subscribe(onChange) {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
  let mq = null
  try { mq = window.matchMedia(QUERY) } catch { /* no matchMedia */ }
  mq?.addEventListener?.('change', onChange)
  return () => {
    observer.disconnect()
    mq?.removeEventListener?.('change', onChange)
  }
}

// Synchronous read for non-React callers (rAF loops, event handlers).
export function isReducedMotion() {
  const snap = getSnapshot()
  return snap === 'reduced' || snap === 'os-reduced'
}

// → { reduced: boolean, setting: 'reduced' | 'full' | null }
// `setting` is the explicit in-app choice (null = following the OS).
export default function useMotionPref() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    reduced: snap === 'reduced' || snap === 'os-reduced',
    setting: snap === 'reduced' || snap === 'full' ? snap : null,
  }
}
