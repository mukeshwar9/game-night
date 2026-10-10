import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { cn } from '@/lib/utils'

// Persistent Home/Daily/Friends/Profile tab bar, rendered at App level
// on the meta routes only (App.jsx decides when to mount this). The Game
// Night logo in the sticky NavBar is the go-home control on every screen.
const TABS = [
  {
    to: '/',
    end: true,
    label: 'HOME',
    badge: 'inviteCount', // M-63: pending game invites surface here — Home renders the invite list.
    icon: (
      <svg width="18" height="18" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <line x1="10" y1="2" x2="10" y2="28" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
        <line x1="20" y1="2" x2="20" y2="28" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
        <line x1="2" y1="10" x2="28" y2="10" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
        <line x1="2" y1="20" x2="28" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
      </svg>
    ),
  },
  {
    to: '/games',
    end: true,
    label: 'GAMES',
    // Its own glyph: HOME and GAMES both drew the # logo, so two of four
    // tabs looked identical.
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/friends',
    end: true,
    label: 'FRIENDS',
    badge: 'requestCount', // pending friend requests — Friends renders the request list.
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    to: '/profile',
    end: true,
    label: 'PROFILE',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
]

export default function BottomTabBar() {
  const { requestCount = 0, inviteCount = 0, onlineFriendCount = 0 } = useAuth()
  const counts = { requestCount, inviteCount }
  const { pathname } = useLocation()
  // Ambient presence signal, not an action: a green dot (bottom-right) when
  // any friend is online. Suppressed on /friends itself — you're already
  // looking at the list. The number pill (top-right) stays reserved for
  // actionable counts (requests/invites) only.
  const showOnlineDot = onlineFriendCount > 0 && pathname !== '/friends'

  return (
    <nav
      aria-label="Primary"
      className="app-tabbar fixed bottom-0 inset-x-0 z-30 border-t border-retro-border/60 bg-retro-bg/95 backdrop-blur
        pb-[max(0.5rem,env(safe-area-inset-bottom))]
        pl-[max(0,env(safe-area-inset-left))] pr-[max(0,env(safe-area-inset-right))]"
    >
      {/* glass classes: a floating pill on the GLASS themes, nothing elsewhere */}
      <div data-lens className="glass glass-tx glass-bar max-w-sm mx-auto flex items-stretch">
        {TABS.map(tab => {
          const badgeCount = tab.badge ? counts[tab.badge] : 0
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => cn(
                'flex-1 min-h-11 flex flex-col items-center justify-center gap-1 py-1.5 transition-colors press',
                isActive ? 'text-retro-cta' : 'text-retro-dim hover:text-retro-text',
              )}
            >
              {({ isActive }) => (
                <>
                  <span className={cn('relative', isActive && 'text-glow-cta')}>
                    {tab.icon}
                    {badgeCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[13px] h-[13px] px-0.5 rounded-full
                        bg-retro-p1 text-retro-bg font-pixel text-[8px] flex items-center justify-center">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}
                    {tab.to === '/friends' && showOnlineDot && (
                      <span
                        className="absolute -bottom-1 -right-1.5 w-2.5 h-2.5 rounded-full
                          bg-retro-win border-2 border-retro-bg"
                        title={`${onlineFriendCount} friend${onlineFriendCount === 1 ? '' : 's'} online`}
                      >
                        <span className="sr-only">{onlineFriendCount} friends online</span>
                      </span>
                    )}
                  </span>
                  <span className="font-pixel text-[8px] tracking-wide">{tab.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
