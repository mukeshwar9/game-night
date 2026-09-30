// WIRE CROSSED Tech panel: LEVER. Tap, or hold and let go. Tier III swaps the
// strip after STRIP_SWITCH_MS of holding; the strip label changes text, never
// colour alone.
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { COLOR_NAMES, STRIP_SWITCH_MS, TAP_MAX_MS } from '../../../lib/wireLogic'
import { ColorTag } from '../ColorTag'
import { wireColor } from '../colors'

export default function LeverPanel({ module, index, onAction, disabled, clock }) {
  const { color, label, strip, strip2 } = module.device
  const [holding, setHolding] = useState(false)
  // 0 = strip off, 1 = first strip showing, 2 = second strip showing (tier III).
  const [stage, setStage] = useState(0)
  const startRef = useRef(0)
  const timers = useRef([])
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clearTimers, [])

  const press = () => {
    if (disabled || holding) return
    startRef.current = performance.now()
    setHolding(true)
    timers.current = [setTimeout(() => setStage(1), TAP_MAX_MS)]
    if (strip2) timers.current.push(setTimeout(() => setStage(2), STRIP_SWITCH_MS))
  }
  const release = (cancel = false) => {
    if (!holding) return
    clearTimers()
    const held = Math.round(performance.now() - startRef.current)
    setHolding(false)
    setStage(0)
    if (cancel) return
    onAction(held < TAP_MAX_MS
      ? { mod: index, kind: 'tap' }
      : { mod: index, kind: 'release', clock: clock(), held })
  }

  const shown = stage === 2 ? strip2 : stage === 1 ? strip : null
  const stripText = shown ? `${COLOR_NAMES[shown]} STRIP${strip2 && stage === 2 ? ' · CHANGED' : ''}` : null

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3 font-pixel text-[9px] text-retro-dim">
        <span>LEVER</span><ColorTag color={color} className="text-retro-text" />
      </div>
      <div
        className="w-full h-6 rounded border-2 border-retro-border bg-retro-deep flex items-center justify-center"
        aria-live="polite"
      >
        {shown ? (
          <span className="w-full h-full flex items-center justify-center font-pixel text-[9px]" style={{ background: wireColor(shown) }}>
            <span className="px-1.5 rounded bg-retro-card text-retro-text">{stripText}</span>
          </span>
        ) : (
          <span className="font-pixel text-[8px] text-retro-dim">{holding ? '…' : 'STRIP OFF'}</span>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); press() }}
        onPointerUp={() => release(false)}
        onPointerCancel={() => release(true)}
        onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press() } }}
        onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(false) } }}
        onContextMenu={e => e.preventDefault()}
        aria-label={`Lever reading ${label}. Tap, or hold and release${strip2 ? '. The strip changes if held' : ''}`}
        className={cn(
          'w-40 h-40 rounded-full border-4 flex flex-col items-center justify-center gap-2 select-none touch-none disabled:opacity-40',
          holding ? 'scale-95 border-retro-cta shadow-neon-cta' : 'border-retro-border',
        )}
        style={{ background: wireColor(color), WebkitTouchCallout: 'none' }}
      >
        <span className="px-2 py-1 rounded bg-retro-card text-retro-text font-pixel text-[12px] tracking-widest">{label}</span>
        <span className="px-1.5 rounded bg-retro-card text-retro-dim font-pixel text-[7px]">{holding ? 'HOLDING' : 'TAP OR HOLD'}</span>
      </button>
    </div>
  )
}
