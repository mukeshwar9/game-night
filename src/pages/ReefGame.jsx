import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import RaceShell from '../components/RaceShell'
import ReefPlayer from '../components/ReefPlayer'
import { buildLevel, raceLevelIndex } from '../lib/reefLevels'
import {
  REEF_RACE_MS, createRun, reefStatsFrom, normalizeReefStats,
  isReefDone, reefRaceEntry, reefRow,
} from '../lib/reefLogic'
import { defaultAvatarForId } from '../lib/avatars'
import { cn } from '@/lib/utils'

// Reef Run — N-player race (2–8). Everyone swims the same seeded level for
// 3 minutes; the highest score wins. Health 0 takes you out of the round
// (your score still counts). Room flow in RaceShell.

const RACE = {
  type: 'reef',
  title: 'REEF RUN',
  sameWhat: 'LEVEL',
  rules: [
    'SWIM THE SAME REEF LEVEL · 3 MIN',
    'PEARLS, SHELLS AND STARS SCORE · DODGE HAZARDS',
    'HIGHEST SCORE WINS · 0 HEARTS = OUT',
  ],
  baseMs: REEF_RACE_MS,
  scaled: false,
  entry: reefRaceEntry,
  isDone: isReefDone,
  row: reefRow,
}

const PUSH_MS = 1000
const FORCE_EVENTS = ['hit', 'dead', 'clear']

function ReefRacer({ round, myStats, statsPath, now, game, mySeat }) {
  const levelIndex = raceLevelIndex(round.seed)
  const level = useMemo(() => buildLevel(levelIndex, round.seed), [levelIndex, round.seed])
  const avatarId = game?.players?.[mySeat]?.avatar || defaultAvatarForId(mySeat)
  const live = round.endsAt == null || now < round.endsAt
  const finishedAtMount = isReefDone(myStats)

  const [stats, setStats] = useState(() => normalizeReefStats(myStats, level.maxScore) ?? reefStatsFrom(createRun(level)))
  const [outcome, setOutcome] = useState(() => (myStats?.dead ? 'dead' : myStats?.done ? 'clear' : null))
  const lastRunRef = useRef(null)
  const lastPushRef = useRef({ at: 0, json: '' })
  const finalRef = useRef(finishedAtMount)

  const push = (next) => {
    lastPushRef.current = { at: performance.now(), json: JSON.stringify(next) }
    update(ref(db, statsPath), next).catch(() => toast.error('SCORE SYNC FAILED — CHECK CONNECTION'))
  }

  // Register as present (0 pts) so a racer who never scores still ranks
  // instead of reading as a no-show DNF.
  useEffect(() => {
    if (!myStats && !finishedAtMount) {
      const initial = reefStatsFrom(createRun(level))
      lastPushRef.current = { at: performance.now(), json: JSON.stringify(initial) }
      update(ref(db, statsPath), initial).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round (the Racer is keyed by round id)
  }, [])

  const handleProgress = (run, events) => {
    lastRunRef.current = run
    if (finalRef.current) return
    const next = reefStatsFrom(run)
    setStats(next)
    const json = JSON.stringify(next)
    if (json === lastPushRef.current.json) return
    const forced = events.some(e => FORCE_EVENTS.includes(e))
    if (forced || performance.now() - lastPushRef.current.at >= PUSH_MS) push(next)
  }

  const handleEnd = ({ outcome: o, run }) => {
    lastRunRef.current = run
    if (finalRef.current) return
    finalRef.current = true
    const next = reefStatsFrom(run)
    setStats(next)
    setOutcome(o)
    push(next)
  }

  // Time ran out: flush the last score once (the player is frozen below).
  useEffect(() => {
    if (live || finalRef.current) return
    finalRef.current = true
    if (lastRunRef.current) push(reefStatsFrom(lastRunRef.current))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on the live -> over edge only
  }, [live])

  const over = finishedAtMount || outcome != null || !live
  const label = outcome === 'dead' ? 'OUT' : outcome === 'clear' ? 'CLEAR!' : 'TIME!'

  return (
    <div className="space-y-2">
      <div className="relative">
        {finishedAtMount ? (
          <div className="w-full rounded-xl border-2 border-retro-border bg-retro-deep" style={{ aspectRatio: '160 / 144' }} />
        ) : (
          <ReefPlayer
            level={level}
            avatarId={avatarId}
            mode="race"
            paused={over}
            onProgress={handleProgress}
            onEnd={handleEnd}
          />
        )}
        {over && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-retro-bg/60">
            <p className={cn(
              'font-pixel text-lg arcade-blink',
              outcome === 'dead' ? 'text-retro-danger' : outcome === 'clear' ? 'text-retro-win text-glow-win' : 'text-retro-dim',
            )}>
              {label}
            </p>
          </div>
        )}
      </div>
      <div className="flex justify-center gap-6 font-pixel text-[9px] text-retro-dim">
        <span>SCORE <span className="text-retro-win">{stats.score}</span></span>
        <span>PEARLS <span className="text-retro-p1">{stats.pearls}</span></span>
        <span>HEARTS <span className="text-retro-p2">{stats.hp}</span></span>
      </div>
    </div>
  )
}

export default function ReefGame(props) {
  return <RaceShell {...props} race={RACE} Racer={ReefRacer} />
}
