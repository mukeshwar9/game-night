import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import ArrowsBoard from '../components/ArrowsBoard'
import ArrowsChapterMap from '../components/ArrowsChapterMap'
import ArrowsRaceSetup from '../components/ArrowsRaceSetup'
import ArrowsRewardMeter from '../components/ArrowsRewardMeter'
import ArrowsMiniBoard from '../components/ArrowsMiniBoard'
import ArrowsLesson from '../components/ArrowsLesson'
import ArrowTypes from '../components/ArrowTypes'
import BottomSheet from '../components/BottomSheet'
import RulesModal from '../components/LazyRulesModal'
import { getLesson } from '../lib/arrowsLessonsLogic'
import { routeCoach } from '../lib/arrowsPeekLogic'
import { bestHintArrow } from '../lib/arrowsHintLogic'
import {
  applyArrowTap,
  countGone,
  exitCheck,
  randomArrowsSeed,
  ARROWS_ENDLESS_INFO,
} from '../lib/arrowsLogic'
import {
  ARROWS_CHAPTERS,
  ARROWS_LEVEL_COUNT,
  ARROWS_LEVEL_SPECS,
  ARROWS_TWIST_TIPS,
  chapterCleared,
  endlessLevel,
  getArrowsLevel,
  learnedPieces,
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
import { REWARD_SEEN_KEY, parseRewardSeen, stepsToAnnounce } from '../lib/arrowsRewardsLogic'
import { sounds } from '../lib/sounds'
import { melodicNote } from '../lib/arrowsSoundLogic'
import { track } from '../lib/track'
import { cn } from '@/lib/utils'

// The guided 19-lesson track is a separate chunk, opened from the hub.
const ArrowsTutorial = lazy(() => import('../components/ArrowsTutorial'))
// The reward reveal only ever opens after a step is reached.
const ArrowsRewardSheet = lazy(() => import('../components/ArrowsRewardSheet'))

// Arrows hub (/solo/arrows): CONTINUE (or START HERE for a first visit), then
//   SOLO      — the chapter map (a 170-level campaign with stars, locks and
//               progress saved on the device and the account; the first board
//               with a new arrow kind opens with a short lesson) and ENDLESS
//               boards at easy / medium / hard, tiers opening with the campaign;
//   2 PLAYERS — race settings, then a friend, a quick match or AI racers (Arrows Party);
//   TUTORIAL and HOW TO PLAY.

const BTN = 'min-h-11 px-4 py-2.5 font-pixel text-[10px] rounded transition press'
const CTA = cn(BTN, 'bg-retro-cta text-retro-bg hover:shadow-neon-cta')
const SEC = cn(BTN, 'border border-retro-border text-retro-dim hover:border-retro-cta/50 hover:text-retro-text')
const TUTORIAL_KEY = 'arrows-tutorial-started'

const tutorialStarted = () => { try { return localStorage.getItem(TUTORIAL_KEY) === '1' } catch { return false } }
// Highest reward step (in stars) already announced on this device. Not one of the
// synced per-account caches (playerCache.js), so a different account on the same
// device simply sees nothing new until it passes that step.
const readRewardSeen = () => { try { return parseRewardSeen(localStorage.getItem(REWARD_SEEN_KEY)) } catch { return 0 } }
const writeRewardSeen = (stars) => { try { localStorage.setItem(REWARD_SEEN_KEY, String(stars)) } catch { /* private mode */ } }

const markTutorialStarted = () => { try { localStorage.setItem(TUTORIAL_KEY, '1') } catch { /* private mode */ } }

// Endless boards generated ahead of time (see the idle prefetch in ArrowsSolo),
// keyed by tier, seed and the pieces the player has learned.
const endlessCache = new Map()
const endlessKey = (tier, seed, learned) => `${tier}:${seed}:${learned.join(',')}`
function endlessBoard(tier, seed, learned) {
  const key = endlessKey(tier, seed, learned)
  let level = endlessCache.get(key)
  if (!level) {
    level = endlessLevel(seed, tier, learned)
    endlessCache.set(key, level)
    if (endlessCache.size > 6) endlessCache.delete(endlessCache.keys().next().value)
  }
  return level
}

// Run `fn` when the browser is idle (a timeout where requestIdleCallback is
// missing); returns the cancel function.
function whenIdle(fn) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: 4000 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(fn, 250)
  return () => clearTimeout(id)
}

function HubCard({ top, main, sub, extra = null, onClick, cta = false, className }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex flex-col items-start gap-1 px-3 py-3 rounded border text-left transition press-card',
        cta ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta' : 'border-retro-border bg-retro-card hover:border-retro-cta/50',
        className,
      )}
    >
      <span className="font-pixel text-[8px] text-retro-dim">{top}</span>
      <span className={cn('font-pixel text-sm', cta ? 'text-retro-cta' : 'text-retro-text')}>{main}</span>
      <span className="font-mono text-[11px] text-retro-dim">{sub}</span>
      {extra}
    </button>
  )
}

function Hub({ progress, onContinue, onView, onRules }) {
  const first = totalStars(progress) === 0 && !tutorialStarted()
  const cont = nextLevel(progress)
  const chapter = ARROWS_CHAPTERS.find((c) => cont >= c.from && cont <= c.to)
  const contLevel = getArrowsLevel(cont)
  const got = levelStars(progress, cont)
  const stars = totalStars(progress)
  return (
    <div className="space-y-3">
      {first ? (
        <HubCard cta top="NEW TO ARROWS?" main="START HERE · TUTORIAL" sub="a short guided tutorial, then level 1" onClick={() => onView('tutorial')} />
      ) : (
        <div className="rounded border border-retro-cta bg-retro-tint-cta shadow-neon-cta p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2 font-pixel text-[8px]">
            <span className="text-retro-cta">CONTINUE</span>
            {chapter && <span className="text-retro-dim">CHAPTER {ARROWS_CHAPTERS.indexOf(chapter) + 1} · {chapterCleared(progress, chapter)}/{chapter.to - chapter.from + 1}</span>}
          </div>
          <div className="flex items-start gap-3.5">
            {contLevel && (
              <div className="shrink-0 w-[104px] h-[132px] rounded border-2 border-retro-border bg-retro-card p-1.5">
                <ArrowsMiniBoard level={contLevel} className="block w-full h-full" />
              </div>
            )}
            <div className="min-w-0 space-y-1.5">
              <p className="font-pixel text-lg text-retro-text">LEVEL {cont}</p>
              <p className="font-pixel text-[10px] text-retro-dim">{chapter ? `${chapter.name} · ` : ''}{contLevel ? `${contLevel.cols}×${contLevel.rows}` : ''}</p>
              <p className="font-pixel text-base leading-none"><span className={got ? 'text-retro-cta' : 'text-retro-structure opacity-40'}>★</span><span className={got > 1 ? 'text-retro-cta' : 'text-retro-structure opacity-40'}>★</span><span className={got > 2 ? 'text-retro-cta' : 'text-retro-structure opacity-40'}>★</span></p>
              <p className="font-pixel text-[8px] text-retro-dim">{got ? `BEST ${'★'.repeat(got)} · REPLAY` : 'NOT CLEARED YET'}</p>
            </div>
          </div>
          <button onClick={onContinue} className={cn(CTA, 'w-full min-h-12 text-xs')}>PLAY</button>
        </div>
      )}
      {!first && (
        <div className="rounded border border-retro-border bg-retro-card p-3">
          <p className="font-pixel text-[8px] text-retro-dim">NEXT REWARD</p>
          <ArrowsRewardMeter stars={stars} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <HubCard top="1 PLAYER" main="CHAPTERS" sub={`${stars}/${ARROWS_LEVEL_COUNT * 3} ★ · endless`} onClick={() => onView('solo')} />
        <HubCard top="VS" main="2 PLAYERS" sub="friend · quick match · AI racers" onClick={() => onView('two')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {!first && <button onClick={() => onView('tutorial')} className={SEC}>TUTORIAL</button>}
        <button onClick={onRules} className={cn(SEC, first && 'col-span-2')}>HOW TO PLAY</button>
      </div>
    </div>
  )
}

function SubHeader({ title, onBack }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onBack} className="min-h-11 -ml-2 px-2 font-pixel text-[9px] text-retro-dim hover:text-retro-text">‹ ARROWS</button>
      <p className="font-pixel text-[10px] text-retro-text tracking-wider">{title}</p>
    </div>
  )
}

// Set after a session's first bump: the line under the board then points at
// ROUTES (once per page load, until it is switched on).
let routesNudged = false

const eyeIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const bulbIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
  </svg>
)
const redoIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
  </svg>
)

// The three stars at the top of the board: what the board is still worth. They
// only ever drain (a bump or a hint), and the one just lost drops a size.
function StarMeter({ n }) {
  return (
    <span className="flex gap-0.5 font-pixel text-lg leading-none" role="img" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span
          key={`${i}-${n}`}
          aria-hidden="true"
          className={cn(i < n ? 'text-retro-cta' : 'text-retro-structure opacity-40', i === n && 'ar-star-lost')}
        >★</span>
      ))}
    </span>
  )
}

// A cleared board's stars stamp in one at a time.
function StampStars({ n }) {
  return (
    <span className="flex gap-2.5 font-pixel text-4xl leading-none" role="img" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={i < n ? 'ar-stamp text-retro-cta' : 'text-retro-structure opacity-40'}
          style={{ '--i': i }}
        >★</span>
      ))}
    </span>
  )
}

const THUMB = 'min-h-12 flex-1 flex items-center justify-center gap-2 px-2 font-pixel text-[9px] rounded border transition press'

// One puzzle board on its own full-height stage: a slim top bar (back, level,
// the three stars), the board edge to edge, and a thumb bar with HINT, ROUTES
// and RESTART. A blocked tap costs a star, never the board: a cleared board is
// always worth at least one. Calls onCleared(stars) once when the board is empty.
// `intro` (a twist key) keeps that twist's tip up on its teaching level even
// on a replay. `tips` off silences the twist lesson/tip (endless boards teach
// nothing — the "?" sheet is always there for a reminder).
function PuzzlePlay({ level, title, subtitle, intro = null, tips = true, onCleared, onRestart, onBack, backLabel = 'BACK', next, resultTag = null, nextProgress = null }) {
  const total = level.arrows.length
  const [gone, setGone] = useState(() => Array(total).fill(false))
  const [mistakes, setMistakes] = useState(0)
  const [hints, setHints] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [hint, setHint] = useState(null)
  const [result, setResult] = useState(null)
  // { before, after } total stars around this clear (campaign only).
  const [reward, setReward] = useState(null)
  const [seen] = useState(readSeenTwists)
  // ROUTES mode, the previewed arrow, and the nudge after this session's first bump.
  const [routes, setRoutes] = useState(false)
  const [routePick, setRoutePick] = useState(-1)
  const [nudge, setNudge] = useState(false)
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
    // Solo has no lives: a blocked tap costs a star (mistakes), never the board.
    const applied = applyArrowTap(level, gone, Infinity, index)
    if (!applied) return
    setHint(null)
    setRoutePick(-1)
    if (applied.result === 'blocked') {
      streak.current = 0
      setMistakes((m) => m + 1)
      setFeedback({ index, blocker: applied.blocker, gap: applied.gap, asleep: applied.asleep, crate: applied.crate, wall: applied.wall, key: Date.now() })
      sounds.buzz()
      if (!routesNudged) {
        routesNudged = true
        setNudge(true)
      }
      return
    }
    setGone(applied.gone)
    sounds.hitNote(melodicNote(streak.current), streak.current)
    streak.current += 1
    if (countGone(applied.gone) >= total) {
      const stars = starsFor({ mistakes, hints })
      setResult({ stars })
      setNudge(false)
      sounds.win()
      const r = onCleared(stars)
      if (r) setReward(r)
    }
  }

  const showHint = () => {
    // The free arrow that opens the most blocked ones (arrowsHintLogic.js).
    const index = bestHintArrow(level, gone)
    if (index === null || result) return
    setHint({ index, key: Date.now() })
    setHints((h) => h + 1)
  }

  const toggleRoutes = () => {
    setRoutes((on) => !on)
    setRoutePick(-1)
    setNudge(false)
  }

  const potential = starsFor({ mistakes, hints })
  const left = total - countGone(gone)
  const pick = routes && routePick >= 0 && !gone[routePick] ? { free: exitCheck(level, gone, routePick).free } : null
  const coach = result ? null : routeCoach({ routes, pick, nudge, tip: twist ? ARROWS_TWIST_TIPS[twist] : '' })

  // The result lies over the board.
  const resultPanel = result && (
    <div className="absolute inset-0 flex items-center justify-center px-4 bg-retro-bg/70 rounded-lg">
      <div className="w-full max-w-xs flex flex-col items-center gap-3 rounded-lg border-2 border-retro-border bg-retro-card px-4 py-5 text-center">
        {resultTag && <p className="font-pixel text-[9px] text-retro-dim">{resultTag}</p>}
        <p className="font-pixel text-base text-retro-win text-glow-win">BOARD CLEAR</p>
        <StampStars n={result.stars} />
        <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">
          {mistakes === 0 ? 'NO BUMPS' : `${mistakes} BUMP${mistakes > 1 ? 'S' : ''}`}
          {' · '}
          {hints > 0 ? `${hints} HINT${hints > 1 ? 'S' : ''}` : 'NO HINTS'}
        </p>
        {reward && (
          <div className="w-full space-y-1">
            <ArrowsRewardMeter stars={reward.after} />
            {reward.after > reward.before && <p className="font-pixel text-[9px] text-retro-cta">+{reward.after - reward.before}★ ADDED</p>}
          </div>
        )}
        {nextProgress && <p className="font-pixel text-[8px] text-retro-dim">{nextProgress}</p>}
        <div className="w-full flex flex-col gap-2 ar-stamp" style={{ '--i': 3 }}>
          {next && <button onClick={next.onClick} className={cn(CTA, 'w-full')}>{next.label}</button>}
          <button onClick={onRestart} className={cn(next ? SEC : CTA, 'w-full')}>{result.stars < 3 ? 'RETRY FOR ★★★' : 'REPLAY'}</button>
          <button onClick={onBack} className={cn(SEC, 'w-full')}>{backLabel}</button>
        </div>
      </div>
    </div>
  )

  const topBar = (
    <div className="flex items-center gap-1 min-w-0">
      <button onClick={onBack} aria-label={backLabel === 'BACK' ? 'Back' : 'Back to the chapters'} className="min-h-11 min-w-11 -ml-1 flex items-center justify-center font-pixel text-xl text-retro-dim hover:text-retro-text">‹</button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-pixel text-[11px] text-retro-text tracking-wider">{title}</p>
        <p className="truncate font-pixel text-[8px] text-retro-dim mt-0.5">{left} LEFT · {subtitle}</p>
      </div>
      <button
        onClick={() => setShowTypes(true)}
        aria-label="Arrow types"
        title="Arrow types"
        className="min-h-11 min-w-11 flex items-center justify-center text-retro-dim hover:text-retro-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      <StarMeter n={potential} />
    </div>
  )

  const thumbBar = (
    <div className="space-y-1.5 pb-1">
      <p
        className={cn(
          'h-14 overflow-hidden flex items-center justify-center px-2 text-center font-pixel text-[8px] leading-snug',
          coach?.tone === 'win' && 'text-retro-win',
          coach?.tone === 'danger' && 'text-retro-danger',
          coach?.tone === 'cta' && 'text-retro-cta',
          (!coach || coach.tone === 'dim') && 'text-retro-dim',
        )}
        role="note"
      >
        {coach?.text ?? ''}
      </p>
      <div className="flex gap-2">
        <button onClick={showHint} disabled={!!result} className={cn(THUMB, 'border-retro-border text-retro-text hover:border-retro-cta/50')}>
          {bulbIcon}HINT{hints > 0 ? ` ${hints}` : ''}
        </button>
        <button
          onClick={toggleRoutes}
          disabled={!!result}
          aria-pressed={routes}
          className={cn(
            THUMB,
            routes ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-text hover:border-retro-cta/50',
            nudge && !routes && 'ar-nudge border-retro-cta text-retro-cta',
          )}
        >
          {eyeIcon}ROUTES
        </button>
        <button onClick={onRestart} className={cn(THUMB, 'border-retro-border text-retro-text hover:border-retro-cta/50')}>
          {redoIcon}RESTART
        </button>
      </div>
    </div>
  )

  return (
    <>
      <ArrowsBoard
        level={level}
        gone={gone}
        onTap={handleTap}
        zoomable
        peek
        stage
        routes={routes}
        routePick={routePick}
        onRoutePick={setRoutePick}
        interactive={!result && !lesson}
        feedback={feedback}
        hint={hint}
        label={`${title} board, ${left} arrows left`}
        focusHud={topBar}
        stageFooter={thumbBar}
        focusOverlay={resultPanel || null}
      />
      <p className="sr-only" aria-live="polite">
        {result ? `Board clear, ${result.stars} stars.` : `${countGone(gone)} of ${total} cleared, ${potential} of 3 stars left.`}
      </p>
      {lesson && (
        <BottomSheet onClose={closeLesson} ariaLabel={`${getLesson(lesson).name} lesson`}>
          <ArrowsLesson kind={lesson} onDone={closeLesson} doneLabel={`PLAY ${title.split(' ·')[0]}`} badge="NEW ARROW" />
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
    </>
  )
}

export default function ArrowsSolo() {
  const [view, setView] = useState('hub')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [progress, setProgress] = useState(readArrowsProgress)
  // { kind: 'level', n } | { kind: 'endless', tier, seed, nextSeed, learned };
  // `attempt` remounts the board on RESTART.
  const [play, setPlay] = useState(null)
  const [attempt, setAttempt] = useState(0)
  // Reward steps to reveal (an array of ladder steps) in the sheet, or null.
  const [reveal, setReveal] = useState(null)
  const revealTimer = useRef(null)
  useEffect(() => () => clearTimeout(revealTimer.current), [])

  // Steps the stars have reached that were never announced on this device: the
  // hub shows one combined sheet (an existing 300-star player sees one, not six).
  useEffect(() => {
    if (play || view !== 'hub') return
    const steps = stepsToAnnounce(readRewardSeen(), totalStars(progress))
    if (!steps.length) return
    // Marked seen only once the sheet actually opens, so an unmount in between loses nothing.
    const t = setTimeout(() => { writeRewardSeen(steps[steps.length - 1].stars); setReveal(steps) }, 400)
    return () => clearTimeout(t)
  }, [progress, play, view])

  // After a campaign clear: reveal any newly reached steps once the result panel has landed.
  const announceAfterClear = (stars) => {
    const steps = stepsToAnnounce(readRewardSeen(), stars)
    if (!steps.length) return
    clearTimeout(revealTimer.current)
    revealTimer.current = setTimeout(() => { writeRewardSeen(steps[steps.length - 1].stars); setReveal(steps) }, 900)
  }
  const rewardSheet = reveal && (
    <Suspense fallback={null}>
      <ArrowsRewardSheet steps={reveal} onClose={() => setReveal(null)} />
    </Suspense>
  )

  useEffect(() => {
    let live = true
    syncArrowsProgress().then((p) => { if (live) setProgress(p) })
    return () => { live = false }
  }, [])

  const level = useMemo(() => {
    if (!play) return null
    return play.kind === 'level' ? getArrowsLevel(play.n) : endlessBoard(play.tier, play.seed, play.learned)
  }, [play])

  // With an endless board on screen, build the next one while the player is
  // busy so NEXT BOARD is instant. Cancelled on tier change / leaving.
  useEffect(() => {
    if (!play || play.kind !== 'endless') return undefined
    return whenIdle(() => endlessBoard(play.tier, play.nextSeed, play.learned))
  }, [play])

  const start = (next) => { setPlay(next); setAttempt((a) => a + 1) }
  const startEndless = (tier, seed = randomArrowsSeed()) =>
    start({ kind: 'endless', tier, seed, nextSeed: randomArrowsSeed(), learned: learnedPieces(progress) })
  const back = () => setPlay(null)
  const toHub = () => { setPlay(null); setView('hub') }

  if (play && level) {
    if (play.kind === 'level') {
      const n = play.n
      const hasNext = n < ARROWS_LEVEL_COUNT
      const chapter = ARROWS_CHAPTERS.find((c) => n >= c.from && n <= c.to)
      const nextBoard = hasNext ? getArrowsLevel(n + 1) : null
      return (
        <>
        <PuzzlePlay
          key={`level-${n}-${attempt}`}
          level={level}
          title={`LEVEL ${n}`}
          subtitle={chapter.name}
          resultTag={`LEVEL ${n} · ${chapter.name}`}
          nextProgress={`CHAPTER ${ARROWS_CHAPTERS.indexOf(chapter) + 1} · ${chapterCleared(progress, chapter)}/${chapter.to - chapter.from + 1}`}
          onCleared={(stars) => {
            if (stars > 0) track('arrows_level_cleared', { level: n, stars, kind: 'campaign' })
            const before = totalStars(progress)
            const next = saveArrowsProgress(recordLevelResult(progress, n, stars))
            const after = totalStars(next)
            setProgress(next)
            if (stars > 0) announceAfterClear(after)
            return { before, after }
          }}
          onRestart={() => setAttempt((a) => a + 1)}
          intro={ARROWS_LEVEL_SPECS[n - 1].intro ?? null}
          onBack={back}
          backLabel="CHAPTERS"
          next={hasNext ? { label: `NEXT · LEVEL ${n + 1} · ${nextBoard.cols}×${nextBoard.rows}`, onClick: () => start({ kind: 'level', n: n + 1 }) } : null}
        />
        {rewardSheet}
        </>
      )
    }
    const { tier } = play
    return (
      <PuzzlePlay
        key={`endless-${play.seed}-${attempt}`}
        level={level}
        title={`ENDLESS · ${ARROWS_ENDLESS_INFO[tier].label}`}
        subtitle={`${level.shape ? `${level.shape.toUpperCase()} SHAPE · ` : ''}${progress.endless[tier]} CLEARED`}
        tips={false}
        onCleared={() => {
          track('arrows_level_cleared', { level: progress.endless[tier] + 1, kind: `endless_${tier}` })
          setProgress((p) => saveArrowsProgress(recordEndlessClear(p, tier)))
        }}
        onRestart={() => setAttempt((a) => a + 1)}
        onBack={back}
        next={{ label: 'NEXT BOARD →', onClick: () => startEndless(tier, play.nextSeed) }}
      />
    )
  }

  return (
    <div className="space-y-3">
      {view === 'hub' && (
        <Hub
          progress={progress}
          onContinue={() => start({ kind: 'level', n: nextLevel(progress) })}
          onView={(v) => { if (v === 'tutorial') markTutorialStarted(); setView(v) }}
          onRules={() => setRulesOpen(true)}
        />
      )}
      {view === 'solo' && (
        <>
          <SubHeader title="SOLO" onBack={toHub} />
          <ArrowsChapterMap progress={progress} onPlay={(n) => start({ kind: 'level', n })} onPlayEndless={(tier) => startEndless(tier)} />
        </>
      )}
      {view === 'two' && (
        <>
          <SubHeader title="2 PLAYERS" onBack={toHub} />
          <ArrowsRaceSetup />
        </>
      )}
      {view === 'tutorial' && (
        <Suspense fallback={<p className="text-center font-pixel text-[9px] text-retro-dim">LOADING…</p>}>
          <ArrowsTutorial onExit={toHub} />
        </Suspense>
      )}
      {rulesOpen && <RulesModal gameType="arrows" onClose={() => setRulesOpen(false)} />}
      {rewardSheet}
    </div>
  )
}
