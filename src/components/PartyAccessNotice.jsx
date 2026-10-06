import { useState } from 'react'
import { getPlayerId } from '../lib/playerId'
import { effectiveCap, partyFullFor } from '../lib/partyLogic'

// Party-first rooms: what a visitor who can't get in sees above the room.
//  - removed by the host: for the whole party, not just this match
//  - PARTY FULL: the members already fill the cap (a newcomer, or a joiner
//    who lost a race past the cap and was moved out); they can watch or
//    start their own party
export default function PartyAccessNotice({ game, cfg, onStartOwn, busy = false }) {
  const [watching, setWatching] = useState(false)
  if (!game?.partyRoom || watching) return null
  const uid = getPlayerId()
  const removed = !!game.removed?.[uid]
  const full = !removed && partyFullFor(game, !!cfg?.nPlayer, effectiveCap(game, cfg), uid)
  if (!removed && !full) return null
  return (
    <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-3" role="status" data-testid={removed ? 'party-removed' : 'party-full'}>
      <p className="font-pixel text-xs text-retro-text">{removed ? 'REMOVED FROM THIS PARTY' : 'THIS PARTY IS FULL'}</p>
      <p className="font-mono text-xs text-retro-dim">
        {removed
          ? 'The host removed you from this party. You can watch, or start a party of your own.'
          : game.locked
            ? 'The host locked this party. You can watch, or start your own.'
            : 'This party already has as many players as it holds. You can watch, or start your own and invite them later.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setWatching(true)} className="min-h-11 border-2 border-retro-cta text-retro-cta font-pixel text-[9px] rounded transition active:scale-[0.98]">
          WATCH
        </button>
        <button type="button" onClick={onStartOwn} disabled={busy} className="min-h-11 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta transition active:scale-[0.98] disabled:opacity-50">
          {busy ? 'STARTING…' : 'START MY OWN PARTY'}
        </button>
      </div>
    </div>
  )
}
