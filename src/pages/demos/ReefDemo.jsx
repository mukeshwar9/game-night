import { useMemo, useRef, useState } from 'react'
import ReefPlayer from '../../components/ReefPlayer'
import { buildLevel, LEVEL_COUNT } from '../../lib/reefLevels'
import { continueRun } from '../../lib/reefLogic'
import { defaultAvatarForId } from '../../lib/avatars'
import { getPlayerId } from '../../lib/playerId'
import { cn } from '@/lib/utils'

// Reef Run solo: a 6-level campaign. Score carries over between levels, a
// death can be continued from the last checkpoint (2 continues per
// campaign), and the best score is kept in localStorage.

const BEST_KEY = 'reef-best'
const CONTINUES = 2
const EMPTY_CARRY = { score: 0, pearls: 0, stars: 0 }

function readAvatar() {
  try {
    return localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  } catch {
    return defaultAvatarForId(getPlayerId())
  }
}

function readBest() {
  try {
    const n = parseInt(localStorage.getItem(BEST_KEY), 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeBest(n) {
  try { localStorage.setItem(BEST_KEY, String(n)) } catch { /* storage unavailable */ }
}

const primaryBtn = 'px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95'
const ghostBtn = 'px-6 py-2 border border-retro-border text-retro-dim font-pixel text-[10px] rounded hover:text-retro-text active:scale-95'

function Card({ children }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-retro-bg/85 p-4 text-center">
      {children}
    </div>
  )
}

export default function ReefDemo() {
  const [avatarId] = useState(readAvatar)
  const [phase, setPhase] = useState('idle') // idle | play | clear | dead | result
  const [campaign, setCampaign] = useState(0)
  const [seed, setSeed] = useState(1)
  const [levelIdx, setLevelIdx] = useState(0)
  const [carry, setCarry] = useState(EMPTY_CARRY)
  const [continues, setContinues] = useState(CONTINUES)
  const [best, setBest] = useState(readBest)
  const [result, setResult] = useState(null) // { score, pearls, stars, newBest, cleared }
  const [summary, setSummary] = useState(null) // last level-clear numbers
  const endRun = useRef(null)

  const level = useMemo(() => buildLevel(levelIdx, seed), [levelIdx, seed])

  const start = () => {
    setSeed(Math.floor(Math.random() * 2 ** 31) + 1)
    setCampaign(c => c + 1)
    setLevelIdx(0)
    setCarry(EMPTY_CARRY)
    setContinues(CONTINUES)
    setResult(null)
    setSummary(null)
    setPhase('play')
  }

  const finish = (run, cleared) => {
    const score = run.score
    const newBest = score > best
    if (newBest) { writeBest(score); setBest(score) }
    setResult({ score, pearls: run.pearls, stars: run.stars, newBest, cleared })
    setPhase('result')
  }

  const handleEnd = ({ outcome, run }) => {
    endRun.current = run
    if (outcome === 'clear') {
      setSummary({
        bonus: run.bonus,
        score: run.score,
        stars: run.stars - carry.stars,
        total: level.starCount,
      })
      if (levelIdx >= LEVEL_COUNT - 1) finish(run, true)
      else setPhase('clear')
    } else if (continues > 0) {
      setPhase('dead')
    } else {
      finish(run, false)
    }
  }

  const nextLevel = () => {
    const run = endRun.current
    setCarry({ score: run.score, pearls: run.pearls, stars: run.stars })
    setLevelIdx(i => i + 1)
    setPhase('play')
  }

  const useContinue = () => {
    const run = endRun.current
    continueRun(run, level)
    setContinues(c => c - 1)
    setPhase('play')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 font-pixel text-[8px] text-retro-dim">
        <span>LEVEL <span className="text-retro-p1">{Math.min(levelIdx + 1, LEVEL_COUNT)}/{LEVEL_COUNT}</span> {phase !== 'idle' && level.name}</span>
        <span>BEST <span className="text-retro-win">{best}</span></span>
      </div>

      <div className="relative">
        {phase === 'idle' ? (
          <div className="w-full rounded-xl border-2 border-retro-border bg-retro-deep" style={{ aspectRatio: '160 / 144' }} />
        ) : (
          <ReefPlayer
            key={`${campaign}-${levelIdx}`}
            level={level}
            avatarId={avatarId}
            mode="solo"
            carry={carry}
            paused={phase !== 'play'}
            onEnd={handleEnd}
          />
        )}

        {phase === 'idle' && (
          <Card>
            <p className="font-pixel text-sm text-retro-text text-glow-cta">REEF RUN</p>
            <p className="font-pixel text-[8px] text-retro-dim leading-loose">
              SWIM TO THE GOAL · ARROWS / WASD OR JOYSTICK<br />
              X / SPACE = DASH · GRAB PEARLS AND STARS<br />
              DODGE JELLIES, SHARKS AND MINES · 6 LEVELS
            </p>
            <button type="button" onClick={start} className={primaryBtn}>PLAY</button>
          </Card>
        )}

        {phase === 'clear' && summary && (
          <Card>
            <p className="font-pixel text-sm text-retro-win text-glow-win">LEVEL CLEAR!</p>
            <p className="font-pixel text-[9px] text-retro-dim leading-loose">
              BONUS <span className="text-retro-cta">+{summary.bonus}</span><br />
              SCORE <span className="text-retro-win">{summary.score}</span><br />
              STARS <span className="text-retro-p1">{summary.stars}/{summary.total}</span>
            </p>
            <button type="button" onClick={nextLevel} className={primaryBtn}>NEXT LEVEL</button>
          </Card>
        )}

        {phase === 'dead' && (
          <Card>
            <p className="font-pixel text-sm text-retro-danger">OUT OF HEARTS</p>
            <p className="font-pixel text-[9px] text-retro-dim">
              CONTINUES LEFT <span className="text-retro-cta">{continues}</span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={useContinue} className={primaryBtn}>CONTINUE</button>
              <button type="button" onClick={() => finish(endRun.current, false)} className={ghostBtn}>FINISH</button>
            </div>
          </Card>
        )}

        {phase === 'result' && result && (
          <Card>
            <p className={cn('font-pixel text-sm', result.cleared ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {result.cleared ? 'REEF COMPLETE!' : 'GAME OVER'}
            </p>
            <p className="font-pixel text-2xl text-retro-win tabular-nums">{result.score}</p>
            <p className="font-pixel text-[8px] text-retro-dim">
              {result.pearls} PEARLS · {result.stars} STARS
            </p>
            {result.newBest ? (
              <p className="font-pixel text-[9px] text-retro-cta arcade-blink">NEW BEST!</p>
            ) : (
              <p className="font-pixel text-[8px] text-retro-dim">BEST {best}</p>
            )}
            <button type="button" onClick={start} className={primaryBtn}>PLAY AGAIN</button>
          </Card>
        )}
      </div>
    </div>
  )
}
