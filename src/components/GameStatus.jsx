import { cn } from '@/lib/utils'
import GameSwitcher from './GameSwitcher'
import { getGameConfig } from '@/lib/games'
import { shareResult } from '@/lib/shareCard'
import { suggestGames } from '@/lib/gameSuggestions'

const MATCH_WINS = 3

export default function GameStatus({ status, winner, currentTurn, mySymbol, scores, players, gameType, onPlayAgain, onNewMatch, onSwitchGame }) {
  const scoreX = scores?.X || 0
  const scoreO = scores?.O || 0
  const matchWinner = scoreX >= MATCH_WINS ? 'X' : scoreO >= MATCH_WINS ? 'O' : null

  const shareScore = (headline, accentVar) => shareResult({
    gameLabel: getGameConfig(gameType)?.label || 'GAME NIGHT',
    headline,
    sub: `${scoreX} – ${scoreO}`,
    accentVar,
    url: window.location.href,
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

  const RetroButton = ({ onClick, children }) => (
    <button
      onClick={onClick}
      className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs
        rounded hover:shadow-neon-cta transition-all active:scale-95"
    >
      {children}
    </button>
  )

  const ShareButton = ({ onClick }) => (
    <button
      onClick={onClick}
      className="px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs
        rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
    >
      SHARE
    </button>
  )

  if (matchWinner) {
    const iWon = matchWinner === mySymbol
    const winnerName = players?.[matchWinner]?.name || matchWinner
    return (
      <div className="text-center space-y-4">
        <div className="space-y-2">
          <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
          <p className={cn(
            'font-pixel text-base',
            iWon ? 'text-retro-cta text-glow-cta' : 'text-retro-dim',
          )}>
            {iWon ? 'YOU WIN!' : `${winnerName} WINS`}
          </p>
          <p className="font-mono text-sm text-retro-dim">{scoreX} – {scoreO}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {onNewMatch && <RetroButton onClick={onNewMatch}>NEW MATCH</RetroButton>}
          <ShareButton onClick={() => shareScore(iWon ? 'YOU WIN!' : `${winnerName} WINS`, matchWinner === 'X' ? '--c-p1' : '--c-p2')} />
        </div>
        {renderTryNext()}
        {onSwitchGame && <GameSwitcher currentType={gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  if (status === 'finished') {
    const isDraw = winner === 'draw'
    const iWon = winner === mySymbol
    return (
      <div className="text-center space-y-4">
        <p className={cn(
          'font-pixel text-base',
          isDraw
            ? 'text-retro-text'
            : iWon
              ? 'text-retro-cta text-glow-cta'
              : 'text-retro-dim',
        )}>
          {isDraw ? 'DRAW!' : iWon ? 'YOU WIN!' : mySymbol ? 'GAME OVER' : `${winner} WINS!`}
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {onPlayAgain && <RetroButton onClick={onPlayAgain}>PLAY AGAIN</RetroButton>}
          <ShareButton onClick={() => shareScore(
            isDraw ? 'DRAW!' : iWon ? 'YOU WIN!' : `${players?.[winner]?.name || winner} WINS`,
            winner === 'X' ? '--c-p1' : winner === 'O' ? '--c-p2' : '--c-cta',
          )} />
        </div>
        {renderTryNext()}
        {onSwitchGame && <GameSwitcher currentType={gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  if (status === 'playing') {
    return (
      <p className="text-center font-pixel text-[10px] tracking-wider">
        {currentTurn === mySymbol
          ? <span className="text-retro-cta text-glow-cta animate-pulse">YOUR TURN</span>
          : <span className="text-retro-dim">OPPONENT&apos;S TURN</span>}
      </p>
    )
  }

  return null
}
