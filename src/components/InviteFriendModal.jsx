import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import Avatar from './Avatar'
import Skeleton from './loading/Skeleton'
import BottomSheet from './BottomSheet'
import useBusy from '../hooks/useBusy'
import { subscribeFriends, subscribeProfile, inviteFriendToGame, inviteFriendsToGame } from '../lib/social'
import { displayNameFor } from '../lib/moderationLogic'
import { recordFunnel } from '../lib/analytics'
import { track } from '../lib/track'
import QrCode from './QrCode'
import { shareUrl } from '../lib/platform'
import { shareLink } from '../lib/share'
import { inviteShareText } from '../lib/arrivalLogic'

// A party's other ways in, kept in this one sheet so the lobby has a single
// INVITE FRIENDS entry point: the room code in big type, the link (native share
// sheet, else copy) and a QR for a phone next to you.
function PartyLink({ gameId, hostName }) {
  const [showQr, setShowQr] = useState(false)
  const [busy, run] = useBusy()
  const url = shareUrl(`/game/${gameId}`)
  const share = () => run(async () => {
    const outcome = await shareLink({ text: inviteShareText({ hostName, party: true }), url })
    if (outcome === 'shared') { recordFunnel('shared'); track('invite_shared', { surface: 'party_invite_sheet', method: 'native_share' }); return }
    if (outcome === 'cancelled') return
    await navigator.clipboard.writeText(url)
    recordFunnel('shared')
    track('invite_shared', { surface: 'party_invite_sheet', method: 'copy' })
    toast.success('LINK COPIED!')
  }, () => toast.error("COULDN'T SHARE — COPY THE LINK FROM THE ADDRESS BAR"))
  return (
    <div className="space-y-2 rounded border border-retro-border bg-retro-bg p-3" data-testid="party-invite-link">
      <p className="font-mono text-[11px] text-retro-dim text-center">Room code</p>
      <p className="font-mono text-3xl font-bold tracking-[0.3em] text-retro-text text-center select-all" aria-label={`Room code ${gameId}`}>{gameId}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={share} disabled={busy} className="min-h-11 bg-retro-cta text-retro-bg font-pixel text-[9px] tracking-wider rounded hover:shadow-neon-cta transition press disabled:opacity-50">
          {busy ? 'SHARING…' : 'SHARE LINK'}
        </button>
        <button type="button" onClick={() => setShowQr(v => !v)} aria-expanded={showQr} className="min-h-11 border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-wider rounded hover:border-retro-cta/60 transition press">
          {showQr ? 'HIDE QR' : 'SHOW QR'}
        </button>
      </div>
      {showQr && <div className="flex justify-center pt-1"><QrCode value={url} size={160} /></div>}
    </div>
  )
}

// Modal to invite a friend into the current room. Lists friends (online first)
// with a one-tap INVITE that pushes a game invite to their account, plus
// INVITE ALL ONLINE for every online friend who isn't already in the room
// (`excludeUids` — the room's seated players) and hasn't been invited yet.
// `party` ({ size, cap }) marks a party-first room: invites say "party" with
// the head-count, the sheet shows the places left and stops at the cap.
export default function InviteFriendModal({ gameId, gameType, onClose, excludeUids = [], party = null }) {
  const [friendUids, setFriendUids] = useState(null)
  const [profiles, setProfiles] = useState({})
  const [inviteState, setInviteState] = useState({}) // uid -> 'sending' | 'sent' (absent = idle)
  const [allBusy, runInviteAll] = useBusy()
  const partyInvite = party ? { kind: 'party', size: party.size, cap: party.cap } : {}
  const placesLeft = party ? Math.max(0, (party.cap || 0) - (party.size || 0)) : Infinity

  useEffect(() => subscribeFriends(list => setFriendUids(list.map(f => f.uid))), [])

  const friendKey = [...(friendUids || [])].sort().join(',')
  useEffect(() => {
    const uids = friendKey ? friendKey.split(',') : []
    const unsubs = uids.map(uid => subscribeProfile(uid, p => setProfiles(prev => ({ ...prev, [uid]: p }))))
    return () => unsubs.forEach(u => u())
  }, [friendKey])

  const invite = async (uid, name) => {
    setInviteState(prev => ({ ...prev, [uid]: 'sending' }))
    try {
      await inviteFriendToGame(uid, { gameId, gameType, ...partyInvite })
      recordFunnel('shared')
      track('invite_shared', { surface: 'friends', method: 'friend' })
      setInviteState(prev => ({ ...prev, [uid]: 'sent' }))
      toast.success(`INVITED ${(name || 'FRIEND').toUpperCase()}!`)
    } catch {
      setInviteState(prev => { const next = { ...prev }; delete next[uid]; return next })
      toast.error("COULDN'T SEND INVITE — TRY AGAIN")
    }
  }

  const sorted = [...(friendUids || [])].sort((a, b) => (profiles[b]?.online ? 1 : 0) - (profiles[a]?.online ? 1 : 0))
  const inRoom = new Set(excludeUids)
  const invitable = sorted.filter(uid => profiles[uid]?.online && !inRoom.has(uid) && !inviteState[uid]).slice(0, placesLeft)

  const inviteAll = () => runInviteAll(async () => {
    const uids = invitable
    setInviteState(prev => ({ ...prev, ...Object.fromEntries(uids.map(uid => [uid, 'sending'])) }))
    try {
      const n = await inviteFriendsToGame(uids, { gameId, gameType, ...partyInvite })
      recordFunnel('shared')
      track('invite_shared', { surface: 'friends', method: 'friend' })
      setInviteState(prev => ({ ...prev, ...Object.fromEntries(uids.map(uid => [uid, 'sent'])) }))
      toast.success(`INVITED ${n} ${n === 1 ? 'FRIEND' : 'FRIENDS'}!`)
    } catch (err) {
      setInviteState(prev => { const next = { ...prev }; for (const uid of uids) delete next[uid]; return next })
      throw err
    }
  }, () => toast.error("COULDN'T SEND INVITES — TRY AGAIN"))

  return (
    <BottomSheet glass onClose={onClose} ariaLabel="Invite a friend" className="bg-retro-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-xs text-retro-cta">{party ? 'INVITE TO PARTY' : 'INVITE A FRIEND'}</h2>
        <button onClick={onClose} aria-label="Close" className="text-retro-dim hover:text-retro-text font-pixel text-xs p-3 -m-2">✕</button>
      </div>
      {party && (
        <p className="font-mono text-[11px] text-retro-dim">
          {placesLeft > 0
            ? `Party: ${party.size} of ${party.cap} · ${placesLeft} ${placesLeft === 1 ? 'place' : 'places'} left. Not friends yet? Share the link or code below.`
            : `Party is full (${party.size} of ${party.cap}).`}
        </p>
      )}
      {party && placesLeft > 0 && <PartyLink gameId={gameId} hostName={party.hostName} />}

      {friendUids === null ? (
        <div className="space-y-2">
          {[0, 1].map(i => (
            <div key={i} className="flex items-center gap-3 bg-retro-bg border border-retro-border rounded p-2">
              <Skeleton pulse className="w-8 h-8 rounded-full shrink-0" />
              <Skeleton pulse className="flex-1 h-3" />
              <Skeleton pulse className="w-14 h-11 shrink-0" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-4 space-y-2">
          <p className="font-mono text-xs text-retro-dim">No friends yet.</p>
          <Link to="/friends" className="inline-block font-pixel text-[10px] text-retro-cta hover:text-glow-cta">
            ADD FRIENDS →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {(invitable.length > 0 || allBusy) && (
            <button
              onClick={inviteAll}
              disabled={allBusy}
              className="w-full min-h-11 px-3 border-2 border-retro-cta text-retro-cta font-pixel text-[9px] rounded
                hover:bg-retro-tint-cta transition press disabled:opacity-40 disabled:cursor-default"
            >
              {allBusy ? 'INVITING…' : `INVITE ALL ONLINE (${invitable.length})`}
            </button>
          )}
          {sorted.map(uid => {
            const p = profiles[uid]
            const state = inviteState[uid]
            return (
              <div key={uid} className="flex items-center gap-3 bg-retro-bg border border-retro-border rounded p-2">
                <div className="relative">
                  <Avatar id={p?.avatar} size={32} />
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-retro-bg ${p?.online ? 'bg-retro-win' : 'bg-retro-dim'}`} />
                </div>
                <span className="flex-1 font-mono text-sm text-retro-text truncate">{p?.displayName ? displayNameFor(p.displayName) : '…'}</span>
                {inRoom.has(uid) ? (
                  <span className={`min-h-11 px-3 flex items-center font-pixel text-[9px] ${party ? 'text-retro-win' : 'text-retro-dim'}`}>{party ? 'IN PARTY' : 'IN ROOM'}</span>
                ) : (
                  <button
                    onClick={() => invite(uid, p?.displayName)}
                    disabled={state === 'sending' || state === 'sent' || (placesLeft <= 0 && !state)}
                    className="min-h-11 px-3 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded
                      hover:shadow-neon-cta transition press disabled:opacity-40 disabled:cursor-default"
                  >
                    {state === 'sending' ? 'SENDING…' : state === 'sent' ? 'SENT' : 'INVITE'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}
