import { useState } from 'react'
import { GAME_TYPES, GAME_CATEGORIES, getPlayerTag, getGameConfig } from '../lib/games'
import { cn } from '@/lib/utils'
import RulesModal, { RulesButton } from './RulesModal'
import CategoryTabs from './CategoryTabs'
import VariantChooser from './VariantChooser'

// Variant entries (those with `variantOf`) are hidden from the grid and surfaced
// as a "choose mode" step when their base game is picked.
const variantsFor = (baseType) => GAME_TYPES.filter(t => t.variantOf === baseType)

export default function GamePicker({ onSelect, excludeType, loadingType }) {
  const defaultCat = (excludeType && getGameConfig(excludeType)?.category) || GAME_CATEGORIES[0].id
  const [activeCat, setActiveCat] = useState(defaultCat)
  const [rulesType, setRulesType] = useState(null)
  const [variantBase, setVariantBase] = useState(null)

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
  const categories = GAME_CATEGORIES.map(c => ({ ...c, count: counts[c.id] || 0 })).filter(c => c.count > 0)
  const games = GAME_TYPES.filter(t => !isHidden(t) && t.category === activeCat)

  const handleTap = (g) => {
    if (variantsFor(g.type).length) setVariantBase(g)
    else onSelect(g.type)
  }

  return (
    <div className="space-y-3">
      <CategoryTabs categories={categories} active={activeCat} onSelect={setActiveCat} />
      <div className="grid grid-cols-2 gap-3">
        {games.map((g) => {
          const { type, label, desc, Icon } = g
          const hasVariants = variantsFor(type).length > 0
          return (
            <div key={type} className="relative">
              <button
                onClick={() => handleTap(g)}
                disabled={!!loadingType}
                className={cn(
                  'w-full flex flex-col items-center gap-2.5 py-4 px-2 border-2 rounded',
                  'transition-all active:scale-95',
                  loadingType === type
                    ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
                    : 'border-retro-border bg-retro-card hover:border-retro-cta/50',
                  loadingType && loadingType !== type && 'opacity-40',
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded flex items-center justify-center',
                  loadingType === type ? 'text-retro-cta' : 'text-retro-dim',
                )}>
                  {Icon && <Icon />}
                </div>
                <div className="text-center">
                  <p className="font-pixel text-[10px] text-retro-text leading-relaxed">{label}</p>
                  <p className="font-mono text-[10px] text-retro-dim mt-0.5">{desc}</p>
                  <p className={cn('font-pixel text-[7px] mt-1', g.nPlayer ? 'text-retro-p2' : 'text-retro-dim')}>{getPlayerTag(g)}</p>
                </div>
                {loadingType === type && (
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1 h-1 bg-retro-cta rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                )}
                {hasVariants && (
                  <span className="absolute bottom-1 left-1 font-pixel text-[6px] text-retro-cta/80 tracking-wider">+MODES</span>
                )}
              </button>
              <RulesButton
                onClick={(e) => { e.stopPropagation(); setRulesType(type) }}
                className="absolute top-1 right-1 z-10 hover:text-retro-cta"
              />
            </div>
          )
        })}
      </div>
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
