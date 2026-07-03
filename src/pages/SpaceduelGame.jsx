import { useRef, useState, useCallback } from 'react'
import { ref as dbRef, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpaceduelArena from '../components/SpaceduelArena'
import { useSpaceduelControls } from '../hooks/useSpaceduelControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import {
  createState, step, getWinner,
  ROT_SPEED, THRUST, FRICTION, MAX_SPEED, SHIP_R, SHIP_MAX_HP,
} from '../lib/spaceduelLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const r4 = (n) => Math.round(n * 1e4) / 1e4
const wrap = (v) => ((v % 1) + 1) % 1

const initialShips = {
  X: { x: 0.25, y: 0.5, ang: 0, alive: true, thrust: false },
  O: { x: 0.75, y: 0.5, ang: Math.PI, alive: true, thrust: false },
}
const initialRender = { ships: initialShips, bullets: [], t: 0, hitsX: 0, hitsO: 0, hpX: SHIP_MAX_HP, hpO: SHIP_MAX_HP, countdown: 0 }

function SpaceduelResult({ winner, mySymbol, players, hitsX = 0, hitsO = 0 }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const hits = sym === 'X' ? hitsX : hitsO
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {winner === sym ? 'WIN' : winner === 'draw' ? 'DRAW' : 'LOST'}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">{hits} hits</p>
          </div>
        )
      })}
    </div>
  )
}

export default function SpaceduelGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const arenaRef = useRef(null)
  const { getInput, touch } = useSpaceduelControls(arenaRef, !isSpectator && game.status === 'playing')

  const [render, setRender] = useState(initialRender)

  // Page-side bookkeeping that the page-owned callbacks need.
  const hitsRef = useRef({ X: 0, O: 0 })          // final hit tally, updated on hit events
  const lastXInputRef = useRef({ thrust: 0 })     // host: last local thrust (for the flame)
  const predRef = useRef(null)                    // guest: locally-predicted own ship (O)
  const lastSnapRef = useRef(null)                // guest: last snapshot object (to detect new ones)
  const simRef = useRef(null)                     // host: mirror of the hook's sim, kept fresh for finish()

  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(dbRef(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        return {
          ...current, winner, status: 'finished', scores,
          spaceduelScoreX: winner === 'X' ? 1 : 0,
          spaceduelScoreO: winner === 'O' ? 1 : 0,
          spaceduelHitsX: hitsRef.current.X,
          spaceduelHitsO: hitsRef.current.O,
        }
      })
    } catch { /* the other client resolved it */ }
  }, [gameId])

  const onEvent = useCallback((event, sim) => {
    if (event.type === 'fire') {
      sounds.hit()
    } else if (event.type === 'hit') {
      sounds.hit()
      hitsRef.current = { X: sim.ships.X.hits, O: sim.ships.O.hits }
      simRef.current = sim
      update(dbRef(db, `games/${gameId}`), {
        spaceduelHitsX: sim.ships.X.hits,
        spaceduelHitsO: sim.ships.O.hits,
      }).catch(() => {})
    } else if (event.type === 'kill') {
      sounds.miss()
      hitsRef.current = { X: sim.ships.X.hits, O: sim.ships.O.hits }
      simRef.current = sim
      update(dbRef(db, `games/${gameId}`), {
        spaceduelHitsX: sim.ships.X.hits,
        spaceduelHitsO: sim.ships.O.hits,
      }).catch(() => {})
    }
  }, [gameId])

  const readHostInput = useCallback((sim) => {
    simRef.current = sim
    const inp = getInput()
    lastXInputRef.current = inp
    return inp
  }, [getInput])

  const buildView = useCallback((sim) => {
    const X = sim.ships.X, O = sim.ships.O
    return {
      ships: {
        X: { x: X.x, y: X.y, ang: X.ang, alive: X.alive, thrust: !!lastXInputRef.current.thrust },
        O: { x: O.x, y: O.y, ang: O.ang, alive: O.alive, thrust: false },
      },
      bullets: sim.bullets.map(b => ({ x: b.x, y: b.y })),
      t: sim.t, hitsX: X.hits, hitsO: O.hits, hpX: X.hp, hpO: O.hp, countdown: 0,
    }
  }, [])

  const buildSnapshot = useCallback((sim) => {
    simRef.current = sim
    const { X, O } = sim.ships
    return {
      t: 's',
      X: [r4(X.x), r4(X.y), r4(X.ang), r4(X.vx), r4(X.vy), X.alive ? 1 : 0, X.hp],
      O: [r4(O.x), r4(O.y), r4(O.ang), r4(O.vx), r4(O.vy), O.alive ? 1 : 0, O.hp],
      b: sim.bullets.map(b => [r4(b.x), r4(b.y)]),
      bi: sim.bullets.map(b => [r4(b.vx), r4(b.vy)]),
      bl: sim.bullets.map(b => r4(b.life)),
      tb: r4(sim.t),
      hx: X.hits,
      ho: O.hits,
    }
  }, [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, enabled: isHost && game.status === 'playing',
    driver: 'rAF',
    createState,
    stepSim: step,
    readHostInput,
    consumeGuestInput: false,
    onEvent,
    snapshotMs: 33,
    buildView,
    buildSnapshot,
    getWinner,
    finishRound,
    setRender, initialRender,
  })

  const guestTick = useCallback((snap, age, dt) => {
    // (re)seed local prediction whenever a fresh snapshot arrives
    if (snap !== lastSnapRef.current) {
      lastSnapRef.current = snap
      predRef.current = {
        x: snap.O[0], y: snap.O[1], ang: snap.O[2], vx: snap.O[3], vy: snap.O[4],
        alive: !!snap.O[5], thrust: false,
      }
    }
    const inp = getInput()

    // Locally predict own ship (zero-input-lag rotate + thrust + friction).
    let p = predRef.current
    if (p && p.alive) {
      p = { ...p }
      p.ang = (p.ang + (inp.turn || 0) * ROT_SPEED * dt) % (Math.PI * 2)
      if (inp.thrust) {
        p.vx += Math.cos(p.ang) * THRUST * dt
        p.vy += Math.sin(p.ang) * THRUST * dt
      }
      const fr = Math.exp(-FRICTION * dt)
      p.vx *= fr; p.vy *= fr
      const sp = Math.hypot(p.vx, p.vy)
      if (sp > MAX_SPEED) { p.vx = (p.vx / sp) * MAX_SPEED; p.vy = (p.vy / sp) * MAX_SPEED }
      p.x += p.vx * dt; p.y += p.vy * dt
      if (p.x < SHIP_R) { p.x = SHIP_R; p.vx = -0.5 * p.vx }
      else if (p.x > 1 - SHIP_R) { p.x = 1 - SHIP_R; p.vx = -0.5 * p.vx }
      if (p.y < SHIP_R) { p.y = SHIP_R; p.vy = -0.5 * p.vy }
      else if (p.y > 1 - SHIP_R) { p.y = 1 - SHIP_R; p.vy = -0.5 * p.vy }
      predRef.current = p
    }

    // Dead-reckon opponent (X) + bullets from the snapshot, capped at 0.1s.
    const a = Math.min(age, 0.1)
    let ox = snap.X[0] + snap.X[3] * a
    let oy = snap.X[1] + snap.X[4] * a
    ox = Math.min(1 - SHIP_R, Math.max(SHIP_R, ox))
    oy = Math.min(1 - SHIP_R, Math.max(SHIP_R, oy))
    const bullets = (snap.b || []).map((b, i) => ({
      x: wrap(b[0] + (snap.bi?.[i]?.[0] || 0) * a),
      y: wrap(b[1] + (snap.bi?.[i]?.[1] || 0) * a),
    }))
    const own = predRef.current
      ? { ...predRef.current, thrust: !!inp.thrust }
      : { x: 0.75, y: 0.5, ang: Math.PI, alive: true, thrust: !!inp.thrust }

    const view = {
      ships: {
        X: { x: ox, y: oy, ang: snap.X[2], alive: !!snap.X[5], thrust: false },
        O: own,
      },
      bullets,
      t: snap.tb ?? 0,
      hitsX: snap.hx ?? 0,
      hitsO: snap.ho ?? 0,
      hpX: snap.X[6] ?? SHIP_MAX_HP,
      hpO: snap.O[6] ?? SHIP_MAX_HP,
      countdown: 0,
    }
    return { view, input: { t: 'i', d: { turn: inp.turn, thrust: inp.thrust, fire: inp.fire } } }
  }, [getInput])

  const guestConn = useRealtimeGuest({
    gameId, mySymbol, enabled: !isSpectator && !isHost && game.status === 'playing',
    tick: guestTick,
    setRender, initialRender,
    sfxMap: { fire: () => sounds.hit(), hit: () => sounds.hit(), kill: () => sounds.miss() },
    INPUT_MS: 33,
  })

  const conn = isHost ? hostConn : guestConn

  // Single round decides the match → match target is 1.
  const matchWinner = (game.scores?.X || 0) >= 1 ? 'X' : (game.scores?.O || 0) >= 1 ? 'O' : null

  // --- Finished screen (everyone) ---
  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <SpaceduelResult
          winner={game.winner} mySymbol={mySymbol} players={game.players}
          hitsX={game.spaceduelHitsX ?? render.hitsX}
          hitsO={game.spaceduelHitsO ?? render.hitsO}
        />
        <GameStatus
          status={game.status} winner={game.winner} mySymbol={mySymbol}
          scores={game.scores} players={game.players} gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal && !isSpectator ? onPlayAgain : null}
          onNewMatch={matchWinner && !proposal && !isSpectator ? onNewMatch : null}
          onSwitchGame={!proposal && !isSpectator ? onSwitchGame : null}
        />
      </div>
    )
  }

  // --- Spectator: live hit tally is kept in RTDB so spectatorship means something ---
  if (isSpectator) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim">SPECTATING</p>
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {game.spaceduelHitsX ?? 0}</span>
            <span className="text-retro-dim text-[8px] self-center">HITS</span>
            <span className="text-retro-p2">{game.spaceduelHitsO ?? 0} O</span>
          </div>
          <p className="font-pixel text-[7px] text-retro-dim/70 leading-relaxed">
            LIVE SHIPS ARE PEER-TO-PEER · HIT TALLY ONLY FOR SPECTATORS
          </p>
        </div>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // --- Playing ---
  const overlay = <RealtimeOverlay conn={conn.status} countdown={render.countdown} retry={conn.retry} />

  return (
    <div className="space-y-3">
      <SpaceduelArena
        ref={arenaRef}
        ships={render.ships}
        bullets={render.bullets}
        t={render.t}
        hitsX={render.hitsX}
        hitsO={render.hitsO}
        hpX={render.hpX}
        hpO={render.hpO}
        mySide={mySymbol}
        namesX={game.players?.X?.name}
        namesO={game.players?.O?.name}
        dim={conn.status !== 'connected'}
        overlay={overlay}
        touch={touch}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">
        SINGLE ROUND · 60s CAP · MOST HITS WINS ON TIME
      </p>
      {!opponentOnline && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">OPPONENT DISCONNECTED</p>
      )}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}