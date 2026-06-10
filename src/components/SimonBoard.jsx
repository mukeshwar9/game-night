import { cn } from '@/lib/utils'
import { sounds } from '../lib/sounds'

// Static classes per pad — must be complete strings for Tailwind's scanner
const PAD = [
  {
    active: 'bg-retro-p1 shadow-neon-p1 border-retro-p1',
    dim:    'bg-retro-tint-p1 border-retro-p1/30',
    dot:    'bg-retro-p1',
    dotGlow:'shadow-neon-p1',
  },
  {
    active: 'bg-retro-p2 shadow-neon-p2 border-retro-p2',
    dim:    'bg-retro-tint-p2 border-retro-p2/30',
    dot:    'bg-retro-p2',
    dotGlow:'shadow-neon-p2',
  },
  {
    active: 'bg-retro-cta shadow-neon-cta border-retro-cta',
    dim:    'bg-retro-tint-cta border-retro-cta/30',
    dot:    'bg-retro-cta',
    dotGlow:'shadow-neon-cta',
  },
  {
    active: 'bg-retro-win shadow-neon-win border-retro-win',
    dim:    'bg-retro-win/10 border-retro-win/30',
    dot:    'bg-retro-win',
    dotGlow:'shadow-neon-win',
  },
]

export default function SimonBoard({
  onMove,
  disabled,
  simonSequence,
  simonProgress,
}) {
  const seq = simonSequence ?? []
  const progress = simonProgress ?? 0
  const isReplay = progress < seq.length

  const handlePad = (i) => {
    if (disabled) return
    sounds.simPad(i)
    onMove(i)
  }

  return (
    <div className="w-full max-w-xs mx-auto space-y-4">

      {/* Sequence strip */}
      <div className="bg-retro-surface border-2 border-retro-border rounded p-3">
        <p className="font-pixel text-[8px] text-retro-dim text-center mb-2 tracking-widest">
          SEQUENCE
        </p>
        <div className="flex flex-wrap justify-center gap-1.5 min-h-5">
          {seq.length === 0 ? (
            <span className="font-pixel text-[8px] text-retro-border self-center">NONE YET</span>
          ) : (
            seq.map((padIdx, i) => {
              const done    = i < progress
              const current = i === progress && isReplay
              const p       = PAD[padIdx]
              return (
                <div
                  key={i}
                  className={cn(
                    'w-3.5 h-3.5 rounded-sm transition-all duration-75',
                    p.dot,
                    done    && 'opacity-20',
                    current && cn('opacity-100 scale-125', p.dotGlow),
                    !done && !current && 'opacity-55',
                  )}
                />
              )
            })
          )}
          {/* Dashed placeholder for the pad the active player will add */}
          {!isReplay && (
            <div className="w-3.5 h-3.5 rounded-sm border-2 border-dashed border-retro-cta/50 animate-pulse" />
          )}
        </div>
      </div>

      {/* Phase label */}
      <p className="font-pixel text-[9px] text-center leading-relaxed">
        {isReplay ? (
          <span className="text-retro-cta text-glow-cta">
            REPLAY {progress + 1} / {seq.length}
          </span>
        ) : (
          <span className="text-retro-win text-glow-win animate-pulse">
            {disabled ? 'OPPONENT ADDING...' : 'ADD YOUR PAD'}
          </span>
        )}
      </p>

      {/* 2 × 2 pad grid */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => {
          const isTarget   = isReplay && seq[progress] === i
          const p          = PAD[i]
          const clickable  = !disabled

          return (
            <button
              key={i}
              aria-label={`simon-pad-${i}`}
              disabled={!clickable}
              onClick={() => handlePad(i)}
              className={cn(
                'aspect-square rounded-xl border-2 transition-all duration-100',
                'active:scale-95',
                isTarget
                  ? cn(p.active, 'scale-105 ring-2 ring-white/40 animate-pulse')
                  : cn(p.dim, clickable ? 'hover:opacity-90 cursor-pointer' : 'cursor-default opacity-60'),
              )}
            />
          )
        })}
      </div>

      {/* Sequence length */}
      <p className="font-pixel text-[8px] text-retro-dim text-center tracking-widest">
        LENGTH: {seq.length}
      </p>
    </div>
  )
}
