import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import ThemeSwitcher from './ThemeSwitcher'
import { useAuth } from '../lib/AuthContext'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { sounds } from '../lib/sounds'

export default function NavBar() {
  const { profile, requestCount } = useAuth()
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const toggleMute = () => setMuted(sounds.toggle())

  const myAvatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())

  return (
    <div className="w-full border-b border-retro-border/60
      pt-[max(0.75rem,env(safe-area-inset-top))]
      pl-[max(1rem,env(safe-area-inset-left))]
      pr-[max(1rem,env(safe-area-inset-right))]
      pb-3">
      <div className="max-w-sm mx-auto flex items-center justify-between gap-2">
        <Link to="/" title="Home" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 border-2 border-retro-cta bg-retro-tint-cta rounded
            flex items-center justify-center shadow-neon-cta">
            <svg width="14" height="14" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <line x1="10" y1="2" x2="10" y2="28" className="stroke-retro-cta" strokeWidth="3" strokeLinecap="square"/>
              <line x1="20" y1="2" x2="20" y2="28" className="stroke-retro-cta" strokeWidth="3" strokeLinecap="square"/>
              <line x1="2" y1="10" x2="28" y2="10" className="stroke-retro-cta" strokeWidth="3" strokeLinecap="square"/>
              <line x1="2" y1="20" x2="28" y2="20" className="stroke-retro-cta" strokeWidth="3" strokeLinecap="square"/>
            </svg>
          </div>
          <span className="hidden sm:inline font-pixel text-[9px] text-retro-cta text-glow-cta tracking-wide">
            GAME NIGHT
          </span>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/profile"
            title="Your profile"
            className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded border border-retro-border bg-retro-card hover:border-retro-p1 transition-colors"
          >
            <Avatar id={myAvatar} size={22} />
            <span className="font-pixel text-[9px] text-retro-text max-w-[72px] truncate">{profile?.displayName || 'PROFILE'}</span>
          </Link>
          <Link
            to="/friends"
            title="Friends"
            aria-label="Friends"
            className="relative p-2 rounded border border-retro-border bg-retro-card text-retro-dim hover:text-retro-text transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {requestCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-retro-cta text-retro-bg font-pixel text-[7px] flex items-center justify-center">
                {requestCount}
              </span>
            )}
          </Link>
          <ThemeSwitcher />
          <button
            onClick={toggleMute}
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
            className="text-retro-dim hover:text-retro-text transition-colors p-2 rounded border border-retro-border bg-retro-card"
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
      </div>
    </div>
  )
}
