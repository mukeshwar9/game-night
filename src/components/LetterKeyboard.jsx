import { cn } from '@/lib/utils'
import useGameKeys from '../hooks/useGameKeys'

const KB_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

// Each tried key carries a glyph and an aria-label as well as its colour, so
// hit/miss/pending read the same in every theme and to screen readers.
function keyState(guesses, letter) {
  if (!(letter in guesses)) return 'untried'
  const result = guesses[letter]
  if (result === 'pending') return 'pending'
  if (result === false) return 'miss'
  return 'hit'
}

const GLYPH = { hit: '✓', miss: '✗', pending: '…' }
const SPOKEN = { hit: 'in the word', miss: 'not in the word', pending: 'checking' }

export default function LetterKeyboard({ guesses = {}, onGuess, disabled = false }) {
  // Physical keyboard: useGameKeys ignores the room chat and other text
  // fields, and Cmd/Ctrl/Alt chords (Cmd+R must not guess R).
  useGameKeys((e) => {
    if (e.repeat || typeof e.key !== 'string' || e.key.length !== 1) return false
    const key = e.key.toUpperCase()
    if (!/^[A-Z]$/.test(key) || key in guesses) return false
    onGuess(key)
    return true
  }, { enabled: !disabled })

  return (
    <div className="flex flex-col gap-1 w-full max-w-md mx-auto px-1" role="group" aria-label="Letters">
      {KB_ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1 w-full">
          {row.map(letter => {
            const state = keyState(guesses, letter)
            const tried = state !== 'untried'
            return (
              <button
                key={letter}
                type="button"
                onClick={() => !tried && !disabled && onGuess(letter)}
                disabled={tried || disabled}
                aria-label={tried ? `${letter}, ${SPOKEN[state]}` : letter}
                className={cn(
                  'relative flex-1 min-w-0 h-11 flex items-center justify-center font-pixel text-[10px] rounded border transition-all',
                  'select-none active:scale-90',
                  state === 'hit' && 'border-retro-p1 text-retro-p1 shadow-neon-p1 bg-retro-tint-p1',
                  state === 'miss' && 'border-retro-border text-retro-dim bg-retro-card line-through opacity-60',
                  state === 'pending' && 'border-retro-cta text-retro-cta bg-retro-tint-cta arcade-blink',
                  !tried && !disabled && 'border-retro-border text-retro-dim bg-retro-card hover:border-retro-p1/50 hover:text-retro-text cursor-pointer',
                  !tried && disabled && 'border-retro-border text-retro-border bg-retro-card opacity-50 cursor-not-allowed',
                )}
              >
                {letter}
                {tried && (
                  <span aria-hidden="true" className="absolute top-0.5 right-0.5 text-[7px] leading-none no-underline">
                    {GLYPH[state]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
