import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { getServerNow } from '../hooks/useServerClock'
import RaceShell from '../components/RaceShell'
import TypingKeyboard from '../components/TypingKeyboard'
import TypingSettings from '../components/TypingSettings'
import { normalizeSeen } from '../lib/seenHistory'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { raceGoAt } from '../lib/raceLogic'
import {
  DEFAULT_TYPING_CONFIG, TYPING_RACE_MS, TYPING_CONTENT_REVISION,
  generateTypingContent, normalizeTypingConfig,
  createTypingProgress, applyTypingValue, typingMetrics,
  isTypingComplete, isTypingDone, typingRaceEntry, typingLiveKey, typingRow,
  typingResultBreakdown,
} from '../lib/typingLogic'

const SYNC_DEBOUNCE_MS = 200
const passageOf = (round) => (typeof round?.raw?.passage === 'string' ? round.raw.passage : '')
const configLabel = (config) => {
  const value = normalizeTypingConfig(config)
  return `${value.length.toUpperCase()} QUOTE · PUNCTUATION ${value.punctuation ? 'ON' : 'OFF'} · NUMBERS ${value.numbers ? 'ON' : 'OFF'}`
}

const RACE = {
  type: 'typing',
  title: 'TYPING RACE',
  sameWhat: 'QUOTE',
  rules: [
    'SAME ORIGINAL QUOTE FOR EVERY RACER · TYPE IT EXACTLY',
    'BACKSPACE CORRECTS · EVERY WRONG ATTEMPT STILL COUNTS',
    'NET WPM WINS · ACCURACY THEN FINISH TIME BREAK TIES',
    'INCOMPLETE QUOTE AT DEADLINE = DNF',
  ],
  baseMs: TYPING_RACE_MS,
  scaled: true,
  configKey: 'typingConfig',
  normalizeConfig: normalizeTypingConfig,
  Config: TypingSettings,
  describeConfig: configLabel,
  entry: typingRaceEntry,
  isDone: isTypingDone,
  liveKey: typingLiveKey,
  row: (stats, round) => typingRow(stats, passageOf(round).length),
  start: (room, seed, config) => {
    const seen = normalizeSeen(room?.seen?.['typing-quotes-v1'])
    const content = generateTypingContent(seed, config ?? DEFAULT_TYPING_CONFIG, seen)
    return {
      extras: {
        typingConfig: content.config,
        contentRevision: content.contentRevision ?? TYPING_CONTENT_REVISION,
        passage: content.passage,
        passageIndex: content.quoteIndex,
      },
      seen: { deck: 'typing-quotes-v1', index: content.quoteIndex },
    }
  },
}

function TypingRacer({ round, myStats, statsPath, goAt, now, done }) {
  const passage = passageOf(round)
  const config = normalizeTypingConfig(round?.raw?.typingConfig)
  const [progress, setProgress] = useState(createTypingProgress)
  const [pasteBlocked, setPasteBlocked] = useState(false)
  const [focused, setFocused] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const progressRef = useRef(progress)
  const finishedRef = useRef(done)
  const inputRef = useRef(null)
  const caretRef = useRef(null)
  const syncTimerRef = useRef(null)
  const pasteTimerRef = useRef(null)
  const live = round.endsAt == null || now < round.endsAt
  const canType = !done && live && !!passage

  useEffect(() => {
    finishedRef.current = done
  }, [done])

  useEffect(() => () => {
    clearTimeout(syncTimerRef.current)
    clearTimeout(pasteTimerRef.current)
  }, [])

  // Focus the real field when the race goes live so desktop physical keys work
  // at once. Mobile still needs a tap: iOS only opens the OS keyboard from a
  // user gesture, so the start control and the passage both call focusInput.
  useEffect(() => {
    if (!canType) return
    try { inputRef.current?.focus({ preventScroll: true }) } catch { /* non-fatal */ }
  }, [canType])

  // Keep the next character visible as the passage grows and when the visual
  // viewport shrinks under the on-screen keyboard.
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    caretRef.current?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [progress.typed.length])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return undefined
    const sync = () => {
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
      caretRef.current?.scrollIntoView({ block: 'nearest' })
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  const syncProgress = useCallback((nextProgress) => {
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      const metrics = typingMetrics(nextProgress, getServerNow() - (goAt ?? getServerNow()), passage.length)
      update(ref(db, statsPath), {
        progress: nextProgress.typed.length,
        attempts: metrics.attempts,
        correctAttempts: metrics.correctAttempts,
        wrongAttempts: metrics.wrongAttempts,
        rawWpm: metrics.rawWpm,
        netWpm: metrics.netWpm,
        acc: metrics.accuracy,
      }).catch(() => {})
    }, SYNC_DEBOUNCE_MS)
  }, [goAt, passage.length, statsPath])

  const handleFinish = useCallback(async (finalProgress) => {
    if (!isTypingComplete(finalProgress.typed, passage)) return
    finishedRef.current = true
    clearTimeout(syncTimerRef.current)
    const finishedAt = getServerNow()
    const metrics = typingMetrics(finalProgress, finishedAt - (goAt ?? finishedAt), passage.length)
    try {
      await update(ref(db, statsPath), {
        progress: passage.length,
        attempts: metrics.attempts,
        correctAttempts: metrics.correctAttempts,
        wrongAttempts: metrics.wrongAttempts,
        missed: 0,
        rawWpm: metrics.rawWpm,
        netWpm: metrics.netWpm,
        acc: metrics.accuracy,
        elapsedMs: metrics.elapsedMs,
        done: true,
        doneAt: finishedAt,
      })
    } catch {
      finishedRef.current = false
      toast.error('SUBMIT FAILED — RETYPE THE LAST CHARACTER TO RETRY')
    }
  }, [goAt, passage, statsPath])

  const commitProgress = useCallback((next) => {
    if (next === progressRef.current) return
    progressRef.current = next
    setProgress(next)
    syncProgress(next)
    if (isTypingComplete(next.typed, passage)) handleFinish(next)
  }, [handleFinish, passage, syncProgress])

  // A real text field is the input control: the OS keyboard reports whole
  // values, so the live race diffs the field into attempt history.
  const handleInput = useCallback((event) => {
    if (finishedRef.current || !canType) return
    const field = event.currentTarget
    const next = applyTypingValue(progressRef.current, field.value, passage)
    if (field.value.length > passage.length) field.value = field.value.slice(0, passage.length)
    commitProgress(next)
  }, [canType, commitProgress, passage])

  const blockPaste = useCallback((event) => {
    event?.preventDefault?.()
    setPasteBlocked(true)
    clearTimeout(pasteTimerRef.current)
    pasteTimerRef.current = setTimeout(() => setPasteBlocked(false), 2500)
  }, [])

  const handleBeforeInput = useCallback((event) => {
    const inputType = event?.nativeEvent?.inputType
    if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') blockPaste(event)
  }, [blockPaste])

  const focusInput = useCallback(() => {
    if (!canType) return
    try { inputRef.current?.focus({ preventScroll: true }) } catch { /* non-fatal */ }
  }, [canType])

  const shownTyped = done && !progress.typed ? passage : progress.typed
  const liveMetrics = typingMetrics(progress, now - (goAt ?? now), passage.length)
  const hint = pasteBlocked
    ? 'Paste is disabled in the race — type the shared quote.'
    : !canType
      ? ''
      : focused
        ? 'Corrections are allowed. Earlier mistakes remain in accuracy.'
        : 'Tap the quote or the button to type with your own keyboard.'

  return (
    <div className="space-y-3 [@media(max-height:700px)]:space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="font-pixel text-[8px] text-retro-dim">{configLabel(config)}</span>
        <span className="font-pixel text-[9px] text-retro-cta tabular-nums" aria-label="Live typing pace">
          {liveMetrics.netWpm} NET WPM · {liveMetrics.accuracy}% ACC
        </span>
      </div>
      <div
        className="relative bg-retro-surface border border-retro-border rounded p-3 [@media(max-height:700px)]:p-2"
        style={keyboardInset ? { paddingBottom: keyboardInset + 12 } : undefined}
      >
        <div className="max-h-[42vh] overflow-y-auto">
          <p className="font-mono text-[15px] leading-7 break-words [@media(max-height:700px)]:text-[13px] [@media(max-height:700px)]:leading-6" data-testid="typing-passage">
            {passage.split('').map((char, i) => {
              const isTyped = i < shownTyped.length
              const isCorrect = isTyped && shownTyped[i] === passage[i]
              const isWrong = isTyped && shownTyped[i] !== passage[i]
              const isCursor = canType && i === shownTyped.length
              return (
                <span
                  key={i}
                  ref={isCursor ? caretRef : null}
                  className={cn(
                    isCorrect ? 'text-retro-text' : isWrong ? 'text-retro-p2 bg-retro-p2/20' : 'text-retro-dim',
                    isCursor && 'border-l-2 border-retro-cta',
                  )}
                >
                  {char}
                </span>
              )
            })}
          </p>
        </div>
        {/* The real, focusable input that summons the OS keyboard on phones.
            It is transparent and overlays the rendered quote so a tap on the
            passage focuses it; the visible characters stay our own spans. */}
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Type the shared quote"
          data-testid="typing-input"
          defaultValue=""
          disabled={!canType}
          style={{ fontSize: 16 }}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent opacity-0"
          onInput={handleInput}
          onPaste={blockPaste}
          onDrop={blockPaste}
          onBeforeInput={handleBeforeInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {done && myStats?.netWpm != null && (
          <p className="font-pixel text-[9px] text-retro-win text-center mt-3" role="status">
            ✓ {myStats.netWpm} NET WPM · RAW {myStats.rawWpm} · {myStats.acc}% ACC
          </p>
        )}
      </div>
      <p className="min-h-5 font-mono text-[10px] text-retro-dim text-center" role="status" aria-live="polite">
        {hint}
      </p>
      {canType && !focused && (
        <button
          type="button"
          onClick={focusInput}
          className="w-full min-h-11 rounded border border-retro-cta bg-retro-tint-cta px-3 py-2 font-pixel text-[9px] text-retro-cta transition-colors motion-reduce:transition-none"
        >
          TAP TO TYPE
        </button>
      )}
      {canType && (
        <div className="hidden sm:block" aria-hidden="true" data-testid="typing-keyboard-art">
          <p className="font-pixel text-[8px] text-retro-dim text-center mb-1">
            ON-SCREEN KEYS ARE A GUIDE — TYPE ON YOUR OWN KEYBOARD
          </p>
          <TypingKeyboard artwork />
        </div>
      )}
    </div>
  )
}

function TypingFinal({ round, result, players }) {
  const rawRound = round?.raw ?? {}
  const config = normalizeTypingConfig(rawRound.typingConfig)
  const passage = typeof rawRound.passage === 'string' ? rawRound.passage : ''
  const goAt = raceGoAt(round)
  const roundElapsed = Math.max(0, Number(result?.at) - (goAt ?? Number(result?.at)))
  return (
    <section className="space-y-3" aria-label="Typing Race score breakdown">
      <div className="bg-retro-surface border border-retro-border rounded p-3 text-center">
        <p className="font-pixel text-[8px] text-retro-cta">{configLabel(config)}</p>
        <p className="font-mono text-[10px] text-retro-dim mt-1">NET WPM ranks first · accuracy breaks ties · finish time breaks remaining ties</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(result?.order ?? []).map(uid => {
          const stats = round?.stats?.[uid] ?? null
          const metrics = typingResultBreakdown(stats, passage.length, roundElapsed)
          const player = players?.[uid]
          const pace = (n) => metrics.legacy ? '—' : `${n}`
          return (
            <article key={uid} className="bg-retro-card border border-retro-border rounded p-3 space-y-2" aria-label={`Typing result for ${player?.name || 'player'}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-pixel text-[9px] text-retro-text truncate">{player?.name || 'PLAYER'}</h3>
                <span className={cn('font-pixel text-[8px]', metrics.completed ? 'text-retro-win' : 'text-retro-danger')}>
                  {metrics.completed ? 'FINISHED' : 'DNF'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-[10px]">
                <span className="text-retro-dim">NET WPM</span><strong className="text-retro-text text-right">{pace(metrics.netWpm)}</strong>
                <span className="text-retro-dim">RAW WPM</span><strong className="text-retro-text text-right">{pace(metrics.rawWpm)}</strong>
                <span className="text-retro-dim">ACCURACY</span><strong className="text-retro-text text-right">{metrics.legacy ? `${metrics.accuracy}%` : `${metrics.accuracy}%`}</strong>
                <span className="text-retro-dim">CORRECT / WRONG</span><strong className="text-retro-text text-right">{metrics.correctAttempts ?? '—'} / {metrics.wrongAttempts ?? '—'}</strong>
                <span className="text-retro-dim">MISSED</span><strong className="text-retro-text text-right">{metrics.missed}</strong>
                <span className="text-retro-dim">TIME</span><strong className="text-retro-text text-right">{(metrics.elapsedMs / 1000).toFixed(1)}s</strong>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default function TypingGame(props) {
  return <RaceShell {...props} race={RACE} Racer={TypingRacer} Final={TypingFinal} />
}
