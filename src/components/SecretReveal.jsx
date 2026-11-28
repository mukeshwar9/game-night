import { useCallback, useEffect, useReducer, useRef } from 'react'
import useGameKeys from '../hooks/useGameKeys'
import {
  startReveal, pressDown, pressUp, confirmSeen, progressLabel, tintFor,
} from '../lib/secretRevealLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Pass-the-phone secret reveal. One phone goes round the table: each player
// gets a full-colour "pass to NAME" screen, holds the button to read their
// private secret (it hides the moment they let go), taps GOT IT, and the phone
// moves on. Generic — the caller decides what a secret looks like.
//
// Props:
//   players       [{ id, name }] in seating order
//   renderSecret  (player, index) => node, shown only while the button is held
//   onDone        called once after the last player taps GOT IT
//   holdLabel     text on the reveal button (default HOLD TO REVEAL)
//
// Seat colours come from the --c-p1..p4 theme tokens (static class names so
// Tailwind keeps them); the seat number and name stay on screen, so a colour
// repeating on a 5+ seat table is never the only cue.

const TINT = {
  p1: { panel: 'bg-retro-p1', ink: 'text-retro-bg', button: 'border-retro-bg text-retro-bg' },
  p2: { panel: 'bg-retro-p2', ink: 'text-retro-bg', button: 'border-retro-bg text-retro-bg' },
  p3: { panel: 'bg-retro-p3', ink: 'text-retro-bg', button: 'border-retro-bg text-retro-bg' },
  p4: { panel: 'bg-retro-p4', ink: 'text-retro-bg', button: 'border-retro-bg text-retro-bg' },
}

function reducer(state, action) {
  if (action.type === 'down') return pressDown(state)
  if (action.type === 'up') return pressUp(state)
  if (action.type === 'ok') return confirmSeen(state)
  return state
}

export default function SecretReveal({ players, renderSecret, onDone, holdLabel = 'HOLD TO REVEAL' }) {
  const [state, dispatch] = useReducer(reducer, players.length, startReveal)
  const doneFired = useRef(false)
  const player = players[Math.min(state.index, players.length - 1)]
  const tint = TINT[tintFor(state.index)]
  const holding = state.phase === 'hold'

  const down = useCallback(() => { sounds.touch(); dispatch({ type: 'down' }) }, [])
  const up = useCallback(() => dispatch({ type: 'up' }), [])
  const ok = useCallback(() => {
    sounds.hint()
    dispatch({ type: 'ok' })
  }, [])

  // The sequence finishing is reported once; the parent swaps the screen.
  useEffect(() => {
    if (!state.done || doneFired.current) return
    doneFired.current = true
    onDone?.()
  }, [state.done, onDone])

  // Space/Enter hold the button for keyboard players; GOT IT on its own key.
  useGameKeys((e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.repeat) return true
      dispatch({ type: 'down' })
      const release = (ev) => {
        if (ev.key !== ' ' && ev.key !== 'Enter') return
        window.removeEventListener('keyup', release)
        dispatch({ type: 'up' })
      }
      window.addEventListener('keyup', release)
      return true
    }
    return false
  }, { enabled: !state.done })

  if (state.done) return null

  return (
    <section
      aria-label={`Secret for ${player.name}`}
      className={cn(
        'min-h-[70dvh] rounded-lg flex flex-col items-center justify-between gap-4 p-5 text-center select-none',
        tint.panel, tint.ink,
      )}
    >
      <p className="font-pixel text-[9px] tracking-widest opacity-80">{progressLabel(state)}</p>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 w-full">
        {holding ? (
          <div className="w-full space-y-2" aria-live="polite">
            <p className="font-pixel text-[9px] tracking-widest opacity-80">{player.name} · SECRET</p>
            <div className="rounded-lg bg-retro-bg text-retro-text p-4 w-full">
              {renderSecret(player, state.index)}
            </div>
          </div>
        ) : state.viewed ? (
          <>
            <p className="font-pixel text-sm tracking-wider">HIDDEN</p>
            <p className="font-mono text-xs opacity-80">Tap GOT IT, then pass the phone on.</p>
          </>
        ) : (
          <>
            <p className="font-pixel text-[10px] tracking-widest opacity-80">PASS THE PHONE TO</p>
            <p className="font-pixel text-xl break-words max-w-full">{player.name}</p>
            <p className="font-mono text-xs opacity-80">Everyone else, look away.</p>
          </>
        )}
      </div>

      <div className="w-full space-y-2">
        <button
          type="button"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); down() }}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
          className={cn(
            'w-full min-h-14 rounded border-2 font-pixel text-xs tracking-wider transition-transform press',
            tint.button, holding && 'bg-retro-bg !text-retro-text !border-retro-bg',
          )}
        >
          {holding ? 'RELEASE TO HIDE' : holdLabel}
        </button>
        <button
          type="button"
          onClick={ok}
          disabled={!state.viewed || holding}
          className="w-full min-h-12 rounded bg-retro-bg text-retro-text font-pixel text-xs tracking-wider press disabled:opacity-40"
        >
          GOT IT · PASS IT ON
        </button>
      </div>
    </section>
  )
}
