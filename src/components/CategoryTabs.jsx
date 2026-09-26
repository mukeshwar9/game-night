import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// `leading` / `trailing` (optional) render extra content — e.g. GamePicker's
// filter chips + a divider — before or after the category chips, inside the
// same scroll row. Category chips come first on the Games page so ALL is
// never the chip cut off at the edge.
export default function CategoryTabs({ categories, active, onSelect, leading, trailing }) {
  const activeRef = useRef(null)
  const rowRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: true })

  // A restored/persisted active chip (M-82) can land off-screen — scroll it
  // into view on mount so the current selection is never hidden.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [])

  // Edge fades only where there is more to scroll to, so the first chip
  // never sits under a fade at rest.
  const updateEdges = () => {
    const el = rowRef.current
    if (!el) return
    const left = el.scrollLeft > 4
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setEdges(e => (e.left === left && e.right === right ? e : { left, right }))
  }
  useEffect(() => {
    updateEdges()
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [])

  return (
    <div className="relative">
      <div
        ref={rowRef}
        onScroll={updateEdges}
        className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar snap-x snap-proximity scroll-px-4 pb-1"
      >
        {leading}
        {categories.map(({ id, label, count }) => (
          <button
            key={id}
            ref={active === id ? activeRef : undefined}
            onClick={() => onSelect(id)}
            aria-pressed={active === id}
            className={cn(
              'min-h-11 px-3.5 shrink-0 snap-start whitespace-nowrap inline-flex items-center justify-center rounded border font-pixel text-[9px] tracking-wider transition-all active:scale-95',
              active === id
                ? 'border-retro-cta text-retro-cta shadow-neon-cta bg-retro-tint-cta'
                : 'border-retro-border text-retro-dim hover:border-retro-p1/50 hover:text-retro-text bg-retro-card',
            )}
          >
            {label}
            {count != null && <>{' '}<span className="font-mono text-[10px] opacity-70 ml-1">{count}</span></>}
          </button>
        ))}
        {trailing}
      </div>
      {edges.left && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-1 w-8 bg-gradient-to-r from-retro-bg to-transparent" aria-hidden="true" />
      )}
      {edges.right && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-retro-bg to-transparent" aria-hidden="true" />
      )}
    </div>
  )
}
