import { useCallback, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import PaintArena from '../components/PaintArena'
import { usePaintControls } from '../hooks/usePaintControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import {
  createState, step, getWinner, counts,
  packGrid, unpackGrid, bytesToBase64, base64ToBytes,
  cellIndex, MATCH_TARGET, MATCH_SECONDS, BASE_SPEED, ENEMY_SLOW_MULT, GRID_W, GRID_H,
} from '../lib/paintLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const r4 = (n) => Math.round(n * 1e4) / 1e4
const r1 = (n) => Math.round(n * 10) / 10
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const DIR_VEC = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }

const initialRender = { grid: null, players: null, timeLeft: MATCH_SECONDS, countdown: 0 }

// Mirrors paintLogic.step()'s per-player math, applied to ONLY the guest's
// own side (O) — zero-input-lag local prediction between host snapshots.
// Paints optimistically into the local grid copy; the next host snapshot
// wholesale-overwrites it, so any contested-cell drift self-heals (matches
// the platform's existing guest-side own-entity prediction pattern in
// Sumo/SpaceDuel, just inlined here for Paint's continuous-grid case).
function advanceGuestOwn(grid, p, dir, dt) {
  const next = { ...p }
  if (dir) next.dir = dir
  const oldIdx = cellIndex(next.x, next.y)
  const curOwner = grid[oldIdx]
  const speedMult = (curOwner !== 0 && curOwner !== 2) ? ENEMY_SLOW_MULT : 1
  const speed = BASE_SPEED * speedMult
  const vec = DIR_VEC[next.dir] || DIR_VEC.right
  const nx = clamp(next.x + vec.x * speed * dt, 0, GRID_W - 1e-6)
  const ny = clamp(next.y + vec.y * speed * dt, 0, GRID_H - 1e-6)
  const newIdx = cellIndex(nx, ny)
  if (newIdx !== oldIdx && grid[oldIdx] !== 2) grid[oldIdx] = 2
  next.x = nx
  next.y = ny
  return next
}

function PaintResult({ scoreX, scoreO, winner, mySymbol, players }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const painted = sym === 'X' ? scoreX : scoreO
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {painted}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">cells painted</p>
          </div>
        )
      })}
    </div>
  )
}

export default function PaintGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const playing = !isSpectator && game.status === 'playing'
  const arenaRef = useRef(null)
  const { getDir } = usePaintControls(arenaRef, playing)

  const [render, setRender] = useState(initialRender)

  // Host-only bookkeeping.
  const simRef = useRef(null)             // mirror of the authoritative sim, for finishRound's final counts
  const lastScoreWriteRef = useRef(0)     // perf-time of the last throttled paintScoreX/O write
  const paintEventCountRef = useRef(0)    // cumulative cellPainted events, for the every-20th move tick

  // Guest-only bookkeeping.
  const lastSnapRef = useRef(null)
  const predGridRef = useRef(null)        // guest's locally-predicted grid (host-truth baseline + own paint)
  const predORef = useRef({ x: GRID_W - 0.5, y: GRID_H - 0.5, dir: 'left' })

  const bumpPaintSfx = useCallback((sym) => {
    paintEventCountRef.current += 1
    if (paintEventCountRef.current % 20 === 0) sounds.move(sym)
  }, [])

  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), (current) => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        const final = simRef.current ? counts(simRef.current) : null
        return {
          ...current, winner, status: 'finished', scores,
          paintScoreX: final ? final.X : (current.paintScoreX ?? 0),
          paintScoreO: final ? final.O : (current.paintScoreO ?? 0),
        }
      })
    } catch { /* the other client resolved it */ }
  }, [gameId])

  // --- Host ---
  const onEvent = useCallback((event, sim) => {
    if (event.type === 'cellPainted') bumpPaintSfx(event.by)
    else if (event.type === 'warning10s') sounds.bell()
    const now = performance.now()
    if (now - lastScoreWriteRef.current >= 2000) {
      lastScoreWriteRef.current = now
      const c = counts(sim)
      update(ref(db, `games/${gameId}`), { paintScoreX: c.X, paintScoreO: c.O }).catch(() => {})
    }
  }, [gameId, bumpPaintSfx])

  const readHostInput = useCallback((sim) => getDir(sim.players.X.dir), [getDir])

  const buildView = useCallback((sim) => {
    simRef.current = sim
    return { grid: sim.grid, players: sim.players, timeLeft: sim.timeLeft, countdown: 0 }
  }, [])

  const buildSnapshot = useCallback((sim) => {
    const c = counts(sim)
    return {
      t: 's',
      g: bytesToBase64(packGrid(sim.grid)),
      X: [r4(sim.players.X.x), r4(sim.players.X.y), sim.players.X.dir],
      O: [r4(sim.players.O.x), r4(sim.players.O.y), sim.players.O.dir],
      tl: r1(sim.timeLeft),
      cx: c.X, co: c.O,
    }
  }, [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, enabled: isHost && game.status === 'playing',
    driver: 'rAF',
    createState,
    stepSim: step,
    readHostInput,
    consumeGuestInput: true,
    onEvent,
    snapshotMs: 33,
    buildView,
    buildSnapshot,
    getWinner,
    finishRound,
    setRender, initialRender,
  })

  // --- Guest ---
  const guestTick = useCallback((snap, age, dt) => {
    if (snap !== lastSnapRef.current) {
      lastSnapRef.current = snap
      predGridRef.current = unpackGrid(base64ToBytes(snap.g))
      predORef.current = { x: snap.O[0], y: snap.O[1], dir: snap.O[2] }
    }
    const dir = getDir(predORef.current.dir)
    predORef.current = advanceGuestOwn(predGridRef.current, predORef.current, dir, dt)
    // Cloned every tick (cheap — 400 bytes) so PaintArena's ref-diffing
    // effect (keyed on grid-prop IDENTITY) actually re-runs and paints the
    // just-predicted cell; mutating predGridRef.current in place would keep
    // the same reference across ticks and silently skip the diff.
    const grid = predGridRef.current.slice()

    // Dead-reckon the host's paddle-equivalent (X) from its last known
    // heading — a short (capped) extrapolation, corrected on every snapshot.
    // Extrapolate at the sim's actual rule speed: X standing on enemy (O)
    // paint at snapshot time is slowed, so extrapolating at full BASE_SPEED
    // would overshoot ~0.25 cells and visibly snap back during traps.
    const a = Math.min(age, 0.12)
    const xv = DIR_VEC[snap.X[2]] || DIR_VEC.right
    const xOwner = predGridRef.current[cellIndex(snap.X[0], snap.X[1])]
    const xSpeed = BASE_SPEED * (xOwner === 2 ? ENEMY_SLOW_MULT : 1)
    const ox = clamp(snap.X[0] + xv.x * xSpeed * a, 0, GRID_W - 1e-6)
    const oy = clamp(snap.X[1] + xv.y * xSpeed * a, 0, GRID_H - 1e-6)

    const view = {
      grid,
      players: {
        X: { x: ox, y: oy, dir: snap.X[2] },
        O: { x: predORef.current.x, y: predORef.current.y, dir: predORef.current.dir },
      },
      timeLeft: snap.tl,
      countdown: 0,
    }
    return { view, input: dir ? { t: 'i', d: dir } : null }
  }, [getDir])

  const guestConn = useRealtimeGuest({
    gameId, mySymbol, enabled: !isSpectator && !isHost && game.status === 'playing',
    tick: guestTick,
    setRender, initialRender,
    // Wire events carry only the type (no `by`) — see rtc.js's generic relay
    // — so the guest can't attribute the exact painter; it still ticks the
    // shared every-20th-move counter for a comparable cadence of feedback.
    sfxMap: {
      cellPainted: () => bumpPaintSfx(mySymbol === 'O' ? 'O' : 'X'),
      warning10s: () => sounds.bell(),
    },
    INPUT_MS: 0,
  })

  const conn = isHost ? hostConn : guestConn

  const matchWinner = (game.scores?.X || 0) >= MATCH_TARGET ? 'X' : (game.scores?.O || 0) >= MATCH_TARGET ? 'O' : null

  // --- Finished screen (everyone) ---
  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <PaintResult
          scoreX={game.paintScoreX ?? (render.grid ? counts(render.grid).X : 0)}
          scoreO={game.paintScoreO ?? (render.grid ? counts(render.grid).O : 0)}
          winner={game.winner} mySymbol={mySymbol} players={game.players}
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

  // --- Spectator (live grid is P2P-only; show the synced score) ---
  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride="LIVE GRID IS PEER-TO-PEER" />
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2">
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {game.paintScoreX ?? 0}</span>
            <span className="text-retro-p2">{game.paintScoreO ?? 0} O</span>
          </div>
          <p className="font-pixel text-[7px] text-retro-dim/70 leading-relaxed">
            THIS ROUND&apos;S PAINTED CELLS
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
      <PaintArena
        ref={arenaRef}
        grid={render.grid}
        players={render.players}
        timeLeft={render.timeLeft}
        mySide={mySymbol}
        namesX={game.players?.X?.name}
        namesO={game.players?.O?.name}
        dim={conn.status !== 'connected'}
        overlay={overlay}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">
        60s CLOCK · MOST TURF PAINTED WINS · FIRST TO {MATCH_TARGET} ROUNDS
      </p>
      {!opponentOnline && <OfflineNotice label="OPPONENT" />}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
