import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ArcheryRange from '../components/ArcheryRange'
import ArcheryScorecard from '../components/ArcheryScorecard'
import useBowDraw from '../hooks/useBowDraw'
import useGameKeys from '../hooks/useGameKeys'
import {
  ARCHERY_FORMATS, ARCHERY_SEATS, advanceArcheryShot, archeryFormat,
  arrowTurn, cpuAim, idealDrawForDistance, normalizeShots, scorecard,
  shotResult, windForShot, withSteadyAim,
} from '../lib/archeryLogic'
import { readSoloBest, recordSoloBest } from '../lib/soloBest'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const BEST_KEY = 'archery-score-attack'
const SEAT_COLOR = ['text-retro-p1', 'text-retro-p2', 'text-retro-p3', 'text-retro-p4']

function newMatch(setup) {
  const seats = setup.mode === 'score' ? ['X']
    : setup.mode === 'local' ? setup.names.map((_, i) => ARCHERY_SEATS[i])
      : ['X', 'O']
  const names = setup.mode === 'score' ? { X: 'YOU' }
    : setup.mode === 'local' ? Object.fromEntries(setup.names.map((name, i) => [ARCHERY_SEATS[i], name]))
      : { X: 'YOU', O: `CPU · ${setup.level.toUpperCase().replace('-', ' ')}` }
  return {
    status: 'playing', currentTurn: 'X', archeryPhase: 'main', archeryTied: null,
    archeryShots: null, archeryShootOffShots: null, archerySeed: Math.floor(Math.random() * 1_000_000_000),
    archeryFormat: archeryFormat(setup.format), seats, names,
  }
}

function scoreRank(score) {
  if (score >= 100) return 'ROBIN HOOD'
  if (score >= 82) return 'PRO'
  if (score >= 65) return 'CLUB'
  return 'ROOKIE'
}

function Setup({ local, format, setFormat, onStart }) {
  const [count, setCount] = useState(2)
  const [names, setNames] = useState(['', '', '', ''])
  const [steady, setSteady] = useState(true)
  return (
    <div className="mx-auto w-full max-w-sm space-y-3">
      <div className="relative overflow-hidden rounded border border-retro-p1/50 bg-retro-deep p-4 text-center shadow-neon-p1">
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(transparent_50%,rgb(var(--c-p1))_51%)] bg-[length:100%_4px]" />
        <p className="relative font-pixel text-sm text-retro-p1 text-glow-p1">NEON RANGE</p>
        <p className="relative mt-2 font-mono text-[11px] leading-relaxed text-retro-dim">Three arrows per end · WA 10-ring + X · draw length is power.</p>
      </div>
      <label className="flex items-center justify-between gap-2 rounded border border-retro-border bg-retro-card px-3 py-2 font-pixel text-[8px] text-retro-dim">
        RANGE FORMAT
        <select value={format} onChange={e => setFormat(e.target.value)} className="min-h-10 min-w-0 max-w-[62%] bg-retro-deep px-2 text-retro-cta">
          {Object.entries(ARCHERY_FORMATS).map(([id, item]) => <option key={id} value={id}>{item.label} · {item.ends} ENDS</option>)}
        </select>
      </label>
      {!local ? (
        <>
          <p className="text-center font-pixel text-[9px] tracking-widest text-retro-dim">VS CPU · 4 SKILL LEVELS</p>
          {[
            ['rookie', 'ROOKIE', 'Wide miss spread · learn the draw and the wind.'],
            ['club', 'CLUB', 'A steadier sight · punishes rushed shots.'],
            ['pro', 'PRO', 'Tighter groups · watch the X ring.'],
            ['robin-hood', 'ROBIN HOOD', 'Elite accuracy · your impact reticle stays hidden.'],
          ].map(([id, title, blurb]) => (
            <button key={id} onClick={() => onStart({ mode: 'cpu', level: id, format, steady })} className="flex min-h-14 w-full items-center gap-3 rounded border border-retro-border bg-retro-card px-3 py-2 text-left hover:border-retro-cta/60 active:scale-[0.98]">
              <span className="w-24 font-pixel text-[9px] text-retro-cta">{title}</span>
              <span className="font-mono text-[10px] text-retro-dim">{blurb}</span>
            </button>
          ))}
          <button onClick={() => onStart({ mode: 'score', level: 'rookie', format, steady })} className="flex min-h-14 w-full items-center gap-3 rounded border border-retro-win/50 bg-retro-card px-3 py-2 text-left hover:shadow-neon-win active:scale-[0.98]">
            <span className="w-24 font-pixel text-[9px] text-retro-win">SCORE ATTACK</span>
            <span className="font-mono text-[10px] text-retro-dim">Solo run · personal best {readSoloBest(BEST_KEY) || '—'} · rank badge.</span>
          </button>
          <div className="flex items-center justify-between rounded border border-retro-border bg-retro-card px-3 py-2 font-mono text-[11px] text-retro-text">
            <span>STEADY AIM ASSIST</span>
            <input type="checkbox" checked={steady} onChange={e => setSteady(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--c-win))]" />
          </div>
          <Link to="/local/archery" className="flex min-h-11 items-center justify-center rounded border border-retro-border px-4 py-2 font-pixel text-[9px] text-retro-dim hover:border-retro-p1/50 hover:text-retro-p1">SAME-DEVICE PASS & PLAY →</Link>
        </>
      ) : (
        <>
          <div>
            <p className="mb-1.5 font-pixel text-[8px] text-retro-dim">ARCHERS</p>
            <div className="grid grid-cols-3 overflow-hidden rounded border-2 border-retro-border">
              {[2, 3, 4].map(n => <button key={n} type="button" onClick={() => setCount(n)} aria-pressed={count === n} className={cn('min-h-11 font-pixel text-[9px]', count === n ? 'bg-retro-cta text-retro-bg' : 'text-retro-dim')}>{n}P</button>)}
            </div>
          </div>
          <div className="space-y-2">
            {Array.from({ length: count }, (_, i) => <label key={i} className="flex items-center gap-2">
              <span className={cn('w-8 text-center font-pixel text-[10px]', SEAT_COLOR[i])}>{['●', '▲', '■', '◆'][i]}</span>
              <input value={names[i]} onChange={e => setNames(value => value.map((name, j) => j === i ? e.target.value : name))} maxLength={12} aria-label={`Archer ${i + 1} name`} placeholder={`PLAYER ${i + 1}`} className="min-h-11 min-w-0 flex-1 rounded border border-retro-border bg-retro-card px-3 font-mono text-[12px] text-retro-text" />
            </label>)}
          </div>
          <button onClick={() => onStart({ mode: 'local', format, steady, names: names.slice(0, count).map((name, i) => (name.trim() || `PLAYER ${i + 1}`).toUpperCase()), gate: true })} className="min-h-12 w-full rounded bg-retro-cta py-3 font-pixel text-xs text-retro-bg">START RANGE</button>
          <p className="text-center font-mono text-[10px] text-retro-dim">Hand-off screen between archers · 3 arrows per end.</p>
        </>
      )}
    </div>
  )
}

function OfflineMatch({ setup, onExit }) {
  const [game, setGame] = useState(() => newMatch(setup))
  const gameRef = useRef(game)
  const [handoff, setHandoff] = useState(null)
  const [steady, setSteady] = useState(setup.steady ?? true)
  const seats = game.seats
  const shots = normalizeShots(game.archeryShots)
  const tieShots = normalizeShots(game.archeryShootOffShots)
  const format = archeryFormat(game.archeryFormat)
  const phase = game.archeryPhase || 'main'
  const isShootOff = phase === 'shootOff'
  const turn = arrowTurn(shots.length, seats, format)
  const currentDistance = isShootOff ? 70 : (ARCHERY_FORMATS[format].distances[turn.end] ?? 70)
  const liveShotIndex = isShootOff ? shots.length + tieShots.length : shots.length
  const current = game.currentTurn
  const card = useMemo(() => scorecard(shots, seats, game.archerySeed, format), [format, game.archerySeed, seats, shots])
  const done = game.status === 'finished'
  const playerTurn = (setup.mode !== 'cpu' || current === 'X') && !done && !handoff
  const cpuTurn = setup.mode === 'cpu' && current === 'O' && !done
  const result = game.winner
  const best = readSoloBest(BEST_KEY)
  const mirror = setup.mode === 'local' && seats.indexOf(current) % 2 === 1
  const fireRef = useRef(null)

  const commit = useCallback((by, input) => {
    const prev = gameRef.current
    const delta = advanceArcheryShot(prev, { ...input, by }, seats)
    if (!delta) return
    const next = { ...prev, ...delta }
    gameRef.current = next
    setGame(next)
    const shotIndex = phase === 'shootOff' ? shots.length + tieShots.length : shots.length
    const impact = shotResult({ ...input, shotIndex }, shotIndex, prev.archerySeed, currentDistance)
    sounds.archeryLoose()
    sounds.archeryHit(impact.score)
    if (setup.mode === 'local' && next.status !== 'finished' && next.currentTurn !== by) setHandoff(next.currentTurn)
    if (next.status === 'finished' && setup.mode === 'score') recordSoloBest(BEST_KEY, next.archeryShots?.reduce((sum, shot) => sum + (shot ? shotResult(shot, shot.shotIndex, next.archerySeed, shot.distance).score : 0), 0) || 0)
  }, [currentDistance, phase, seats, setup.mode, shots, tieShots])

  const fire = useCallback((input) => {
    const currentGame = gameRef.current
    if (currentGame.status !== 'playing' || handoff || (setup.mode === 'cpu' && currentGame.currentTurn !== 'X')) return
    commit(currentGame.currentTurn, input)
  }, [commit, handoff, setup.mode])
  const drawHook = useBowDraw(input => fireRef.current?.(input), { enabled: playerTurn, steady, mirror })
  useEffect(() => { fireRef.current = fire }, [fire])
  const manualAim = useCallback(() => withSteadyAim({
    ax: mirror ? -drawHook.draw.ax : drawHook.draw.ax,
    ay: 0, dr: drawHook.draw.dr, drawMs: drawHook.draw.drawMs,
  }, steady, (liveShotIndex % 16) * Math.PI / 8), [drawHook.draw.ax, drawHook.draw.drawMs, drawHook.draw.dr, liveShotIndex, mirror, steady])
  useGameKeys(event => {
    if ((event.code === 'Space' || event.key === 'Enter') && playerTurn) {
      fireRef.current?.(manualAim())
      return true
    }
    return false
  }, { enabled: playerTurn })

  useEffect(() => {
    gameRef.current = game
  }, [game])

  // Local hand-off hides the range until the next archer accepts the device.
  useEffect(() => {
    if (!cpuTurn) return undefined
    const timer = setTimeout(() => {
      const latest = gameRef.current
      if (latest.status !== 'playing' || latest.currentTurn !== 'O') return
      const index = phase === 'shootOff' ? shots.length + tieShots.length : shots.length
      let seed = (latest.archerySeed + index * 2654435761) >>> 0
      const aim = cpuAim(['rookie', 'club', 'pro', 'robin-hood'].indexOf(setup.level), () => {
        seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5) | 0
        return ((seed ^ (seed + Math.imul(seed ^ (seed >>> 7), 61 | seed))) >>> 0) / 4294967296
      }, isShootOff ? 70 : currentDistance)
      commit('O', { ...aim, ay: aim.ay || 0, sway: 0, drawMs: 0 })
    }, 700)
    return () => clearTimeout(timer)
  }, [commit, cpuTurn, currentDistance, game, isShootOff, phase, setup.level, shots.length, tieShots.length])

  useEffect(() => {
    if (setup.mode !== 'score' || !done) return
    const score = card.X?.score || 0
    recordSoloBest(BEST_KEY, score)
  }, [card, done, setup.mode])

  const windNow = windForShot(game.archerySeed, liveShotIndex, currentDistance, drawHook.draw.dr)
  const hiddenAim = setup.mode === 'cpu' && setup.level === 'robin-hood'
  const displayedAim = playerTurn && !hiddenAim ? {
    ...drawHook.draw,
    ax: mirror ? -drawHook.draw.ax : drawHook.draw.ax,
    wind: windNow,
  } : null
  const currentName = game.names[current] || `PLAYER ${current}`
  const statusText = done ? (setup.mode === 'score' ? 'RANGE CLEAR' : result === 'X' ? 'YOU WIN!' : `${game.names[result] || 'CPU'} WINS`) : cpuTurn ? 'CPU AIMS…' : handoff ? 'ARCHER HANDOFF' : playerTurn ? `YOUR END · ARROW ${turn.arrowInEnd + 1} / 3` : `${currentName} SHOOTS…`

  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={onExit} className="min-h-11 px-3 font-pixel text-[8px] text-retro-dim hover:text-retro-p1">← MODES</button>
        <span className="font-pixel text-[9px] text-retro-cta">{ARCHERY_FORMATS[format].label} · {ARCHERY_FORMATS[format].ends} ENDS</span>
      </div>
      <ArcheryScorecard seats={seats} card={card} names={game.names} currentTurn={current} format={ARCHERY_FORMATS[format].label} />
      <div className="flex items-center justify-between font-pixel text-[8px]">
        <p className={cn('min-w-0 truncate', playerTurn ? 'text-retro-cta arcade-blink' : 'text-retro-dim')}>{statusText}</p>
        <span className="shrink-0 text-retro-cta">WIND {windNow < 0 ? '←' : '→'} {Math.abs(windNow)} MM</span>
      </div>
      <ArcheryRange
        shots={shots} shootOffShots={tieShots} seed={game.archerySeed} format={format}
        currentDistance={currentDistance} activeDraw={playerTurn ? displayedAim : null}
        disabled={!playerTurn || done} pointerProps={drawHook.pointerProps}
      />
      {handoff && !done && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-retro-bg/95 p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center" role="dialog" aria-modal="true" aria-label="Hand off to next archer">
          <div className="w-full max-w-sm space-y-4 rounded border border-retro-cta/60 bg-retro-card p-6 shadow-neon-cta">
            <p className="font-pixel text-xs text-retro-cta">PASS THE DEVICE</p>
            <p className={cn('font-pixel text-sm', SEAT_COLOR[seats.indexOf(handoff)] || 'text-retro-text')}>{game.names[handoff]}</p>
            <p className="font-mono text-[11px] text-retro-dim">Three arrows per end · wait for the range to clear before aiming.</p>
            <button onClick={() => setHandoff(null)} className="min-h-12 w-full rounded bg-retro-cta px-5 py-3 font-pixel text-[10px] text-retro-bg">I&apos;M READY</button>
          </div>
        </div>
      )}
      {!done && !handoff && (playerTurn || setup.mode === 'local' && current === 'X') && (
        <>
          <label className="flex items-center justify-between rounded border border-retro-border bg-retro-card px-3 py-2 font-mono text-[11px] text-retro-text">
            <span>STEADY AIM <span className="text-retro-dim">· ASSIST</span></span>
            <input type="checkbox" checked={steady} onChange={e => setSteady(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--c-win))]" />
          </label>
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded border border-retro-border bg-retro-card px-3 py-2">
            <label className="font-mono text-[10px] text-retro-dim" htmlFor="solo-draw">DRAW LENGTH · {drawHook.draw.dr} MM
              <input id="solo-draw" type="range" min="600" max="1000" step="5" value={drawHook.draw.dr} onChange={e => drawHook.setAim({ dr: Number(e.target.value) })} className="mt-1 block w-full accent-[rgb(var(--c-cta))]" />
            </label>
            <label className="font-mono text-[10px] text-retro-dim" htmlFor="solo-aim">AIM · {drawHook.draw.ax}
              <input id="solo-aim" type="range" min="-350" max="350" step="10" value={drawHook.draw.ax} onChange={e => drawHook.setAim({ ax: Number(e.target.value) })} className="mt-1 block w-24 accent-[rgb(var(--c-cta))]" />
            </label>
          </div>
          <button onClick={() => fire(manualAim())} disabled={!playerTurn} className="min-h-12 w-full rounded bg-retro-cta py-3 font-pixel text-xs text-retro-bg">LOOSE ARROW</button>
        </>
      )}
      {done && (
        <div className="space-y-2 rounded border border-retro-win/50 bg-retro-card p-4 text-center">
          <p className="font-pixel text-sm text-retro-win text-glow-win">{statusText}</p>
          {setup.mode === 'score' && <>
            <p className="font-pixel text-xs text-retro-cta">{card.X?.score || 0} · {scoreRank(card.X?.score || 0)}</p>
            <p className="font-mono text-[10px] text-retro-dim">PERSONAL BEST · {Math.max(best, card.X?.score || 0)}</p>
          </>}
          {setup.mode !== 'score' && <p className="font-mono text-[10px] text-retro-dim">{seats.map(seat => `${game.names[seat]} ${card[seat]?.score ?? 0} · X${card[seat]?.xCount ?? 0}`).join(' / ')}</p>}
          <button onClick={() => onExit(true)} className="min-h-11 rounded bg-retro-cta px-6 py-2.5 font-pixel text-[9px] text-retro-bg">PLAY AGAIN</button>
        </div>
      )}
      {isShootOff && !done && <p className="text-center font-pixel text-[8px] text-retro-cta">SHOOT-OFF · ONE ARROW EACH · 70 M · CLOSEST TO CENTER</p>}
      <p className="text-center font-mono text-[9px] text-retro-dim">DRAG FROM BOW GRIP · PULL DOWN FOR POWER · SLIDE BACK TO CANCEL</p>
      <span className="sr-only">Sight band ideal draw at {currentDistance} metres: {idealDrawForDistance(currentDistance)} millimetres.</span>
    </div>
  )
}

function Launcher({ local = false }) {
  const [setup, setSetup] = useState(null)
  const [format, setFormat] = useState('standard')
  const start = (next) => setSetup(next)
  if (setup) return <OfflineMatch key={`${setup.mode}-${setup.format}-${setup.names?.length || setup.level}-${setup.runId || 0}`} setup={setup} onExit={(restart = false) => restart ? setSetup({ ...setup, runId: Date.now() }) : setSetup(null)} />
  return <Setup local={local} format={format} setFormat={setFormat} onStart={start} />
}

export function ArcheryLocal() {
  return <Launcher local />
}

export default function ArcheryDemo() {
  return <Launcher />
}
