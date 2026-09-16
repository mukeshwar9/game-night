import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Skeleton from '../components/loading/Skeleton'
import BottomSheet from '../components/BottomSheet'
import ThemeSwitcher from '../components/ThemeSwitcher'
import PlaygroundWorld from '../components/PlaygroundWorld'
import { useAuth } from '../lib/AuthContext'
import { getStats } from '../lib/profile'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { subscribeFriends, subscribeProfile } from '../lib/social'
import { fetchFriendsLeaderboard, rankEntries } from '../lib/leaderboard'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Fullscreen hub: PlaygroundWorld fills the viewport, this page owns only the
// HUD chrome (back/mute/theme + stats/friends launchers) and the two
// BottomSheet panels — data plumbing is the same subscribeFriends/
// subscribeProfile/fetchFriendsLeaderboard fan-out as Home.jsx/Friends.jsx,
// rendered as static rows (no challenge/remove/PLAY actions here).
export default function Playground() {
  const { profile, uid } = useAuth()
  const stats = useMemo(() => getStats(), [])
  const myAvatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const toggleMute = () => setMuted(sounds.toggle())
  const [openPanel, setOpenPanel] = useState(null) // null | 'stats' | 'friends'
  const closePanel = () => setOpenPanel(null)

  const [friendUids, setFriendUids] = useState(null)
  const [profiles, setProfiles] = useState({})
  const [leaderboard, setLeaderboard] = useState(null)

  useEffect(() => subscribeFriends(list => setFriendUids(list.map(f => f.uid))), [])

  const friendKey = [...(friendUids || [])].sort().join(',')
  useEffect(() => {
    const uids = friendKey ? friendKey.split(',') : []
    const unsubs = uids.map(id => subscribeProfile(id, p => setProfiles(prev => ({ ...prev, [id]: p }))))
    return () => unsubs.forEach(u => u())
  }, [friendKey])

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

  return (
    <div className="h-dvh overflow-hidden relative bg-retro-bg">
      <PlaygroundWorld avatarId={myAvatar} controlsEnabled={!openPanel} />

      {/* HUD — top-left: back + panel launchers (world's own HUD owns top-center hint,
          bottom-left goal chip, bottom-center enter-station, bottom-right emotes) */}
      <div className="absolute top-[max(0.5rem,env(safe-area-inset-top))] left-[max(0.5rem,env(safe-area-inset-left))] z-30 flex flex-col items-start gap-1.5">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 min-h-11 px-2.5 font-pixel text-[10px] text-retro-dim bg-retro-surface/80 rounded hover:text-retro-text transition-all active:scale-95"
        >
          ← BACK
        </Link>
        <div className="flex gap-1.5">
          <button
            onClick={() => setOpenPanel('stats')}
            className="min-h-11 px-2.5 bg-retro-surface/80 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:text-retro-text transition-all active:scale-95"
          >
            STATS
          </button>
          <button
            onClick={() => setOpenPanel('friends')}
            className="min-h-11 px-2.5 bg-retro-surface/80 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:text-retro-text transition-all active:scale-95"
          >
            FRIENDS{friendUids?.length > 0 ? ` (${friendUids.length})` : ''}
          </button>
        </div>
      </div>

      {/* HUD — top-right: mute + theme (copied from NavBar) */}
      <div className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.5rem,env(safe-area-inset-right))] z-30 flex items-center gap-2">
        <ThemeSwitcher />
        <button
          onClick={toggleMute}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
          className="relative min-h-11 min-w-11 flex items-center justify-center text-retro-dim hover:text-retro-text active:scale-95 transition-colors
            rounded border border-retro-border bg-retro-surface/80"
        >
          {muted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Unmute">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Mute">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}
        </button>
      </div>

      {openPanel === 'stats' && (
        <BottomSheet onClose={closePanel} ariaLabel="Stats" className="bg-retro-card space-y-6">
          <div className="space-y-1.5">
            <label className="font-pixel text-[10px] text-retro-dim tracking-wider">YOUR STATS</label>
            {stats && stats.games > 0 ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'WINS', val: stats.wins, col: 'text-retro-win' },
                  { label: 'LOSSES', val: stats.losses, col: 'text-retro-p2' },
                  { label: 'BEST STREAK', val: stats.bestStreak, col: 'text-retro-cta' },
                ].map(({ label, val, col }) => (
                  <div key={label} className="bg-retro-bg border border-retro-border rounded py-2">
                    <p className={cn('font-pixel text-base', col)}>{val}</p>
                    <p className="font-pixel text-[7px] text-retro-dim mt-1 tracking-wider">{label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>PLAY A MATCH TO START YOUR RECORD</EmptyState>
            )}
          </div>

          {friendUids?.length > 0 && (
            <div className="space-y-2">
              <label className="font-pixel text-[10px] text-retro-dim tracking-wider">LEADERBOARD</label>
              {!rankedLeaderboard ? (
                <div className="space-y-2">
                  {[0, 1].map(i => (
                    <div key={i} className="flex items-center gap-2.5 bg-retro-bg border border-retro-border rounded p-2.5">
                      <Skeleton pulse className="h-3 w-5 shrink-0" />
                      <Skeleton pulse className="w-9 h-9 rounded-full shrink-0" />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <Skeleton pulse className="h-3 w-24" />
                        <Skeleton pulse className="h-2 w-16" />
                      </div>
                      <Skeleton pulse className="h-2.5 w-10 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : leaderboardAllZero ? (
                <p className="font-mono text-xs text-retro-dim bg-retro-bg border border-retro-border rounded p-3">
                  Stats appear as you and your friends finish matches.
                </p>
              ) : (
                <div className="space-y-2">
                  {rankedLeaderboard.map(e => (
                    <div
                      key={e.uid}
                      className={`w-full flex items-center gap-2.5 bg-retro-bg border rounded p-2.5 ${
                        e.isMe ? 'border-retro-cta' : 'border-retro-border'
                      }`}
                    >
                      <span className="font-pixel text-[11px] text-retro-dim w-5 text-center shrink-0">{e.rank}</span>
                      <span className="shrink-0"><Avatar id={e.avatar} size={36} /></span>
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <div className="min-w-0 text-left">
                          <p className="font-mono text-sm text-retro-text truncate">{e.displayName || '…'}</p>
                          <p className="font-mono text-[10px] text-retro-dim">{e.wins}W-{e.losses}L</p>
                        </div>
                        {e.isMe && <span className="shrink-0 font-pixel text-[8px] text-retro-cta">(YOU)</span>}
                      </div>
                      <span className="shrink-0 w-10 text-right font-pixel text-[10px] text-retro-win text-glow-win">
                        {e.games > 0 ? `${Math.round((e.wins / e.games) * 100)}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </BottomSheet>
      )}

      {openPanel === 'friends' && (
        <BottomSheet onClose={closePanel} ariaLabel="Friends" className="bg-retro-card space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">
            MY FRIENDS{friendUids !== null ? ` (${friendUids.length})` : ''}
          </label>
          {friendUids === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3 bg-retro-bg border border-retro-border rounded p-2.5">
                  <Skeleton pulse className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton pulse className="h-3 w-24" />
                    <Skeleton pulse className="h-2 w-12" />
                  </div>
                </div>
              ))}
            </div>
          ) : friendUids.length === 0 ? (
            <EmptyState>NO FRIENDS YET. ADD SOME FROM THE FRIENDS PAGE.</EmptyState>
          ) : (
            <div className="space-y-2">
              {friendUids.map(id => {
                const p = profiles[id]
                return (
                  <div key={id} className="flex items-center gap-3 bg-retro-bg border border-retro-border rounded p-2.5">
                    <div className="relative shrink-0">
                      <Avatar id={p?.avatar} size={36} />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-retro-bg ${p?.online ? 'bg-retro-win' : 'bg-retro-dim'}`}
                        title={p?.online ? 'Online' : 'Offline'}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-retro-text truncate">{p?.displayName || '…'}</p>
                      <p className="font-pixel text-[8px] text-retro-dim">{p?.online ? 'ONLINE' : 'OFFLINE'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  )
}
