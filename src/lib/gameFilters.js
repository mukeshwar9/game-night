// Catalog facet-filter definitions + pure helpers (no components — see
// react-refresh/only-export-components). Rendered by GameFilters.jsx,
// adopted by GamePicker on approval (replacing the chipRow's trailing chips).

export const FILTER_DEFS = [
  { key: 'quick', label: 'QUICK', blurb: '3 min or less', test: (t) => (t.durationMin ?? Infinity) <= 3 },
  { key: 'thinky', label: 'THINKY', blurb: 'Strategy tag', test: (t) => (t.tags || []).includes('thinky') },
  { key: 'solo', label: 'SOLO OK', blurb: 'VS AI available', test: (t) => t.solo === true },
  { key: 'coop', label: 'CO-OP', blurb: 'Team up together', test: (t) => t.coop === true },
]

export function countActiveFilters(filters) {
  return FILTER_DEFS.filter(f => filters[f.key]).length
}

export function passesFilters(game, filters) {
  return FILTER_DEFS.every(f => !filters[f.key] || f.test(game))
}

export const SORTS = [
  { id: 'curated', label: 'CURATED', blurb: 'House order' },
  { id: 'az', label: 'A–Z', blurb: 'Alphabetical' },
  { id: 'quick', label: 'QUICKEST', blurb: 'Shortest first' },
]

export function isSortId(id) {
  return SORTS.some(s => s.id === id)
}

export function sortGames(list, sort) {
  if (sort === 'az') return [...list].sort((a, b) => a.label.localeCompare(b.label))
  if (sort === 'quick') return [...list].sort((a, b) => (a.durationMin ?? 999) - (b.durationMin ?? 999))
  return list
}
