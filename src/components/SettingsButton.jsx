import { useState } from 'react'
import { Link } from 'react-router-dom'
import BottomSheet from './BottomSheet'
import { VideoCallSettingsPanel } from './VideoCallLayout'
import { FONTS, applyFont, getStoredFont } from '../lib/font'
import { THEMES, applyTheme, getStoredTheme } from '../lib/theme'
import {
  TEXT_SIZES, applyCrt, applyMotion, applyTextSize, applyWinFx,
  getStoredCrt, getStoredMotion, getStoredTextSize, getWinFx, resetDisplayPrefs,
} from '../lib/displayPrefs'
import { setProfile } from '../lib/social'
import { sounds } from '../lib/sounds'

function ThemeSwatches({ id }) {
  return <span data-theme={id} className="inline-flex items-center gap-[3px] shrink-0" aria-hidden="true">
    <span style={{ width: 6, height: 6, background: 'rgb(var(--c-p1))', borderRadius: 1 }} />
    <span style={{ width: 6, height: 6, background: 'rgb(var(--c-p2))', borderRadius: 1 }} />
    <span style={{ width: 6, height: 6, background: 'rgb(var(--c-cta))', borderRadius: 1 }} />
  </span>
}

function SectionTitle({ children }) {
  return <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">{children}</p>
}

export default function SettingsButton({ className = '' }) {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(getStoredTheme)
  const [font, setFont] = useState(getStoredFont)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const [reactionMuted, setReactionMuted] = useState(() => sounds.isReactionMuted())
  const [volume, setVolume] = useState(() => sounds.getVolume())
  const [crt, setCrt] = useState(getStoredCrt)
  const [motion, setMotion] = useState(getStoredMotion)
  const [textSize, setTextSize] = useState(getStoredTextSize)
  const [winFx, setWinFx] = useState(getWinFx)
  const [resetArmed, setResetArmed] = useState(false)

  const selectTheme = (id) => {
    applyTheme(id)
    setTheme(id)
    setProfile({ theme: id }).catch(() => {})
  }

  const selectFont = (id) => {
    applyFont(id)
    setFont(id)
    setProfile({ fontFamily: id }).catch(() => {})
  }

  const toggleMute = () => setMuted(sounds.toggle())
  const toggleReactionMute = () => setReactionMuted(sounds.toggleReactionMute())
  const changeVolume = (event) => setVolume(sounds.setVolume(event.target.value))

  const selectCrt = (on) => { applyCrt(on); setCrt(on) }
  const selectMotion = (mode) => { applyMotion(mode); setMotion(mode === 'reduced' ? 'reduced' : 'full') }
  const selectTextSize = (id) => setTextSize(applyTextSize(id))
  const selectWinFx = (on) => { applyWinFx(on); setWinFx(on) }

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
    resetDisplayPrefs()
    setTheme('matcha')
    setFont('press-start')
    setMuted(false)
    setReactionMuted(false)
    setVolume(1)
    setCrt(true)
    setMotion(getStoredMotion())
    setTextSize('m')
    setWinFx(true)
    setProfile({ theme: 'matcha', fontFamily: 'press-start' }).catch(() => {})
  }

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      title="Settings"
      aria-label="Settings"
      className={`relative text-retro-dim hover:text-retro-text active:scale-95 transition-colors p-2 rounded ${className}`}
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

    {open && <BottomSheet onClose={() => setOpen(false)} ariaLabel="Settings" className="bg-retro-card space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle>SETTINGS</SectionTitle>
        <button type="button" onClick={() => setOpen(false)} className="font-pixel text-[10px] text-retro-dim hover:text-retro-text p-2 -m-2">CLOSE</button>
      </div>

      <section className="space-y-2">
        <SectionTitle>THEME</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map(option => <button
            key={option.id}
            type="button"
            onClick={() => selectTheme(option.id)}
            className={`flex min-h-10 items-center gap-2 rounded border px-2 text-left font-pixel text-[8px] transition-colors ${theme === option.id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:text-retro-text'}`}
          >
            <ThemeSwatches id={option.id} />
            <span className="truncate">{option.label}</span>
          </button>)}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>FONT FAMILY</SectionTitle>
          <span className="font-mono text-[10px] text-retro-dim">{FONTS.find(option => option.id === font)?.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {FONTS.map(option => <button
            key={option.id}
            type="button"
            onClick={() => selectFont(option.id)}
            className={`min-h-14 rounded border px-2 py-2 text-left transition-colors ${font === option.id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:text-retro-text'}`}
          >
            <span className="block truncate text-[11px]" style={{ fontFamily: `'${option.family}'` }}>{option.label}</span>
            <span className="mt-1 block truncate font-mono text-[9px] opacity-70">{option.description}</span>
          </button>)}
        </div>
      </section>

      <section className="space-y-3 border-t border-retro-border pt-4">
        <SectionTitle>LOOK & FEEL</SectionTitle>
        <label className="flex items-center justify-between gap-3 font-pixel text-[9px] text-retro-text tracking-widest">
          <span>CRT EFFECTS</span>
          <input type="checkbox" checked={crt} onChange={e => selectCrt(e.target.checked)} aria-label="Toggle CRT scanlines and vignette" className="h-5 w-5 accent-retro-cta" />
        </label>
        <label className="flex items-center justify-between gap-3 font-pixel text-[9px] text-retro-text tracking-widest">
          <span>REDUCE MOTION</span>
          <input type="checkbox" checked={motion === 'reduced'} onChange={e => selectMotion(e.target.checked ? 'reduced' : 'full')} aria-label="Toggle reduced motion" className="h-5 w-5 accent-retro-cta" />
        </label>
        <label className="flex items-center justify-between gap-3 font-pixel text-[9px] text-retro-text tracking-widest">
          <span>WIN CELEBRATIONS</span>
          <input type="checkbox" checked={winFx} onChange={e => selectWinFx(e.target.checked)} aria-label="Toggle win confetti and fanfare" className="h-5 w-5 accent-retro-cta" />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="font-pixel text-[9px] text-retro-text tracking-widest">TEXT SIZE</span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Text size">
            {TEXT_SIZES.map(option => <button
              key={option.id}
              type="button"
              onClick={() => selectTextSize(option.id)}
              aria-pressed={textSize === option.id}
              className={`min-h-10 min-w-12 rounded border px-2 font-pixel text-[9px] transition-colors ${textSize === option.id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:text-retro-text'}`}
            >
              {option.label}
            </button>)}
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-retro-border pt-4">
        <SectionTitle>AUDIO</SectionTitle>
        <label className="flex items-center justify-between gap-3 font-pixel text-[9px] text-retro-text tracking-widest">
          <span>GAME SOUNDS</span>
          <input type="checkbox" checked={!muted} onChange={toggleMute} aria-label="Enable game sounds" className="h-5 w-5 accent-retro-cta" />
        </label>
        <label className="flex items-center justify-between gap-3 font-pixel text-[9px] text-retro-text tracking-widest">
          <span>REACTION SOUNDS</span>
          <input type="checkbox" checked={!reactionMuted} onChange={toggleReactionMute} aria-label="Enable reaction sounds" className="h-5 w-5 accent-retro-cta" />
        </label>
        <label className="block font-pixel text-[9px] text-retro-text tracking-widest">
          <span className="mb-2 flex justify-between"><span>SFX VOLUME</span><span className="text-retro-dim">{Math.round(volume * 100)}%</span></span>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={changeVolume} aria-label="SFX volume" className="w-full accent-retro-cta" />
        </label>
      </section>

      <section className="space-y-3 border-t border-retro-border pt-4">
        <SectionTitle>VIDEO LAYOUT</SectionTitle>
        <VideoCallSettingsPanel embedded />
      </section>

      <section className="space-y-3 border-t border-retro-border pt-4">
        <SectionTitle>HELP</SectionTitle>
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
          <span>MUTED PLAYERS</span>
          <span className="text-retro-dim" aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="border-t border-retro-border pt-4">
        <button
          type="button"
          onClick={resetAll}
          className={`min-h-11 w-full rounded border-2 px-3 font-pixel text-[9px] tracking-widest transition-colors active:scale-95 ${resetArmed ? 'border-retro-danger bg-retro-tint-danger text-retro-danger' : 'border-retro-border text-retro-dim hover:text-retro-danger hover:border-retro-danger/60'}`}
        >
          {resetArmed ? 'SURE? TAP AGAIN TO RESET' : 'RESET ALL TO DEFAULTS'}
        </button>
      </section>
    </BottomSheet>}
  </>
}
