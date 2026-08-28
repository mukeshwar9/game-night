import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ref, get, query, orderByChild, limitToLast } from 'firebase/database'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import PixelDots from '../components/loading/PixelDots'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { cn } from '@/lib/utils'

// Global top-50-by-wins leaderboard, backed by the denormalized leaderboard/
// node (mirrored from profile.js's mirrorStats — see database.rules.json).
// One-shot fetch, no live subscription: consistent with the friends-scoped
// leaderboard pattern in leaderboard.js/Friends.jsx. RTDB returns ascending
// order for a `.indexOn`/orderByChild query, so we reverse client-side.
//
// Friend-gated names (F-33 follow-up): names are already world-readable at
// users/{uid} and mirrored here so friends' rows can render them, but a
// non-friend/non-self row blurs the name — display-level privacy only, see
// the plan doc for the accepted caveat.
export default function Leaderboard() {
  const { uid } = useAuth()
  const [entries, setEntries] = useState(null) // null = loading
  const [friendUids, setFriendUids] = useState(null)
  const [error, setError] = useState(() => !db)

  useEffect(() => {
    if (!db) return
    let cancelled = false
    ;(async () => {
      try {
        const [lbSnap, friendsSnap] = await Promise.all([
          get(query(ref(db, 'leaderboard'), orderByChild('wins'), limitToLast(50))),
          uid ? get(ref(db, `friends/${uid}`)) : Promise.resolve(null),
        ])
        if (cancelled) return
        const val = lbSnap.exists() ? lbSnap.val() : {}
        const list = Object.entries(val)
          .map(([rowUid, row]) => ({ uid: rowUid, ...row }))
          .sort((a, b) => (b.wins || 0) - (a.wins || 0))
        setEntries(list)
        const friendsVal = friendsSnap?.exists() ? friendsSnap.val() : {}
        setFriendUids(new Set(Object.keys(friendsVal)))
      } catch {
        if (!cancelled) setError(true)
      }
    })()
    return () => { cancelled = true }
  }, [uid])

  return (
    <div className="min-h-screen bg-retro-bg">
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm mx-auto space-y-6 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-pixel text-base text-retro-cta text-glow-cta">LEADERBOARD</h1>
            <Link to="/profile" className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-all">
              PROFILE →
            </Link>
          </div>

          {error ? (
            <div className="bg-retro-card border border-retro-border rounded p-4 text-center">
              <p className="font-pixel text-[9px] text-retro-p2 tracking-wider">COULDN&apos;T LOAD THE LEADERBOARD.</p>
            </div>
          ) : entries === null ? (
            <div className="flex items-center justify-center py-10">
              <PixelDots tone="cta" size="lg" glow />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState>NO SCORES YET. PLAY A MATCH TO CLAIM THE TOP SPOT.</EmptyState>
          ) : (
            <div className="space-y-2">
              {entries.map((e, i) => {
                const isMe = e.uid === uid
                const visible = isMe || friendUids?.has(e.uid)
                return (
                  <div
                    key={e.uid}
                    className={cn(
                      'flex items-center gap-3 bg-retro-card border rounded p-2.5',
                      isMe ? 'border-retro-cta' : 'border-retro-border',
                    )}
                  >
                    <span className="font-pixel text-[11px] text-retro-dim w-7 text-center shrink-0">{i + 1}</span>
                    <Avatar id={e.avatar} size={36} />
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <div className="min-w-0 text-left">
                        {visible ? (
                          <p className="font-mono text-sm text-retro-text truncate">{e.name || '…'}</p>
                        ) : (
                          <p className="font-mono text-sm text-retro-text truncate blur-sm select-none pointer-events-none" aria-hidden="true">
                            PLAYER
                          </p>
                        )}
                        <p className="font-mono text-[10px] text-retro-dim">
                          {e.games || 0} GAMES · BEST STREAK {e.bestStreak || 0}
                        </p>
                      </div>
                      {isMe && <span className="shrink-0 font-pixel text-[8px] text-retro-cta">(YOU)</span>}
                    </div>
                    <span className="font-pixel text-[12px] text-retro-win text-glow-win shrink-0">{e.wins || 0}W</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
