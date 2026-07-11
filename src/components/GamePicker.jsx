import { useState, useRef, useEffect } from 'react'
import { GAME_TYPES, GAME_CATEGORIES, getGameConfig } from '../lib/games'
import { searchGames } from '../lib/gameSearch'
import { getFavorites, toggleFavorite } from '../lib/favorites'
import RulesModal from './RulesModal'
import CategoryTabs from './CategoryTabs'
import VariantChooser from './VariantChooser'
import GameCard from './GameCard'
import EmptyState from './EmptyState'
import { cn } from '@/lib/utils'

// Variant entries (those with `variantOf`) are hidden from the grid and surfaced
// as a "choose mode" step when their base game is picked.
const variantsFor = (baseType) => GAME_TYPES.filter(t => t.variantOf === baseType)

// Decision-support facet chips (layout="full" only). Toggleable, AND-combined.
const FILTER_DEFS = [
  { key: 'quick', label: 'QUICK', test: (t) => (t.durationMin ?? Infinity) <= 3 },
  { key: 'thinky', label: 'THINKY', test: (t) => (t.tags || []).includes('thinky') },
  { key: 'solo', label: 'SOLO OK', test: (t) => t.solo === true },
]

// M-82: activeCat/filters/query survive a round-trip to a game and back
// (Home fully unmounts on navigation, so this can't live in useState alone).
// Scoped to layout="full" (the Home catalog) — GameSwitcher's compact picker
// always wants to default to the current game's category.
const PICKER_STATE_KEY = 'gn-picker-state'
function readPickerState() {
  try {
    const raw = sessionStorage.getItem(PICKER_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function GamePicker({ onSelect, onSolo, excludeType, loadingType, layout = 'compact' }) {
  const isFull = layout === 'full'
  const defaultCat = isFull ? 'all' : ((excludeType && getGameConfig(excludeType)?.category) || GAME_CATEGORIES[0].id)
  const persisted = isFull ? readPickerState() : null
  const [activeCat, setActiveCat] = useState(persisted?.activeCat || defaultCat)
  const [rulesType, setRulesType] = useState(null)
  const [variantBase, setVariantBase] = useState(null)
  // Which action VariantChooser's onPick performs — 'friend' (room creation,
  // opened from the card's +MODES chip) or 'solo' (opened from the VS AI chip).
  const [variantMode, setVariantMode] = useState('friend')
  const [query, setQuery] = useState(persisted?.query || '')
  const [favVersion, setFavVersion] = useState(0)
  const [filters, setFilters] = useState(persisted?.filters || {})
  const searchRef = useRef(null)

  useEffect(() => {
    if (!isFull) return
    try {
      sessionStorage.setItem(PICKER_STATE_KEY, JSON.stringify({ activeCat, filters, query }))
    } catch {
      // sessionStorage unavailable (private mode / quota) — restoration just no-ops
    }
  }, [isFull, activeCat, filters, query])

  const activeFilterKeys = Object.keys(filters).filter(k => filters[k])
  const passesFilters = (t) => activeFilterKeys.every(k => FILTER_DEFS.find(f => f.key === k).test(t))
  const toggleFilter = (key) => setFilters(f => ({ ...f, [key]: !f[key] }))

  // favVersion forces a re-render on toggle; getFavorites() re-reads
  // localStorage fresh each render, so this stays in sync across a session.
  const favorites = isFull ? getFavorites() : []
  const favSet = new Set(favorites)
  const handleToggleFav = (type) => { toggleFavorite(type); setFavVersion(favVersion + 1) }

  // In-room switching (excludeType set) is restricted to the current seat
  // family: party rooms key players by uid, 2P rooms by 'X'/'O', and a
  // cross-family switch would leave every client seatless (see the
  // family-mismatch guard in Game.jsx). Home passes no excludeType — show all.
  const excludeCfg = excludeType ? getGameConfig(excludeType) : null
  const isHidden = (t) =>
    t.type === excludeType || t.variantOf ||
    (excludeCfg && !!t.nPlayer !== !!excludeCfg.nPlayer)
  const counts = {}
  for (const t of GAME_TYPES) {
    if (isHidden(t)) continue
    counts[t.category] = (counts[t.category] || 0) + 1
  }
  const totalVisible = Object.values(counts).reduce((a, b) => a + b, 0)
  const categories = GAME_CATEGORIES.map(c => ({ ...c, count: counts[c.id] || 0 })).filter(c => c.count > 0)
  const visibleFavorites = GAME_TYPES.filter(t => !isHidden(t) && favSet.has(t.type) && passesFilters(t))
  const categoriesWithAll = isFull ? [{ id: 'all', label: 'ALL', count: totalVisible }, ...categories] : categories
  const games = GAME_TYPES.filter(t => !isHidden(t) && t.category === activeCat && passesFilters(t))
  const categorySections = categories
    .map(c => ({ ...c, games: GAME_TYPES.filter(t => !isHidden(t) && t.category === c.id && passesFilters(t)) }))
    .filter(c => c.games.length > 0)

  useEffect(() => {
    if (!isFull) return
    const onKey = (e) => {
      if (e.key !== '/') return
      const target = e.target
      const isEditable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (isEditable) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFull])

  // M-13: tapping the card creates a PLAY-A-FRIEND room directly with the
  // default/Classic variant — no intermediate mode/variant modal. Variant
  // entries surfaced via search (e.g. ULTIMATE TTT) go straight to room
  // creation too, since they're already a specific pick.
  const handleTap = (g) => onSelect(g.type)

  // Secondary chip on the card — VS AI, skips straight to the solo demo.
  const handleVsAi = (g) => {
    // Only chain into a variant pick if a variant actually has a working
    // solo demo (e.g. ultimatettt, connectfourpop) — otherwise the base
    // game's demo is the only solo option, so skip straight to it.
    const soloVariants = variantsFor(g.type).filter(v => v.solo)
    if (soloVariants.length) { setVariantMode('solo'); setVariantBase(g) }
    else onSolo(g.type)
  }

  // Secondary chip on the card — +MODES, opens the friend-room variant pick.
  const handleModes = (g) => { setVariantMode('friend'); setVariantBase(g) }

  const gridClass = isFull
    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
    : 'grid grid-cols-2 gap-3'

  const renderGrid = (list) => (
    <div className={gridClass}>
      {list.map((g) => (
        <GameCard
          key={g.type}
          game={{ ...g, hasVariants: !g.variantOf && variantsFor(g.type).length > 0 }}
          onTap={handleTap}
          onRules={setRulesType}
          onVsAi={onSolo ? handleVsAi : undefined}
          onModes={handleModes}
          loadingType={loadingType}
          isFav={favSet.has(g.type)}
          onToggleFav={isFull ? handleToggleFav : undefined}
        />
      ))}
    </div>
  )

  const searchResults = isFull && query.trim()
    ? searchGames(query, { excludePredicate: (t) => t.type === excludeType || (excludeCfg && !!t.nPlayer !== !!excludeCfg.nPlayer) }).filter(passesFilters)
    : []

  // M-85: one bordered-card treatment for every "nothing here" moment in
  // this component, matching the Friends-page standard.
  const emptyState = (message) => <EmptyState>{message}</EmptyState>

  const searchBlock = isFull && (
    <div className="relative">
      <input
        ref={searchRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="SEARCH GAMES… ( / )"
        className="w-full min-h-11 bg-retro-card border-2 border-retro-border text-retro-text
          font-pixel text-xs tracking-widest placeholder-retro-border rounded pl-4 pr-11 py-3
          focus:outline-none focus:border-retro-p1 transition-colors"
      />
      {query && (
        <button
          type="button"
          onClick={() => { setQuery(''); searchRef.current?.focus() }}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 px-4 flex items-center justify-center
            text-retro-dim hover:text-retro-text font-pixel text-xs transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  )

  const filterBlock = isFull && (
    <div className="flex flex-wrap gap-3 justify-center">
      {FILTER_DEFS.map(f => (
        <button
          key={f.key}
          onClick={() => toggleFilter(f.key)}
          aria-pressed={!!filters[f.key]}
          className={cn(
            'min-h-11 px-3.5 inline-flex items-center justify-center rounded border font-pixel text-[9px] tracking-wider transition-all active:scale-95',
            filters[f.key]
              ? 'border-retro-cta text-retro-cta shadow-neon-cta bg-retro-tint-cta'
              : 'border-retro-border text-retro-dim hover:border-retro-p1/50 hover:text-retro-text bg-retro-card',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )

  const tabsBlock = !(isFull && query.trim()) && (
    <CategoryTabs categories={categoriesWithAll} active={activeCat} onSelect={setActiveCat} />
  )

  return (
    <div className="space-y-3">
      {/* M-42: search/filters/tabs stay reachable through the full scroll —
          sticky, safe-area aware, solid bg so cards don't show through. */}
      {isFull ? (
        <div
          className="sticky z-[5] bg-retro-bg pt-1 pb-2 space-y-3"
          style={{ top: 'max(4.5rem, calc(env(safe-area-inset-top) + 4rem))' }}
        >
          {searchBlock}
          {filterBlock}
          {tabsBlock}
        </div>
      ) : (
        tabsBlock
      )}

      {isFull && query.trim() ? (
        searchResults.length > 0 ? (
          renderGrid(searchResults)
        ) : (
          emptyState(`NO GAMES MATCH "${query.trim().toUpperCase()}"`)
        )
      ) : isFull && activeCat === 'all' ? (
        visibleFavorites.length === 0 && categorySections.length === 0 ? (
          emptyState('NO GAMES MATCH THESE FILTERS')
        ) : (
          <div className="space-y-5">
            {visibleFavorites.length > 0 && (
              <div className="space-y-2">
                <p className="font-pixel text-[9px] text-retro-p2 tracking-widest">★ FAVORITES</p>
                {renderGrid(visibleFavorites)}
              </div>
            )}
            {categorySections.map(c => (
              <div key={c.id} className="space-y-2">
                <p className="font-pixel text-[9px] text-retro-cta tracking-widest">{c.full}</p>
                {renderGrid(c.games)}
              </div>
            ))}
          </div>
        )
      ) : (
        games.length > 0 ? renderGrid(games) : emptyState('NO GAMES MATCH THESE FILTERS')
      )}

      {rulesType && (
        <RulesModal gameType={rulesType} onClose={() => setRulesType(null)} />
      )}
      {variantBase && (
        <VariantChooser
          base={variantBase}
          variants={variantMode === 'solo' ? variantsFor(variantBase.type).filter(v => v.solo) : variantsFor(variantBase.type)}
          onPick={(type) => {
            setVariantBase(null)
            if (variantMode === 'solo') onSolo(type)
            else if (type !== excludeType) onSelect(type)
          }}
          onClose={() => setVariantBase(null)}
        />
      )}
    </div>
  )
}
