import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { configError } from '../lib/firebase'
import { getGameConfig, GAME_TYPES } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import useCreateGame from '../hooks/useCreateGame'
import Avatar from '../components/Avatar'
import Onboarding from '../components/Onboarding'
import DailyTile from '../components/DailyTile'
import ContinuePlaying from '../components/ContinuePlaying'
import RecentlyPlayed from '../components/RecentlyPlayed'
import JoinRoomSheet from '../components/JoinRoomSheet'
import GameOptionsSheet from '../components/GameOptionsSheet'
import RulesModal from '../components/RulesModal'
import { useAuth } from '../lib/AuthContext'
import { dismissInvite } from '../lib/social'
import { defaultAvatarForId } from '../lib/avatars'
import { checkShouldOnboard } from '../lib/onboarding'
import { toast } from 'sonner'

const getPlayerName = (profile) => profile?.displayName || localStorage.getItem('playerName') || ''

export default function Home() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
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
    if (!code) { toast.error('ENTER A GAME CODE'); return }
    setJoinOpen(false)
    navigate(`/game/${code}`)
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
          <p className="font-pixel text-[10px] text-retro-cta tracking-[0.2em]">GAME NIGHT</p>
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
              className="min-h-11 flex items-center justify-center border border-retro-border bg-retro-card text-retro-p1 font-pixel text-[9px] tracking-wider rounded hover:border-retro-p1/60 hover:bg-retro-tint-p1 transition-all"
            >
              PLAY SOLO
            </Link>
            <button
              onClick={() => setJoinOpen(true)}
              className="min-h-11 flex items-center justify-center border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-wider rounded hover:border-retro-cta/60 transition-all"
            >
              JOIN ROOM
            </button>
          </div>
          <Link to="/online" className="inline-block mt-3 font-pixel text-[9px] text-retro-dim hover:text-retro-cta transition-colors">
            FIND AN OPPONENT ↗
          </Link>
        </section>

        <section className="max-w-md mx-auto w-full">
          <ContinuePlaying />
        </section>

        <section className="max-w-md mx-auto w-full">
          <RecentlyPlayed onSelect={type => setRecentGame(type)} loadingType={loading} />
        </section>

        <section className="max-w-md mx-auto w-full space-y-2">
          <p className="font-pixel text-[10px] text-retro-dim tracking-wider">A LITTLE EXTRA</p>
          <div className="flex gap-2">
            <DailyTile />
            <Link
              to="/games"
              className="flex-1 min-w-0 min-h-11 flex items-center justify-center bg-retro-card border-2 border-retro-border rounded px-3 py-3 text-retro-dim font-pixel text-[9px] tracking-wider hover:border-retro-cta/50 hover:text-retro-cta transition-colors"
            >
              EXPLORE GAMES ↗
            </Link>
          </div>
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
          onChange={setJoinCode}
          onJoin={joinGame}
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
