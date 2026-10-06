import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { configError, db } from '../lib/firebase'
import { ref, get } from 'firebase/database'
import useBusy from '../hooks/useBusy'
import { getGameConfig, GAME_TYPES, supportsLocalPlay } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import useCreateGame from '../hooks/useCreateGame'
import Avatar from '../components/Avatar'
import Onboarding from '../components/LazyOnboarding'
import DailyTile, { DailyMemoryTile } from '../components/DailyTile'
import ContinuePlaying from '../components/ContinuePlaying'
import RecentlyPlayed from '../components/RecentlyPlayed'
import HeadlineGames from '../components/HeadlineGames'
import { readRecent } from '../lib/recentRail'
import JoinRoomSheet from '../components/JoinRoomSheet'
import GameOptionsSheet from '../components/GameOptionsSheet'
import RulesModal from '../components/LazyRulesModal'
import { useAuth } from '../lib/AuthContext'
import { dismissInvite } from '../lib/social'
import { partyInviteLine } from '../lib/partyLogic'
import { defaultAvatarForId } from '../lib/avatarKit'
import { checkShouldOnboard } from '../lib/onboarding'
import { parseAppStoreId, playLiveFrom, storeBadgeFor } from '../lib/storeLinks'
import { isNative } from '../lib/platform'

const getPlayerName = (profile) => profile?.displayName || localStorage.getItem('playerName') || ''

// Home's secondary rows (daily puzzle, find an opponent): title, one plain
// line, one text action on the right. The whole row is the link, so the
// action is a label, not a second bordered button. Same shape as DailyTile.
function ActionRow({ to, title, detail, action }) {
  return (
    <Link
      to={to}
      className="group w-full min-h-14 flex items-center gap-3 bg-retro-card border border-retro-border rounded px-3 py-2.5
        hover:border-retro-cta/50 transition-colors active:scale-[0.99]"
    >
      <span className="flex-1 min-w-0">
        <span className="block font-pixel text-[10px] text-retro-text tracking-wider">{title}</span>
        <span className="block font-mono text-[11px] text-retro-dim mt-1 truncate">{detail}</span>
      </span>
      <span className="shrink-0 min-h-11 pl-2 flex items-center gap-1.5 text-retro-cta font-pixel text-[9px] tracking-wider group-hover:text-glow-cta transition-colors">
        {action} <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinError, setJoinError] = useState(null)
  const [joinBusy, runJoin] = useBusy()
  const [recentGame, setRecentGame] = useState(null)
  const [rulesGame, setRulesGame] = useState(null)
  // Someone who has not played anything yet gets six headline games instead of
  // a wall; the rail above takes over once they have.
  const [firstVisit] = useState(() => readRecent().length === 0)
  const [showOnboarding, setShowOnboarding] = useState(() => checkShouldOnboard())
  const { canInstall, install, isIos } = useInstallPrompt()
  // Once the apps are in the stores, phones get the store instead of the
  // add-to-home-screen hints (lib/storeLinks.js; dark until the listings exist).
  const [storeBadge] = useState(() => storeBadgeFor({
    ua: navigator.userAgent,
    appStoreId: parseAppStoreId(import.meta.env.VITE_APPSTORE_ID),
    playLive: playLiveFrom(import.meta.env.VITE_PLAY_LIVE),
    native: isNative,
    standalone: navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
  }))
  const [iosHintDismissed, setIosHintDismissed] = useState(() => !!localStorage.getItem('gn-ios-install-dismissed'))
  const { profile, invites } = useAuth()
  const myAvatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  const { createGame, createParty, loading } = useCreateGame({
    profile,
    avatar: myAvatar,
    onMissingName: () => setShowOnboarding(true),
  })

  const dismissIosHint = () => {
    localStorage.setItem('gn-ios-install-dismissed', '1')
    setIosHintDismissed(true)
  }

  const joinGame = () => {
    if (!getPlayerName(profile)) { setJoinOpen(false); setShowOnboarding(true); return }
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) { setJoinError('ROOM CODES ARE 6 CHARACTERS'); return }
    // Check the room exists before leaving the sheet, so a typo is fixed in
    // place instead of landing on a dead-end "not found" page.
    runJoin(async () => {
      if (db) {
        const snap = await get(ref(db, `games/${code}/status`))
        if (!snap.exists()) { setJoinError('NO ROOM WITH THAT CODE — DOUBLE-CHECK IT'); return }
      }
      setJoinOpen(false)
      navigate(`/game/${code}`)
    }, () => { setJoinOpen(false); navigate(`/game/${code}`) })
  }

  const playerName = getPlayerName(profile)

  // JUMP BACK IN resumes a solo or pass-and-play game directly; an online
  // game (or one whose mode is gone) opens the options sheet as before.
  const handleRecentSelect = (type, mode) => {
    const cfg = getGameConfig(type)
    if (mode === 'solo' && cfg?.solo) navigate('/solo/' + type)
    else if (mode === 'local' && supportsLocalPlay(type)) navigate('/local/' + type)
    else setRecentGame(type)
  }

  const recentCfg = recentGame ? getGameConfig(recentGame) : null
  const recentGameWithModes = recentCfg
    ? { ...recentCfg, hasVariants: GAME_TYPES.some(t => t.variantOf === recentCfg.type) }
    : null
  const handleRecentInvite = (game) => { setRecentGame(null); createGame(game.type) }
  const handleRecentSolo = (game) => { setRecentGame(null); navigate('/solo/' + game.type) }
  const handleRecentLocal = (game) => { setRecentGame(null); navigate('/local/' + game.type) }
  const handleRecentPublic = (game) => { setRecentGame(null); navigate(`/online?game=${game.type}`) }
  const handleRecentModes = (game) => {
    setRecentGame(null)
    navigate(`/games?game=${game.type}`)
  }

  if (showOnboarding) return (
    <Onboarding onDone={() => setShowOnboarding(false)} />
  )

  return (
    <main className="min-h-screen bg-retro-bg p-4">
      <div className="w-full max-w-5xl mx-auto space-y-6">
        {configError && (
          <div className="max-w-md mx-auto border border-retro-p2/50 bg-retro-card rounded px-4 py-3">
            <p className="font-pixel text-[10px] text-retro-p2">FIREBASE NOT CONFIGURED</p>
            <p className="font-mono text-xs text-retro-dim mt-1">{configError}</p>
          </div>
        )}

        {invites.length > 0 && (
          <section className="max-w-md mx-auto w-full space-y-2" aria-label="Game invitations">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-2.5 bg-retro-tint-cta border border-retro-cta/40 rounded p-2.5">
                <Avatar id={inv.fromAvatar} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[11px] text-retro-text truncate">
                    <span className="text-retro-cta">{inv.fromName}</span> invited you
                  </p>
                  <p className="font-pixel text-[8px] text-retro-dim mt-0.5">
                    {partyInviteLine(inv, (t) => getGameConfig(t)?.label)}
                  </p>
                </div>
                <button
                  onClick={() => { dismissInvite(inv.id); navigate(`/game/${inv.gameId}`) }}
                  className="min-h-11 px-3 flex items-center justify-center bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta transition active:scale-95"
                >
                  JOIN
                </button>
                <button
                  onClick={() => dismissInvite(inv.id)}
                  aria-label="Dismiss invite"
                  className="min-h-11 min-w-11 flex items-center justify-center text-retro-dim hover:text-retro-p2 font-pixel text-[9px] rounded transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="max-w-md mx-auto w-full text-center pt-2">
          <p className="font-pixel text-[10px] text-retro-cta tracking-[0.2em] truncate">
            {playerName ? `WELCOME BACK, ${playerName.toUpperCase()}` : 'GAME NIGHT'}
          </p>
          <h1 className="font-pixel text-xl sm:text-2xl text-retro-text text-glow-cta mt-2 tracking-wider">
            READY FOR ANOTHER ROUND?
          </h1>
          {/* Party first: friends gather, then the host picks a game that fits
              how many came. A single game for two stays on the GAMES tab. */}
          <button
            type="button"
            onClick={() => createParty()}
            disabled={!!loading}
            data-testid="start-party"
            className="mt-5 min-h-12 w-full flex flex-col items-center justify-center gap-1 py-2 bg-retro-cta text-retro-bg rounded hover:shadow-neon-cta transition active:scale-[0.98] disabled:opacity-60"
          >
            <span className="font-pixel text-[10px] tracking-widest">{loading === 'party' ? 'STARTING…' : 'START A PARTY'}</span>
            <span className="font-mono text-[10px] opacity-80">invite up to 3 friends, then pick a game</span>
          </button>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Link
              to="/demo"
              className="min-h-12 flex items-center justify-center border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-wider rounded hover:border-retro-cta/60 transition active:scale-[0.98]"
            >
              PLAY SOLO
            </Link>
            <button
              onClick={() => setJoinOpen(true)}
              className="min-h-12 flex items-center justify-center border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-wider rounded hover:border-retro-cta/60 transition active:scale-[0.98]"
            >
              JOIN ROOM
            </button>
          </div>
        </section>

        <section className="max-w-md mx-auto w-full">
          <ContinuePlaying />
        </section>

        <section className="max-w-md mx-auto w-full">
          <RecentlyPlayed onSelect={handleRecentSelect} loadingType={loading} />
        </section>

        {firstVisit && <HeadlineGames className="max-w-md mx-auto w-full" />}

        {/* ALL GAMES lived here too, a copy of the GAMES tab one row down. */}
        <section className="max-w-md mx-auto w-full space-y-2" aria-label="More ways to play">
          <DailyTile />
          <DailyMemoryTile />
          <ActionRow to="/online" title="FIND AN OPPONENT" detail="Join a public room or open one" action="BROWSE" />
        </section>

        {storeBadge && (
          <a
            href={storeBadge.url}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-md mx-auto w-full py-2.5 flex items-center justify-center gap-2 border border-retro-p1/30 bg-retro-card text-retro-p1 font-pixel text-[10px] rounded hover:border-retro-p1/60 hover:shadow-neon-p1 transition active:scale-95"
          >
            {storeBadge.store === 'ios' ? 'GET THE APP ON THE APP STORE' : 'GET THE APP ON GOOGLE PLAY'}
          </a>
        )}
        {!storeBadge && canInstall && (
          <button
            onClick={install}
            className="max-w-md mx-auto w-full py-2.5 flex items-center justify-center gap-2 border border-retro-p1/30 bg-retro-card text-retro-p1 font-pixel text-[10px] rounded hover:border-retro-p1/60 hover:shadow-neon-p1 transition active:scale-95"
          >
            + ADD TO HOME SCREEN
          </button>
        )}
        {!storeBadge && !canInstall && isIos && !iosHintDismissed && (
          <div className="max-w-md mx-auto w-full flex items-center gap-2.5 border border-retro-p1/30 bg-retro-card text-retro-p1 rounded px-3 py-2.5">
            <p className="flex-1 font-pixel text-[9px] tracking-wide">INSTALL: TAP SHARE → ADD TO HOME SCREEN</p>
            <button onClick={dismissIosHint} aria-label="Dismiss" className="text-retro-dim hover:text-retro-p2 font-pixel text-[9px] transition-colors">✕</button>
          </div>
        )}
      </div>

      {joinOpen && (
        <JoinRoomSheet
          code={joinCode}
          onChange={v => { setJoinCode(v); setJoinError(null) }}
          onJoin={joinGame}
          error={joinError}
          busy={joinBusy}
          onClose={() => setJoinOpen(false)}
        />
      )}
      {recentGameWithModes && (
        <GameOptionsSheet
          game={recentGameWithModes}
          onInvite={handleRecentInvite}
          onPublic={handleRecentPublic}
          onSolo={recentCfg.solo ? handleRecentSolo : undefined}
          onLocal={handleRecentLocal}
          onModes={handleRecentModes}
          onRules={(game) => { setRecentGame(null); setRulesGame(game.type) }}
          onClose={() => setRecentGame(null)}
          loadingType={loading}
        />
      )}
      {rulesGame && <RulesModal gameType={rulesGame} onClose={() => setRulesGame(null)} />}
    </main>
  )
}
