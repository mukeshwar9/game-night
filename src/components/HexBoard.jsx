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
// Goal edges are drawn as SVG strokes along the rhombus's real sides. X's
// labels sit in the empty triangles beside the slanted sides, so they need no
// extra width; O's labels need a strip above and below.
const PAD_X = 6
const PAD_Y = 16
const OUTER_W = BOARD_W + 2 * PAD_X
const OUTER_H = BOARD_H + 2 * PAD_Y
const GAP = 3 // stroke centre's distance from the hex edge
const SLANT = ((HEX_SIZE - 1) * CELL_W) / 2
const EDGES = {
  top: [PAD_X, PAD_Y - GAP, PAD_X + HEX_SIZE * CELL_W, PAD_Y - GAP],
  bottom: [PAD_X + SLANT, PAD_Y + BOARD_H + GAP, PAD_X + SLANT + HEX_SIZE * CELL_W, PAD_Y + BOARD_H + GAP],
  left: [PAD_X - GAP, PAD_Y + CELL_H * 0.25, PAD_X - GAP + SLANT, PAD_Y + BOARD_H - CELL_H * 0.25],
  right: [PAD_X + HEX_SIZE * CELL_W + GAP, PAD_Y + CELL_H * 0.25, PAD_X + HEX_SIZE * CELL_W + GAP + SLANT, PAD_Y + BOARD_H - CELL_H * 0.25],
}
const mid = ([x1, y1, x2, y2]) => [(x1 + x2) / 2, (y1 + y2) / 2]

// The four goal sides as thick strokes following the rhombus, each labelled
// with its owner outside the board so no hex ever covers a label.
function GoalEdges() {
  const stroke = (side) => ({ stroke: `rgb(var(--c-${side === 'top' || side === 'bottom' ? 'p2' : 'p1'}))` })
  const label = (side) => ({ fill: `rgb(var(--c-${side === 'top' || side === 'bottom' ? 'p2' : 'p1'}))` })
  const [lx, ly] = mid(EDGES.left)
  const [rx, ry] = mid(EDGES.right)
  const [tx] = mid(EDGES.top)
  const [bx] = mid(EDGES.bottom)
  return (
    <svg
      aria-hidden="true"
      width={OUTER_W}
      height={OUTER_H}
      className="absolute left-0 top-0 pointer-events-none overflow-visible"
    >
      {Object.entries(EDGES).map(([side, [x1, y1, x2, y2]]) => (
        <line key={side} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={4} strokeLinecap="round" style={stroke(side)} />
      ))}
      <g className="font-pixel" fontSize={11} textAnchor="middle" dominantBaseline="central">
        <text x={lx - 16} y={ly} style={label('left')}>X▶</text>
        <text x={rx + 16} y={ry} style={label('right')}>◀X</text>
        <text x={tx} y={PAD_Y - GAP - 9} style={label('top')}>O ▼</text>
        <text x={bx} y={PAD_Y + BOARD_H + GAP + 9} style={label('bottom')}>▲ O</text>
      </g>
    </svg>
  )
}

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
      setScale(w > 0 ? Math.min(1, w / OUTER_W) : 1)
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
        {/* GAMEPLAY-03: the goal IS the ruleset, so each side's edges are
            drawn in its colour along the rhombus itself (GoalEdges) rather
            than as rectangular rails the slanted board runs under. */}
        <p className="sr-only">
          X connects the left and right edges, columns A to {columnLetter(HEX_SIZE - 1)}.
          O connects the top and bottom edges, rows 1 to {HEX_SIZE}.
        </p>
        {/* Tight padding on phones — every horizontal pixel feeds the scale
            factor, and an 11-wide rhombus is starved for width as it is. */}
        <div className="p-1.5 sm:p-3">
          <div ref={wrapperRef} className="w-full flex justify-center">
            <div style={{ width: `${OUTER_W * scale}px`, height: `${OUTER_H * scale}px`, position: 'relative' }}>
              <div
                style={{
                  width: `${OUTER_W}px`,
                  height: `${OUTER_H}px`,
                  padding: `${PAD_Y}px ${PAD_X}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              >
                <GoalEdges />
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
