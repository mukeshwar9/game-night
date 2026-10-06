import { Suspense, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import BottomSheet from './BottomSheet'
import PixelDots from './loading/PixelDots'
import SwitchRow from './SwitchRow'
import ThemePreview from './ThemePreview'
import { VideoCallSettingsPanel } from './VideoCallLayout'
import { FONTS, applyFont, getStoredFont } from '../lib/font'
import { THEMES, applyTheme, getStoredTheme, pairedFont } from '../lib/theme'
import {
  applyCrt, applyMotion, applyTextSize, applyThemePreview, applyWinFx, defaultTextSize, textSizeOptions,
  getStoredCrt, getStoredMotion, getStoredTextSize, getThemePreview, getWinFx, resetDisplayPrefs,
} from '../lib/displayPrefs'
import { ART_STYLES, DEFAULT_ART_STYLE, applyGameArtStyle, getGameArtStyle } from '../lib/gameArtStyle'
import { setProfile } from '../lib/social'
import { useAuth } from '../lib/AuthContext'
import { defaultAvatarForId } from '../lib/avatarKit'
import { getPlayerId } from '../lib/playerId'
import { sounds } from '../lib/sounds'
import { blockLabel } from '../lib/musicLogic'
import { getHapticsOn, hapticsAvailable, setHapticsOn } from '../lib/haptics'
import { resetMusicDefaults, setMusicOn, setMusicVolume, syncMusic, useMusic } from '../lib/music'
import { lazyWithRetry } from '../lib/lazyWithRetry'
import LegalLinks from './LegalLinks'
import LockBadge from './premium/LockBadge'
import useAccess from '../hooks/useAccess'
import { openPaywall } from '../lib/premiumUi'
import { openAvatarStudio, openPetPicker } from '../lib/avatarStudioUi'
import { canPreviewMonetization } from '../lib/monetizationState'
import { AdminToolsPanel } from './premium/ViewAsPlayer'

function ThemeSwatches({ id }) {
  return <span data-theme={id} className="inline-flex items-center gap-[3px] shrink-0" aria-hidden="true">
    <span style={{ width: 6, height: 6, background: 'rgb(var(--c-p1))', borderRadius: 1 }} />
    <span style={{ width: 6, height: 6, background: 'rgb(var(--c-p2))', borderRadius: 1 }} />
    <span style={{ width: 6, height: 6, background: 'rgb(var(--c-cta))', borderRadius: 1 }} />
  </span>
}

// The name/avatar editor carries the whole avatar picker — load it on demand.
const IdentityEditor = lazyWithRetry(() => import('./IdentityEditor'))

function SectionTitle({ children }) {
  return <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">{children}</p>
}

// A collapsible group of the settings sheet. Native <details> keeps it
// keyboard- and screen-reader-operable with no state; the sheet is long, so
// only THEME & FONT start open.
function Section({ title, defaultOpen = false, children }) {
  return (
    <details open={defaultOpen} className="group border-t border-retro-border pt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <SectionTitle>{title}</SectionTitle>
        <span aria-hidden="true" className="font-pixel text-[10px] text-retro-dim transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-3 pt-2 pb-2">{children}</div>
    </details>
  )
}

export default function SettingsButton({ className = '' }) {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(getStoredTheme)
  const [font, setFont] = useState(getStoredFont)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const [reactionMuted, setReactionMuted] = useState(() => sounds.isReactionMuted())
  const [volume, setVolume] = useState(() => sounds.getVolume())
  const music = useMusic()
  const musicNote = music.status === 'blocked' ? `PAUSED: ${blockLabel(music.blocked)}`
    : music.status === 'failed' ? 'COULD NOT LOAD MUSIC. TAP THE NOTE TO RETRY'
    : null
  const [crt, setCrt] = useState(getStoredCrt)
  const [motion, setMotion] = useState(getStoredMotion)
  const [textSize, setTextSize] = useState(getStoredTextSize)
  const [artStyle, setArtStyle] = useState(getGameArtStyle)
  const [winFx, setWinFx] = useState(getWinFx)
  const [haptics, setHaptics] = useState(getHapticsOn)
  const [resetArmed, setResetArmed] = useState(false)
  const [editingMe, setEditingMe] = useState(false)
  const { profile } = useAuth()
  const myName = profile?.displayName || localStorage.getItem('playerName') || ''
  const myAvatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  const [showPreview, setShowPreview] = useState(getThemePreview)
  const themeListRef = useRef(null)
  // Hover/focus preview: null means "show the committed choice". Only mouse
  // hover and keyboard focus set it — on touch a tap commits straight away.
  const [hoverTheme, setHoverTheme] = useState(null)
  const [hoverFont, setHoverFont] = useState(null)
  const previewTheme = hoverTheme ?? theme
  const previewFont = hoverFont ?? font
  const peek = (setter, id) => ({
    onPointerEnter: e => { if (e.pointerType === 'mouse') setter(id) },
    onFocus: e => { if (e.currentTarget.matches(':focus-visible')) setter(id) },
  })
  const clearPeek = setter => ({
    onPointerLeave: () => setter(null),
    onBlur: e => { if (!e.currentTarget.contains(e.relatedTarget)) setter(null) },
  })

  // Scroll the committed theme into view when its choices are revealed.
  const revealThemes = (event) => {
    if (!event.currentTarget.open) { setHoverTheme(null); return }
    const list = themeListRef.current
    const selected = list?.querySelector('[aria-pressed="true"]')
    if (list && selected) list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2
  }

  // A premium theme or font that is not unlocked opens the paywall instead.
  // The paywall is a sheet too, and sheets never nest, so settings closes first.
  const access = useAccess()
  const adminTools = access.canViewAsPlayer || canPreviewMonetization()
  const locked = (kind, option) => option.premium === true && !access.isUnlocked({ kind, ...option })
  const askToUnlock = (kind, option) => { setOpen(false); openPaywall({ kind, ...option }) }

  const selectTheme = (id) => {
    const option = THEMES.find(t => t.id === id)
    if (option && locked('theme', option)) { askToUnlock('theme', option); return }
    applyTheme(id)
    setTheme(id)
    syncMusic()
    // A theme with a matching font brings it along; the font stays changeable.
    const font = pairedFont(id)
    if (font) { applyFont(font); setFont(font) }
    setProfile(font ? { theme: id, fontFamily: font } : { theme: id }).catch(() => {})
  }

  const selectFont = (id) => {
    const option = FONTS.find(f => f.id === id)
    if (option && locked('font', option)) { askToUnlock('font', option); return }
    applyFont(id)
    setFont(id)
    setProfile({ fontFamily: id }).catch(() => {})
  }

  const toggleMute = () => { setMuted(sounds.toggle()); syncMusic() }
  const toggleReactionMute = () => setReactionMuted(sounds.toggleReactionMute())
  const changeVolume = (event) => setVolume(sounds.setVolume(event.target.value))

  const selectCrt = (on) => { applyCrt(on); setCrt(on) }
  const selectMotion = (mode) => { applyMotion(mode); setMotion(mode === 'reduced' ? 'reduced' : 'full') }
  const selectTextSize = (id) => setTextSize(applyTextSize(id))
  const selectArtStyle = (id) => setArtStyle(applyGameArtStyle(id))
  const selectWinFx = (on) => { applyWinFx(on); setWinFx(on) }
  const selectHaptics = (on) => { setHapticsOn(on); setHaptics(on) }
  const selectShowPreview = (on) => { applyThemePreview(on); setShowPreview(on) }

  const resetAll = () => {
    if (!resetArmed) {
      setResetArmed(true)
      setTimeout(() => setResetArmed(false), 3000)
      return
    }
    setResetArmed(false)
    applyTheme('matcha')
    applyFont('press-start')
    sounds.resetAudioDefaults()
    resetMusicDefaults()
    resetDisplayPrefs()
    setTheme('matcha')
    setFont('press-start')
    setMuted(false)
    setReactionMuted(false)
    setVolume(1)
    setCrt(true)
    setMotion(getStoredMotion())
    setTextSize(defaultTextSize())
    setArtStyle(DEFAULT_ART_STYLE)
    applyGameArtStyle(DEFAULT_ART_STYLE)
    setWinFx(true)
    selectHaptics(true)
    setShowPreview(false)
    setProfile({ theme: 'matcha', fontFamily: 'press-start' }).catch(() => {})
  }

  return <>
    <button
      type="button"
      onClick={() => { setEditingMe(false); setOpen(true) }}
      title="Settings"
      aria-label="Settings"
      className={`relative text-retro-dim hover:text-retro-text active:scale-95 transition-colors p-3.5 rounded ${className}`}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <line x1="4" y1="6" x2="20" y2="6" />
        <circle cx="9" cy="6" r="2" fill="rgb(var(--c-bg))" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <circle cx="15" cy="12" r="2" fill="rgb(var(--c-bg))" />
        <line x1="4" y1="18" x2="20" y2="18" />
        <circle cx="11" cy="18" r="2" fill="rgb(var(--c-bg))" />
      </svg>
    </button>

    {open && <BottomSheet onClose={() => setOpen(false)} ariaLabel="Settings" className={`bg-retro-card space-y-5 ${showPreview ? 'md:max-w-3xl' : ''}`}>
      <div className="flex items-center justify-between">
        <SectionTitle>SETTINGS</SectionTitle>
        <button type="button" onClick={() => setOpen(false)} className="font-pixel text-[10px] text-retro-dim hover:text-retro-text p-2 -m-2">CLOSE</button>
      </div>

      <section className="space-y-2" aria-label="Your name and avatar">
        {editingMe ? (
          <Suspense fallback={<div className="py-8 flex justify-center"><PixelDots /></div>}>
            <IdentityEditor
              name={myName}
              avatar={myAvatar}
              onDone={() => setEditingMe(false)}
              onEditLook={() => { setOpen(false); openAvatarStudio() }}
              onEditPet={() => { setOpen(false); openPetPicker() }}
            />
          </Suspense>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar id={myAvatar} size={40} />
            <p className="min-w-0 flex-1 font-pixel text-xs text-retro-text truncate">{myName || 'NO NAME YET'}</p>
            <button
              type="button"
              onClick={() => setEditingMe(true)}
              className="shrink-0 min-h-11 px-3 border border-retro-border rounded font-pixel text-[9px] text-retro-cta hover:border-retro-cta transition active:scale-95"
            >
              EDIT NAME &amp; LOOK
            </button>
          </div>
        )}
      </section>

      <Section title="THEME & FONT" defaultOpen>
        <div className={showPreview ? 'space-y-3 md:grid md:grid-cols-[240px_1fr] md:gap-5 md:space-y-0' : ''}>
          {showPreview && <div>
            <div className="md:sticky md:top-0">
              <ThemePreview
                theme={previewTheme}
                font={previewFont}
                caption={hoverTheme || hoverFont ? 'PREVIEW' : 'CURRENT'}
              />
              <p className="mt-1 font-mono text-[10px] text-retro-dim truncate">
                {THEMES.find(option => option.id === previewTheme)?.label} · {FONTS.find(option => option.id === previewFont)?.label}
              </p>
            </div>
          </div>}
          <div className="space-y-2">
            <details className="group/theme" onToggle={revealThemes}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="font-pixel text-[9px] text-retro-text">THEME</span>
                <span className="flex min-w-0 items-center gap-2">
                  <ThemeSwatches id={theme} />
                  <span className="font-mono text-xs text-retro-dim truncate">{THEMES.find(option => option.id === theme)?.label}</span>
                  <span aria-hidden="true" className="text-retro-dim transition-transform group-open/theme:rotate-90">›</span>
                </span>
              </summary>
              <div
                ref={themeListRef}
                className="relative grid max-h-52 grid-cols-2 gap-2 overflow-y-auto overscroll-contain rounded border border-retro-border p-2 md:max-h-72"
                {...clearPeek(setHoverTheme)}
              >
                {THEMES.map(option => <button
                  key={option.id}
                  type="button"
                  aria-pressed={theme === option.id}
                  onClick={() => selectTheme(option.id)}
                  {...peek(setHoverTheme, option.id)}
                  className={`flex min-h-11 items-center gap-2 rounded border px-2 py-1.5 text-left font-pixel text-[9px] transition-colors ${theme === option.id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:text-retro-text'}`}
                >
                  <ThemeSwatches id={option.id} />
                  <span className="leading-snug">{option.label}</span>
                  {locked('theme', option) && <><LockBadge className="ml-auto" /><span className="sr-only">locked</span></>}
                </button>)}
              </div>
            </details>

            <details className="group/font" onToggle={event => { if (!event.currentTarget.open) setHoverFont(null) }}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="font-pixel text-[9px] text-retro-text">FONT FAMILY</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-xs text-retro-dim truncate">{FONTS.find(option => option.id === font)?.label}</span>
                  <span aria-hidden="true" className="text-retro-dim transition-transform group-open/font:rotate-90">›</span>
                </span>
              </summary>
              <div className="grid grid-cols-2 gap-2" {...clearPeek(setHoverFont)}>
                {FONTS.map(option => <button
                  key={option.id}
                  type="button"
                  aria-pressed={font === option.id}
                  onClick={() => selectFont(option.id)}
                  {...peek(setHoverFont, option.id)}
                  className={`min-h-14 rounded border px-2 py-2 text-left transition-colors ${font === option.id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:text-retro-text'}`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="block truncate text-[11px]" style={{ fontFamily: `'${option.family}'` }}>{option.label}</span>
                    {locked('font', option) && <><LockBadge /><span className="sr-only">locked</span></>}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[9px] opacity-70">{option.description}</span>
                </button>)}
              </div>
            </details>
            <SwitchRow label="SHOW PREVIEW" checked={showPreview} onChange={selectShowPreview} ariaLabel="Show theme preview" />
          </div>
        </div>
      </Section>

      <Section title="LOOK & FEEL">
        <SwitchRow label="CRT EFFECTS" checked={crt} onChange={selectCrt} ariaLabel="Toggle CRT scanlines and vignette" />
        <SwitchRow label="REDUCE MOTION" checked={motion === 'reduced'} onChange={on => selectMotion(on ? 'reduced' : 'full')} ariaLabel="Toggle reduced motion" />
        <SwitchRow label="WIN CELEBRATIONS" checked={winFx} onChange={selectWinFx} ariaLabel="Toggle win confetti and fanfare" />
        <div className="flex items-center justify-between gap-3">
          <span className="font-pixel text-[9px] text-retro-text tracking-widest">GAME ART</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Game art style">
            {ART_STYLES.map(option => <button
              key={option.id}
              type="button"
              onClick={() => selectArtStyle(option.id)}
              aria-pressed={artStyle === option.id}
              className={`min-h-10 min-w-16 rounded border px-2 font-pixel text-[9px] transition-colors ${artStyle === option.id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:text-retro-text'}`}
            >
              {option.label}
            </button>)}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-pixel text-[9px] text-retro-text tracking-widest">TEXT SIZE</span>
          <div className="flex gap-1.5" role="group" aria-label="Text size">
            {textSizeOptions().map(option => <button
              key={option.id}
              type="button"
              onClick={() => selectTextSize(option.id)}
              aria-pressed={textSize === option.id}
              className={`min-h-10 min-w-10 rounded border px-1.5 font-pixel text-[9px] transition-colors ${textSize === option.id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:text-retro-text'}`}
            >
              {option.label}
            </button>)}
          </div>
        </div>
      </Section>

      <Section title="AUDIO">
        <SwitchRow label="MUSIC" checked={music.on} onChange={setMusicOn} ariaLabel="Enable background music" />
        {musicNote && <p role="status" className="font-pixel text-[8px] text-retro-dim tracking-widest">{musicNote}</p>}
        <label className="block font-pixel text-[9px] text-retro-text tracking-widest">
          <span className="mb-2 flex justify-between"><span>MUSIC VOLUME</span><span className="text-retro-dim">{Math.round(music.volume * 100)}%</span></span>
          <input type="range" min="0" max="1" step="0.05" value={music.volume} onChange={e => setMusicVolume(e.target.value)} aria-label="Music volume" className="w-full accent-retro-cta" />
        </label>
        <SwitchRow label="GAME SOUNDS" checked={!muted} onChange={toggleMute} ariaLabel="Enable game sounds" />
        <SwitchRow label="REACTION SOUNDS" checked={!reactionMuted} onChange={toggleReactionMute} ariaLabel="Enable reaction sounds" />
        {hapticsAvailable() && (
          <SwitchRow label="HAPTICS" checked={haptics} onChange={selectHaptics} ariaLabel="Enable vibration and haptic feedback" />
        )}
        <label className="block font-pixel text-[9px] text-retro-text tracking-widest">
          <span className="mb-2 flex justify-between"><span>SFX VOLUME</span><span className="text-retro-dim">{Math.round(volume * 100)}%</span></span>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={changeVolume} aria-label="SFX volume" className="w-full accent-retro-cta" />
        </label>
      </Section>

      {/* Video layout is niche (a floating WhatsApp/Meet window over the game),
          so it hides behind a plain-language question. */}
      <Section title="PLAYING ON A VIDEO CALL?">
        <VideoCallSettingsPanel embedded />
      </Section>

      {adminTools && (
        <Section title="ADMIN TOOLS">
          <AdminToolsPanel />
        </Section>
      )}

      <Section title="HELP & RESET">
        {access.shop && <Link
          to="/shop"
          onClick={() => setOpen(false)}
          className="flex min-h-11 items-center justify-between rounded border border-retro-cta/50 px-3 font-pixel text-[9px] tracking-widest text-retro-cta hover:border-retro-cta transition-colors"
        >
          <span>SHOP &amp; PASS</span>
          <span className="text-retro-dim" aria-hidden="true">→</span>
        </Link>}
        <Link
          to="/notes"
          onClick={() => setOpen(false)}
          className="flex min-h-11 items-center justify-between rounded border border-retro-border px-3 font-pixel text-[9px] tracking-widest text-retro-text hover:border-retro-p1 transition-colors"
        >
          <span>SEND FEEDBACK</span>
          <span className="text-retro-dim" aria-hidden="true">→</span>
        </Link>
        <Link
          to="/profile"
          onClick={() => setOpen(false)}
          className="flex min-h-11 items-center justify-between rounded border border-retro-border px-3 font-pixel text-[9px] tracking-widest text-retro-text hover:border-retro-p1 transition-colors"
        >
          <span>BLOCKED PLAYERS</span>
          <span className="text-retro-dim" aria-hidden="true">→</span>
        </Link>
        <button
          type="button"
          onClick={resetAll}
          className={`min-h-11 w-full rounded border-2 px-3 font-pixel text-[9px] tracking-widest transition-colors active:scale-95 ${resetArmed ? 'border-retro-danger bg-retro-tint-danger text-retro-danger' : 'border-retro-border text-retro-dim hover:text-retro-danger hover:border-retro-danger/60'}`}
        >
          {resetArmed ? 'SURE? TAP AGAIN TO RESET' : 'RESET ALL TO DEFAULTS'}
        </button>
      </Section>
      <Section title="ABOUT & LEGAL">
        <LegalLinks contact className="text-left" />
        <p className="font-mono text-[11px] leading-relaxed text-retro-dim">Delete your data any time from Profile.</p>
      </Section>
    </BottomSheet>}
  </>
}
