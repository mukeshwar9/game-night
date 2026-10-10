import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import ArrowsBoard from '../components/ArrowsBoard'
import ArrowsChapterMap, { Stars } from '../components/ArrowsChapterMap'
import ArrowsRaceSetup from '../components/ArrowsRaceSetup'
import ArrowsRewardMeter from '../components/ArrowsRewardMeter'
import { Lives } from '../components/ArrowsHud'
import ArrowsLesson from '../components/ArrowsLesson'
import ArrowTypes from '../components/ArrowTypes'
import BottomSheet from '../components/BottomSheet'
import RulesModal from '../components/LazyRulesModal'
import { getLesson } from '../lib/arrowsLessonsLogic'
import { bestHintArrow } from '../lib/arrowsHintLogic'
import ArrowsDemo from './ArrowsDemo'
import {
  applyArrowTap,
  countGone,
  randomArrowsSeed,
  ARROWS_ENDLESS_INFO,
  ARROWS_LIVES,
} from '../lib/arrowsLogic'
import {
  ARROWS_CHAPTERS,
  ARROWS_LEVEL_COUNT,
  ARROWS_LEVEL_SPECS,
  ARROWS_TWIST_TIPS,
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
import { REWARD_SEEN_KEY, parseRewardSeen, resultRewardLine, stepsToAnnounce } from '../lib/arrowsRewardsLogic'
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
//   2 PLAYERS — race settings, then a friend, a quick match or a bot;
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
  const got = levelStars(progress, cont)
  return (
    <div className="space-y-3">
      {first ? (
        <HubCard cta top="NEW TO ARROWS?" main="START HERE · TUTORIAL" sub="a short guided tutorial, then level 1" onClick={() => onView('tutorial')} />
      ) : (
        <HubCard
          cta
          top={`CONTINUE · CHAPTER ${chapter ? ARROWS_CHAPTERS.indexOf(chapter) + 1 : ''} ${chapter ? chapter.name : ''}`}
          main={got ? `REPLAY LEVEL ${cont}` : `LEVEL ${cont}`}
          sub={`${totalStars(progress)}/${ARROWS_LEVEL_COUNT * 3} ★ SO FAR${got ? ` · BEST ${'★'.repeat(got)}` : ''}`}
          extra={<ArrowsRewardMeter stars={totalStars(progress)} />}
          onClick={onContinue}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <HubCard top="1 PLAYER" main="SOLO" sub={`${ARROWS_LEVEL_COUNT} levels · endless`} onClick={() => onView('solo')} />
        <HubCard top="VS" main="2 PLAYERS" sub="friend · quick match · bot" onClick={() => onView('two')} />
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
  // { before, after } total stars around this clear (campaign only).
  const [reward, setReward] = useState(null)
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
    sounds.hitNote(melodicNote(streak.current), streak.current)
    streak.current += 1
    if (countGone(applied.gone) >= total) {
      const stars = starsFor({ mistakes, hints })
      setResult({ stars })
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

  const potential = starsFor({ mistakes, hints })

  // The result panel lies over the board, inline or in full screen.
  const resultPanel = result && (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-retro-bg/85 rounded-lg px-4 text-center">
      {result.stars > 0 ? (
        <>
          <p className="font-pixel text-sm text-retro-win text-glow-win">BOARD CLEAR!</p>
          <Stars n={result.stars} size="lg" />
          <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">
            {mistakes === 0 ? 'NO MISTAKES' : `${mistakes} MISTAKE${mistakes > 1 ? 'S' : ''}`}
            {hints > 0 ? ` · ${hints} HINT${hints > 1 ? 'S' : ''}` : ''}
          </p>
          {reward && <p className="font-pixel text-[8px] text-retro-cta leading-relaxed">{resultRewardLine(reward.before, reward.after)}</p>}
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
  )

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
          peek
          interactive={!result && !lesson}
          feedback={feedback}
          hint={hint}
          label={`${title} board, ${total - countGone(gone)} arrows left`}
          focusable
          focusHud={(
            <div className="flex items-center gap-2 min-w-0">
              <span className="min-w-0 truncate font-pixel text-[8px] text-retro-text">{title.split(' /')[0]}</span>
              <span className="font-pixel text-[8px] text-retro-dim tabular-nums">{countGone(gone)}/{total}</span>
              <Lives n={lives} size="sm" />
              <button onClick={showHint} disabled={!!result} className={cn(SEC, 'ml-auto min-h-9 px-2 py-1 text-[8px]')}>HINT</button>
            </div>
          )}
          focusOverlay={resultPanel || null}
        />
        {result && resultPanel}
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
  const [view, setView] = useState('hub')
  const [botTier, setBotTier] = useState('easy')
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
      return (
        <>
        <PuzzlePlay
          key={`level-${n}-${attempt}`}
          level={level}
          title={`LEVEL ${n} / ${ARROWS_LEVEL_COUNT}`}
          subtitle={`${level.cols}×${level.rows} · ${level.arrows.length} ARROWS`}
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
          next={hasNext ? { label: `LEVEL ${n + 1} →`, onClick: () => start({ kind: 'level', n: n + 1 }) } : null}
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
        subtitle={`${level.shape ? `${level.shape.toUpperCase()} SHAPE · ` : ''}${level.arrows.length} ARROWS · ${progress.endless[tier]} CLEARED`}
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
          <ArrowsRaceSetup onBot={(difficulty) => { setBotTier(difficulty); setView('bot') }} />
        </>
      )}
      {view === 'bot' && (
        <>
          <SubHeader title="RACE A BOT" onBack={() => setView('two')} />
          <ArrowsDemo initialTier={botTier} />
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
