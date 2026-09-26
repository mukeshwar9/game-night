import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import PacmacArena, { PacmacDpad } from '../components/PacmacArena'
import { usePacmacControls } from '../hooks/usePacmacControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import {
  createState, step, getWinner, advanceMuncher, advanceGhostDeadReckon, actorDist, cellIndex,
  packPellets, unpackPellets, bytesToBase64, base64ToBytes,
  GHOSTS, MATCH_TARGET,
} from '../lib/pacmacLogic'
import { playPacmacSfx, isCoarsePointer, PACMAC_RULES_LINE } from '../lib/pacmacUi'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

const r3 = (n) => Math.round(n * 1000) / 1000
const r2 = (n) => Math.round(n * 100) / 100

// The guest simulates its own muncher and trusts the host for everything
// else. If the two disagree by more than this (a rejected report, a turn the
// host never saw), the guest snaps back to the host's copy.
const RESYNC_DIST = 2.5
// How long a pellet the guest ate locally stays hidden while waiting for the
// host to confirm it (it reappears if the host gave it to nobody).
const LOCAL_EAT_MS = 700
// Dead-reckoning cap for the host's muncher and the ghosts on the guest.
const MAX_EXTRAPOLATE_S = 0.15

// The host's countdown never crosses the wire (useRealtimeHost sends nothing
// until it ends), so the guest runs its own from the moment its peer
// connection reports 'connected'. Mirrors useRealtimeHost's 2000ms default.
const GUEST_COUNTDOWN_MS = 2000

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

// The countdown shows the real starting positions rather than an empty maze.
const initialRender = viewOf(createState())

const packPlayer = (p) => [r3(p.x), r3(p.y), p.dir, p.want, r2(p.out), r2(p.power), r2(p.shield), p.life]
const unpackPlayer = (a) => ({
  x: a[0], y: a[1], dir: a[2], want: a[3], out: a[4], power: a[5], shield: a[6], life: a[7], combo: 0,
})

function PacmacResult({ scoreX, scoreO, winner, mySymbol, players }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const pts = sym === 'X' ? scoreX : scoreO
        const colour = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', colour)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
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
  const zoneRef = useRef(null)
  const { getDir, press } = usePacmacControls(zoneRef, playing)
  const [coarse] = useState(isCoarsePointer)

  const [render, setRender] = useState(initialRender)
  const simRef = useRef(null)
  const lastScoreWriteRef = useRef(0)

  // Guest-side prediction state.
  const lastSnapRef = useRef(null)
  const meRef = useRef(null)
  const pelletCacheRef = useRef({ key: null, base: null, view: null, eaten: new Map() })
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
  useEffect(() => () => clearTimeout(forfeitTimerRef.current), [])

  // ---- Host (X): runs the authoritative sim --------------------------------

  const onEvent = useCallback((event, sim) => {
    playPacmacSfx(event, 'X')
    if (event.type !== 'pellet' && event.type !== 'power' && event.type !== 'eatGhost' && event.type !== 'eatRival') return
    const now = performance.now()
    if (now - lastScoreWriteRef.current >= 800) {
      lastScoreWriteRef.current = now
      update(ref(db, `games/${gameId}`), { pacmacScoreX: sim.scoreX, pacmacScoreO: sim.scoreO }).catch(() => {})
    }
  }, [gameId])

  const buildView = useCallback((sim) => {
    simRef.current = sim
    return viewOf(sim)
  }, [])

  const buildSnapshot = useCallback((sim) => ({
    t: 's',
    p: bytesToBase64(packPellets(sim.pellets)),
    X: packPlayer(sim.players.X),
    O: packPlayer(sim.players.O),
    g: sim.ghosts.map(g => [r3(g.x), r3(g.y), g.dir, g.state, r2(g.fright)]),
    sx: sim.scoreX,
    so: sim.scoreO,
    tl: r2(sim.timeLeft),
    ck: r2(sim.clock),
  }), [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, enabled: isHost && game.status === 'playing',
    driver: 'rAF',
    createState: () => createState({ rng: (Math.random() * 2 ** 32) >>> 0 }),
    stepSim: step,
    readHostInput: getDir,
    // Guest messages are one-shot: a position report is adopted once, and the
    // sim keeps dead-reckoning that muncher until the next report arrives.
    consumeGuestInput: true,
    onEvent,
    snapshotMs: 33,
    buildView,
    buildSnapshot,
    getWinner,
    finishRound,
    setRender, initialRender,
  })

  // ---- Guest (O): predicts its own muncher, paints the host's world --------

  const guestTick = useCallback((snap, age, dt) => {
    const now = performance.now()
    const cache = pelletCacheRef.current
    const fresh = snap !== lastSnapRef.current
    const hostMe = unpackPlayer(snap.O)

    if (fresh) {
      lastSnapRef.current = snap
      const me = meRef.current
      // Adopt the host's copy on a new life, while knocked out (and on the
      // respawn right after), or when we have drifted too far apart.
      if (!me || hostMe.life !== me.life || hostMe.out > 0 || me.out > 0 || actorDist(me, hostMe) > RESYNC_DIST) {
        meRef.current = { ...hostMe, want: me && hostMe.life === me.life ? me.want : hostMe.want }
      } else {
        // Timers are the host's; the position stays ours.
        meRef.current = { ...me, power: hostMe.power, shield: hostMe.shield, out: hostMe.out }
      }
      if (snap.p !== cache.key) {
        cache.key = snap.p
        cache.base = unpackPellets(base64ToBytes(snap.p))
        cache.view = null
      }
    }

    const dir = getDir()
    let me = meRef.current
    if (dir) me = { ...me, want: dir }
    if (!(me.out > 0)) me = advanceMuncher(me, me.want, dt)
    meRef.current = me

    // Optimistically hide pellets we just ran over until the host confirms.
    let changed = cache.view == null
    for (const [idx, at] of cache.eaten) {
      if (!cache.base[idx] || now - at > LOCAL_EAT_MS) { cache.eaten.delete(idx); changed = true }
    }
    if (!(me.out > 0)) {
      const idx = cellIndex(me.x, me.y)
      if (cache.base[idx] && !cache.eaten.has(idx)) { cache.eaten.set(idx, now); changed = true }
    }
    if (changed) {
      const view = cache.base.slice()
      for (const idx of cache.eaten.keys()) view[idx] = 0
      cache.view = view
    }

    const a = Math.min(age, MAX_EXTRAPOLATE_S)
    const hostX = unpackPlayer(snap.X)
    const view = {
      pellets: cache.view,
      players: {
        X: hostX.out > 0 ? hostX : advanceMuncher(hostX, hostX.want, a),
        O: me,
      },
      ghosts: snap.g.map(([x, y, gdir, state, fright], id) => advanceGhostDeadReckon(
        { id, kind: GHOSTS[id]?.kind, x, y, dir: gdir, state, fright }, a,
      )),
      scoreX: snap.sx,
      scoreO: snap.so,
      timeLeft: snap.tl,
      clock: snap.ck,
      countdown: 0,
    }
    const input = me.out > 0 ? null : { t: 'i', d: { x: r3(me.x), y: r3(me.y), dir: me.dir, want: me.want, life: me.life } }
    return { view, input }
  }, [getDir])

  const guestInitialRender = guestCountdown > 0 ? { ...initialRender, countdown: guestCountdown } : initialRender

  const guestConn = useRealtimeGuest({
    gameId, mySymbol, enabled: !isSpectator && !isHost && game.status === 'playing',
    tick: guestTick,
    setRender, initialRender: guestInitialRender,
    sfxMap: Object.fromEntries(
      ['pellet', 'power', 'eatGhost', 'eatRival', 'die', 'warn'].map(type => [type, (by) => playPacmacSfx({ type, by }, 'O')]),
    ),
    INPUT_MS: 33,
  })

  // Re-render while waiting so the approximate countdown keeps ticking.
  useEffect(() => {
    if (isHost || isSpectator || guestConn.status !== 'connected') {
      guestConnectedAtRef.current = null
      const t = setTimeout(() => setGuestCountdown(0), 0)
      return () => clearTimeout(t)
    }
    if (guestConnectedAtRef.current == null) guestConnectedAtRef.current = performance.now()
    const id = setInterval(() => {
      if (lastSnapRef.current) { setGuestCountdown(0); return }
      const remain = guestConnectedAtRef.current + GUEST_COUNTDOWN_MS - performance.now()
      setGuestCountdown(remain > 0 ? Math.ceil(remain / 1000) : 0)
    }, 200)
    return () => clearInterval(id)
  }, [isHost, isSpectator, guestConn.status])

  // Fresh round: forget the previous round's prediction state.
  useEffect(() => {
    if (!playing) return
    lastSnapRef.current = null
    meRef.current = null
    pelletCacheRef.current = { key: null, base: null, view: null, eaten: new Map() }
  }, [playing])

  const conn = isHost ? hostConn : guestConn
  const matchWinner = (game.scores?.X || 0) >= MATCH_TARGET ? 'X' : (game.scores?.O || 0) >= MATCH_TARGET ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        {/* finishRound's transaction stamps exact pacmacScoreX/O with the
            status flip, so the finished view trusts Firebase, not `render`. */}
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
          <p className="font-pixel text-[8px] text-retro-dim/70 leading-relaxed">
            THIS ROUND&apos;S POINTS
          </p>
        </div>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // Only cover the maze when there is something to say — an always-mounted
  // overlay would leave a dimming veil over the whole match.
  const connected = conn.status === 'connected'
  const overlay = !connected || render.countdown > 0
    ? <RealtimeOverlay conn={conn.status} countdown={render.countdown} retry={conn.retry} />
    : null

  return (
    <div
      className="space-y-2"
      style={{ '--pacmac-reserve': coarse ? '292px' : '190px' }}
    >
      <div ref={zoneRef} className="space-y-3">
        <PacmacArena
          pellets={render.pellets}
          players={render.players}
          ghosts={render.ghosts}
          scoreX={render.scoreX}
          scoreO={render.scoreO}
          timeLeft={render.timeLeft}
          mySide={mySymbol}
          namesX={game.players?.X?.name}
          namesO={game.players?.O?.name}
          dim={!connected}
          showYou={render.countdown > 0 || (connected && (render.clock ?? 0) < 2)}
          overlay={overlay}
        />
        {coarse && <PacmacDpad onPress={press} disabled={!connected} />}
      </div>
      <p className="text-center font-pixel text-[8px] leading-relaxed text-retro-dim px-2 [@media(max-height:500px)]:hidden">
        {PACMAC_RULES_LINE}
        <br />
        {coarse ? 'SWIPE OR USE THE PAD' : '↑ ↓ ← → OR WASD'} · FIRST TO {MATCH_TARGET} ROUNDS
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
