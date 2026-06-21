import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import Avatar from './Avatar'
import { subscribeFriends, subscribeProfile, inviteFriendToGame } from '../lib/social'

// Modal to invite a friend into the current room. Lists friends (online first)
// with a one-tap INVITE that pushes a game invite to their account.
export default function InviteFriendModal({ gameId, gameType, onClose }) {
  const [friendUids, setFriendUids] = useState([])
  const [profiles, setProfiles] = useState({})
  const [invited, setInvited] = useState({})

  useEffect(() => subscribeFriends(list => setFriendUids(list.map(f => f.uid))), [])

  const friendKey = [...friendUids].sort().join(',')
  useEffect(() => {
    const uids = friendKey ? friendKey.split(',') : []
    const unsubs = uids.map(uid => subscribeProfile(uid, p => setProfiles(prev => ({ ...prev, [uid]: p }))))
    return () => unsubs.forEach(u => u())
  }, [friendKey])

  const invite = async (uid, name) => {
    setInvited(prev => ({ ...prev, [uid]: true }))
    await inviteFriendToGame(uid, { gameId, gameType })
    toast.success(`Invited ${name || 'friend'}!`)
  }

  const sorted = [...friendUids].sort((a, b) => (profiles[b]?.online ? 1 : 0) - (profiles[a]?.online ? 1 : 0))

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-retro-card border-2 border-retro-border rounded p-4 space-y-3 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-pixel text-xs text-retro-cta">INVITE A FRIEND</h2>
          <button onClick={onClose} aria-label="Close" className="text-retro-dim hover:text-retro-text font-pixel text-xs">✕</button>
        </div>

        {sorted.length === 0 ? (
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
              const done = invited[uid]
              return (
                <div key={uid} className="flex items-center gap-3 bg-retro-bg border border-retro-border rounded p-2">
                  <div className="relative">
                    <Avatar id={p?.avatar} size={32} />
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-retro-bg ${p?.online ? 'bg-retro-win' : 'bg-retro-dim'}`} />
                  </div>
                  <span className="flex-1 font-mono text-sm text-retro-text truncate">{p?.displayName || '…'}</span>
                  <button
                    onClick={() => invite(uid, p?.displayName)}
                    disabled={done}
                    className="px-3 py-1.5 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded
                      hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40 disabled:cursor-default"
                  >
                    {done ? 'SENT' : 'INVITE'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
