import { chunkDigits, markDigits } from '../lib/numberMemoryLogic'

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

// A guess grouped in threes like the number, each digit green where it matches the
// number in that position and in the danger colour (underlined, so colour is not the
// only cue) where it does not.
export function MarkedAnswer({ answer, number }) {
  if (answer == null) return <span className="text-retro-dim">—</span>
  const marks = markDigits(answer, number)
  const groups = []
  for (let i = 0; i < marks.length; i += 3) groups.push(marks.slice(i, i + 3))
  return (
    <span className="inline-flex flex-wrap justify-center gap-x-2 break-all" aria-label={`${answer}, ${marks.filter(m => m.mark === 'ok').length} of ${String(number ?? '').length} digits in the right place`}>
      {groups.map((g, gi) => (
        <span key={gi} aria-hidden="true">
          {g.map((m, i) => (
            <span key={i} className={m.mark === 'ok' ? 'text-retro-win' : 'text-retro-danger underline decoration-2 underline-offset-4'}>{m.d}</span>
          ))}
        </span>
      ))}
    </span>
  )
}
