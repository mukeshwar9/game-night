import { useEffect, useRef, useState } from 'react'
import PacmacArena, { PacmacDpad } from '../components/PacmacArena'
import { usePacmacControls } from '../hooks/usePacmacControls'
import {
  createState, step, computeAI, getWinner, AI_DIFFICULTIES, MATCH_TARGET,
} from '../lib/pacmacLogic'
import { playPacmacSfx, isCoarsePointer, PACMAC_RULES_LINE } from '../lib/pacmacUi'
import { cn } from '@/lib/utils'

const BOT = AI_DIFFICULTIES.normal
const COUNTDOWN_S = 3

function viewOf(sim, countdown = 0) {
  return {
    pellets: sim.pellets,
    players: sim.players,
    ghosts: sim.ghosts,
    scoreX: sim.scoreX,
    scoreO: sim.scoreO,
    timeLeft: sim.timeLeft,
    clock: sim.clock,
    countdown,
  }
}

// Solo PAC MAC: you (X) vs a bot (O) on the real sim, no networking. The
// round waits for a tap/key so it never runs while scrolled out of view.
export default function PacmacDemo() {
  const zoneRef = useRef(null)
  const simRef = useRef(null)
  const [view, setView] = useState(() => viewOf(createState()))
  const [phase, setPhase] = useState('ready') // ready | countdown | playing | over
  const [winner, setWinner] = useState(null)
  const [wins, setWins] = useState({ X: 0, O: 0 })
  const [coarse] = useState(isCoarsePointer)
  const { getDir, press } = usePacmacControls(zoneRef, phase === 'playing' || phase === 'countdown')
  const wantRef = useRef(null)

  useEffect(() => {
    if (phase !== 'countdown') return
    const startAt = performance.now()
    let raf
    const loop = (now) => {
      const left = COUNTDOWN_S - (now - startAt) / 1000
      const d = getDir()
      if (d) wantRef.current = d
      if (left <= 0) { setPhase('playing'); return }
      setView(viewOf(simRef.current, Math.ceil(left)))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, getDir])

  useEffect(() => {
    if (phase !== 'playing') return
    const DT = 1 / 120
    let raf
    let last = performance.now()
    let acc = 0
    let aiAt = 0
    let aiDir = null
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      acc += Math.min(0.1, (now - last) / 1000)
      last = now
      const d = getDir()
      if (d) wantRef.current = d
      let s = simRef.current
      while (acc >= DT) {
        if (now - aiAt >= BOT.replanMs) {
          aiAt = now
          aiDir = computeAI(s, 'O', BOT)
        }
        const res = step(s, { X: wantRef.current, O: aiDir }, DT)
        wantRef.current = null
        s = res.state
        for (const e of res.events) playPacmacSfx(e, 'X')
        acc -= DT
      }
      simRef.current = s
      setView(viewOf(s))
      const w = getWinner(s)
      if (w) {
        cancelAnimationFrame(raf)
        if (w !== 'draw') setWins(prev => ({ ...prev, [w]: prev[w] + 1 }))
        setWinner(w)
        setPhase('over')
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, getDir])

  const start = (resetMatch = false) => {
    if (resetMatch) setWins({ X: 0, O: 0 })
    simRef.current = createState({ rng: Date.now() >>> 0 })
    wantRef.current = null
    setView(viewOf(simRef.current))
    setWinner(null)
    setPhase('countdown')
  }

  const matchOver = wins.X >= MATCH_TARGET || wins.O >= MATCH_TARGET

  let overlay = null
  if (phase === 'ready') {
    overlay = (
      <div className="text-center space-y-3 px-6">
        <p className="font-pixel text-[9px] leading-relaxed text-retro-text">{PACMAC_RULES_LINE}</p>
        <button
          type="button"
          onClick={() => start()}
          className="px-5 py-3 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
        >
          START
        </button>
      </div>
    )
  } else if (phase === 'countdown') {
    overlay = <p className="font-pixel text-5xl text-retro-win text-glow-win">{view.countdown}</p>
  } else if (phase === 'over') {
    overlay = (
      <div className="text-center space-y-3">
        <p className="font-pixel text-base text-retro-win text-glow-win">
          {winner === 'X' ? 'YOU WIN!' : winner === 'O' ? 'BOT WINS' : 'DRAW'}
        </p>
        {matchOver && (
          <p className="font-pixel text-[9px] text-retro-text">
            {wins.X >= MATCH_TARGET ? 'MATCH: YOU' : 'MATCH: BOT'}
          </p>
        )}
        <button
          type="button"
          onClick={() => start(matchOver)}
          className="px-5 py-3 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
        >
          {matchOver ? 'NEW MATCH' : 'NEXT ROUND'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2" style={{ '--pacmac-reserve': coarse ? '292px' : '190px' }}>
      <div className="flex justify-center gap-6 font-pixel text-[10px]">
        <span className={cn('text-retro-p1', wins.X >= MATCH_TARGET && 'text-glow-p1')}>YOU {wins.X}</span>
        <span className="text-retro-dim">FIRST TO {MATCH_TARGET}</span>
        <span className={cn('text-retro-p2', wins.O >= MATCH_TARGET && 'text-glow-p2')}>{wins.O} BOT</span>
      </div>
      <div ref={zoneRef} className="space-y-3">
        <PacmacArena
          pellets={view.pellets}
          players={view.players}
          ghosts={view.ghosts}
          scoreX={view.scoreX}
          scoreO={view.scoreO}
          timeLeft={view.timeLeft}
          mySide="X"
          namesX="YOU"
          namesO="BOT"
          showYou={phase === 'countdown' || (phase === 'playing' && view.clock < 2)}
          overlay={overlay}
        />
        {coarse
          ? <PacmacDpad onPress={press} disabled={phase !== 'playing' && phase !== 'countdown'} />
          : <p className="text-center font-pixel text-[8px] text-retro-dim">↑ ↓ ← → OR WASD</p>}
      </div>
    </div>
  )
}
