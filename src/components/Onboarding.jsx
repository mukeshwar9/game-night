import { useState } from 'react'
import { toast } from 'sonner'
import ThemeSwitcher from './ThemeSwitcher'
import AvatarCustomizer from './AvatarCustomizer'
import { defaultAvatarForId, canonicalAvatar } from '../lib/avatars'
import { useAuth } from '../lib/AuthContext'
import { setProfile } from '../lib/social'
import { getPlayerId } from '../lib/playerId'
import { UPGRADE_ERRORS } from '../lib/auth'
import { configError } from '../lib/firebase'
import { markOnboarded } from '../lib/onboarding'
import { sounds } from '../lib/sounds'

export default function Onboarding({ onDone }) {
  const { uid, user, profile, isAnonymous, upgrade } = useAuth()
  const [step, setStep] = useState('welcome')
  const [busy, setBusy] = useState(false)
  // nameTouched/nameInput track user edits; before touching, name is derived
  const [nameTouched, setNameTouched] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [avatar, setAvatar] = useState(null)

  // Derived avatar — no sync effect: respects whatever ensureProfile seeded.
  const selectedAvatar = avatar || profile?.avatar || defaultAvatarForId(getPlayerId())

  // Derived name — pre-seeds from Google/profile until the user types.
  // Avoids setState-in-effect by computing inline instead of syncing state.
  const name = (() => {
    if (nameTouched) return nameInput
    const profileName = profile?.displayName
    const isGuestDefault = profileName && profileName.startsWith('Guest-')
    return ((!isGuestDefault && profileName) || user?.displayName || '').slice(0, 20)
  })()

  const handleGoogle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const u = await upgrade()
      if (u === null) return  // popup cancelled — stay silently
      sounds.join()
      setStep('identity')
    } catch (e) {
      console.error('Google sign-in failed:', e)
      toast.error(UPGRADE_ERRORS[e?.code] || `Sign-in failed${e?.code ? ` (${e.code})` : ''}. Please try again.`)
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    if (busy) return
    setBusy(true)
    const id = uid || getPlayerId()
    const finalName = name.trim().slice(0, 20) || `Guest-${String(id).slice(0, 4).toUpperCase()}`
    // Write localStorage first — onboarding is committed even if the DB write fails.
    try { localStorage.setItem('playerName', finalName) } catch { /* quota */ }
    const finalAvatar = canonicalAvatar(selectedAvatar)
    try { localStorage.setItem('playerAvatar', finalAvatar) } catch { /* quota */ }
    markOnboarded()
    try {
      await setProfile({ displayName: finalName, avatar: finalAvatar })
    } catch (e) {
      console.warn('Profile save failed (proceeding):', e?.message)
    }
    sounds.win()
    setBusy(false)
    onDone()
  }

  const uidPrefix = String(uid || getPlayerId()).slice(0, 4).toUpperCase()

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-4">
      {/* Theme switcher — fixed top-right per every-page convention */}
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10">
        <ThemeSwitcher />
      </div>

      {step === 'welcome' && (
        <div key="welcome" className="w-full max-w-xs space-y-8 text-center" style={{ animation: 'place-pop 0.25s ease-out' }}>
          {/* Logo — mirrors Home.jsx logo block */}
          <div className="space-y-3">
            <div className="mx-auto w-14 h-14 border-2 border-retro-cta bg-retro-tint-cta rounded flex items-center justify-center shadow-neon-cta">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
                <line x1="10" y1="2" x2="10" y2="28" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
                <line x1="20" y1="2" x2="20" y2="28" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
                <line x1="2" y1="10" x2="28" y2="10" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
                <line x1="2" y1="20" x2="28" y2="20" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
              </svg>
            </div>
            <div>
              <h1 className="font-pixel text-xl text-retro-cta text-glow-cta leading-relaxed">GAME NIGHT</h1>
              <p className="font-pixel text-[10px] text-retro-dim mt-3 animate-blink tracking-widest">INSERT COIN TO PLAY</p>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="space-y-3">
            {isAnonymous ? (
              <>
                <button
                  onClick={() => { sounds.go(); setStep('identity') }}
                  className="w-full py-3 bg-retro-cta text-retro-bg font-pixel text-sm tracking-widest rounded hover:shadow-neon-cta transition-all active:scale-95"
                >
                  PLAY AS GUEST
                </button>
                {!configError && (
                  <button
                    onClick={handleGoogle}
                    disabled={busy}
                    className="w-full py-2.5 flex items-center justify-center gap-2 border border-retro-p1/40 bg-retro-card text-retro-p1 font-pixel text-[10px] rounded hover:border-retro-p1 hover:shadow-neon-p1 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <GoogleMark /> SIGN IN WITH GOOGLE
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="font-mono text-[11px] text-retro-dim">SIGNED IN AS {user?.email}</p>
                <button
                  onClick={() => { sounds.go(); setStep('identity') }}
                  className="w-full py-3 bg-retro-cta text-retro-bg font-pixel text-sm tracking-widest rounded hover:shadow-neon-cta transition-all active:scale-95"
                >
                  CONTINUE
                </button>
              </>
            )}
          </div>

          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">CREDIT 1</p>
        </div>
      )}

      {step === 'identity' && (
        <div key="identity" className="w-full max-w-xs space-y-6" style={{ animation: 'place-pop 0.25s ease-out' }}>
          <h2 className="font-pixel text-sm text-retro-cta text-glow-cta text-center tracking-widest">CHOOSE YOUR FIGHTER</h2>

          <AvatarCustomizer value={selectedAvatar} onChange={setAvatar} previewSize={72} />

          {/* Name input — matches Home.jsx name input style */}
          <div className="space-y-1.5">
            <label className="font-pixel text-[10px] text-retro-dim tracking-wider">YOUR NAME</label>
            <input
              type="text"
              placeholder={`GUEST-${uidPrefix}`}
              value={name}
              onChange={e => { setNameInput(e.target.value); setNameTouched(true) }}
              maxLength={20}
              autoFocus
              className="w-full bg-retro-card border-2 border-retro-border text-retro-text font-pixel text-xs tracking-widest placeholder-retro-border rounded px-4 py-3 focus:outline-none focus:border-retro-p1 transition-colors"
            />
          </div>

          <button
            onClick={finish}
            disabled={busy}
            className="w-full py-3 bg-retro-cta text-retro-bg font-pixel text-sm tracking-widest rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-60"
          >
            {busy ? '…' : 'START'}
          </button>

          <button
            onClick={() => setStep('welcome')}
            className="block mx-auto font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors"
          >
            ← BACK
          </button>
        </div>
      )}
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.9 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  )
}
