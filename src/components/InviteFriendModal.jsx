import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import Avatar from './Avatar'
import Skeleton from './loading/Skeleton'
import BottomSheet from './BottomSheet'
import { subscribeFriends, subscribeProfile, inviteFriendToGame } from '../lib/social'

// Modal to invite a friend into the current room. Lists friends (online first)
// with a one-tap INVITE that pushes a game invite to their account.
export default function InviteFriendModal({ gameId, gameType, onClose }) {
  const [friendUids, setFriendUids] = useState(null)
  const [profiles, setProfiles] = useState({})
  const [inviteState, setInviteState] = useState({}) // uid -> 'sending' | 'sent' (absent = idle)

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
      await inviteFriendToGame(uid, { gameId, gameType })
      setInviteState(prev => ({ ...prev, [uid]: 'sent' }))
      toast.success(`INVITED ${(name || 'FRIEND').toUpperCase()}!`)
    } catch {
      setInviteState(prev => { const next = { ...prev }; delete next[uid]; return next })
      toast.error("COULDN'T SEND INVITE — TRY AGAIN")
    }
  }

  const sorted = [...(friendUids || [])].sort((a, b) => (profiles[b]?.online ? 1 : 0) - (profiles[a]?.online ? 1 : 0))

  return (
    <BottomSheet onClose={onClose} ariaLabel="Invite a friend" className="bg-retro-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-xs text-retro-cta">INVITE A FRIEND</h2>
        <button onClick={onClose} aria-label="Close" className="text-retro-dim hover:text-retro-text font-pixel text-xs p-3 -m-2">✕</button>
      </div>

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
          {sorted.map(uid => {
            const p = profiles[uid]
            const state = inviteState[uid]
            return (
              <div key={uid} className="flex items-center gap-3 bg-retro-bg border border-retro-border rounded p-2">
                <div className="relative">
                  <Avatar id={p?.avatar} size={32} />
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-retro-bg ${p?.online ? 'bg-retro-win' : 'bg-retro-dim'}`} />
                </div>
                <span className="flex-1 font-mono text-sm text-retro-text truncate">{p?.displayName || '…'}</span>
                <button
                  onClick={() => invite(uid, p?.displayName)}
                  disabled={state === 'sending' || state === 'sent'}
                  className="min-h-11 px-3 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded
                    hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40 disabled:cursor-default"
                >
                  {state === 'sending' ? 'SENDING…' : state === 'sent' ? 'SENT' : 'INVITE'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}
