import { NavLink } from 'react-router-dom'
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
    to: '/daily',
    end: true,
    label: 'DAILY',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
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
  const { requestCount = 0, inviteCount = 0 } = useAuth()
  const counts = { requestCount, inviteCount }

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-30 border-t border-retro-border/60 bg-retro-bg/95 backdrop-blur
        pb-[max(0.5rem,env(safe-area-inset-bottom))]
        pl-[max(0,env(safe-area-inset-left))] pr-[max(0,env(safe-area-inset-right))]"
    >
      <div className="max-w-sm mx-auto flex items-stretch">
        {TABS.map(tab => {
          const badgeCount = tab.badge ? counts[tab.badge] : 0
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => cn(
                'flex-1 min-h-11 flex flex-col items-center justify-center gap-1 py-1.5 transition-colors active:scale-95',
                isActive ? 'text-retro-cta' : 'text-retro-dim hover:text-retro-text',
              )}
            >
              {({ isActive }) => (
                <>
                  <span className={cn('relative', isActive && 'text-glow-cta')}>
                    {tab.icon}
                    {badgeCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[13px] h-[13px] px-0.5 rounded-full
                        bg-retro-p1 text-retro-bg font-pixel text-[6px] flex items-center justify-center">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}
                  </span>
                  <span className="font-pixel text-[7px] tracking-wide">{tab.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
