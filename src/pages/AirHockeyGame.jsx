import { useCallback, useEffect, useRef, useState } from 'react'
import { ref as dbRef, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import AirHockeyTable from '../components/AirHockeyTable'
import { useAirhockeyControls } from '../hooks/useAirhockeyControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import {
  createState, step, getWinner, clampMalletTarget,
  COURT_W, COURT_H, PUCK_R, WIN_SCORE,
} from '../lib/airhockeyLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

const r4 = (n) => Math.round(n * 1e4) / 1e4
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

const initialPuck = { x: COURT_W / 2, y: COURT_H / 2 }
const initialMallets = { X: { x: COURT_W / 2, y: COURT_H - 0.25 }, O: { x: COURT_W / 2, y: 0.25 } }
const initialRender = { puck: initialPuck, mallets: initialMallets, scoreX: 0, scoreO: 0, countdown: 0 }

// The guest's WebRTC peer connection reaches 'connected' independently of
// (and slightly before) the host's own COUNTDOWN_MS gate — see SumoGame's
// identical comment. Keep in sync with useRealtimeHost's DEFAULT_COUNTDOWN.
const GUEST_COUNTDOWN_MS = 2000

function AirHockeyResult({ winner, mySymbol, players, scoreX = 0, scoreO = 0 }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map((sym) => {
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
            <p className="font-pixel text-[8px] text-retro-dim">goals</p>
          </div>
        )
      })}
    </div>
  )
}

export default function AirHockeyGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const playing = !isSpectator && game.status === 'playing'
  const tableRef = useRef(null)
  const { getInput } = useAirhockeyControls(tableRef, mySymbol || 'X', playing)

  const [render, setRender] = useState(initialRender)
  const simRef = useRef(null)           // host: mirror of the hook's sim, kept fresh for finish()
  const lastSnapRef = useRef(null)      // guest: last snapshot object (to detect new ones)
  const lastScoreWriteRef = useRef(0)   // host: throttle Firebase score writes

  // Brief goal flash — shared by host (local sim events) and guest (broadcast
  // 'e' messages via sfxMap below), purely a transient UI cue.
  const [flash, setFlash] = useState(null)
  const flashTimerRef = useRef(null)
  const triggerFlash = useCallback(() => {
    setFlash('goal')
    clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlash(null), 500)
  }, [])
  useEffect(() => () => clearTimeout(flashTimerRef.current), [])

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

  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(dbRef(db, `games/${gameId}`), (current) => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        scores[winner] = (scores[winner] || 0) + 1
        return {
          ...current, winner, status: 'finished', scores,
          airhockeyScoreX: simRef.current?.score.X ?? current.airhockeyScoreX ?? 0,
          airhockeyScoreO: simRef.current?.score.O ?? current.airhockeyScoreO ?? 0,
        }
      })
    } catch { /* the other client resolved it */ }
  }, [gameId])

  const onEvent = useCallback((event, sim) => {
    if (event.type === 'hit') sounds.hit(3)
    else if (event.type === 'wall') sounds.move('O')
    else if (event.type === 'goal') {
      sounds.win()
      triggerFlash()
      simRef.current = sim
      const now = performance.now()
      if (now - lastScoreWriteRef.current >= 300) {
        lastScoreWriteRef.current = now
        update(dbRef(db, `games/${gameId}`), {
          airhockeyScoreX: sim.score.X, airhockeyScoreO: sim.score.O,
        }).catch(() => {})
      }
    }
  }, [gameId, triggerFlash])

  const readHostInput = useCallback((sim) => {
    simRef.current = sim
    return getInput()
  }, [getInput])

  const buildView = useCallback((sim) => ({
    puck: { x: sim.puck.x, y: sim.puck.y },
    mallets: { X: { ...sim.mallets.X }, O: { ...sim.mallets.O } },
    scoreX: sim.score.X, scoreO: sim.score.O, countdown: 0,
  }), [])

  const buildSnapshot = useCallback((sim) => {
    simRef.current = sim
    return {
      t: 's',
      p: [r4(sim.puck.x), r4(sim.puck.y), r4(sim.puck.vx), r4(sim.puck.vy)],
      mX: [r4(sim.mallets.X.x), r4(sim.mallets.X.y), r4(sim.velocities.X.vx), r4(sim.velocities.X.vy)],
      sx: sim.score.X,
      so: sim.score.O,
    }
  }, [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, enabled: isHost && playing,
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
    lastSnapRef.current = snap
    // Zero-input-lag local prediction: the sim is position-driven (teleport
    // to target, clamped), so clamping the raw target IS the true position —
    // no interpolation/physics to approximate.
    const target = getInput(dt)
    const own = clampMalletTarget('O', target.x, target.y)

    // Dead-reckon the puck + host mallet from the snapshot's velocity, capped
    // at 0.15s (same idea as Sumo/Space Duel/Pac-Mac's guest prediction).
    const a = Math.min(age, 0.15)
    const puck = {
      x: clamp(snap.p[0] + snap.p[2] * a, PUCK_R, COURT_W - PUCK_R),
      y: clamp(snap.p[1] + snap.p[3] * a, PUCK_R, COURT_H - PUCK_R),
    }
    const hostMallet = clampMalletTarget('X', snap.mX[0] + snap.mX[2] * a, snap.mX[1] + snap.mX[3] * a)

    const view = {
      puck,
      mallets: { X: hostMallet, O: own },
      scoreX: snap.sx ?? 0, scoreO: snap.so ?? 0,
      countdown: 0,
    }
    // Continuous target position — last-write-wins (default mergeInput) is
    // correct here, unlike Space Duel's edge-triggered fire flag: there's
    // nothing transient to lose between two throttled sends, only the
    // latest pointer position matters.
    return { view, input: { t: 'i', d: { x: target.x, y: target.y } } }
  }, [getInput])

  const guestConn = useRealtimeGuest({
    gameId, mySymbol, enabled: !isSpectator && !isHost && playing,
    tick: guestTick,
    setRender, initialRender,
    sfxMap: {
      hit: () => sounds.hit(3),
      wall: () => sounds.move('O'),
      goal: () => { sounds.win(); triggerFlash() },
    },
    INPUT_MS: 33,
  })

  const conn = isHost ? hostConn : guestConn

  // Guest-only local countdown (see GUEST_COUNTDOWN_MS above) — the host's
  // COUNTDOWN_MS gate is invisible to the guest.
  const [guestCountdown, setGuestCountdown] = useState(0)
  const guestStartAtRef = useRef(0)
  useEffect(() => {
    if (isHost || isSpectator || !playing || guestConn.status !== 'connected') {
      guestStartAtRef.current = 0
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way reset driven by the external peer/game-status transition, mirrors SumoGame's identical pattern
      setGuestCountdown(0)
      return
    }
    guestStartAtRef.current = Date.now() + GUEST_COUNTDOWN_MS
    const iv = setInterval(() => {
      const remain = Math.ceil((guestStartAtRef.current - Date.now()) / 1000)
      setGuestCountdown(remain > 0 ? remain : 0)
      if (remain <= 0) clearInterval(iv)
    }, 200)
    return () => clearInterval(iv)
  }, [isHost, isSpectator, playing, guestConn.status])

  // Best-of-5 rounds (matchTarget 3), each round first to WIN_SCORE goals —
  // same shape as Pong; Game.jsx derives the same default (3) for any
  // realtime game not in SINGLE_ROUND_GAMES.
  const matchTarget = 3
  const matchWinner = (game.scores?.X || 0) >= matchTarget ? 'X' : (game.scores?.O || 0) >= matchTarget ? 'O' : null

  // --- Finished screen (everyone) ---
  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <AirHockeyResult
          winner={game.winner} mySymbol={mySymbol} players={game.players}
          scoreX={game.airhockeyScoreX ?? render.scoreX}
          scoreO={game.airhockeyScoreO ?? render.scoreO}
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

  // --- Spectator (live puck is P2P-only) ---
  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride="LIVE PUCK IS PEER-TO-PEER" />
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2">
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {game.airhockeyScoreX ?? 0}</span>
            <span className="text-retro-p2">{game.airhockeyScoreO ?? 0} O</span>
          </div>
        </div>
      </div>
    )
  }

  // --- Playing --- (SWITCH GAME is hidden while live, replaced by a
  // dedicated FORFEIT ROUND action below, which only concedes this round.)
  const overlay = <RealtimeOverlay conn={conn.status} countdown={isHost ? render.countdown : guestCountdown} retry={conn.retry} />

  return (
    <div className="space-y-3 [@media(max-height:420px)]:space-y-1.5">
      <div className="flex items-center justify-center gap-4 font-pixel text-base">
        <span className="text-retro-p1">{render.scoreX}</span>
        <span className="text-[8px] text-retro-dim tracking-widest">AIR HOCKEY</span>
        <span className="text-retro-p2">{render.scoreO}</span>
      </div>
      <AirHockeyTable
        tableRef={tableRef}
        puck={render.puck}
        mallets={render.mallets}
        flash={flash}
        dim={conn.status !== 'connected'}
        overlay={overlay}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim [@media(max-height:420px)]:hidden">
        DRAG YOUR MALLET · FIRST TO {WIN_SCORE} GOALS · FIRST TO {matchTarget} ROUNDS WINS
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
