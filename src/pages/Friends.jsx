import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, set } from 'firebase/database'
import { toast } from 'sonner'
import NavBar from '../components/NavBar'
import Avatar from '../components/Avatar'
import Skeleton from '../components/loading/Skeleton'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../lib/AuthContext'
import {
  normalizeFriendCode, isValidFriendCode, sendFriendRequestByCode,
  acceptRequest, declineRequest, removeFriend, inviteFriendToGame,
  subscribeFriends, subscribeRequests, subscribeProfile,
} from '../lib/social'
import { fetchFriendsLeaderboard, rankEntries } from '../lib/leaderboard'
import { db } from '../lib/firebase'
import { generateGameId } from '../lib/gameLogic'
import { freshGameState, GAME_TYPES } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { recordRoom } from '../lib/profile'
import { recordPlay } from '../lib/analytics'
import useBusy from '../hooks/useBusy'

const REQUEST_ERRORS = {
  invalid: 'THAT CODE LOOKS WRONG — 6 CHARACTERS.',
  notfound: 'NO PLAYER WITH THAT CODE.',
  self: "THAT'S YOUR OWN CODE!",
  already: "YOU'RE ALREADY FRIENDS.",
}

// One-tap challenge (M-20): standard 2-player games only, mirroring the X/O
// room shape Home.jsx creates — party (nPlayer) games need 3+ players so
// they don't fit a single-friend challenge.
const CHALLENGE_GAME_TYPES = GAME_TYPES.filter(t => !t.variantOf && !t.nPlayer)

export default function Friends() {
  const navigate = useNavigate()
  const { profile, uid } = useAuth()
  const [codeInput, setCodeInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingUid, setPendingUid] = useState(null)
  const [confirmRemoveUid, setConfirmRemoveUid] = useState(null)
  const [friendUids, setFriendUids] = useState(null)
  const [requests, setRequests] = useState([])
  const [profiles, setProfiles] = useState({})
  const [leaderboard, setLeaderboard] = useState(null)
  const [challengeGameType, setChallengeGameType] = useState(CHALLENGE_GAME_TYPES[0]?.type || 'tictactoe')
  const [challengingUid, setChallengingUid] = useState(null)
  const [, runChallenge] = useBusy()

  useEffect(() => subscribeFriends(list => setFriendUids(list.map(f => f.uid))), [])
  useEffect(() => subscribeRequests(setRequests), [])

  // Live-subscribe to each friend's profile (name, avatar, online).
  const friendKey = [...(friendUids || [])].sort().join(',')
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
    if (sending || !codeInput) return
    const code = normalizeFriendCode(codeInput)
    if (!isValidFriendCode(code)) { toast.error(REQUEST_ERRORS.invalid); return }
    setSending(true)
    try {
      const res = await sendFriendRequestByCode(code)
      if (res.ok) { toast.success(`REQUEST SENT TO ${res.to}!`); setCodeInput('') }
      else toast.error(REQUEST_ERRORS[res.error] || 'COULD NOT SEND REQUEST.')
    } finally {
      setSending(false)
    }
  }

  const onAccept = async (uid) => {
    setPendingUid(uid)
    try {
      await acceptRequest(uid)
      toast.success('FRIEND ADDED!')
    } catch {
      toast.error('SOMETHING WENT WRONG — TRY AGAIN.')
    } finally {
      setPendingUid(null)
    }
  }
  const onDecline = async (uid) => {
    setPendingUid(uid)
    try {
      await declineRequest(uid)
      toast('REQUEST DECLINED.')
    } catch {
      toast.error('SOMETHING WENT WRONG — TRY AGAIN.')
    } finally {
      setPendingUid(null)
    }
  }
  const onRemove = async (uid, name) => {
    setPendingUid(uid)
    try {
      await removeFriend(uid)
      toast(`REMOVED ${(name || 'FRIEND').toUpperCase()}.`)
    } catch {
      toast.error('SOMETHING WENT WRONG — TRY AGAIN.')
    } finally {
      setPendingUid(null)
    }
  }

  // Removing a friend is destructive with no undo path server-side — require a
  // second tap ("SURE?") within a few seconds before it actually commits (M-19).
  const handleRemoveClick = (uid, name) => {
    if (confirmRemoveUid === uid) {
      setConfirmRemoveUid(null)
      onRemove(uid, name)
      return
    }
    setConfirmRemoveUid(uid)
    setTimeout(() => setConfirmRemoveUid(prev => (prev === uid ? null : prev)), 3000)
  }

  const copyCode = async () => {
    if (!profile?.code) return
    try {
      await navigator.clipboard.writeText(profile.code)
      toast.success('FRIEND CODE COPIED!')
    } catch {
      const el = document.createElement('textarea')
      el.value = profile.code
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      if (ok) toast.success('FRIEND CODE COPIED!')
      else toast.error('COULD NOT COPY THE CODE — PLEASE COPY IT MANUALLY.')
    }
  }

  const shareCode = async () => {
    if (!profile?.code) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Game Night', text: `Add me on Game Night — my friend code is ${profile.code}!`, url: window.location.origin })
        return
      } catch (err) {
        if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') return
        // fall through to clipboard copy
      }
    }
    await copyCode()
  }

  // One-tap challenge (M-20): create a room the same way Home.jsx does, send
  // the friend an invite into it, and jump straight into the room.
  const challengeFriend = (friendUid, friendName) => {
    setChallengingUid(friendUid)
    runChallenge(async () => {
      const playerName = profile?.displayName || localStorage.getItem('playerName') || 'Player'
      const myAvatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
      const gameId = generateGameId()
      const myId = getPlayerId()
      const now = Date.now()
      const gameData = {
        gameType: challengeGameType,
        status: 'waiting',
        scores: { X: 0, O: 0 },
        createdAt: now,
        lastActivityAt: now,
        players: { X: { name: playerName, joinedAt: now, playerId: myId, avatar: myAvatar } },
        ...freshGameState(challengeGameType),
      }
      await set(ref(db, `games/${gameId}`), gameData)
      recordPlay(challengeGameType, 'multi')
      sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name: playerName }))
      recordRoom({ id: gameId, gameType: challengeGameType })
      await inviteFriendToGame(friendUid, { gameId, gameType: challengeGameType })
      toast.success(`CHALLENGE SENT TO ${(friendName || 'FRIEND').toUpperCase()}!`)
      navigate(`/game/${gameId}`)
    }, () => toast.error("COULDN'T START THE GAME — TRY AGAIN.")).finally(() => setChallengingUid(null))
  }

  return (
    <div className="min-h-screen bg-retro-bg">
      <NavBar />
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm mx-auto space-y-6 pt-2">
        <h1 className="font-pixel text-base text-retro-cta text-glow-cta">FRIENDS</h1>

        {/* My code */}
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim tracking-wider">YOUR FRIEND CODE</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 font-pixel text-lg text-retro-p1 text-glow-p1 tracking-[0.3em]">{profile?.code || '······'}</span>
            <button
              onClick={copyCode}
              className="min-h-11 px-3 bg-retro-bg border border-retro-border text-retro-dim font-pixel text-[10px] rounded
                hover:text-retro-text hover:border-retro-p1 transition-all active:scale-95"
            >
              COPY
            </button>
            <button
              onClick={shareCode}
              className="min-h-11 px-3 bg-retro-bg border border-retro-border text-retro-dim font-pixel text-[10px] rounded
                hover:text-retro-text hover:border-retro-p1 transition-all active:scale-95"
            >
              SHARE
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
              onKeyDown={e => e.key === 'Enter' && sendRequest()}
              placeholder="ENTER CODE"
              className="flex-1 bg-retro-card border border-retro-border rounded px-3 py-2 font-pixel text-sm tracking-[0.2em]
                text-retro-text placeholder:text-retro-dim placeholder:tracking-normal placeholder:font-mono focus:outline-none focus:border-retro-p1"
            />
            <button
              onClick={sendRequest}
              disabled={sending || !codeInput}
              className="min-h-11 px-4 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded
                hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? 'SENDING…' : 'SEND'}
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
                    disabled={pendingUid === r.uid}
                    className="min-h-11 px-3 bg-retro-win/20 border border-retro-win/50 text-retro-win font-pixel text-[9px] rounded
                      hover:bg-retro-win/30 transition-all active:scale-95 disabled:opacity-50"
                  >
                    ACCEPT
                  </button>
                  <button
                    onClick={() => onDecline(r.uid)}
                    disabled={pendingUid === r.uid}
                    aria-label="Decline"
                    className="min-h-11 min-w-11 flex items-center justify-center text-retro-dim font-pixel text-[9px] rounded hover:text-retro-p2 transition-colors disabled:opacity-50"
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
          <div className="flex items-center justify-between gap-2">
            <label className="font-pixel text-[10px] text-retro-dim tracking-wider">
              MY FRIENDS{friendUids !== null ? ` (${friendUids.length})` : ''}
            </label>
            {friendUids?.length > 0 && (
              <select
                value={challengeGameType}
                onChange={e => setChallengeGameType(e.target.value)}
                aria-label="Game to challenge a friend to"
                className="bg-retro-card border border-retro-border rounded px-2 py-1.5 font-pixel text-[8px]
                  text-retro-dim focus:outline-none focus:border-retro-p1"
              >
                {CHALLENGE_GAME_TYPES.map(t => (
                  <option key={t.type} value={t.type}>{t.label}</option>
                ))}
              </select>
            )}
          </div>
          {friendUids === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3 bg-retro-card border border-retro-border rounded p-2.5">
                  <Skeleton pulse className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton pulse className="h-3 w-24" />
                    <Skeleton pulse className="h-2 w-12" />
                  </div>
                </div>
              ))}
            </div>
          ) : friendUids.length === 0 ? (
            <EmptyState>NO FRIENDS YET. SHARE YOUR CODE OR ADD SOMEONE ABOVE.</EmptyState>
          ) : (
            <div className="space-y-2">
              {friendUids.map(uid => {
                const p = profiles[uid]
                const confirming = confirmRemoveUid === uid
                return (
                  <div key={uid} className="flex items-center gap-3 bg-retro-card border border-retro-border rounded p-2.5">
                    <div className="relative shrink-0">
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
                    {p?.online && (
                      <button
                        onClick={() => challengeFriend(uid, p?.displayName)}
                        disabled={challengingUid === uid}
                        className="min-h-11 px-2.5 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded shrink-0
                          hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
                      >
                        {challengingUid === uid ? '…' : 'PLAY'}
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveClick(uid, p?.displayName)}
                      disabled={pendingUid === uid}
                      aria-label={confirming ? 'Confirm remove friend' : 'Remove friend'}
                      className={`min-h-11 min-w-11 shrink-0 flex items-center justify-center font-pixel rounded transition-colors disabled:opacity-50 ${
                        confirming ? 'text-retro-p2 text-[8px] tracking-tight' : 'text-retro-dim text-[9px] hover:text-retro-p2'
                      }`}
                    >
                      {confirming ? 'SURE?' : '✕'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        {friendUids?.length > 0 && (
          <div className="space-y-2">
            <label className="font-pixel text-[10px] text-retro-dim tracking-wider">LEADERBOARD</label>
            {!rankedLeaderboard ? (
              <div className="space-y-2">
                {[0, 1].map(i => (
                  <div key={i} className="flex items-center gap-3 bg-retro-card border border-retro-border rounded p-2.5">
                    <Skeleton pulse className="h-3 w-7 shrink-0" />
                    <Skeleton pulse className="w-9 h-9 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Skeleton pulse className="h-3 w-24" />
                      <Skeleton pulse className="h-2 w-16" />
                    </div>
                    <Skeleton pulse className="h-2.5 w-8 shrink-0" />
                  </div>
                ))}
              </div>
            ) : leaderboardAllZero ? (
              <p className="font-mono text-xs text-retro-dim bg-retro-card border border-retro-border rounded p-3">
                Stats appear as you and your friends finish matches.
              </p>
            ) : (
              <div className="space-y-2">
                {rankedLeaderboard.map(e => {
                  // M-89: rows carried avatar + accent-border styling that read as
                  // tappable but did nothing. Give them a real action instead of
                  // demoting the visuals — your own row jumps to your profile, a
                  // friend's row sends them a challenge (same flow as the PLAY
                  // button in the friends list above, reusing challengingUid so
                  // the two stay in sync).
                  const busy = challengingUid === e.uid
                  const onRowActivate = () => {
                    if (busy) return
                    if (e.isMe) navigate('/profile')
                    else challengeFriend(e.uid, e.displayName)
                  }
                  return (
                    <button
                      key={e.uid}
                      type="button"
                      onClick={onRowActivate}
                      disabled={busy}
                      aria-label={e.isMe ? 'View your profile' : `Challenge ${e.displayName || 'friend'} to a game`}
                      className={`w-full flex items-center gap-3 bg-retro-card border rounded p-2.5 transition-all
                        hover:border-retro-p1/50 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100
                        ${e.isMe ? 'border-retro-cta' : 'border-retro-border'}`}
                    >
                      <span className="font-pixel text-[11px] text-retro-dim w-7 text-center shrink-0">{e.rank}</span>
                      <Avatar id={e.avatar} size={36} />
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <div className="min-w-0 text-left">
                          <p className="font-mono text-sm text-retro-text truncate">
                            {e.displayName || '…'}
                          </p>
                          <p className="font-mono text-[10px] text-retro-dim">{e.wins}W-{e.losses}L</p>
                        </div>
                        {e.isMe && (
                          <span className="shrink-0 font-pixel text-[8px] text-retro-cta">(YOU)</span>
                        )}
                      </div>
                      <span className="font-pixel text-[10px] text-retro-win text-glow-win">
                        {busy ? '…' : e.games > 0 ? `${Math.round((e.wins / e.games) * 100)}%` : '—'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
