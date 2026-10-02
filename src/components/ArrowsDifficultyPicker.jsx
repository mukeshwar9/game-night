import { useState } from 'react'
import { ref, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { ARROWS_DIFFICULTIES, ARROWS_DIFFICULTY_INFO, getArrowsDifficulty } from '../lib/arrowsLogic'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'

// Host-only Arrows race difficulty, shown in the waiting room and again
// between matches. Writes `arrowsDifficulty` on the room; the guest sees the
// same pick, read-only.
export default function ArrowsDifficultyPicker({ gameId, game, isHost }) {
  const current = getArrowsDifficulty(game?.arrowsDifficulty)
  const [busy, run] = useBusy()
  const [pending, setPending] = useState(null)

  const pick = (id) => {
    if (id === current) return
    setPending(id)
    run(
      () => update(ref(db, `games/${gameId}`), { arrowsDifficulty: id }),
      () => toast.error("COULDN'T SET THE DIFFICULTY — TRY AGAIN"),
    ).finally(() => setPending(null))
  }

  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-2 text-center">
      <p className="font-pixel text-[9px] text-retro-dim">DIFFICULTY</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Arrows difficulty">
        {ARROWS_DIFFICULTIES.map((id) => (
          <button
            key={id}
            disabled={!isHost || busy}
            onClick={() => pick(id)}
            aria-pressed={current === id}
            className={cn(
              'min-h-11 px-2 py-1.5 font-pixel rounded border-2 transition-all active:scale-95',
              current === id
                ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
                : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
              (!isHost || busy) && 'opacity-60 cursor-not-allowed',
            )}
          >
            <span className="block text-[10px]">{pending === id ? 'SETTING…' : ARROWS_DIFFICULTY_INFO[id].label}</span>
            <span className="block mt-1 text-[8px] leading-snug opacity-80">{ARROWS_DIFFICULTY_INFO[id].blurb}</span>
          </button>
        ))}
      </div>
      {!isHost && <p className="font-pixel text-[8px] text-retro-dim/70">HOST PICKS THE DIFFICULTY</p>}
    </div>
  )
}
