import { useState, useRef, useEffect } from 'react'
import { GAME_TYPES, GAME_CATEGORIES, getGameConfig, supportsLocalPlay, getNewGames } from '../lib/games'
import { searchGames } from '../lib/gameSearch'
import { getFavorites, toggleFavorite } from '../lib/favorites'
import RulesModal from './LazyRulesModal'
import CategoryTabs from './CategoryTabs'
import VariantChooser from './VariantChooser'
import GameOptionsSheet from './GameOptionsSheet'
import GameCard from './GameCard'
import NewGamesRail from './NewGamesRail'
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
  { key: 'coop', label: 'CO-OP', test: (t) => t.coop === true },
]

// M-82: filters/query survive a round-trip to a game and back (Home fully
// unmounts on navigation, so this can't live in useState alone). Scoped to
// layout="full" (the Games catalog) — GameSwitcher's compact picker always
// wants to default to the current game's category. The catalog's category
// chips are jump links now, so the active one is not persisted.
const PICKER_STATE_KEY = 'gn-picker-state'
// Jump-chip targets land just under the sticky search + chip header.
const SECTION_SCROLL_MARGIN = 'calc(var(--app-header-offset, 0px) + 7.5rem)'
function readPickerState() {
  try {
    const raw = sessionStorage.getItem(PICKER_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function GamePicker({ onSelect, onOnline, onSolo, onLocal, excludeType, loadingType, layout = 'compact', initialType, crossFamily = false }) {
  const isFull = layout === 'full'
  const defaultCat = isFull ? 'all' : ((excludeType && getGameConfig(excludeType)?.category) || GAME_CATEGORIES[0].id)
  const persisted = isFull ? readPickerState() : null
  const [activeCat, setActiveCat] = useState(defaultCat)
  const [rulesType, setRulesType] = useState(null)
  const [optionsGame, setOptionsGame] = useState(() => (
    isFull && initialType
      ? (() => {
          // Same shape the grid passes (see renderGrid): without hasVariants a
          // deep-linked sheet (?game=) silently hid MORE MODES.
          const g = GAME_TYPES.find(t => t.type === initialType && !t.variantOf)
          return g ? { ...g, hasVariants: variantsFor(g.type).length > 0 } : null
        })()
      : null
  ))
  const [variantBase, setVariantBase] = useState(null)
  // Which action VariantChooser's onPick performs — 'friend' (room creation,
  // opened from the sheet's MORE MODES row), 'solo' (VS AI row), or 'local'
  // (2P PASS row, opens the hot-seat pass-and-play route).
  const [variantMode, setVariantMode] = useState('friend')
  const [query, setQuery] = useState(persisted?.query || '')
  const [favVersion, setFavVersion] = useState(0)
  const [filters, setFilters] = useState(persisted?.filters || {})
  const searchRef = useRef(null)
  const stickyRef = useRef(null)
  const listTopRef = useRef(null)
  const sectionRefs = useRef({})
  // Computed once — the " ( / )" keyboard hint is desktop-only real estate;
  // no need to re-check on resize for a hint this minor.
  const [showSlashHint] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches)

  useEffect(() => {
    if (!isFull) return
    try {
      sessionStorage.setItem(PICKER_STATE_KEY, JSON.stringify({ filters, query }))
    } catch {
      // sessionStorage unavailable (private mode / quota) — restoration just no-ops
    }
  }, [isFull, filters, query])

  const activeFilterKeys = Object.keys(filters).filter(k => filters[k])
  const passesFilters = (t) => activeFilterKeys.every(k => FILTER_DEFS.find(f => f.key === k).test(t))
  const toggleFilter = (key) => setFilters(f => ({ ...f, [key]: !f[key] }))

  // favVersion forces a re-render on toggle; getFavorites() re-reads
  // localStorage fresh each render, so this stays in sync across a session.
  const favorites = isFull ? getFavorites() : []
  const favSet = new Set(favorites)
  const handleToggleFav = (type) => { toggleFavorite(type); setFavVersion(favVersion + 1) }

  // In-room switching (excludeType set) is restricted to the current seat
  // family: party rooms key players by uid, 2P rooms by 'X'/'O'. The one
  // exception is game-night mode (`crossFamily`, from RoomSwitchContext): a
  // party room may drop into a 2P game — two players sit, the rest queue for
  // winner stays — and switch back, with the room reseating everyone (see
  // nightSwitchSeating in src/lib/nightLogic.js). Home passes no excludeType —
  // show all.
  const excludeCfg = excludeType ? getGameConfig(excludeType) : null
  const wrongFamily = (t) => !!excludeCfg && !crossFamily && !!t.nPlayer !== !!excludeCfg.nPlayer
  const isHidden = (t) =>
    t.type === excludeType || t.variantOf || wrongFamily(t)
  const counts = {}
  for (const t of GAME_TYPES) {
    if (isHidden(t)) continue
    counts[t.category] = (counts[t.category] || 0) + 1
  }
  const totalVisible = Object.values(counts).reduce((a, b) => a + b, 0)
  const categories = GAME_CATEGORIES.map(c => ({ ...c, count: counts[c.id] || 0 })).filter(c => c.count > 0)
  const visibleFavorites = GAME_TYPES.filter(t => !isHidden(t) && favSet.has(t.type) && passesFilters(t))
  const games = GAME_TYPES.filter(t => !isHidden(t) && t.category === activeCat && passesFilters(t))
  const categorySections = categories
    .map(c => ({ ...c, games: GAME_TYPES.filter(t => !isHidden(t) && t.category === c.id && passesFilters(t)) }))
    .filter(c => c.games.length > 0)
  // The catalog's chips jump to a section of the one long list, so they
  // list only sections that exist under the current filters, with counts.
  const categoriesWithAll = isFull
    ? [
        { id: 'all', label: 'ALL', count: categorySections.reduce((n, c) => n + c.games.length, 0) },
        ...categorySections.map(({ games: list, ...c }) => ({ ...c, count: list.length })),
      ]
    : categories
  const newGames = isFull
    ? getNewGames(GAME_TYPES.filter(t => !isHidden(t) && passesFilters(t)))
        .map(g => ({ ...g, hasVariants: variantsFor(g.type).length > 0 }))
    : []

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

  // Scroll spy for the catalog's jump chips: the active chip is the last
  // section whose top has passed under the sticky header (ALL above the
  // first one).
  const isSearching = isFull && !!query.trim()
  useEffect(() => {
    if (!isFull || isSearching) return
    let frame = 0
    const update = () => {
      frame = 0
      const line = (stickyRef.current?.getBoundingClientRect().bottom ?? 0) + 8
      let current = 'all'
      for (const [id, el] of Object.entries(sectionRefs.current)) {
        if (el && el.getBoundingClientRect().top <= line) current = id
      }
      setActiveCat(prev => (prev === current ? prev : current))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [isFull, isSearching])

  const jumpTo = (id) => {
    setActiveCat(id)
    const el = id === 'all' ? listTopRef.current : sectionRefs.current[id]
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Home's catalog (layout="full"): tapping a card opens the options sheet
  // (PLAY ONLINE first, then VS AI / 2P PASS / MORE MODES / RULES) instead of
  // silently creating a live Firebase room — see CLAUDE.md's Home → play
  // funnel fix. GameSwitcher's compact in-room picker keeps the old
  // tap-to-select behavior since there `onSelect` proposes a game-type
  // switch, not a new room, and the sheet there has no PLAY ONLINE row.
  const handleTap = (g) => (isFull ? setOptionsGame(g) : onSelect(g.type))

  // GameSwitcher's in-room rows: a game with variants gets a MODES button
  // that opens the variant pick directly (the old ⋯ sheet's only extra there).
  const handleSwitchModes = (g) => { setVariantMode('friend'); setVariantBase(g) }

  // GameOptionsSheet invite/public rows. Private creation uses the existing
  // Home room flow; public play opens the matchmaking lobby for this game.
  const handleInvite = (g) => { setOptionsGame(null); onSelect(g.type) }
  const handlePublic = (g) => { setOptionsGame(null); (onOnline ? onOnline(g.type) : onSelect(g.type)) }

  // GameOptionsSheet's VS AI row — skips straight to the solo demo, only
  // chaining into a variant pick if a variant actually has a working solo
  // demo (e.g. ultimatettt, connectfourpop) — otherwise the base game's demo
  // is the only solo option, so skip straight to it.
  const handleVsAi = (g) => {
    setOptionsGame(null)
    const soloVariants = variantsFor(g.type).filter(v => v.solo)
    if (soloVariants.length) { setVariantMode('solo'); setVariantBase(g) }
    else onSolo(g.type)
  }

  // GameOptionsSheet's 2P PASS row — opens the local hot-seat mode.
  const handleLocal = (g) => {
    setOptionsGame(null)
    const localVariants = variantsFor(g.type).filter(v => supportsLocalPlay(v.type))
    if (localVariants.length) { setVariantMode('local'); setVariantBase(g) }
    else onLocal(g.type)
  }

  // GameOptionsSheet's MORE MODES row — opens the friend-room variant pick.
  const handleModes = (g) => { setOptionsGame(null); setVariantMode('friend'); setVariantBase(g) }

  const handleRules = (type) => { setOptionsGame(null); setRulesType(type) }

  const gridClass = isFull
    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2'
    : 'grid grid-cols-2 gap-2'

  const renderGrid = (list) => (
    <div className={gridClass}>
      {list.map((g) => (
        <GameCard
          key={g.type}
          game={{ ...g, hasVariants: !g.variantOf && variantsFor(g.type).length > 0 }}
          onTap={handleTap}
          onModes={isFull ? undefined : handleSwitchModes}
          loadingType={loadingType}
          isFav={favSet.has(g.type)}
          onToggleFav={isFull ? handleToggleFav : undefined}
        />
      ))}
    </div>
  )

  const searchResults = isFull && query.trim()
    ? searchGames(query, { excludePredicate: (t) => t.type === excludeType || wrongFamily(t) }).filter(passesFilters)
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
        placeholder={`Search ${totalVisible} games…${showSlashHint ? ' ( / )' : ''}`}
        aria-label="Search games"
        className="w-full min-h-11 bg-retro-card border-2 border-retro-border text-retro-text
          font-mono text-sm placeholder-retro-dim rounded pl-4 pr-11 py-2.5
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

  const filterChipClass = (active) => cn(
    'min-h-11 px-3.5 shrink-0 snap-start whitespace-nowrap inline-flex items-center justify-center rounded border font-pixel text-[9px] tracking-wider transition-all active:scale-95',
    active
      ? 'border-retro-cta text-retro-cta shadow-neon-cta bg-retro-tint-cta'
      : 'border-retro-border text-retro-dim hover:border-retro-p1/50 hover:text-retro-text bg-retro-card',
  )

  const filterChips = isFull && FILTER_DEFS.map(f => (
    <button
      key={f.key}
      onClick={() => toggleFilter(f.key)}
      aria-pressed={!!filters[f.key]}
      className={filterChipClass(!!filters[f.key])}
    >
      {f.label}
    </button>
  ))

  // Search hides the category tabs entirely (categories don't apply to a
  // free-text result set) but filters stay reachable via their own row.
  const chipRow = isSearching ? (
    <div className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-1 pb-1">
      {filterChips}
    </div>
  ) : (
    <CategoryTabs
      categories={categoriesWithAll}
      active={activeCat}
      onSelect={isFull ? jumpTo : setActiveCat}
      trailing={isFull ? <><div className="w-px shrink-0 self-stretch bg-retro-border" aria-hidden="true" />{filterChips}</> : undefined}
    />
  )

  return (
    <div className="space-y-3">
      {/* M-42: search/filters/tabs stay reachable through the full scroll —
          sticky, safe-area aware, solid bg so cards don't show through.
          top offset collapses to 0 while NavBar is hidden (useHideOnScroll)
          so this rides up flush instead of leaving a gap. */}
      {isFull ? (
        <div ref={stickyRef} className="sticky top-[var(--app-header-offset)] z-20 bg-retro-bg pt-1 pb-2 space-y-2 transition-[top] duration-200">
          {searchBlock}
          {chipRow}
        </div>
      ) : (
        chipRow
      )}

      {isFull && query.trim() ? (
        searchResults.length > 0 ? (
          renderGrid(searchResults)
        ) : (
          emptyState(`NO GAMES MATCH "${query.trim().toUpperCase()}"`)
        )
      ) : isFull ? (
        visibleFavorites.length === 0 && categorySections.length === 0 ? (
          emptyState('NO GAMES MATCH THESE FILTERS')
        ) : (
          <div ref={listTopRef} className="space-y-5" style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}>
            <NewGamesRail games={newGames} onTap={handleTap} loadingType={loadingType} />
            {visibleFavorites.length > 0 && (
              <div className="space-y-2">
                <p className="font-pixel text-[9px] text-retro-p2 tracking-widest">★ FAVORITES</p>
                {renderGrid(visibleFavorites)}
              </div>
            )}
            {categorySections.map(c => (
              <section
                key={c.id}
                ref={el => { sectionRefs.current[c.id] = el }}
                aria-labelledby={`catalog-${c.id}`}
                className="space-y-2"
                style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 id={`catalog-${c.id}`} className="font-pixel text-[9px] text-retro-cta tracking-widest">{c.full}</h2>
                  <span className="font-mono text-[11px] text-retro-dim">{c.games.length}</span>
                </div>
                {renderGrid(c.games)}
              </section>
            ))}
          </div>
        )
      ) : (
        games.length > 0 ? renderGrid(games) : emptyState('NO GAMES MATCH THESE FILTERS')
      )}

      {optionsGame && (
        <GameOptionsSheet
          game={optionsGame}
          onInvite={isFull ? handleInvite : undefined}
          onPublic={isFull ? handlePublic : undefined}
          onSolo={onSolo ? handleVsAi : undefined}
          onLocal={onLocal ? handleLocal : undefined}
          onModes={handleModes}
          onRules={handleRules}
          onClose={() => setOptionsGame(null)}
          loadingType={loadingType}
        />
      )}
      {rulesType && (
        <RulesModal gameType={rulesType} onClose={() => setRulesType(null)} />
      )}
      {variantBase && (
        <VariantChooser
          base={variantBase}
          variants={
            variantMode === 'solo' ? variantsFor(variantBase.type).filter(v => v.solo)
              : variantMode === 'local' ? variantsFor(variantBase.type).filter(v => supportsLocalPlay(v.type))
              : variantsFor(variantBase.type)
          }
          onPick={(type) => {
            setVariantBase(null)
            if (variantMode === 'solo') onSolo(type)
            else if (variantMode === 'local') onLocal(type)
            else if (type !== excludeType) onSelect(type)
          }}
          onClose={() => setVariantBase(null)}
        />
      )}
    </div>
  )
}
