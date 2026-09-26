import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import useBusy from '../hooks/useBusy'
import Avatar from './Avatar'
import GameSwitcher from './GameSwitcher'

// Shared chrome for the two-player co-op card/dice games (Lanterns, Docking):
// both seats in one header with a team status pill, and the end-of-round
// PLAY AGAIN / NEW MATCH / SWITCH row. Word Co-op predates it and keeps its own.

function Seat({ symbol, player, online }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0 max-w-[30%]">
      <div className="relative shrink-0">
        {player?.avatar ? <Avatar id={player.avatar} size={26} /> : (
          <span className={cn(
            'flex items-center justify-center w-[26px] h-[26px] rounded font-pixel border text-[9px]',
            symbol === 'X' ? 'text-retro-p1 border-retro-p1 bg-retro-tint-p1' : 'text-retro-p2 border-retro-p2 bg-retro-tint-p2',
          )}>{symbol}</span>
        )}
        {online !== undefined && (
          <div
            className={cn('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-retro-bg', online ? 'bg-retro-win' : 'bg-retro-dim')}
            aria-hidden="true"
          />
        )}
      </div>
      <span className="font-mono text-[10px] truncate">{player?.name || symbol}</span>
    </div>
  )
}

export function TeamHeader({ game, mySymbol, opponentOnline, status, tone = 'idle', teamLabel }) {
  const spectator = !mySymbol
  const onlineFor = (seat) => (spectator ? undefined : seat === mySymbol ? true : opponentOnline)
  const wins = Math.min(game?.scores?.X || 0, game?.scores?.O || 0)
  return (
    <div className="w-full flex items-center justify-between gap-2">
      <Seat symbol="X" player={game?.players?.X} online={onlineFor('X')} />
      <div className="flex flex-col items-center gap-1 min-w-0">
        <span
          className={cn(
            'px-3 py-1.5 rounded-full border font-pixel text-[9px] tracking-widest text-center',
            tone === 'win' ? 'border-retro-win text-retro-win bg-retro-card'
              : tone === 'loss' ? 'border-retro-danger text-retro-danger bg-retro-tint-danger'
                : tone === 'act' ? 'border-retro-cta text-retro-cta bg-retro-tint-cta shadow-neon-cta'
                  : 'border-retro-border text-retro-dim',
          )}
          aria-live="polite"
        >{status}</span>
        <span className="font-pixel text-[8px] text-retro-dim tracking-widest">TEAM ★ {wins}{teamLabel ? ` · ${teamLabel}` : ''}</span>
      </div>
      <Seat symbol="O" player={game?.players?.O} online={onlineFor('O')} />
    </div>
  )
}

export function RoundEndActions({ gameType, isSpectator, proposal, onPlayAgain, onNewMatch, onSwitchGame }) {
  const [playAgainBusy, runPlayAgain] = useBusy()
  const [newMatchBusy, runNewMatch] = useBusy()
  if (isSpectator || proposal) return null
  const playAgain = () => runPlayAgain(async () => { if (onPlayAgain) await onPlayAgain() },
    () => toast.error('PLAY AGAIN FAILED — CHECK CONNECTION'))
  const newMatch = () => runNewMatch(async () => { if (onNewMatch) await onNewMatch() },
    () => toast.error('NEW MATCH FAILED — CHECK CONNECTION'))
  return (
    <div className="w-full flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={playAgain}
        disabled={playAgainBusy || !onPlayAgain}
        className="min-h-11 px-4 py-2.5 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] hover:shadow-neon-cta disabled:opacity-50"
      >{playAgainBusy ? 'LOADING…' : 'PLAY AGAIN'}</button>
      <button
        type="button"
        onClick={newMatch}
        disabled={newMatchBusy || !onNewMatch}
        className="min-h-11 px-4 py-2.5 rounded border-2 border-retro-border text-retro-text font-pixel text-[10px] hover:border-retro-p1/60 disabled:opacity-50"
      >{newMatchBusy ? 'RESETTING…' : 'NEW MATCH'}</button>
      {onSwitchGame && <GameSwitcher currentType={gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}

// Two big option buttons, used by each game's pre-deal setup screen.
export function SetupChoices({ title, note, options, busy, disabled, onPick }) {
  return (
    <div className="w-full rounded border-2 border-retro-border bg-retro-card p-4 space-y-3 text-center">
      <p className="font-pixel text-[11px] tracking-widest text-retro-cta">{title}</p>
      {note && <p className="font-mono text-[10px] text-retro-dim">{note}</p>}
      <div className="grid gap-2">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onPick(opt.id)}
            disabled={disabled || busy}
            className="min-h-12 px-3 py-2 rounded border-2 border-retro-cta text-left hover:bg-retro-tint-cta disabled:opacity-50"
          >
            <span className="block font-pixel text-[10px] text-retro-cta tracking-wider">{busy === opt.id ? 'DEALING…' : opt.label}</span>
            <span className="block font-mono text-[10px] text-retro-dim">{opt.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
