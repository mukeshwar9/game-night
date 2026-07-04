import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import ArcadeLoader from '@/components/ArcadeLoader'
import PongCourt from '../components/PongCourt'
import { usePongControls } from '../hooks/usePongControls'
import { useRealtimePeer } from '../lib/realtime/useRealtimePeer'
import {
  createState, step, getWinner, WIN_SCORE, PADDLE_SPEED, PADDLE_H,
} from '../lib/pongLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const DT = 1 / 120            // fixed physics timestep
const SNAPSHOT_MS = 33        // ~30 Hz host → guest state snapshots
const INPUT_MS = 33           // ~30 Hz guest → host input
const COUNTDOWN_MS = 2000     // "get ready" before the first serve
const HALF = PADDLE_H / 2

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const r4 = (n) => Math.round(n * 1e4) / 1e4

const playSfx = (kind) => {
  if (kind === 'paddle') sounds.hit()
  else if (kind === 'wall') sounds.wall?.()
  else if (kind === 'score') sounds.go()
  else if (kind === 'pickup') sounds.join?.()
}

// Compact power-up state for the snapshot (sent host → guest).
const buildFx = (sim) => ({
  e: {
    X: { g: r4(sim.effects?.X?.grow ?? 0), s: r4(sim.effects?.X?.shrink ?? 0) },
    O: { g: r4(sim.effects?.O?.grow ?? 0), s: r4(sim.effects?.O?.shrink ?? 0) },
  },
  m: r4(sim.ballMod?.slow ?? 0),
  pk: sim.pickups?.[0] ? { x: r4(sim.pickups[0].x), y: r4(sim.pickups[0].y), k: sim.pickups[0].kind, id: sim.pickups[0].id } : null,
})

// Expand compact fx back to the shape PongCourt expects.
const expandFx = (fx) => ({
  effects: fx ? {
    X: { grow: fx.e?.X?.g ?? 0, shrink: fx.e?.X?.s ?? 0 },
    O: { grow: fx.e?.O?.g ?? 0, shrink: fx.e?.O?.s ?? 0 },
  } : null,
  ballMod: fx ? { slow: fx.m ?? 0 } : null,
  pickups: fx?.pk ? [{ id: fx.pk.id, x: fx.pk.x, y: fx.pk.y, kind: fx.pk.k }] : [],
})

function PongResult({ scoreX, scoreO, winner, mySymbol, players }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const score = sym === 'X' ? scoreX : scoreO
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {score}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">points</p>
          </div>
        )
      })}
    </div>
  )
}

export default function PongGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const courtRef = useRef(null)
  const { getDir } = usePongControls(courtRef, !isSpectator && game.status === 'playing')

  const [render, setRender] = useState({ ball: { x: 0.5, y: 0.5 }, paddles: { X: 0.5, O: 0.5 }, scoreX: 0, scoreO: 0, countdown: 0, serving: false, pickups: [], effects: null, ballMod: null })

  const guestInputRef = useRef(0)      // host: latest paddle dir from the guest (O)
  const snapRef = useRef(null)         // guest: latest snapshot from the host
  const snapAtRef = useRef(0)          // guest: perf time the snapshot arrived
  const predRef = useRef(0.5)          // guest: locally-predicted own paddle y
  const simRef = useRef(null)          // host: authoritative simulation state
  const finishedRef = useRef(false)

  const onMessage = useCallback((msg) => {
    if (msg.t === 's') { snapRef.current = msg; snapAtRef.current = performance.now() }
    else if (msg.t === 'i') { guestInputRef.current = msg.d | 0 }
    else if (msg.t === 'e') { playSfx(msg.k) }
  }, [])

  const { status: conn, statusRef: connRef, retryKey, retry, send } = useRealtimePeer({
    gameId,
    mySymbol,
    enabled: !isSpectator && game.status === 'playing',
    onMessage,
  })
  // send is stable (useCallback in the hook) but route through a ref so the
  // host loop — set up once per round — always calls the live peer's send.
  const sendRef = useRef(send)
  useEffect(() => { sendRef.current = send }, [send])
  const peerSend = (obj) => sendRef.current(obj)

  const finishRound = async (winner) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        scores[winner] = (scores[winner] || 0) + 1
        return {
          ...current, winner, status: 'finished', scores,
          pongScoreX: simRef.current?.score.X ?? current.pongScoreX ?? 0,
          pongScoreO: simRef.current?.score.O ?? current.pongScoreO ?? 0,
        }
      })
    } catch { /* the other client resolved it */ }
  }

  // --- Connection is owned by useRealtimePeer; reset round-guard on (re)start ---
  useEffect(() => {
    if (!isSpectator && game.status === 'playing') finishedRef.current = false
  }, [isSpectator, game.status, retryKey])

  // --- Host: authoritative simulation loop ---
  useEffect(() => {
    if (isSpectator || !isHost || game.status !== 'playing') return
    simRef.current = createState({ score: { X: game.pongScoreX ?? 0, O: game.pongScoreO ?? 0 } })
    finishedRef.current = false
    let raf, last = performance.now(), acc = 0, lastSnap = 0, startAt = 0

    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      // Hold the serve until the peer connects, then run a short countdown.
      if (connRef.current !== 'connected') {
        last = now; startAt = now + COUNTDOWN_MS
        setRender({ ball: simRef.current.ball, paddles: simRef.current.paddles, scoreX: simRef.current.score.X, scoreO: simRef.current.score.O, countdown: 0, serving: false, pickups: [], effects: null, ballMod: null })
        return
      }
      if (now < startAt) {
        last = now
        setRender({ ball: simRef.current.ball, paddles: simRef.current.paddles, scoreX: simRef.current.score.X, scoreO: simRef.current.score.O, countdown: Math.ceil((startAt - now) / 1000), serving: false, pickups: [], effects: null, ballMod: null })
        return
      }

      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1                       // ignore huge gaps after tab-away
      acc += dt
      const inputs = { X: getDir(simRef.current.paddles.X), O: guestInputRef.current }
      const events = []
      while (acc >= DT) {
        const res = step(simRef.current, inputs, DT)
        simRef.current = res.state
        if (res.events.length) events.push(...res.events)
        acc -= DT
      }

      for (const e of events) {
        playSfx(e.type)
        peerSend({ t: 'e', k: e.type })
        if (e.type === 'score') {
          update(ref(db, `games/${gameId}`), { pongScoreX: simRef.current.score.X, pongScoreO: simRef.current.score.O }).catch(() => {})
        }
      }

      setRender({
        ball: simRef.current.ball, paddles: simRef.current.paddles,
        scoreX: simRef.current.score.X, scoreO: simRef.current.score.O,
        countdown: 0, serving: simRef.current.serveIn > 0,
        pickups: simRef.current.pickups || [],
        effects: simRef.current.effects || null,
        ballMod: simRef.current.ballMod || null,
      })

      if (now - lastSnap >= SNAPSHOT_MS) {
        lastSnap = now
        const b = simRef.current.ball
        peerSend({
          t: 's',
          b: [r4(b.x), r4(b.y), r4(b.vx), r4(b.vy), r4(b.spin ?? 0)],
          p: [r4(simRef.current.paddles.X), r4(simRef.current.paddles.O)],
          x: simRef.current.score.X, o: simRef.current.score.O,
          fx: buildFx(simRef.current),
        })
      }

      const w = getWinner(simRef.current.score)
      if (w && !finishedRef.current) {
        finishedRef.current = true
        cancelAnimationFrame(raf)
        finishRound(w)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [gameId, isHost, isSpectator, game.status, retryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Guest: predict own paddle, extrapolate the rest from snapshots ---
  useEffect(() => {
    if (isSpectator || isHost || game.status !== 'playing') return
    predRef.current = 0.5
    let raf, last = performance.now(), lastInput = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min((now - last) / 1000, 0.1); last = now

      const dir = getDir(predRef.current)
      predRef.current = clamp(predRef.current + dir * PADDLE_SPEED * dt, HALF, 1 - HALF)
      if (now - lastInput >= INPUT_MS) { lastInput = now; peerSend({ t: 'i', d: dir }) }

      const snap = snapRef.current
      let ball = { x: 0.5, y: 0.5 }, paddleX = 0.5
      let scoreX = game.pongScoreX ?? 0, scoreO = game.pongScoreO ?? 0
      let serving = false
      let fxState = { pickups: [], effects: null, ballMod: null }
      if (snap) {
        const age = Math.min((now - snapAtRef.current) / 1000, 0.2)   // cap dead-reckoning
        const spin = snap.b[4] ?? 0
        const vy = snap.b[3] + spin * age                              // spin curves vy over time
        ball = { x: clamp(snap.b[0] + snap.b[2] * age, 0, 1), y: clamp(snap.b[1] + vy * age, 0, 1) }
        paddleX = snap.p[0]
        scoreX = snap.x; scoreO = snap.o
        serving = snap.b[2] === 0 && snap.b[3] === 0
        fxState = expandFx(snap.fx)
      }
      setRender({ ball, paddles: { X: paddleX, O: predRef.current }, scoreX, scoreO, countdown: 0, serving, ...fxState })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [gameId, isHost, isSpectator, game.status, retryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const matchTarget = game.matchLength ?? 3
  const matchWinner = (game.scores?.X || 0) >= matchTarget ? 'X' : (game.scores?.O || 0) >= matchTarget ? 'O' : null

  // --- Finished screen (everyone) ---
  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <PongResult
          scoreX={game.pongScoreX ?? render.scoreX} scoreO={game.pongScoreO ?? render.scoreO}
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

  // --- Spectator (live ball is P2P-only; show the synced score) ---
  if (isSpectator) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim">SPECTATING</p>
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {game.pongScoreX ?? 0}</span>
            <span className="text-retro-p2">{game.pongScoreO ?? 0} O</span>
          </div>
          <p className="font-pixel text-[7px] text-retro-dim/70 leading-relaxed">
            LIVE BALL IS PEER-TO-PEER · SCORE ONLY FOR SPECTATORS
          </p>
        </div>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // --- Playing ---
  let overlay = null
  if (conn === 'failed') {
    overlay = (
      <div className="text-center space-y-3 px-4">
        <p className="font-pixel text-[9px] text-retro-p2 leading-relaxed">
          CONNECTION FAILED<br />TRY A DIFFERENT NETWORK
        </p>
        <button
          onClick={() => retry()}
          className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
        >
          RETRY
        </button>
      </div>
    )
  } else if (conn !== 'connected') {
    overlay = <ArcadeLoader variant="realtime" />
  } else if (render.countdown > 0) {
    overlay = <p className="font-pixel text-5xl text-retro-win text-glow-win">{render.countdown}</p>
  }

  return (
    <div className="space-y-3">
      <PongCourt
        ref={courtRef}
        ball={render.ball} paddles={render.paddles}
        scoreX={render.scoreX} scoreO={render.scoreO}
        mySide={mySymbol}
        namesX={game.players?.X?.name} namesO={game.players?.O?.name}
        dim={conn !== 'connected'}
        serving={render.serving}
        pickups={render.pickups}
        effects={render.effects}
        ballMod={render.ballMod}
        overlay={overlay}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">FIRST TO {WIN_SCORE} POINTS · FIRST TO {matchTarget} ROUNDS WINS</p>
      {!opponentOnline && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">OPPONENT DISCONNECTED</p>
      )}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
