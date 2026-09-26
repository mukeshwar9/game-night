import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { HEX_SIZE, SWAP_ACTION, canHexSwap } from '../lib/hexLogic'
import { cellLabel, columnLetter } from '../lib/a11yLabels'

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
const CELL_W = 26
const CELL_H = 30
const ROW_OVERLAP = CELL_H * 0.25
const BOARD_W = CELL_W * HEX_SIZE + (CELL_W / 2) * (HEX_SIZE - 1)
const BOARD_H = CELL_H + (HEX_SIZE - 1) * (CELL_H - ROW_OVERLAP)

export default function HexBoard({ board, onMove, disabled, winningLine = [], currentTurn, lastMove = null, swapRule = false, pieSwap = false }) {
  const showHint = board.every(c => !c)
  // Swap (pie) rule: on move 2 the player to move may take the opening stone.
  const stones = board.filter(Boolean)
  const swapOpen = swapRule && canHexSwap(board, currentTurn, pieSwap)
  const opener = currentTurn === 'X' ? 'O' : 'X'
  const justSwapped = swapRule && pieSwap && stones.length === 1
  const wrapperRef = useRef(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return undefined
    const update = () => {
      const w = el.clientWidth
      setScale(w > 0 ? Math.min(1, w / BOARD_W) : 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    // -mx-2 on phones: break out of the parent card's padding (both Game.jsx
    // and the demo card pad ≥16px, so 8px each side never overflows the page).
    // The 11-wide rhombus scales with wrapper width, so reclaimed pixels go
    // straight into bigger, easier-to-tap cells.
    <div className="w-[calc(100%+1rem)] -mx-2 sm:w-full sm:mx-auto max-w-md">
      <div
        className={cn(
          'relative bg-retro-bg border-2 border-retro-border rounded transition-all duration-200',
          disabled && 'board-idle',
        )}
      >
        {/* GAMEPLAY-03: solid tinted goal rails + direction arrows. The old
            30%-alpha gradients were nearly invisible on midnight (and rely on
            theme alpha generally) — the goal IS the ruleset, so it gets the
            semantic tint tokens, not a wash. Arrows point inward, the way
            each side travels. */}
        <p className="sr-only">
          X connects the left and right edges, columns A to {columnLetter(HEX_SIZE - 1)}.
          O connects the top and bottom edges, rows 1 to {HEX_SIZE}.
        </p>
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-9 rounded-l bg-retro-tint-p1 border-r-2 border-retro-p1/60 flex items-center justify-start pl-1 flex-col gap-1">
          <span className="font-pixel text-[9px] text-retro-p1 text-glow-p1">X</span>
          <span className="font-pixel text-[8px] text-retro-p1">▶</span>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-9 rounded-r bg-retro-tint-p1 border-l-2 border-retro-p1/60 flex items-center justify-end pr-1 flex-col gap-1">
          <span className="font-pixel text-[9px] text-retro-p1 text-glow-p1">X</span>
          <span className="font-pixel text-[8px] text-retro-p1">◀</span>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-retro-tint-p2 border-b-2 border-retro-p2/60 flex items-start justify-center pt-1 gap-2">
          <span className="font-pixel text-[9px] text-retro-p2 text-glow-p2">O ▼</span>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-retro-tint-p2 border-t-2 border-retro-p2/60 flex items-end justify-center pb-1 gap-2">
          <span className="font-pixel text-[9px] text-retro-p2 text-glow-p2">▲ O</span>
        </div>
        {/* Tight padding on phones — every horizontal pixel feeds the scale
            factor, and an 11-wide rhombus is starved for width as it is. */}
        <div className="p-1.5 sm:p-3">
          <div ref={wrapperRef} className="w-full flex justify-center">
            <div style={{ width: `${BOARD_W * scale}px`, height: `${BOARD_H * scale}px`, position: 'relative' }}>
              <div
                style={{
                  width: `${BOARD_W}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              >
                {Array.from({ length: HEX_SIZE }, (_, row) => (
                  <div
                    key={row}
                    className="flex"
                    style={{
                      marginTop: row === 0 ? 0 : `-${ROW_OVERLAP}px`,
                      marginLeft: `${(row * CELL_W) / 2}px`,
                    }}
                  >
                    {board.slice(row * HEX_SIZE, row * HEX_SIZE + HEX_SIZE).map((cell, col) => {
                      const i = row * HEX_SIZE + col
                      const isOccupied = cell !== ''
                      const isClickable = !disabled && !isOccupied
                      const isWinning = winningLine.includes(i)
                      const isLast = i === lastMove && !isWinning
                      return (
                        <button
                          key={i}
                          data-testid={`hex-cell-${row}-${col}`}
                          aria-label={cellLabel({
                            row, col, occupant: cell, letters: true,
                            extra: [isWinning && 'winning line', isLast && 'last move'],
                          })}
                          disabled={!isClickable}
                          onClick={() => isClickable && onMove(i)}
                          className={cn(
                            'relative shrink-0 transition-[filter] duration-100 touch-manipulation',
                            isClickable ? 'cursor-pointer hover:brightness-150 active:brightness-[1.75]' : 'cursor-default',
                          )}
                          style={{ width: `${CELL_W}px`, height: `${CELL_H}px`, clipPath: HEX_CLIP }}
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-0"
                            style={{ clipPath: HEX_CLIP, background: 'rgb(var(--c-border))' }}
                          />
                          <span
                            aria-hidden="true"
                            className="absolute"
                            style={{
                              clipPath: HEX_CLIP,
                              inset: '1.5px',
                              background: isOccupied
                                ? `rgb(var(--c-${cell === 'X' ? 'p1' : 'p2'}))`
                                : 'rgb(var(--c-surface))',
                              filter: isOccupied
                                ? `drop-shadow(0 0 ${isWinning ? 8 : 5}px rgb(var(--c-${cell === 'X' ? 'p1' : 'p2'})${isWinning ? '' : ' / 0.7'}))${isWinning ? ' brightness(1.35)' : ''}`
                                : undefined,
                              animation: isOccupied ? 'place-pop 0.2s cubic-bezier(0.34,1.15,0.64,1)' : undefined,
                            }}
                          />
                          {/* GAMEPLAY-04: side letter inside every stone — color
                              alone must not carry player identity (amber/mono
                              themes reduce the pair to brightness). Matches the
                              repo-wide X/O glyph convention. */}
                          {isOccupied && (
                            <span
                              aria-hidden="true"
                              className={cn(
                                'absolute inset-0 flex items-center justify-center font-pixel text-[8px]',
                                'text-retro-bg',
                                isLast && 'animate-pulse',
                              )}
                            >
                              {cell}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {swapOpen && !disabled && (
        <div className="mt-2 flex flex-col items-center gap-1.5">
          <button
            onClick={() => onMove({ action: SWAP_ACTION })}
            aria-label={`Swap: take ${opener}'s opening stone, mirrored onto your edges`}
            className={cn(
              'px-4 py-2 rounded border-2 font-pixel text-[10px] tracking-widest transition-all active:scale-95',
              'border-retro-cta text-retro-cta bg-retro-tint-cta hover:shadow-neon-cta',
            )}
          >
            SWAP
          </button>
          <p className="font-mono text-[11px] text-retro-dim text-center leading-snug">
            Take {opener}&apos;s opening stone as yours (mirrored onto your edges) — or just place a stone.
          </p>
        </div>
      )}
      {((swapOpen && disabled) || justSwapped) && (
        <p role="status" className="mt-2 text-center font-pixel text-[9px] tracking-widest text-retro-dim">
          {justSwapped
            ? `${stones[0]} SWAPPED — THE OPENING STONE IS NOW ${stones[0]}'S`
            : `${currentTurn} MAY SWAP INSTEAD OF MOVING`}
        </p>
      )}
      {showHint && (
        <p className={cn(
          'mt-2 text-center font-pixel text-[9px] tracking-widest',
          currentTurn === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2',
        )}>
          CONNECT YOUR EDGES
        </p>
      )}
    </div>
  )
}
