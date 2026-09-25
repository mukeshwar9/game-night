import { useState } from 'react'
import Avatar from './Avatar'
import { getGameConfig } from '../lib/games'
import { isGuestStyleName } from '../lib/social'
import { NAME_REJECT_MESSAGES, sanitizeDisplayName } from '../lib/moderationLogic'

// "YOU'RE INVITED!" — the first screen an invited friend sees. Says which
// game, who's hosting and how many places are left, and asks for a name in
// one step: type it (saved to the profile, so it sticks) and tap JOIN GAME.
// A visitor who already has a placeholder name can tap JOIN straight away
// and keep it.
function seatsLine(invite) {
  if (!invite) return null
  if (invite.party) {
    if (invite.joinsNextRound) return `${invite.playerCount}/${invite.capacity} PLAYERS · ROUND IN PROGRESS — YOU'LL JOIN NEXT ROUND`
    if (invite.seatsLeft <= 0) return `${invite.playerCount}/${invite.capacity} PLAYERS · FULL — YOU'LL WATCH`
    return `${invite.playerCount}/${invite.capacity} PLAYERS · ${invite.seatsLeft} ${invite.seatsLeft === 1 ? 'SEAT' : 'SEATS'} LEFT`
  }
  if (invite.seatsLeft <= 0) return "ROOM FULL — YOU'LL WATCH"
  return `${invite.seatsLeft} ${invite.seatsLeft === 1 ? 'SEAT' : 'SEATS'} LEFT`
}

export default function InviteJoinScreen({ gameId, invite, currentName = '', onJoin }) {
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  const cfg = invite?.gameType ? getGameConfig(invite.gameType) : null
  const Icon = cfg?.Icon
  // A Guest-XXXX name can be kept with an empty field; no name at all can't.
  const keepable = currentName && isGuestStyleName(currentName) ? currentName : ''

  const submit = () => {
    if (!nameInput.trim()) {
      if (!keepable) { setNameError('ENTER YOUR NAME FIRST'); return }
      onJoin('')
      return
    }
    // Same moderation as Onboarding/Profile (moderationLogic.js).
    const { name, reason } = sanitizeDisplayName(nameInput)
    if (!name) { setNameError(reason === 'empty' ? 'ENTER YOUR NAME FIRST' : NAME_REJECT_MESSAGES[reason]); return }
    onJoin(name)
  }

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h2 className="font-pixel text-sm text-retro-cta text-glow-cta">YOU&apos;RE INVITED!</h2>

        {cfg && (
          <div className="bg-retro-card border-2 border-retro-border rounded p-4 space-y-3">
            <div className="flex items-center justify-center gap-2 text-retro-p1">
              {Icon && <span className="w-6 h-6 flex items-center justify-center shrink-0"><Icon /></span>}
              <span className="font-pixel text-xs text-retro-p1 text-glow-p1 tracking-wider">{cfg.label}</span>
            </div>
            {invite.hostName && (
              <div className="flex items-center justify-center gap-2">
                <Avatar id={invite.hostAvatar} size={28} />
                <span className="font-mono text-xs text-retro-text truncate">
                  <span className="text-retro-dim">HOSTED BY </span>{invite.hostName}
                </span>
              </div>
            )}
            <p className="font-pixel text-[9px] text-retro-dim tracking-wider leading-relaxed">{seatsLine(invite)}</p>
          </div>
        )}

        <p className="font-mono text-xs text-retro-dim">
          ROOM <span className="text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
        </p>
        <input
          type="text"
          placeholder={keepable ? keepable.toUpperCase() : 'PLAYER ONE'}
          value={nameInput}
          onChange={e => { setNameInput(e.target.value); setNameError('') }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          maxLength={20}
          aria-label="Your name"
          className="w-full bg-retro-card border-2 border-retro-border text-retro-text font-pixel text-xs tracking-widest placeholder-retro-dim rounded px-4 py-3 focus:outline-none focus:border-retro-p1 transition-colors"
        />
        {nameError && (
          <p className="font-pixel text-[10px] text-retro-p2">{nameError}</p>
        )}
        <button
          onClick={submit}
          className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
        >
          JOIN GAME
        </button>
      </div>
    </div>
  )
}
