import { cn } from '@/lib/utils'

// Cell sizes by the longest word, so a long word still fits a 360 px phone:
// up to 8 letters at full size, 9–11 smaller, 12+ smallest (and a single word
// longer than a row wraps inside itself). Phrases wrap at their spaces.
const SIZES = {
  large: { cell: 'w-8 h-8 text-sm', line: 'w-8', gap: 'gap-2', wordGap: 'gap-x-5' },
  medium: { cell: 'w-6 h-7 text-xs', line: 'w-6', gap: 'gap-1', wordGap: 'gap-x-4' },
  small: { cell: 'w-4 h-6 text-[10px]', line: 'w-4', gap: 'gap-[3px]', wordGap: 'gap-x-3' },
}

function cellSizeFor(longestWord) {
  if (longestWord <= 8) return 'large'
  if (longestWord <= 11) return 'medium'
  return 'small'
}

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

  const size = SIZES[cellSizeFor(Math.max(...structure))]
  const totalLetters = structure.reduce((a, b) => a + b, 0)
  const spoken = words
    .map(w => Array.from({ length: w.len }, (_, j) => letterFor(w.start + j) || 'blank').join(' '))
    .join(', next word, ')
  const label = `${revealedWord ? 'The word' : 'Hidden word'}, ${totalLetters} letters${words.length > 1 ? ` in ${words.length} words` : ''}: ${spoken}`

  return (
    <div className="space-y-3">
      {hint && (
        <p className="font-mono text-[11px] text-retro-dim text-center px-2 break-words">
          <span className="text-retro-cta font-pixel text-[9px]">HINT: </span>{hint}
        </p>
      )}
      <div
        className={cn('flex flex-wrap justify-center gap-y-3 px-2 max-w-full', size.wordGap)}
        role="img"
        aria-label={label}
      >
        {words.map((w, wi) => (
          <div key={wi} className={cn('flex flex-wrap justify-center max-w-full gap-y-2', size.gap)} aria-hidden="true">
            {Array.from({ length: w.len }, (_, j) => {
              const gi = w.start + j
              const letter = letterFor(gi)
              return (
                <div key={j} className="flex flex-col items-center gap-1">
                  <span className={cn(
                    'font-pixel flex items-center justify-center',
                    size.cell,
                    letter
                      ? revealedWord
                        ? 'text-retro-cta text-glow-cta'
                        : 'text-retro-p1 text-glow-p1'
                      : 'text-transparent',
                  )}>
                    {letter || '_'}
                  </span>
                  <div className={cn(
                    'h-0.5',
                    size.line,
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
