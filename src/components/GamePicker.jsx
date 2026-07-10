import { useState, useRef, useEffect } from 'react'
import { GAME_TYPES, GAME_CATEGORIES, getGameConfig } from '../lib/games'
import { searchGames } from '../lib/gameSearch'
import { getFavorites, toggleFavorite } from '../lib/favorites'
import RulesModal from './RulesModal'
import CategoryTabs from './CategoryTabs'
import VariantChooser from './VariantChooser'
import GameCard from './GameCard'

// Variant entries (those with `variantOf`) are hidden from the grid and surfaced
// as a "choose mode" step when their base game is picked.
const variantsFor = (baseType) => GAME_TYPES.filter(t => t.variantOf === baseType)

export default function GamePicker({ onSelect, excludeType, loadingType, layout = 'compact' }) {
  const isFull = layout === 'full'
  const defaultCat = isFull ? 'all' : ((excludeType && getGameConfig(excludeType)?.category) || GAME_CATEGORIES[0].id)
  const [activeCat, setActiveCat] = useState(defaultCat)
  const [rulesType, setRulesType] = useState(null)
  const [variantBase, setVariantBase] = useState(null)
  const [query, setQuery] = useState('')
  const [favVersion, setFavVersion] = useState(0)
  const searchRef = useRef(null)

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
  const visibleFavorites = GAME_TYPES.filter(t => !isHidden(t) && favSet.has(t.type))
  const categoriesWithAll = isFull ? [{ id: 'all', label: 'ALL', count: totalVisible }, ...categories] : categories
  const games = GAME_TYPES.filter(t => !isHidden(t) && t.category === activeCat)

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

  const handleTap = (g) => {
    if (g.variantOf) { onSelect(g.type); return }
    if (variantsFor(g.type).length) setVariantBase(g)
    else onSelect(g.type)
  }

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
          loadingType={loadingType}
          isFav={favSet.has(g.type)}
          onToggleFav={isFull ? handleToggleFav : undefined}
        />
      ))}
    </div>
  )

  const searchResults = isFull && query.trim()
    ? searchGames(query, { excludePredicate: (t) => t.type === excludeType || (excludeCfg && !!t.nPlayer !== !!excludeCfg.nPlayer) })
    : []

  return (
    <div className="space-y-3">
      {isFull && (
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="SEARCH GAMES… ( / )"
          className="w-full bg-retro-card border-2 border-retro-border text-retro-text
            font-pixel text-xs tracking-widest placeholder-retro-border rounded px-4 py-3
            focus:outline-none focus:border-retro-p1 transition-colors"
        />
      )}

      {!(isFull && query.trim()) && (
        <CategoryTabs categories={categoriesWithAll} active={activeCat} onSelect={setActiveCat} />
      )}

      {isFull && query.trim() ? (
        searchResults.length > 0 ? (
          renderGrid(searchResults)
        ) : (
          <p className="font-pixel text-[9px] text-retro-dim text-center py-6 tracking-wider">
            NO GAMES MATCH "{query.trim().toUpperCase()}"
          </p>
        )
      ) : isFull && activeCat === 'all' ? (
        <div className="space-y-5">
          {visibleFavorites.length > 0 && (
            <div className="space-y-2">
              <p className="font-pixel text-[9px] text-retro-p2 tracking-widest">★ FAVORITES</p>
              {renderGrid(visibleFavorites)}
            </div>
          )}
          {categories.map(c => (
            <div key={c.id} className="space-y-2">
              <p className="font-pixel text-[9px] text-retro-cta tracking-widest">{c.full}</p>
              {renderGrid(GAME_TYPES.filter(t => !isHidden(t) && t.category === c.id))}
            </div>
          ))}
        </div>
      ) : (
        renderGrid(games)
      )}

      {rulesType && (
        <RulesModal gameType={rulesType} onClose={() => setRulesType(null)} />
      )}
      {variantBase && (
        <VariantChooser
          base={variantBase}
          variants={variantsFor(variantBase.type)}
          onPick={(type) => { setVariantBase(null); if (type !== excludeType) onSelect(type) }}
          onClose={() => setVariantBase(null)}
        />
      )}
    </div>
  )
}
