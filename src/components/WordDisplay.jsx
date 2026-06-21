import { cn } from '@/lib/utils'

// guesses: { LETTER: number[]|false|'pending' }
// wordStructure: number[] — per-word letter counts; falls back to [wordLength] for legacy callers
export default function WordDisplay({ wordStructure: wsProp, wordLength, guesses = {}, revealedWord = null, hint = null }) {
  // Coerce wordStructure from Firebase's array-or-object form
  let structure = [wordLength || 0]
  if (wsProp && (Array.isArray(wsProp) || typeof wsProp === 'object')) {
    const arr = (Array.isArray(wsProp) ? wsProp : Object.values(wsProp)).map(Number).filter(n => n > 0)
    if (arr.length) structure = arr
  }

  // Map a global char index to its revealed/guessed letter
  const letterFor = (gi) => {
    if (revealedWord) return revealedWord[gi]
    for (const [letter, val] of Object.entries(guesses)) {
      if (val === false || val === 'pending') continue
      const positions = Array.isArray(val) ? val : Object.values(val)
      if (positions.map(Number).includes(gi)) return letter
    }
    return null
  }

  // Build word descriptors: start index in the full string (including space chars between words).
  // Compute start offsets with reduce to avoid a mutable `let cursor` that would trip the
  // react-compiler "no reassign after render" lint rule.
  const words = structure.reduce((acc, len) => {
    const prev = acc[acc.length - 1]
    const start = prev ? prev.start + prev.len + 1 : 0
    return [...acc, { len, start }]
  }, [])

  return (
    <div className="space-y-3">
      {hint && (
        <p className="font-mono text-[11px] text-retro-dim text-center px-2">
          <span className="text-retro-cta font-pixel text-[9px]">HINT: </span>{hint}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-3 px-2">
        {words.map((w, wi) => (
          <div key={wi} className="flex gap-2">
            {Array.from({ length: w.len }, (_, j) => {
              const gi = w.start + j
              const letter = letterFor(gi)
              return (
                <div key={j} className="flex flex-col items-center gap-1">
                  <span className={cn(
                    'font-pixel text-sm w-8 h-8 flex items-center justify-center',
                    letter
                      ? revealedWord
                        ? 'text-retro-cta text-glow-cta'
                        : 'text-retro-p1 text-glow-p1'
                      : 'text-transparent',
                  )}>
                    {letter || '_'}
                  </span>
                  <div className={cn(
                    'h-0.5 w-8',
                    letter ? 'bg-retro-p1' : 'bg-retro-border',
                  )} />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
