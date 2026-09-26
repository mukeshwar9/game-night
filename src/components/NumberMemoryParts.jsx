import { chunkDigits, countMatchingPrefix } from '../lib/numberMemoryLogic'

// The number, grouped in threes and sized down as it grows, so a long number wraps
// inside the card at phone width instead of running off the screen.
export function BigNumber({ number, className }) {
  const len = String(number ?? '').length
  const size = len <= 6 ? 'text-2xl' : len <= 12 ? 'text-xl' : 'text-lg'
  return (
    <p className={`font-pixel ${size} leading-snug flex flex-wrap justify-center gap-x-3 gap-y-1 ${className}`}>
      {chunkDigits(number).map((c, i) => <span key={i}>{c}</span>)}
    </p>
  )
}

// A guess with its correct leading digits in green and the rest in the danger colour.
export function MarkedAnswer({ answer, number }) {
  if (answer == null) return <span className="text-retro-dim">—</span>
  const ok = countMatchingPrefix(answer, number)
  return (
    <span className="break-all">
      <span className="text-retro-win">{answer.slice(0, ok)}</span>
      <span className="text-retro-danger">{answer.slice(ok)}</span>
    </span>
  )
}
