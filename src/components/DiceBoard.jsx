import { cn } from '@/lib/utils'
import { PIG_TARGET } from '../lib/diceLogic'

// Pip positions per face on a 3×3 grid (indices 0–8, left→right, top→bottom).
const PIP_LAYOUT = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function Die({ value, bust }) {
  const pips = PIP_LAYOUT[value] || []
  const isBust = bust || value === 1
  return (
    <div
      className={cn(
        'w-24 h-24 rounded-lg border-2 p-3',
        'bg-retro-surface',
        isBust
          ? 'border-retro-p2 shadow-neon-p2'
          : 'border-retro-cta shadow-neon-cta',
      )}
      style={{ animation: isBust ? 'dice-bust 0.4s ease-out both' : 'box-claim 0.2s ease-out both' }}
    >
      <div className="grid grid-cols-3 grid-rows-3 w-full h-full gap-1">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="flex items-center justify-center">
            {pips.includes(i) && (
              <span
                className={cn(
                  'w-3 h-3 rounded-full',
                  isBust ? 'bg-retro-p2 shadow-glow-dot' : 'bg-retro-cta shadow-glow-dot',
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Mini die face for the roll-history trail.
function MiniDie({ value }) {
  const pips = PIP_LAYOUT[value] || []
  return (
    <div className="w-5 h-5 rounded border border-retro-border bg-retro-surface grid grid-cols-3 grid-rows-3 gap-0.5 p-0.5 opacity-80">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center justify-center">
          {pips.includes(i) && <span className="w-1 h-1 rounded-full bg-retro-cta shadow-glow-dot" />}
        </div>
      ))}
    </div>
  )
}

export default function DiceBoard({
  onMove,
  disabled,
  currentTurn,
  diceScoreX = 0,
  diceScoreO = 0,
  diceTurnScore = 0,
  diceLast = null,
  diceRolls = [],
  diceSeed = null,
}) {
  const turnColor = currentTurn === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2'

  const trail = Array.isArray(diceRolls) ? diceRolls : []
  const TRAIL_CAP = 12
  const overflow = trail.length > TRAIL_CAP
  const shown = overflow ? trail.slice(trail.length - TRAIL_CAP) : trail

  const justBusted = diceLast === 1

  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="bg-retro-surface border-2 border-retro-border rounded p-4 flex flex-col items-center gap-3">
        {/* Banked scores */}
        <div className="flex items-stretch justify-center gap-3 w-full">
          <div
            className={cn(
              'flex-1 rounded border-2 p-2 text-center',
              currentTurn === 'X' ? 'border-retro-p1 shadow-neon-p1' : 'border-retro-border',
            )}
          >
            <div className="font-pixel text-[9px] text-retro-p1 text-glow-p1">X</div>
            <div className="font-pixel text-lg text-retro-p1 text-glow-p1 mt-1">{diceScoreX}</div>
          </div>
          <div className="flex flex-col items-center justify-center font-pixel text-[8px] text-retro-dim">
            <span>TO</span>
            <span>{PIG_TARGET}</span>
          </div>
          <div
            className={cn(
              'flex-1 rounded border-2 p-2 text-center',
              currentTurn === 'O' ? 'border-retro-p2 shadow-neon-p2' : 'border-retro-border',
            )}
          >
            <div className="font-pixel text-[9px] text-retro-p2 text-glow-p2">O</div>
            <div className="font-pixel text-lg text-retro-p2 text-glow-p2 mt-1">{diceScoreO}</div>
          </div>
        </div>

        {/* Roll-history trail (this turn's at-risk rolls) */}
        <div className="min-h-[20px] flex items-center justify-center gap-1 flex-wrap">
          {overflow && <span className="font-pixel text-[8px] text-retro-dim">…</span>}
          {shown.map((v, i) => (
            <MiniDie key={i} value={v} />
          ))}
        </div>

        {/* The last die */}
        <div className="h-24 flex items-center justify-center">
          {diceLast ? (
            <Die value={diceLast} bust={justBusted} />
          ) : (
            <div className="w-24 h-24 rounded-lg border-2 border-dashed border-retro-border flex items-center justify-center">
              <span className="font-pixel text-[8px] text-retro-dim text-center leading-relaxed">
                ROLL<br />TO<br />START
              </span>
            </div>
          )}
        </div>

        {/* At-risk turn score */}
        <div className="text-center">
          <div className="font-pixel text-[8px] text-retro-dim">AT RISK</div>
          <div className={cn('font-pixel text-base mt-1', turnColor)}>{diceTurnScore}</div>
        </div>

        {/* Fair-play verified badge when a deterministic seed is in play */}
        {diceSeed && (
          <div className="font-pixel text-[8px] text-retro-win text-glow-win">✓ FAIR ROLL</div>
        )}

        {/* ROLL / BANK */}
        <div className="flex items-center justify-center gap-3 w-full">
          <button
            aria-label="roll"
            disabled={disabled}
            onClick={() => !disabled && onMove('roll')}
            className={cn(
              'flex-1 h-12 rounded border-2 font-pixel text-[11px]',
              'transition-all duration-100 active:scale-95',
              disabled
                ? 'border-retro-border text-retro-dim opacity-50 cursor-default'
                : 'border-retro-cta text-retro-cta shadow-neon-cta cursor-pointer hover:bg-retro-tint-cta',
            )}
          >
            ROLL
          </button>
          <button
            aria-label="bank"
            disabled={disabled || diceTurnScore === 0}
            onClick={() => !disabled && diceTurnScore > 0 && onMove('bank')}
            className={cn(
              'flex-1 h-12 rounded border-2 font-pixel text-[11px]',
              'transition-all duration-100 active:scale-95',
              disabled || diceTurnScore === 0
                ? 'border-retro-border text-retro-dim opacity-50 cursor-default'
                : 'border-retro-win text-retro-win shadow-neon-win cursor-pointer',
            )}
          >
            BANK
          </button>
        </div>
      </div>
    </div>
  )
}