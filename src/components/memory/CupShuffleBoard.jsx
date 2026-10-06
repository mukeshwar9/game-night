import { useState } from 'react'
import { cn } from '@/lib/utils'
import usePhaseClock from '../../hooks/usePhaseClock'
import { cupSlotsAfter, swapMsForLevel } from '../../lib/cupShuffleLogic'
import { sounds } from '../../lib/sounds'
import { CountdownCover, BoardHint } from './MemoryParts'

const SHOW_MS = 1400
const COVER_MS = 450

// A pixel cup, drawn in the theme's CTA colour so it follows the theme.
function Cup({ lifted }) {
  return (
    <svg viewBox="0 0 16 14" className={cn('w-full h-auto transition-transform duration-200 motion-reduce:transition-none', lifted && '-translate-y-[45%]')} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="0" width="10" height="2" className="fill-retro-cta" />
      <rect x="2" y="2" width="12" height="9" className="fill-retro-cta" />
      <rect x="4" y="3" width="2" height="7" className="fill-retro-tint-cta" />
      <rect x="1" y="11" width="14" height="3" className="fill-retro-cta" />
    </svg>
  )
}

function Ball() {
  return (
    <svg viewBox="0 0 6 6" className="w-[38%] h-auto" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="0" width="4" height="6" className="fill-retro-p2" />
      <rect x="0" y="1" width="6" height="4" className="fill-retro-p2" />
      <rect x="1" y="1" width="1" height="1" className="fill-retro-card" />
    </svg>
  )
}

// Cup Shuffle board for one level: show the ball, cover it, shuffle, pick a cup.
// Cups slide between slots; with reduced motion they jump slot to slot.
export default function CupShuffleBoard({ deal, level, startAt, clock, disabled, answer = false, onDone, onFail }) {
  const swapMs = swapMsForLevel(level)
  const { phase, left } = usePhaseClock(startAt, [['show', SHOW_MS], ['cover', COVER_MS], ['shuffle', deal.swaps.length * swapMs]], clock)
  const [picked, setPicked] = useState(null) // cup id

  const done = phase === 'shuffle' ? deal.swaps.length - Math.ceil(left / swapMs) : phase === 'recall' ? deal.swaps.length : 0
  const slots = cupSlotsAfter(deal, Math.max(0, done))
  const canPick = phase === 'recall' && !disabled && picked == null && !answer

  const pick = (cup) => {
    if (!canPick) return
    setPicked(cup)
    if (cup === deal.ball) { sounds.go(); onDone?.() } else { sounds.miss(); onFail?.({ cell: slots[cup] }) }
  }

  const showBall = phase === 'show' || answer || picked != null
  const hint = answer ? 'THE BALL WAS UNDER THE LIFTED CUP'
    : phase === 'show' ? 'WATCH THE BALL'
      : phase === 'cover' || phase === 'shuffle' ? 'FOLLOW IT…'
        : picked == null ? (disabled ? '' : 'TAP THE CUP WITH THE BALL') : picked === deal.ball ? 'FOUND IT!' : 'NOT THAT ONE'

  return (
    <div className="w-full max-w-sm mx-auto space-y-3">
      <div className="relative bg-retro-surface border-2 border-retro-border rounded px-2 pt-10 pb-4">
        {phase === 'countdown' && <CountdownCover msLeft={left} label={`LEVEL ${level} · ${deal.cups} CUPS`} />}
        <div className="relative w-full" style={{ height: 0, paddingBottom: `${100 / deal.cups}%` }}>
          {Array.from({ length: deal.cups }, (_, cup) => {
            const lifted = phase === 'show' || (answer && cup === deal.ball) || picked === cup
            const hasBall = cup === deal.ball
            return (
              <button
                key={cup}
                type="button"
                disabled={!canPick}
                onClick={() => pick(cup)}
                aria-label={`cup ${slots[cup] + 1} of ${deal.cups}${lifted ? (hasBall ? ', ball here' : ', empty') : ''}`}
                className={cn(
                  'absolute top-0 flex flex-col items-center justify-end ease-in-out motion-reduce:transition-none',
                  'transition-[left]',
                  canPick && 'cursor-pointer press',
                  picked === cup && cup !== deal.ball && 'opacity-80',
                )}
                style={{ left: `${(slots[cup] * 100) / deal.cups}%`, width: `${100 / deal.cups}%`, height: '100%', transitionDuration: `${Math.round(swapMs * 0.85)}ms`, padding: '0 6%' }}
              >
                <span className="relative w-full flex flex-col items-center">
                  <Cup lifted={lifted} />
                  {showBall && hasBall && lifted && (
                    <span className="absolute bottom-0 left-0 right-0 flex justify-center"><Ball /></span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
        <div className="h-1 mt-2 rounded bg-retro-structure/60" aria-hidden="true" />
      </div>
      <BoardHint tone={picked != null && picked !== deal.ball ? 'danger' : picked === deal.ball ? 'win' : phase === 'recall' ? 'text' : 'cta'}>
        {hint}
      </BoardHint>
    </div>
  )
}
