import { useState, useMemo, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ref, set } from 'firebase/database'
import { db, configError } from '../lib/firebase'
import { generateGameId } from '../lib/gameLogic'
import { freshGameState, getGameConfig, GAME_TYPES } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { getStats, getRooms, recordRoom } from '../lib/profile'
import { recordPlay } from '../lib/analytics'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { sounds } from '../lib/sounds'
import GamePicker from '../components/GamePicker'
import EmptyState from '../components/EmptyState'
import ThemeSwitcher from '../components/ThemeSwitcher'
import Avatar from '../components/Avatar'
import Onboarding from '../components/Onboarding'
import DailyTile from '../components/DailyTile'
import ContinuePlaying from '../components/ContinuePlaying'
import RecentlyPlayed from '../components/RecentlyPlayed'
import { useAuth } from '../lib/AuthContext'
import { dismissInvite } from '../lib/social'
import { defaultAvatarForId } from '../lib/avatars'
import { checkShouldOnboard, hasOnboarded } from '../lib/onboarding'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const getPlayerName = (profile) => profile?.displayName || localStorage.getItem('playerName') || ''

export default function Home() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(null)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const { canInstall, install, isIos } = useInstallPrompt()
  const stats = useMemo(() => getStats(), [])
  const [isNewVisitor] = useState(() => !localStorage.getItem('playerName') && getRooms().length === 0)
  const [showOnboarding, setShowOnboarding] = useState(() => checkShouldOnboard())
  const [onboarded, setOnboarded] = useState(() => hasOnboarded())
  const [howItWorksDismissed, setHowItWorksDismissed] = useState(() => !!localStorage.getItem('gn-howitworks-dismissed'))
  const { profile, invites, isAnonymous } = useAuth()
  const gameCount = useMemo(() => GAME_TYPES.filter(t => !t.variantOf).length, [])
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    const ts = Number(localStorage.getItem('gn-upgrade-nudge-dismissed'))
    return ts > 0 && Date.now() - ts < 14 * 24 * 60 * 60 * 1000
  })
  const [iosHintDismissed, setIosHintDismissed] = useState(() => !!localStorage.getItem('gn-ios-install-dismissed'))
  const showUpgradeNudge = isAnonymous && !nudgeDismissed && stats &&
    (stats.bestStreak >= 3 || stats.games >= 5)
  const dismissUpgradeNudge = () => {
    localStorage.setItem('gn-upgrade-nudge-dismissed', String(Date.now()))
    setNudgeDismissed(true)
  }
  const dismissIosHint = () => {
    localStorage.setItem('gn-ios-install-dismissed', '1')
    setIosHintDismissed(true)
  }
  const dismissHowItWorks = () => {
    localStorage.setItem('gn-howitworks-dismissed', '1')
    setHowItWorksDismissed(true)
  }

  const myAvatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())

  const toggleMute = () => setMuted(sounds.toggle())

  // M-82: restore scroll position on return from a game (Home fully
  // unmounts on navigation, so this can't be a simple useState/useRef).
  useEffect(() => {
    const KEY = 'gn-home-scrollY'
    const saved = Number(sessionStorage.getItem(KEY))
    if (saved > 0) {
      // Double rAF so the full catalog (GamePicker's restored category/filters
      // included) has laid out before we jump to a mid-page scroll position.
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved)))
    }
    const onScroll = () => sessionStorage.setItem(KEY, String(window.scrollY))
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const createGame = async (gameType) => {
    const playerName = getPlayerName(profile)
    if (!playerName) { setShowOnboarding(true); return }
    setLoading(gameType)
    try {
      const gameId = generateGameId()
      const cfg = getGameConfig(gameType)
      const myId = getPlayerId()
      let gameData
      if (cfg.nPlayer) {
        const now = Date.now()
        gameData = {
          gameType,
          status: 'waiting',
          scores: {},
          createdAt: now,
          lastActivityAt: now,
          players: { [myId]: { name: playerName, joinedAt: now, playerId: myId, online: true, avatar: myAvatar } },
          ...freshGameState(gameType),
        }
      } else {
        gameData = {
          gameType,
          status: 'waiting',
          scores: { X: 0, O: 0 },
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          players: { X: { name: playerName, joinedAt: Date.now(), playerId: myId, avatar: myAvatar } },
          ...freshGameState(gameType),
        }
      }
      await set(ref(db, `games/${gameId}`), gameData)
      recordPlay(gameType, 'multi')
      if (!cfg.nPlayer) {
        sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name: playerName }))
      }
      recordRoom({ id: gameId, gameType })
      navigate(`/game/${gameId}`)
    } catch {
      toast.error('CONNECTION ERROR. TRY AGAIN.')
      setLoading(null)
    }
  }

  const joinGame = () => {
    const playerName = getPlayerName(profile)
    if (!playerName) { setShowOnboarding(true); return }
    const code = joinCode.trim().toUpperCase()
    if (!code) { toast.error('ENTER A GAME CODE'); return }
    navigate(`/game/${code}`)
  }

  // Early return — after all hooks (hook-order safety).
  if (showOnboarding) return (
    <Onboarding onDone={() => {
      setOnboarded(true)
      setShowOnboarding(false)
    }} />
  )

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-4 relative">
      {/* Controls — fixed top-right */}
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex gap-2">
        <ThemeSwitcher />
        <button
          onClick={toggleMute}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
          className="min-h-11 min-w-11 flex items-center justify-center text-retro-dim hover:text-retro-text transition-colors p-2 rounded border border-retro-border bg-retro-card"
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

      {/* M-62: the profile/friends chips that used to live here are now the
          Profile/Friends tabs in BottomTabBar (rendered app-wide at App
          level), so Home no longer hand-rolls its own copy of that nav. */}

      {/* M-23: in-flow spacer clearing the fixed top-right control row above —
          matches its top offset + height so scrolling content never runs
          underneath (and steals/blocks taps from) the theme/mute chips. */}
      <div
        aria-hidden="true"
        style={{ height: 'calc(max(1rem, env(safe-area-inset-top)) + 2.75rem)' }}
      />

      {configError && (
        <div className="w-full max-w-sm mb-6 border border-retro-p2/50 bg-retro-card rounded px-4 py-3">
          <p className="font-pixel text-[10px] text-retro-p2">FIREBASE NOT CONFIGURED</p>
          <p className="font-mono text-xs text-retro-dim mt-1">{configError}</p>
        </div>
      )}

      <div className="w-full max-w-sm md:max-w-3xl lg:max-w-5xl space-y-6">
        {/* Logo */}
        <div className="max-w-md mx-auto w-full text-center space-y-3">
          <div className="mx-auto w-14 h-14 border-2 border-retro-cta bg-retro-tint-cta rounded
            flex items-center justify-center shadow-neon-cta">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <line x1="10" y1="2" x2="10" y2="28" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
              <line x1="20" y1="2" x2="20" y2="28" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
              <line x1="2" y1="10" x2="28" y2="10" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
              <line x1="2" y1="20" x2="28" y2="20" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
            </svg>
          </div>
          <div>
            <h1 className="font-pixel text-xl text-retro-cta text-glow-cta leading-relaxed">
              GAME NIGHT
            </h1>
            <p className="font-mono text-xs text-retro-dim mt-2 tracking-widest">
              {gameCount} GAMES · SHARE A LINK · NO ACCOUNT
            </p>
          </div>
        </div>

        {/* Pending game invites from friends */}
        {invites.length > 0 && (
          <div className="max-w-md mx-auto w-full space-y-2">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-2.5 bg-retro-tint-cta border border-retro-cta/40 rounded p-2.5">
                <Avatar id={inv.fromAvatar} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[11px] text-retro-text truncate">
                    <span className="text-retro-cta">{inv.fromName}</span> invited you
                  </p>
                  <p className="font-pixel text-[8px] text-retro-dim mt-0.5">{getGameConfig(inv.gameType).label}</p>
                </div>
                {/* M-59: JOIN and dismiss both hit ≥44px, with a clear gap between
                    them so "not now" isn't a mis-tap away from joining someone's room. */}
                <button
                  onClick={() => { dismissInvite(inv.id); navigate(`/game/${inv.gameId}`) }}
                  className="min-h-11 px-3 flex items-center justify-center bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta transition-all active:scale-95"
                >
                  JOIN
                </button>
                <button
                  onClick={() => dismissInvite(inv.id)}
                  aria-label="Dismiss invite"
                  className="min-h-11 min-w-11 ml-1 flex items-center justify-center text-retro-dim hover:text-retro-p2 font-pixel text-[9px] rounded transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Utility row — daily challenge + join by code. Wraps to its own
            line below ~360px wide so neither lane gets crushed under 44px. */}
        <div className="max-w-md mx-auto w-full flex flex-wrap gap-2">
          <div className="flex-1 min-w-[140px]">
            <DailyTile />
          </div>
          <div className="flex-1 min-w-[180px] flex gap-2">
            <input
              type="text"
              placeholder="JOIN CODE"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinGame()}
              maxLength={6}
              className="flex-1 min-w-0 min-h-11 bg-retro-card border-2 border-retro-border text-retro-p1
                font-pixel text-xs placeholder-retro-border rounded px-3 py-2
                focus:outline-none focus:border-retro-p1 tracking-widest transition-colors"
            />
            <button
              onClick={joinGame}
              className="min-h-11 px-4 flex items-center justify-center bg-retro-card border-2 border-retro-border text-retro-text
                font-pixel text-[10px] rounded hover:border-retro-p1/50 transition-colors active:scale-95"
            >
              JOIN
            </button>
          </div>
        </div>

        {/* First-run HOW IT WORKS strip */}
        {isNewVisitor && !onboarded && !howItWorksDismissed && (
          <div className="max-w-md mx-auto w-full bg-retro-card border border-retro-border rounded p-3 relative">
            <button
              onClick={dismissHowItWorks}
              aria-label="Dismiss"
              className="absolute top-2 right-2 text-retro-border hover:text-retro-dim transition-colors leading-none font-mono text-xs"
            >
              ✕
            </button>
            <p className="font-pixel text-[9px] text-retro-cta tracking-widest mb-2">HOW IT WORKS</p>
            <div className="space-y-2">
              {[
                { n: '1', label: 'PICK A GAME', sub: `Choose from ${gameCount} mini-games below` },
                { n: '2', label: 'SHARE THE LINK', sub: 'Send the room link to a friend' },
                { n: '3', label: 'PLAY TOGETHER', sub: 'No accounts, no downloads' },
              ].map(({ n, label, sub }) => (
                <div key={n} className="flex items-start gap-2.5">
                  <span className={cn(
                    'shrink-0 w-5 h-5 rounded flex items-center justify-center font-pixel text-[9px]',
                    'bg-retro-tint-cta border border-retro-cta/40 text-retro-cta'
                  )}>{n}</span>
                  <div>
                    <p className="font-pixel text-[9px] text-retro-text tracking-wider">{label}</p>
                    <p className="font-mono text-[11px] text-retro-dim leading-tight">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/demo"
              className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 border border-retro-p1/40 bg-retro-tint-p1 text-retro-p1 font-pixel text-[9px] rounded hover:shadow-neon-p1 transition-all active:scale-95"
            >
              NO FRIENDS ONLINE? PLAY SOLO VS AI →
            </Link>
          </div>
        )}

        <ContinuePlaying />

        {/* Game selection */}
        <div className="space-y-1.5">
          <label className="max-w-md mx-auto w-full block font-pixel text-[10px] text-retro-dim tracking-wider">SELECT GAME</label>
          <GamePicker
            layout="full"
            onSelect={createGame}
            onSolo={(type) => navigate('/solo/' + type)}
            loadingType={loading}
          />
        </div>

        <RecentlyPlayed onSelect={createGame} loadingType={loading} />

        {/* Solo play CTA — visible to everyone, especially useful before a friend joins */}
        <Link
          to="/demo"
          className={cn(
            'max-w-md mx-auto w-full flex items-center justify-center gap-2 py-3 rounded',
            'border-2 border-retro-p1/40 bg-retro-card text-retro-p1',
            'font-pixel text-[10px] tracking-widest',
            'hover:border-retro-p1/70 hover:shadow-neon-p1 hover:bg-retro-tint-p1',
            'transition-all active:scale-[0.98]'
          )}
        >
          BROWSE ALL SOLO GAMES →
        </Link>

        {/* Your stats — local, no login */}
        <div className="max-w-md mx-auto w-full space-y-1.5">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">YOUR STATS</label>
          {stats && stats.games > 0 ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'WINS', val: stats.wins, col: 'text-retro-win' },
                { label: 'LOSSES', val: stats.losses, col: 'text-retro-p2' },
                { label: 'BEST STREAK', val: stats.bestStreak, col: 'text-retro-cta' },
              ].map(({ label, val, col }) => (
                <div key={label} className="bg-retro-card border border-retro-border rounded py-2">
                  <p className={cn('font-pixel text-base', col)}>{val}</p>
                  <p className="font-pixel text-[7px] text-retro-dim mt-1 tracking-wider">{label}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>PLAY A MATCH TO START YOUR RECORD</EmptyState>
          )}
        </div>

        {/* Upgrade nudge — anonymous users at a milestone */}
        {showUpgradeNudge && (
          <div className="max-w-md mx-auto w-full flex items-center gap-2.5 bg-retro-card border border-retro-border rounded px-3 py-2.5">
            <p className="flex-1 font-mono text-[11px] text-retro-dim leading-tight">
              NICE STREAK — {' '}
              <Link to="/profile" className="text-retro-cta hover:text-glow-cta transition-all font-pixel text-[9px] tracking-wider">
                SIGN IN
              </Link>
              {' '} TO KEEP IT ACROSS DEVICES
            </p>
            <button
              onClick={dismissUpgradeNudge}
              aria-label="Dismiss"
              className="text-retro-dim hover:text-retro-p2 font-pixel text-[9px] transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* PWA install */}
        {canInstall && (
          <button
            onClick={install}
            className="max-w-md mx-auto w-full py-2.5 flex items-center justify-center gap-2 border border-retro-p1/30
              bg-retro-card text-retro-p1 font-pixel text-[10px] rounded
              hover:border-retro-p1/60 hover:shadow-neon-p1 transition-all active:scale-95"
          >
            + ADD TO HOME SCREEN
          </button>
        )}
        {!canInstall && isIos && !iosHintDismissed && (
          <div className="max-w-md mx-auto w-full flex items-center gap-2.5 border border-retro-p1/30
            bg-retro-card text-retro-p1 rounded px-3 py-2.5">
            <p className="flex-1 font-pixel text-[9px] tracking-wide">INSTALL: TAP SHARE → ADD TO HOME SCREEN</p>
            <button
              onClick={dismissIosHint}
              aria-label="Dismiss"
              className="text-retro-dim hover:text-retro-p2 font-pixel text-[9px] transition-colors"
            >
              ✕
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
