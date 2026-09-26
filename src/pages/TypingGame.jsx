import { useEffect, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { getServerNow } from '../hooks/useServerClock'
import RaceShell from '../components/RaceShell'
import TypingKeyboard from '../components/TypingKeyboard'
import { normalizeSeen } from '../lib/seenHistory'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  PASSAGES, TYPING_RACE_MS,
  countCorrectChars, computeWpm, computeAccuracy, computeEffWpm,
  pickPassageIndex, isTypingDone, typingRaceEntry, typingLiveKey, typingRow,
} from '../lib/typingLogic'

// Typing Race — N-player race (2–8). Everyone types the same passage (picked
// fresh from the room's seen history); ranked by accuracy-weighted WPM.
// Unfinished racers at the deadline DNF. Room flow in RaceShell.

const SYNC_DEBOUNCE_MS = 200

const passageOf = (round) => (typeof round?.raw?.passage === 'string' ? round.raw.passage : '')

const RACE = {
  type: 'typing',
  title: 'TYPING RACE',
  sameWhat: 'PASSAGE',
  rules: [
    'EVERYONE TYPES THE SAME PASSAGE',
    'ERRORS STAY · ⌫ CORRECTS',
    'RANKED ON EFF-WPM (WPM × ACCURACY)',
  ],
  baseMs: TYPING_RACE_MS,
  scaled: true,
  entry: typingRaceEntry,
  isDone: isTypingDone,
  liveKey: typingLiveKey,
  row: (stats, round) => typingRow(stats, passageOf(round).length),
  start: (room) => {
    const index = pickPassageIndex(normalizeSeen(room?.seen?.typing))
    return { extras: { passage: PASSAGES[index], passageIndex: index }, seen: { deck: 'typing', index } }
  },
}

function TypingRacer({ round, myStats, statsPath, goAt, done }) {
  const passage = passageOf(round)
  const [typed, setTyped] = useState('')
  // Mirrors `typed` synchronously: two keystrokes landing before React
  // re-renders must both see the latest text, not a stale closure.
  const typedRef = useRef('')
  const finishedRef = useRef(done)
  const syncTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(syncTimerRef.current), [])

  const syncProgress = (len) => {
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      update(ref(db, statsPath), { progress: len }).catch(() => {})
    }, SYNC_DEBOUNCE_MS)
  }

  const handleFinish = async (finalTyped) => {
    finishedRef.current = true
    clearTimeout(syncTimerRef.current)
    const finishedAt = getServerNow()
    const correctChars = countCorrectChars(finalTyped, passage)
    const wpm = computeWpm(correctChars, finishedAt - (goAt ?? finishedAt))
    const acc = computeAccuracy(correctChars, passage.length)
    try {
      await update(ref(db, statsPath), {
        progress: passage.length, wpm, acc, eff: computeEffWpm(wpm, acc), done: true, doneAt: finishedAt,
      })
    } catch {
      // Write failed — un-finish so retyping the last character retries.
      finishedRef.current = false
      toast.error('SUBMIT FAILED — RETYPE THE LAST CHARACTER TO RETRY')
    }
  }

  const handleKey = (char) => {
    if (finishedRef.current || !passage) return
    const cur = typedRef.current
    let next
    if (char === 'BACKSPACE') {
      next = cur.slice(0, -1)
    } else if (char === 'WORD_BACKSPACE') {
      const trimmed = cur.trimEnd()
      const lastSpace = trimmed.lastIndexOf(' ')
      next = lastSpace === -1 ? '' : cur.slice(0, lastSpace + 1)
      if (next.length === cur.length) next = cur.slice(0, -1)
    } else {
      if (cur.length >= passage.length) return
      next = cur + char
    }
    typedRef.current = next
    setTyped(next)
    syncProgress(next.length)
    if (next.length === passage.length) handleFinish(next)
  }

  const shownTyped = done && !typed ? passage : typed

  return (
    <div className="space-y-3 [@media(max-height:700px)]:space-y-2">
      <div className="bg-retro-surface border border-retro-border rounded p-3 [@media(max-height:700px)]:p-2">
        <p className="font-mono text-[13px] leading-6 break-words [@media(max-height:700px)]:text-[12px] [@media(max-height:700px)]:leading-5" data-testid="typing-passage">
          {passage.split('').map((char, i) => {
            const isTyped = i < shownTyped.length
            const isCorrect = isTyped && shownTyped[i] === passage[i]
            const isWrong = isTyped && shownTyped[i] !== passage[i]
            const isCursor = !done && i === shownTyped.length
            return (
              <span
                key={i}
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
        {done && myStats?.wpm != null && (
          <p className="font-pixel text-[9px] text-retro-win text-center mt-3">
            ✓ {myStats.wpm} WPM · {myStats.acc ?? 100}% · {computeEffWpm(myStats.wpm, myStats.acc ?? 100)} EFF
          </p>
        )}
      </div>
      {!done && <TypingKeyboard onKey={handleKey} />}
    </div>
  )
}

export default function TypingGame(props) {
  return <RaceShell {...props} race={RACE} Racer={TypingRacer} />
}
