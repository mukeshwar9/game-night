import { cn } from '@/lib/utils'
import Avatar from './Avatar'

const STATUS_LABEL = {
  waiting: 'WAITING FOR PLAYERS',
  playing: 'ROUND IN PROGRESS',
  finished: 'ROUND OVER',
}

function PlayerChip({ symbol, player, reverse }) {
  const isX = symbol === 'X'
  return (
    <div className={cn('flex items-center gap-2 min-w-0 flex-1', reverse && 'flex-row-reverse text-right')}>
      {player?.avatar ? (
        <Avatar id={player.avatar} size={28} className="flex-shrink-0" />
      ) : (
        <span className={cn(
          'font-pixel text-[9px] w-7 h-7 flex items-center justify-center rounded flex-shrink-0',
          isX ? 'text-retro-p1 bg-retro-tint-p1' : 'text-retro-p2 bg-retro-tint-p2',
        )}>
          {symbol}
        </span>
      )}
      <p className={cn('font-mono text-xs truncate', isX ? 'text-retro-p1' : 'text-retro-p2')}>
        {player?.name || '···'}
      </p>
    </div>
  )
}

// Shared spectator floor for custom 2P game pages: who's playing, match score,
// and a status line — see F-29 (UX-IMPROVEMENTS.md).
export default function SpectatorCard({ game, statusOverride }) {
  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const status = statusOverride || STATUS_LABEL[game.status] || STATUS_LABEL.playing

  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <PlayerChip symbol="X" player={game.players?.X} />
        <span className="font-pixel text-sm text-retro-text tabular-nums flex-shrink-0 px-1">
          {scoreX} – {scoreO}
        </span>
        <PlayerChip symbol="O" player={game.players?.O} reverse />
      </div>
      <p className="font-pixel text-[9px] text-retro-dim text-center tracking-wide">
        {status}
      </p>
    </div>
  )
}
