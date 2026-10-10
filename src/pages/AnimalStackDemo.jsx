import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createMatch, applyOutcome, heartsFor, normalizeDrop, pieceAt, stateTop, TURN_MS, ROT_STEPS, AIM_LIMIT_CM,
} from '../lib/animalStackLogic'
import { BOT_LEVELS, botCandidates, scoreCandidate, jitter } from '../lib/animalStackBot'
import { readSoloBest, recordSoloBest } from '../lib/soloBest'
import { sounds } from '../lib/sounds'
import useStackPlayback from '../hooks/useStackPlayback'
import AnimalStackArena from '../components/AnimalStackArena'
import AnimalStackRail from '../components/AnimalStackRail'
import { PLAYER_GLYPHS, PLAYER_TOKENS } from '../components/animalStackDraw'
import LiveAnnouncer from '../components/LiveAnnouncer'
import WinEffect from '../components/WinEffect'
import { cn } from '@/lib/utils'

// ANIMAL STACK offline modes — no Firebase:
//   /solo/animalstack  → VS BOT (easy/normal/hard) or CLIMB (height chase)
//   /local/animalstack → SAME DEVICE pass-and-play for 2-4 players
// Every mode runs the same match rules (animalStackLogic.applyOutcome) and the
// same physics the online room replays.

const BEST_KEY = 'animalstack-climb' // soloBest key → height ×10 (one decimal)
const TEXT_TOK = { p1: 'text-retro-p1', p2: 'text-retro-p2', p3: 'text-retro-p3', p4: 'text-retro-p4' }
const CTA = 'min-h-11 px-6 py-3 bg-retro-cta text-retro-bg font-pixel text-xs rounded transition press disabled:opacity-50 hover:shadow-neon-cta'
const SEC = 'min-h-11 px-5 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-[10px] rounded transition press hover:border-retro-p1/50 hover:text-retro-p1'

function Toggle({ label, on, onChange }) {
  return (
    <label className="flex items-center justify-between min-h-11 py-2 border-b border-retro-border/60 font-mono text-xs text-retro-text cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} className="w-5 h-5 accent-[rgb(var(--c-win))]" />
    </label>
  )
}

function SoloPicker({ onStart }) {
  const best = readSoloBest(BEST_KEY) / 10
  return (
    <div className="space-y-2">
      <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">VS BOT · ♥♥♥ EACH · YOU DROP FIRST</p>
      {Object.entries(BOT_LEVELS).map(([id, L]) => (
        <button
          key={id}
          onClick={() => onStart({ mode: 'bot', level: id })}
          className="w-full min-h-14 flex items-center gap-3 px-3 py-2 border border-retro-border rounded bg-retro-card hover:border-retro-cta/50 text-left press-card transition"
        >
          <span className="font-pixel text-[10px] text-retro-cta w-16">{L.label}</span>
          <span className="font-mono text-[11px] text-retro-dim">{L.blurb}</span>
        </button>
      ))}
      <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center pt-2">SOLO HEIGHT CHASE</p>
      <button
        onClick={() => onStart({ mode: 'climb' })}
        className="w-full min-h-14 flex items-center gap-3 px-3 py-2 border border-retro-border rounded bg-retro-card hover:border-retro-cta/50 text-left press-card transition"
      >
        <span className="font-pixel text-[10px] text-retro-cta w-16">CLIMB</span>
        <span className="font-mono text-[11px] text-retro-dim">one tower, no timer{best > 0 ? ` · best ${best.toFixed(1)} m` : ''}</span>
      </button>
    </div>
  )
}

function LocalSetup({ onStart }) {
  const [n, setN] = useState(2)
  const [names, setNames] = useState(['', '', '', ''])
  const [timer, setTimer] = useState(false)
  const [gate, setGate] = useState(false)
  return (
    <div className="space-y-3">
      <div>
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest mb-1.5">PLAYERS</p>
        <div className="grid grid-cols-3 border-2 border-retro-border rounded overflow-hidden" role="radiogroup" aria-label="Number of players">
          {[2, 3, 4].map(k => (
            <button
              key={k}
              role="radio"
              aria-checked={n === k}
              onClick={() => setN(k)}
              className={cn('py-2.5 font-pixel text-[10px]', n === k ? 'bg-retro-cta text-retro-bg' : 'text-retro-dim')}
            >
              {k}P
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest">WHO&apos;S PLAYING</p>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={cn('w-10 h-10 shrink-0 flex items-center justify-center border-2 rounded font-mono text-base', TEXT_TOK[PLAYER_TOKENS[i]])} style={{ borderColor: `rgb(var(--c-${PLAYER_TOKENS[i]}))` }}>
              {PLAYER_GLYPHS[i]}
            </span>
            <input
              value={names[i]}
              maxLength={12}
              placeholder={`P${i + 1}`}
              aria-label={`Player ${i + 1} name`}
              onChange={e => setNames(ns => ns.map((v, j) => (j === i ? e.target.value : v)))}
              className="flex-1 min-w-0 border-2 border-retro-border bg-retro-card rounded px-2.5 py-2 font-mono text-retro-text"
            />
          </div>
        ))}
      </div>
      <div>
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest">HOUSE RULES · {n === 2 ? '♥♥♥' : '♥♥'} EACH</p>
        <Toggle label="Turn timer 15 s" on={timer} onChange={setTimer} />
        <Toggle label="Hand-off screen between turns" on={gate} onChange={setGate} />
      </div>
      <div className="flex justify-center pt-1">
        <button
          className={CTA}
          onClick={() => onStart({
            mode: 'local', timer, gate,
            names: Array.from({ length: n }, (_, i) => (names[i].trim() || `P${i + 1}`).toUpperCase()),
          })}
        >
          START
        </button>
      </div>
    </div>
  )
}

function OfflineMatch({ setup, onExit }) {
  const players = useMemo(() => {
    if (setup.mode === 'climb') return [{ name: 'YOU' }]
    if (setup.mode === 'bot') return [{ name: 'YOU' }, { name: `BOT·${BOT_LEVELS[setup.level].label}`, bot: setup.level }]
    return setup.names.map(name => ({ name }))
  }, [setup])
  const n = players.length
  const [match, setMatch] = useState(() => createMatch(n, (Math.random() * 2 ** 31) | 0))
  const [phase, setPhase] = useState('aim') // aim | drop | gate | toppled | over
  const [aim, setAim] = useState({ x: 0, r: 0 })
  const [stamp, setStamp] = useState(null)
  const [clock, setClock] = useState({ key: null, since: 0, now: 0 })
  const [winFx, setWinFx] = useState(false)
  const [best, setBest] = useState(() => readSoloBest(BEST_KEY) / 10)
  const [newBest, setNewBest] = useState(false)
  const endWinFx = useCallback(() => setWinFx(false), [])
  const fx = useRef(null)
  const matchRef = useRef(match)
  const aimRef = useRef(aim)
  useEffect(() => { matchRef.current = match; aimRef.current = aim })

  const { simRef, play, reset } = useStackPlayback({
    onLand: ({ speed, x, y }) => { sounds.stackLand(speed); fx.current?.burst(x, y) },
  })

  const top = useMemo(() => stateTop(match.state), [match.state])
  const k = pieceAt(match.seed, match.drops.length)
  const next = pieceAt(match.seed, match.drops.length + 1)
  const current = players[match.turn]
  const humanTurn = phase === 'aim' && !current?.bot

  // A new turn (derived during render, not in an effect): re-centre the aim.
  const turnKey = phase === 'aim' ? `${match.round}:${match.drops.length}:${match.turn}` : null
  const [seenTurn, setSeenTurn] = useState(null)
  if (turnKey && turnKey !== seenTurn) {
    setSeenTurn(turnKey)
    setAim({ x: 0, r: 0 })
  }
  const banner = turnKey
    ? {
      id: turnKey, player: match.turn,
      text: n === 1 ? 'STACK HIGH!' : current.bot ? `${PLAYER_GLYPHS[match.turn]} ${current.name} THINKING…` : `${PLAYER_GLYPHS[match.turn]} ${current.name} · YOUR DROP`,
    }
    : null
  const toppler = match.lastToppler != null ? players[match.lastToppler] : null
  const announce = stamp
    ? `Topple! ${current.name} ${n === 1 ? 'ends the run' : 'loses a heart'}.`
    : phase === 'aim' ? `${current.name}'s drop. Tower ${top.toFixed(1)} metres.`
      : phase === 'over' ? (n === 1 ? `Run over at ${match.maxHeight.toFixed(1)} metres.` : `${players[match.winner ?? 0]?.name} wins.`)
        : phase === 'toppled' && toppler ? `${toppler.name} toppled the tower.` : ''

  useEffect(() => {
    if (turnKey && (match.drops.length > 0 || match.round > 1)) sounds.go()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey])

  const doDrop = useCallback(() => {
    if (phase !== 'aim') return
    const m = matchRef.current
    const drop = normalizeDrop({ k: pieceAt(m.seed, m.drops.length), x: aimRef.current.x * 100, r: aimRef.current.r })
    setPhase('drop')
    sounds.stackRelease()
    play(m.state, drop).then((result) => {
      if (simRef.current) simRef.current.outline = PLAYER_TOKENS[m.turn]
      const { match: m2, event } = applyOutcome(m, drop, result)
      if (event === 'stand') {
        setMatch(m2)
        setPhase(setup.gate && n > 1 && !players[m2.turn].bot ? 'gate' : 'aim')
        return
      }
      sounds.stackTopple(); fx.current?.shake(); setStamp('TOPPLE!')
      setTimeout(() => {
        setStamp(null)
        reset()
        setMatch(m2)
        if (event === 'win') {
          if (n === 1) {
            const h = Math.round(m.maxHeight * 10)
            const isBest = recordSoloBest(BEST_KEY, h)
            setNewBest(isBest)
            if (isBest) { setBest(h / 10); setWinFx(true); sounds.win() }
          } else {
            const humanWon = !players[m2.winner]?.bot
            if (humanWon) { setWinFx(true); sounds.win() } else sounds.lose()
          }
          setPhase('over')
        } else setPhase('toppled')
      }, 1800)
    })
  }, [phase, play, reset, simRef, setup.gate, n, players])

  // Aim timer (house rule): auto-drop where the piece is.
  const doDropRef = useRef(doDrop)
  useEffect(() => { doDropRef.current = doDrop })
  const timed = !!turnKey && !!setup.timer && !current.bot
  useEffect(() => {
    if (!timed) return
    const since = Date.now()
    let lastSec = -1
    const id = setInterval(() => {
      const t = Date.now()
      setClock({ key: turnKey, since, now: t })
      const left = TURN_MS - (t - since)
      const sec = Math.ceil(left / 1000)
      if (left < 5000 && sec !== lastSec && left > 0) { lastSec = sec; sounds.stackTick() }
      if (left <= 0) { clearInterval(id); doDropRef.current() }
    }, 200)
    return () => clearInterval(id)
  }, [timed, turnKey])

  // Bot turn: score candidates in short (8ms) slices so a slow phone keeps
  // animating between them, glide the piece over, drop.
  useEffect(() => {
    if (phase !== 'aim' || !current?.bot) return
    const level = current.bot, L = BOT_LEVELS[level]
    const m = matchRef.current
    const cands = botCandidates(level, pieceAt(m.seed, m.drops.length))
    let i = 0, best = null, bestScore = -Infinity, cancelled = false, timer = 0, raf = 0
    const chunk = () => {
      if (cancelled) return
      const t0 = performance.now()
      while (i < cands.length && performance.now() - t0 < 8) {
        const s = scoreCandidate(m.state, cands[i], L.cap) + Math.random() * 0.2
        if (s > bestScore) { bestScore = s; best = cands[i] }
        i++
      }
      if (i < cands.length) { timer = setTimeout(chunk, 0); return }
      const target = jitter(level, best)
      const t1 = performance.now()
      const glide = () => {
        if (cancelled) return
        const u = Math.min(1, (performance.now() - t1) / 650)
        setAim(a => ({ x: u < 1 ? a.x + (target.x / 100 - a.x) * 0.18 : target.x / 100, r: u > 0.3 ? target.r : a.r }))
        if (u < 1) { raf = requestAnimationFrame(glide); return }
        timer = setTimeout(() => { if (!cancelled) doDrop() }, 120)
      }
      raf = requestAnimationFrame(glide)
    }
    timer = setTimeout(chunk, 350)
    return () => { cancelled = true; clearTimeout(timer); cancelAnimationFrame(raf) }
  }, [phase, current, doDrop])

  const onAimDelta = (dx) => setAim(a => ({ ...a, x: Math.max(-AIM_LIMIT_CM / 100, Math.min(AIM_LIMIT_CM / 100, a.x + dx)) }))
  const onRotate = (dir) => { setAim(a => ({ ...a, r: (a.r + dir + ROT_STEPS) % ROT_STEPS })); sounds.stackRotate() }

  const restart = () => {
    reset(); setMatch(createMatch(n, (Math.random() * 2 ** 31) | 0)); setPhase('aim'); setNewBest(false)
  }

  const maxHearts = heartsFor(n)
  const seats = players.map((p, i) => ({ id: i, name: p.name, hearts: match.hearts[i] }))
  const rail = n === 1
    ? (
      <div className="grid grid-cols-2 gap-1.5">
        <div className="border-2 border-retro-p1 bg-retro-tint-p1/60 rounded px-2 py-1.5 font-pixel text-[9px] text-retro-p1">● YOU · CLIMB</div>
        <div className="border-2 border-retro-border bg-retro-card rounded px-2 py-1.5 font-pixel text-[9px] text-retro-cta">BEST {best.toFixed(1)} M</div>
      </div>
    )
    : <AnimalStackRail seats={seats} turn={phase === 'over' ? -1 : match.turn} maxHearts={maxHearts} />

  const heightLabel = `▲ ${(n === 1 ? Math.max(match.maxHeight, top) : top).toFixed(1)} M`
  const timerFrac = timed ? (clock.key === turnKey ? (TURN_MS - (clock.now - clock.since)) / TURN_MS : 1) : null

  return (
    <div className="space-y-3 relative">
      <LiveAnnouncer message={announce} />
      {winFx && <WinEffect winner={['X', 'O'][match.winner ?? 0] ?? 'draw'} intensity="match" onDone={endWinFx} />}
      <AnimalStackArena
        tower={match.state}
        top={top}
        simRef={simRef}
        hover={phase === 'aim' ? { k, x: aim.x, r: aim.r, player: match.turn } : null}
        next={phase === 'over' ? null : next}
        best={n === 1 ? best : 0}
        canAct={humanTurn}
        onAimDelta={onAimDelta}
        onRotate={onRotate}
        onDrop={doDrop}
        hint={phase === 'aim' && current?.bot ? 'BOT\'S TURN' : phase === 'drop' ? 'SETTLING…' : undefined}
        banner={banner}
        stamp={stamp}
        timerFrac={timerFrac}
        heightLabel={heightLabel}
        rail={rail}
        fxRef={fx}
        ariaLabel={`Tower ${top.toFixed(1)} metres, ${match.state.length} animals`}
      />

      {phase === 'gate' && (
        <div className="fixed inset-0 z-50 bg-retro-bg/95 flex flex-col items-center justify-center gap-4 p-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
          <span className={cn('text-6xl leading-none', TEXT_TOK[PLAYER_TOKENS[match.turn]])}>{PLAYER_GLYPHS[match.turn]}</span>
          <p className={cn('font-pixel text-sm', TEXT_TOK[PLAYER_TOKENS[match.turn]])}>PASS TO {current.name}</p>
          <p className="font-mono text-xs text-retro-dim">tower {top.toFixed(1)} m · {match.state.length} animals</p>
          <button className={CTA} onClick={() => setPhase('aim')}>I&apos;M READY</button>
        </div>
      )}

      {phase === 'toppled' && match.lastToppler != null && (
        <div className="modal-pop border-2 border-retro-border bg-retro-card rounded p-4 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">TOWER {match.round - 1} TOPPLED BY</p>
          <p className={cn('font-pixel text-sm', TEXT_TOK[PLAYER_TOKENS[match.lastToppler]])}>
            {PLAYER_GLYPHS[match.lastToppler]} {players[match.lastToppler].name} {match.hearts[match.lastToppler] > 0 ? '−♥' : 'IS OUT'}
          </p>
          <p className="font-mono text-[11px] text-retro-dim">{players[match.turn].name} starts the next tower.</p>
          <button className={CTA} onClick={() => setPhase('aim')}>NEXT TOWER</button>
        </div>
      )}

      {phase === 'over' && (
        <div className="modal-pop border-2 border-retro-border bg-retro-card rounded p-4 text-center space-y-3">
          {n === 1 ? (
            <>
              <p className="font-pixel text-[10px] text-retro-dim tracking-widest">RUN OVER</p>
              <p className="font-pixel text-lg text-retro-cta text-glow-cta">{match.maxHeight.toFixed(1)} M</p>
              <p className="font-mono text-xs text-retro-text">
                {match.drops.length - 1} animals stacked{newBest ? ' · NEW BEST!' : ` · best ${best.toFixed(1)} m`}
              </p>
            </>
          ) : (
            <>
              <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
              <p className={cn('font-pixel text-base', TEXT_TOK[PLAYER_TOKENS[match.winner ?? 0]])}>
                {setup.mode === 'bot'
                  ? (match.winner === 0 ? 'YOU WIN!' : 'BOT WINS')
                  : `${PLAYER_GLYPHS[match.winner ?? 0]} ${players[match.winner ?? 0].name} WINS!`}
              </p>
              <p className="font-mono text-xs text-retro-dim">last one standing after {match.round} tower{match.round > 1 ? 's' : ''}</p>
            </>
          )}
          <div className="flex gap-2 justify-center flex-wrap">
            <button className={CTA} onClick={restart}>{n === 1 ? 'CLIMB AGAIN' : 'PLAY AGAIN'}</button>
            <button className={SEC} onClick={onExit}>{setup.mode === 'local' ? 'PLAYERS' : 'MODES'}</button>
          </div>
        </div>
      )}

      <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
        DRAG TO AIM · ⟲ ⟳ TURN 15° · DROP LETS GO<br />
        <span className="kbd-hint">←/→ AIM · ↑/↓ TURN · SPACE DROPS · </span>ANY ANIMAL IN THE WATER = TOPPLE
      </p>
    </div>
  )
}

export default function AnimalStackDemo({ local = false }) {
  const [setup, setSetup] = useState(null)
  const [runId, setRunId] = useState(0)
  if (!setup) {
    return local
      ? <LocalSetup onStart={(s) => { setSetup(s); setRunId(r => r + 1) }} />
      : <SoloPicker onStart={(s) => { setSetup(s); setRunId(r => r + 1) }} />
  }
  return <OfflineMatch key={runId} setup={setup} onExit={() => setSetup(null)} />
}

/** /local/animalstack — same-device pass-and-play for 2-4 players. */
export function AnimalStackLocal() {
  return <AnimalStackDemo local />
}
