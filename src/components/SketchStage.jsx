// The pieces of SKETCH's stage screen: a strip of faces, the timer ring, the
// blanks (with hint letters), guess bubbles over the drawing, the heart on the
// drawing, and the end-of-match CROWD FAVOURITE, podium and gallery. Rendering
// only; the rules are in src/lib/sketchLogic.js, src/lib/sketchStageLogic.js
// and src/lib/sketchFavesLogic.js.
import { useEffect, useRef } from 'react'
import Avatar from './Avatar'
import { DrawingThumb } from './SketchDrawing'
import { blankCells, tierMultiplier } from '../lib/sketchLogic'
import { RING_RADIUS, RING_CIRCUMFERENCE, ringState, recentBubbles, galleryFooter } from '../lib/sketchStageLogic'
import { canShareAll } from '../lib/sketchShareLogic'
import { heartAriaLabel, heartsOf, parseFaveKey } from '../lib/sketchFavesLogic'
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
        {tile.isNew && (
          <span aria-hidden="true" className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-sm bg-retro-p1 px-0.5 font-pixel text-[6px] leading-[8px] text-retro-bg" data-testid="sketch-new-badge">
            NEW
          </span>
        )}
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
  const label = `${tile.name}${mine ? ' (you)' : ''}${tile.isNew ? ', new' : ''}, ${tile.score} points${tile.role === 'solved' ? ', got it' : tile.role === 'artist' ? ', drawing' : ''}${tile.offline ? ', offline' : ''}`

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
// Heart: one per player per drawing, at the drawing's bottom-right. `view` is
// 'button' (tap to heart, tap again to take it back) or 'count' (the artist
// and spectators see the count only). Others' hearts float up from it
// (`floats`, already capped and skipped under reduced motion); `hint` shows
// TAP ♥ IF YOU LOVE IT on the match's first reveal. It sits above the replay's
// tap-to-skip layer, so hearts are open the whole reveal.
// ---------------------------------------------------------------------------
const HEART_FULL = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
const HEART_EMPTY = ['.XX.XX.', 'X..X..X', 'X.....X', '.X...X.', '..X.X..', '...X...']

export function PixelHeart({ filled, className }) {
  const rows = filled ? HEART_FULL : HEART_EMPTY
  return (
    <svg viewBox="0 0 7 6" shapeRendering="crispEdges" aria-hidden="true" className={cn('fill-current', className)}>
      {rows.flatMap((row, y) => [...row].map((ch, x) => (ch === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null)))}
    </svg>
  )
}

export function HeartButton({ view, count, mine, onToggle, busy = false, floats = [], hint = false }) {
  if (!view) return null
  const face = (
    <>
      <PixelHeart filled={mine || view === 'count'} className="h-3.5 w-4" />
      <span className="font-pixel text-[10px] tabular-nums">{count}</span>
    </>
  )
  return (
    <div className="absolute bottom-1.5 right-1.5 z-10 flex flex-col items-end" data-testid="sketch-heart">
      {floats.map((f, i) => (
        <span
          key={f.id}
          aria-hidden="true"
          className="sketch-pts-fly pointer-events-none absolute bottom-full text-retro-p3"
          style={{ right: `${8 + (i % 4) * 7}px` }}
        >
          <PixelHeart filled className="h-3 w-3.5" />
        </span>
      ))}
      {hint && (
        <span
          role="status"
          className="sketch-bubble-in pointer-events-none mb-1 whitespace-nowrap rounded border border-retro-p3 bg-retro-card px-2 py-0.5 font-pixel text-[8px] tracking-wider text-retro-p3"
          data-testid="sketch-heart-hint"
        >
          TAP ♥ IF YOU LOVE IT
        </span>
      )}
      {view === 'button' ? (
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-pressed={mine}
          aria-busy={busy || undefined}
          aria-label={heartAriaLabel(count)}
          className={cn(
            'flex min-h-11 min-w-11 items-center justify-center gap-1 rounded border-2 border-retro-p3 px-2 transition press touch-manipulation',
            mine ? 'bg-retro-p3 text-retro-bg' : 'bg-retro-card/95 text-retro-p3',
          )}
        >
          {face}
        </button>
      ) : (
        <span
          role="img"
          aria-label={`${count} heart${count === 1 ? '' : 's'}`}
          className="flex min-h-8 items-center gap-1 rounded border border-retro-p3 bg-retro-card/95 px-2 text-retro-p3"
        >
          {face}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CROWD FAVOURITE: the most-hearted drawing of the match (sketchFavesLogic's
// crowdFavourite), above the podium. Ties show up to three drawings side by
// side. A drawing this phone never saw (not in its gallery) shows as text.
// ---------------------------------------------------------------------------
export function CrowdFavourite({ award, entries, players, order }) {
  if (!award || award.keys.length === 0) return null
  const tied = award.keys.length > 1
  const byId = new Map((entries || []).map(e => [e.id, e]))
  const items = award.keys.map(key => {
    const entry = byId.get(key) || null
    const artist = parseFaveKey(key)?.artist
    const name = players?.[artist]?.name || entry?.artistName || '???'
    return { key, entry, name }
  })
  return (
    <section
      className="space-y-2 rounded border-2 border-retro-p3 bg-retro-card p-2.5"
      aria-label={tied ? `Crowd favourites, tied at ${award.hearts} hearts` : 'Crowd favourite'}
      data-testid="sketch-crowd-favourite"
    >
      <p className="flex items-center justify-center gap-1.5 font-pixel text-[10px] tracking-widest text-retro-p3 text-glow-p3">
        <PixelHeart filled className="h-3 w-3.5" />
        {tied ? `CROWD FAVOURITES · TIED AT ♥ ${award.hearts}` : 'CROWD FAVOURITE'}
      </p>
      <ul className={cn('flex justify-center gap-2', tied && 'items-start')}>
        {items.map(({ key, entry, name }) => (
          <li key={key} className={cn('min-w-0 space-y-1', tied ? 'flex-1 max-w-[33%]' : 'w-40')}>
            {entry && (
              <DrawingThumb
                strokes={entry.strokes}
                fills={entry.fills}
                className="block rounded-sm border border-retro-border"
                label={`${entry.word}, drawn by ${name}`}
              />
            )}
            {tied ? (
              <>
                {entry && <p className="truncate font-pixel text-[8px] text-retro-text">{String(entry.word).toUpperCase()}</p>}
                <p className="truncate font-pixel text-[8px] text-retro-dim">BY {name.toUpperCase()}</p>
              </>
            ) : (
              <p className="font-pixel text-[9px] text-retro-text">
                {entry ? `${String(entry.word).toUpperCase()} · ` : ''}BY {name.toUpperCase()}
              </p>
            )}
          </li>
        ))}
      </ul>
      {!tied && <p className="font-pixel text-[9px] tabular-nums text-retro-p3">{heartsOf(award.hearts, order)}</p>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// End of match: the podium, then every drawing the phone saw, swipeable.
// ---------------------------------------------------------------------------
const PODIUM_TONE = { 1: 'border-retro-win text-retro-win', 2: 'border-retro-cta text-retro-cta', 3: 'border-retro-p2 text-retro-p2' }

export function Podium({ rows, players, mySeat, lateIds = [] }) {
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
            {lateIds.includes(r.id) && <span className="block font-pixel text-[7px] tracking-wider text-retro-dim">JOINED LATE</span>}
          </span>
          <span className="font-pixel text-[11px] tabular-nums">{r.score}</span>
        </li>
      ))}
    </ol>
  )
}

// Each card opens the viewer (`onOpen`) and has its own SHARE (`onShare`,
// `sharingId` is the card being shared, `shareBusy` disables them all); the
// header's SHARE ALL (`onShareAll`) shows with two or more drawings. Without
// the handlers it is the plain gallery. `hearts` maps an entry id to its count.
export function Gallery({ entries, hearts = {}, onOpen, onShare, sharingId = null, shareBusy = false, onShareAll }) {
  if (!entries || entries.length === 0) return null
  const n = entries.length
  return (
    <section className="space-y-1.5" aria-label="This match's drawings" data-testid="sketch-gallery">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <p className="text-left font-pixel text-[9px] leading-relaxed tracking-widest text-retro-dim">THIS MATCH&apos;S DRAWINGS</p>
        {onShareAll && canShareAll(n) && (
          <button
            type="button"
            onClick={onShareAll}
            disabled={shareBusy}
            className="min-h-11 shrink-0 rounded border-2 border-retro-cta px-3 font-pixel text-[9px] text-retro-cta transition press disabled:opacity-50"
          >
            SHARE ALL {n}
          </button>
        )}
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {entries.map(e => {
          const label = `${e.word}, drawn by ${e.artistName}`
          const count = hearts[e.id] || 0
          return (
            <li key={e.id} className="w-[72%] max-w-[260px] shrink-0 snap-center space-y-1 rounded border-2 border-retro-border bg-retro-card p-1.5 text-left" data-testid="sketch-gallery-card">
              {onOpen ? (
                <button type="button" onClick={() => onOpen(e)} aria-label={`Open ${label}`} className="block w-full rounded-sm press-card">
                  <DrawingThumb strokes={e.strokes} fills={e.fills} className="block rounded-sm" label={label} />
                </button>
              ) : (
                <DrawingThumb strokes={e.strokes} fills={e.fills} className="block rounded-sm" label={label} />
              )}
              <p className="flex items-baseline justify-between gap-2 font-pixel text-[10px]">
                <span className="min-w-0 truncate text-retro-text">{String(e.word).toUpperCase()}</span>
                {count > 0 && (
                  <span className="shrink-0 text-[9px] tabular-nums text-retro-p3" aria-label={`${count} heart${count === 1 ? '' : 's'}`}>♥ {count}</span>
                )}
              </p>
              <p className="truncate font-pixel text-[8px] text-retro-dim">
                {String(e.artistName).toUpperCase()}{tierMultiplier(e.tier) > 1 ? ` · ×${tierMultiplier(e.tier)}` : ''}
              </p>
              {onShare && (
                <button
                  type="button"
                  onClick={() => onShare(e)}
                  disabled={shareBusy}
                  aria-label={sharingId === e.id ? undefined : `Share ${label}`}
                  className="min-h-11 w-full rounded border border-retro-cta font-pixel text-[9px] text-retro-cta transition press disabled:opacity-50"
                >
                  {sharingId === e.id ? 'SHARING…' : 'SHARE'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-center font-pixel text-[8px] leading-relaxed text-retro-dim">{galleryFooter(n)}</p>
    </section>
  )
}
