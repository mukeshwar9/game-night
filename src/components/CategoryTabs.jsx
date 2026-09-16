import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

// `leading` (optional) renders extra content — e.g. GamePicker's filter
// chips + a divider — before the category chips, inside the same scroll row.
export default function CategoryTabs({ categories, active, onSelect, leading }) {
  const activeRef = useRef(null)

  // The row clips at the viewport edge with no visual scroll cue, and a
  // restored/persisted active chip (M-82) can land off-screen — scroll it
  // into view on mount so the current selection is never hidden.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [])

  return (
    <div className="relative">
      <div className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-1 pb-1">
        {leading}
        {categories.map(({ id, label, count }) => (
          <button
            key={id}
            ref={active === id ? activeRef : undefined}
            onClick={() => onSelect(id)}
            className={cn(
              'min-h-11 px-3.5 shrink-0 snap-start whitespace-nowrap inline-flex items-center justify-center rounded border font-pixel text-[9px] tracking-wider transition-all active:scale-95',
              active === id
                ? 'border-retro-cta text-retro-cta shadow-neon-cta bg-retro-tint-cta'
                : 'border-retro-border text-retro-dim hover:border-retro-p1/50 hover:text-retro-text bg-retro-card',
            )}
          >
            {label}
            {count != null && <span className="opacity-60 ml-1 hidden sm:inline">·{count}</span>}
          </button>
        ))}
      </div>
      {/* Right-edge fade — hints there's more to scroll to without a hard cut. */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-retro-bg to-transparent" aria-hidden="true" />
    </div>
  )
}
