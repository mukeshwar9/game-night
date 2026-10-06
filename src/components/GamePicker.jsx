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
import FilterButton, { ViewTabs } from './GameFilters'
import { FILTER_DEFS, isSortId, readCatalogView, sortGames } from '../lib/gameFilters'
import { makePickerScope } from '../lib/pickerScope'
import { scrollBehavior } from '../hooks/useMotionPref'

// Facet definitions live in lib/gameFilters.js (shared with the
// FILTERS sheet); the toggle state below stays session-persisted here.
// M-82: filters/query/sort survive visits (Home fully unmounts on
// navigation, so this can't live in useState alone). Device-local
// localStorage — a returning visitor keeps their slice of the catalog.
// Scoped to layout="full" (the Games catalog) — GameSwitcher's compact
// picker always wants to default to the current game's category. The
// catalog's category chips are jump links now, so the active one is not
// persisted.
const PICKER_STATE_KEY = 'gn-picker-state'
const VIEW_KEY = 'gn-catalog-view'
// Jump-chip targets land just under the sticky search + chip header.
// Quiet time after the last scroll event before a chip jump counts as settled
// (`scrollend` releases it sooner where supported). Smooth scrolls on a long
// catalog can stall for a few hundred ms while thumbnails decode.
const JUMP_SETTLE_MS = 700
const SECTION_SCROLL_MARGIN = 'calc(var(--app-header-offset, 0px) + 7.5rem)'
function readPickerState() {
  try {
    const raw = localStorage.getItem(PICKER_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// `allowTypes` (optional) limits the picker to those types — the solo hub
// passes its playable games. `currentType` (optional) only picks the compact
// picker's starting category when nothing is excluded.
export default function GamePicker({ onSelect, onOnline, onSolo, onLocal, excludeType, allowTypes, currentType, loadingType, layout = 'compact', initialType, crossFamily = false }) {
  const isFull = layout === 'full'
  const startType = excludeType || currentType
  const defaultCat = isFull ? 'all' : ((startType && getGameConfig(startType)?.category) || GAME_CATEGORIES[0].id)
  const persisted = isFull ? readPickerState() : null
  // In-room switching (excludeType set) is restricted to the current seat
  // family: party rooms key players by uid, 2P rooms by 'X'/'O'. The one
  // exception is game-night mode (`crossFamily`, from RoomSwitchContext): a
  // party room may drop into a 2P game — two players sit, the rest queue for
  // winner stays — and switch back, with the room reseating everyone (see
  // nightSwitchSeating in src/lib/nightLogic.js). Home passes no excludeType —
  // show all. Variant entries are hidden from the grid and surfaced as a
  // "choose mode" step when their base game is picked.
  const { isHidden, isOffLimits, variantsFor } = makePickerScope({ excludeType, allowTypes, crossFamily })
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
  const [sort, setSort] = useState(persisted && isSortId(persisted.sort) ? persisted.sort : 'curated')
  const selectSort = (id) => { if (isSortId(id)) setSort(id) }
  // Card view: detailed tiles (big art top, name bottom), compact rows, or
  // the mini list.
  // Device-local like the other display prefs; detailed shows off the art.
  const [view, setView] = useState(() => {
    try {
      return readCatalogView(localStorage.getItem(VIEW_KEY))
    } catch {
      return 'detailed'
    }
  })
  const selectView = (next) => {
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // storage unavailable — view just doesn't persist
    }
    setView(next)
  }
  const searchRef = useRef(null)
  const stickyRef = useRef(null)
  const listTopRef = useRef(null)
  const sectionRefs = useRef({})
  const jumpLockRef = useRef(null) // { timer } while a chip tap's smooth scroll runs
  // Computed once — the " ( / )" keyboard hint is desktop-only real estate;
  // no need to re-check on resize for a hint this minor.
  const [showSlashHint] = useState(() => isFull && typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches)

  // The compact picker lives in a sheet: focus its search on desktop so
  // typing filters at once, but never on touch, where focus pops the
  // keyboard over the list. Deferred a frame because BottomSheet focuses its
  // own panel on mount, after this child effect runs.
  useEffect(() => {
    if (isFull || typeof window === 'undefined') return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const id = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(id)
  }, [isFull])

  useEffect(() => {
    if (!isFull) return
    try {
      localStorage.setItem(PICKER_STATE_KEY, JSON.stringify({ filters, query, sort }))
    } catch {
      // storage unavailable (private mode / quota) — restoration just no-ops
    }
  }, [isFull, filters, query, sort])

  const activeFilterKeys = Object.keys(filters).filter(k => filters[k])
  const passesFilters = (t) => activeFilterKeys.every(k => FILTER_DEFS.find(f => f.key === k).test(t))
  const toggleFilter = (key) => setFilters(f => ({ ...f, [key]: !f[key] }))

  // favVersion forces a re-render on toggle; getFavorites() re-reads
  // localStorage fresh each render, so this stays in sync across a session.
  const favorites = isFull ? getFavorites() : []
  const favSet = new Set(favorites)
  const handleToggleFav = (type) => { toggleFavorite(type); setFavVersion(favVersion + 1) }

  const counts = {}
  for (const t of GAME_TYPES) {
    if (isHidden(t)) continue
    counts[t.category] = (counts[t.category] || 0) + 1
  }
  const totalVisible = Object.values(counts).reduce((a, b) => a + b, 0)
  const categories = GAME_CATEGORIES.map(c => ({ ...c, count: counts[c.id] || 0 })).filter(c => c.count > 0)
  const visibleFavorites = sortGames(GAME_TYPES.filter(t => !isHidden(t) && favSet.has(t.type) && passesFilters(t)), sort)
  const games = GAME_TYPES.filter(t => !isHidden(t) && t.category === activeCat && passesFilters(t))
  const categorySections = categories
    .map(c => ({ ...c, games: sortGames(GAME_TYPES.filter(t => !isHidden(t) && t.category === c.id && passesFilters(t)), sort) }))
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
  // first one). A chip tap holds its own chip until that smooth scroll settles: the
  // section lands at its scroll margin, which (with the app header sliding away
  // mid-scroll) can sit just below the line, so tapping MEMORY used to light REFLEX.
  const isSearching = !!query.trim()
  useEffect(() => {
    if (!isFull || isSearching) return
    let frame = 0
    const update = () => {
      frame = 0
      // Chip jumps scroll a section to its scroll margin, which counts the app
      // header; once the header slides away the line must keep that gap too, or
      // the section a chip just jumped to rests below the line.
      const headerGap = document.documentElement.classList.contains('header-hidden')
        ? (document.querySelector('header')?.offsetHeight ?? 0) : 0
      const line = (stickyRef.current?.getBoundingClientRect().bottom ?? 0) + 8 + headerGap
      let current = 'all'
      for (const [id, el] of Object.entries(sectionRefs.current)) {
        if (el && el.getBoundingClientRect().top <= line) current = id
      }
      setActiveCat(prev => (prev === current ? prev : current))
    }
    const onScroll = () => {
      const lock = jumpLockRef.current
      if (lock) {
        // Still the chip's own smooth scroll: re-arm the settle timer, keep its chip.
        clearTimeout(lock.timer)
        lock.timer = setTimeout(() => { jumpLockRef.current = null }, JUMP_SETTLE_MS)
        return
      }
      if (!frame) frame = requestAnimationFrame(update)
    }
    // A finger or wheel takes over from a chip jump at once.
    const release = () => { if (jumpLockRef.current) { clearTimeout(jumpLockRef.current.timer); jumpLockRef.current = null } }
    const onScrollEnd = () => release()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scrollend', onScrollEnd)
    window.addEventListener('touchstart', release, { passive: true })
    window.addEventListener('wheel', release, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('scrollend', onScrollEnd)
      window.removeEventListener('touchstart', release)
      window.removeEventListener('wheel', release)
      if (frame) cancelAnimationFrame(frame)
      release()
    }
  }, [isFull, isSearching])

  const jumpTo = (id) => {
    if (jumpLockRef.current) clearTimeout(jumpLockRef.current.timer)
    jumpLockRef.current = { timer: setTimeout(() => { jumpLockRef.current = null }, JUMP_SETTLE_MS) }
    setActiveCat(id)
    const el = id === 'all' ? listTopRef.current : sectionRefs.current[id]
    el?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
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

  // Detailed tiles only in the full catalog — the in-room switcher keeps
  // compact rows (space is tight and the tap proposes a switch, not a sheet).
  const detailed = isFull && view === 'detailed'
  const mini = isFull && view === 'mini'
  const gridClass = detailed
    ? 'grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'
    : mini
      ? 'flex flex-col gap-1'
      : isFull
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
          layout={detailed ? 'tile' : mini ? 'mini' : 'row'}
        />
      ))}
    </div>
  )

  const searchResults = isSearching
    ? searchGames(query, { excludePredicate: isOffLimits }).filter(passesFilters)
    : []

  // M-85: one bordered-card treatment for every "nothing here" moment in
  // this component, matching the Friends-page standard.
  const emptyState = (message) => <EmptyState>{message}</EmptyState>

  const searchBlock = (
    <div className="relative">
      <input
        ref={searchRef}
        type="text"
        enterKeyHint="search"
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

  const filterMatchCount = GAME_TYPES.filter(t => !isHidden(t) && passesFilters(t)).length
  const viewTabs = isFull && (
    <div className="flex items-center justify-between gap-2">
      <FilterButton
        filters={filters}
        onToggle={toggleFilter}
        onReset={() => { setFilters({}); setSort('curated') }}
        resultCount={isSearching ? searchResults.length : filterMatchCount}
        sort={sort}
        onSort={selectSort}
      />
      <ViewTabs view={view} onSelect={selectView} />
    </div>
  )
  // Search hides the category tabs (they don't apply to free text) — facet
  // filtering stays available through the FILTERS button in every mode.
  const chipRow = isSearching ? null : (
    <CategoryTabs
      categories={categoriesWithAll}
      active={activeCat}
      onSelect={isFull ? jumpTo : setActiveCat}
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
        // Compact (in a sheet): the search rides at the top of the sheet's
        // scroll so it stays reachable below a long list.
        <div className="sticky top-0 z-10 -mx-4 px-4 pt-1 pb-2 bg-retro-bg space-y-2">
          {searchBlock}
          {chipRow}
        </div>
      )}

      {viewTabs}

      {isSearching ? (
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
                {/* The count lives on the category chip; no second copy here. */}
                <h2 id={`catalog-${c.id}`} className="font-pixel text-[9px] text-retro-cta tracking-widest">{c.full}</h2>
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
