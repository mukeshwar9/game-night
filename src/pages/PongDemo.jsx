import { useEffect, useRef, useState } from 'react'
import PongArena from '../components/PongArena'
import { usePongControls } from '../hooks/usePongControls'
import { usePongFx } from '../hooks/usePongFx'
import {
  createState, step, computeAI, getRoundWinner, isSuddenDeath,
  paddleHalf, MODES, AI_LEVELS, PICKUP_INFO, PADDLE_SPEED, getMode,
} from '../lib/pongLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo Pong: pick a mode (and bot skill), then play full-screen against a
// reaction-handicapped bot — or, in SURVIVAL, against a wall. Runs the pure
// sim locally with no networking; the way to iterate on physics and feel.

const DT = 1 / 120
const COUNTDOWN_MS = 1500
const SOLO_MODES = ['classic', 'chaos', 'blitz', 'survival', 'pure']
const BEST_KEY = 'pong-survival-best'
const SETUP_KEY = 'pong-solo-setup'

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

const viewOf = (s) => ({
  mode: s.mode, balls: s.balls, paddles: s.paddles, pickups: s.pickups, effects: s.effects,
  ballMod: s.ballMod, time: s.time, clock: s.clock, rally: s.rally, lives: s.lives,
  score: s.score, serving: s.serveIn > 0,
})

function Choice({ active, onClick, children, sub }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'min-h-11 px-2 py-2 rounded border-2 font-pixel text-[9px] transition-all active:scale-95 text-center',
        active
          ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
          : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
      )}
    >
      <span className="block">{children}</span>
      {sub && <span className="block mt-1 text-[8px] leading-snug opacity-80">{sub}</span>}
    </button>
  )
}

function Setup({ setup, setSetup, best, onPlay }) {
  const mode = getMode(setup.mode)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="font-pixel text-[8px] text-retro-dim text-center tracking-widest">MODE</p>
        <div className="grid grid-cols-2 gap-2">
          {SOLO_MODES.map(id => (
            <Choice key={id} active={setup.mode === id} onClick={() => setSetup({ ...setup, mode: id })} sub={MODES[id].blurb}>
              {MODES[id].label}
            </Choice>
          ))}
        </div>
      </div>
      {!mode.wall && (
        <div className="space-y-2">
          <p className="font-pixel text-[8px] text-retro-dim text-center tracking-widest">BOT</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(AI_LEVELS).map(([id, lvl]) => (
              <Choice key={id} active={setup.level === id} onClick={() => setSetup({ ...setup, level: id })}>
                {lvl.label}
              </Choice>
            ))}
          </div>
        </div>
      )}
      {mode.wall && (
        <p className="font-pixel text-[8px] text-retro-dim text-center">BEST RUN: <span className="text-retro-cta">{best}</span> RETURNS</p>
      )}
      {mode.powerups && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          {(mode.kinds || Object.keys(PICKUP_INFO)).map(k => (
            <span key={k} className="font-pixel text-[8px] text-retro-dim">
              <span className="text-retro-text">{PICKUP_INFO[k].glyph}</span> {PICKUP_INFO[k].name}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={onPlay}
        className="w-full min-h-12 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta active:scale-95 transition-all"
      >
        PLAY FULL SCREEN
      </button>
      <p className="font-pixel text-[8px] text-retro-dim/80 text-center leading-relaxed">
        DRAG ANYWHERE TO MOVE<span className="kbd-hint"> · KEYS WORK TOO</span> · FLICK THE PADDLE AS YOU HIT TO CURVE THE BALL
      </p>
    </div>
  )
}

function Match({ setup, onExit, onBest }) {
  const courtRef = useRef(null)
  const touchRef = useRef(null)
  const viewRef = useRef(null)
  const [initial] = useState(() => createState({ mode: setup.mode, serveTo: 'O' }))
  const simRef = useRef(initial)
  const [view, setView] = useState(() => viewOf(initial))
  const [result, setResult] = useState(null)
  const [countdown, setCountdown] = useState(Math.ceil(COUNTDOWN_MS / 1000))
  const [paused, setPaused] = useState(false)
  const [runKey, setRunKey] = useState(0)
  const { fx, emit, reset: resetFx } = usePongFx({ mySide: 'X' })
  const { getDir } = usePongControls(courtRef, !result, { touchRef, viewRef })
  const survival = !!getMode(setup.mode).wall
  const level = AI_LEVELS[setup.level] || AI_LEVELS.normal

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') setPaused(p => !p)
    }
    const onHide = () => { if (document.hidden) setPaused(true) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onHide)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onHide) }
  }, [])

  useEffect(() => {
    if (result || paused) return
    let raf, last = performance.now(), acc = 0, aiDir = 0, aiAt = 0
    const startAt = last + (countdown > 0 ? countdown * 1000 : 0)
    let shownCount = countdown
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      if (now < startAt) {
        const c = Math.ceil((startAt - now) / 1000)
        if (c !== shownCount) { shownCount = c; setCountdown(c) }
        // Let the player line up during the countdown.
        const s = simRef.current
        const eh = paddleHalf(s.effects, 'X')
        const y = s.paddles.X + getDir(s.paddles.X) * PADDLE_SPEED * Math.min((now - last) / 1000, 0.1)
        simRef.current = { ...s, paddles: { ...s.paddles, X: Math.max(eh, Math.min(1 - eh, y)) } }
        last = now
        setView(viewOf(simRef.current))
        return
      }
      if (shownCount !== 0) { shownCount = 0; setCountdown(0) }
      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1
      acc += dt
      if (now - aiAt > level.reactMs) { aiAt = now; aiDir = computeAI(simRef.current, 'O', level) }
      const inputs = { X: getDir(simRef.current.paddles.X), O: survival ? 0 : aiDir }
      const events = []
      while (acc >= DT) {
        const r = step(simRef.current, inputs, DT)
        simRef.current = r.state
        if (r.events.length) events.push(...r.events)
        acc -= DT
      }
      if (events.length) {
        emit(events.map(e => (e.type === 'timeup' ? { ...e, suddenDeath: isSuddenDeath(simRef.current) } : e)))
      }
      setView(viewOf(simRef.current))
      const w = getRoundWinner(simRef.current)
      if (w) {
        cancelAnimationFrame(raf)
        const s = simRef.current
        if (survival) {
          onBest(s.score.X)
          sounds.lose()
        } else if (w === 'X') sounds.win()
        else sounds.lose()
        setResult({ winner: w, score: s.score })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [result, paused, runKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    simRef.current = createState({ mode: setup.mode, serveTo: 'O' })
    setView(viewOf(simRef.current))
    resetFx()
    setResult(null)
    setPaused(false)
    setCountdown(Math.ceil(COUNTDOWN_MS / 1000))
    setRunKey(k => k + 1)
  }

  const iconBtn = 'min-h-10 min-w-10 px-2 font-pixel text-[9px] text-retro-dim hover:text-retro-text border border-retro-border rounded bg-retro-card active:scale-95'
  const actions = (
    <>
      {!result && (
        <button className={iconBtn} onClick={() => setPaused(p => !p)} aria-label={paused ? 'Resume' : 'Pause'}>
          {paused ? '▶' : 'II'}
        </button>
      )}
      <button className={iconBtn} onClick={onExit} aria-label="Exit to menu">✕</button>
    </>
  )

  let overlay = null
  if (result) {
    const s = result.score
    overlay = (
      <div className="space-y-3">
        <p className={cn('font-pixel text-lg', survival || result.winner === 'O' ? 'text-retro-danger text-glow-danger' : 'text-retro-win text-glow-win')}>
          {survival ? 'GAME OVER' : result.winner === 'X' ? 'YOU WIN!' : 'BOT WINS'}
        </p>
        <p className="font-pixel text-[10px] text-retro-text">
          {survival ? `${s.X} RETURNS` : `${s.X} – ${s.O}`}
        </p>
        {survival && <p className="font-pixel text-[8px] text-retro-dim">BEST {setup.best}</p>}
        <div className="flex gap-2 justify-center pt-1">
          <button onClick={restart} className="min-h-11 px-4 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
            PLAY AGAIN
          </button>
          <button onClick={onExit} className="min-h-11 px-4 border border-retro-border text-retro-dim font-pixel text-[10px] rounded hover:text-retro-text active:scale-95">
            MENU
          </button>
        </div>
      </div>
    )
  } else if (paused) {
    overlay = (
      <div className="space-y-3">
        <p className="font-pixel text-base text-retro-cta text-glow-cta">PAUSED</p>
        <button onClick={() => setPaused(false)} className="min-h-11 px-5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded active:scale-95">
          RESUME
        </button>
      </div>
    )
  } else if (countdown > 0) {
    overlay = <p className="font-pixel text-4xl text-retro-cta text-glow-cta">{countdown}</p>
  }

  return (
    <PongArena
      fullscreen
      mySide="X"
      names={{ X: 'YOU', O: survival ? 'WALL' : `BOT · ${level.label}` }}
      points={{ X: view.score.X, O: view.score.O }}
      view={view}
      fx={fx}
      overlay={overlay}
      actions={actions}
      courtRef={courtRef}
      touchRef={touchRef}
      viewRef={viewRef}
      best={survival ? setup.best : null}
    />
  )
}

export default function PongDemo() {
  const [setup, setSetupState] = useState(() => {
    const saved = readJSON(SETUP_KEY, {})
    return {
      mode: MODES[saved.mode] ? saved.mode : 'classic',
      level: AI_LEVELS[saved.level] ? saved.level : 'normal',
    }
  })
  const [best, setBest] = useState(() => Number(readJSON(BEST_KEY, 0)) || 0)
  const [playing, setPlaying] = useState(false)
  const setSetup = (next) => { setSetupState(next); writeJSON(SETUP_KEY, next) }
  const recordBest = (n) => {
    if (n > best) { setBest(n); writeJSON(BEST_KEY, n) }
  }

  return (
    <>
      <Setup setup={setup} setSetup={setSetup} best={best} onPlay={() => setPlaying(true)} />
      {playing && (
        <Match
          setup={{ ...setup, best }}
          onExit={() => setPlaying(false)}
          onBest={recordBest}
        />
      )}
    </>
  )
}
