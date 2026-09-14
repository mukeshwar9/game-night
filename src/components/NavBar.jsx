import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ThemeSwitcher from './ThemeSwitcher'
import AudioSettingsButton from './AudioSettingsButton'
import { sounds } from '../lib/sounds'
import useHideOnScroll from '../hooks/useHideOnScroll'

/* eslint-disable react-refresh/only-export-components */

// Persistent Home/Daily/Friends/Profile tab bar — only on the four meta
// routes; also the only routes where the header hides on scroll (game rooms
// and /demo stay pinned so it doesn't fight the fixed GameStatus bar).
export const TAB_BAR_ROUTES = ['/', '/daily', '/friends', '/profile', '/notes']

// Game rooms can intercept the logo tap (leave-match confirm) without
// owning their own Home link. The ref is stable; Game registers a handler
// for the lifetime of the room via useHomeIntercept().
const HomeInterceptContext = createContext({ current: null })

export function HomeInterceptProvider({ children }) {
  const interceptRef = useRef(null)
  return (
    <HomeInterceptContext.Provider value={interceptRef}>
      {children}
    </HomeInterceptContext.Provider>
  )
}

export function useHomeIntercept(handler) {
  const interceptRef = useContext(HomeInterceptContext)
  useEffect(() => {
    interceptRef.current = handler
    return () => { interceptRef.current = null }
  }, [interceptRef, handler])
}

// Game rooms (/game/:gameId) render their own toolbar with theme/mute/back/
// rules/invite baked in (see Game.jsx) — showing the global NavBar on top of
// it doubled the header (~170px of chrome, theme+mute duplicated). /demo,
// /solo/:type and /local/:type have no header of their own and rely on this
// bar for theme/mute, so they're left out of the hidden set. /playground is
// fullscreen (h-dvh, camera-panned world) and hosts its own back/mute/theme
// HUD overlaid on the world — same reasoning as /game/.
const HIDDEN_ROUTES_PREFIXES = ['/game/', '/playground']

export default function NavBar() {
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const toggleMute = () => setMuted(sounds.toggle())
  const { pathname } = useLocation()
  const interceptRef = useContext(HomeInterceptContext)
  const hidden = useHideOnScroll({ enabled: TAB_BAR_ROUTES.includes(pathname), resetKey: pathname })

  // Mirror `hidden` onto <html> so sticky-chrome elsewhere (GamePicker's
  // filter/tab block) can collapse its top offset in sync via
  // --app-header-offset instead of leaving a gap when the header slides away.
  useEffect(() => {
    document.documentElement.classList.toggle('header-hidden', hidden)
    return () => document.documentElement.classList.remove('header-hidden')
  }, [hidden])

  if (HIDDEN_ROUTES_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  return (
    <header
      className={`sticky top-0 z-30 w-full border-b border-retro-border/60 bg-retro-bg/95 backdrop-blur
        pt-[max(0.75rem,env(safe-area-inset-top))]
        pl-[max(1rem,env(safe-area-inset-left))]
        pr-[max(1rem,env(safe-area-inset-right))]
        pb-2 transition-transform duration-200 ${hidden ? '-translate-y-full' : ''}`}
    >
      <div className="max-w-sm mx-auto flex items-center justify-between gap-2 min-h-9">
        <Link
          to="/"
          title="Home"
          onClick={(e) => {
            interceptRef.current?.(e)
            if (!e.defaultPrevented && pathname === '/') window.scrollTo(0, 0)
          }}
          className="relative flex items-center gap-2 shrink-0 active:scale-95 transition-transform
            before:content-[''] before:absolute before:-inset-y-2.5 before:-inset-x-2"
        >
          <div className="relative w-6 h-6 border-2 border-retro-cta bg-retro-tint-cta rounded
            flex items-center justify-center shadow-neon-cta">
            <svg width="12" height="12" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <line x1="10" y1="2" x2="10" y2="28" className="stroke-retro-cta" strokeWidth="3" strokeLinecap="square"/>
              <line x1="20" y1="2" x2="20" y2="28" className="stroke-retro-cta" strokeWidth="3" strokeLinecap="square"/>
              <line x1="2" y1="10" x2="28" y2="10" className="stroke-retro-cta" strokeWidth="3" strokeLinecap="square"/>
              <line x1="2" y1="20" x2="28" y2="20" className="stroke-retro-cta" strokeWidth="3" strokeLinecap="square"/>
            </svg>
          </div>
          <span className="font-pixel text-[9px] text-retro-cta text-glow-cta tracking-wide">
            GAME NIGHT
          </span>
        </Link>

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
          <AudioSettingsButton />
        </div>
      </div>
    </header>
  )
}
