import { toggleMusic, useMusic } from '../lib/music'
import { blockLabel } from '../lib/musicLogic'

// One-tap background-music switch, sitting beside the settings gear in every
// header. Volume lives in Settings → AUDIO. A dot on the note means music is
// armed but silent (waiting for the first tap, or a tap to bring it back after
// a lock or call); a struck-through look means a blocker or a failed load is
// holding it back, so ON never lies about silence.
export default function MusicToggle({ className = '' }) {
  const { on, status, blocked } = useMusic()
  const held = status === 'blocked' || status === 'failed'
  const title = status === 'blocked' ? `Music paused: ${blockLabel(blocked).toLowerCase()}`
    : status === 'failed' ? 'Music could not load. Tap to retry'
    : status === 'needs-tap' ? 'Music is ready. Tap anywhere to hear it'
    : on ? 'Music on' : 'Music off'
  return (
    <button
      type="button"
      onClick={toggleMusic}
      aria-pressed={on}
      title={title}
      aria-label="Background music"
      className={`relative p-3.5 rounded press transition-colors ${on && !held ? 'text-retro-cta hover:opacity-80' : 'text-retro-dim hover:text-retro-text'} ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="currentColor" d="M5 2h9v8.5a2.5 2.5 0 1 1-1.5-2.3V5H6.5v7.5A2.5 2.5 0 1 1 5 10.2V2z" />
        {(!on || held) && <line x1="2" y1="14.5" x2="14.5" y2="1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      </svg>
      {status === 'needs-tap' && <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-retro-cta motion-safe:animate-pulse" />}
    </button>
  )
}
