import { useEffect, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { db } from '../lib/firebase'
import RaceShell from '../components/RaceShell'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  AIM_GAME_MS, AIM_RADIUS_PX,
  targetAt, normalizeAimStats, applyHit, applyMiss, currentTargetIndex,
  aimRaceEntry, aimRow,
} from '../lib/aimLogic'

// Aim Trainer — N-player race (2–8). Everyone shoots the same seeded target
// sequence for 30 seconds; a tap on empty arena costs a point. Highest net
// score wins; room flow in RaceShell.

const RACE = {
  type: 'aim',
  title: 'AIM TRAINER',
  sameWhat: 'TARGETS',
  rules: [
    'HIT EACH TARGET AS IT APPEARS · 30s',
    'EVERYONE GETS THE SAME TARGETS',
    'MISS = −1 PT · HIGHEST SCORE WINS',
  ],
  baseMs: AIM_GAME_MS,
  scaled: false,
  entry: aimRaceEntry,
  isDone: () => false, // time-boxed: the round ends at the deadline
  row: (stats) => aimRow(stats),
}

function AimRacer({ round, myStats, statsPath, now }) {
  const [stats, setStats] = useState(() => normalizeAimStats(myStats))
  const statsRef = useRef(stats)
  const live = round.endsAt == null || now < round.endsAt

  const push = (next) => {
    statsRef.current = next
    setStats(next)
    update(ref(db, statsPath), next).catch(() => toast.error('SCORE SYNC FAILED — CHECK CONNECTION'))
  }

  // Register as present (0 pts) so a racer who never lands a hit still ranks
  // instead of reading as a no-show DNF.
  useEffect(() => {
    if (!myStats) update(ref(db, statsPath), statsRef.current).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round (the Racer is keyed by round id)
  }, [])

  const target = targetAt(round.seed, currentTargetIndex(stats))

  const handleHit = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!live) return
    sounds.hit(statsRef.current.hits)
    push(applyHit(statsRef.current))
  }

  const handleMiss = (e) => {
    e.preventDefault()
    if (!live) return
    sounds.miss()
    push(applyMiss(statsRef.current))
  }

  return (
    <div className="space-y-2">
      <div
        onPointerDown={handleMiss}
        className={cn(
          'relative w-full h-[min(16rem,52vh)] rounded-xl border-2 overflow-hidden select-none',
          live ? 'bg-retro-surface border-retro-border cursor-crosshair' : 'bg-retro-surface/60 border-retro-border/50',
        )}
        style={{ touchAction: 'manipulation' }}
      >
        {live && (
          <button
            onPointerDown={handleHit}
            onKeyDown={e => {
              if (e.repeat) return
              if (e.code === 'Space' || e.code === 'Enter') handleHit(e)
            }}
            style={{
              position: 'absolute',
              left: `${target.xPct * 100}%`,
              top: `${target.yPct * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: AIM_RADIUS_PX * 2,
              height: AIM_RADIUS_PX * 2,
            }}
            className="rounded-full bg-retro-p1 shadow-neon-p1 hover:brightness-110 active:scale-90 transition-transform duration-75 flex items-center justify-center"
            aria-label={`Target ${stats.hits + 1}`}
          >
            <span className="font-pixel text-[10px] text-retro-bg leading-none select-none" aria-hidden="true">●</span>
          </button>
        )}
        {!live && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="font-pixel text-[10px] text-retro-dim arcade-blink">TIME!</p>
          </div>
        )}
      </div>
      <div className="flex justify-center gap-6 font-pixel text-[9px] text-retro-dim">
        <span>SCORE <span className="text-retro-win">{stats.score}</span></span>
        <span>HITS <span className="text-retro-p1">{stats.hits}</span></span>
        <span>MISS <span className="text-retro-p2">{stats.misses}</span></span>
      </div>
    </div>
  )
}

export default function AimTrainerGame(props) {
  return <RaceShell {...props} race={RACE} Racer={AimRacer} />
}
