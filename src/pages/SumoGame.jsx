import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import SumoArena from '../components/SumoArena'
import TouchCoachmark from '../components/TouchCoachmark'
import { useSumoControls } from '../hooks/useSumoControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import {
  createState, step, getWinner,
  PUSH_IMPULSE, FRICTION, MAX_SPEED, START_RADIUS,
} from '../lib/sumoLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

const r4 = (n) => Math.round(n * 1e4) / 1e4

const INITIAL_VIEW = {
  blobs: {
    X: { x: 0.3, y: 0.5, vx: 0, vy: 0, alive: true },
    O: { x: 0.7, y: 0.5, vx: 0, vy: 0, alive: true },
  },
  arenaR: START_RADIUS,
  countdown: 0,
}

function SumoResult({ winner, mySymbol, players }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map((sym) => {
        const won = winner === sym
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', won ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
              {won ? 'WIN' : 'OUT'}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">{sym === 'X' ? 'RED' : 'BLUE'}</p>
          </div>
        )
      })}
    </div>
  )
}

export default function SumoGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const playing = !isSpectator && game.status === 'playing'
  // M-49: independent pre-round display window for the coachmark, driven off
  // the game-status transition rather than render.countdown (which the guest
  // tick always reports as 0 — see TouchCoachmark) — so the coachmark reaches
  // both the host AND the joining/guest seat.
  const [coachActive, setCoachActive] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot display window driven by the status transition, mirrors RealtimeOverlay's everConnected ratchet
    setCoachActive(playing)
    if (!playing) return
    const t = setTimeout(() => setCoachActive(false), 3000)
    return () => clearTimeout(t)
  }, [playing])

  const [render, setRender] = useState(INITIAL_VIEW)
  const { getTap, press } = useSumoControls(playing)

  const predRef = useRef({ x: 0.7, y: 0.5, vx: 0, vy: 0 })
  const lastSnapRef = useRef(null)

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

  const onEvent = useCallback((event) => {
    if (event.type === 'out') sounds.miss()
  }, [])

  const buildSnapshot = useCallback((sim) => {
    const X = sim.blobs.X
    const O = sim.blobs.O
    return {
      t: 's',
      X: [r4(X.x), r4(X.y), r4(X.vx), r4(X.vy), X.alive ? 1 : 0],
      O: [r4(O.x), r4(O.y), r4(O.vx), r4(O.vy), O.alive ? 1 : 0],
      r: r4(sim.arenaR),
    }
  }, [])

  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), (current) => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        return {
          ...current, winner, status: 'finished', scores,
          sumoScoreX: winner === 'X' ? 1 : 0,
          sumoScoreO: winner === 'O' ? 1 : 0,
        }
      })
    } catch { /* the other client resolved it */ }
  }, [gameId])

  const buildView = useCallback((sim) => ({
    blobs: sim.blobs,
    arenaR: sim.arenaR,
    countdown: 0,
  }), [])

  const readHostInput = useCallback(() => ({ press: getTap() }), [getTap])

  const host = useRealtimeHost({
    gameId, mySymbol, enabled: isHost && playing,
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
    setRender,
    initialRender: INITIAL_VIEW,
  })

  const tick = useCallback((snap, age, dt) => {
    if (snap !== lastSnapRef.current) {
      lastSnapRef.current = snap
      const me = snap[mySymbol]
      predRef.current = { x: me[0], y: me[1], vx: me[2], vy: me[3] }
    }
    const oppSide = mySymbol === 'X' ? 'O' : 'X'
    const tap = getTap()
    let { x, y, vx, vy } = predRef.current
    const f = Math.exp(-FRICTION * dt)
    vx *= f
    vy *= f
    if (tap) {
      const opp = snap[oppSide]
      const dx = opp[0] - x
      const dy = opp[1] - y
      const dist = Math.hypot(dx, dy) || 1
      vx += PUSH_IMPULSE * (dx / dist)
      vy += PUSH_IMPULSE * (dy / dist)
    }
    const sp = Math.hypot(vx, vy)
    if (sp > MAX_SPEED) { vx *= MAX_SPEED / sp; vy *= MAX_SPEED / sp }
    x += vx * dt
    y += vy * dt
    if (x < 0) { x = 0; vx = -vx }
    else if (x > 1) { x = 1; vx = -vx }
    if (y < 0) { y = 0; vy = -vy }
    else if (y > 1) { y = 1; vy = -vy }
    predRef.current = { x, y, vx, vy }

    const opp = snap[oppSide]
    const a = Math.min(age, 0.15)
    const ox = opp[0] + opp[2] * a
    const oy = opp[1] + opp[3] * a
    const view = {
      blobs: {
        [mySymbol]: { x, y, vx, vy, alive: !!snap[mySymbol][4] },
        [oppSide]: { x: ox, y: oy, vx: opp[2], vy: opp[3], alive: !!opp[4] },
      },
      arenaR: snap.r,
      countdown: 0,
    }
    return {
      view,
      input: tap ? { t: 'i', d: { press: 1 } } : null,
    }
  }, [mySymbol, getTap])

  const guest = useRealtimeGuest({
    gameId, mySymbol, enabled: !isHost && playing,
    tick,
    setRender,
    initialRender: INITIAL_VIEW,
    sfxMap: { out: () => sounds.miss() },
    INPUT_MS: 0,
  })

  const conn = isHost ? host.status : isSpectator ? null : guest.status
  const retry = isHost ? host.retry : isSpectator ? null : guest.retry

  // Single round decides the match → the round winner is the match winner.
  const matchWinner = (game.scores?.X || 0) >= 1 ? 'X' : (game.scores?.O || 0) >= 1 ? 'O' : null

  // --- Finished screen (everyone) ---
  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <SumoResult winner={game.winner} mySymbol={mySymbol} players={game.players} />
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

  // --- Spectator (live blobs are P2P-only) ---
  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride="LIVE BLOBS ARE PEER-TO-PEER — RESULT ONLY" />
      </div>
    )
  }

  // --- Playing --- (SWITCH GAME is hidden while live — M-76 — replaced by a
  // dedicated FORFEIT ROUND action below, which only concedes this round.)
  const overlay = <RealtimeOverlay conn={conn} countdown={render.countdown} retry={retry} />

  return (
    <div className="space-y-3 [@media(max-height:420px)]:space-y-1.5">
      <SumoArena
        blobs={render.blobs}
        arenaR={render.arenaR}
        mySide={mySymbol}
        namesX={game.players?.X?.name}
        namesO={game.players?.O?.name}
        dim={conn !== 'connected'}
        overlay={overlay}
      />
      <TouchCoachmark
        gameKey="sumo"
        gesture="tap"
        text="TAP PUSH TO SHOVE YOUR OPPONENT OFF"
        active={coachActive}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim [@media(max-height:420px)]:hidden">SHRINKING PLATFORM · LAST ONE ON WINS · TAP TO PUSH</p>
      {!opponentOnline && <OfflineNotice label="OPPONENT" />}
      <div className="flex justify-center pt-1">
        <button
          onPointerDown={(e) => { e.preventDefault(); press() }}
          className="px-10 py-4 bg-retro-cta text-retro-bg font-pixel text-sm rounded-lg hover:shadow-neon-cta active:scale-95 active:bg-retro-cta/80 select-none touch-none"
        >
          PUSH
        </button>
      </div>
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
