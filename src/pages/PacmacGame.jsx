import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import PacmacArena from '../components/PacmacArena'
import { usePacmacControls } from '../hooks/usePacmacControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import {
  createState, step, getWinner, advanceActor, advanceGhostDeadReckon,
  packPellets, unpackPellets, bytesToBase64, base64ToBytes,
  MATCH_TARGET, MATCH_SECONDS, SPEED,
} from '../lib/pacmacLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

const r2 = (n) => Math.round(n * 100) / 100
const r1 = (n) => Math.round(n * 10) / 10

const initialRender = {
  pellets: null, players: null, ghosts: null,
  scoreX: 0, scoreO: 0, timeLeft: MATCH_SECONDS, countdown: 0,
}

// The host's real countdown start (`startAt`) is purely local to
// useRealtimeHost's loop and never crosses the wire — the host doesn't send
// any snapshot until after it, so the guest has nothing to read it from. We
// can't edit realtime/* to add that, so the guest approximates: start its
// own COUNTDOWN_MS-long countdown from the moment its own peer connection
// reports 'connected' (which the host also gates its countdown on), instead
// of showing no countdown at all. GUEST_COUNTDOWN_MS mirrors useRealtimeHost's
// DEFAULT_COUNTDOWN (2000ms) — PacmacGame doesn't override COUNTDOWN_MS.
const GUEST_COUNTDOWN_MS = 2000

const FLASH_MS = 260
const MAX_FLASHES = 3

// Pellet-eat pop feedback: diff the pellet grid frame-to-frame and remember
// recently-emptied cells for a short-lived CSS pop in the arena. Pure diff;
// the two ref-mutating helpers below are the page's small bit of view state.
function diffEatenCells(prev, next) {
  if (!prev || !next) return []
  const out = []
  for (let i = 0; i < next.length; i++) {
    if (prev[i] && !next[i]) out.push(i)
  }
  return out
}

function recordEatenFlashes(flashListRef, prevPelletsRef, pellets) {
  const eaten = diffEatenCells(prevPelletsRef.current, pellets)
  if (eaten.length) {
    const now = performance.now()
    flashListRef.current = flashListRef.current.concat(eaten.map(idx => ({ idx, at: now })))
  }
  prevPelletsRef.current = pellets
}

function pruneFlashes(flashListRef) {
  const now = performance.now()
  flashListRef.current = flashListRef.current
    .filter(f => now - f.at < FLASH_MS)
    .slice(-MAX_FLASHES)
  return flashListRef.current
}

function playSfx(kind) {
  if (kind === 'pellet') sounds.move('X')
  else if (kind === 'power') sounds.join()
  else if (kind === 'eatGhost') sounds.hit()
  else if (kind === 'die') sounds.miss()
  else if (kind === 'go') sounds.bell()
}

function viewOf(sim, countdown = 0) {
  return {
    pellets: sim.pellets,
    players: sim.players,
    ghosts: sim.ghosts,
    scoreX: sim.scoreX,
    scoreO: sim.scoreO,
    timeLeft: sim.timeLeft,
    countdown,
  }
}

function PacmacResult({ scoreX, scoreO, winner, mySymbol, players }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const pts = sym === 'X' ? scoreX : scoreO
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {pts}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">POINTS</p>
          </div>
        )
      })}
    </div>
  )
}

export default function PacmacGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const playing = !isSpectator && game.status === 'playing'
  const arenaRef = useRef(null)
  const { getDir } = usePacmacControls(arenaRef, playing)

  const [render, setRender] = useState(initialRender)
  const simRef = useRef(null)
  const lastScoreWriteRef = useRef(0)
  const lastSnapRef = useRef(null)
  const predORef = useRef(null)
  const hostWantRef = useRef('right')
  const prevPelletsRef = useRef(null)
  const flashListRef = useRef([])
  const guestConnectedAtRef = useRef(null)
  const [guestCountdown, setGuestCountdown] = useState(0)

  const [forfeitArmed, setForfeitArmed] = useState(false)
  const forfeitTimerRef = useRef(null)
  const [forfeitBusy, runForfeit] = useBusy()

  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), (current) => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        const sim = simRef.current
        return {
          ...current, winner, status: 'finished', scores,
          pacmacScoreX: sim ? sim.scoreX : (current.pacmacScoreX ?? 0),
          pacmacScoreO: sim ? sim.scoreO : (current.pacmacScoreO ?? 0),
        }
      })
    } catch { /* the other client resolved it */ }
  }, [gameId])

  const handleForfeit = () => {
    if (!forfeitArmed) {
      setForfeitArmed(true)
      clearTimeout(forfeitTimerRef.current)
      forfeitTimerRef.current = setTimeout(() => setForfeitArmed(false), 3000)
      return
    }
    clearTimeout(forfeitTimerRef.current)
    setForfeitArmed(false)
    runForfeit(() => finishRound(mySymbol === 'X' ? 'O' : 'X'), () => toast.error('FORFEIT FAILED — CHECK CONNECTION'))
  }

  const onEvent = useCallback((event, sim) => {
    playSfx(event.type)
    if (event.type !== 'pellet' && event.type !== 'power' && event.type !== 'eatGhost') return
    const now = performance.now()
    if (now - lastScoreWriteRef.current >= 800) {
      lastScoreWriteRef.current = now
      update(ref(db, `games/${gameId}`), { pacmacScoreX: sim.scoreX, pacmacScoreO: sim.scoreO }).catch(() => {})
    }
  }, [gameId])

  const readHostInput = useCallback(() => {
    const d = getDir()
    if (d) hostWantRef.current = d
    return hostWantRef.current
  }, [getDir])

  const buildView = useCallback((sim) => {
    simRef.current = sim
    recordEatenFlashes(flashListRef, prevPelletsRef, sim.pellets)
    return { ...viewOf(sim, 0), pelletFlashes: pruneFlashes(flashListRef) }
  }, [])

  const buildSnapshot = useCallback((sim) => ({
    t: 's',
    p: bytesToBase64(packPellets(sim.pellets)),
    X: [r2(sim.players.X.x), r2(sim.players.X.y), sim.players.X.dir, r1(sim.players.X.dead)],
    O: [r2(sim.players.O.x), r2(sim.players.O.y), sim.players.O.dir, r1(sim.players.O.dead)],
    g: sim.ghosts.map(g => [r2(g.x), r2(g.y), g.dir, g.mode]),
    sx: sim.scoreX,
    so: sim.scoreO,
    tl: r1(sim.timeLeft),
  }), [])

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

  const guestTick = useCallback((snap, age, dt) => {
    let pellets
    if (snap !== lastSnapRef.current) {
      lastSnapRef.current = snap
      predORef.current = {
        x: snap.O[0], y: snap.O[1], dir: snap.O[2],
        want: snap.O[2], dead: snap.O[3], combo: 0,
      }
      pellets = unpackPellets(base64ToBytes(snap.p))
      recordEatenFlashes(flashListRef, prevPelletsRef, pellets)
    } else {
      pellets = unpackPellets(base64ToBytes(snap.p))
    }
    const dir = getDir()
    if (dir) predORef.current.want = dir
    if (!(predORef.current.dead > 0)) {
      predORef.current = advanceActor(predORef.current, predORef.current.want, SPEED, dt, false)
    }
    const a = Math.min(age, 0.12)
    const hostDummy = { x: snap.X[0], y: snap.X[1], dir: snap.X[2], want: snap.X[2], dead: snap.X[3], combo: 0 }
    const hostPred = snap.X[3] > 0 ? hostDummy : advanceActor(hostDummy, snap.X[2], SPEED, a, false)

    const view = {
      pellets,
      players: {
        X: { ...hostPred, dead: snap.X[3] },
        O: predORef.current,
      },
      // Snapshots stream at ~30 Hz; dead-reckon each ghost forward by the
      // snapshot's age (same idea as the host-muncher prediction above) so
      // motion stays smooth between snapshots instead of visibly stepping.
      ghosts: snap.g.map(([x, y, dir, mode]) => advanceGhostDeadReckon({ x, y, dir, mode }, a)),
      scoreX: snap.sx,
      scoreO: snap.so,
      timeLeft: snap.tl,
      countdown: 0,
      pelletFlashes: pruneFlashes(flashListRef),
    }
    return { view, input: dir ? { t: 'i', d: dir } : null }
  }, [getDir])

  // The host's real countdown (see GUEST_COUNTDOWN_MS comment above) never
  // reaches the guest, so approximate it from this client's own connect time.
  // `guestCountdown` state is computed inside the effect below (refs/`Date.now`
  // can't be read during render) and just plugged into the view here.
  const guestInitialRender = guestCountdown > 0
    ? { ...initialRender, countdown: guestCountdown }
    : initialRender

  const guestConn = useRealtimeGuest({
    gameId, mySymbol, enabled: !isSpectator && !isHost && game.status === 'playing',
    tick: guestTick,
    setRender, initialRender: guestInitialRender,
    sfxMap: {
      pellet: () => playSfx('pellet'),
      power: () => playSfx('power'),
      eatGhost: () => playSfx('eatGhost'),
      die: () => playSfx('die'),
      go: () => playSfx('go'),
    },
    INPUT_MS: 0,
  })

  // Force a periodic re-render while waiting so the ticking countdown above
  // keeps reaching useRealtimeGuest's cbRef (it re-reads `initialRender`
  // fresh on every commit, per its own comments) — the hook's internal rAF
  // loop paints whatever `c.initialRender` says whenever there's no snapshot.
  useEffect(() => {
    if (isHost || isSpectator || guestConn.status !== 'connected') {
      guestConnectedAtRef.current = null
      const t = setTimeout(() => setGuestCountdown(0), 0)
      return () => clearTimeout(t)
    }
    if (guestConnectedAtRef.current == null) guestConnectedAtRef.current = performance.now()
    const id = setInterval(() => {
      if (lastSnapRef.current) { setGuestCountdown(0); return } // real snapshots arrived — stop faking it
      const remain = guestConnectedAtRef.current + GUEST_COUNTDOWN_MS - performance.now()
      setGuestCountdown(remain > 0 ? Math.ceil(remain / 1000) : 0)
    }, 200)
    return () => clearInterval(id)
  }, [isHost, isSpectator, guestConn.status])

  const conn = isHost ? hostConn : guestConn
  const matchWinner = (game.scores?.X || 0) >= MATCH_TARGET ? 'X' : (game.scores?.O || 0) >= MATCH_TARGET ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        {/* status === 'finished' ⇒ finishRound's transaction already stamped
            exact pacmacScoreX/O atomically with the status flip, so trust it
            outright here — `render.*` is the live loop's view and can be a
            frame behind (or, on the guest, frozen mid-prediction) by the time
            the round ends; it belongs to the playing view below, not this one. */}
        <PacmacResult
          scoreX={game.pacmacScoreX ?? 0}
          scoreO={game.pacmacScoreO ?? 0}
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

  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride="LIVE MAZE IS PEER-TO-PEER" />
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2">
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {game.pacmacScoreX ?? 0}</span>
            <span className="text-retro-p2">{game.pacmacScoreO ?? 0} O</span>
          </div>
          <p className="font-pixel text-[7px] text-retro-dim/70 leading-relaxed">
            THIS ROUND&apos;S POINTS
          </p>
        </div>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  const overlay = <RealtimeOverlay conn={conn.status} countdown={render.countdown} retry={conn.retry} />

  return (
    <div className="space-y-3 [@media(max-height:420px)]:space-y-1.5">
      <PacmacArena
        ref={arenaRef}
        pellets={render.pellets}
        players={render.players}
        ghosts={render.ghosts}
        pelletFlashes={render.pelletFlashes}
        scoreX={render.scoreX}
        scoreO={render.scoreO}
        timeLeft={render.timeLeft}
        mySide={mySymbol}
        namesX={game.players?.X?.name}
        namesO={game.players?.O?.name}
        dim={conn.status !== 'connected'}
        overlay={overlay}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim [@media(max-height:420px)]:hidden">
        90s · MOST PELLETS · FIRST TO {MATCH_TARGET} ROUNDS
      </p>
      {!opponentOnline && <OfflineNotice label="OPPONENT" />}
      {!proposal && (
        <div className="text-center">
          <button
            onClick={handleForfeit}
            disabled={forfeitBusy}
            className={cn(
              'min-h-11 px-4 font-pixel text-[9px] tracking-wide rounded transition-colors disabled:opacity-50',
              forfeitArmed ? 'text-retro-danger' : 'text-retro-dim hover:text-retro-danger',
            )}
          >
            {forfeitBusy ? 'FORFEITING…' : forfeitArmed ? 'TAP AGAIN TO FORFEIT' : 'FORFEIT ROUND'}
          </button>
        </div>
      )}
    </div>
  )
}
