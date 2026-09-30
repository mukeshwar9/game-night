// WIRE CROSSED Tech panel: CALL SIGN. A row of letter wheels; ▲/▼ turn a wheel
// and TRANSMIT sends the word the wheels show. Wheel positions are local
// state; only TRANSMIT writes. Each wheel's buttons are focusable and the
// arrow keys turn a wheel only while focus is inside it.
import { useState } from 'react'
import { cn } from '@/lib/utils'

export default function CallSignPanel({ module, index, onAction, disabled, busy }) {
  const { wheels } = module.device
  const [pos, setPos] = useState(() => wheels.map(() => 0))
  const letterAt = (k) => wheels[k][pos[k] % wheels[k].length]
  const word = wheels.map((_, k) => letterAt(k)).join('')

  const turn = (k, by) => setPos(cur => cur.map((p, j) => (j === k ? (p + by + wheels[k].length) % wheels[k].length : p)))
  const onKeyDown = (k) => (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); turn(k, 1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); turn(k, -1) }
  }
  const transmit = () => onAction({ mod: index, kind: 'transmit', word })

  const arrow = 'min-h-11 w-full rounded border-2 border-retro-border bg-retro-deep font-pixel text-[10px] text-retro-text hover:border-retro-cta disabled:opacity-40'

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-2 justify-center" role="group" aria-label={`Call sign, ${wheels.length} wheels`}>
        {wheels.map((_, k) => (
          <div
            key={k}
            role="group"
            aria-label={`Wheel ${k + 1}, letter ${letterAt(k)}`}
            onKeyDown={onKeyDown(k)}
            className="flex flex-col items-stretch gap-1 w-11"
          >
            <button type="button" disabled={disabled || busy} aria-label={`Wheel ${k + 1} up`} onClick={() => turn(k, 1)} className={arrow}>▲</button>
            <div
              aria-hidden="true"
              className={cn('flex items-center justify-center h-14 rounded border-2 border-retro-cta bg-retro-deep font-pixel text-[20px] text-retro-cta', disabled && 'opacity-60')}
            >
              {letterAt(k)}
            </div>
            <button type="button" disabled={disabled || busy} aria-label={`Wheel ${k + 1} down`} onClick={() => turn(k, -1)} className={arrow}>▼</button>
          </div>
        ))}
      </div>
      <p className="font-pixel text-[8px] text-retro-dim text-center" aria-live="polite">
        {busy ? 'TRANSMITTING…' : `SET THE WHEELS · ${word}`}
      </p>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={transmit}
        className="min-h-11 px-6 rounded border-2 border-retro-cta bg-retro-deep font-pixel text-[10px] text-retro-cta shadow-neon-cta hover:bg-retro-tint-cta disabled:opacity-40"
      >
        {busy ? 'TRANSMITTING…' : 'TRANSMIT'}
      </button>
    </div>
  )
}
