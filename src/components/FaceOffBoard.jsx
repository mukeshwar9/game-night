import { cn } from '@/lib/utils'
import Avatar from './Avatar'
import { GRID_COLS, QUESTIONS } from '../lib/faceoffLogic'

// Face Off table — rendering only. The page owns the round and every rule;
// this draws the two seats, the 24 faces, the question log, the six question
// buttons and the two actions.
//
// A flipped-down face is hatched, sunk and marked ×, and its name is dimmed,
// so "ruled out" never rests on colour alone. YES / NO answers are words.

// 9-wide pixel glyphs, one per question, drawn in the button's text colour.
const GLYPH = {
  hat: ['..#####..', '..#####..', '..#####..', '#########'],
  glasses: ['####.####', '#..###..#', '#..#.#..#', '####.####'],
  beard: ['#.......#', '##.....##', '.#######.', '..#####..', '...###...'],
  long: ['.#######.', '##.....##', '##.....##', '##.....##', '##.....##'],
  dark: ['.#######.', '#########', '#########', '##.....##'],
  smile: ['.#.....#.', '.........', '#.......#', '.##...##.', '...###...'],
}

function Glyph({ id }) {
  const rows = GLYPH[id]
  return (
    <svg viewBox={`0 0 9 ${rows.length}`} className="w-4.5 h-auto fill-current" style={{ width: 18 }} shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((r, y) => [...r].map((ch, x) => (ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" /> : null)))}
    </svg>
  )
}

const SEAT = {
  X: { text: 'text-retro-p1', border: 'border-retro-p1', tint: 'bg-retro-tint-p1', fill: 'bg-retro-p1' },
  O: { text: 'text-retro-p2', border: 'border-retro-p2', tint: 'bg-retro-tint-p2', fill: 'bg-retro-p2' },
}

function Answer({ value, small }) {
  return (
    <span className={cn('rounded-sm px-1 py-0.5 font-pixel text-retro-card leading-none', small ? 'text-[6px]' : 'text-[8px]', value ? 'bg-retro-win' : 'bg-retro-danger')}>
      {value ? 'YES' : 'NO'}
    </span>
  )
}

/** One seat: whose it is, their secret (yours shown, theirs a "?"), faces left on their board. */
function Seat({ side, name, secret, left, total, wins, on, mine }) {
  const c = SEAT[side]
  return (
    <div className={cn('relative flex items-center gap-1.5 rounded border-2 px-1.5 py-1 min-w-0', on ? cn(c.border, c.tint) : 'border-retro-border bg-retro-card')}>
      {on && <span className={cn('absolute -top-2 left-1 rounded-sm px-1 py-px font-pixel text-[6px] text-retro-card', c.fill)}>TURN</span>}
      {secret
        ? <Avatar id={secret.avatar} size={48} className="w-8 h-8 rounded-sm" />
        : <span className="w-8 h-8 shrink-0 rounded-sm border-2 border-dashed border-retro-structure grid place-items-center font-pixel text-xs text-retro-dim" aria-hidden="true">?</span>}
      <span className="min-w-0 flex-1 font-mono text-[10px] leading-tight">
        <span className="block truncate">{name}{wins ? ` · ${wins}` : ''}</span>
        <span className="block truncate text-[8px] text-retro-dim">{secret ? `SECRET: ${secret.name}` : mine ? 'PICK A FACE' : 'SECRET FACE'}</span>
      </span>
      <span className={cn('font-pixel text-xs text-right leading-none', c.text)} aria-label={`${left} of ${total} faces left`}>
        {left}
        <span className="block mt-0.5 text-[5px] text-retro-dim">LEFT</span>
      </span>
      <span className="absolute inset-x-1 bottom-px h-[3px] bg-retro-text/10" aria-hidden="true">
        <span className={cn('block h-full origin-left', c.fill)} style={{ transform: `scaleX(${1 - (left - 1) / (total - 1)})` }} />
      </span>
    </div>
  )
}

export default function FaceOffBoard({
  faces,
  seats,                 // { X: { name, secret, left, wins }, O: {...} }; secret is a face or null
  mySide,                // 'X' | 'O' | null (spectator)
  turn,                  // side to move, or null
  down,                  // Set of face indexes flipped down on the board shown
  highlight = null,      // Set of standing faces that would answer YES to the selected question
  mode = 'ask',          // 'pick' | 'ask' | 'name' | 'watch'
  candidate = null,      // face index tapped in pick / name mode
  onFace,
  log = [],              // newest-last [{ by, q, a }] to show (one line per side)
  asked = {},            // { questionId: 0 | 1 } my answered questions
  selected = null,
  onQuestion,
  split = null,          // { yes, no } for the selected question
  stamp = null,          // 0 | 1: the answer that just landed, shown over the grid
  primary,               // { label, sub, onClick, disabled }
  secondary,             // { label, sub, onClick, disabled }
  hint = null,
}) {
  const label = (q) => QUESTIONS.find((x) => x.id === q)?.label ?? ''
  const tappable = mode === 'pick' || mode === 'name'

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        {['X', 'O'].map((s) => (
          <Seat key={s} side={s} {...seats[s]} total={faces.length} on={turn === s} mine={mySide === s} />
        ))}
      </div>

      <div className={cn('relative rounded-lg border-2 p-1.5 shadow-[inset_0_4px_0_rgb(var(--c-text)/0.1)]', tappable ? 'border-retro-cta bg-retro-tint-cta' : 'border-retro-text bg-retro-deep')}>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}>
          {faces.map((f, i) => {
            const isDown = down.has(i)
            const yes = highlight?.has(i)
            const dimmed = highlight && !isDown && !yes
            const isCand = candidate === i
            return (
              <button
                key={i}
                type="button"
                disabled={!tappable || isDown}
                onClick={() => onFace?.(i)}
                aria-pressed={tappable ? isCand : undefined}
                aria-label={`${f.name}${isDown ? ', ruled out' : ''}${yes ? ', would answer yes' : ''}`}
                className={cn(
                  'relative block w-full overflow-hidden rounded-sm border text-left transition-opacity duration-fast',
                  isDown
                    ? 'border-retro-structure translate-y-0.5 cursor-default bg-[repeating-linear-gradient(45deg,rgb(var(--c-deep))_0_3px,rgb(var(--c-border)/0.55)_3px_6px)]'
                    : 'border-retro-text bg-retro-surface shadow-[0_3px_0_rgb(var(--c-text)/0.3)]',
                  !isDown && tappable && 'press',
                  yes && 'border-retro-cta shadow-[0_0_0_1px_rgb(var(--c-cta)),0_3px_0_rgb(var(--c-cta)/0.7)]',
                  dimmed && 'opacity-50',
                  isCand && 'border-retro-cta shadow-[0_0_0_2px_rgb(var(--c-cta)),0_0_0_4px_rgb(var(--c-card))] -translate-y-0.5 z-10',
                  !tappable && 'cursor-default',
                )}
              >
                <Avatar id={f.avatar} size={48} className={cn('block w-full h-auto', isDown && 'invisible')} />
                {isDown && <span className="absolute inset-x-0 top-[26%] text-center font-pixel text-xs text-retro-structure" aria-hidden="true">×</span>}
                {yes && <span className="absolute right-0 top-0 border-[5px] border-retro-cta border-l-transparent border-b-transparent" aria-hidden="true" />}
                <span className={cn('block text-center font-pixel text-[5px] leading-none py-0.5', isDown ? 'text-retro-structure' : 'bg-retro-card border-t border-retro-text text-retro-text')}>
                  {f.name}
                </span>
              </button>
            )
          })}
        </div>
        {stamp != null && (
          <div
            role="status"
            className={cn(
              'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-6 rounded-md border-4 bg-retro-card/90 px-3 py-2 font-pixel text-2xl leading-none pointer-events-none',
              stamp ? 'border-retro-win text-retro-win' : 'border-retro-danger text-retro-danger',
            )}
            style={{ animation: 'place-pop 0.3s ease-out both' }}
          >
            {stamp ? 'YES!' : 'NO!'}
          </div>
        )}
      </div>

      {/* The last question each player asked, with its answer */}
      <div className="space-y-1 min-h-6">
        {log.length === 0 && <p className="font-pixel text-[7px] text-retro-dim text-center py-1.5">NO QUESTIONS ASKED YET</p>}
        {log.map((l) => (
          <div key={`${l.by}-${l.q}`} className="flex items-center gap-1.5 rounded border border-retro-border bg-retro-surface px-1.5 py-1 font-pixel text-[7px]">
            <span className={SEAT[l.by].text}>{seats[l.by].name.toUpperCase()}</span>
            <span className="flex-1 truncate">{label(l.q)}</span>
            {l.a == null ? <span className="text-retro-dim">…</span> : <Answer value={l.a} />}
          </div>
        ))}
      </div>

      {mode !== 'pick' && (
        <div className="grid grid-cols-3 gap-1">
          {QUESTIONS.map((q) => {
            const used = asked[q.id] != null
            const isSel = selected === q.id
            return (
              <button
                key={q.id}
                type="button"
                disabled={used || mode !== 'ask' || !onQuestion}
                onClick={() => onQuestion?.(q.id)}
                aria-pressed={isSel}
                aria-label={used ? `${q.label} asked, answer ${asked[q.id] ? 'yes' : 'no'}` : q.label}
                className={cn(
                  'relative grid place-items-center content-center gap-1 h-10 rounded border font-pixel text-[6px] transition',
                  used ? 'border-retro-border bg-retro-deep text-retro-structure translate-y-0.5 cursor-default'
                    : isSel ? 'border-2 border-retro-cta bg-retro-tint-cta text-retro-cta shadow-[0_3px_0_rgb(var(--c-cta)/0.6)]'
                      : 'border-retro-text bg-retro-card text-retro-text shadow-[0_3px_0_rgb(var(--c-structure))] press disabled:opacity-55',
                )}
              >
                <Glyph id={q.id} />
                <span>{q.label}</span>
                {used && <span className="absolute -right-0.5 -top-1.5"><Answer value={asked[q.id]} small /></span>}
              </button>
            )
          })}
        </div>
      )}

      <p className="text-center font-pixel text-[7px] leading-none min-h-2.5" role="status">
        {mode === 'name'
          ? <><span className="text-retro-danger">ONE GUESS.</span> RIGHT WINS · WRONG LOSES</>
          : split
            ? <><span className="text-retro-win">YES</span> KEEPS {split.yes} · <span className="text-retro-danger">NO</span> KEEPS {split.no}</>
            : <span className="text-retro-dim">{hint}</span>}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {[primary, secondary].map((b, k) => (b ? (
          <button
            key={k}
            type="button"
            onClick={b.onClick}
            disabled={b.disabled}
            className={cn(
              'min-h-12 rounded border-2 border-retro-cta font-pixel text-[10px] press disabled:opacity-45 disabled:shadow-none',
              k === 0 && !b.disabled ? 'bg-retro-cta text-retro-card shadow-[0_4px_0_rgb(var(--c-text)/0.55)]' : 'bg-retro-card text-retro-cta shadow-[0_4px_0_rgb(var(--c-cta)/0.55)]',
              !secondary && 'col-span-2',
            )}
          >
            {b.label}
            {b.sub && <span className={cn('block text-[7px] mt-1', k === 0 && !b.disabled ? 'text-retro-tint-cta' : 'text-retro-dim')}>{b.sub}</span>}
          </button>
        ) : null))}
      </div>
    </div>
  )
}
