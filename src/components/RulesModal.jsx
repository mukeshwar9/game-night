import { Suspense } from 'react'
import { getGameConfig } from '../lib/games'
import { getRules } from '../lib/rules'
import RuleClip, { hasRuleClip } from './RuleClips'
import BottomSheet from './BottomSheet'
import RuleMedia from './RuleMedia'
import { getRuleMedia } from '../lib/ruleMediaLogic'
import { quickStart } from '../lib/rulesQuickStart'

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
// from src/lib/rules.js. A registry entry may add `RulesExtra` (a lazy
// component) for game-specific content, shown after QUICK START.
export default function RulesModal({ gameType, onClose }) {
  const cfg = getGameConfig(gameType)
  const rules = getRules(gameType)
  const title = cfg?.label || 'HOW TO PLAY'
  const quick = rules ? quickStart(rules) : null
  const Icon = cfg?.Icon
  const hasVisual = !!rules && !!(getRuleMedia(gameType) || hasRuleClip(gameType))
  const Extra = cfg?.RulesExtra

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
          {/* Step carousel for games with captured stills; otherwise the looping
              silent demo (RuleClip returns null for games without a clip). */}
          {getRuleMedia(gameType)
            ? <RuleMedia gameType={gameType} rules={rules} />
            : <RuleClip type={gameType} className="w-full aspect-square rounded-xl border border-retro-border block bg-retro-card" />}

          {/* Games with no still or clip yet get their icon, so the sheet is not
              all text. */}
          {!hasVisual && Icon && (
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-retro-border bg-retro-card [&_svg]:h-10 [&_svg]:w-10" aria-hidden="true">
              <Icon />
            </div>
          )}

          <section className="space-y-1.5">
            <p className="font-pixel text-[9px] text-retro-p1 tracking-widest">OBJECTIVE</p>
            <p className="font-mono text-[11px] leading-relaxed text-retro-text">{rules.objective}</p>
          </section>

          {quick.long && (
            <section className="space-y-1.5">
              <p className="font-pixel text-[9px] text-retro-cta tracking-widest">QUICK START</p>
              <ul className="space-y-1.5">
                {quick.bullets.map((step, i) => (
                  <li key={i} className="font-mono text-[11px] leading-relaxed text-retro-text flex gap-2">
                    <span className="text-retro-cta" aria-hidden="true">›</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Extra && (
            <Suspense fallback={null}>
              <Extra />
            </Suspense>
          )}

          {(() => {
            const full = (
              <>
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
              </>
            )
            return quick.long ? (
              <details className="group space-y-4 border-t border-retro-border pt-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-pixel text-[10px] text-retro-dim tracking-widest [&::-webkit-details-marker]:hidden">
                  FULL RULES
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="space-y-4 pt-2">{full}</div>
              </details>
            ) : full
          })()}
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
