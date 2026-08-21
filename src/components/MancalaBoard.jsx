import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Mancala board — horizontal Kalah layout. O's store left (13), two rows of
// 6 pits center (top = O's pits 12..7 right-to-left, bottom = X's pits 0..5),
// X's store right (6). Sow animation replays hops from `last` metadata.

const TOP_ROW = [12, 11, 10, 9, 8, 7]
const BOTTOM_ROW = [0, 1, 2, 3, 4, 5]

function SeedCluster({ count }) {
  const dots = Math.min(count, 6)
  return (
    <div className="relative flex flex-wrap items-center justify-center gap-[2px] w-6">
      {Array.from({ length: dots }, (_, i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-retro-text opacity-80" />
      ))}
      {count > 6 && (
        <span className="absolute -top-1 -right-1 font-pixel text-[7px] text-retro-dim">{count}</span>
      )}
    </div>
  )
}

function Pit({ index, count, interactive, accentRing, onPit, hop }) {
  return (
    <button
      onClick={() => interactive && onPit?.(index)}
      disabled={!interactive}
      aria-label={`pit ${index}`}
      className={cn(
        'aspect-[5/6] min-h-9 rounded-lg border-2 flex items-center justify-center transition-all duration-150 relative',
        'bg-retro-deep',
        interactive
          ? cn('cursor-pointer active:scale-95', accentRing)
          : 'border-retro-border/60 cursor-default',
        hop && 'scale-110 border-retro-win shadow-neon-win',
      )}
    >
      <SeedCluster count={count} />
    </button>
  )
}

function Store({ count, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-10 sm:w-12 flex-1 rounded-xl border-2 border-retro-border bg-retro-deep flex items-center justify-center py-3">
        <span className="font-pixel text-sm text-retro-cta">{count}</span>
      </div>
      <span className="font-pixel text-[6px] text-retro-dim">{label}</span>
    </div>
  )
}

export default function MancalaBoard({
  pits = [],
  last = null,
  onPit,
  disabled = false,
  accent = 'p1',
}) {
  // Sow replay: derive the hop sequence from `last`, pulse each slot in turn.
  const [hops, setHops] = useState(null) // array of slot indices + current step
  const prevLast = useRef(null)
  const timerRef = useRef(null)

  if (prevLast.current !== (last ? `${last.pit}:${last.by}:${last.seeds}` : null)) {
    prevLast.current = last ? `${last.pit}:${last.by}:${last.seeds}` : null
    if (last && last.seeds > 0) {
      const seq = []
      let cursor = last.pit
      for (let s = 0; s < Math.min(last.seeds, 13); s++) {
        cursor = (cursor + 1) % 14
        if (cursor === (last.by === 'X' ? 13 : 6)) cursor = (cursor + 1) % 14
        seq.push(cursor)
      }
      setHops({ seq, step: -1 })
    } else {
      setHops(null)
    }
  }

  useEffect(() => {
    if (!hops || hops.step >= hops.seq.length) return
    timerRef.current = setTimeout(() => {
      setHops(h => (h ? { ...h, step: h.step + 1 } : h))
    }, hops.step < 0 ? 60 : Math.min(120, Math.floor(1500 / Math.max(1, hops.seq.length))))
    return () => clearTimeout(timerRef.current)
  }, [hops])

  const hopIndex = hops && hops.step >= 0 && hops.step < hops.seq.length ? hops.seq[hops.step] : null
  const ring = accent === 'p1' ? 'border-retro-p1 shadow-neon-p1' : 'border-retro-p2 shadow-neon-p2'
  const canPlay = !disabled && !!onPit

  return (
    <div className="flex items-stretch gap-1.5 w-full max-w-md mx-auto">
      <Store count={pits[13] ?? 0} label="RIVAL" />
      <div className="flex-1 grid grid-rows-[auto_auto_auto] gap-1">
        {/* O row — reversed so sowing reads counterclockwise */}
        <div className="grid grid-cols-6 gap-1">
          {TOP_ROW.map(i => (
            <Pit
              key={i}
              index={i}
              count={pits[i] ?? 0}
              interactive={false}
              onPit={onPit}
              hop={hopIndex === i}
            />
          ))}
        </div>
        <p className="font-pixel text-[6px] text-retro-dim text-center tracking-widest">RIVAL · O</p>
        {/* X row */}
        <div className="grid grid-cols-6 gap-1">
          {BOTTOM_ROW.map(i => {
            const playable = canPlay && (pits[i] ?? 0) > 0 && accent === 'p1'
            return (
              <Pit
                key={i}
                index={i}
                count={pits[i] ?? 0}
                interactive={playable}
                accentRing={ring}
                onPit={onPit}
                hop={hopIndex === i}
              />
            )
          })}
        </div>
        <p className="font-pixel text-[6px] text-retro-dim text-center tracking-widest">YOU · X</p>
      </div>
      <Store count={pits[6] ?? 0} label="YOU" />
    </div>
  )
}
