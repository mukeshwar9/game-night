import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import GameSwitcher from './GameSwitcher'
import { getGameConfig } from '@/lib/games'
import { shareResult } from '@/lib/shareCard'
import { suggestGames } from '@/lib/gameSuggestions'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MATCH_WINS = 3
// M-67: hold round-end CTAs briefly so an eager tap can't cut the WinEffect
// confetti short before the celebration has had a moment to register.
const CTA_LOCK_MS = 450

function RetroButton({ onClick, children, busy, busyLabel, locked }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || locked}
      className={cn(
        'min-h-11 px-6 py-3 bg-retro-cta text-retro-bg font-pixel text-xs',
        'rounded transition-all active:scale-95 disabled:opacity-50',
        !locked && 'hover:shadow-neon-cta',
      )}
    >
      {busy ? busyLabel : children}
    </button>
  )
}

function ShareButton({ onClick, busy, busyLabel = 'BUILDING…', locked }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || locked}
      className={cn(
        'px-6 py-2.5 min-w-[6.5rem] border-2 border-retro-border text-retro-text font-pixel text-xs',
        'rounded transition-all active:scale-95 disabled:opacity-50',
        !locked && 'hover:border-retro-p1/50 hover:text-retro-p1',
      )}
    >
      {busy ? busyLabel : 'SHARE'}
    </button>
  )
}

// M-43: primary round-end actions (PLAY AGAIN/NEW MATCH + SHARE) render as a
// sticky bottom bar independent of board height, so they're always reachable
// without scrolling. Game.jsx adds matching bottom padding to the page.
function StickyActionBar({ children }) {
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 flex justify-center gap-2 flex-wrap
        bg-retro-bg/95 border-t border-retro-border backdrop-blur-sm
        px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {children}
    </div>
  )
}

export default function GameStatus({ status, winner, currentTurn, mySymbol, scores, players, gameType, extraTurn, onPlayAgain, onNewMatch, onSwitchGame }) {
  const scoreX = scores?.X || 0
  const scoreO = scores?.O || 0
  const matchWinner = scoreX >= MATCH_WINS ? 'X' : scoreO >= MATCH_WINS ? 'O' : null

  const [startBusy, runStart] = useBusy()
  const [shareBusy, runShare] = useBusy()

  // M-67: briefly lock the primary CTAs whenever a round/match freshly ends.
  // Locking is set synchronously during render (React's documented pattern
  // for "adjusting state from props") keyed on the score so it re-arms on
  // every fresh finish; only the un-lock after CTA_LOCK_MS runs in an effect.
  const finishSignature = (status === 'finished' || matchWinner) ? `${status}-${matchWinner}-${scoreX}-${scoreO}` : null
  const [ctaLocked, setCtaLocked] = useState(false)
  const lastFinishRef = useRef(null)
  if (finishSignature !== lastFinishRef.current) {
    lastFinishRef.current = finishSignature
    if (finishSignature && !ctaLocked) setCtaLocked(true)
    if (!finishSignature && ctaLocked) setCtaLocked(false)
  }
  useEffect(() => {
    if (!ctaLocked) return
    const t = setTimeout(() => setCtaLocked(false), CTA_LOCK_MS)
    return () => clearTimeout(t)
  }, [ctaLocked])

  const startAgain = (fn) => runStart(fn, () => toast.error("COULDN'T START — CHECK CONNECTION"))

  const shareScore = (headline, accentVar) => shareResult({
    gameLabel: getGameConfig(gameType)?.label || 'GAME NIGHT',
    headline,
    sub: `${scoreX} – ${scoreO}`,
    accentVar,
    url: window.location.href,
  })

  const share = (headline, accentVar) => runShare(async () => {
    const ok = await shareScore(headline, accentVar)
    if (!ok) toast.error("COULDN'T BUILD SHARE CARD — TRY AGAIN")
  })

  const renderTryNext = () => {
    if (!onSwitchGame) return null
    const suggestions = suggestGames(gameType)
    if (suggestions.length === 0) return null
    return (
      <div className="space-y-1.5">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest">TRY NEXT</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {suggestions.map(g => {
            const Icon = g.Icon
            return (
              <button
                key={g.type}
                onClick={() => onSwitchGame(g.type)}
                className="flex items-center gap-1.5 px-3 py-2 border border-retro-border rounded
                  text-retro-dim hover:border-retro-cta/50 hover:text-retro-text transition-all active:scale-95"
              >
                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                  {Icon && <Icon />}
                </div>
                <span className="font-pixel text-[9px] whitespace-nowrap">{g.variantOf ? (g.variantLabel || g.label) : g.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (matchWinner) {
    const iWon = matchWinner === mySymbol
    const winnerName = players?.[matchWinner]?.name || matchWinner
    return (
      <div className="text-center space-y-4">
        <div className="space-y-2">
          <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
          {/* M-67: entrance animation on the outcome text — keyed by score so
              it replays on every fresh finish (prefers-reduced-motion neuters
              it globally via the animation-duration override in index.css). */}
          <p
            key={`out-${scoreX}-${scoreO}`}
            className={cn(
              'font-pixel text-base',
              iWon ? 'text-retro-cta text-glow-cta' : 'text-retro-dim',
            )}
            style={{ animation: 'modal-pop 0.28s ease-out both' }}
          >
            {iWon ? 'YOU WIN!' : `${winnerName} WINS`}
          </p>
          <p className="font-mono text-sm text-retro-dim">{scoreX} – {scoreO}</p>
        </div>
        {renderTryNext()}
        {onSwitchGame && <GameSwitcher currentType={gameType} onSwitch={onSwitchGame} />}
        <StickyActionBar>
          {onNewMatch && (
            <RetroButton
              onClick={() => startAgain(onNewMatch)}
              busy={startBusy}
              busyLabel="STARTING…"
              locked={ctaLocked}
            >
              NEW MATCH
            </RetroButton>
          )}
          <ShareButton
            onClick={() => share(iWon ? 'YOU WIN!' : `${winnerName} WINS`, matchWinner === 'X' ? '--c-p1' : '--c-p2')}
            busy={shareBusy}
            locked={ctaLocked}
          />
        </StickyActionBar>
      </div>
    )
  }

  if (status === 'finished') {
    const isDraw = winner === 'draw'
    const iWon = winner === mySymbol
    return (
      <div className="text-center space-y-4">
        <p
          key={`out-${scoreX}-${scoreO}`}
          className={cn(
            'font-pixel text-base',
            isDraw
              ? 'text-retro-text'
              : iWon
                ? 'text-retro-cta text-glow-cta'
                : 'text-retro-dim',
          )}
          style={{ animation: 'modal-pop 0.28s ease-out both' }}
        >
          {isDraw ? 'DRAW!' : iWon ? 'YOU WIN!' : mySymbol ? 'GAME OVER' : `${winner} WINS!`}
        </p>
        {renderTryNext()}
        {onSwitchGame && <GameSwitcher currentType={gameType} onSwitch={onSwitchGame} />}
        <StickyActionBar>
          {onPlayAgain && (
            <RetroButton
              onClick={() => startAgain(onPlayAgain)}
              busy={startBusy}
              busyLabel="STARTING…"
              locked={ctaLocked}
            >
              PLAY AGAIN
            </RetroButton>
          )}
          <ShareButton
            onClick={() => share(
              isDraw ? 'DRAW!' : iWon ? 'YOU WIN!' : `${players?.[winner]?.name || winner} WINS`,
              winner === 'X' ? '--c-p1' : winner === 'O' ? '--c-p2' : '--c-cta',
            )}
            busy={shareBusy}
            locked={ctaLocked}
          />
        </StickyActionBar>
      </div>
    )
  }

  if (status === 'playing') {
    // M-48: an extra turn (D&B box / SOS completed) gets a distinct pulse —
    // animate-bounce (Tailwind built-in) reads differently from the steady
    // arcade-blink used for a normal turn, so it can't be misread as a bug.
    if (extraTurn && currentTurn === mySymbol) {
      return (
        <p className="text-center font-pixel text-[10px] tracking-wider">
          <span className="inline-block text-retro-cta text-glow-cta animate-bounce">GO AGAIN!</span>
        </p>
      )
    }
    return (
      <p className="text-center font-pixel text-[10px] tracking-wider">
        {currentTurn === mySymbol
          ? <span className="text-retro-cta text-glow-cta arcade-blink">YOUR TURN</span>
          : <span className="text-retro-dim">OPPONENT&apos;S TURN</span>}
      </p>
    )
  }

  return null
}
