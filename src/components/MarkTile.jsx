import { cn } from '@/lib/utils'

// One Wordle-style tile for every 5-letter word game (Word Duel, Word Race,
// Word Co-op). A mark is never shown by colour alone: each state carries a
// glyph and an aria-label, because in some themes (e.g. `mono`, where
// --c-cta equals --c-win) "correct" and "wrong spot" share a colour.
//
// mark: 'G' correct spot · 'Y' in the word, wrong spot · 'B' not in the word
const MARKS = {
  G: { glyph: '✓', label: 'correct spot', tile: 'bg-retro-win border-retro-win text-retro-bg' },
  Y: { glyph: '•', label: 'wrong spot', tile: 'bg-retro-cta border-retro-cta text-retro-bg' },
  B: { glyph: '×', label: 'not in word', tile: 'bg-retro-dim border-retro-dim text-retro-bg' },
}

const SIZES = {
  xs: 'w-4 h-4 text-[9px] border rounded-sm',
  sm: 'w-6 h-6 text-[10px] border rounded-sm',
  md: 'w-8 h-8 sm:w-12 sm:h-12 text-base sm:text-2xl border-2 rounded',
  lg: 'w-10 h-10 sm:w-12 sm:h-12 text-base sm:text-xl border-2 rounded',
  fluid: 'w-full aspect-square text-lg sm:text-2xl border-2 rounded',
}

const GLYPH_CORNER = {
  xs: null,
  sm: 'text-[6px] top-0 right-px',
  md: 'text-[7px] sm:text-[9px] top-0.5 right-0.5',
  lg: 'text-[7px] sm:text-[9px] top-0.5 right-0.5',
  fluid: 'text-[8px] sm:text-[10px] top-0.5 right-1',
}

// eslint-disable-next-line react-refresh/only-export-components -- WordKeyboard shares the spoken mark names so tiles and keys say the same thing
export function markLabelFor(mark) {
  return MARKS[mark]?.label || ''
}

// Plain glyph for a mark (✓ • ×), e.g. for legends or keyboard keys.
export function MarkGlyph({ mark, className }) {
  const info = MARKS[mark]
  if (!info) return null
  return <span aria-hidden="true" className={cn('font-mono leading-none', className)}>{info.glyph}</span>
}

export default function MarkTile({
  letter = '', mark = null, pending = false, size = 'md', label, className, style,
}) {
  const info = MARKS[mark] || null
  const ch = letter && letter !== ' ' ? String(letter).toUpperCase() : ''
  const spoken = label ?? (ch
    ? `${ch}, ${info ? info.label : pending ? 'not checked yet' : 'typed'}`
    : info ? info.label : 'empty')
  const corner = GLYPH_CORNER[size]
  return (
    <div
      role="img"
      aria-label={spoken}
      className={cn(
        'relative flex items-center justify-center uppercase select-none font-bold leading-none',
        'transition-colors duration-300',
        SIZES[size] || SIZES.md,
        info ? info.tile : ch ? 'bg-retro-card border-retro-border text-retro-text' : 'bg-retro-card border-retro-border',
        pending && ch && 'border-retro-cta',
        className,
      )}
      style={style}
    >
      {ch && <span aria-hidden="true">{ch}</span>}
      {info && (ch
        ? corner && <span aria-hidden="true" className={cn('absolute font-mono leading-none', corner)}>{info.glyph}</span>
        : <span aria-hidden="true" className="font-mono leading-none">{info.glyph}</span>)}
    </div>
  )
}
