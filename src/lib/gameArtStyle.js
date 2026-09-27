// Game-art style pref: BOLD (Option A — fixed-color PNGs) or SOFT
// (Option B — theme-aware SVGs). Local-only like the other display prefs,
// default BOLD. useGameArtStyle() re-renders consumers (GameCard) on change.
import { useSyncExternalStore } from 'react'

export const ART_STYLES = [
  { id: 'png', label: 'BOLD' },
  { id: 'svg', label: 'SOFT' },
  { id: 'icons', label: 'ICONS' },
]

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
  return stored === 'svg' || stored === 'png' || stored === 'icons' ? stored : 'png'
}

let current = getGameArtStyle()
const listeners = new Set()

export function applyGameArtStyle(id) {
  const next = id === 'svg' ? 'svg' : id === 'icons' ? 'icons' : 'png'
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
