import { useState } from 'react'
import { cn } from '@/lib/utils'
import { hEdgeIndex, vEdgeIndex } from '../lib/dotsAndBoxesLogic'

export default function DotsAndBoxesBoard({ board, boxes, onMove, disabled, currentTurn, lastMove = null }) {
  const [hoveredEdge, setHoveredEdge] = useState(null)

  const xCount = boxes ? boxes.filter(b => b === 'X').length : 0
  const oCount = boxes ? boxes.filter(b => b === 'O').length : 0

  // 9x9 grid: even rows/cols = dots, odd=edges/boxes
  // gr = grid row 0-8, gc = grid col 0-8
  const cells = []
  for (let i = 0; i < 81; i++) {
    const gr = Math.floor(i / 9)
    const gc = i % 9

    const isEvenRow = gr % 2 === 0
    const isEvenCol = gc % 2 === 0

    if (isEvenRow && isEvenCol) {
      // Dot
      cells.push(
        <div key={i} className="flex items-center justify-center">
          <div className="w-2 h-2 rounded-sm bg-retro-dim" />
        </div>
      )
    } else if (isEvenRow && !isEvenCol) {
      // Horizontal edge
      const row = gr / 2
      const col = (gc - 1) / 2
      const edgeIdx = hEdgeIndex(row, col)
      const owner = board[edgeIdx]
      const isHovered = hoveredEdge === edgeIdx && !disabled && !owner
      const hoverColor = currentTurn === 'X' ? 'bg-retro-p1/40' : 'bg-retro-p2/40'

      cells.push(
        <div key={i} className="relative flex items-center justify-center">
          <button
            aria-label={`edge-h-${row}-${col}`}
            disabled={!!owner || disabled}
            onClick={() => !owner && !disabled && onMove(edgeIdx)}
            onMouseEnter={() => setHoveredEdge(edgeIdx)}
            onMouseLeave={() => setHoveredEdge(null)}
            className={cn(
              'absolute z-10 -top-[15px] -bottom-[15px] left-0 right-0',
              'rounded-sm transition-all duration-100',
              owner === 'X'
                ? 'bg-retro-p1 shadow-neon-p1'
                : owner === 'O'
                  ? 'bg-retro-p2 shadow-neon-p2'
                  : isHovered
                    ? hoverColor
                    : 'bg-retro-border/50',
              !owner && !disabled ? 'cursor-pointer' : 'cursor-default',
              // M-47: persistent marker on the most recently claimed edge
              edgeIdx === lastMove && 'ring-2 ring-inset ring-retro-cta/70',
            )}
          />
        </div>
      )
    } else if (!isEvenRow && isEvenCol) {
      // Vertical edge
      const row = (gr - 1) / 2
      const col = gc / 2
      const edgeIdx = vEdgeIndex(row, col)
      const owner = board[edgeIdx]
      const isHovered = hoveredEdge === edgeIdx && !disabled && !owner
      const hoverColor = currentTurn === 'X' ? 'bg-retro-p1/40' : 'bg-retro-p2/40'

      cells.push(
        <div key={i} className="relative flex items-center justify-center">
          <button
            aria-label={`edge-v-${row}-${col}`}
            disabled={!!owner || disabled}
            onClick={() => !owner && !disabled && onMove(edgeIdx)}
            onMouseEnter={() => setHoveredEdge(edgeIdx)}
            onMouseLeave={() => setHoveredEdge(null)}
            className={cn(
              'absolute z-10 top-0 bottom-0 -left-[15px] -right-[15px]',
              'rounded-sm transition-all duration-100',
              owner === 'X'
                ? 'bg-retro-p1 shadow-neon-p1'
                : owner === 'O'
                  ? 'bg-retro-p2 shadow-neon-p2'
                  : isHovered
                    ? hoverColor
                    : 'bg-retro-border/50',
              !owner && !disabled ? 'cursor-pointer' : 'cursor-default',
              // M-47: persistent marker on the most recently claimed edge
              edgeIdx === lastMove && 'ring-2 ring-inset ring-retro-cta/70',
            )}
          />
        </div>
      )
    } else {
      // Box cell: odd row, odd col
      const boxIdx = ((gr - 1) / 2) * 4 + (gc - 1) / 2
      const owner = boxes ? boxes[boxIdx] : ''

      cells.push(
        <div
          key={i}
          className={cn(
            'flex items-center justify-center rounded-sm',
            owner === 'X' ? 'bg-retro-p1/15' : owner === 'O' ? 'bg-retro-p2/15' : '',
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
          'bg-retro-surface border-2 border-retro-border rounded p-3 transition-all duration-200',
          disabled && 'opacity-60 saturate-50',
        )}
      >
        <div
          className="aspect-square w-full"
          style={{
            display: 'grid',
            gridTemplateRows: '14px repeat(4, minmax(0,1fr) 14px)',
            gridTemplateColumns: '14px repeat(4, minmax(0,1fr) 14px)',
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
