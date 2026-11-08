import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fitStage } from '../lib/updraftStageLogic'
import { FocusIcon } from './FocusStage'
import { cn } from '@/lib/utils'

// UPDRAFT's full-height stage. While `staged`, this one element turns into a
// full-screen layer (the app header and the room chrome are covered, like
// FocusFrame) and hands its children the exact box the arena should fill, so
// the tower above you fits on every phone. It stays the same element when the
// player steps out, which keeps the page's drag listener and the live climb
// untouched: only its classes change. `touchRef` is the drag area.
//
// `children(size)` gets `{ w, h, viewH }` on the stage and `null` inline (the
// arena then sizes itself from the room column).
export default function UpdraftStage({ staged, touchRef, label, children }) {
  const elRef = useRef(null)
  const [box, setBox] = useState(null)
  const setRefs = useCallback((el) => {
    elRef.current = el
    if (touchRef) touchRef.current = el
  }, [touchRef])

  useLayoutEffect(() => {
    const el = elRef.current
    if (!staged || !el) return undefined
    const measure = () => {
      const cs = getComputedStyle(el)
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      setBox(b => (b && b.w === w && b.h === h ? b : { w, h }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [staged])

  // The page behind does not scroll while the stage is up.
  useEffect(() => {
    if (!staged) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [staged])

  const fit = staged && box ? fitStage(box) : null
  const size = fit ? { w: Math.floor(fit.arenaW), h: Math.floor(fit.arenaH), viewH: fit.viewH } : null

  return (
    <div
      ref={setRefs}
      {...(staged ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': `${label} — full height`, 'data-focus-stage': '' } : {})}
      className={cn(
        'touch-none',
        staged
          ? 'fixed inset-0 z-40 flex items-center justify-center bg-retro-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
          : 'space-y-2',
      )}
    >
      {children(size)}
    </div>
  )
}

/** Inline (outside the stage): a button that puts the climb back on the full-height stage. */
export function EnterStageButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded border-2 border-retro-cta font-pixel text-[10px] text-retro-cta press"
    >
      <FocusIcon size={14} />FULL HEIGHT
    </button>
  )
}
