import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import Avatar from './Avatar'
import GameSwitcher from './GameSwitcher'

// Shared pieces for the two-player co-op pages (HUNCH, CONVERGE): the team
// bar with both seats and one status chip, and the end-of-run actions.

export function SeatChip({ symbol, player, online, you = false }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="relative shrink-0">
        {player?.avatar ? <Avatar id={player.avatar} size={28} /> : (
          <span className={cn(
            'flex items-center justify-center w-7 h-7 rounded font-pixel text-[10px] border',
            symbol === 'X' ? 'text-retro-p1 border-retro-p1 bg-retro-tint-p1' : 'text-retro-p2 border-retro-p2 bg-retro-tint-p2',
          )}>{symbol}</span>
        )}
        {online !== undefined && (
          <span
            className={cn('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-retro-bg', online ? 'bg-retro-win' : 'bg-retro-dim')}
            aria-hidden="true"
          />
        )}
      </div>
      <span className="font-mono text-[10px] truncate max-w-[6.5rem]">
        {player?.name || symbol}{you && <span className="text-retro-dim"> (you)</span>}
      </span>
    </div>
  )
}

/**
 * Both seats either side of a status chip, with one line of team stats.
 * `tone`: 'go' (your move), 'win', 'bad' or undefined (neutral).
 */
export function CoopTeamBar({ game, mySymbol, opponentOnline, status, tone, stats }) {
  const onlineOf = (seat) => (!mySymbol ? undefined : seat === mySymbol ? true : opponentOnline)
  return (
    <div className="w-full flex items-center justify-between gap-2">
      <SeatChip symbol="X" player={game.players?.X} online={onlineOf('X')} you={mySymbol === 'X'} />
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span
          className={cn(
            'px-3 py-1.5 rounded-full border font-pixel text-[9px] tracking-widest text-center',
            tone === 'win' ? 'border-retro-win text-retro-win bg-retro-card'
              : tone === 'bad' ? 'border-retro-cta text-retro-cta bg-retro-tint-cta'
                : tone === 'go' ? 'border-retro-cta text-retro-cta bg-retro-tint-cta shadow-neon-cta'
                  : 'border-retro-border text-retro-dim',
          )}
          aria-live="polite"
        >{status}</span>
        {stats && <span className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">{stats}</span>}
      </div>
      <SeatChip symbol="O" player={game.players?.O} online={onlineOf('O')} you={mySymbol === 'O'} />
    </div>
  )
}

/** PLAY AGAIN / NEW MATCH / switch, once a run or match is over. */
export function CoopEndActions({ gameType, onPlayAgain, onNewMatch, onSwitchGame, proposal, playAgainLabel = 'PLAY AGAIN' }) {
  const [playAgainBusy, runPlayAgain] = useBusy()
  const [newMatchBusy, runNewMatch] = useBusy()
  if (proposal) return null
  return (
    <div className="w-full flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={() => runPlayAgain(async () => { await onPlayAgain?.() }, () => toast.error('PLAY AGAIN FAILED — CHECK CONNECTION'))}
        disabled={playAgainBusy || !onPlayAgain}
        className="min-h-11 px-4 py-2.5 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] hover:shadow-neon-cta disabled:opacity-50"
      >{playAgainBusy ? 'LOADING…' : playAgainLabel}</button>
      <button
        type="button"
        onClick={() => runNewMatch(async () => { await onNewMatch?.() }, () => toast.error('NEW MATCH FAILED — CHECK CONNECTION'))}
        disabled={newMatchBusy || !onNewMatch}
        className="min-h-11 px-4 py-2.5 rounded border-2 border-retro-border text-retro-text font-pixel text-[10px] hover:border-retro-p1/60 disabled:opacity-50"
      >{newMatchBusy ? 'RESETTING…' : 'NEW MATCH'}</button>
      {onSwitchGame && <GameSwitcher currentType={gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
