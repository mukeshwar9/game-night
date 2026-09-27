// Catalog facet filters, redesigned: categories keep their chips (jump
// navigation); the toggleable facets (QUICK / THINKY / SOLO OK / CO-OP) live
// behind a FILTERS button with a count badge that opens a bottom sheet with
// real switch rows, a live result count and reset. Previewed on /art-demo;
// GamePicker adopts it by replacing the chipRow's trailing filters.
import { useState } from 'react'
import BottomSheet from './BottomSheet'
import SwitchRow from './SwitchRow'
import { cn } from '@/lib/utils'

import { FILTER_DEFS, countActiveFilters } from '../lib/gameFilters'

export function ViewTabs({ view, onSelect }) {
  const tab = (id, active, title, label, icon) => (
    <button
      key={id}
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={active}
      title={title}
      aria-label={label}
      className={cn(
        'w-11 min-h-11 flex items-center justify-center transition-colors',
        active ? 'bg-retro-tint-cta text-retro-cta' : 'text-retro-dim hover:text-retro-text',
      )}
    >
      {icon}
    </button>
  )
  const grid = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  )
  const list = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </svg>
  )
  const dense = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="2" y1="3" x2="14" y2="3" />
      <line x1="2" y1="6.5" x2="14" y2="6.5" />
      <line x1="2" y1="10" x2="14" y2="10" />
      <line x1="2" y1="13.5" x2="14" y2="13.5" />
    </svg>
  )
  return (
    <div role="group" aria-label="Card view" className="shrink-0 flex min-h-11 rounded-lg border border-retro-border bg-retro-card overflow-hidden divide-x divide-retro-border">
      {tab('detailed', view === 'detailed', 'Detailed view', 'Detailed view', grid)}
      {tab('compact', view === 'compact', 'Compact view', 'Compact view', list)}
      {tab('mini', view === 'mini', 'Ultra-compact list', 'Ultra-compact list', dense)}
    </div>
  )
}

export default function FilterButton({ filters, onToggle, onReset, resultCount }) {
  const [open, setOpen] = useState(false)
  const active = countActiveFilters(filters)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'shrink-0 min-h-11 px-3.5 inline-flex items-center justify-center gap-1.5 rounded-lg border font-pixel text-[9px] tracking-wider transition-all active:scale-95',
          active > 0
            ? 'border-retro-cta text-retro-cta bg-retro-tint-cta shadow-neon-cta'
            : 'border-retro-border text-retro-dim hover:text-retro-text bg-retro-card',
        )}
      >
        FILTERS
        {active > 0 && (
          <span aria-hidden="true" className="min-w-5 h-5 px-1 rounded-full bg-retro-cta text-retro-bg inline-flex items-center justify-center font-pixel text-[8px]">
            {active}
          </span>
        )}
      </button>
      {open && (
        <BottomSheet onClose={() => setOpen(false)} ariaLabel="Filter games" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">FILTERS</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors p-3 -m-2"
            >
              ✕
            </button>
          </div>
          <div className="space-y-3">
            {FILTER_DEFS.map(f => (
              <div key={f.key} className="space-y-1">
                <SwitchRow
                  label={f.label}
                  checked={!!filters[f.key]}
                  onChange={() => onToggle(f.key)}
                  ariaLabel={`Toggle ${f.label} filter`}
                />
                <p className="font-mono text-[10px] text-retro-dim">{f.blurb}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReset}
              disabled={active === 0}
              className="flex-1 min-h-11 px-2 rounded border border-retro-border text-retro-dim font-pixel text-[9px] tracking-wider
                hover:text-retro-cta hover:border-retro-cta/50 transition-all active:scale-95 disabled:opacity-40"
            >
              RESET
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-[2] min-h-11 px-2 rounded bg-retro-cta text-retro-bg font-pixel text-[9px] tracking-wider hover:shadow-neon-cta transition-all active:scale-95"
            >
              SHOW {resultCount} GAME{resultCount === 1 ? '' : 'S'}
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  )
}
