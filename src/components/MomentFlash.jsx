import { useEffect } from 'react'
import { cn } from '@/lib/utils'

// F-44: full-width flash for multi-act moments (extra turn / hit again) —
// the WinEffect/goal-flash precedent applied to each game's signature dopamine
// beat, which previously got only a one-line banner or a toast. Renders a
// brief screen flash + big pixel text, auto-dismisses after `duration`, never
// intercepts input. Pair with `sounds.again()` for the dedicated audio.
const TONES = {
  win: { color: 'rgb(var(--c-win))', text: 'text-retro-win', glow: 'text-glow-win' },
  cta: { color: 'rgb(var(--c-cta))', text: 'text-retro-cta', glow: 'text-glow-cta' },
  p1:  { color: 'rgb(var(--c-p1))',  text: 'text-retro-p1',  glow: 'text-glow-p1' },
  p2:  { color: 'rgb(var(--c-p2))',  text: 'text-retro-p2',  glow: 'text-glow-p2' },
}

export default function MomentFlash({ text, tone = 'win', onDone, duration = 1000, className = '' }) {
  useEffect(() => {
    if (!text) return undefined
    const t = setTimeout(() => onDone?.(), duration)
    return () => clearTimeout(t)
  }, [text, onDone, duration])

  if (!text) return null
  const tone0 = TONES[tone] ?? TONES.win

  return (
    <div className={cn('fixed inset-0 z-40 pointer-events-none flex items-center justify-center overflow-hidden', className)}>
      <div
        className="absolute inset-0"
        style={{ background: tone0.color, animation: 'win-flash 0.9s ease-out forwards' }}
      />
      <p
        className={cn('font-pixel text-xl tracking-widest text-center px-4', tone0.text, tone0.glow)}
        style={{ animation: 'moment-pop 1s ease-out both' }}
      >
        {text}
      </p>
    </div>
  )
}
