import { toggleMusic, useMusic } from '../lib/music'

// One-tap background-music switch, sitting beside the settings gear in every
// header. Volume lives in Settings → AUDIO.
export default function MusicToggle({ className = '' }) {
  const { on } = useMusic()
  return (
    <button
      type="button"
      onClick={toggleMusic}
      aria-pressed={on}
      title={on ? 'Music on' : 'Music off'}
      aria-label="Background music"
      className={`relative p-3.5 rounded active:scale-95 transition-colors ${on ? 'text-retro-cta hover:opacity-80' : 'text-retro-dim hover:text-retro-text'} ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="currentColor" d="M5 2h9v8.5a2.5 2.5 0 1 1-1.5-2.3V5H6.5v7.5A2.5 2.5 0 1 1 5 10.2V2z" />
        {!on && <line x1="2" y1="14.5" x2="14.5" y2="1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      </svg>
    </button>
  )
}
