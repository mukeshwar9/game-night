import { useMemo } from 'react'
import {
  KM_COLORS, KM_COLOR_VARS, KM_SIZE, KM_COLOR_NAMES,
  kmTowerMoves,
} from '../lib/kamisadoLogic'
import { useSelectMove } from '../lib/interact'
import { cn } from '@/lib/utils'

// KAMISADO — 8x8 colored board. The color you land on forces the opponent's
// next tower. The board owns the select-then-move flow: the mover's forced
// tower (or any tower when unforced) is auto-selected; tapping a highlighted
// landing commits { from, to }. Square colors resolve through the per-theme
// --c-kam0..7 channels (theming-rules: no hardcoded hex).
export default function KamisadoBoard({
  board, onMove, disabled, lastMove = null,
  forcedColor = null, forcedSymbol = null, currentTurn = null,
  towers = null,
}) {
  // The live game passes currentTurn (whose turn it is); demo/bot harness
  // omits it — fall back to X (the opening mover).
  const activeMover = currentTurn ?? 'X'

  // Legal moves for the activeMover: forced color when set, any tower otherwise.
  const moves = useMemo(() => {
    if (disabled) return []
    if (forcedColor != null) return kmTowerMoves(board, activeMover, forcedColor, towers)
    const all = []
    for (let k = 0; k < 8; k++) all.push(...kmTowerMoves(board, activeMover, k, towers))
  return all
  }, [board, activeMover, forcedColor, disabled, towers])
  // Forced play auto-selects the (unique) movable tower so its landings light
  // up without a tap — critical since a tower's square color ≠ its identity.
  const autoSource = forcedColor != null && moves.length > 0 ? moves[0].from : null
  const { selected, targets, tap } = useSelectMove(moves, onMove, autoSource)
  const targetSet = new Set(targets.map(t => t.index))

  return (
    <div className="w-full max-w-[360px] sm:max-w-[420px] mx-auto">
      <div className={cn(
        'bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'opacity-60 saturate-50',
      )}>
        {/* Forced-color strip — the whole point of the game, always visible */}
        <div className="flex items-center justify-center gap-2 pb-1.5">
          <span className="font-pixel text-[8px] text-retro-dim">
            {forcedColor == null
              ? (forcedSymbol ? `${forcedSymbol}: ANY TOWER` : 'ANY TOWER')
              : `${forcedSymbol ?? ''} MUST MOVE ${KM_COLOR_NAMES[forcedColor]}`}
          </span>
          {forcedColor != null && (
            <span
              aria-hidden="true"
              className="w-3 h-3 rounded-sm border border-retro-border"
              style={{ background: `rgb(var(${KM_COLOR_VARS[forcedColor]}))` }}
            />
          )}
        </div>

        <div
          className="grid gap-0.5 sm:gap-1"
          style={{ gridTemplateColumns: `repeat(${KM_SIZE}, 1fr)` }}
        >
          {board.map((cell, i) => {
            const r = Math.floor(i / KM_SIZE)
            const c = i % KM_SIZE
            const isTarget = targetSet.has(i)
            const isSelected = i === selected
            return (
              <button
                key={i}
                aria-label={`km-cell-${r}-${c}${cell ? `-${cell}` : ''}`}
                disabled={disabled}
                onClick={() => !disabled && tap(i)}
                className={cn(
                  'aspect-square rounded-sm transition-all duration-100 select-none relative',
                  'flex items-center justify-center font-pixel text-base sm:text-lg outline-none',
                  'focus-visible:ring-2 focus-visible:ring-retro-cta',
                  !disabled && 'cursor-pointer hover:brightness-125 active:scale-95',
                  disabled && 'cursor-default',
                  isTarget && 'ring-2 ring-inset ring-retro-cta/70 z-10',
                  isSelected && 'ring-2 ring-inset ring-retro-p1 shadow-neon-p1 z-10',
                  i === lastMove && !isSelected && 'ring-2 ring-inset ring-retro-cta/60',
                )}
                style={{ background: `rgb(var(${KM_COLOR_VARS[KM_COLORS[i]]}))` }}
              >
                {cell && (
                  <span
                    style={{ animation: 'place-pop 0.2s ease-out', display: 'inline-block' }}
                    className={cn(
                      // X gets a gold dragon-ish top: p1 text on dark badge;
                      // O the p2 accent. Badge bg keeps letters readable on
                      // every square color across all 6 themes.
                      'w-[72%] h-[72%] flex items-center justify-center rounded-full',
                      'bg-retro-bg/85 border',
                      cell === 'X' ? 'border-retro-p1 text-retro-p1 text-glow-p1' : 'border-retro-p2 text-retro-p2 text-glow-p2',
                    )}
                  >
                    {cell}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-center font-pixel text-[8px] text-retro-dim tracking-wider">
          LAND ON A COLOR — THEY MUST MOVE THAT TOWER
        </p>
      </div>
    </div>
  )
}
