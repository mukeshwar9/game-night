import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { getPlayerId } from '../lib/playerId'
import { normalizeQueue, canTakeSeat } from '../lib/nightLogic'
import { hostUidOf, joinQueue, leaveQueue } from '../lib/night'
import NightScoreboard from './NightScoreboard'
import HostControls from './HostControls'
import TimerScalePicker from './TimerScalePicker'

// Everything game-night mode adds to a room, below the game area: the
// REMOVED BY HOST notice, the winner-stays line (a party room playing a 2P
// game), the lobby timer picker for party rooms (2P rooms show it in
// WaitingRoom), tonight's scoreboard between games, and the host controls.
// `nPlayer` is the current game's seat family. (Party-lobby latecomers are
// seated by useRoomSession, which also honours LOCK ROOM / KICK.)
export default function NightPanel({ game, gameId, nPlayer }) {
  const myUid = getPlayerId()
  const hostUid = hostUidOf(game)
  const isHost = !!myUid && hostUid === myUid
  const kicked = !!game?.kicked?.[myUid]
  const queue = normalizeQueue(game?.queue)
  const seated = nPlayer
    ? !!game?.players?.[myUid]
    : game?.players?.X?.playerId === myUid || game?.players?.O?.playerId === myUid
  const myPlace = queue.findIndex(q => q.uid === myUid)
  const showQueue = !nPlayer && (!!game?.partyRoom || queue.length > 0)
  const [queueBusy, runQueue] = useBusy()

  // One toast when the host removes this player (the banner below stays).
  const wasKicked = useRef(kicked)
  useEffect(() => {
    if (kicked && !wasKicked.current) toast.error('REMOVED BY HOST')
    wasKicked.current = kicked
  }, [kicked])

  const onJoinQueue = () => runQueue(async () => {
    const ok = await joinQueue(gameId, game)
    if (!ok) toast.error(game?.locked ? 'ROOM IS LOCKED' : "COULDN'T JOIN THE LINE")
  }, () => toast.error("COULDN'T JOIN THE LINE — TRY AGAIN"))

  const onLeaveQueue = () => runQueue(() => leaveQueue(gameId), () => toast.error("COULDN'T LEAVE THE LINE — TRY AGAIN"))

  return (
    <div className="w-full space-y-3" data-testid="night-panel">
      {kicked && (
        <div className="border-2 border-retro-danger/60 bg-retro-card rounded p-3 text-center space-y-1" role="status">
          <p className="font-pixel text-[10px] text-retro-danger text-glow-danger tracking-widest">REMOVED BY HOST</p>
          <p className="font-mono text-[11px] text-retro-dim">YOU&apos;RE SPECTATING THIS MATCH.</p>
        </div>
      )}

      {game?.locked && (
        <p className="text-center font-pixel text-[8px] text-retro-dim tracking-wider">ROOM LOCKED · NO NEW SEATS</p>
      )}

      {showQueue && (
        <div className="w-full bg-retro-card border border-retro-border rounded p-3 space-y-2 text-center" data-testid="night-queue">
          <p className="font-pixel text-[9px] text-retro-dim tracking-wider">WINNER STAYS · UP NEXT</p>
          <p className="font-mono text-xs text-retro-text">
            {queue.length ? queue.map(q => (q.uid === myUid ? `${q.name} (YOU)` : q.name)).join(' → ') : 'NOBODY WAITING'}
          </p>
          {!seated && myPlace >= 0 && (
            <button
              onClick={onLeaveQueue}
              disabled={queueBusy}
              className="min-h-11 px-4 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:text-retro-text transition-all active:scale-95 disabled:opacity-50"
            >
              {queueBusy ? 'LEAVING…' : `YOU'RE #${myPlace + 1} · LEAVE LINE`}
            </button>
          )}
          {!seated && myPlace < 0 && canTakeSeat(game, myUid) && (
            <button
              onClick={onJoinQueue}
              disabled={queueBusy}
              className="min-h-11 px-4 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
            >
              {queueBusy ? 'JOINING…' : 'JOIN THE LINE'}
            </button>
          )}
        </div>
      )}

      {nPlayer && game?.status === 'waiting' && (
        <TimerScalePicker gameId={gameId} game={game} canEdit={isHost} />
      )}

      {game?.status !== 'playing' && (
        <NightScoreboard game={game} gameId={gameId} myUid={myUid} isHost={isHost} />
      )}

      {isHost && (
        <HostControls game={game} gameId={gameId} nPlayer={nPlayer} myUid={myUid} hostUid={hostUid} />
      )}
    </div>
  )
}
