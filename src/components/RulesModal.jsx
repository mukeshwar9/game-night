import { useEffect } from 'react'
import { getGameConfig } from '../lib/games'
import { getRules } from '../lib/rules'

// A small "?" icon button — the trigger that opens the rules modal. Styled to
// match the header icon buttons (mute / ThemeSwitcher) in Game.jsx.
export function RulesButton({ onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      title="How to play"
      aria-label="How to play"
      className={`text-retro-dim hover:text-retro-text transition-colors p-1 rounded ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </button>
  )
}

// A reusable rules/tutorial modal. Render conditionally — the parent owns
// visibility. Mirrors the overlay pattern in GameSwitcher (fixed overlay,
// click-outside + ✕ to close, stopPropagation on the panel). Pulls the title
// from the registry `label` and the body from src/lib/rules.js.
export default function RulesModal({ gameType, onClose }) {
  const cfg = getGameConfig(gameType)
  const rules = getRules(gameType)
  const title = cfg?.label || 'HOW TO PLAY'

  // Close on Escape for keyboard/accessibility.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} rules`}
        className="w-full max-w-sm max-h-[80vh] overflow-y-auto bg-retro-bg border-2 border-retro-border rounded p-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">{title}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors px-1"
          >
            ✕
          </button>
        </div>

        {rules ? (
          <div className="space-y-4">
            <section className="space-y-1.5">
              <p className="font-pixel text-[9px] text-retro-p1 tracking-widest">OBJECTIVE</p>
              <p className="font-mono text-[11px] leading-relaxed text-retro-text">{rules.objective}</p>
            </section>

            <section className="space-y-1.5">
              <p className="font-pixel text-[9px] text-retro-dim tracking-widest">HOW TO PLAY</p>
              <ul className="space-y-1.5">
                {rules.howToPlay.map((step, i) => (
                  <li key={i} className="font-mono text-[11px] leading-relaxed text-retro-text flex gap-2">
                    <span className="text-retro-p1" aria-hidden="true">›</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-1.5">
              <p className="font-pixel text-[9px] text-retro-win tracking-widest">TO WIN</p>
              <p className="font-mono text-[11px] leading-relaxed text-retro-text">{rules.win}</p>
            </section>
          </div>
        ) : (
          <p className="font-mono text-[11px] leading-relaxed text-retro-dim">Rules coming soon.</p>
        )}

        <button
          onClick={onClose}
          className="w-full px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
        >
          GOT IT
        </button>
      </div>
    </div>
  )
}
