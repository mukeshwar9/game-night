// The pieces of SKETCH's stage screen: a strip of faces, the timer ring, the
// blanks (with hint letters), guess bubbles over the drawing, and the
// end-of-match podium and gallery. Rendering only; the rules are in
// src/lib/sketchLogic.js and src/lib/sketchStageLogic.js.
import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import { DrawingThumb } from './SketchDrawing'
import { blankCells, tierMultiplier } from '../lib/sketchLogic'
import { RING_RADIUS, RING_CIRCUMFERENCE, ringState, recentBubbles } from '../lib/sketchStageLogic'
import { MAX_HEART_FLOATS } from '../lib/sketchFavesLogic'
import useMotionPref from '../hooks/useMotionPref'
import { cn } from '@/lib/utils'

const HOLD_MS = 500

// ---------------------------------------------------------------------------
// Timer ring: drains clockwise-out, number in the middle. No deadline (timers
// off) shows a calm full ring with an infinity-free dash instead of a number.
// ---------------------------------------------------------------------------
export function TimerRing({ endsAt, totalMs, now, className }) {
  const r = ringState(endsAt, totalMs, now)
  return (
    <div
      className={cn('relative h-9 w-9 shrink-0', className)}
      role="timer"
      aria-label={r.seconds == null ? 'No timer' : `${r.seconds} seconds left`}
      data-testid="sketch-ring"
    >
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={RING_RADIUS} fill="none" strokeWidth="4" className="stroke-retro-border" />
        <circle
          cx="18" cy="18" r={RING_RADIUS} fill="none" strokeWidth="4" strokeLinecap="butt"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={r.dash}
          className={cn('transition-[stroke-dashoffset] duration-200', r.urgent ? 'stroke-retro-p2' : 'stroke-retro-cta')}
        />
      </svg>
      <span className={cn(
        'absolute inset-0 flex items-center justify-center font-pixel text-[9px] tabular-nums',
        r.urgent ? 'text-retro-p2' : 'text-retro-text',
      )}
      >
        {r.seconds ?? '–'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Faces: one tile per player. With up to four players a tile is avatar + name
// + score side by side; with more it is avatar over score so eight still fit
// one row at phone width. The artist's tile carries a pencil, a player who got
// it a check, and `deltas` (reveal) fly their points up from the face. The
// artist's face is a button when `onHold` is given: hold it for the menu.
// ---------------------------------------------------------------------------
function FaceBadge({ role }) {
  if (role === 'artist') {
    return (
      <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-retro-border bg-retro-card text-[9px] leading-none">
        ✎
      </span>
    )
  }
  if (role === 'solved') {
    return (
      <span aria-hidden="true" className="sketch-check-pop absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-retro-win font-pixel text-[8px] leading-none text-retro-bg">
        ✓
      </span>
    )
  }
  return null
}

function Face({ tile, mine, compact, delta, holdable, onHold, onTap }) {
  const timer = useRef(null)
  const held = useRef(false)
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  useEffect(() => clear, [])

  const body = (
    <>
      <span className="relative inline-block shrink-0">
        <span className={cn('block rounded', tile.role === 'solved' && 'ring-2 ring-retro-win', tile.role === 'artist' && 'ring-2 ring-retro-cta')}>
          <Avatar id={tile.avatar} size={24} className={tile.offline ? 'opacity-40' : ''} />
        </span>
        <FaceBadge role={tile.role} />
        {delta > 0 && (
          <span aria-hidden="true" className="sketch-pts-fly pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap font-pixel text-[9px] text-retro-win text-glow-win">
            +{delta}
          </span>
        )}
      </span>
      {compact ? (
        <span className="mt-0.5 block font-pixel text-[8px] tabular-nums text-retro-dim">{tile.score}</span>
      ) : (
        <span className="min-w-0 text-left leading-tight">
          <span className={cn('block truncate font-pixel text-[8px]', mine ? 'text-retro-cta' : 'text-retro-text')}>{tile.name.toUpperCase()}</span>
          <span className="block font-pixel text-[9px] tabular-nums text-retro-dim">{tile.score}</span>
        </span>
      )}
    </>
  )

  const cls = cn(
    'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded px-1 py-1',
    compact && 'flex-col gap-0',
    mine && 'bg-retro-tint-cta',
  )
  const label = `${tile.name}${mine ? ' (you)' : ''}, ${tile.score} points${tile.role === 'solved' ? ', got it' : tile.role === 'artist' ? ', drawing' : ''}${tile.offline ? ', offline' : ''}`

  if (!holdable) {
    return <div className={cls} aria-label={label} role="group" data-face={tile.id} data-role={tile.role}>{body}</div>
  }
  return (
    <button
      type="button"
      aria-label={`${label}. Hold for menu`}
      data-face={tile.id}
      data-role={tile.role}
      className={cn(cls, 'press-card touch-manipulation select-none')}
      onPointerDown={() => {
        held.current = false
        clear()
        timer.current = setTimeout(() => { held.current = true; timer.current = null; onHold?.() }, HOLD_MS)
      }}
      onPointerUp={() => { clear(); if (!held.current) onTap?.() }}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={e => { e.preventDefault(); clear(); held.current = true; onHold?.() }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHold?.() } }}
    >
      {body}
    </button>
  )
}

export function FaceStrip({ tiles, mySeat, deltas, holdableId, onHold, onTap }) {
  const compact = tiles.length > 4
  return (
    <div className="flex items-stretch gap-1 rounded border border-retro-border bg-retro-card p-0.5" data-testid="sketch-faces">
      {tiles.map(t => (
        <Face
          key={t.id}
          tile={t}
          mine={t.id === mySeat}
          compact={compact}
          delta={deltas?.[t.id]}
          holdable={t.id === holdableId}
          onHold={onHold}
          onTap={onTap}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Blanks: one empty box per letter, grouped by word. A hint letter drops into
// its box (`flashN` is the newest hint, which animates once).
// ---------------------------------------------------------------------------
export function Blanks({ pattern, hints, flashN = null, solvedWord = null }) {
  if (solvedWord) {
    return <p className="font-pixel text-sm tracking-widest text-retro-win text-glow-win" data-testid="sketch-word">{solvedWord.toUpperCase()}</p>
  }
  const words = blankCells(pattern, hints)
  const hintByIndex = new Map((hints || []).map(h => [h.i, h.n]))
  let flat = 0
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1" aria-label={`${pattern} letters`} data-testid="sketch-blanks">
      {words.map((cells, w) => (
        <span key={w} className="flex gap-[3px]">
          {cells.map((cell) => {
            const idx = flat++
            return (
              <span
                key={idx}
                data-hint={cell.hint ? '1' : undefined}
                className={cn(
                  'flex h-6 w-[18px] items-center justify-center border-b-2 font-pixel text-[12px] leading-none',
                  cell.hint ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-dim text-retro-text',
                  cell.hint && hintByIndex.get(idx) === flashN && 'sketch-hint-drop',
                )}
              >
                {cell.ch.toUpperCase()}
              </span>
            )
          })}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Guess bubbles: the room's wrong answers floating over the bottom of the
// drawing. They never take a tap (the artist draws through them).
// ---------------------------------------------------------------------------
const AGE_OPACITY = ['opacity-100', 'opacity-90', 'opacity-70', 'opacity-50']

export function GuessBubbles({ entries, players, mySeat, reserveRight = false }) {
  const bubbles = recentBubbles(entries)
  if (bubbles.length === 0) return null
  return (
    <div
      className={cn('pointer-events-none absolute bottom-1.5 left-1.5 flex flex-col items-start gap-1', reserveRight ? 'right-14' : 'right-1.5')}
      data-testid="sketch-bubbles"
      aria-hidden="true"
    >
      {bubbles.map(b => (
        <span
          key={b.key}
          className={cn(
            'sketch-bubble-in max-w-full truncate rounded border border-retro-border bg-retro-card/95 px-2 py-0.5 font-mono text-[11px] text-retro-text',
            AGE_OPACITY[b.age] ?? 'opacity-40',
            b.uid === mySeat && 'border-retro-cta',
          )}
        >
          <span className="text-retro-dim">{(players?.[b.uid]?.name || '???').toUpperCase()}</span>{' '}{b.text}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// End of match: the podium, then every drawing the phone saw, swipeable.
// ---------------------------------------------------------------------------
const PODIUM_TONE = { 1: 'border-retro-win text-retro-win', 2: 'border-retro-cta text-retro-cta', 3: 'border-retro-p2 text-retro-p2' }

export function Podium({ rows, players, mySeat }) {
  return (
    <ol className="space-y-1.5" data-testid="sketch-podium">
      {rows.map(r => (
        <li
          key={r.id}
          className={cn(
            'flex items-center gap-2 rounded border-2 bg-retro-card px-2 py-1.5',
            r.rank <= 3 ? PODIUM_TONE[r.rank] : 'border-retro-border text-retro-text',
          )}
        >
          <span className="w-5 text-center font-pixel text-[11px]">{r.rank}</span>
          <Avatar id={players?.[r.id]?.avatar} size={24} />
          <span className={cn('min-w-0 flex-1 truncate text-left font-pixel text-[10px]', r.id === mySeat && 'text-retro-cta')}>
            {(players?.[r.id]?.name || '???').toUpperCase()}{r.id === mySeat ? ' (YOU)' : ''}
          </span>
          <span className="font-pixel text-[11px] tabular-nums">{r.score}</span>
        </li>
      ))}
    </ol>
  )
}

export function Gallery({ entries }) {
  if (!entries || entries.length === 0) return null
  return (
    <section className="space-y-1.5" aria-label="This match's drawings" data-testid="sketch-gallery">
      <p className="font-pixel text-[9px] tracking-widest text-retro-dim">THIS MATCH&apos;S DRAWINGS</p>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {entries.map(e => (
          <li key={e.id} className="w-[72%] max-w-[260px] shrink-0 snap-center space-y-1 rounded border-2 border-retro-border bg-retro-card p-1.5">
            <DrawingThumb strokes={e.strokes} fills={e.fills} className="block rounded-sm" label={`${e.word}, drawn by ${e.artistName}`} />
            <p className="truncate font-pixel text-[10px] text-retro-text">{String(e.word).toUpperCase()}</p>
            <p className="truncate font-pixel text-[8px] text-retro-dim">
              {String(e.artistName).toUpperCase()}{tierMultiplier(e.tier) > 1 ? ` · ×${tierMultiplier(e.tier)}` : ''}
            </p>
          </li>
        ))}
      </ul>
      {entries.length > 1 && <p className="text-center font-pixel text-[8px] text-retro-dim">{entries.length} DRAWINGS · SWIPE</p>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Hearts (S5): one heart per player per drawing, bottom-right of the canvas.
// `mode` 'button' lets this player heart it; 'count' only shows the count.
// Other players' hearts float up (pixel steps, at most a few at once; reduced
// motion shows the count only). Hearts never touch points.
// ---------------------------------------------------------------------------
const HEART_FILLED = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
const HEART_OUTLINE = ['.XX.XX.', 'X..X..X', 'X.....X', '.X...X.', '..X.X..', '...X...']

export function PixelHeart({ filled = true, className }) {
  const rows = filled ? HEART_FILLED : HEART_OUTLINE
  const rects = []
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === 'X') rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
  }))
  return (
    <svg viewBox="0 0 7 6" shapeRendering="crispEdges" aria-hidden="true" className={cn('h-3 w-[14px] fill-current', className)}>
      {rects}
    </svg>
  )
}

export function HeartSpot({ mode, count, mine, onToggle, busy = false, hint = false }) {
  const { reduced } = useMotionPref()
  const [floats, setFloats] = useState([])
  const seenRef = useRef({ count, mine, id: 0 })
  // Count went up by more than my own tap explains: float the others' hearts.
  useEffect(() => {
    const seen = seenRef.current
    if (seen.count === count && seen.mine === mine) return
    const others = (count - seen.count) - ((mine ? 1 : 0) - (seen.mine ? 1 : 0))
    seenRef.current = { count, mine, id: seen.id + Math.max(0, others) }
    if (others > 0 && !reduced) {
      const fresh = Array.from({ length: others }, (_, i) => seen.id + i + 1)
      setFloats(f => [...f, ...fresh].slice(-MAX_HEART_FLOATS))
    }
  }, [count, mine, reduced])
  if (!mode) return null

  const label = `${count} heart${count === 1 ? '' : 's'}`
  const body = (
    <>
      <PixelHeart filled={mode === 'count' ? count > 0 : mine} />
      <span className="font-pixel text-[9px] tabular-nums">{count}</span>
    </>
  )
  return (
    <div className="absolute bottom-1.5 right-1.5 z-10 flex flex-col items-end" data-testid="sketch-heart" data-count={count} data-mine={mine ? '1' : '0'}>
      {floats.map((id, i) => (
        <span
          key={id}
          aria-hidden="true"
          className="sketch-heart-float pointer-events-none absolute bottom-full text-retro-p3"
          style={{ right: `${8 + (i % 2) * 10}px` }}
          onAnimationEnd={() => setFloats(f => f.filter(x => x !== id))}
        >
          <PixelHeart />
        </span>
      ))}
      {hint && (
        <span role="status" className="sketch-bubble-in pointer-events-none mb-1 whitespace-nowrap rounded border border-retro-p3 bg-retro-card px-2 py-0.5 font-pixel text-[8px] text-retro-p3">
          TAP ♥ IF YOU LOVE IT
        </span>
      )}
      {mode === 'button' ? (
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-pressed={mine}
          aria-label={`Love this drawing, ${label}`}
          className={cn(
            'flex min-h-11 min-w-11 items-center justify-center gap-1 rounded border-2 px-2 transition press',
            mine ? 'border-retro-p3 bg-retro-tint-p3 text-retro-p3' : 'border-retro-border bg-retro-card/95 text-retro-text',
          )}
        >
          {body}
        </button>
      ) : (
        <div role="img" aria-label={label} className="flex min-h-9 items-center gap-1 rounded border border-retro-border bg-retro-card/95 px-2 text-retro-p3">
          {body}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CROWD FAVOURITE (S5): the most-hearted drawing of the match, above the
// podium. `award` is crowdFavourite(); `gallery` is this phone's drawings (a
// drawing this phone never saw, e.g. after joining late, shows as text).
// ---------------------------------------------------------------------------
export function CrowdFavourite({ award, gallery, players, voters }) {
  if (!award) return null
  const byId = new Map((gallery || []).map(e => [e.id, e]))
  const name = id => (players?.[id]?.name || '???').toUpperCase()
  const tied = award.entries.length > 1
  const of = voters > 0 ? ` OF ${Math.max(voters, award.count)}` : ''
  return (
    <section className="space-y-1.5 rounded border-2 border-retro-p3 bg-retro-card p-2 text-left" aria-label="Crowd favourite" data-testid="sketch-crowd-favourite">
      <p className="flex items-center gap-1.5 font-pixel text-[9px] tracking-widest text-retro-p3">
        <PixelHeart />
        {tied ? `CROWD FAVOURITES · TIED AT ♥ ${award.count}` : 'CROWD FAVOURITE'}
      </p>
      <ul className={cn('gap-2', tied ? 'grid grid-cols-3' : 'flex')}>
        {award.entries.map(e => {
          const g = byId.get(e.key)
          return (
            <li key={e.key} className={cn('min-w-0', !tied && 'flex flex-1 items-center gap-2')}>
              {g && (
                <DrawingThumb
                  strokes={g.strokes}
                  fills={g.fills}
                  className={cn('block rounded-sm border border-retro-border', tied ? 'w-full' : 'w-20 shrink-0')}
                  label={`${g.word}, drawn by ${g.artistName}`}
                />
              )}
              <span className="block min-w-0">
                {g && <span className="block truncate font-pixel text-[10px] text-retro-text">{String(g.word).toUpperCase()}</span>}
                <span className="block truncate font-pixel text-[8px] text-retro-dim">BY {name(e.artist)}</span>
                {!tied && <span className="block font-pixel text-[8px] text-retro-p3">♥ {award.count}{of}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
