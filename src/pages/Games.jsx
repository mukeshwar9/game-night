import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { configError } from '../lib/firebase'
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
        {/* One title line. The game count already sits in the search
            placeholder and the ALL chip; the friend intent keeps its one
            instruction because it changes what a tap does. */}
        <header className="max-w-2xl mx-auto text-center pt-2">
          <h1 className="font-pixel text-base sm:text-xl text-retro-text text-glow-cta tracking-wider">
            CHOOSE YOUR GAME
          </h1>
          {intent && (
            <p className="font-mono text-xs text-retro-dim mt-2">We&apos;ll make a private room with a link.</p>
          )}
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

        {/* Solo already has a home button and a tab; the playground is the
            one place only reachable from here, so it keeps a quiet link. */}
        <p className="max-w-2xl mx-auto text-center pt-2">
          <Link
            to="/playground"
            className="inline-flex min-h-11 items-center px-3 font-pixel text-[9px] tracking-wider text-retro-dim hover:text-retro-cta transition-colors"
          >
            ENTER THE PLAYGROUND →
          </Link>
        </p>
      </div>
    </main>
  )
}
