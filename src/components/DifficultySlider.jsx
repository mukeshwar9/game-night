import { cn } from '@/lib/utils'
import {
  FACE_SIZE, MOOD_TOKENS, faceCells, levelCopy, moodFor, stopIndex, stopPercent,
} from '../lib/difficultySliderLogic'

const KNOB_PX = 30

// Static class names so Tailwind sees them.
const MOOD_TEXT = { win: 'text-retro-win', cta: 'text-retro-cta', danger: 'text-retro-danger' }

// A pixel face that gets grumpier with the mood (see difficultySliderLogic.js).
// Ink is the page background colour, the face fill is the mood's theme colour.
export function DifficultyFace({ mood, size = 48, className }) {
  const { ink, fill } = faceCells(mood)
  const token = MOOD_TOKENS[mood] ?? MOOD_TOKENS[1]
  return (
    <svg
      viewBox={`0 0 ${FACE_SIZE} ${FACE_SIZE}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      {fill.map(({ x, y }) => (
        <rect key={`f${x},${y}`} x={x} y={y} width="1" height="1" style={{ fill: `rgb(var(--c-${token}))` }} />
      ))}
      {ink.map(({ x, y }) => (
        <rect key={`i${x},${y}`} x={x} y={y} width="1" height="1" style={{ fill: 'rgb(var(--c-bg))' }} />
      ))}
    </svg>
  )
}

// One-drag difficulty: a face, the level's name and a bar with a knob. The
// stops are the existing level ids (`levels`), so the value handed to
// `onChange` and stored by the page is unchanged. A native range input sits
// over the bar, so touch drag, tap, arrow keys, Home/End and screen readers
// all work. `note` is a line under the blurb (e.g. the player's record).
export default function DifficultySlider({
  levels, value, onChange, note, className, label = 'CPU', ariaLabel = 'CPU difficulty',
}) {
  const count = levels.length
  const index = stopIndex(levels, value)
  const mood = moodFor(index, count)
  const copy = levelCopy(levels[index])
  const pct = stopPercent(index, count)
  const token = MOOD_TOKENS[mood]

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('rounded border-2 border-retro-border bg-retro-surface px-3 py-2 space-y-2', className)}
    >
      <div className="flex items-center gap-3">
        <DifficultyFace mood={mood} size={48} className="shrink-0" />
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">{label}</p>
          <p className={cn('font-pixel text-[12px] leading-tight', MOOD_TEXT[token])}>{copy.label}</p>
          <p className="font-mono text-[10px] leading-tight text-retro-dim">{copy.blurb}</p>
          {note && <p className="font-mono text-[9px] leading-tight text-retro-dim">{note}</p>}
        </div>
      </div>
      <div className="relative h-11">
        <div
          className="absolute inset-x-0 top-[14px] h-[14px] rounded-sm border-2 border-retro-border bg-gradient-to-r from-retro-win via-retro-cta to-retro-danger"
          aria-hidden="true"
        />
        <input
          type="range"
          min={0}
          max={count - 1}
          step={1}
          value={index}
          aria-label={ariaLabel}
          aria-valuetext={copy.label.toLowerCase()}
          onChange={(e) => onChange(levels[Number(e.target.value)])}
          className={cn(
            'peer absolute inset-0 z-10 h-full w-full m-0 cursor-pointer appearance-none bg-transparent opacity-0',
            '[touch-action:pan-y]',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:w-[30px]',
            '[&::-moz-range-thumb]:h-11 [&::-moz-range-thumb]:w-[30px] [&::-moz-range-thumb]:border-0',
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[6px] h-[30px] w-[30px] rounded border-2 border-retro-text bg-retro-card shadow-[0_3px_0_rgb(var(--c-structure))] peer-focus-visible:ring-2 peer-focus-visible:ring-retro-cta"
          style={{ left: `calc(${pct}% - ${(pct * KNOB_PX) / 100}px)` }}
        />
      </div>
      <div className="flex justify-between font-pixel text-[7px] text-retro-dim" aria-hidden="true">
        {levels.map((level, i) => (
          <span key={level} className={cn(i === index && MOOD_TEXT[token])}>{levelCopy(level).label}</span>
        ))}
      </div>
    </div>
  )
}
