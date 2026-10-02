import { useState } from 'react'
import { cn } from '@/lib/utils'
import usePhaseClock from '../../hooks/usePhaseClock'
import { kimStudyMs } from '../../lib/kimsGameLogic'
import { pairsFaceName } from '../../lib/pairsFaces'
import { sounds } from '../../lib/sounds'
import { FaceCard } from '../FaceSprite'
import { CountdownCover, PhaseBar, BoardHint } from './MemoryParts'

const COVER_MS = 800

// Lost & Found (Kim's Game) board for one level: study the tray, a cloth slides over
// it, then the tray comes back shuffled with one object gone — pick it from six.
export default function KimsGameBoard({ deal, level, startAt, clock, disabled, answer = false, revealOnFail = true, onDone, onFail }) {
  const studyMs = kimStudyMs(level)
  const { phase, left } = usePhaseClock(startAt, [['study', studyMs], ['cover', COVER_MS]], clock)
  const [chosen, setChosen] = useState(null)
  const canChoose = phase === 'recall' && !disabled && chosen == null && !answer
  const right = chosen === deal.missing
  const tray = phase === 'recall' ? deal.after : deal.tray
  const cols = Math.min(5, Math.ceil(Math.sqrt(deal.tray.length + 1)))

  const choose = (face) => {
    if (!canChoose) return
    setChosen(face)
    if (face === deal.missing) { sounds.go(); onDone?.() } else { sounds.miss(); onFail?.({ face }) }
  }

  const reveal = answer || (revealOnFail && chosen != null && !right)
  const hint = chosen != null && !right && !reveal ? 'NOT THAT ONE'
    : reveal ? `THE ${pairsFaceName(deal.missing).toUpperCase()} WAS MISSING`
    : phase === 'study' ? `REMEMBER ALL ${deal.tray.length}`
      : phase === 'cover' ? '…'
        : right ? 'FOUND IT!' : disabled ? '' : 'WHICH ONE IS MISSING?'

  return (
    <div className="w-full max-w-sm mx-auto space-y-3">
      <PhaseBar left={phase === 'study' ? left : null} total={studyMs} />
      <div className="relative bg-retro-surface border-2 border-retro-border rounded p-2.5 overflow-hidden">
        {phase === 'countdown' && <CountdownCover msLeft={left} label={`LEVEL ${level} · ${deal.tray.length} OBJECTS`} />}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {tray.map(face => <FaceCard key={face} face={face} className="aspect-square p-[8%]" />)}
        </div>
        {/* The cloth: slides down over the tray between study and recall. */}
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 bg-retro-cta transition-transform duration-500 ease-out motion-reduce:transition-none',
            'bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgb(var(--c-card)/0.18)_6px_9px)]',
            phase === 'cover' ? 'translate-y-0' : '-translate-y-full',
          )}
        />
      </div>
      {phase === 'recall' && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {deal.choices.map(face => {
              const isMissing = face === deal.missing
              return (
                <button
                  key={face}
                  type="button"
                  disabled={!canChoose}
                  onClick={() => choose(face)}
                  aria-label={pairsFaceName(face)}
                  className={cn(
                    'aspect-square rounded-lg border-2 border-retro-border bg-retro-card p-1.5 transition-transform',
                    canChoose && 'cursor-pointer hover:border-retro-p1/60 active:scale-95',
                    reveal && isMissing && 'outline outline-2 outline-offset-2 outline-retro-win',
                    chosen === face && !right && 'border-retro-danger pairs-mismatch-shake',
                    chosen === face && right && 'border-retro-win vm-found-pop',
                  )}
                >
                  <FaceCard face={face} className="w-full h-full" />
                </button>
              )
            })}
          </div>
        </div>
      )}
      <BoardHint tone={reveal ? 'danger' : right ? 'win' : phase === 'study' ? 'cta' : 'text'}>{hint}</BoardHint>
    </div>
  )
}
