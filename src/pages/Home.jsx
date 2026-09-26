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
import DailyTile from '../components/DailyTile'
import ContinuePlaying from '../components/ContinuePlaying'
import RecentlyPlayed from '../components/RecentlyPlayed'
import JoinRoomSheet from '../components/JoinRoomSheet'
import GameOptionsSheet from '../components/GameOptionsSheet'
import RulesModal from '../components/LazyRulesModal'
import { useAuth } from '../lib/AuthContext'
import { dismissInvite } from '../lib/social'
import { defaultAvatarForId } from '../lib/avatars'
import { checkShouldOnboard } from '../lib/onboarding'

const getPlayerName = (profile) => profile?.displayName || localStorage.getItem('playerName') || ''
const GAME_COUNT = GAME_TYPES.filter(t => !t.variantOf).length

// Home's secondary rows (daily puzzle, find an opponent, all games): title,
// one plain line, one explicit action on the right. Same shape as DailyTile.
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
      <span className="shrink-0 min-h-11 min-w-[76px] px-3 flex items-center justify-center border border-retro-cta text-retro-cta font-pixel text-[9px] tracking-wider rounded group-hover:bg-retro-tint-cta transition-colors">
        {action}
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
  const [showOnboarding, setShowOnboarding] = useState(() => checkShouldOnboard())
  const { canInstall, install, isIos } = useInstallPrompt()
  const [iosHintDismissed, setIosHintDismissed] = useState(() => !!localStorage.getItem('gn-ios-install-dismissed'))
  const { profile, invites } = useAuth()
  const myAvatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  const { createGame, loading } = useCreateGame({
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
                    {getGameConfig(inv.gameType)?.label || 'GAME'}
                  </p>
                </div>
                <button
                  onClick={() => { dismissInvite(inv.id); navigate(`/game/${inv.gameId}`) }}
                  className="min-h-11 px-3 flex items-center justify-center bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta transition-all active:scale-95"
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
          <p className="font-mono text-xs text-retro-dim mt-2">Pick a game. Share a link. Start playing.</p>
          <Link
            to="/games?intent=friend"
            className="mt-5 min-h-12 w-full flex items-center justify-center bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-widest rounded hover:shadow-neon-cta transition-all active:scale-[0.98]"
          >
            PLAY WITH FRIENDS
          </Link>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Link
              to="/demo"
              className="min-h-12 flex items-center justify-center border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-wider rounded hover:border-retro-cta/60 transition-all active:scale-[0.98]"
            >
              PLAY SOLO
            </Link>
            <button
              onClick={() => setJoinOpen(true)}
              className="min-h-12 flex items-center justify-center border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-wider rounded hover:border-retro-cta/60 transition-all active:scale-[0.98]"
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

        <section className="max-w-md mx-auto w-full space-y-2" aria-labelledby="home-today">
          <h2 id="home-today" className="font-pixel text-[10px] text-retro-dim tracking-wider">TODAY</h2>
          <DailyTile />
          <ActionRow to="/online" title="FIND AN OPPONENT" detail="Join a public room or open one" action="BROWSE" />
          <ActionRow to="/games" title="ALL GAMES" detail={`${GAME_COUNT} games to explore`} action="VIEW" />
        </section>

        {canInstall && (
          <button
            onClick={install}
            className="max-w-md mx-auto w-full py-2.5 flex items-center justify-center gap-2 border border-retro-p1/30 bg-retro-card text-retro-p1 font-pixel text-[10px] rounded hover:border-retro-p1/60 hover:shadow-neon-p1 transition-all active:scale-95"
          >
            + ADD TO HOME SCREEN
          </button>
        )}
        {!canInstall && isIos && !iosHintDismissed && (
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
