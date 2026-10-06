import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import MinigolfPlay from '../components/MinigolfPlay'
import MinigolfScorecard from '../components/MinigolfScorecard'
import { COURSES, DEFAULT_COURSE, HOLES, coursePar, getCourse } from '../lib/minigolfCourses'
import { formatVsPar, holeStars, replayCourse, standings, totalOf, vsPar } from '../lib/minigolfLogic'
import { botSearch } from '../lib/minigolfBot'
import { mulberry32 } from '../lib/detMath'
import { SEAT_GLYPHS, seatColor } from '../lib/minigolfUi'
import { readSoloLow, recordSoloLow } from '../lib/soloBest'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Minigolf without Firebase: SOLO (/solo/minigolf — PAR RUN or VS BOT) and
// PASS & PLAY for 2–4 on one phone (/local/minigolf). Strokes live in React
// state and go through the same replay as online rooms (replayCourse), so
// every mode plays by one rules engine. Play counters are recorded by the
// Demo.jsx shells that mount this page.

const BOT_ID = 'bot'
const LEVELS = [['easy', 'EASY'], ['med', 'MED'], ['hard', 'HARD']]
const HOLD_MS = 400

function Seg({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr rounded border border-retro-border overflow-hidden">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'min-h-11 font-pixel text-[9px] border-r last:border-r-0 border-retro-border transition-colors',
            value === v ? 'bg-retro-tint-cta text-retro-cta' : 'bg-retro-card text-retro-dim hover:text-retro-text',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

const Label = ({ children }) => <p className="font-pixel text-[8px] text-retro-dim tracking-widest">{children}</p>

// Full-screen pass-the-phone card. HOLD TO START (0.4 s) so a pocket tap
// while the phone changes hands never fires a stroke.
function Handoff({ name, seat, holeLabel, detail, onReady }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef(null)
  const start = (e) => {
    e.preventDefault()
    setHolding(true)
    timer.current = setTimeout(() => { sounds.go(); onReady() }, HOLD_MS)
  }
  const stop = () => { clearTimeout(timer.current); setHolding(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6 text-center" style={{ background: `rgb(var(--c-bg) / 0.94)` }}>
      <p className="font-pixel text-[8px] text-retro-dim">{holeLabel}</p>
      <span className="w-20 h-20 rounded-full grid place-items-center text-3xl" style={{ background: seatColor(seat), color: 'rgb(var(--c-bg))' }} aria-hidden="true">
        {SEAT_GLYPHS[seat]}
      </span>
      <p className="font-pixel text-[9px] text-retro-dim">PASS THE PHONE TO</p>
      <p className="font-pixel text-xl break-all" style={{ color: seatColor(seat) }}>{name}</p>
      <p className="font-mono text-[11px] text-retro-dim">{detail}</p>
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReady() } }}
        className="mt-2 min-h-12 w-full max-w-[260px] rounded font-pixel text-[10px] text-retro-bg active:scale-95 transition-transform"
        style={{ background: seatColor(seat) }}
      >
        {holding ? 'KEEP HOLDING…' : 'HOLD TO START'}
      </button>
    </div>
  )
}

export default function MinigolfLocal({ mode = 'local' }) {
  const solo = mode === 'solo'
  const myName = (() => { try { return (localStorage.getItem('playerName') || '').toUpperCase().slice(0, 12) } catch { return '' } })()
  const [phase, setPhase] = useState('setup')
  const [soloKind, setSoloKind] = useState('par')      // 'par' | 'bot'
  const [level, setLevel] = useState('med')
  const [course, setCourse] = useState(DEFAULT_COURSE)
  const [count, setCount] = useState(2)
  const [names, setNames] = useState(() => [myName || 'P1', 'P2', 'P3', 'P4'])
  const [shots, setShots] = useState([])
  const [busy, setBusy] = useState(false)
  const [readyFor, setReadyFor] = useState(null)
  const [bestAtStart, setBestAtStart] = useState(0)

  const { order, meta } = useMemo(() => {
    if (solo) {
      const o = soloKind === 'bot' ? ['p0', BOT_ID] : ['p0']
      const m = { p0: { name: myName || 'YOU', seat: 0 } }
      if (soloKind === 'bot') m[BOT_ID] = { name: `BOT ${level.toUpperCase()}`, seat: 1, bot: true }
      return { order: o, meta: m }
    }
    const o = Array.from({ length: count }, (_, i) => `p${i}`)
    const m = {}
    o.forEach((id, i) => { m[id] = { name: (names[i] || `P${i + 1}`).toUpperCase().slice(0, 12), seat: i } })
    return { order: o, meta: m }
  }, [solo, soloKind, level, count, names, myName])

  const state = useMemo(() => replayCourse({ course, order, shots }), [course, order, shots])
  const humans = order.filter(id => !meta[id]?.bot).length
  const turnMeta = state.turn ? meta[state.turn] : null
  const botTurn = phase === 'play' && !!turnMeta?.bot && !state.done
  const thinking = botTurn && !busy
  const needsHandoff = phase === 'play' && humans > 1 && !state.done && !busy && !turnMeta?.bot && readyFor !== state.turn

  const shoot = useCallback((shot) => {
    setShots(prev => {
      const s = replayCourse({ course, order, shots: prev })
      if (s.done || !s.turn) return prev
      return [...prev, { by: s.turn, h: s.pos, ...shot }]
    })
  }, [course, order])

  // Bot turn: time-sliced search so the UI keeps animating while it thinks.
  useEffect(() => {
    if (!botTurn || busy) return undefined
    let cancelled = false
    const k = Math.floor((performance.now() / 1000) * 120) + 90
    const rng = mulberry32((shots.length + 1) * 2654435761)
    const it = botSearch(state.hole, state.ball, k, level, rng)
    const started = performance.now()
    const pump = () => {
      if (cancelled) return
      const t0 = performance.now()
      for (;;) {
        const r = it.next()
        if (r.done) {
          const wait = Math.max(0, 700 - (performance.now() - started))
          setTimeout(() => { if (!cancelled) shoot(r.value) }, wait)
          return
        }
        if (performance.now() - t0 > 12) break
      }
      setTimeout(pump, 0)
    }
    pump()
    return () => { cancelled = true }
  }, [botTurn, busy, state.hole, state.ball, level, shots.length, shoot])

  // Finished: solo par-run best, win sound.
  const finishedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'play' || !state.done || busy || finishedRef.current) return
    finishedRef.current = true
    if (solo && soloKind === 'par') recordSoloLow(`minigolf-${course}`, totalOf(state.scores.p0))
    const s = standings(state.scores, order)
    if (order.length === 1 || (s[0].uid !== BOT_ID && s[0].rank === 1 && s.filter(r => r.rank === 1).length === 1)) sounds.matchWin()
    else if (s[0].uid === BOT_ID) sounds.lose()
    else sounds.draw()
  }, [phase, state.done, busy, solo, soloKind, course, order, state.scores])

  const start = () => {
    setShots([])
    setReadyFor(null)
    setBestAtStart(readSoloLow(`minigolf-${course}`))
    finishedRef.current = false
    setPhase('play')
  }

  // ─── Setup ───────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const best = readSoloLow(`minigolf-${course}`)
    return (
      <div className="w-full max-w-sm mx-auto flex flex-col gap-3">
        {solo ? (
          <>
            <Label>MODE</Label>
            <Seg label="Mode" value={soloKind} onChange={setSoloKind} options={[['par', 'PAR RUN'], ['bot', 'VS BOT']]} />
            {soloKind === 'bot' && (
              <>
                <Label>BOT</Label>
                <Seg label="Bot level" value={level} onChange={setLevel} options={LEVELS} />
              </>
            )}
          </>
        ) : (
          <>
            <Label>PLAYERS</Label>
            <Seg label="Players" value={count} onChange={setCount} options={[[2, '2'], [3, '3'], [4, '4']]} />
            <div className="flex flex-col gap-2">
              {Array.from({ length: count }, (_, i) => (
                <label key={i} className="flex items-center gap-2 rounded border border-retro-border bg-retro-card px-2 py-1.5">
                  <span className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs" style={{ background: seatColor(i), color: 'rgb(var(--c-bg))' }} aria-hidden="true">
                    {SEAT_GLYPHS[i]}
                  </span>
                  <span className="sr-only">Player {i + 1} name</span>
                  <input
                    value={names[i]}
                    maxLength={12}
                    onChange={(e) => setNames(n => n.map((v, j) => (j === i ? e.target.value : v)))}
                    className="flex-1 min-w-0 bg-transparent font-pixel text-[10px] text-retro-text border-b border-dashed border-retro-border py-1.5 focus:outline-none focus:border-retro-cta"
                  />
                </label>
              ))}
            </div>
          </>
        )}
        <Label>COURSE</Label>
        <Seg label="Course" value={course} onChange={setCourse} options={Object.values(COURSES).map(c => [c.id, c.label])} />
        <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
          {getCourse(course).holes.length} holes · par {coursePar(course)} · 6 strokes max per hole.
          {solo && soloKind === 'par' && best ? ` Your best: ${best} (${formatVsPar(best - coursePar(course))}).` : ''}
          {!solo && ' Each player finishes the hole, then passes the phone. Best score on a hole tees off first on the next.'}
        </p>
        <button
          type="button"
          onClick={start}
          className="min-h-12 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta active:scale-95 transition"
        >
          TEE OFF
        </button>
      </div>
    )
  }

  // ─── Results (rendered by MinigolfPlay once the last stroke has played) ──
  const renderResults = () => {
    const s = standings(state.scores, order)
    const par = coursePar(course)
    const stars = solo && soloKind === 'par'
      ? getCourse(course).holes.reduce((sum, h, i) => sum + holeStars(state.scores.p0[i], HOLES[h].par), 0)
      : 0
    const tied = s.filter(r => r.rank === 1).length > 1
    const headline = order.length === 1
      ? `TOTAL ${s[0].total}`
      : tied ? 'TIE!' : s[0].uid === 'p0' && solo ? 'YOU WIN!' : `${meta[s[0].uid].name} WINS!`
    return (
      <div className="w-full max-w-sm mx-auto flex flex-col gap-3">
        <div className="text-center space-y-1">
          <p className="font-pixel text-lg text-retro-cta text-glow-cta">{headline}</p>
          <p className="font-mono text-[11px] text-retro-dim">
            {order.length === 1 ? `${formatVsPar(s[0].total - par)} vs par ${par} · ★ ${stars}/${getCourse(course).holes.length * 3}` : `par ${par}`}
          </p>
          {solo && soloKind === 'par' && (!bestAtStart || s[0].total < bestAtStart) && <p className="font-pixel text-[10px] text-retro-win">NEW BEST!</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          {s.map(r => (
            <div key={r.uid} className={cn('flex items-center gap-2 rounded border px-2 py-1.5 bg-retro-card', r.rank === 1 ? 'border-retro-cta' : 'border-retro-border')}>
              <span className="font-pixel text-[9px] w-8 text-retro-dim">{r.rank}{['ST', 'ND', 'RD', 'TH'][Math.min(r.rank - 1, 3)]}</span>
              <span className="w-5 h-5 rounded-full grid place-items-center text-[9px]" style={{ background: seatColor(meta[r.uid].seat), color: 'rgb(var(--c-bg))' }} aria-hidden="true">{SEAT_GLYPHS[meta[r.uid].seat]}</span>
              <span className="flex-1 min-w-0 truncate font-pixel text-[9px] text-retro-text">{meta[r.uid].name}</span>
              <span className="font-pixel text-[9px] text-retro-text">{r.total} ({formatVsPar(vsPar(state.scores[r.uid], course))})</span>
            </div>
          ))}
        </div>
        <div className="rounded border border-retro-border bg-retro-card p-2">
          <MinigolfScorecard course={course} order={order} meta={meta} scores={state.scores} />
        </div>
        <button type="button" onClick={start} className="min-h-12 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta active:scale-95 transition">
          PLAY AGAIN
        </button>
        <button type="button" onClick={() => setPhase('setup')} className="min-h-11 border border-retro-border text-retro-text font-pixel text-[10px] rounded hover:border-retro-p1/50 active:scale-95">
          {solo ? 'CHANGE MODE / COURSE' : 'CHANGE PLAYERS / COURSE'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Link to="/games" className="min-h-11 grid place-items-center border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:text-retro-text">SWITCH GAME</Link>
          <Link to="/" className="min-h-11 grid place-items-center border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:text-retro-text">HOME</Link>
        </div>
      </div>
    )
  }

  // ─── Play ────────────────────────────────────────────────────────────────
  const holeLabel = state.hole ? `HOLE ${state.pos + 1}/${getCourse(course).holes.length} · ${state.hole.name} · PAR ${state.hole.par}` : ''
  const turnTotal = state.turn ? totalOf(state.scores[state.turn]) : 0
  return (
    <div className="w-full max-w-sm mx-auto">
      <MinigolfPlay
        course={course}
        order={order}
        meta={meta}
        state={state}
        controllable={!turnMeta?.bot && !needsHandoff}
        onShot={shoot}
        onBusyChange={setBusy}
        renderDone={renderResults}
        statusText={thinking ? 'BOT IS THINKING…' : botTurn ? 'BOT' : 'DRAG ANYWHERE · BACK TO CANCEL'}
        overlay={needsHandoff && turnMeta ? (
          <Handoff
            name={turnMeta.name}
            seat={turnMeta.seat}
            holeLabel={holeLabel}
            detail={`Total ${turnTotal} · ${state.holeOrder.indexOf(state.turn) + 1} of ${order.length} this hole`}
            onReady={() => setReadyFor(state.turn)}
          />
        ) : null}
      />
      <button
        type="button"
        onClick={() => setPhase('setup')}
        className="mt-3 w-full min-h-11 font-pixel text-[9px] text-retro-dim hover:text-retro-text"
      >
        ✕ QUIT TO SETUP
      </button>
    </div>
  )
}
