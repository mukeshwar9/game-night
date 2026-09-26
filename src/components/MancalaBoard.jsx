import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { countLabel, joinLabel } from '../lib/a11yLabels'

// Mancala board — horizontal Kalah layout, two rows of 6 pits + a store on
// each end. Seat-aware: `mySymbol` decides which row/store is "mine" (bottom
// + right) vs "rival" (top + left) so O sees their own pits at the bottom
// too, not X's view mirrored. Spectators (mySymbol === null) get the neutral
// X-perspective. Row/store labels are people, not seat glyphs: YOU and the
// opponent's name (from optional `players`, else RIVAL); spectators see both
// names (else X/O).
// Sow animation replays hops from `last` metadata.

function SeedCluster({ count }) {
  const dots = Math.min(count, 6)
  return (
    <div className="relative flex flex-wrap items-center justify-center gap-[2px] w-6">
      {Array.from({ length: dots }, (_, i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-retro-text opacity-80" />
      ))}
      {count > 6 && (
        <span className="absolute -top-1 -right-1 font-pixel text-[8px] text-retro-dim">{count}</span>
      )}
    </div>
  )
}

// Screen-reader name: whose pit, its 1–6 position in sowing order, seeds.
function pitLabel(index, count, ownerName) {
  const n = index < 6 ? index + 1 : index - 6
  return joinLabel(`${ownerName} pit ${n}`, countLabel(count, 'seed'))
}

function Pit({ index, count, interactive, accentRing, onPit, hop, ownerName }) {
  return (
    <button
      onClick={() => interactive && onPit?.(index)}
      disabled={!interactive}
      data-testid={`pit ${index}`}
      aria-label={pitLabel(index, count, ownerName)}
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

function Store({ count, label, ownerName }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="sr-only">{ownerName} store, {countLabel(count, 'seed')}</span>
      <div aria-hidden="true" className="w-10 sm:w-12 flex-1 rounded-xl border-2 border-retro-border bg-retro-deep flex items-center justify-center py-3">
        <span className="font-pixel text-sm text-retro-cta">{count}</span>
      </div>
      <span aria-hidden="true" className="font-pixel text-[9px] text-retro-text max-w-12 truncate">{label}</span>
    </div>
  )
}

export default function MancalaBoard({
  pits = [],
  last = null,
  onPit,
  onMove,
  disabled = false,
  accent = 'p1',
  mySymbol = 'X',
  players = null,
}) {
  // Registry (live) passes onMove; the solo /demo harness passes onPit — accept both.
  const handlePit = onPit ?? onMove

  // Sow replay: derive the hop sequence from `last`, pulse each slot in turn.
  // Keyed by a move counter/timestamp (`last.at`) when present, falling back to the
  // pit/by/seeds triple — this stops an identical repeat move from silently reusing a
  // stale replay key and skipping the animation.
  const [hops, setHops] = useState(null) // array of slot indices + current step
  const prevLast = useRef(null)
  const timerRef = useRef(null)

  const lastKey = last ? `${last.pit}:${last.by}:${last.seeds}:${last.at ?? ''}` : null
  if (prevLast.current !== lastKey) {
    prevLast.current = lastKey
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

  // Capture banner — mirrors the demo's local "CAPTURED n!" toast, driven by
  // `last.captured` so multiplayer gets the same feedback the solo bot game does.
  const [banner, setBanner] = useState(null)
  const prevCapturedKey = useRef(null)
  useEffect(() => {
    const capturedKey = last?.captured > 0 ? lastKey : null
    if (capturedKey && capturedKey !== prevCapturedKey.current) {
      prevCapturedKey.current = capturedKey
      const mine = last.by === mySymbol
      setBanner(mine ? `CAPTURED ${last.captured}!` : `RIVAL CAPTURED ${last.captured}!`)
      const t = setTimeout(() => setBanner(null), 1800)
      return () => clearTimeout(t)
    }
    if (!capturedKey) prevCapturedKey.current = null
    return undefined
  }, [lastKey, last, mySymbol])

  const hopIndex = hops && hops.step >= 0 && hops.step < hops.seq.length ? hops.seq[hops.step] : null
  const ring = accent === 'p1' ? 'border-retro-p1 shadow-neon-p1' : 'border-retro-p2 shadow-neon-p2'
  const spectator = mySymbol == null
  const canPlay = !disabled && !!handlePit && !spectator

  // bottomIsX: whether the bottom row (the "mine" row) belongs to X. Spectators default
  // to the classic X-perspective.
  const bottomIsX = spectator ? true : mySymbol === 'X'
  const BOTTOM_ROW = bottomIsX ? [0, 1, 2, 3, 4, 5] : [12, 11, 10, 9, 8, 7]
  const TOP_ROW = bottomIsX ? [12, 11, 10, 9, 8, 7] : [0, 1, 2, 3, 4, 5]
  const bottomStorePit = bottomIsX ? 6 : 13
  const topStorePit = bottomIsX ? 13 : 6
  const nameOf = (sym, fallback) => (players?.[sym]?.name || fallback).toUpperCase()
  const bottomLabel = spectator ? nameOf('X', 'X') : 'YOU'
  const topLabel = spectator ? nameOf('O', 'O') : nameOf(bottomIsX ? 'O' : 'X', 'RIVAL')
  // Owner words for screen-reader names ("Your pit 3", "Rival store").
  const bottomOwner = spectator ? 'X' : 'Your'
  const topOwner = spectator ? 'O' : 'Rival'

  return (
    <div className="relative w-full max-w-md mx-auto">
      {banner && (
        <p className="absolute left-1/2 -translate-x-1/2 -top-6 font-pixel text-[10px] text-retro-win text-glow-win text-center whitespace-nowrap">
          {banner}
        </p>
      )}
      <div className="flex items-stretch gap-1.5 w-full">
        <Store count={pits[topStorePit] ?? 0} label={topLabel} ownerName={topOwner} />
        <div className="flex-1 grid grid-rows-[auto_auto_auto] gap-1">
          {/* Rival row — reversed so sowing reads counterclockwise */}
          <div className="grid grid-cols-6 gap-1">
            {TOP_ROW.map(i => (
              <Pit
                key={i}
                index={i}
                count={pits[i] ?? 0}
                interactive={false}
                onPit={handlePit}
                hop={hopIndex === i}
                ownerName={topOwner}
              />
            ))}
          </div>
          <p aria-hidden="true" className="font-pixel text-[10px] text-retro-dim text-center tracking-wider truncate">▲ {topLabel}&apos;S PITS</p>
          {/* Mine row */}
          <div className="grid grid-cols-6 gap-1">
            {BOTTOM_ROW.map(i => {
              const playable = canPlay && (pits[i] ?? 0) > 0
              return (
                <Pit
                  key={i}
                  index={i}
                  count={pits[i] ?? 0}
                  interactive={playable}
                  accentRing={ring}
                  onPit={handlePit}
                  hop={hopIndex === i}
                  ownerName={bottomOwner}
                />
              )
            })}
          </div>
          <p aria-hidden="true" className={cn(
            'font-pixel text-[10px] text-center tracking-wider truncate',
            canPlay ? (bottomIsX ? 'text-retro-p1' : 'text-retro-p2') : 'text-retro-dim',
          )}>
            {spectator ? `▼ ${bottomLabel}'S PITS` : '▼ YOUR PITS'}
          </p>
        </div>
        <Store count={pits[bottomStorePit] ?? 0} label={bottomLabel} ownerName={bottomOwner} />
      </div>
    </div>
  )
}
