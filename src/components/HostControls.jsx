import { useState } from 'react'
import { roomMembers } from '../lib/nightLogic'
import { kickPlayer, setRoomLocked, transferHost } from '../lib/night'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import { cn } from '@/lib/utils'

const WHERE_LABEL = { X: 'X', O: 'O', seat: 'PLAYING', queue: 'IN LINE' }

// Host controls (report 4.2 "Party QoL"): kick a player (their seat is freed
// and they can't reclaim it this match), lock the room (no new seats or queue
// places — spectators can still watch), and transfer host. Collapsed behind a
// small toggle so it never crowds the board; every action confirms first.
export default function HostControls({ game, gameId, nPlayer, myUid, hostUid }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(null) // { kind: 'kick'|'host'|'lock', member? }
  const members = roomMembers(game, nPlayer)
  const locked = !!game?.locked

  const dialog = pending && (() => {
    if (pending.kind === 'lock') {
      return {
        title: locked ? 'UNLOCK ROOM?' : 'LOCK ROOM?',
        message: locked ? 'NEW PLAYERS CAN TAKE SEATS AGAIN.' : 'NO NEW SEATS OR PLACES IN LINE. SPECTATORS CAN STILL WATCH.',
        confirmLabel: locked ? 'UNLOCK' : 'LOCK',
        busyLabel: locked ? 'UNLOCKING…' : 'LOCKING…',
        danger: false,
        onConfirm: () => setRoomLocked(gameId, !locked),
      }
    }
    const name = (pending.member.name || '???').toUpperCase()
    if (pending.kind === 'kick') {
      return {
        title: `REMOVE ${name}?`,
        message: pending.member.where === 'queue'
          ? 'THEY LEAVE THE LINE AND CAN’T REJOIN IT THIS MATCH.'
          : (nPlayer ? 'THEY LOSE THEIR SEAT AND CAN’T REJOIN THIS MATCH.' : 'THEY LOSE THEIR SEAT AND THE MATCH RESTARTS.'),
        confirmLabel: 'REMOVE',
        busyLabel: 'REMOVING…',
        danger: true,
        onConfirm: () => kickPlayer(gameId, game, pending.member.uid),
      }
    }
    return {
      title: `MAKE ${name} HOST?`,
      message: 'THEY GET THESE CONTROLS AND YOU LOSE THEM.',
      confirmLabel: 'MAKE HOST',
      busyLabel: 'TRANSFERRING…',
      danger: false,
      onConfirm: () => transferHost(gameId, pending.member.uid),
    }
  })()

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-center gap-2 font-pixel text-[9px] text-retro-dim hover:text-retro-text transition-colors py-2"
      >
        HOST CONTROLS {open ? '▴' : '▾'}
      </button>

      {open && (
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-3" data-testid="host-controls">
          <button
            onClick={() => setPending({ kind: 'lock' })}
            className={cn(
              'w-full min-h-11 font-pixel text-[9px] rounded border-2 transition-all active:scale-95',
              locked
                ? 'border-retro-cta text-retro-cta bg-retro-tint-cta'
                : 'border-retro-border text-retro-text hover:border-retro-p1/50',
            )}
          >
            {locked ? 'UNLOCK ROOM' : 'LOCK ROOM'}
          </button>

          <ul className="space-y-1.5">
            {members.map(m => (
              <li key={m.uid} className="flex items-center gap-2 px-2 py-1.5 rounded border border-retro-border bg-retro-surface">
                <Avatar id={m.avatar} size={20} />
                <span className="font-mono text-xs text-retro-text truncate flex-1 min-w-0">
                  {m.name}{m.uid === myUid ? ' (YOU)' : ''}
                </span>
                <span className="font-pixel text-[7px] text-retro-dim whitespace-nowrap">
                  {m.uid === hostUid ? 'HOST' : WHERE_LABEL[m.where]}
                </span>
                {m.uid !== myUid && (
                  <>
                    <button
                      onClick={() => setPending({ kind: 'host', member: m })}
                      aria-label={`Make ${m.name} host`}
                      className="min-h-9 px-2 font-pixel text-[7px] rounded border border-retro-border text-retro-dim hover:text-retro-text hover:border-retro-p1/50 transition-all active:scale-95"
                    >
                      MAKE HOST
                    </button>
                    <button
                      onClick={() => setPending({ kind: 'kick', member: m })}
                      aria-label={`Remove ${m.name}`}
                      className="min-h-9 px-2 font-pixel text-[7px] rounded border border-retro-danger/60 text-retro-danger hover:bg-retro-tint-danger transition-all active:scale-95"
                    >
                      KICK
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          busyLabel={dialog.busyLabel}
          danger={dialog.danger}
          onConfirm={dialog.onConfirm}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}
