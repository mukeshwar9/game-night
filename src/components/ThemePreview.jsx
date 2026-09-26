import { getFont } from '../lib/font'
import { THEMES } from '../lib/theme'

// Miniature game screen rendered in any theme + font without touching the
// document. `[data-theme="…"]` token blocks match any element, so setting the
// attribute on this wrapper re-scopes every --c-* var for its subtree only;
// --font-pixel is set inline for the same reason. Purely decorative — the
// picker buttons carry the accessible names — so it is aria-hidden and inert.
// `.theme-preview` (index.css) draws a scoped copy of the CRT scanlines +
// vignette, keyed off the same --crt-overlay token and [data-crt] toggle as
// the real body overlay, so dark themes preview the way they will look.
const BOARD = ['X', 'O', '', '', 'X', 'O', '', '', 'X']
const WIN = new Set([0, 4, 8])
const WORD = ['P', 'I', '', 'E', 'L']

export default function ThemePreview({ theme, font, caption, className = '' }) {
  const label = THEMES.find(option => option.id === theme)?.label ?? theme
  return <div
    data-theme={theme}
    aria-hidden="true"
    inert=""
    style={{ '--font-pixel': `'${getFont(font).family}'` }}
    className={`theme-preview relative overflow-hidden rounded border-2 border-retro-border bg-retro-bg text-retro-text ${className}`}
  >
    <div className="flex items-center justify-between border-b border-retro-border bg-retro-surface px-2 py-1.5">
      <span className="font-pixel text-[8px] text-retro-cta text-glow-cta tracking-widest">GAME NIGHT</span>
      <span className="font-pixel text-[7px] text-retro-dim truncate ml-2">{caption ?? label}</span>
    </div>

    <div className="flex gap-2 p-2 md:flex-col">
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded border border-retro-p1 bg-retro-tint-p1 px-1.5 py-1">
            <p className="font-pixel text-[7px] text-retro-p1">X · ANA</p>
            <p className="font-pixel text-[11px] text-retro-p1 text-glow-p1 mt-0.5">2</p>
          </div>
          <div className="rounded border border-retro-border bg-retro-card px-1.5 py-1">
            <p className="font-pixel text-[7px] text-retro-p2">O · BO</p>
            <p className="font-pixel text-[11px] text-retro-p2 mt-0.5">1</p>
          </div>
        </div>
        <p className="font-pixel text-[7px] text-retro-win text-glow-win">X WINS THE ROUND!</p>
        <div className="flex gap-1">
          {WORD.map((letter, i) => <span key={i} className="flex h-5 w-4 items-end justify-center border-b-2 border-retro-structure font-pixel text-[8px] text-retro-text">{letter}</span>)}
        </div>
        <p className="font-mono text-[9px] text-retro-dim leading-snug">Dim body text for hints and rules.</p>
        <div className="flex gap-1.5">
          <span className="flex-1 rounded border-2 border-retro-cta bg-retro-tint-cta py-1 text-center font-pixel text-[7px] text-retro-cta shadow-neon-cta">PLAY AGAIN</span>
          <span className="flex-1 rounded border-2 border-retro-border py-1 text-center font-pixel text-[7px] text-retro-dim">SWITCH</span>
        </div>
      </div>

      <div className="grid w-[92px] shrink-0 grid-cols-3 gap-[3px] self-start rounded bg-retro-structure p-[3px] md:w-full md:max-w-[150px] md:self-center">
        {BOARD.map((cell, i) => <span
          key={i}
          className={`flex aspect-square items-center justify-center rounded-sm font-pixel text-[11px] md:text-[16px] ${WIN.has(i) ? 'bg-retro-deep text-retro-win text-glow-win' : 'bg-retro-card'} ${!WIN.has(i) && cell === 'X' ? 'text-retro-p1' : ''} ${cell === 'O' ? 'text-retro-p2 text-glow-p2' : ''}`}
        >{cell}</span>)}
      </div>
    </div>
  </div>
}
