// WIRE CROSSED Tech panel: WIRES. Tier III has striped wires, drawn as
// diagonal bands of both colours with both letter tags.
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { COLOR_LETTERS, COLOR_NAMES, isCut, isStriped } from '../../../lib/wireLogic'
import { wireColor } from '../colors'

const ROMAN = { 1: 'I', 2: 'II', 3: 'III' }

/** The paint of one wire: a colour, or two colours in diagonal bands. */
const wirePaint = (w) => (isStriped(w)
  ? `repeating-linear-gradient(45deg, ${wireColor(w[0])} 0 6px, ${wireColor(w[1])} 6px 12px)`
  : wireColor(w))
const wireTags = (w) => (isStriped(w) ? w.map(c => COLOR_LETTERS[c]).join('/') : COLOR_LETTERS[w])
const wireWords = (w) => (isStriped(w) ? `striped ${w.map(c => COLOR_NAMES[c]).join(' and ')}` : COLOR_NAMES[w])

export default function WiresPanel({ module, wire, index, onAction, disabled, busy }) {
  const [picked, setSelected] = useState(null)
  // A wire that just got cut drops out of the selection.
  const selected = picked != null && !isCut(wire, index, picked) ? picked : null
  const wires = module.device.wires
  const cut = (w) => onAction({ mod: index, kind: 'cut', wire: w })
  return (
    <div className="space-y-3">
      <div className="space-y-2" role="group" aria-label={`Wires, tier ${ROMAN[module.tier] ?? 'I'}`}>
        {wires.map((color, w) => {
          const gone = isCut(wire, index, w)
          const isPicked = selected === w && !gone
          const paint = wirePaint(color)
          return (
            <button
              key={w}
              type="button"
              disabled={disabled || gone}
              onClick={() => setSelected(w)}
              aria-pressed={isPicked}
              aria-label={`Wire ${w + 1}, ${wireWords(color)}${gone ? ', cut' : ''}`}
              className={cn(
                'w-full min-h-11 flex items-center gap-2 px-2 rounded border-2 bg-retro-deep',
                isPicked ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border',
                gone && 'opacity-60',
              )}
            >
              <span className="font-pixel text-[9px] text-retro-dim w-4 text-right">{w + 1}</span>
              <span className="w-2.5 h-5 rounded-sm bg-retro-structure" aria-hidden="true" />
              <span className="relative flex-1 h-3 flex items-center" aria-hidden="true">
                {gone ? (
                  <>
                    <span className="h-3 w-[42%] rounded-l-full border border-retro-border" style={{ background: paint }} />
                    <span className="flex-1" />
                    <span className="h-3 w-[42%] rounded-r-full border border-retro-border" style={{ background: paint }} />
                  </>
                ) : (
                  <span className="h-3 w-full rounded-full border border-retro-border" style={{ background: paint }} />
                )}
              </span>
              <span className="w-2.5 h-5 rounded-sm bg-retro-structure" aria-hidden="true" />
              <span className="font-pixel text-[9px] min-w-4 text-retro-text">{wireTags(color)}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        disabled={disabled || busy || selected == null}
        onClick={() => cut(selected)}
        className="w-full min-h-11 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-wider hover:shadow-neon-cta disabled:opacity-40"
      >
        {busy ? 'CUTTING…' : selected == null ? 'PICK A WIRE' : `CUT WIRE ${selected + 1}`}
      </button>
    </div>
  )
}
