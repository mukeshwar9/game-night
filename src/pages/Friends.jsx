import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import NavBar from '../components/NavBar'
import Avatar from '../components/Avatar'
import { useAuth } from '../lib/AuthContext'
import {
  normalizeFriendCode, isValidFriendCode, sendFriendRequestByCode,
  acceptRequest, declineRequest, removeFriend,
  subscribeFriends, subscribeRequests, subscribeProfile,
} from '../lib/social'
import { fetchFriendsLeaderboard, rankEntries } from '../lib/leaderboard'

const REQUEST_ERRORS = {
  invalid: 'That code looks wrong — 6 characters.',
  notfound: 'No player with that code.',
  self: "That's your own code!",
  already: "You're already friends.",
}

export default function Friends() {
  const { profile, uid } = useAuth()
  const [codeInput, setCodeInput] = useState('')
  const [sending, setSending] = useState(false)
  const [friendUids, setFriendUids] = useState([])
  const [requests, setRequests] = useState([])
  const [profiles, setProfiles] = useState({})
  const [leaderboard, setLeaderboard] = useState(null)

  useEffect(() => subscribeFriends(list => setFriendUids(list.map(f => f.uid))), [])
  useEffect(() => subscribeRequests(setRequests), [])

  // Live-subscribe to each friend's profile (name, avatar, online).
  const friendKey = [...friendUids].sort().join(',')
  useEffect(() => {
    const uids = friendKey ? friendKey.split(',') : []
    const unsubs = uids.map(uid => subscribeProfile(uid, p => setProfiles(prev => ({ ...prev, [uid]: p }))))
    return () => unsubs.forEach(u => u())
  }, [friendKey])

  // One-shot leaderboard fetch (no live subscription) on mount + whenever the
  // friend list changes.
  useEffect(() => {
    if (!friendKey) return
    let cancelled = false
    fetchFriendsLeaderboard(friendKey.split(',')).then(entries => {
      if (!cancelled) setLeaderboard(entries)
    })
    return () => { cancelled = true }
  }, [friendKey])

  const rankedLeaderboard = leaderboard
    ? rankEntries(leaderboard).map(entry => {
      const p = entry.uid === uid ? profile : profiles[entry.uid]
      return { ...entry, isMe: entry.uid === uid, displayName: p?.displayName, avatar: p?.avatar }
    })
    : null
  const leaderboardAllZero = rankedLeaderboard?.every(e => e.games === 0) ?? false

  const sendRequest = async () => {
    const code = normalizeFriendCode(codeInput)
    if (!isValidFriendCode(code)) { toast.error(REQUEST_ERRORS.invalid); return }
    setSending(true)
    try {
      const res = await sendFriendRequestByCode(code)
      if (res.ok) { toast.success(`Request sent to ${res.to}!`); setCodeInput('') }
      else toast.error(REQUEST_ERRORS[res.error] || 'Could not send request.')
    } finally {
      setSending(false)
    }
  }

  const onAccept = async (uid) => { await acceptRequest(uid); toast.success('Friend added!') }
  const onDecline = async (uid) => { await declineRequest(uid) }
  const onRemove = async (uid, name) => { await removeFriend(uid); toast(`Removed ${name || 'friend'}.`) }

  const copyCode = async () => {
    if (!profile?.code) return
    try { await navigator.clipboard.writeText(profile.code) } catch { /* ignore */ }
    toast.success('Friend code copied!')
  }

  return (
    <div className="min-h-screen bg-retro-bg">
      <NavBar />
      <div className="p-4">
      <div className="w-full max-w-sm mx-auto space-y-6 pt-2">
        <h1 className="font-pixel text-base text-retro-cta text-glow-cta">FRIENDS</h1>

        {/* My code */}
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim tracking-wider">YOUR FRIEND CODE</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 font-pixel text-lg text-retro-p1 text-glow-p1 tracking-[0.3em]">{profile?.code || '······'}</span>
            <button
              onClick={copyCode}
              className="px-3 py-1.5 bg-retro-bg border border-retro-border text-retro-dim font-pixel text-[10px] rounded
                hover:text-retro-text hover:border-retro-p1 transition-all active:scale-95"
            >
              COPY
            </button>
          </div>
          <p className="font-mono text-[10px] text-retro-dim">Share this so friends can add you.</p>
        </div>

        {/* Add friend */}
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">ADD A FRIEND</label>
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={e => setCodeInput(normalizeFriendCode(e.target.value))}
              placeholder="ENTER CODE"
              className="flex-1 bg-retro-card border border-retro-border rounded px-3 py-2 font-pixel text-sm tracking-[0.2em]
                text-retro-text placeholder:text-retro-dim placeholder:tracking-normal placeholder:font-mono focus:outline-none focus:border-retro-p1"
            />
            <button
              onClick={sendRequest}
              disabled={sending || !codeInput}
              className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded
                hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              SEND
            </button>
          </div>
        </div>

        {/* Incoming requests */}
        {requests.length > 0 && (
          <div className="space-y-2">
            <label className="font-pixel text-[10px] text-retro-cta tracking-wider">REQUESTS ({requests.length})</label>
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.uid} className="flex items-center gap-3 bg-retro-card border border-retro-border rounded p-2.5">
                  <Avatar id={r.avatar} size={36} />
                  <span className="flex-1 font-mono text-sm text-retro-text truncate">{r.name || 'player'}</span>
                  <button
                    onClick={() => onAccept(r.uid)}
                    className="px-2.5 py-1.5 bg-retro-win/20 border border-retro-win/50 text-retro-win font-pixel text-[9px] rounded
                      hover:bg-retro-win/30 transition-all active:scale-95"
                  >
                    ACCEPT
                  </button>
                  <button
                    onClick={() => onDecline(r.uid)}
                    aria-label="Decline"
                    className="px-2 py-1.5 text-retro-dim font-pixel text-[9px] rounded hover:text-retro-p2 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends list */}
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">
            MY FRIENDS ({friendUids.length})
          </label>
          {friendUids.length === 0 ? (
            <p className="font-mono text-xs text-retro-dim bg-retro-card border border-retro-border rounded p-3">
              No friends yet. Share your code or add someone above.
            </p>
          ) : (
            <div className="space-y-2">
              {friendUids.map(uid => {
                const p = profiles[uid]
                return (
                  <div key={uid} className="flex items-center gap-3 bg-retro-card border border-retro-border rounded p-2.5">
                    <div className="relative">
                      <Avatar id={p?.avatar} size={36} />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-retro-card ${p?.online ? 'bg-retro-win' : 'bg-retro-dim'}`}
                        title={p?.online ? 'Online' : 'Offline'}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-retro-text truncate">{p?.displayName || '…'}</p>
                      <p className="font-pixel text-[8px] text-retro-dim">{p?.online ? 'ONLINE' : 'OFFLINE'}</p>
                    </div>
                    <button
                      onClick={() => onRemove(uid, p?.displayName)}
                      aria-label="Remove friend"
                      className="px-2 py-1.5 text-retro-dim font-pixel text-[9px] rounded hover:text-retro-p2 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        {friendUids.length > 0 && (
          <div className="space-y-2">
            <label className="font-pixel text-[10px] text-retro-dim tracking-wider">LEADERBOARD</label>
            {!rankedLeaderboard ? (
              <p className="font-mono text-xs text-retro-dim bg-retro-card border border-retro-border rounded p-3">
                Loading…
              </p>
            ) : leaderboardAllZero ? (
              <p className="font-mono text-xs text-retro-dim bg-retro-card border border-retro-border rounded p-3">
                Stats appear as you and your friends finish matches.
              </p>
            ) : (
              <div className="space-y-2">
                {rankedLeaderboard.map(e => (
                  <div
                    key={e.uid}
                    className={`flex items-center gap-3 bg-retro-card border rounded p-2.5 ${e.isMe ? 'border-retro-cta' : 'border-retro-border'}`}
                  >
                    <span className="font-pixel text-[11px] text-retro-dim w-4 text-center shrink-0">{e.rank}</span>
                    <Avatar id={e.avatar} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-retro-text truncate">
                        {e.displayName || '…'}{e.isMe ? ' (you)' : ''}
                      </p>
                      <p className="font-pixel text-[8px] text-retro-dim">{e.wins}W-{e.losses}L</p>
                    </div>
                    <span className="font-pixel text-[10px] text-retro-win text-glow-win">
                      {e.games > 0 ? `${Math.round((e.wins / e.games) * 100)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
