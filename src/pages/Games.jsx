import { useMemo, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { configError } from '../lib/firebase'
import { GAME_TYPES } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { useAuth } from '../lib/AuthContext'
import { defaultAvatarForId } from '../lib/avatars'
import { checkShouldOnboard } from '../lib/onboarding'
import useCreateGame from '../hooks/useCreateGame'
import GamePicker from '../components/GamePicker'
import Onboarding from '../components/LazyOnboarding'

export default function Games() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(() => checkShouldOnboard())
  const { profile } = useAuth()
  const avatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  const { createGame, loading } = useCreateGame({
    profile,
    avatar,
    onMissingName: () => setShowOnboarding(true),
  })
  const intent = searchParams.get('intent') === 'friend'
  const initialType = searchParams.get('game')
  const gameCount = useMemo(() => GAME_TYPES.filter(t => !t.variantOf).length, [])

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
        <header className="max-w-2xl mx-auto text-center pt-2">
          <p className="font-pixel text-[10px] text-retro-cta tracking-[0.2em]">{intent ? 'PLAY WITH A FRIEND' : 'THE ARCADE'}</p>
          <h1 className="font-pixel text-xl sm:text-2xl text-retro-text text-glow-cta mt-2 tracking-wider">
            CHOOSE YOUR GAME
          </h1>
          <p className="font-mono text-xs text-retro-dim mt-2">
            {intent ? 'Pick a game, then create a private room to share.' : `${gameCount} games · choose how you want to play`}
          </p>
        </header>

        <GamePicker
          layout="full"
          initialType={initialType}
          onSelect={createGame}
          onOnline={(type) => navigate(`/online?game=${type}`)}
          onSolo={(type) => navigate('/solo/' + type)}
          onLocal={(type) => navigate('/local/' + type)}
          loadingType={loading}
        />

        <div className="max-w-2xl mx-auto grid sm:grid-cols-2 gap-2 pt-2">
          <Link
            to="/demo"
            className="min-h-11 flex items-center justify-center border border-retro-p1/40 bg-retro-card text-retro-p1
              font-pixel text-[9px] tracking-wider rounded hover:border-retro-p1/70 hover:bg-retro-tint-p1 transition-all"
          >
            BROWSE SOLO GAMES ↗
          </Link>
          <Link
            to="/playground"
            className="min-h-11 flex items-center justify-center border border-retro-border bg-retro-card text-retro-dim
              font-pixel text-[9px] tracking-wider rounded hover:border-retro-cta/60 hover:text-retro-cta transition-all"
          >
            ENTER PLAYGROUND ↗
          </Link>
        </div>
      </div>
    </main>
  )
}
