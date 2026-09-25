import { useEffect, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { getServerNow } from '../hooks/useServerClock'
import RaceShell from '../components/RaceShell'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  ROUNDS, REACTION_RACE_MS,
  avgReactionTime, fastestReactionTime, formatMs, seededDelayMs,
  reactionTimesOf, isReactionDone, reactionRaceEntry, reactionLiveKey, reactionRow,
} from '../lib/reactionLogic'

// Reaction Time — N-player race (2–8). Every racer plays ROUNDS tap-rounds
// at their own pace; the waits before GREEN are seeded from the round, so
// everyone gets the same waits. Lowest average wins; room flow in RaceShell.

const RACE = {
  type: 'reaction',
  title: 'REACTION TIME',
  sameWhat: 'WAITS',
  rules: [
    `${ROUNDS} ROUNDS · TAP THE MOMENT IT TURNS GREEN`,
    'EVERYONE GETS THE SAME WAITS',
    'LOWEST AVERAGE WINS · TOO EARLY = RETRY',
  ],
  baseMs: REACTION_RACE_MS,
  scaled: true,
  entry: reactionRaceEntry,
  isDone: isReactionDone,
  liveKey: reactionLiveKey,
  row: (stats) => reactionRow(stats),
}

const AREA_COLOR = {
  start:      'bg-retro-surface border-retro-border/60',
  waiting:    'bg-retro-surface border-retro-border/60',
  ready:      'bg-retro-win/20 border-retro-win shadow-neon-win',
  too_early:  'bg-retro-p2/15 border-retro-p2/60',
  result:     'bg-retro-card border-retro-border',
  submitted:  'bg-retro-surface border-retro-border/40',
}

function ReactionRacer({ round, myStats, statsPath, done }) {
  const [times, setTimes] = useState(() => reactionTimesOf(myStats))
  const [phase, setPhase] = useState(() => (done ? 'submitted' : 'start'))
  const [lastTime, setLastTime] = useState(null)
  const roundStartRef = useRef(null)
  const timerRef = useRef(null)
  const attemptRef = useRef(0) // false starts on the current tap-round

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const startRound = (count) => {
    setPhase('waiting')
    const delay = seededDelayMs(round.seed, count, attemptRef.current)
    timerRef.current = setTimeout(() => {
      setPhase('ready')
      roundStartRef.current = performance.now()
      sounds.go()
    }, delay)
  }

  // Captured on onPointerDown (not onClick) so the recorded time doesn't pay
  // the touch→click event-synthesis latency (M-50).
  const handleTap = async () => {
    if (phase === 'submitted') return
    switch (phase) {
      case 'start':
      case 'result':
        startRound(times.length)
        break
      case 'too_early':
        startRound(times.length)
        break
      case 'waiting':
        clearTimeout(timerRef.current)
        attemptRef.current += 1
        setPhase('too_early')
        break
      case 'ready': {
        const rt = Math.round(performance.now() - roundStartRef.current)
        attemptRef.current = 0
        setLastTime(rt)
        sounds.move('X')
        const prev = times
        const next = [...times, rt]
        const finished = next.length >= ROUNDS
        setTimes(next)
        setPhase(finished ? 'submitted' : 'result')
        try {
          await update(ref(db, statsPath), {
            times: next,
            done: finished,
            doneAt: finished ? getServerNow() : null,
          })
        } catch {
          // Write failed — revert so the player can re-tap this round instead
          // of soft-locking on a result nobody else can see.
          setTimes(prev)
          setPhase('result')
          toast.error('SUBMIT FAILED — TAP TO RETRY')
        }
        break
      }
    }
  }

  if (phase === 'submitted') {
    return (
      <div className="w-full rounded-xl border-2 min-h-[160px] flex flex-col items-center justify-center gap-2 px-4 bg-retro-surface border-retro-border/40">
        <p className="font-pixel text-[10px] text-retro-win text-glow-win">ALL DONE!</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {times.map((t, i) => (
            <p key={i} className="font-pixel text-[8px]">
              <span className="text-retro-dim">R{i + 1} </span>
              <span className="text-retro-text">{t}ms</span>
            </p>
          ))}
        </div>
        <p className="font-pixel text-[9px] text-retro-cta">
          AVG {formatMs(avgReactionTime(times))} · BEST {formatMs(fastestReactionTime(times))}
        </p>
      </div>
    )
  }

  return (
    <button
      onPointerDown={e => { e.preventDefault(); handleTap() }}
      onKeyDown={e => {
        // Keyboard-equivalent activation (Space/Enter) — the area is
        // otherwise pointer-only, which locks keyboard users out entirely.
        if (e.repeat) return
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault()
          handleTap()
        }
      }}
      aria-label={phase === 'ready' ? 'Tap now' : phase === 'waiting' ? 'Wait for green' : 'Tap to start the next round'}
      className={cn(
        'w-full rounded-xl border-2 transition-colors duration-75 select-none',
        'min-h-[210px] flex flex-col items-center justify-center gap-3 active:scale-[0.99] cursor-pointer',
        AREA_COLOR[phase] ?? AREA_COLOR.start,
      )}
    >
      <p className={cn(
        'font-pixel text-center leading-none',
        phase === 'ready'     && 'text-3xl text-retro-win text-glow-win',
        phase === 'result'    && 'text-2xl text-retro-cta text-glow-cta',
        phase === 'too_early' && 'text-xl text-retro-p2',
        (phase === 'start' || phase === 'waiting') && 'text-base text-retro-dim',
      )}>
        {phase === 'ready'     ? 'CLICK!'        :
         phase === 'too_early' ? 'TOO EARLY!'    :
         phase === 'result'    ? `${lastTime}ms` :
         phase === 'waiting'   ? 'WAIT...'       :
         'TAP TO START'}
      </p>
      <p className={cn(
        'font-pixel text-[9px]',
        phase === 'too_early' ? 'text-retro-p2' : 'text-retro-dim arcade-blink',
      )}>
        {phase === 'waiting'   ? "DON'T CLICK YET"  :
         phase === 'too_early' ? 'TAP TO TRY AGAIN' :
         phase === 'result'    ? `ROUND ${times.length}/${ROUNDS} — TAP FOR NEXT` :
         phase === 'start'     ? `ROUND ${times.length + 1}/${ROUNDS} · FASTEST AVG WINS` :
         ''}
      </p>
    </button>
  )
}

// Round-by-round breakdown under the final ranking.
function ReactionFinal({ round, result, players }) {
  if (!round || !result?.order?.length) return null
  const rows = result.order.map(id => ({ id, times: reactionTimesOf(round.stats?.[id]) }))
  const best = Array.from({ length: ROUNDS }, (_, i) => {
    const vals = rows.map(r => r.times[i]).filter(v => v != null)
    return vals.length ? Math.min(...vals) : null
  })
  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1 overflow-x-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,3rem)] gap-x-1 font-pixel text-[7px] text-retro-dim pb-1 border-b border-retro-border">
        <span>RACER</span>
        {best.map((_, i) => <span key={i} className="text-right">R{i + 1}</span>)}
      </div>
      {rows.map(r => (
        <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_repeat(4,3rem)] gap-x-1 font-pixel text-[8px]">
          <span className="truncate text-retro-text">{(players?.[r.id]?.name || 'PLAYER').toUpperCase()}</span>
          {best.map((b, i) => (
            <span key={i} className={cn('text-right tabular-nums', r.times[i] != null && r.times[i] === b ? 'text-retro-win' : 'text-retro-text')}>
              {r.times[i] != null ? r.times[i] : '—'}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function ReactionGame(props) {
  return <RaceShell {...props} race={RACE} Racer={ReactionRacer} Final={ReactionFinal} />
}
