import { cn } from '@/lib/utils'
import useGameKeys from '../hooks/useGameKeys'
import { MarkGlyph, markLabelFor } from './MarkTile'

// Shared on-screen + physical keyboard for the 5-letter word games (Word Duel,
// Word Race, Word Co-op): one layout and one muscle memory.
//   - ↵ ENTER on the left, ⌫ BACKSPACE on the right of the bottom row.
//   - Keys are 44 px tall; at 375 px the letters can't grow wider, so an
//     invisible hit-slop covers the gaps between keys and rows.
//   - A tried key shows its best mark (G/Y/B) as a glyph and in its
//     aria-label, not by colour alone.
//   - Physical keys go through useGameKeys, so typing in the room chat never
//     becomes a guess and Cmd/Ctrl/Alt shortcuts are left alone.
//
// onKey receives 'A'–'Z', 'ENTER' or 'BACK'.
const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

const KEY_TONE = {
  G: 'bg-retro-win border-retro-win text-retro-bg',
  Y: 'bg-retro-cta border-retro-cta text-retro-bg',
  B: 'bg-retro-dim border-retro-dim text-retro-bg opacity-70',
}

// Hit-slop: stretch each key's tap target over half the 4 px column gap and
// the 6 px row gap, so the whole keyboard area is tappable.
const SLOP = "relative before:content-[''] before:absolute before:-inset-x-0.5 before:-inset-y-[3px]"

export default function WordKeyboard({
  keyState = {}, onKey, disabled = false, enterDisabled = false, physical = true,
  enterLabel = 'Enter guess', className,
}) {
  useGameKeys((e) => {
    if (e.key === 'Enter') {
      if (e.repeat) return true
      if (!enterDisabled) onKey('ENTER')
      return true
    }
    if (e.key === 'Backspace') { onKey('BACK'); return true }
    if (typeof e.key === 'string' && /^[a-zA-Z]$/.test(e.key)) { onKey(e.key.toUpperCase()); return true }
    return false
  }, { enabled: physical && !disabled })

  const special = 'flex-[1.5] min-w-0 h-11 flex items-center justify-center rounded border font-bold text-sm ' +
    'bg-retro-structure border-retro-structure text-retro-text hover:bg-retro-border transition-colors ' +
    'disabled:opacity-30 disabled:cursor-default active:scale-95'

  return (
    <div className={cn('flex flex-col gap-1.5 w-full max-w-md mx-auto select-none', className)} role="group" aria-label="Keyboard">
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1 w-full">
          {ri === 2 && (
            <button
              type="button"
              className={cn(SLOP, special)}
              onClick={() => onKey('ENTER')}
              disabled={disabled || enterDisabled}
              aria-label={enterLabel}
            >
              <span aria-hidden="true">↵</span>
            </button>
          )}
          {row.map(letter => {
            const state = keyState[letter]
            const label = markLabelFor(state)
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onKey(letter)}
                disabled={disabled}
                aria-label={label ? `${letter}, ${label}` : letter}
                className={cn(
                  SLOP,
                  'flex-1 min-w-0 h-11 flex items-center justify-center rounded border font-bold text-xs sm:text-sm uppercase',
                  'transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-default',
                  KEY_TONE[state] || 'bg-retro-structure border-retro-structure text-retro-text hover:bg-retro-border',
                )}
              >
                <span aria-hidden="true">{letter}</span>
                {state && <MarkGlyph mark={state} className="absolute top-0.5 right-0.5 text-[7px] sm:text-[8px]" />}
              </button>
            )
          })}
          {ri === 2 && (
            <button
              type="button"
              className={cn(SLOP, special)}
              onClick={() => onKey('BACK')}
              disabled={disabled}
              aria-label="Delete letter"
            >
              <span aria-hidden="true">⌫</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
