import { cn } from '@/lib/utils'
import GameSwitcher from './GameSwitcher'

const MATCH_WINS = 3

export default function GameStatus({ status, winner, currentTurn, mySymbol, scores, players, gameType, onPlayAgain, onNewMatch, onSwitchGame }) {
  const scoreX = scores?.X || 0
  const scoreO = scores?.O || 0
  const matchWinner = scoreX >= MATCH_WINS ? 'X' : scoreO >= MATCH_WINS ? 'O' : null

  const RetroButton = ({ onClick, children }) => (
    <button
      onClick={onClick}
      className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs
        rounded hover:shadow-neon-cta transition-all active:scale-95"
    >
      {children}
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
        {onNewMatch && <RetroButton onClick={onNewMatch}>NEW MATCH</RetroButton>}
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
        {onPlayAgain && <RetroButton onClick={onPlayAgain}>PLAY AGAIN</RetroButton>}
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
