import { useEffect, useMemo, useRef, useState } from 'react'
import ArrowsBoard from '../components/ArrowsBoard'
import { Lives } from '../components/ArrowsHud'
import ArrowsLesson from '../components/ArrowsLesson'
import ArrowTypes from '../components/ArrowTypes'
import BottomSheet from '../components/BottomSheet'
import { getLesson } from '../lib/arrowsLessonsLogic'
import ArrowsDemo from './ArrowsDemo'
import {
  applyArrowTap,
  countGone,
  freeArrows,
  randomArrowsSeed,
  ARROWS_ENDLESS_INFO,
  ARROWS_LIVES,
  ARROWS_TIERS,
} from '../lib/arrowsLogic'
import {
  ARROWS_CHAPTERS,
  ARROWS_LEVEL_COUNT,
  ARROWS_LEVEL_SPECS,
  ARROWS_TWIST_TIPS,
  endlessLevel,
  getArrowsLevel,
  isLevelUnlocked,
  levelStars,
  newTwist,
  nextLevel,
  recordEndlessClear,
  recordLevelResult,
  starsFor,
  totalStars,
  twistsIn,
} from '../lib/arrowsLevelsLogic'
import {
  markTwistSeen,
  readArrowsProgress,
  readSeenTwists,
  saveArrowsProgress,
  syncArrowsProgress,
} from '../lib/arrowsProgress'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Arrows solo (/solo/arrows). No AI in the first two modes:
//   LEVELS  — a 100-level campaign that gets steadily harder, with stars,
//             locks and progress saved on the device and the account; the
//             first board with a new arrow kind opens with a short lesson;
//   ENDLESS — unlimited generated boards at easy / medium / hard;
//   VS BOT  — the original practice race against a bot (ArrowsDemo).

const TABS = [
  { id: 'levels', label: 'LEVELS' },
  { id: 'endless', label: 'ENDLESS' },
  { id: 'race', label: 'VS BOT' },
]
const BTN = 'min-h-11 px-4 py-2.5 font-pixel text-[10px] rounded transition press'
const CTA = cn(BTN, 'bg-retro-cta text-retro-bg hover:shadow-neon-cta')
const SEC = cn(BTN, 'border border-retro-border text-retro-dim hover:border-retro-cta/50 hover:text-retro-text')

function Stars({ n, of = 3, size = 'sm', label = true }) {
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

// Pixel padlock for a locked level tile.
function LockGlyph() {
  return (
    <svg viewBox="0 0 8 9" className="w-2.5 h-3 fill-current" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 0h4v1h1v3h1v5H0V4h1V1h1zm0 1v3h4V1z" />
    </svg>
  )
}

function LevelSelect({ progress, onPlay }) {
  const stars = totalStars(progress)
  const cont = nextLevel(progress)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-pixel text-[9px] text-retro-dim">
          <span className="text-retro-cta">★</span> {stars}/{ARROWS_LEVEL_COUNT * 3}
        </span>
        <button onClick={() => onPlay(cont)} className={CTA}>
          {levelStars(progress, cont) ? `REPLAY ${cont}` : cont === 1 ? 'START LEVEL 1' : `CONTINUE · LEVEL ${cont}`}
        </button>
      </div>
      {ARROWS_CHAPTERS.map((chapter, c) => {
        let chapterStars = 0
        for (let n = chapter.from; n <= chapter.to; n += 1) chapterStars += levelStars(progress, n)
        return (
          <section key={chapter.name} aria-label={`Chapter ${c + 1}, ${chapter.name.toLowerCase()}`} className="space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-retro-border/50 pb-1">
              <span className="font-pixel text-[8px] text-retro-text">{c + 1} · {chapter.name}</span>
              <span className="font-pixel text-[8px] text-retro-dim tabular-nums">
                <span className="text-retro-cta">★</span> {chapterStars}/{(chapter.to - chapter.from + 1) * 3}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: chapter.to - chapter.from + 1 }, (_, k) => {
                const n = chapter.from + k
                const open = isLevelUnlocked(progress, n)
                const got = levelStars(progress, n)
                const intro = ARROWS_LEVEL_SPECS[n - 1].intro
                return (
                  <button
                    key={n}
                    onClick={() => open && onPlay(n)}
                    disabled={!open}
                    aria-label={open ? `Level ${n}${got ? `, ${got} stars` : ''}${intro ? ', new arrow type' : ''}` : `Level ${n}, locked`}
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
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed">
        CLEAR A LEVEL TO OPEN THE NEXT · NO MISTAKES = ★★★
      </p>
    </div>
  )
}

function EndlessSelect({ progress, onPlay }) {
  return (
    <div className="space-y-2">
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed">
        A FRESH BOARD EVERY TIME — EVERY ONE CHECKED SOLVABLE
      </p>
      {ARROWS_TIERS.map((tier) => (
        <button
          key={tier}
          onClick={() => onPlay(tier)}
          className="w-full min-h-14 flex items-center gap-3 px-3 py-2 border border-retro-border rounded bg-retro-card hover:border-retro-cta/50 text-left press-card transition"
        >
          <span className="font-pixel text-[10px] text-retro-cta w-16">{ARROWS_ENDLESS_INFO[tier].label}</span>
          <span className="flex-1 font-mono text-[11px] text-retro-dim">{ARROWS_ENDLESS_INFO[tier].blurb.toLowerCase()}</span>
          <span className="font-pixel text-[8px] text-retro-dim tabular-nums">{progress.endless[tier]} CLEARED</span>
        </button>
      ))}
    </div>
  )
}

// One puzzle board: lives, live star rating, hint and restart. Calls
// onCleared(stars) once when the board is empty.
// `intro` (a twist key) keeps that twist's tip up on its teaching level even
// on a replay. `tips` off silences the twist lesson/tip (endless boards teach
// nothing — the "?" sheet is always there for a reminder).
function PuzzlePlay({ level, title, subtitle, intro = null, tips = true, onCleared, onRestart, onBack, backLabel = 'BACK', next }) {
  const total = level.arrows.length
  const [gone, setGone] = useState(() => Array(total).fill(false))
  const [lives, setLives] = useState(ARROWS_LIVES)
  const [mistakes, setMistakes] = useState(0)
  const [hints, setHints] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [hint, setHint] = useState(null)
  const [result, setResult] = useState(null)
  const [seen] = useState(readSeenTwists)
  // The first board with a kind the player has not been taught opens with
  // that kind's lesson; "?" reopens the arrow types (each with TRY IT).
  const [lesson, setLesson] = useState(() => {
    if (!tips) return null
    const t = newTwist(level, seen)
    return getLesson(t) ? t : null
  })
  const [showTypes, setShowTypes] = useState(false)
  const streak = useRef(0)

  const twist = tips ? (newTwist(level, seen) ?? intro) : null
  useEffect(() => {
    // Kinds without a lesson count as taught by the tip alone.
    if (twist && !getLesson(twist)) markTwistSeen(twist)
  }, [twist])

  const closeLesson = () => {
    markTwistSeen(lesson)
    setLesson(null)
  }

  const handleTap = (index) => {
    if (result) return
    const applied = applyArrowTap(level, gone, lives, index)
    if (!applied) return
    setHint(null)
    if (applied.result === 'blocked') {
      streak.current = 0
      setLives(applied.lives)
      setMistakes((m) => m + 1)
      setFeedback({ index, blocker: applied.blocker, gap: applied.gap, asleep: applied.asleep, crate: applied.crate, wall: applied.wall, key: Date.now() })
      sounds.buzz()
      if (applied.lives <= 0) {
        setResult({ stars: 0 })
        sounds.lose()
      }
      return
    }
    setGone(applied.gone)
    sounds.hit(Math.min(streak.current, 8))
    streak.current += 1
    if (countGone(applied.gone) >= total) {
      const stars = starsFor({ mistakes, hints })
      setResult({ stars })
      sounds.win()
      onCleared(stars)
    }
  }

  const showHint = () => {
    const open = freeArrows(level, gone)
    if (!open.length || result) return
    // The free arrow nearest the start of the solve order is the most useful
    // nudge; any free arrow is a correct move.
    setHint({ index: open[0], key: Date.now() })
    setHints((h) => h + 1)
  }

  const potential = starsFor({ mistakes, hints })

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="min-h-11 -ml-2 px-2 font-pixel text-[9px] text-retro-dim hover:text-retro-text">‹ BACK</button>
        <div className="text-center min-w-0">
          <p className="font-pixel text-[10px] text-retro-text tracking-wider">{title}</p>
          <p className="font-pixel text-[8px] text-retro-dim mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowTypes(true)}
            aria-label="Arrow types"
            title="Arrow types"
            className="min-h-11 min-w-11 -my-1 flex items-center justify-center text-retro-dim hover:text-retro-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
          <Lives n={lives} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-pixel text-[8px] text-retro-dim tabular-nums">{countGone(gone)}/{total} CLEARED</span>
        <Stars n={potential} />
        <div className="flex gap-1.5">
          <button onClick={showHint} disabled={!!result} className={cn(SEC, 'min-h-9 px-2.5 py-1.5 text-[8px]')}>HINT</button>
          <button onClick={onRestart} className={cn(SEC, 'min-h-9 px-2.5 py-1.5 text-[8px]')}>RESTART</button>
        </div>
      </div>
      {twist && (
        <p className="font-pixel text-[8px] text-retro-cta leading-relaxed text-center" role="note">{ARROWS_TWIST_TIPS[twist]}</p>
      )}
      <div className="relative">
        <ArrowsBoard
          level={level}
          gone={gone}
          onTap={handleTap}
          zoomable
          interactive={!result && !lesson}
          feedback={feedback}
          hint={hint}
          label={`${title} board, ${total - countGone(gone)} arrows left`}
        />
        {result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-retro-bg/85 rounded-lg px-4 text-center">
            {result.stars > 0 ? (
              <>
                <p className="font-pixel text-sm text-retro-win text-glow-win">BOARD CLEAR!</p>
                <Stars n={result.stars} size="lg" />
                <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">
                  {mistakes === 0 ? 'NO MISTAKES' : `${mistakes} MISTAKE${mistakes > 1 ? 'S' : ''}`}
                  {hints > 0 ? ` · ${hints} HINT${hints > 1 ? 'S' : ''}` : ''}
                </p>
              </>
            ) : (
              <p className="font-pixel text-sm text-retro-dim">OUT OF LIVES</p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {result.stars > 0 && next && <button onClick={next.onClick} className={CTA}>{next.label}</button>}
              <button onClick={onRestart} className={result.stars > 0 && next ? SEC : CTA}>{result.stars > 0 ? 'REPLAY' : 'RETRY'}</button>
              <button onClick={onBack} className={SEC}>{backLabel}</button>
            </div>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {result ? (result.stars > 0 ? `Board clear, ${result.stars} stars.` : 'Out of lives.') : `${countGone(gone)} of ${total} cleared, ${lives} lives.`}
      </p>
      {lesson && (
        <BottomSheet onClose={closeLesson} ariaLabel={`${getLesson(lesson).name} lesson`}>
          <ArrowsLesson kind={lesson} onDone={closeLesson} doneLabel={`PLAY ${title.split(' /')[0]}`} badge="NEW ARROW" />
        </BottomSheet>
      )}
      {showTypes && (
        <BottomSheet onClose={() => setShowTypes(false)} ariaLabel="Arrow types">
          <div className="space-y-3">
            <ArrowTypes highlight={twistsIn(level)} />
            <button onClick={() => setShowTypes(false)} className={cn(SEC, 'w-full')}>BACK TO THE BOARD</button>
          </div>
        </BottomSheet>
      )}
    </div>
  )
}

export default function ArrowsSolo() {
  const [tab, setTab] = useState('levels')
  const [progress, setProgress] = useState(readArrowsProgress)
  // { kind: 'level', n } | { kind: 'endless', tier, seed }; `attempt` remounts
  // the board on RESTART.
  const [play, setPlay] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    syncArrowsProgress().then((p) => { if (live) setProgress(p) })
    return () => { live = false }
  }, [])

  const level = useMemo(() => {
    if (!play) return null
    return play.kind === 'level' ? getArrowsLevel(play.n) : endlessLevel(play.seed, play.tier)
  }, [play])

  const start = (next) => { setPlay(next); setAttempt((a) => a + 1) }
  const back = () => setPlay(null)

  if (play && level) {
    if (play.kind === 'level') {
      const n = play.n
      const hasNext = n < ARROWS_LEVEL_COUNT
      return (
        <PuzzlePlay
          key={`level-${n}-${attempt}`}
          level={level}
          title={`LEVEL ${n} / ${ARROWS_LEVEL_COUNT}`}
          subtitle={`${level.cols}×${level.rows} · ${level.arrows.length} ARROWS`}
          onCleared={(stars) => setProgress((p) => saveArrowsProgress(recordLevelResult(p, n, stars)))}
          onRestart={() => setAttempt((a) => a + 1)}
          intro={ARROWS_LEVEL_SPECS[n - 1].intro ?? null}
          onBack={back}
          backLabel="LEVELS"
          next={hasNext ? { label: `LEVEL ${n + 1} →`, onClick: () => start({ kind: 'level', n: n + 1 }) } : null}
        />
      )
    }
    const { tier } = play
    return (
      <PuzzlePlay
        key={`endless-${play.seed}-${attempt}`}
        level={level}
        title={`ENDLESS · ${ARROWS_ENDLESS_INFO[tier].label}`}
        subtitle={`${level.arrows.length} ARROWS · ${progress.endless[tier]} CLEARED`}
        tips={false}
        onCleared={() => setProgress((p) => saveArrowsProgress(recordEndlessClear(p, tier)))}
        onRestart={() => setAttempt((a) => a + 1)}
        onBack={back}
        next={{ label: 'NEXT BOARD →', onClick: () => start({ kind: 'endless', tier, seed: randomArrowsSeed() }) }}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 border-2 border-retro-border rounded overflow-hidden" role="tablist" aria-label="Arrows solo mode">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('min-h-11 py-2 font-pixel text-[9px]', tab === t.id ? 'bg-retro-cta text-retro-bg' : 'text-retro-dim hover:text-retro-text')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'levels' && <LevelSelect progress={progress} onPlay={(n) => start({ kind: 'level', n })} />}
      {tab === 'endless' && (
        <EndlessSelect progress={progress} onPlay={(tier) => start({ kind: 'endless', tier, seed: randomArrowsSeed() })} />
      )}
      {tab === 'race' && <ArrowsDemo />}
    </div>
  )
}
