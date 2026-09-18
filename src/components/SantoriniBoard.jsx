import { useMemo, useState } from 'react'
import {
  ST_SIZE, ST_MAX_LEVEL, neighbors,
  moveTargets, buildTargetsAfter,
} from '../lib/santoriniLogic'
import { cn } from '@/lib/utils'

// SANTORINI — 5×5 island. The board owns the three-beat interaction:
// 1) tap one of your workers (or it auto-selects if only one can move),
// 2) tap a highlighted square to MOVE,
// 3) tap a highlighted square to BUILD — then commit { worker, to, build }.
// Tower heights render as stacked blocks; domes (height 4) as capped roofs.
export default function SantoriniBoard({
  board, onMove, disabled, lastMove = null,
  workers = { X: [20, 24], O: [0, 4] }, currentTurn = null,
}) {
  // The live game passes currentTurn (whose turn it is); demo/bot harness
  // omits it — fall back to the default activeMover.
  const activeMover = currentTurn ?? 'X'

  const [selWorker, setSelWorker] = useState(null)
  const [selMove, setSelMove] = useState(null)

  const heights = board
  const myWorkers = workers[activeMover] ?? []

  const moveOptions = useMemo(() => {
    if (disabled || selWorker == null) return []
    return moveTargets(heights, workers, selWorker)
  }, [heights, workers, selWorker, disabled])

  const buildOptions = useMemo(() => {
    if (disabled || selWorker == null || selMove == null) return []
    const w2 = { X: [...workers.X], O: [...workers.O] }
    w2[activeMover] = w2[activeMover].map(c => (c === selWorker ? selMove : c))
    return buildTargetsAfter(heights, w2, selMove)
  }, [heights, workers, selWorker, selMove, activeMover, disabled])

  const reset = () => { setSelWorker(null); setSelMove(null) }

  const tap = (i) => {
    if (disabled) return
    // Beat 3: build.
    if (selMove != null) {
      if (buildOptions.includes(i)) {
        onMove({ worker: selWorker, to: selMove, build: i })
        reset()
      } else if (i === selMove) {
        reset() // tap destination again to cancel back to move stage
      } else {
        reset()
      }
      return
    }
    // Beat 2: move.
    if (selWorker != null) {
      if (moveOptions.includes(i)) {
        setSelMove(i)
        return
      }
      if (i === selWorker) { reset(); return }
      // fall through: maybe selecting another worker
    }
    // Beat 1: select a worker.
    if (myWorkers.includes(i)) {
      setSelWorker(prev => (prev === i ? null : i))
      setSelMove(null)
    } else {
      reset()
    }
  }

  const stage = selWorker == null ? 'pick' : selMove == null ? 'move' : 'build'

  return (
    <div className="w-full max-w-[380px] sm:max-w-[420px] mx-auto">
      <div className={cn(
        'bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'opacity-60 saturate-50',
      )}>
        <div className="flex items-center justify-center gap-2 pb-1.5">
          <span className="font-pixel text-[8px] text-retro-dim">
            {stage === 'pick' && 'TAP A WORKER'}
            {stage === 'move' && 'TAP A SQUARE TO MOVE'}
            {stage === 'build' && 'TAP A SQUARE TO BUILD · TAP DESTINATION TO CANCEL'}
          </span>
        </div>

        <div
          className="grid gap-1 sm:gap-1.5"
          style={{ gridTemplateColumns: `repeat(${ST_SIZE}, 1fr)` }}
        >
          {board.map((h, i) => {
            const r = Math.floor(i / ST_SIZE)
            const c = i % ST_SIZE
            const dark = (r + c) % 2 === 0
            const domed = h >= 4
            const level = Math.min(h, ST_MAX_LEVEL)
            const owner = workers.X.includes(i) ? 'X' : workers.O.includes(i) ? 'O' : null
            const isSel = i === selWorker
            const isMoveOpt = moveOptions.includes(i)
            const isBuildOpt = buildOptions.includes(i)
            const isDest = i === selMove
            return (
              <button
                key={i}
                aria-label={`st-cell-${r}-${c}-h${h}`}
                disabled={disabled}
                onClick={() => tap(i)}
                className={cn(
                  'aspect-square rounded-sm transition-all duration-100 select-none',
                  'relative flex items-end justify-center overflow-hidden outline-none',
                  'focus-visible:ring-2 focus-visible:ring-retro-cta',
                  dark ? 'bg-retro-surface' : 'bg-retro-card',
                  'border border-retro-border/40',
                  !disabled && 'cursor-pointer hover:brightness-125 active:scale-95',
                  isSel && 'ring-2 ring-inset ring-retro-p1 shadow-neon-p1',
                  isDest && 'ring-2 ring-inset ring-retro-p1/70',
                  isMoveOpt && stage === 'move' && 'ring-2 ring-inset ring-retro-cta/60 bg-retro-tint-cta/20',
                  isBuildOpt && stage === 'build' && 'ring-2 ring-inset ring-retro-cta/70 bg-retro-tint-cta/30',
                  i === lastMove && !isSel && !isDest && 'ring-2 ring-inset ring-retro-cta/50',
                )}
              >
                {/* Tower blocks */}
                <span className="absolute inset-x-1 bottom-0.5 flex flex-col-reverse gap-px">
                  {Array.from({ length: level }, (_, k) => (
                    <span key={k} className="h-1 rounded-sm bg-retro-border/70" />
                  ))}
                  {domed && (
                    <span className="h-1.5 rounded-sm bg-retro-dim/80" aria-label="dome" />
                  )}
                </span>
                {/* Worker chip */}
                {owner && (
                  <span
                    style={{ animation: 'place-pop 0.2s ease-out' }}
                    className={cn(
                      'relative z-10 mb-1.5 w-[52%] aspect-square flex items-center justify-center rounded-full',
                      'bg-retro-bg/85 border font-pixel text-[10px]',
                      owner === 'X'
                        ? 'border-retro-p1 text-retro-p1 text-glow-p1'
                        : 'border-retro-p2 text-retro-p2 text-glow-p2',
                    )}
                  >
                    {owner}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-center font-pixel text-[8px] text-retro-dim tracking-wider">
          MOVE ONE · BUILD ONE · LEVEL 3 WINS · {neighbors(12).length} NEIGHBORS RULE
        </p>
      </div>
    </div>
  )
}
