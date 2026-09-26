import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { cellLabel, countLabel, joinLabel } from '../lib/a11yLabels'

export default function ConnectFourBoard({ board, onMove, disabled, winningLine = [], currentTurn, popMode = false, lastMove = null, cols = 7, rows = 6 }) {
  const [hoveredCol, setHoveredCol] = useState(null)

  // Per-cell "version" bumped only when that cell's content actually changes,
  // so a pop's downward slide re-triggers the drop animation for every disc
  // that moved — a plain drop still only re-triggers the one new cell, same
  // as before. Also detects which column just popped (multiple cells in one
  // column changing at once is the pop's signature) to flash a highlight.
  const [cellVersions, setCellVersions] = useState(() => board.map(() => 0))
  const [poppedCol, setPoppedCol] = useState(null)
  const prevBoardRef = useRef(board)
  const popTimerRef = useRef(null)

  useEffect(() => {
    const prev = prevBoardRef.current
    if (prev !== board) {
      const colChangeCounts = {}
      setCellVersions(versions => {
        let changed = false
        const next = [...versions]
        board.forEach((cell, i) => {
          if (prev[i] !== cell) {
            next[i] = (next[i] || 0) + 1
            changed = true
            const c = i % cols
            colChangeCounts[c] = (colChangeCounts[c] || 0) + 1
          }
        })
        return changed ? next : versions
      })
      const shiftedCol = Object.entries(colChangeCounts).find(([, n]) => n > 1)
      if (shiftedCol) {
        const c = Number(shiftedCol[0])
        setPoppedCol(c)
        clearTimeout(popTimerRef.current)
        popTimerRef.current = setTimeout(() => setPoppedCol(null), 350)
      }
      prevBoardRef.current = board
    }
    return () => clearTimeout(popTimerRef.current)
  }, [board, cols])

  // In pop mode the board emits { col, action }; classic mode emits a bare col.
  const emit = (col, action) => {
    if (disabled) return
    onMove(popMode ? { col, action } : col)
  }
  const bottomOf = (col) => board[(rows - 1) * cols + col]

  return (
    <div className={cn('w-full mx-auto', cols > 7 ? 'max-w-md sm:max-w-xl' : 'max-w-sm sm:max-w-md')}>
      <div
        className={cn(
          'bg-retro-surface border-2 border-retro-border rounded p-2 sm:p-2.5 transition-all duration-200',
          disabled && 'opacity-60 saturate-50',
        )}
      >
        {/* G-04: the disc grid is readable (one labelled image per cell, in
            reading order) while the column buttons below stay the only tab
            stops — browse mode walks the board, Tab drops discs. */}
        <div
          className="grid gap-1 sm:gap-1.5"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          role="group"
          aria-label={`Board, ${rows} rows by ${cols} columns, top row first`}
        >
          {board.map((cell, i) => {
            const col = i % cols
            const row = Math.floor(i / cols)
            const colFull = !!board[col]
            const isHovered = hoveredCol === col && !disabled && !colFull
            const isWinning = winningLine.includes(i)
            return (
              <div
                key={i}
                role="img"
                data-testid={`c4-cell-${row}-${col}`}
                aria-label={cellLabel({
                  row, col, occupant: cell,
                  extra: [isWinning && 'winning line', !isWinning && i === lastMove && 'last move'],
                })}
                onClick={() => !colFull && emit(col, 'drop')}
                onMouseEnter={() => setHoveredCol(col)}
                onMouseLeave={() => setHoveredCol(null)}
                className={cn(
                  'aspect-square rounded-full border-2 transition-all duration-100 overflow-hidden',
                  'flex items-center justify-center',
                  cell
                    ? 'bg-retro-bg border-retro-border'
                    : isHovered
                      ? currentTurn === 'X'
                        ? 'bg-retro-p1/20 border-retro-p1/40'
                        : 'bg-retro-p2/20 border-retro-p2/40'
                      : 'bg-retro-bg border-retro-border',
                  poppedCol === col && 'ring-2 ring-retro-cta/70',
                  !cell && !disabled && !colFull ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                {/* inner disc mounts only when filled → drops in once on placement;
                    keyed by cell content + a per-cell version so a pop's downward
                    slide re-triggers the drop animation for every shifted disc */}
                {cell && (
                  <span
                    key={`${cell}-${cellVersions[i] || 0}`}
                    className={cn(
                      'w-full h-full rounded-full flex items-center justify-center',
                      cell === 'X' ? 'bg-retro-p1' : 'bg-retro-p2',
                      winningLine.includes(i) && 'scale-110',
                      winningLine.includes(i) && (cell === 'X' ? 'shadow-neon-p1' : 'shadow-neon-p2'),
                      // M-47: persistent ring on the just-landed disc
                      !winningLine.includes(i) && i === lastMove && 'ring-2 ring-inset ring-retro-cta/70',
                    )}
                    style={{ animation: 'disc-drop 0.3s cubic-bezier(0.34,1.15,0.64,1)' }}
                  >
                    <span aria-hidden="true" className="font-pixel text-[10px] sm:text-xs text-retro-bg/80 select-none">{cell}</span>
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* One focusable, labelled control per column — replaces 42 individual
            cell tab stops with 7-9 meaningful ones. */}
        <div className="grid gap-1 sm:gap-1.5 mt-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }, (_, col) => {
            const colFull = !!board[col]
            const filled = board.reduce((n, c, j) => (j % cols === col && c ? n + 1 : n), 0)
            const top = filled > 0 ? board[(rows - filled) * cols + col] : null
            const clickable = !disabled && !colFull
            return (
              <button
                key={col}
                onClick={() => clickable && emit(col, 'drop')}
                onMouseEnter={() => setHoveredCol(col)}
                onMouseLeave={() => setHoveredCol(null)}
                disabled={!clickable}
                aria-label={joinLabel(
                  `Column ${col + 1}`,
                  colFull ? 'full' : countLabel(filled, 'disc'),
                  top && `top ${top}`,
                  !colFull && 'drop here',
                )}
                className={cn(
                  'h-2 sm:h-2.5 rounded-full transition-all',
                  clickable ? 'bg-retro-border/60 hover:bg-retro-cta/60 cursor-pointer' : 'bg-retro-border/20 cursor-default',
                )}
              />
            )
          })}
        </div>

        {popMode && (
          <div
            className="grid gap-1 sm:gap-1.5 mt-1.5 pt-1.5 border-t border-retro-border/60"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {Array.from({ length: cols }, (_, col) => {
              const canPop = !disabled && bottomOf(col) === currentTurn
              return (
                <button
                  key={col}
                  onClick={() => canPop && emit(col, 'pop')}
                  disabled={!canPop}
                  title="Pop your own disc out of the bottom"
                  aria-label={`Pop column ${col + 1}`}
                  className={cn(
                    'h-11 rounded-sm border font-pixel text-[9px] leading-none flex items-center justify-center transition-all',
                    canPop
                      ? 'border-retro-cta/60 text-retro-cta hover:bg-retro-tint-cta active:scale-90 cursor-pointer'
                      : 'border-retro-border/40 text-retro-border/50 cursor-default',
                  )}
                >
                  ▼
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
