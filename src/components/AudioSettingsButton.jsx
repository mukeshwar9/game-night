import { useState } from 'react'
import BottomSheet from './BottomSheet'
import { sounds } from '../lib/sounds'

export default function AudioSettingsButton({ className = '' }) {
  const [open, setOpen] = useState(false)
  const [reactionMuted, setReactionMuted] = useState(() => sounds.isReactionMuted())
  const [volume, setVolume] = useState(() => sounds.getVolume())

  const toggleReactionMute = () => setReactionMuted(sounds.toggleReactionMute())
  const changeVolume = (event) => setVolume(sounds.setVolume(event.target.value))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Audio settings"
        aria-label="Audio settings"
        className={`text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 rounded ${className}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" />
          <circle cx="9" cy="6" r="2" fill="rgb(var(--c-bg))" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <circle cx="15" cy="12" r="2" fill="rgb(var(--c-bg))" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="11" cy="18" r="2" fill="rgb(var(--c-bg))" />
        </svg>
      </button>
      {open && (
        <BottomSheet onClose={() => setOpen(false)} ariaLabel="Audio settings">
          <div className="flex items-center justify-between">
            <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">AUDIO SETTINGS</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close audio settings"
              className="font-pixel text-[10px] text-retro-dim hover:text-retro-text p-2 -m-2"
            >
              CLOSE
            </button>
          </div>
          <div className="space-y-4 pt-4">
            <label className="flex items-center justify-between gap-3 font-pixel text-[9px] text-retro-text tracking-widest">
              <span>REACTION SOUNDS</span>
              <input
                type="checkbox"
                checked={!reactionMuted}
                onChange={toggleReactionMute}
                aria-label="Enable reaction sounds"
                className="h-5 w-5 accent-retro-cta"
              />
            </label>
            <label className="block font-pixel text-[9px] text-retro-text tracking-widest">
              <span className="flex justify-between mb-2">
                <span>SFX VOLUME</span>
                <span className="text-retro-dim">{Math.round(volume * 100)}%</span>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={changeVolume}
                aria-label="SFX volume"
                className="w-full accent-retro-cta"
              />
            </label>
            <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
              Emoji sounds stay short and quiet. Browser audio starts after your first interaction.
            </p>
          </div>
        </BottomSheet>
      )}
    </>
  )
}
