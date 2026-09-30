// Game-art style pref: three pixel-art styles (PIXEL SCENE, OBJECT, CAST —
// scripts/pixel-art/, `npm run art:pixel`), BOLD (Option A — fixed-color
// PNGs) or SOFT (Option B — theme-aware SVGs). Local-only like the other
// display prefs, default PIXEL SCENE. useGameArtStyle() re-renders consumers
// (GameCard) on change.
import { useSyncExternalStore } from 'react'

export const ART_STYLES = [
  { id: 'scene', label: 'PIXEL SCENE' },
  { id: 'object', label: 'PIXEL OBJECT' },
  { id: 'cast', label: 'PIXEL CAST' },
  { id: 'png', label: 'BOLD' },
  { id: 'svg', label: 'SOFT' },
  { id: 'icons', label: 'ICONS' },
]

// Pixel styles → native sprite size (public/game-art/pixel/<style>/<type>.png).
export const PIXEL_ART_SIZES = { scene: 64, object: 32, cast: 32 }

export const DEFAULT_ART_STYLE = 'scene'

const STYLE_IDS = new Set(ART_STYLES.map(s => s.id))

const KEY = 'retro-gameart'

function read() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function write(value) {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // storage unavailable — pref just doesn't persist
  }
}

export function getGameArtStyle() {
  const stored = read()
  return STYLE_IDS.has(stored) ? stored : DEFAULT_ART_STYLE
}

let current = getGameArtStyle()
const listeners = new Set()

export function applyGameArtStyle(id) {
  const next = STYLE_IDS.has(id) ? id : DEFAULT_ART_STYLE
  if (next !== current) {
    current = next
    write(next)
    listeners.forEach((notify) => notify())
  }
  return next
}

function subscribe(notify) {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

function getSnapshot() {
  return current
}

export function useGameArtStyle() {
  return useSyncExternalStore(subscribe, getSnapshot)
}
