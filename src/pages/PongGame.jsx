import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import OfflineNotice from '../components/loading/OfflineNotice'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import { showRealtimeOverlay } from '../lib/realtime/connectionLogic'
import { createDelayLine, delaySteps, hostInputDelayMs, isInputStale, STALE_INPUT_MS } from '../lib/realtime/netLogic'
import PongArena from '../components/PongArena'
import TouchCoachmark from '../components/TouchCoachmark'
import { usePongControls } from '../hooks/usePongControls'
import { usePongFx } from '../hooks/usePongFx'
import { useRealtimePeer } from '../lib/realtime/useRealtimePeer'
import {
  createState, step, getRoundWinner, isSuddenDeath, nextServeTo, getMode, paddleHalf,
  encodeSnapshot, decodeSnapshot, extrapolateBalls, PADDLE_SPEED,
} from '../lib/pongLogic'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

const DT = 1 / 120            // fixed physics timestep
const SNAPSHOT_MS = 33        // ~30 Hz host → guest state snapshots
const INPUT_MS = 33           // ~30 Hz guest → host input
const COUNTDOWN_MS = 2000     // "get ready" before the first serve
const RECONCILE_LERP = 0.2    // guest: per-frame correction of predicted own paddle toward the host's value

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const r2 = (n) => Math.round(n * 100) / 100

// Events worth relaying to the guest for sound + visual feedback, trimmed to
// the fields usePongFx reads.
const FX_EVENTS = new Set(['paddle', 'wall', 'bump', 'pickup', 'shield', 'score', 'rally', 'timeup'])
const slimEvent = (e) => {
  const out = { type: e.type }
  for (const k of ['side', 'by', 'kind', 'rally', 'n', 'suddenDeath']) if (e[k] != null) out[k] = e[k]
  for (const k of ['x', 'y', 'speed']) if (e[k] != null) out[k] = Math.round(e[k] * 1000) / 1000
  return out
}

const viewOf = (s, serving) => ({
  mode: s.mode, balls: s.balls, paddles: s.paddles, pickups: s.pickups || [], effects: s.effects,
  ballMod: s.ballMod, time: s.time, clock: s.clock, rally: s.rally, score: s.score, serving,
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
  const isPublic = game.visibility === 'public'
  const mode = getMode(game.pongMode)
  const courtRef = useRef(null)
  const touchRef = useRef(null)
  const viewRef = useRef(null)
  const { getDir } = usePongControls(courtRef, !isSpectator && game.status === 'playing', { touchRef, viewRef })
  const names = { X: game.players?.X?.name, O: game.players?.O?.name }
  const { fx, emit } = usePongFx({ mySide: mySymbol })
  // M-49: independent pre-round display window for the coachmark, driven off
  // the game-status transition rather than render.countdown (which the guest
  // tick always reports as 0 — see TouchCoachmark) — so the coachmark reaches
  // both the host AND the joining/guest seat.
  const [coachActive, setCoachActive] = useState(false)
  useEffect(() => {
    const active = !isSpectator && game.status === 'playing'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot display window driven by the status transition, mirrors RealtimeOverlay's everConnected ratchet
    setCoachActive(active)
    if (!active) return
    const t = setTimeout(() => setCoachActive(false), 3000)
    return () => clearTimeout(t)
  }, [isSpectator, game.status])

  const [render, setRender] = useState(() => ({
    view: viewOf(createState({ mode: mode.id, serveIn: 1 }), false),
    countdown: 0,
  }))

  // M-76: lightweight, no-consent-needed forfeit for the current round only
  // (hands the win to the opponent via the existing finishRound path) —
  // distinct from SWITCH GAME, which reroutes the whole room's game type.
  const [forfeitArmed, setForfeitArmed] = useState(false)
  const forfeitTimerRef = useRef(null)
  const [forfeitBusy, runForfeit] = useBusy()
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

  const guestInputRef = useRef(0)      // host: latest paddle intent from the guest (O), analog [-1, 1]
  const guestInputAtRef = useRef(0)    // host: perf time of the last guest input frame (stale-input expiry)
  const snapRef = useRef(null)         // guest: latest decoded snapshot from the host
  const snapAtRef = useRef(0)          // guest: perf time the snapshot arrived
  const predRef = useRef(0.5)          // guest: locally-predicted own paddle y
  const simRef = useRef(null)          // host: authoritative simulation state
  const finishedRef = useRef(false)
  const lastServeToRef = useRef(null)  // host: who served the previous round, for alternation
  const connectedAtRef = useRef(0)     // guest: perf time the connection reached 'connected', for the local countdown

  const onMessage = useCallback((msg) => {
    if (msg.t === 's') { snapRef.current = decodeSnapshot(msg); snapAtRef.current = performance.now() }
    else if (msg.t === 'i') { guestInputRef.current = clamp(Number(msg.d) || 0, -1, 1); guestInputAtRef.current = performance.now() }
    else if (msg.t === 'e' && Array.isArray(msg.v)) { emit(msg.v) }
  }, [emit])

  const { status: conn, statusRef: connRef, retry, send, getRtt } = useRealtimePeer({
    gameId,
    mySymbol,
    isPublic,
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

  // --- Connection is owned by useRealtimePeer; reset round-guard on (re)start.
  // A reconnect (either side's RETRY) swaps the RTCPeerConnection in place, so
  // the loops below freeze while status !== 'connected' and resume the same
  // round — they deliberately don't restart on retryKey.
  useEffect(() => {
    if (!isSpectator && game.status === 'playing') finishedRef.current = false
  }, [isSpectator, game.status])

  // --- Host: authoritative simulation loop ---
  useEffect(() => {
    if (isSpectator || !isHost || game.status !== 'playing') return
    // M-?: alternate which side receives the opening serve each round —
    // nextServeTo flips from the previous round's server, or picks randomly
    // for the very first round of the session — so serve advantage doesn't
    // favor the same side every round (createState's own default always
    // opened toward 'O').
    const serveTo = nextServeTo(lastServeToRef.current)
    lastServeToRef.current = serveTo
    simRef.current = createState({ mode: mode.id, score: { X: game.pongScoreX ?? 0, O: game.pongScoreO ?? 0 }, serveTo })
    finishedRef.current = false
    let raf, last = performance.now(), acc = 0, lastSnap = 0, startAt = 0
    // Fairness: the host's own paddle input goes through a delay line of
    // ≈ RTT/2 (capped) so it reaches the sim no sooner than the guest's does
    // (equalizeHostInput — see netLogic.js). Latched analog input.
    const hostDelay = createDelayLine()

    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      // Hold the serve until the peer connects, then run a short countdown.
      // Link down / reconnecting (F-47): the sim freezes here — no stepping,
      // no scoring — and resumes the same round after the countdown.
      if (connRef.current !== 'connected') {
        last = now; startAt = now + COUNTDOWN_MS; acc = 0
        hostDelay.reset()
        guestInputRef.current = 0
        setRender({ view: viewOf(simRef.current, false), countdown: 0 })
        return
      }
      if (now < startAt) {
        last = now
        setRender({ view: viewOf(simRef.current, false), countdown: Math.ceil((startAt - now) / 1000) })
        return
      }

      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1                       // ignore huge gaps after tab-away
      acc += dt
      if (guestInputRef.current && isInputStale(guestInputAtRef.current, now, STALE_INPUT_MS)) guestInputRef.current = 0
      const hostDir = getDir(simRef.current.paddles.X)
      const hostDelaySteps = delaySteps(hostInputDelayMs(getRtt()), DT)
      const events = []
      while (acc >= DT) {
        const inputs = { X: hostDelay.push(hostDir, hostDelaySteps) ?? 0, O: guestInputRef.current }
        const res = step(simRef.current, inputs, DT)
        simRef.current = res.state
        if (res.events.length) events.push(...res.events)
        acc -= DT
      }

      if (events.length) {
        const shown = events
          .filter(e => FX_EVENTS.has(e.type))
          .map(e => (e.type === 'timeup' ? { ...e, suddenDeath: isSuddenDeath(simRef.current) } : e))
        emit(shown)
        if (shown.length) peerSend({ t: 'e', v: shown.map(slimEvent) })
        if (events.some(e => e.type === 'score')) {
          update(ref(db, `games/${gameId}`), { pongScoreX: simRef.current.score.X, pongScoreO: simRef.current.score.O }).catch(() => {})
        }
      }

      setRender({ view: viewOf(simRef.current, simRef.current.serveIn > 0), countdown: 0 })

      if (now - lastSnap >= SNAPSHOT_MS) {
        lastSnap = now
        peerSend(encodeSnapshot(simRef.current))
      }

      const w = getRoundWinner(simRef.current)
      if (w && !finishedRef.current) {
        finishedRef.current = true
        cancelAnimationFrame(raf)
        peerSend(encodeSnapshot(simRef.current))
        finishRound(w)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [gameId, isHost, isSpectator, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Guest: predict own paddle, extrapolate the rest from snapshots ---
  useEffect(() => {
    if (isSpectator || isHost || game.status !== 'playing') return
    predRef.current = 0.5
    connectedAtRef.current = 0
    snapRef.current = null
    const idle = createState({ mode: mode.id, serveIn: 1, score: { X: game.pongScoreX ?? 0, O: game.pongScoreO ?? 0 } })
    let raf, last = performance.now(), lastInput = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min((now - last) / 1000, 0.1); last = now
      const snap = snapRef.current
      const effects = snap?.effects ?? idle.effects
      const eh = paddleHalf(effects, 'O')

      const dir = getDir(predRef.current)
      predRef.current = clamp(predRef.current + dir * PADDLE_SPEED * dt, eh, 1 - eh)
      if (now - lastInput >= INPUT_MS) { lastInput = now; peerSend({ t: 'i', d: r2(dir) }) }

      // M-?: mirror the host's "hold the serve until connected, then count
      // down COUNTDOWN_MS" window locally — the host never sends this over
      // the wire, so derive it from the same connRef transition the host
      // gates its own loop on.
      if (connRef.current === 'connected') {
        if (!connectedAtRef.current) connectedAtRef.current = now
      } else {
        connectedAtRef.current = 0
      }
      const countdown = connectedAtRef.current
        ? Math.max(0, Math.ceil((connectedAtRef.current + COUNTDOWN_MS - now) / 1000))
        : 0

      if (!snap) {
        setRender({ view: { ...viewOf(idle, false), paddles: { X: 0.5, O: predRef.current } }, countdown })
        return
      }
      const age = Math.min((now - snapAtRef.current) / 1000, 0.2)   // cap dead-reckoning
      // M-?: the guest predicts its own paddle locally for zero-lag input,
      // but the host is the collision authority and computes its own copy
      // of the guest's paddle (snap.paddles.O) from delayed network input —
      // without correction the two permanently disagree. Blend the local
      // prediction toward the host's value each frame rather than snapping
      // to it, so responsiveness is preserved.
      predRef.current = clamp(predRef.current + (snap.paddles.O - predRef.current) * RECONCILE_LERP, eh, 1 - eh)
      setRender({
        view: {
          ...snap,
          mode: mode.id,
          time: snap.time + age,
          clock: mode.timeLimit ? Math.max(0, snap.clock - age) : snap.clock,
          balls: extrapolateBalls(snap.balls, age, snap.ballMod),
          paddles: { X: snap.paddles.X, O: predRef.current },
        },
        countdown,
      })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [gameId, isHost, isSpectator, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const matchTarget = game.matchLength ?? 3
  const matchWinner = (game.scores?.X || 0) >= matchTarget ? 'X' : (game.scores?.O || 0) >= matchTarget ? 'O' : null

  // --- Finished screen (everyone) ---
  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <p className="text-center font-pixel text-[8px] text-retro-dim tracking-widest">{mode.label} · {mode.blurb}</p>
        <PongResult
          scoreX={game.pongScoreX ?? render.view.score.X} scoreO={game.pongScoreO ?? render.view.score.O}
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
          <p className="font-pixel text-[9px] text-retro-dim">SPECTATING · {mode.label}</p>
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {game.pongScoreX ?? 0}</span>
            <span className="text-retro-p2">{game.pongScoreO ?? 0} O</span>
          </div>
          <p className="font-pixel text-[8px] text-retro-dim/70 leading-relaxed">
            LIVE BALL IS PEER-TO-PEER · SCORE ONLY FOR SPECTATORS
          </p>
        </div>
      </div>
    )
  }

  // --- Playing --- (SWITCH GAME is hidden while live — M-76 — replaced by a
  // dedicated FORFEIT action in the HUD, which only concedes this round.)
  const overlay = showRealtimeOverlay(conn, render.countdown)
    ? <RealtimeOverlay conn={conn} countdown={render.countdown} retry={retry} gameId={gameId} mySymbol={mySymbol} opponentOnline={opponentOnline} />
    : null
  const forfeit = !proposal && (
    <button
      onClick={handleForfeit}
      disabled={forfeitBusy}
      className={cn(
        'min-h-10 px-2 font-pixel text-[8px] tracking-wide rounded border transition-colors disabled:opacity-50',
        forfeitArmed ? 'text-retro-danger border-retro-danger/60' : 'text-retro-dim border-retro-border hover:text-retro-danger',
      )}
    >
      {forfeitBusy ? 'FORFEITING…' : forfeitArmed ? 'TAP AGAIN' : 'FORFEIT'}
    </button>
  )

  return (
    <PongArena
      mySide={mySymbol}
      names={names}
      points={render.view.score}
      rounds={{ X: game.scores?.X || 0, O: game.scores?.O || 0, target: matchTarget }}
      view={render.view}
      fx={fx}
      overlay={overlay}
      dim={conn !== 'connected'}
      actions={forfeit}
      courtRef={courtRef}
      touchRef={touchRef}
      viewRef={viewRef}
      footer={(
        <>
          <TouchCoachmark
            gameKey="pong"
            gesture="drag"
            text="DRAG ANYWHERE TO MOVE YOUR PADDLE"
            active={coachActive}
          />
          {!opponentOnline && <OfflineNotice label="OPPONENT" />}
        </>
      )}
    />
  )
}
