import { useEffect, useRef, useState } from 'react'
import SumoArena from '../components/SumoArena'
import { useSumoControls } from '../hooks/useSumoControls'
import { useSumoFx } from '../hooks/useSumoFx'
import {
  createState, stepFrame, createBot, pollBot, getWinner, RINGOUT_HOLD_MS,
} from '../lib/sumoLogic'
import { sounds } from '../lib/sounds'

const DT = 1 / 120

const viewOf = (sim) => ({ blobs: sim.blobs, arenaR: sim.arenaR, t: sim.t })

export default function SumoDemo() {
  const arenaRef = useRef(null)
  const simRef = useRef(null)
  if (simRef.current == null) simRef.current = createState()
  const [view, setView] = useState(() => viewOf(createState()))
  // `over` stops play the moment someone is out; `winner` (the result
  // overlay) follows once the ring-out has played (RINGOUT_HOLD_MS).
  const [over, setOver] = useState(null)
  const [winner, setWinner] = useState(null)
  const [round, setRound] = useState(0)
  // The round waits for the player's first PUSH — the gesture that unlocks
  // audio, so the opening gong is heard.
  const [started, setStarted] = useState(false)
  const { getTap, press } = useSumoControls(!over)
  const { fx, onTap, onEvents, onFrame, start, reset: resetFx } = useSumoFx({ mySide: 'X' })

  useEffect(() => {
    if (started) return
    let raf
    const wait = () => {
      if (getTap()) { setStarted(true); return }
      raf = requestAnimationFrame(wait)
    }
    raf = requestAnimationFrame(wait)
    return () => cancelAnimationFrame(raf)
  }, [started]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (over || !started) return
    start()
    // Taps and the bot's decisions wait here until a substep consumes them,
    // and each one is a single impulse (stepFrame applies taps to the first
    // substep only) — the player and the bot push by the same rule.
    let raf, last = performance.now(), acc = 0, bot = createBot(), tapX = 0, tapO = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1
      acc += dt
      const tap = getTap()
      if (tap) { tapX += tap; onTap() }
      const b = pollBot(bot, simRef.current, 'O', now)
      bot = b.bot
      tapO += b.press
      const r = stepFrame(simRef.current, { X: { press: tapX }, O: { press: tapO } }, acc, DT)
      simRef.current = r.state
      acc = r.acc
      if (r.consumed) { tapX = 0; tapO = 0 }
      const v = viewOf(simRef.current)
      onEvents(r.events, v.blobs)
      onFrame(v, now)
      setView(v)
      const w = getWinner(simRef.current)
      if (w) { setOver(w); cancelAnimationFrame(raf) }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [over, round, started]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!over) return
    const t = setTimeout(() => {
      setWinner(over)
      if (over === 'X') sounds.win()
      else if (over === 'O') sounds.lose()
      else sounds.draw()
    }, RINGOUT_HOLD_MS)
    return () => clearTimeout(t)
  }, [over])

  const reset = () => {
    simRef.current = createState()
    resetFx()
    setView(viewOf(simRef.current))
    setOver(null)
    setWinner(null)
    setRound(n => n + 1)
  }

  const overlay = winner ? (
    <p className="font-pixel text-base text-retro-cta text-glow-cta">
      {winner === 'X' ? 'YOU WIN!' : winner === 'O' ? 'BOT WINS' : 'DOUBLE OUT — DRAW'}
    </p>
  ) : !started ? (
    <p className="font-pixel text-[10px] text-retro-cta text-glow-cta text-center leading-relaxed px-4">
      PUSH TO START
      <span className="block text-retro-dim mt-2">TAP FASTER THAN THE BOT</span>
    </p>
  ) : null

  return (
    <div className="space-y-3">
      <SumoArena
        ref={arenaRef}
        blobs={view.blobs}
        arenaR={view.arenaR}
        t={view.t}
        fx={fx}
        mySide="X"
        namesX="YOU"
        namesO="BOT"
        overlay={overlay}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">PUSH THE BOT OFF THE DOHYO</p>
      {!over && (
        <div className="flex justify-center pt-1">
          <button
            data-sumo-push
            onPointerDown={(e) => { e.preventDefault(); press() }}
            onKeyDown={(e) => {
              if (e.key !== ' ' && e.key !== 'Enter') return
              e.preventDefault()
              press()
            }}
            className="px-10 py-4 bg-retro-cta text-retro-bg font-pixel text-sm rounded-lg hover:shadow-neon-cta press active:bg-retro-cta/80 select-none touch-none"
          >
            PUSH
          </button>
        </div>
      )}
      {winner && (
        <div className="flex justify-center">
          <button onClick={reset} className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta press">
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  )
}
