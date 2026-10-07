import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import useModalHistory from '../hooks/useModalHistory'
import { fitScale, unionBox } from '../lib/focusLogic'

// Focus mode: the game alone on the screen. A full-screen stage (above the
// page, under proposals, win effects and sheets) with a one-line HUD on top,
// the board scaled to fill what is left, and the round's status and actions
// underneath. Back, Esc and the ✕ all leave it. The board itself is untouched:
// FitToStage lays it out at its normal width and scales the result, so any
// board that renders in the page renders here.

// Never lay the board out wider than the room column's widest setting
// (max-w-md): boards size themselves from their container width.
const MAX_LAYOUT_W = 448

function FitToStage({ children }) {
  const stageRef = useRef(null)
  const contentRef = useRef(null)
  const [fit, setFit] = useState({ scale: 1, layoutW: 0, box: null })

  useLayoutEffect(() => {
    const stage = stageRef.current
    const content = contentRef.current
    if (!stage || !content) return undefined
    const measure = () => {
      const cs = getComputedStyle(stage)
      const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const layoutW = Math.min(w, MAX_LAYOUT_W)
      if (content.style.width !== `${layoutW}px`) content.style.width = `${layoutW}px`
      const box = unionBox([...content.children].map(el => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight })))
      const scale = fitScale({ w, h }, { w: box.width, h: box.height })
      setFit(f => (f.scale === scale && f.layoutW === layoutW && f.box && f.box.left === box.left && f.box.top === box.top && f.box.width === box.width && f.box.height === box.height
        ? f
        : { scale, layoutW, box }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    ro.observe(content)
    // Boards load lazily and grow controls (a SWAP button, a hint line).
    const mo = new MutationObserver(measure)
    mo.observe(content, { childList: true, subtree: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])

  const { scale, box } = fit
  return (
    <div ref={stageRef} className="flex-1 min-h-0 relative overflow-hidden flex items-center justify-center p-2">
      <div
        className="relative"
        style={box ? { width: box.width * scale, height: box.height * scale } : { width: 0, height: 0 }}
      >
        <div
          ref={contentRef}
          data-focus-content
          className="absolute"
          style={{
            left: box ? -box.left * scale : 0,
            top: box ? -box.top * scale : 0,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            visibility: box ? undefined : 'hidden',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export default function FocusStage({ label, onExit, hud, footer, children }) {
  useModalHistory(onExit)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"]:not([data-focus-stage])')) onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onExit])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} — focus mode`}
      data-focus-stage
      className={cn(
        'fixed inset-0 z-40 flex flex-col bg-retro-bg',
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
      )}
    >
      <div className="shrink-0 flex items-center gap-2 px-2 min-h-12 border-b border-retro-border/60">
        <button
          type="button"
          onClick={onExit}
          aria-label="Leave focus mode"
          title="Leave focus mode"
          className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center text-retro-dim hover:text-retro-text transition-colors press rounded"
        >
          <FocusIcon exit />
        </button>
        <div className="flex-1 min-w-0">{hud}</div>
      </div>
      <FitToStage>{children}</FitToStage>
      {footer && <div className="shrink-0 px-3 pb-2 space-y-2 max-h-[45%] overflow-y-auto">{footer}</div>}
    </div>,
    document.body,
  )
}

// Four corner brackets: pointing out to enter, in to leave.
export function FocusIcon({ exit = false, size = 16 }) {
  const d = exit
    ? 'M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6'
    : 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function FocusButton({ onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Focus mode: the game full screen"
      title="Focus mode"
      data-testid="focus-enter"
      className={cn('text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 rounded', className)}
    >
      <FocusIcon />
    </button>
  )
}

// One seat in the HUD: symbol, name, score; lit while it is that seat's turn.
// data-seat-card makes reactions and chat lines float from it.
export function FocusSeat({ symbol, name, score, active, isMe }) {
  const p1 = symbol === 'X'
  return (
    <div
      data-seat-card={symbol}
      className={cn(
        'min-w-0 flex-1 flex items-center gap-1.5 px-2 py-1 rounded border transition-colors',
        active ? (p1 ? 'border-retro-p1 bg-retro-tint-p1/60' : 'border-retro-p2 bg-retro-tint-p2/60') : 'border-retro-border',
      )}
    >
      <span className={cn('font-pixel text-[10px]', p1 ? 'text-retro-p1' : 'text-retro-p2')} aria-hidden="true">{symbol}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-retro-text">
        {name || symbol}{isMe && <span className="text-retro-dim"> · YOU</span>}
      </span>
      {score != null && <span className="font-pixel text-[10px] text-retro-text tabular-nums">{score}</span>}
    </div>
  )
}
