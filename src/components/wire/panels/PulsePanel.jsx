// WIRE CROSSED Tech panel: PULSE. A lamp flashes a colour pattern, pauses and
// repeats; the letter of every flash shows under the lamp, so colour is never
// the only cue. With reduced motion the lamp stays a static dark bulb and only
// the letter strip ticks. The dial steps through the codebook frequencies (◀ ▶)
// and TX sends the one on the display. The timeline comes from the server clock
// (flashAt), so the Tech and the Handbook reader see the same loop.
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import useMotionPref from '../../../hooks/useMotionPref'
import { getServerNow } from '../../../hooks/useServerClock'
import { COLOR_LETTERS, COLOR_NAMES } from '../../../lib/wireLogic'
import { flashAt } from '../../../lib/wire/modules/pulse'
import { wireColor } from '../colors'

const TICK_MS = 50

const sameFrame = (a, b) => a.pause === b.pause && a.on === b.on && a.index === b.index

export default function PulsePanel({ module, wire, index, onAction, disabled, busy }) {
  const { flashes, freqs } = module.device
  const { reduced } = useMotionPref()
  const armedAt = wire?.armedAt
  const [frame, setFrame] = useState(() => flashAt(module, armedAt, getServerNow()))
  const [dial, setDial] = useState(0)

  useEffect(() => {
    const tick = () => {
      const next = flashAt(module, armedAt, getServerNow())
      setFrame(prev => (sameFrame(prev, next) ? prev : next))
    }
    tick()
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [module, armedAt])

  const letter = (f) => COLOR_LETTERS[f.color] + (f.long ? '—' : '')
  const shown = frame.pause ? [] : flashes.slice(0, frame.index + 1)
  const lit = frame.on && !reduced
  const step = (d) => setDial(v => (v + d + freqs.length) % freqs.length)
  const freq = freqs[dial]
  const current = frame.on ? `${COLOR_NAMES[frame.color].toLowerCase()}${frame.long ? ' long' : ''}` : ''

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-20 h-20 rounded-full border-4 border-retro-border transition-colors"
        style={{
          background: lit ? wireColor(frame.color) : 'rgb(var(--c-bg))',
          boxShadow: lit ? `0 0 24px 6px rgb(var(--wire-${frame.color}) / 0.55)` : 'none',
        }}
        role="img"
        aria-label={`Pulse lamp, ${frame.pause ? 'pause' : frame.on ? current : 'dark'}`}
      />
      <div
        className="flex items-center justify-center gap-1.5 min-h-6 font-pixel text-[14px] text-retro-text"
        aria-hidden="true"
        data-testid="pulse-strip"
      >
        {frame.pause ? <span className="text-[8px] text-retro-dim">PAUSE · NEXT FLASH STARTS THE PATTERN</span> : shown.map((f, k) => (
          <span key={k} className={cn(k === frame.index && frame.on ? 'text-retro-cta' : 'text-retro-text')}>{letter(f)}</span>
        ))}
      </div>
      <p className="sr-only" aria-live="polite" data-testid="pulse-live">{current}</p>

      <div className="flex items-center justify-center gap-2" role="group" aria-label="Frequency dial">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => step(-1)}
          aria-label="Previous frequency"
          className="min-h-11 min-w-11 rounded border-2 border-retro-border bg-retro-deep font-pixel text-[12px] text-retro-text hover:border-retro-cta disabled:opacity-40"
        >
          ◀
        </button>
        <output
          className="min-w-[7.5rem] text-center rounded border-2 border-retro-border bg-retro-deep px-2 py-2 font-pixel text-[12px] text-retro-cta"
          aria-label={`Dial at ${freq} megahertz, ${dial + 1} of ${freqs.length}`}
        >
          {freq} MHz
        </output>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => step(1)}
          aria-label="Next frequency"
          className="min-h-11 min-w-11 rounded border-2 border-retro-border bg-retro-deep font-pixel text-[12px] text-retro-text hover:border-retro-cta disabled:opacity-40"
        >
          ▶
        </button>
      </div>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => onAction({ mod: index, kind: 'tx', freq })}
        className="min-h-11 px-6 rounded border-2 border-retro-border bg-retro-deep font-pixel text-[10px] text-retro-text hover:border-retro-cta disabled:opacity-40"
      >
        {busy ? 'TRANSMITTING…' : 'TX'}
      </button>
      <p className="font-pixel text-[8px] text-retro-dim text-center" aria-live="polite">
        {busy ? 'TRANSMITTING…' : 'READ THE LETTERS AFTER THE PAUSE · DIAL IT IN · TX'}
      </p>
      {(module.tier ?? 1) >= 3 && (
        <p className="font-pixel text-[7px] text-retro-dim text-center">
          A LONG FLASH SHOWS A DASH · READ IT TWICE
        </p>
      )}
    </div>
  )
}
