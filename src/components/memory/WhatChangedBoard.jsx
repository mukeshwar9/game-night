import { useState } from 'react'
import { cn } from '@/lib/utils'
import usePhaseClock from '../../hooks/usePhaseClock'
import { wcStudyMs, WC_BLANK_MS } from '../../lib/whatChangedLogic'
import { sounds } from '../../lib/sounds'
import { FaceCard } from '../FaceSprite'
import { CountdownCover, PhaseBar, BoardHint } from './MemoryParts'

// What Changed? board for one level: study the scene, it blinks out, it comes back
// with one change — tap where it changed (either end of a move counts).
// `revealOnFail` (solo) shows the answer right after a slip; duels keep it hidden
// until the level resolves, so a slipped player cannot call it out to the other.
export default function WhatChangedBoard({ deal, level, startAt, clock, disabled, answer = false, revealOnFail = true, onDone, onFail }) {
  const studyMs = wcStudyMs(level)
  const { phase, left } = usePhaseClock(startAt, [['study', studyMs], ['blank', WC_BLANK_MS]], clock)
  const [tapped, setTapped] = useState(null)
  const scene = phase === 'study' || phase === 'countdown' ? deal.before : phase === 'blank' ? null : deal.after
  const canTap = phase === 'recall' && !disabled && tapped == null && !answer
  const right = tapped != null && deal.change.cells.includes(tapped)

  const tap = (cell) => {
    if (!canTap) return
    setTapped(cell)
    if (deal.change.cells.includes(cell)) { sounds.go(); onDone?.() } else { sounds.miss(); onFail?.({ cell }) }
  }

  const reveal = answer || (revealOnFail && tapped != null && !right)
  const changeName = { move: 'SOMETHING MOVED', swap: 'SOMETHING WAS SWAPPED', gone: 'SOMETHING VANISHED' }[deal.change.type]
  const hint = tapped != null && !right && !reveal ? 'MISSED IT'
    : reveal ? `${changeName} — IT WAS THE OUTLINED SPOT`
    : phase === 'study' ? 'REMEMBER THE SCENE'
      : phase === 'blank' ? '…'
        : right ? 'SPOTTED IT!' : disabled ? '' : 'WHAT CHANGED? TAP THE SPOT'

  return (
    <div className="w-full max-w-sm mx-auto space-y-3">
      <PhaseBar left={phase === 'study' ? left : null} total={studyMs} />
      <div className="relative bg-retro-surface border-2 border-retro-border rounded p-2.5">
        {phase === 'countdown' && <CountdownCover msLeft={left} label={`LEVEL ${level}`} />}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${deal.side}, minmax(0, 1fr))`, touchAction: 'manipulation' }}>
          {Array.from({ length: deal.side * deal.side }, (_, i) => {
            const face = scene ? scene[i] : ''
            const isChange = reveal && deal.change.cells.includes(i)
            const isWrong = tapped === i && !right
            return (
              <button
                key={i}
                type="button"
                disabled={!canTap}
                onClick={() => tap(i)}
                aria-label={`row ${Math.floor(i / deal.side) + 1}, column ${(i % deal.side) + 1}${face ? `, ${face}` : ', empty'}`}
                className={cn(
                  'aspect-square rounded border-2 flex items-center justify-center p-[6%] transition-colors duration-150',
                  phase === 'blank' ? 'bg-retro-deep border-retro-deep' : 'bg-retro-card border-retro-border/60',
                  canTap && 'cursor-pointer hover:border-retro-p1/60 active:scale-95',
                  isChange && 'outline outline-2 outline-offset-1 outline-retro-win',
                  isWrong && 'border-retro-danger bg-retro-tint-danger pairs-mismatch-shake',
                  tapped === i && right && 'border-retro-win vm-found-pop',
                )}
              >
                {face && <FaceCard face={face} className="w-full h-full" />}
              </button>
            )
          })}
        </div>
      </div>
      <BoardHint tone={reveal ? 'danger' : right ? 'win' : phase === 'study' ? 'cta' : 'text'}>{hint}</BoardHint>
    </div>
  )
}
