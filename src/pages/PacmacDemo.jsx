import { useEffect, useRef, useState } from 'react'
import PacmacArena from '../components/PacmacArena'
import { usePacmacControls } from '../hooks/usePacmacControls'
import {
  createState, step, computeAI, getWinner, AI_DIFFICULTIES, MATCH_SECONDS, MATCH_TARGET,
} from '../lib/pacmacLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const DIFFICULTY = 'normal'
const cfg = AI_DIFFICULTIES[DIFFICULTY]

function viewOf(sim) {
  return {
    pellets: sim.pellets,
    players: sim.players,
    ghosts: sim.ghosts,
    scoreX: sim.scoreX,
    scoreO: sim.scoreO,
    timeLeft: sim.timeLeft,
  }
}

function playSfx(kind) {
  if (kind === 'pellet') sounds.move('X')
  else if (kind === 'power') sounds.join()
  else if (kind === 'eatGhost') sounds.hit()
  else if (kind === 'die') sounds.miss()
  else if (kind === 'go') sounds.bell()
}

export default function PacmacDemo() {
  const arenaRef = useRef(null)
  const simRef = useRef(null)
  if (simRef.current == null) simRef.current = createState()
  const [view, setView] = useState({
    pellets: null, players: null, ghosts: null,
    scoreX: 0, scoreO: 0, timeLeft: MATCH_SECONDS,
  })
  const [winner, setWinner] = useState(null)
  const [round, setRound] = useState(0)
  const [scoreX, setScoreX] = useState(0)
  const [scoreO, setScoreO] = useState(0)
  const { getDir } = usePacmacControls(arenaRef, !winner)
  const hostWantRef = useRef('right')
  const aiDirRef = useRef('left')

  useEffect(() => {
    if (winner) return
    let raf, last = performance.now(), aiAt = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1
      const s = simRef.current
      const d = getDir()
      if (d) hostWantRef.current = d
      if (now - aiAt >= cfg.replanMs) {
        aiAt = now
        aiDirRef.current = computeAI(s, 'O')
      }
      const inputs = { X: hostWantRef.current, O: aiDirRef.current }
      const { state: next, events } = step(s, inputs, dt)
      simRef.current = next
      for (const e of events) playSfx(e.type)
      setView(viewOf(next))
      const w = getWinner(next)
      if (w) {
        setWinner(w)
        if (w === 'X') setScoreX(n => n + 1)
        else if (w === 'O') setScoreO(n => n + 1)
        cancelAnimationFrame(raf)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [winner, round]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    simRef.current = createState()
    setView(viewOf(simRef.current))
    setWinner(null)
    hostWantRef.current = 'right'
    aiDirRef.current = 'left'
    setRound(n => n + 1)
  }

  const matchWinner = scoreX >= MATCH_TARGET ? 'X' : scoreO >= MATCH_TARGET ? 'O' : null
  const resultMsg = winner === 'X' ? 'YOU WIN!' : winner === 'O' ? 'BOT WINS' : 'DRAW'

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-6 font-pixel text-[10px]">
        <span className={cn('text-retro-p1', scoreX >= MATCH_TARGET && 'text-glow-p1')}>YOU {scoreX}</span>
        <span className="text-retro-dim">{MATCH_TARGET} WINS</span>
        <span className={cn('text-retro-p2', scoreO >= MATCH_TARGET && 'text-glow-p2')}>{scoreO} BOT</span>
      </div>
      <PacmacArena
        ref={arenaRef}
        pellets={view.pellets}
        players={view.players}
        ghosts={view.ghosts}
        scoreX={view.scoreX}
        scoreO={view.scoreO}
        timeLeft={view.timeLeft}
        mySide="X"
        namesX="YOU"
        namesO="BOT"
        overlay={winner ? (
          <div className="text-center space-y-2">
            <p className="font-pixel text-base text-retro-win text-glow-win">{resultMsg}</p>
            {!matchWinner && (
              <button onClick={reset} className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
                NEXT ROUND
              </button>
            )}
            {matchWinner && (
              <button
                onClick={() => { setScoreX(0); setScoreO(0); reset() }}
                className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
              >
                PLAY AGAIN
              </button>
            )}
          </div>
        ) : null}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">VS COMPUTER · ↑↓←→ · WASD · SWIPE</p>
      {matchWinner && (
        <p className="text-center font-pixel text-[10px] text-retro-win text-glow-win">
          {matchWinner === 'X' ? 'MATCH: YOU' : 'MATCH: BOT'}
        </p>
      )}
    </div>
  )
}
