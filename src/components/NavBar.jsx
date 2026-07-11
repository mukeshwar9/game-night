import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ThemeSwitcher from './ThemeSwitcher'
import { sounds } from '../lib/sounds'

// M-62: Home/Profile/Friends destinations now live in BottomTabBar (rendered
// at App level on every meta route), so NavBar no longer duplicates them —
// it keeps only the brand mark plus the global theme/mute controls that have
// no home in the tab bar.
//
// M-69: NavBar is still mounted standalone on some of BottomTabBar's own
// routes (Profile/Friends/DailyGame), so its brand mark stays a live "go
// home" Link only on screens where the tab bar (with its own HOME tab) is
// NOT already showing (NotFound, Demo). On tab-bar routes it renders as an
// inert brand mark to avoid two simultaneous go-home controls on one screen.
// Keep in sync with TAB_BAR_ROUTES in App.jsx.
const TAB_BAR_ROUTES = ['/', '/daily', '/friends', '/profile']

export default function NavBar() {
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const toggleMute = () => setMuted(sounds.toggle())
  const { pathname } = useLocation()
  const tabBarShowing = TAB_BAR_ROUTES.includes(pathname)

  const brandMark = (
    <>
      <div className="relative w-7 h-7 border-2 border-retro-cta bg-retro-tint-cta rounded
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
    </>
  )

  return (
    <div className="w-full border-b border-retro-border/60
      pt-[max(0.75rem,env(safe-area-inset-top))]
      pl-[max(1rem,env(safe-area-inset-left))]
      pr-[max(1rem,env(safe-area-inset-right))]
      pb-3">
      <div className="max-w-sm mx-auto flex items-center justify-between gap-2">
        {tabBarShowing ? (
          // BottomTabBar's own HOME tab already covers this screen — render
          // the brand mark as a plain, non-interactive block (M-69).
          <div className="relative flex items-center gap-2 shrink-0">
            {brandMark}
          </div>
        ) : (
          <Link
            to="/"
            title="Home"
            className="relative flex items-center gap-2 shrink-0 active:scale-95 transition-transform
              before:content-[''] before:absolute before:-inset-y-2.5 before:-inset-x-2"
          >
            {brandMark}
          </Link>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <ThemeSwitcher />
          <button
            onClick={toggleMute}
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
            className="relative text-retro-dim hover:text-retro-text active:scale-95 transition-colors
              p-2 rounded border border-retro-border bg-retro-card
              before:content-[''] before:absolute before:-inset-1.5"
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
