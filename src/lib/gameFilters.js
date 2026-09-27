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
