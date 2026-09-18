import { useMemo } from 'react'
import { YV_ROW_LENGTHS, YV_CELLS, yvIndexOf, normalizeYvBoard } from '../lib/yavalathLogic'
import { cn } from '@/lib/utils'

// YAVALATH — 61-hex hexagon. FOUR in a row wins, THREE in a row LOSES.
// Placement game (Hex-style): taps report the cell index. Pointy-top hexes
// via CSS clip-path on a row-offset grid, colors fully theme-driven. Danger
// preview: a cell where the mover's placement would form THREE of their own
// color gets a warning tint — the Lose-3 rule made visible before you tap.
export default function YavalathBoard({
  board: rawBoard, onMove, disabled, lastMove = null, mover = 'X', winningLine = [],
}) {
  const board = useMemo(() => normalizeYvBoard(rawBoard), [rawBoard])

  // (row, col) → index and index → axial, derived once from YV_CELLS.
  const lookup = useMemo(() => {
    const rc = []
    for (const c of YV_CELLS) {
      ;(rc[c.row] ??= [])[c.col] = c.index
    }
    return rc
  }, [])

  // Cells where placing `mover` would create a 3-run of their own color.
  const suicide = useMemo(() => {
    if (disabled) return new Set()
    const bad = new Set()
    for (const { index: i, q, r } of YV_CELLS) {
      if (board[i] !== '') continue
      for (const [dq, dr] of [[1, 0], [1, -1], [0, 1]]) {
        let count = 1
        for (const s of [1, -1]) {
          let qq = q + dq * s
          let rr = r + dr * s
          let n = yvIndexOf(qq, rr)
          while (n >= 0 && board[n] === mover) {
            count++
            qq += dq * s
            rr += dr * s
            n = yvIndexOf(qq, rr)
          }
        }
        if (count >= 3) { bad.add(i); break }
      }
    }
    return bad
  }, [board, mover, disabled])

  return (
    <div className="w-full max-w-[400px] sm:max-w-[440px] mx-auto">
      <div className={cn(
        'bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'opacity-60 saturate-50',
      )}>
        <div className="flex flex-col items-center gap-0.5">
          {YV_ROW_LENGTHS.map((len, row) => (
            <div key={row} className="flex gap-0.5 sm:gap-1">
              {Array.from({ length: len }, (_, col) => {
                const cell = lookup[row][col]
                const v = board[cell]
                const isSuicide = suicide.has(cell)
                const isWin = winningLine.includes(cell)
                const isLast = cell === lastMove
                return (
                  <button
                    key={col}
                    aria-label={`yv-hex-${row}-${col}${v ? `-${v}` : ''}`}
                    disabled={disabled}
                    onClick={() => !disabled && onMove(cell)}
                    className={cn(
                      'w-[10.5%] min-w-[30px] aspect-[1/0.87] select-none transition-all duration-100 outline-none',
                      'flex items-center justify-center font-pixel text-xs sm:text-sm',
                      'focus-visible:ring-2 focus-visible:ring-retro-cta',
                      !disabled && !v && 'cursor-pointer hover:brightness-125 active:scale-95',
                    )}
                    style={{
                      clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                      background: v
                        ? (v === 'X' ? 'rgb(var(--c-p1))' : 'rgb(var(--c-p2))')
                        : 'rgb(var(--c-surface))',
                      boxShadow: isWin
                        ? 'inset 0 0 0 2px rgb(var(--c-cta))'
                        : isLast
                          ? 'inset 0 0 0 2px rgb(var(--c-cta) / 0.6)'
                          : 'inset 0 0 0 1.5px rgb(var(--c-border) / 0.7)',
                      margin: '0 1px',
                    }}
                  >
                    {v && (
                      <span style={{ animation: 'place-pop 0.2s ease-out' }} className={cn(
                        v === 'X' ? 'text-retro-bg text-glow-p1' : 'text-retro-bg text-glow-p2',
                      )}>
                        {v}
                      </span>
                    )}
                    {!v && isSuicide && (
                      <span className="font-pixel text-[8px]" style={{ color: 'rgb(var(--c-p2) / 0.8)' }}>3!</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-center font-pixel text-[8px] text-retro-dim tracking-wider">
          FOUR IN A ROW WINS · THREE IN A ROW LOSES
        </p>
      </div>
    </div>
  )
}
