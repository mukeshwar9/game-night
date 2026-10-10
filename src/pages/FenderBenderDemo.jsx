import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FenderArena, FenderPad } from '../components/FenderBoard'
import { SEAT_STYLES } from '../components/fenderSeats'
import { useFenderControls } from '../hooks/useFenderControls'
import {
  BOT_LEVELS, MIN_PLAYERS, MAX_PLAYERS, HORN_COOLDOWN, createState, step, computeAI, getRoundResult, addRound, matchWinner, matchTarget,
} from '../lib/fenderLogic'
import { playFenderEvent } from '../lib/fenderSound'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'

// FENDER BENDER on one device: solo against 1–3 bots, or 2–4 people sharing one
// phone laid flat (a pad at each end). The same sim the online duel runs, with
// no network in between. Behind the setup panel the bots play for real.

const DT = 1 / 120
const COUNT_S = 2.1          // 3 · 2 · 1 · GO
const END_HOLD_S = 1.1       // let the wreck play out before the result panel
const ATTRACT_PAUSE_S = 1.6
const LEVEL_LABELS = ['EASY', 'NORMAL', 'HARD']
const seed = () => (Math.random() * 1e9) | 0
const blankPts = () => [0, 0, 0, 0]

const chip = (on) => cn(
  'px-3 py-1.5 min-h-9 font-pixel text-[8px] uppercase rounded border-2 transition press flex flex-col items-center gap-0.5',
  on ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
)

export default function FenderBenderDemo({ mode: routeMode } = {}) {
  const [cfg, setCfg] = useState({ mode: routeMode === 'local' ? 'phone' : 'bots', n: 2, level: 1 })
  const [phase, setPhase] = useState('idle')            // idle | count | play | end
  const [match, setMatch] = useState({ pts: blankPts(), round: 0 })
  const [outcome, setOutcome] = useState(null)          // { winner, matchOver, gained }
  const [record, setRecord] = useState(() => readBotRecord('fenderbender'))
  const [hud, setHud] = useState([])
  const [count, setCount] = useState('')

  const simRef = useRef(null)
  const phaseRef = useRef('idle')
  const cfgRef = useRef(cfg)
  const matchRef = useRef(match)
  const rendererRef = useRef(null)
  const timers = useRef({ count: 0, hold: 0, pause: 0, enter: 0 })
  const hudKey = useRef('')
  const botHq = useRef([0, 0, 0, 0])
  const lastLabel = useRef('')

  const keymap = cfg.mode === 'phone' ? { 0: 'arrows', 1: 'wasd' } : { 0: 'both' }
  const ctl = useFenderControls({ count: cfg.n, keymap, enabled: phase === 'play' || phase === 'count' })
  const ctlRef = useRef(ctl)
  useEffect(() => { ctlRef.current = ctl })

  const setPhaseBoth = useCallback((p) => { phaseRef.current = p; setPhase(p) }, [])

  const freshRound = useCallback((withCount) => {
    simRef.current = createState({ players: cfgRef.current.n, seed: seed() })
    rendererRef.current?.reset()
    hudKey.current = ''
    botHq.current = [0, 0, 0, 0]
    timers.current.hold = 0
    timers.current.pause = 0
    ctlRef.current.reset()
    if (withCount) {
      timers.current.count = COUNT_S
      lastLabel.current = '3'
      setCount('3')
      setPhaseBoth('count')
    }
  }, [setPhaseBoth])

  // A change of mode, car count or bot level goes back to the attract screen
  // with a fresh table and a fresh match.
  const applyCfg = useCallback((patch) => {
    const next = { ...cfgRef.current, ...patch }
    cfgRef.current = next
    setCfg(next)
    const fresh = { pts: blankPts(), round: 0 }
    matchRef.current = fresh
    setMatch(fresh)
    setOutcome(null)
    freshRound(false)
    setPhaseBoth('idle')
  }, [freshRound, setPhaseBoth])

  const startRound = useCallback(() => {
    sounds.touch()
    setOutcome(null)
    freshRound(true)
  }, [freshRound])

  const newMatch = useCallback(() => {
    const fresh = { pts: blankPts(), round: 0 }
    matchRef.current = fresh
    setMatch(fresh)
    startRound()
  }, [startRound])

  const endRound = useCallback((sim) => {
    const result = getRoundResult(sim)
    const pts = addRound(matchRef.current.pts.slice(0, sim.n), result)
    const full = [...pts, 0, 0, 0, 0].slice(0, 4)
    const winnerIdx = matchWinner(pts)
    const next = { pts: full, round: matchRef.current.round + 1 }
    matchRef.current = next
    setMatch(next)
    const human = cfgRef.current.mode === 'phone' ? null : 0
    if (winnerIdx !== null) {
      if (human === null || winnerIdx === human) sounds.matchWin(); else sounds.lose()
      if (human !== null) setRecord(recordBotResult('fenderbender', BOT_LEVELS[cfgRef.current.level], winnerIdx === human ? 'win' : 'loss'))
    } else if (result.winner === 'draw') sounds.draw()
    else if (human === null || result.winner === human) sounds.win()
    else sounds.lose()
    setOutcome({ winner: result.winner, matchOver: winnerIdx !== null, matchWinner: winnerIdx, gained: result.gained })
    setPhaseBoth('end')
  }, [setPhaseBoth])

  // One loop for the screen's whole life; it reads everything through refs.
  useEffect(() => {
    let raf = 0
    let last = 0
    let acc = 0
    const loop = (ts) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0)
      last = ts
      if (!simRef.current) simRef.current = createState({ players: cfgRef.current.n, seed: seed() })
      const sim = simRef.current
      const ph = phaseRef.current
      const c = cfgRef.current
      const ctls = ctlRef.current

      if (ph === 'count') {
        timers.current.count -= dt
        timers.current.enter = Math.max(0, (timers.current.count - 0.5) / 1.6)
        const label = timers.current.count > 0.5 ? String(Math.ceil((timers.current.count - 0.5) / 0.55)) : 'GO'
        if (label !== lastLabel.current) {
          lastLabel.current = label
          setCount(label)
          if (label === 'GO') sounds.go(); else sounds.touch()
        }
        if (timers.current.count <= 0) { timers.current.enter = 0; lastLabel.current = ''; setCount(''); setPhaseBoth('play') }
      } else if (ph === 'idle' || ph === 'play') {
        // bots drive every seat in attract mode, and the non-human seats in a game
        acc += dt
        const inputs = []
        for (let i = 0; i < sim.n; i++) {
          if (ph === 'play' && (c.mode === 'phone' || i === 0)) { inputs.push(ctls.getInput(i)); continue }
          const ai = computeAI(simRef.current, i, ph === 'idle' ? 1 : c.level)
          if (ai.horn) botHq.current[i] += 1
          inputs.push({ x: ai.x, y: ai.y, hq: botHq.current[i] })
        }
        while (acc >= DT && !simRef.current.over) {
          const res = step(simRef.current, inputs, DT)
          simRef.current = res.state
          for (const e of res.events) {
            rendererRef.current?.event(e, res.state)
            if (ph === 'play') playFenderEvent(e)
          }
          acc -= DT
        }
        if (simRef.current.over) {
          acc = 0
          if (ph === 'play') {
            timers.current.hold += dt
            if (timers.current.hold >= END_HOLD_S) { timers.current.hold = 0; endRound(simRef.current) }
          } else {
            timers.current.pause += dt
            if (timers.current.pause >= ATTRACT_PAUSE_S) {
              timers.current.pause = 0
              simRef.current = createState({ players: c.n, seed: seed() })
              rendererRef.current?.reset()
            }
          }
        }
      }

      // The pads' hearts and recharge ring: only re-render when something changed.
      const s = simRef.current
      const info = s.cars.map((car, i) => ({
        alive: car.alive, hp: car.hp, ghost: !!s.ghosts[i] && !car.alive, cd: car.cd, hornOn: s.opts.horn,
        pts: matchRef.current.pts[i],
      }))
      const key = info.map((x) => `${x.alive ? 1 : 0}${x.hp}${x.ghost ? 1 : 0}${Math.ceil(x.cd)}${x.pts}`).join('|')
      if (key !== hudKey.current) { hudKey.current = key; setHud(info) }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [endRound, setPhaseBoth])

  const getView = useCallback(() => simRef.current, [])
  const getUi = useCallback(() => ({
    running: phaseRef.current !== 'end',
    enter: phaseRef.current === 'count' ? timers.current.enter : 0,
    mySeat: cfgRef.current.mode === 'bots' ? 0 : undefined,
  }), [])

  const n = cfg.n
  const phone = cfg.mode === 'phone'
  const names = useMemo(() => Array.from({ length: n }, (_, i) => (phone || i === 0 ? `P${i + 1}` : `P${i + 1} BOT`)), [n, phone])
  const bottom = []
  const top = []
  for (let i = 0; i < n; i++) (i % 2 === 0 ? bottom : top).push(i)
  const padFor = (i) => (
    <FenderPad
      key={i} seat={i} name={names[i]} bind={ctl.bind} getKnob={ctl.getKnob} info={hud[i]}
      enabled={(phone || i === 0) && phase !== 'idle' && phase !== 'end'} flip={phone && i % 2 === 1}
      className="flex-1 basis-0"
    />
  )
  const target = matchTarget(n)
  const playing = phase === 'play' || phase === 'count'
  const showSetup = phase === 'idle'
  const winnerName = outcome && outcome.winner !== 'draw' ? names[outcome.winner].replace(' BOT', '') : null

  return (
    <div className="mx-auto space-y-2" style={{ maxWidth: 'min(100%, calc((100dvh - 330px) * 0.818))', minWidth: 'min(100%, 300px)' }}>
      {phone && <div className="flex gap-2">{top.map(padFor)}</div>}
      {!phone && (
        <div className="flex gap-1.5" aria-label="Cars">
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className={cn('flex-1 basis-0 rounded border px-1.5 py-1 font-pixel text-[7px] text-center truncate', SEAT_STYLES[i].border, SEAT_STYLES[i].text, hud[i] && !hud[i].alive && 'opacity-45')}>
              {names[i]} {hud[i]?.alive ? '♥'.repeat(hud[i].hp) : hud[i]?.ghost ? 'TRUCK' : 'OUT'}
              <span className="block text-retro-dim">PTS {match.pts[i]}</span>
            </div>
          ))}
        </div>
      )}
      <FenderArena
        getView={getView}
        getUi={getUi}
        rendererRef={rendererRef}
        overlay={(
          <>
            {count && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="font-pixel text-5xl text-retro-cta text-glow-cta" data-testid="fender-count">{count}</span>
              </div>
            )}
            {(showSetup || phase === 'end') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-retro-bg/80 p-3 text-center" data-testid="fender-panel">
                {phase === 'end' && outcome ? (
                  <>
                    <p className={cn('font-pixel text-sm leading-relaxed', outcome.matchOver ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
                      {outcome.matchOver ? `${names[outcome.matchWinner].replace(' BOT', '')} WINS THE MATCH` : outcome.winner === 'draw' ? 'DRAW: NOBODY SCORES' : `${winnerName} TAKES THE ROUND`}
                    </p>
                    <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">
                      {names.map((nm, i) => `${nm.replace(' BOT', '')} ${match.pts[i]}`).join('  ·  ')}<br />FIRST TO {target}
                    </p>
                    <button
                      onClick={outcome.matchOver ? newMatch : startRound}
                      data-testid="fender-next"
                      className="px-6 py-2.5 min-h-11 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press"
                    >
                      {outcome.matchOver ? 'NEW MATCH' : 'NEXT ROUND'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-pixel text-sm text-retro-cta text-glow-cta">FENDER BENDER</p>
                    <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">LAST CAR ROLLING WINS</p>
                    <button
                      onClick={newMatch}
                      data-testid="fender-play"
                      className="px-6 py-2.5 min-h-11 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press"
                    >
                      PLAY
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      />
      <div className="flex gap-2">{phone ? bottom.map(padFor) : padFor(0)}</div>

      {!playing && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap justify-center gap-1.5" data-testid="fender-setup">
            {LEVEL_LABELS.map((label, level) => (
              <button
                key={label}
                onClick={() => applyCfg({ mode: 'bots', level })}
                aria-pressed={cfg.mode === 'bots' && cfg.level === level}
                aria-label={`${label} bots, your record ${describeLevelRecord(record[BOT_LEVELS[level]])}`}
                className={chip(cfg.mode === 'bots' && cfg.level === level)}
              >
                <span>{label}</span>
                {formatLevelRecord(record[BOT_LEVELS[level]]) && <span className="text-[7px] text-retro-dim">{formatLevelRecord(record[BOT_LEVELS[level]])}</span>}
              </button>
            ))}
            <button onClick={() => applyCfg({ mode: 'phone' })} aria-pressed={phone} className={chip(phone)}>
              <span>ONE PHONE</span>
              <span className="text-[7px] text-retro-dim">ALL HUMAN</span>
            </button>
          </div>
          <div className="flex justify-center items-center gap-1.5">
            <span className="font-pixel text-[8px] text-retro-dim">CARS</span>
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, k) => MIN_PLAYERS + k).map((v) => (
              <button key={v} onClick={() => applyCfg({ n: v })} aria-pressed={cfg.n === v} className={cn(chip(cfg.n === v), 'min-w-10')}>{v}</button>
            ))}
          </div>
          <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
            DRAG YOUR PAD TO STEER · TAP IT TO HONK ({HORN_COOLDOWN}S RECHARGE)<br />
            {phone ? `PHONE FLAT, A PAD AT EACH END · 3 HEARTS · OFF THE ROAD IS OUT` : 'HIT TRAFFIC 3 TIMES OR LEAVE THE ROAD AND YOU ARE OUT'}<br />
            ARROWS + SPACE{phone ? ' · WASD + F FOR P2' : ' OR WASD + F'}
          </p>
        </div>
      )}
    </div>
  )
}
