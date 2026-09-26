import { useState } from 'react'
import { cn } from '@/lib/utils'
import { SOS_SIZE } from '../lib/sosLogic'
import { cellLabel } from '../lib/a11yLabels'

export default function SosBoard({ board, onMove, disabled, currentTurn, sosLines, lastMove = null }) {
  const [selectedLetter, setSelectedLetter] = useState('S')

  // GAMEPLAY-05 (starting value, not a tuned constant): how many of the newest
  // scored lines render at full strength. If late boards still feel noisy,
  // lower it; if players can't trace their own recent scores, raise it.
  const RECENT_LINES = 6

  // Build a map from cell index to the set of scorers who claimed it
  // (a cell can be scored by both players across overlapping lines — keep both).
  const cellScorers = {}
  const lines = sosLines || []
  for (const line of lines) {
    for (const cell of line.cells) {
      const set = cellScorers[cell] || (cellScorers[cell] = new Set())
      set.add(line.by)
    }
  }

  const xCount = lines.filter(l => l.by === 'X').length
  const oCount = lines.filter(l => l.by === 'O').length

  const cells = []
  for (let i = 0; i < board.length; i++) {
    const row = Math.floor(i / SOS_SIZE)
    const col = i % SOS_SIZE
    const letter = board[i]
    const scorers = cellScorers[i]
    const scoredByX = scorers?.has('X')
    const scoredByO = scorers?.has('O')
    const isOccupied = letter !== ''
    const isClickable = !disabled && !isOccupied

    cells.push(
      <button
        key={i}
        data-testid={`sos-cell-${row}-${col}`}
        aria-label={cellLabel({
          row, col, occupant: letter,
          extra: [
            scoredByX && scoredByO ? 'in SOS by X and O' : scoredByX ? 'in SOS by X' : scoredByO && 'in SOS by O',
            i === lastMove && 'last move',
          ],
        })}
        disabled={!isClickable}
        onClick={() => isClickable && onMove({ index: i, letter: selectedLetter })}
        className={cn(
          'aspect-square flex items-center justify-center',
          'border border-retro-border/60 rounded-sm',
          'transition-all duration-100',
          scoredByX && scoredByO
            ? 'bg-gradient-to-br from-retro-p1/20 to-retro-p2/20 shadow-[inset_0_0_4px_rgb(var(--c-p1)/0.2),inset_0_0_4px_rgb(var(--c-p2)/0.2)]'
            : scoredByX
              ? 'bg-retro-p1/15 shadow-[inset_0_0_4px_rgb(var(--c-p1)/0.25)]'
              : scoredByO
                ? 'bg-retro-p2/15 shadow-[inset_0_0_4px_rgb(var(--c-p2)/0.25)]'
                : '',
          // M-47: persistent marker on the most recently placed letter
          i === lastMove && 'ring-2 ring-inset ring-retro-cta/70',
          isClickable && !isOccupied
            ? currentTurn === 'X'
              ? 'hover:bg-retro-p1/10 hover:border-retro-p1/40 cursor-pointer'
              : 'hover:bg-retro-p2/10 hover:border-retro-p2/40 cursor-pointer'
            : 'cursor-default',
        )}
      >
        {isOccupied && (
          <span className="font-pixel text-[10px] leading-none text-retro-text">
            {letter}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="relative">
        <div
          className={cn(
            'bg-retro-surface border-2 border-retro-border rounded p-3 transition-all duration-200',
            disabled && 'board-idle',
          )}
        >
          <div className="relative w-full">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${SOS_SIZE}, minmax(0, 1fr))`,
                gap: '3px',
              }}
            >
              {cells}
            </div>
            {/* SVG overlay: draws a strike line across each completed S-O-S triple
                so overlapping scores stay auditable, not just tinted.
                GAMEPLAY-05: only the most recent RECENT_LINES lines stay at full
                strength; older ones fade to 25% so a late-game board doesn't
                become a wall of glow hiding fresh threats. */}
            {lines.length > 0 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${SOS_SIZE} ${SOS_SIZE}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {lines.map((line, idx) => {
                  const [a, , c] = line.cells
                  const ar = Math.floor(a / SOS_SIZE) + 0.5
                  const ac = (a % SOS_SIZE) + 0.5
                  const cr = Math.floor(c / SOS_SIZE) + 0.5
                  const cc = (c % SOS_SIZE) + 0.5
                  const color = line.by === 'X' ? 'rgb(var(--c-p1))' : 'rgb(var(--c-p2))'
                  const isRecent = idx >= lines.length - RECENT_LINES
                  return (
                    <line
                      key={idx}
                      x1={ac} y1={ar} x2={cc} y2={cr}
                      stroke={color}
                      strokeWidth={isRecent ? 0.08 : 0.06}
                      strokeLinecap="round"
                      opacity={isRecent ? 0.85 : 0.25}
                    />
                  )
                })}
              </svg>
            )}
          </div>
        </div>

        {/* Persistent armed-letter badge, anchored to the board's corner */}
        <div
          className="absolute -top-3 right-2 w-7 h-7 flex items-center justify-center rounded-full border-2 border-retro-cta bg-retro-card font-pixel text-[11px] text-retro-cta shadow-neon-cta"
          role="img"
          aria-label={`Armed letter ${selectedLetter}`}
        >
          {selectedLetter}
        </div>
      </div>

      {/* Letter picker — anchored tight against the board edge */}
      <div className="mt-1.5 flex items-center justify-center gap-3">
        {['S', 'O'].map(letter => (
          <button
            key={letter}
            data-testid={`pick-letter-${letter}`}
            aria-label={`Place ${letter}`}
            aria-pressed={selectedLetter === letter}
            disabled={disabled}
            onClick={() => !disabled && setSelectedLetter(letter)}
            className={cn(
              'w-11 h-11 flex items-center justify-center',
              'font-pixel text-[11px] rounded border-2',
              'transition-all duration-100',
              !disabled && 'active:scale-95',
              selectedLetter === letter
                ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
              disabled && 'opacity-50 cursor-default',
            )}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Score bar */}
      <div className="mt-2 flex items-center justify-center gap-3 font-pixel text-[10px]">
        <span className="text-retro-p1 text-glow-p1">X {xCount}</span>
        <span className="text-retro-dim">—</span>
        <span className="text-retro-p2 text-glow-p2">{oCount} O</span>
      </div>
    </div>
  )
}
