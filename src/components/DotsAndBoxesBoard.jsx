import { useState } from 'react'
import { cn } from '@/lib/utils'
import { hEdgeIndex, vEdgeIndex, DB_SIZE } from '../lib/dotsAndBoxesLogic'
import { joinLabel } from '../lib/a11yLabels'

// Screen-reader name for an edge, in dot coordinates (1-based, top-left).
function edgeLabel(kind, row, col, owner, isLast) {
  return joinLabel(
    kind === 'h'
      ? `Horizontal line, dot row ${row + 1}, dots ${col + 1} to ${col + 2}`
      : `Vertical line, dot column ${col + 1}, dots ${row + 1} to ${row + 2}`,
    owner ? `drawn by ${owner}` : 'open',
    isLast && 'last move',
  )
}

// The visible stroke inside an edge's (much larger, transparent) tap band:
// open edges are a thin faint rule so the grid reads as dots + lines rather
// than a dense checker; drawn edges are a bold bar in the owner's colour.
function EdgeLine({ kind, owner, hovered, turn, isLast }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute rounded-full transition-all duration-100 pointer-events-none',
        kind === 'h'
          ? cn('left-0 right-0 top-1/2 -translate-y-1/2', owner ? 'h-[6px]' : hovered ? 'h-1' : 'h-[2px]')
          : cn('top-0 bottom-0 left-1/2 -translate-x-1/2', owner ? 'w-[6px]' : hovered ? 'w-1' : 'w-[2px]'),
        owner === 'X'
          ? 'bg-retro-p1 shadow-neon-p1'
          : owner === 'O'
            ? 'bg-retro-p2 shadow-neon-p2'
            : hovered
              ? (turn === 'X' ? 'bg-retro-p1/60' : 'bg-retro-p2/60')
              : 'bg-retro-border/70',
        // M-47: persistent marker on the most recently claimed edge
        isLast && 'ring-2 ring-retro-cta/70',
      )}
    />
  )
}

export default function DotsAndBoxesBoard({ board, boxes, onMove, disabled, currentTurn, lastMove = null, size = DB_SIZE }) {
  const [hoveredEdge, setHoveredEdge] = useState(null)

  const xCount = boxes ? boxes.filter(b => b === 'X').length : 0
  const oCount = boxes ? boxes.filter(b => b === 'O').length : 0

  const grid = size * 2 + 1
  const cells = []
  for (let i = 0; i < grid * grid; i++) {
    const gr = Math.floor(i / grid)
    const gc = i % grid

    const isEvenRow = gr % 2 === 0
    const isEvenCol = gc % 2 === 0

    if (isEvenRow && isEvenCol) {
      // Dot
      cells.push(
        <div key={i} className="flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-retro-text relative z-20" />
        </div>
      )
    } else if (isEvenRow && !isEvenCol) {
      // Horizontal edge
      const row = gr / 2
      const col = (gc - 1) / 2
      const edgeIdx = hEdgeIndex(row, col, size)
      const owner = board[edgeIdx]
      const isHovered = hoveredEdge === edgeIdx && !disabled && !owner

      cells.push(
        <div key={i} className="relative flex items-center justify-center">
          <button
            data-testid={`edge-h-${row}-${col}`}
            aria-label={edgeLabel('h', row, col, owner, edgeIdx === lastMove)}
            disabled={!!owner || disabled}
            onClick={() => !owner && !disabled && onMove(edgeIdx)}
            onMouseEnter={() => setHoveredEdge(edgeIdx)}
            onMouseLeave={() => setHoveredEdge(null)}
            className={cn(
              'absolute z-10 -top-[17px] -bottom-[17px] left-0 right-0',
              'bg-transparent',
              !owner && !disabled ? 'cursor-pointer' : 'cursor-default',
            )}
          >
            {/* the tap band overhangs the 10px track by 17px each side; the
                stroke sits back on the track itself */}
            <span className="absolute left-0 right-0 top-[17px] bottom-[17px]">
              <EdgeLine kind='h' owner={owner} hovered={isHovered} turn={currentTurn} isLast={edgeIdx === lastMove} />
            </span>
          </button>
        </div>
      )
    } else if (!isEvenRow && isEvenCol) {
      // Vertical edge
      const row = (gr - 1) / 2
      const col = gc / 2
      const edgeIdx = vEdgeIndex(row, col, size)
      const owner = board[edgeIdx]
      const isHovered = hoveredEdge === edgeIdx && !disabled && !owner

      cells.push(
        <div key={i} className="relative flex items-center justify-center">
          <button
            data-testid={`edge-v-${row}-${col}`}
            aria-label={edgeLabel('v', row, col, owner, edgeIdx === lastMove)}
            disabled={!!owner || disabled}
            onClick={() => !owner && !disabled && onMove(edgeIdx)}
            onMouseEnter={() => setHoveredEdge(edgeIdx)}
            onMouseLeave={() => setHoveredEdge(null)}
            className={cn(
              'absolute z-10 top-0 bottom-0 -left-[17px] -right-[17px]',
              'bg-transparent',
              !owner && !disabled ? 'cursor-pointer' : 'cursor-default',
            )}
          >
            {/* the tap band overhangs the 10px track by 17px each side; the
                stroke sits back on the track itself */}
            <span className="absolute top-0 bottom-0 left-[17px] right-[17px]">
              <EdgeLine kind='v' owner={owner} hovered={isHovered} turn={currentTurn} isLast={edgeIdx === lastMove} />
            </span>
          </button>
        </div>
      )
    } else {
      // Box cell: odd row, odd col
      const boxRow = (gr - 1) / 2
      const boxCol = (gc - 1) / 2
      const boxIdx = boxRow * size + boxCol
      const owner = boxes ? boxes[boxIdx] : ''

      cells.push(
        <div
          key={i}
          role={owner ? 'img' : undefined}
          aria-label={owner ? `Box, row ${boxRow + 1}, column ${boxCol + 1}, ${owner}` : undefined}
          className={cn(
            'flex items-center justify-center rounded-sm',
            owner === 'X' ? 'bg-retro-p1/20' : owner === 'O' ? 'bg-retro-p2/20' : '',
          )}
        >
          {owner && (
            <span
              className={cn(
                'font-pixel text-[10px]',
                owner === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2',
              )}
              style={{ animation: 'box-claim 0.25s ease-out both' }}
            >
              {owner}
            </span>
          )}
        </div>
      )
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div
        className={cn(
          'bg-retro-surface border-2 border-retro-border rounded p-[18px] transition-all duration-200',
          disabled && 'board-idle',
        )}
      >
        <div
          className="aspect-square w-full"
          style={{
            display: 'grid',
            gridTemplateRows: `10px repeat(${size}, minmax(0,1fr) 10px)`,
            gridTemplateColumns: `10px repeat(${size}, minmax(0,1fr) 10px)`,
          }}
        >
          {cells}
        </div>
      </div>

      {/* Box count bar */}
      <div className="mt-2 flex items-center justify-center gap-3 font-pixel text-[10px]">
        <span className="text-retro-p1 text-glow-p1">X {xCount}</span>
        <span className="text-retro-dim">—</span>
        <span className="text-retro-p2 text-glow-p2">{oCount} O</span>
      </div>
    </div>
  )
}
