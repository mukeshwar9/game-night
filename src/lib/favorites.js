import { GAME_TYPES } from './games'

const STORAGE_KEY = 'gn-favs'

function readStored() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStored(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // storage unavailable (private mode, quota) — favorites just won't persist
  }
}

// Filters out stale entries from a since-removed/renamed game type.
export function getFavorites() {
  const known = new Set(GAME_TYPES.map(t => t.type))
  return readStored().filter(type => known.has(type))
}

export function isFavorite(type) {
  return getFavorites().includes(type)
}

export function toggleFavorite(type) {
  const current = getFavorites()
  const nextFav = !current.includes(type)
  writeStored(nextFav ? [...current, type] : current.filter(t => t !== type))
  return nextFav
}
