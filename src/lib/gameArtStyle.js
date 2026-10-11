// Game-art style pref: CUT PAPER (default) and TOON (both drawn for every game,
// scripts/cut-paper-art/ + src/components/gameArtToon/), PIXEL SCENE
// (scripts/pixel-art/, `npm run art:pixel`) or ICONS (the mono game icon).
// Local-only like the other display prefs. The retired pixel OBJECT and CAST
// styles migrate to the default; any other stored id not listed here (e.g. the
// retired 'png' BOLD and 'svg' SOFT) reads back as the default too.
// useGameArtStyle() re-renders consumers (GameCard) on change.
import { useSyncExternalStore } from 'react'

export const ART_STYLES = [
  { id: 'cutpaper', label: 'CUT PAPER' },
  { id: 'toon', label: 'TOON' },
  { id: 'scene', label: 'PIXEL SCENE' },
  { id: 'icons', label: 'ICONS' },
]

// Pixel styles → native sprite size (public/game-art/pixel/<style>/<type>.png).
export const PIXEL_ART_SIZES = { scene: 64 }

export const DEFAULT_ART_STYLE = 'cutpaper'

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

// A stored id that is no longer offered (the retired pixel OBJECT / CAST, BOLD
// png, SOFT svg) is rewritten once, so a later release that reuses an id never
// resurrects it.
{
  const stored = read()
  if (stored != null && !STYLE_IDS.has(stored)) write(DEFAULT_ART_STYLE)
}

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
