// WIRE CROSSED Tech panel: SWITCHBOARD. A row of toggles, each with its light
// (colour chip plus letter, or a dash when dark) above and its position (▲/▼)
// below. Tapping a locked switch only rattles it locally; nothing is sent, and
// nothing is a strike. Flipping into a short circuit is a strike (judged by
// applyWireAction).
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { COLOR_LETTERS, COLOR_NAMES, isLocked, switchState } from '../../../lib/wireLogic'
import { wireColor } from '../colors'

const RATTLE_MS = 400

function LockIcon() {
  return (
    <svg viewBox="0 0 12 12" className="w-3 h-3" aria-hidden="true" style={{ fill: 'currentColor' }}>
      <path d="M3 5V3.5a3 3 0 0 1 6 0V5h1v6H2V5h1Zm1.5 0h3V3.5a1.5 1.5 0 0 0-3 0V5Z" />
    </svg>
  )
}

export default function SwitchPanel({ module, wire, index, onAction, disabled, busy }) {
  const { lights } = module.device
  const state = switchState(wire, index, module)
  const [rattle, setRattle] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const flip = (sw) => {
    if (isLocked(module, state, sw)) {
      clearTimeout(timer.current)
      setRattle(sw)
      timer.current = setTimeout(() => setRattle(null), RATTLE_MS)
      return
    }
    onAction({ mod: index, kind: 'flip', sw })
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-stretch justify-center gap-2 w-full" role="group" aria-label={`Switchboard, ${lights.length} switches`}>
        {lights.map((light, sw) => {
          const up = !!(state >> sw & 1)
          const locked = isLocked(module, state, sw)
          const name = light ? COLOR_NAMES[light].toLowerCase() : 'dark'
          return (
            <button
              key={sw}
              type="button"
              disabled={disabled || busy}
              aria-label={`Switch ${sw + 1}, light ${name}, ${up ? 'up' : 'down'}${locked ? ', locked' : ''}`}
              onClick={() => flip(sw)}
              className={cn(
                'flex-1 max-w-[4.5rem] min-h-28 rounded border-2 bg-retro-deep flex flex-col items-center justify-between gap-1 py-2 font-pixel text-retro-text hover:border-retro-cta disabled:opacity-40',
                locked ? 'border-retro-border text-retro-dim' : 'border-retro-border',
                rattle === sw && 'wire-rattle border-retro-p1',
              )}
            >
              <span className="flex flex-col items-center gap-1 text-[8px]">
                <span
                  className="inline-block w-4 h-4 rounded-full border border-retro-border"
                  style={{ background: light ? wireColor(light) : 'rgb(var(--c-bg))' }}
                  aria-hidden="true"
                />
                <span aria-hidden="true">{light ? COLOR_LETTERS[light] : '—'}</span>
              </span>
              <span className="text-[14px] leading-none" aria-hidden="true">{up ? '▲' : '▼'}</span>
              <span className="text-[7px] flex items-center gap-1 h-3" aria-hidden="true">
                {sw + 1}
                {locked && <LockIcon />}
              </span>
            </button>
          )
        })}
      </div>
      <p className="font-pixel text-[8px] text-retro-dim text-center min-h-3" aria-live="polite">
        {busy ? 'FLIPPING…' : rattle != null ? 'LOCKED' : 'TAP A SWITCH TO FLIP IT'}
      </p>
      {(module.tier ?? 1) >= 2 && (
        <p className="font-pixel text-[7px] text-retro-dim text-center">
          SOME BOARDS SHORT-CIRCUIT · A SHORT IS A STRIKE
        </p>
      )}
    </div>
  )
}
