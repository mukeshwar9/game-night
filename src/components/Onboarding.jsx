import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import Avatar from './Avatar'
import AvatarPicker, { DieIcon } from './AvatarPicker'
import AuthErrorBanner from './AuthErrorBanner'
import useBusy from '../hooks/useBusy'
import { useMarkOnboardingOpen } from '../hooks/useOnboardingOpen'
import { defaultAvatarForId, canonicalAvatar } from '../lib/avatars'
import { useAuth } from '../lib/AuthContext'
import { setProfile } from '../lib/social'
import { GAME_TYPES, getGameConfig } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { UPGRADE_ERRORS, preloadGoogleSignIn } from '../lib/auth'
import { configError } from '../lib/firebase'
import { markOnboarded } from '../lib/onboarding'
import { NAME_MAX, initialName, suggestName, suggestNames, validateName } from '../lib/onboardingLogic'
import { sounds } from '../lib/sounds'
import { inviteSeatsLine } from '../lib/roomLogic'
import { cn } from '@/lib/utils'

// First-run flow, two steps: NAME, then LOOK. Shown to a brand-new visitor
// on Home/Games/Online, and to someone opening an invite link (`invite` set:
// { gameId, gameType?, hostName?, hostAvatar?, ...inviteSummary() } — see
// useRoomSession, which decides when), where it ends in JOIN GAME.
// Names go through validateName, which applies the shared moderation.
// Loaded lazily by every caller so it stays out of the first-load chunk.
//
// The name field starts filled with a real profile/Google name or a friendly
// suggestion, so NEXT → LET'S PLAY is two taps; nothing is saved until the
// last step. Choices go to the profile (users/{uid}) and are mirrored to
// localStorage for the synchronous reads in Home/Game.
export default function Onboarding({ onDone, invite = null }) {
  const { uid, user, profile, isAnonymous, upgrade } = useAuth()
  const gameCount = GAME_TYPES.filter(t => !t.variantOf).length
  const [step, setStep] = useState('name')
  const [googleBusy, runGoogle] = useBusy()
  const [saving, runSave] = useBusy()
  const [suggestion] = useState(() => suggestName())
  const [chips, setChips] = useState(() => suggestNames(3, Math.random, suggestion))
  // null = untouched: the field shows the derived default below, so a profile
  // that loads after mount (or a Google sign-in) still fills it in.
  const [nameInput, setNameInput] = useState(null)
  const [showError, setShowError] = useState(false)
  const [avatar, setAvatar] = useState(null)
  const inputRef = useRef(null)
  const headingRef = useRef(null)
  const firstFocus = useRef(true)
  const ids = useId()
  useMarkOnboardingOpen()

  const name = nameInput ?? initialName({
    profileName: profile?.displayName,
    accountName: user?.displayName,
    suggestion,
  })
  const check = validateName(name)
  const selectedAvatar = canonicalAvatar(avatar || profile?.avatar || defaultAvatarForId(uid || getPlayerId()))

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    window.scrollTo(0, 0)
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  const showGoogle = !invite && isAnonymous && !configError
  useEffect(() => (showGoogle ? preloadGoogleSignIn() : undefined), [showGoogle])

  const setName = (v) => { setNameInput(v); setShowError(false) }

  const rollName = () => {
    sounds.move('X')
    const [next, ...rest] = suggestNames(4, Math.random, name)
    setName(next)
    setChips(rest)
  }

  const next = () => {
    if (!check.ok) {
      setShowError(true)
      inputRef.current?.focus()
      return
    }
    setNameInput(check.name)
    sounds.go()
    setStep('look')
  }

  const handleGoogle = () => runGoogle(async () => {
    const u = await upgrade()
    // undefined = a redirect was kicked off (mobile/standalone PWA); null = the
    // popup was cancelled. Either way, stay put and stay silent.
    if (!u) return
    sounds.join()
    // A Google name replaces an untouched default.
    setNameInput(prev => prev ?? (u.displayName ? validateName(u.displayName).name : null))
  }, (e) => {
    console.error('Google sign-in failed:', e)
    toast.error(UPGRADE_ERRORS[e?.code] || `SIGN-IN FAILED${e?.code ? ` (${e.code})` : ''}. PLEASE TRY AGAIN.`)
  })

  const finish = () => runSave(async () => {
    const finalName = check.ok ? check.name : suggestion
    const finalAvatar = selectedAvatar
    // localStorage first — onboarding is committed even if the DB write fails.
    try {
      localStorage.setItem('playerName', finalName)
      localStorage.setItem('playerAvatar', finalAvatar)
    } catch { /* quota */ }
    markOnboarded()
    try {
      await setProfile({ displayName: finalName, avatar: finalAvatar })
    } catch (e) {
      // Offline or rules not deployed: the local copy is enough to play, and
      // ensureProfile() adopts it the next time the profile is created.
      console.warn('Profile save failed (proceeding):', e?.message)
    }
    sounds.win()
    window.scrollTo(0, 0)
    onDone?.({ name: finalName, avatar: finalAvatar })
  }, (e) => {
    console.error('Onboarding finish failed:', e)
    toast.error("COULDN'T SAVE — TRY AGAIN")
  })

  const inviteCfg = invite?.gameType ? getGameConfig(invite.gameType) : null
  const errorId = `${ids}-name-error`
  const hintId = `${ids}-name-hint`

  return (
    <main className="min-h-screen bg-retro-bg flex flex-col items-center px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm flex flex-col">
        <StepDots step={step} />

        {step === 'name' && (
          <section key="name" aria-labelledby={`${ids}-h-name`} className="flex flex-col gap-6 mt-5" style={{ animation: 'place-pop 0.25s ease-out' }}>
            <AuthErrorBanner />
            {invite ? (
              <InviteCard invite={invite} cfg={inviteCfg} />
            ) : (
              <p className="font-pixel text-[9px] text-retro-cta tracking-widest leading-relaxed">
                WELCOME! {gameCount} GAMES · SHARE A LINK · NO ACCOUNT
              </p>
            )}

            <div className="space-y-4">
              <h1
                id={`${ids}-h-name`}
                ref={headingRef}
                tabIndex={-1}
                className="font-pixel text-base text-retro-text leading-relaxed outline-none"
              >
                WHAT SHOULD WE CALL YOU?
              </h1>

              {/* Live preview — the card other players will see */}
              <div className="flex items-center gap-3 bg-retro-card border border-retro-border rounded p-3" aria-hidden="true">
                <Avatar id={selectedAvatar} size={44} />
                <div className="min-w-0">
                  <p className="font-pixel text-[8px] text-retro-dim tracking-widest">YOUR PLAYER CARD</p>
                  <p className="font-pixel text-xs text-retro-text truncate mt-1.5">{check.name || '…'}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`${ids}-name`} className="sr-only">Your name</label>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    id={`${ids}-name`}
                    type="text"
                    value={name}
                    placeholder="Your name"
                    onChange={e => setName(e.target.value)}
                    // Select the suggested name while it's untouched, so typing replaces it.
                    onFocus={e => { if (firstFocus.current || nameInput === null) { firstFocus.current = false; e.target.select() } }}
                    onKeyDown={e => e.key === 'Enter' && next()}
                    maxLength={NAME_MAX + 8}
                    autoComplete="nickname"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    aria-invalid={showError && !check.ok}
                    aria-describedby={showError && !check.ok ? errorId : hintId}
                    className={cn(
                      // Mono body text (16px, so iOS doesn't zoom) reads as a real, editable
                      // value; the pixel caps looked like a placeholder.
                      'min-w-0 flex-1 bg-retro-card border-2 text-retro-text font-mono text-base placeholder:text-retro-dim rounded px-3 py-2.5 focus:outline-none transition-colors',
                      showError && !check.ok ? 'border-retro-p2' : 'border-retro-border focus:border-retro-p1',
                    )}
                  />
                  <button
                    type="button"
                    onClick={rollName}
                    aria-label="Suggest a random name"
                    className="shrink-0 min-w-12 min-h-11 flex items-center justify-center border-2 border-retro-border rounded text-retro-cta hover:border-retro-cta transition-all active:scale-90"
                  >
                    <DieIcon size={20} />
                  </button>
                </div>
                <div className="flex justify-between gap-2 min-h-4">
                  {showError && !check.ok ? (
                    <p id={errorId} role="alert" className="font-pixel text-[9px] text-retro-p2 leading-relaxed">{check.error}</p>
                  ) : (
                    <p id={hintId} className="font-pixel text-[8px] text-retro-dim leading-relaxed">SHOWN TO OTHER PLAYERS</p>
                  )}
                  <span className="font-pixel text-[8px] text-retro-dim shrink-0" aria-hidden="true">{[...check.name].length}/{NAME_MAX}</span>
                </div>
              </div>

              {chips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Name ideas">
                  <span className="font-pixel text-[8px] text-retro-dim tracking-widest">OR TRY</span>
                  {chips.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { sounds.move('O'); setName(c) }}
                      className="min-h-9 px-2.5 rounded border border-retro-border bg-retro-surface font-mono text-xs text-retro-text hover:border-retro-cta transition-all active:scale-95"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={next}
                className="w-full min-h-12 bg-retro-cta text-retro-bg font-pixel text-sm tracking-widest rounded hover:shadow-neon-cta transition-all active:scale-95"
              >
                NEXT: PICK A LOOK →
              </button>
              {showGoogle && (
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleBusy}
                  className="w-full min-h-11 flex items-center justify-center gap-2 font-pixel text-[9px] text-retro-p1 hover:text-glow-p1 transition-all disabled:opacity-50"
                >
                  <GoogleMark /> {googleBusy ? 'SIGNING IN…' : 'HAVE AN ACCOUNT? SIGN IN WITH GOOGLE'}
                </button>
              )}
              {!isAnonymous && user?.email && (
                <p className="font-mono text-[11px] text-retro-dim text-center">Signed in as {user.email}</p>
              )}
            </div>
          </section>
        )}

        {step === 'look' && (
          <section key="look" aria-labelledby={`${ids}-h-look`} className="flex flex-col gap-5 mt-5" style={{ animation: 'place-pop 0.25s ease-out' }}>
            <div className="text-center space-y-2">
              <h1
                id={`${ids}-h-look`}
                ref={headingRef}
                tabIndex={-1}
                className="font-pixel text-base text-retro-text leading-relaxed outline-none"
              >
                PICK YOUR LOOK
              </h1>
              <p className="font-mono text-xs text-retro-dim">Tap a critter, build a person, or shuffle. You can change it any time in Settings.</p>
            </div>

            <AvatarPicker value={selectedAvatar} onChange={setAvatar} name={check.name} previewSize={88} />

            <div className="pt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setStep('name')}
                disabled={saving}
                className="min-h-12 px-4 border-2 border-retro-border text-retro-dim font-pixel text-[10px] rounded hover:text-retro-text transition-all active:scale-95"
              >
                ← BACK
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="flex-1 min-h-12 bg-retro-cta text-retro-bg font-pixel text-sm tracking-widest rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-60"
              >
                {saving ? 'SAVING…' : invite ? 'JOIN GAME' : "LET'S PLAY"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function StepDots({ step }) {
  const n = step === 'name' ? 1 : 2
  return (
    <div className="flex items-center justify-center gap-2" role="img" aria-label={`Step ${n} of 2`}>
      {[1, 2].map(i => (
        <span
          key={i}
          className={cn('h-1.5 rounded-full transition-all', i === n ? 'w-8 bg-retro-cta' : 'w-4 bg-retro-border')}
        />
      ))}
    </div>
  )
}

function InviteCard({ invite, cfg }) {
  const Icon = cfg?.Icon
  const seats = inviteSeatsLine(invite)
  return (
    <div className="bg-retro-card border-2 border-retro-cta/60 rounded p-4 space-y-3 text-center">
      <h2 className="font-pixel text-sm text-retro-cta text-glow-cta tracking-wider">YOU&apos;RE INVITED!</h2>
      {cfg && (
        <div className="flex items-center justify-center gap-2 text-retro-p1">
          {Icon && <span className="w-6 h-6 flex items-center justify-center shrink-0" aria-hidden="true"><Icon /></span>}
          <span className="font-pixel text-xs text-retro-p1 tracking-wider">{cfg.label}</span>
        </div>
      )}
      {invite.hostName && (
        <div className="flex items-center justify-center gap-2">
          <Avatar id={invite.hostAvatar} size={28} />
          <span className="font-mono text-xs text-retro-text truncate"><span className="text-retro-dim">HOSTED BY </span>{invite.hostName}</span>
        </div>
      )}
      {seats && <p className="font-pixel text-[9px] text-retro-dim tracking-wider leading-relaxed">{seats}</p>}
      <p className="font-mono text-[11px] text-retro-dim">
        ROOM <span className="text-retro-p1 tracking-widest">{invite.gameId}</span>
      </p>
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
