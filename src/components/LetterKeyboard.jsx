import { useEffect } from 'react'
import { cn } from '@/lib/utils'

const KB_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

export default function LetterKeyboard({ guesses = {}, onGuess, disabled = false }) {
  // Physical keyboard support
  useEffect(() => {
    if (disabled) return
    const handler = (e) => {
      const key = e.key.toUpperCase()
      if (/^[A-Z]$/.test(key) && !(key in guesses)) {
        onGuess(key)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [guesses, onGuess, disabled])

  return (
    <div className="flex flex-col gap-1 w-full max-w-md mx-auto px-1">
      {KB_ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1 w-full">
          {row.map(letter => {
            const result = guesses[letter]
            const tried = letter in guesses
            const isHit = tried && result !== false && result !== 'pending'
            const isMiss = tried && result === false

            return (
              <button
                key={letter}
                onClick={() => !tried && !disabled && onGuess(letter)}
                disabled={tried || disabled}
                className={cn(
                  'flex-1 min-w-0 h-11 flex items-center justify-center font-pixel text-[10px] rounded border transition-all',
                  'select-none active:scale-90',
                  isHit && 'border-retro-p1 text-retro-p1 shadow-neon-p1 bg-retro-tint-p1',
                  isMiss && 'border-retro-border text-retro-border bg-retro-card line-through opacity-40',
                  !tried && !disabled && 'border-retro-border text-retro-dim bg-retro-card hover:border-retro-p1/50 hover:text-retro-text cursor-pointer',
                  !tried && disabled && 'border-retro-border text-retro-border bg-retro-card opacity-50 cursor-not-allowed',
                  result === 'pending' && 'border-retro-cta text-retro-cta arcade-blink',
                )}
              >
                {letter}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
