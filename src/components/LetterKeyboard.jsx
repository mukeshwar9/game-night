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
              'h-10 flex items-center justify-center font-pixel text-[9px] rounded border transition-all',
              'select-none active:scale-90',
              isHit && 'border-retro-cyan text-retro-cyan shadow-neon-cyan bg-[#001a2e]',
              isMiss && 'border-retro-border text-retro-border bg-retro-card line-through opacity-40',
              !tried && !disabled && 'border-retro-border text-retro-dim bg-retro-card hover:border-retro-cyan/50 hover:text-retro-text cursor-pointer',
              !tried && disabled && 'border-retro-border text-retro-border bg-retro-card opacity-50 cursor-not-allowed',
              result === 'pending' && 'border-retro-yellow text-retro-yellow animate-pulse',
            )}
          >
            {letter}
          </button>
        )
      })}
    </div>
  )
}
