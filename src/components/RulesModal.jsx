import { getGameConfig } from '../lib/games'
import { getRules } from '../lib/rules'
import BottomSheet from './BottomSheet'

// A small "?" icon button — the trigger that opens the rules modal. Styled to
// match the header icon buttons (mute / ThemeSwitcher) in Game.jsx. p-3.5/-m-2.5
// clears a genuine 44px hit area around the 16px glyph (M-83) while keeping the
// same 4px visual gutter the p-3/-m-2 version had.
export function RulesButton({ onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      title="How to play"
      aria-label="How to play"
      className={`text-retro-dim hover:text-retro-text transition-colors p-3.5 -m-2.5 rounded ${className}`}
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
// visibility. Runs on the shared BottomSheet primitive (M-73) — bottom sheet
// on phones, centered dialog from sm: up; backdrop-tap/Escape/stopPropagation
// come from there. Pulls the title from the registry `label` and the body
// from src/lib/rules.js.
export default function RulesModal({ gameType, onClose }) {
  const cfg = getGameConfig(gameType)
  const rules = getRules(gameType)
  const title = cfg?.label || 'HOW TO PLAY'

  return (
    <BottomSheet onClose={onClose} ariaLabel={`${title} rules`} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">{title}</p>
        <button
          onClick={onClose}
          aria-label="Close"
          className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors p-3 -m-2"
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
    </BottomSheet>
  )
}
