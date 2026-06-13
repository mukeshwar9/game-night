import { useEffect } from 'react'
import { cn } from '@/lib/utils'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

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
    <div className="grid grid-cols-9 gap-1 w-full max-w-[360px] mx-auto px-1">
      {LETTERS.map(letter => {
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
              'h-11 flex items-center justify-center font-pixel text-[10px] rounded border transition-all',
              'select-none active:scale-90',
              isHit && 'border-retro-p1 text-retro-p1 shadow-neon-p1 bg-retro-tint-p1',
              isMiss && 'border-retro-border text-retro-border bg-retro-card line-through opacity-40',
              !tried && !disabled && 'border-retro-border text-retro-dim bg-retro-card hover:border-retro-p1/50 hover:text-retro-text cursor-pointer',
              !tried && disabled && 'border-retro-border text-retro-border bg-retro-card opacity-50 cursor-not-allowed',
              result === 'pending' && 'border-retro-cta text-retro-cta animate-pulse',
            )}
          >
            {letter}
          </button>
        )
      })}
    </div>
  )
}
