import { cn } from '@/lib/utils'
import GameSwitcher from './GameSwitcher'
import { getGameConfig } from '@/lib/games'
import { shareResult } from '@/lib/shareCard'

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
