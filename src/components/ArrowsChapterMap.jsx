import { useState } from 'react'
import {
  ARROWS_CHAPTERS,
  ARROWS_LEVEL_COUNT,
  ARROWS_LEVEL_SPECS,
  isLevelUnlocked,
  isNewBoard,
  levelStars,
  nextLevel,
  totalStars,
} from '../lib/arrowsLevelsLogic'
import { ARROWS_PIECE_NAMES } from '../lib/arrowsLevelsLogic'
import { ARROWS_ENDLESS_INFO, ARROWS_TIERS } from '../lib/arrowsLogic'
import { cn } from '@/lib/utils'

// The SOLO screen of the Arrows hub: 17 chapter cards that open into their
// ten-level grid, then the ENDLESS tiers. Display and routing only — progress
// rules live in arrowsLevelsLogic.js.

export function Stars({ n, of = 3, size = 'sm', label = true }) {
  return (
    <span
      className={cn('font-pixel tracking-tight', size === 'lg' ? 'text-xl' : 'text-[9px]')}
      role={label ? 'img' : undefined}
      aria-label={label ? `${n} of ${of} stars` : undefined}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? 'text-retro-cta' : 'text-retro-structure opacity-40'}>★</span>
      ))}
    </span>
  )
}

// Pixel padlock for a locked level tile or chapter.
function LockGlyph({ className = 'w-2.5 h-3' }) {
  return (
    <svg viewBox="0 0 8 9" className={cn('fill-current', className)} aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 0h4v1h1v3h1v5H0V4h1V1h1zm0 1v3h4V1z" />
    </svg>
  )
}

const chapterStars = (progress, chapter) => {
  let n = 0
  for (let l = chapter.from; l <= chapter.to; l += 1) n += levelStars(progress, l)
  return n
}

function LevelGrid({ chapter, progress, onPlay }) {
  return (
    <div className="grid grid-cols-5 gap-2 pt-2">
      {Array.from({ length: chapter.to - chapter.from + 1 }, (_, k) => {
        const n = chapter.from + k
        const open = isLevelUnlocked(progress, n)
        const got = levelStars(progress, n)
        const intro = ARROWS_LEVEL_SPECS[n - 1].intro
        const fresh = open && isNewBoard(progress, n)
        return (
          <button
            key={n}
            onClick={() => open && onPlay(n)}
            disabled={!open}
            aria-label={open
              ? `Level ${n}${got ? `, ${got} stars` : ''}${intro ? ', new arrow type' : ''}${fresh ? ', new board' : ''}`
              : `Level ${n}, locked`}
            className={cn(
              'relative aspect-square flex flex-col items-center justify-center gap-0.5 rounded border-2 transition press',
              !open && 'border-retro-border/50 bg-retro-deep text-retro-dim/50 cursor-not-allowed',
              open && got && 'border-retro-cta/50 bg-retro-tint-cta text-retro-text',
              open && !got && 'border-retro-cta bg-retro-surface text-retro-cta shadow-neon-cta',
            )}
          >
            <span className="font-pixel text-[12px] tabular-nums">{n}</span>
            {open ? <Stars n={got} label={false} /> : <LockGlyph />}
            {open && intro && (
              <span className="absolute -top-1.5 -right-1.5 font-pixel text-[6px] px-1 py-0.5 rounded bg-retro-cta text-retro-bg">NEW</span>
            )}
            {fresh && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap font-pixel text-[5px] px-1 py-0.5 rounded bg-retro-win text-retro-bg">NEW BOARD</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function ChapterCard({ chapter, index, progress, expanded, onToggle, onPlay }) {
  const open = isLevelUnlocked(progress, chapter.from)
  const got = chapterStars(progress, chapter)
  const max = (chapter.to - chapter.from + 1) * 3
  const done = got >= max
  const panel = `arrows-chapter-${index}`
  return (
    <section aria-label={`Chapter ${index + 1}, ${chapter.name.toLowerCase()}`} className="rounded border border-retro-border bg-retro-card">
      <button
        onClick={() => open && onToggle()}
        disabled={!open}
        aria-expanded={open ? expanded : undefined}
        aria-controls={open ? panel : undefined}
        className={cn(
          'w-full min-h-14 flex items-center gap-3 px-3 py-2 text-left press-card transition',
          !open && 'text-retro-dim/60 cursor-not-allowed',
        )}
      >
        <span className={cn('font-pixel text-[11px] w-6 tabular-nums', open ? 'text-retro-cta' : 'text-retro-dim/60')}>{index + 1}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-pixel text-[9px] text-retro-text truncate">{chapter.name}</span>
          <span className="block font-mono text-[10px] text-retro-dim truncate">
            {open ? `NEW: ${ARROWS_PIECE_NAMES[chapter.piece] ?? String(chapter.piece ?? '').toUpperCase()}` : `CLEAR LEVEL ${chapter.from - 1} TO OPEN`}
          </span>
        </span>
        {open ? (
          <span className="flex flex-col items-end gap-0.5">
            <span className="font-pixel text-[8px] text-retro-dim tabular-nums"><span className="text-retro-cta">★</span> {got}/{max}</span>
            {done && <span className="font-pixel text-[6px] px-1 py-0.5 rounded bg-retro-win text-retro-bg">{max}/{max}</span>}
          </span>
        ) : (
          <LockGlyph className="w-3 h-3.5" />
        )}
      </button>
      {open && expanded && (
        <div id={panel} className="px-3 pb-3 border-t border-retro-border/50">
          <LevelGrid chapter={chapter} progress={progress} onPlay={onPlay} />
        </div>
      )}
    </section>
  )
}

function EndlessTiers({ progress, onPlayEndless }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 border-b border-retro-border/50 pb-1">
        <span className="font-pixel text-[9px] text-retro-text">ENDLESS</span>
        <span className="font-pixel text-[7px] text-retro-dim">EVERY BOARD CHECKED SOLVABLE</span>
      </div>
      {ARROWS_TIERS.map((tier) => (
        <button
          key={tier}
          onClick={() => onPlayEndless(tier)}
          className="w-full min-h-14 flex items-center gap-3 px-3 py-2 border rounded text-left press-card transition border-retro-border bg-retro-card hover:border-retro-cta/50"
        >
          <span className="font-pixel text-[10px] w-16 text-retro-cta">{ARROWS_ENDLESS_INFO[tier].label}</span>
          <span className="flex-1 font-mono text-[11px] text-retro-dim">{ARROWS_ENDLESS_INFO[tier].blurb.toLowerCase()}</span>
          <span className="font-pixel text-[8px] text-retro-dim tabular-nums">{progress.endless[tier]} CLEARED</span>
        </button>
      ))}
    </div>
  )
}

export default function ArrowsChapterMap({ progress, onPlay, onPlayEndless }) {
  const cont = nextLevel(progress)
  const currentChapter = ARROWS_CHAPTERS.findIndex((c) => cont >= c.from && cont <= c.to)
  const [expanded, setExpanded] = useState(currentChapter)
  return (
    <div className="space-y-3">
      <p className="font-pixel text-[9px] text-retro-dim">
        CAMPAIGN · <span className="text-retro-cta">★</span> {totalStars(progress)}/{ARROWS_LEVEL_COUNT * 3}
      </p>
      <div className="space-y-2">
        {ARROWS_CHAPTERS.map((chapter, i) => (
          <ChapterCard
            key={chapter.name}
            chapter={chapter}
            index={i}
            progress={progress}
            expanded={expanded === i}
            onToggle={() => setExpanded((e) => (e === i ? -1 : i))}
            onPlay={onPlay}
          />
        ))}
      </div>
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed">
        CLEAR A LEVEL TO OPEN THE NEXT · NO MISTAKES = ★★★
      </p>
      <EndlessTiers progress={progress} onPlayEndless={onPlayEndless} />
    </div>
  )
}
