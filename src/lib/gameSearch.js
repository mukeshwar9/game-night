import { GAME_TYPES, GAME_CATEGORIES } from './games'

const categoryLabelFor = (categoryId) => {
  const cat = GAME_CATEGORIES.find(c => c.id === categoryId)
  return cat ? `${cat.label} ${cat.full}` : ''
}

const baseLabelFor = (variantOf) => GAME_TYPES.find(t => t.type === variantOf)?.label || ''

const haystackFor = (t) => {
  const parts = [t.label, t.desc, categoryLabelFor(t.category)]
  if (t.variantOf) {
    parts.push(t.variantLabel, t.variantBlurb, baseLabelFor(t.variantOf))
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}

// Case-insensitive substring search over GAME_TYPES. Variant entries (e.g.
// ULTIMATE TTT) are included as standalone results so searching their name
// or blurb surfaces them even though they're normally hidden from the grid.
export function searchGames(query, { excludePredicate } = {}) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  return GAME_TYPES.filter(t => {
    if (excludePredicate && excludePredicate(t)) return false
    return haystackFor(t).includes(q)
  })
}
