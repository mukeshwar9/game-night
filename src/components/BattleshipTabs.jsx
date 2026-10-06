import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

// TARGET / FLEET switch for the single-grid phone layout. `alert` marks the
// grid that wants attention (your shot on TARGET).
export default function BattleshipTabs({ view, onView, targetAlert = false }) {
  // Switching grids (by hand, or the game switching for you when a phase or
  // turn changes) lands with the tab bar and its grid at the top of the
  // screen, so the page is never left scrolled to where READY used to be.
  const barRef = useRef(null)
  useEffect(() => {
    barRef.current?.scrollIntoView?.({ block: 'start' })
  }, [view])
  const tabs = [
    { id: 'target', label: 'TARGET', alert: targetAlert },
    { id: 'fleet', label: 'FLEET', alert: false },
  ]
  return (
    <div ref={barRef} role="tablist" aria-label="Battleship grid" className="grid grid-cols-2 gap-2 scroll-mt-20">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={view === t.id}
          onClick={() => onView(t.id)}
          className={cn(
            'min-h-11 rounded border-2 font-pixel text-[10px] tracking-widest transition active:scale-95',
            view === t.id
              ? 'border-retro-cta text-retro-cta bg-retro-tint-cta shadow-neon-cta'
              : 'border-retro-border text-retro-dim',
          )}
        >
          {t.label}{t.alert && view !== t.id ? ' ●' : ''}
        </button>
      ))}
    </div>
  )
}
