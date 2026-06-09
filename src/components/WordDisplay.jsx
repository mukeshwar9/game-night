import { cn } from '@/lib/utils'

// guesses: { LETTER: number[]|false|'pending' }
export default function WordDisplay({ wordLength, guesses = {}, revealedWord = null }) {
  const slots = Array.from({ length: wordLength }, (_, i) => {
    if (revealedWord) return revealedWord[i]
    for (const [letter, val] of Object.entries(guesses)) {
      if (val === false || val === 'pending') continue
      const positions = Array.isArray(val) ? val : Object.values(val)
      if (positions.map(Number).includes(i)) return letter
    }
    return null
  })

  return (
    <div className="flex flex-wrap justify-center gap-2 px-2">
      {slots.map((letter, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <span
            className={cn(
              'font-pixel text-sm w-8 h-8 flex items-center justify-center',
              letter
                ? revealedWord
                  ? 'text-retro-yellow text-glow-yellow'
                  : 'text-retro-cyan text-glow-cyan'
                : 'text-transparent',
            )}
          >
            {letter || '_'}
          </span>
          <div className={cn(
            'h-0.5 w-8',
            letter ? 'bg-retro-cyan' : 'bg-retro-border',
          )} />
        </div>
      ))}
    </div>
  )
}
