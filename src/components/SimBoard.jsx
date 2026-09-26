import { SIM_DOT_POS, SIM_EDGES, SIM_EDGE_COUNT } from '../lib/simLogic'
import { cn } from '@/lib/utils'
import { joinLabel } from '../lib/a11yLabels'

const dotName = (d) => String.fromCharCode(65 + d)

// SIM — 6 dots on a circle, 15 edges. Edge i renders as the straight line
// between its two endpoint dots. Colors are 100%-theme-driven via --c-*:
// X edges use --c-p1, O edges --c-p2, unclaimed edges --c-border at low
// emphasis (SVG presentation attrs can't hold var(), so fill/stroke go
// through style props — see .claude/rules/theming-rules.md).
export default function SimBoard({ board, onMove, disabled, winningLine = [], lastMove = null }) {
  // Edge midpoint in the 0-100 coordinate space; hit areas live on an
  // overlaid button row (SVG lines are too thin to tap on phones).
  const midpoint = (edgeIndex) => {
    const [a, b] = SIM_EDGES[edgeIndex]
    return {
      x: (SIM_DOT_POS[a].x + SIM_DOT_POS[b].x) / 2,
      y: (SIM_DOT_POS[a].y + SIM_DOT_POS[b].y) / 2,
    }
  }

  return (
    <div className="w-full max-w-[340px] sm:max-w-[400px] mx-auto">
      <div className={cn(
        'relative bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'board-idle',
      )}>
        {/* Board geometry: SVG viewBox 0 0 100 100, preserveAspectRatio keeps
            the circle circular. Lines carry the stroke, dots sit on top. */}
        <svg viewBox="0 0 100 100" className="w-full h-auto block" aria-hidden="true">
          {/* Unclaimed edges first (dim), then claimed edges on top */}
          {SIM_EDGES.map(([a, b], i) => board[i] ? null : (
            <line
              key={`empty-${i}`}
              x1={SIM_DOT_POS[a].x} y1={SIM_DOT_POS[a].y}
              x2={SIM_DOT_POS[b].x} y2={SIM_DOT_POS[b].y}
              style={{ stroke: 'rgb(var(--c-border))' }}
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          ))}
          {SIM_EDGES.map(([a, b], i) => {
            if (!board[i]) return null
            const isWinning = winningLine.includes(i)
            const colorVar = board[i] === 'X' ? '--c-p1' : '--c-p2'
            return (
              <line
                key={`claim-${i}`}
                x1={SIM_DOT_POS[a].x} y1={SIM_DOT_POS[a].y}
                x2={SIM_DOT_POS[b].x} y2={SIM_DOT_POS[b].y}
                style={{
                  stroke: `rgb(var(${colorVar}))`,
                  filter: isWinning
                    ? `drop-shadow(0 0 3px rgb(var(${colorVar})))`
                    : undefined,
                }}
                strokeWidth={isWinning ? 3.5 : 2.5}
                strokeLinecap="round"
              />
            )
          })}
          {/* Dots */}
          {SIM_DOT_POS.map((p, d) => (
            <circle
              key={`dot-${d}`}
              cx={p.x} cy={p.y} r="3.2"
              style={{ fill: 'rgb(var(--c-text))' }}
            />
          ))}
        </svg>

        {/* Tap targets: one 40px-ish button per edge midpoint (15 total).
            Claimed/unavailable edges render disabled. */}
        <div className="absolute inset-0">
          {SIM_EDGES.map(([a, b], i) => {
            const mid = midpoint(i)
            const claimed = !!board[i]
            const clickable = !disabled && !claimed
            return (
              <button
                key={`tap-${i}`}
                data-testid={`edge-${i}`}
                aria-label={joinLabel(
                  `Line ${dotName(a)} to ${dotName(b)}`,
                  claimed ? `claimed by ${board[i]}` : 'open',
                  winningLine.includes(i) && 'losing triangle',
                  i === lastMove && 'last move',
                )}
                disabled={!clickable}
                onClick={() => clickable && onMove(i)}
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 w-[14%] h-[14%] max-w-12 max-h-12 rounded-full',
                  'flex items-center justify-center transition-all duration-100 touch-manipulation',
                  clickable && 'cursor-pointer hover:bg-retro-tint-cta/40 active:scale-90',
                  !clickable && 'cursor-default',
                )}
                style={{ left: `${mid.x}%`, top: `${mid.y}%` }}
              />
            )
          })}
        </div>
      </div>

      {/* lastMove hint: ring the midpoint of the newest claim (M-47 parity) */}
      {lastMove != null && lastMove >= 0 && lastMove < SIM_EDGE_COUNT && (
        <p className="mt-2 text-center font-pixel text-[8px] text-retro-dim">
          LAST: {dotName(SIM_EDGES[lastMove][0])}–{dotName(SIM_EDGES[lastMove][1])}
        </p>
      )}
    </div>
  )
}
