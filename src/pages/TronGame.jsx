import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import TronArena from '../components/TronArena'
import TouchCoachmark from '../components/TouchCoachmark'
import { useTronControls } from '../hooks/useTronControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import { showRealtimeOverlay } from '../lib/realtime/connectionLogic'
import { createState, tick, getWinner, TICK_MS } from '../lib/tronLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

function TronResult({ winner, mySymbol, players }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {winner === sym ? 'WIN' : winner === 'draw' ? 'DRAW' : 'CRASH'}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">this round</p>
          </div>
        )
      })}
    </div>
  )
}

const initialRender = { cycles: null, countdown: 0 }
const MATCH_TARGET = 3        // round wins needed to take the match — matches Snake's WIN_SCORE / Pong's default matchLength convention
const COUNTDOWN_MS = 2000     // mirrors useRealtimeHost's own DEFAULT_COUNTDOWN, used locally by the guest for its own "GET READY" display
const RENDER_DELAY_MS = 100   // guest: render slightly behind realtime so there are always two snapshots to interpolate the head between

export default function TronGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  // Public-lobby rooms go relay-only when TURN is configured (rtc.js).
  const isPublic = game.visibility === 'public'
  const arenaRef = useRef(null)
  const { getDir } = useTronControls(arenaRef, !isSpectator && game.status === 'playing')
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

  const [render, setRender] = useState(initialRender)

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

  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        return {
          ...current, winner, status: 'finished', scores,
          tronScoreX: winner === 'X' ? 1 : 0,
          tronScoreO: winner === 'O' ? 1 : 0,
        }
      })
    } catch { /* the other client resolved it */ }
  }, [gameId])

  const onEvent = useCallback((event) => {
    if (event.type === 'die') sounds.miss()
  }, [])

  const readHostInput = useCallback((sim) => {
    if (!sim) return null
    return getDir(sim.cycles.X.dir)
  }, [getDir])

  const buildSnapshot = useCallback((sim) => ({
    t: 's',
    X: sim.cycles.X.body.map(c => [c.x, c.y]),
    O: sim.cycles.O.body.map(c => [c.x, c.y]),
    xa: sim.cycles.X.alive ? 1 : 0,
    oa: sim.cycles.O.alive ? 1 : 0,
    dx: sim.cycles.X.dir,
    dy: sim.cycles.O.dir,
  }), [])

  const buildView = useCallback((sim) => ({
    cycles: sim.cycles,
    countdown: 0,
  }), [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, isPublic, enabled: isHost && game.status === 'playing',
    driver: 'tick', tickMs: TICK_MS,
    createState,
    tickSim: tick,
    readHostInput,
    consumeGuestInput: true,
    onEvent,
    buildView,
    buildSnapshot,
    getWinner,
    finishRound,
    setRender, initialRender,
  })

  // Guest: two-snapshot buffer for smooth head interpolation (trail cells
  // behind the head never move once laid, so only the head needs it) and a
  // local "GET READY" countdown — the snapshot carries neither, and
  // useRealtimeGuest only calls `tick` once a snapshot has actually arrived,
  // so "first tick call" is a reliable local stand-in for "just connected".
  const prevSnapRef = useRef(null)
  const curSnapRef = useRef(null)
  const prevArrivalRef = useRef(0)
  const curArrivalRef = useRef(0)
  const firstTickAtRef = useRef(0)

  useEffect(() => {
    firstTickAtRef.current = 0
    prevSnapRef.current = null
    curSnapRef.current = null
  }, [gameId, mySymbol, game.status])

  const guestTick = useCallback((snap, ageSec) => {
    const now = performance.now()
    const arrival = now - ageSec * 1000 // exact arrival time of `snap`

    if (snap !== curSnapRef.current) {
      prevSnapRef.current = curSnapRef.current
      prevArrivalRef.current = curArrivalRef.current
      curSnapRef.current = snap
      curArrivalRef.current = arrival
    }

    const prev = prevSnapRef.current
    let t = 1
    if (prev) {
      const span = curArrivalRef.current - prevArrivalRef.current
      t = span > 0 ? (now - RENDER_DELAY_MS - prevArrivalRef.current) / span : 1
      t = Math.min(Math.max(t, 0), 1)
    }

    const lerpHead = (prevBody, curBody) => {
      const [cx, cy] = curBody[0]
      if (!prevBody?.length) return { x: cx, y: cy }
      const [px, py] = prevBody[0]
      const dx = cx - px, dy = cy - py
      // Skip lerp across a wrap-around jump (>1 cell) — snap instead.
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return { x: cx, y: cy }
      return { x: px + dx * t, y: py + dy * t }
    }

    const toCycle = (body, prevBody, alive, dir) => ({
      body: [lerpHead(prevBody, body), ...body.slice(1).map(([x, y]) => ({ x, y }))],
      alive: !!alive,
      dir: dir || null,
    })

    if (!firstTickAtRef.current) firstTickAtRef.current = now
    const elapsed = now - firstTickAtRef.current
    const countdown = elapsed < COUNTDOWN_MS ? Math.ceil((COUNTDOWN_MS - elapsed) / 1000) : 0

    const view = {
      cycles: {
        X: toCycle(snap.X, prev?.X, snap.xa, snap.dx),
        O: toCycle(snap.O, prev?.O, snap.oa, snap.dy),
      },
      countdown,
    }
    const dir = getDir(view.cycles.O.dir ?? 'left')
    return { view, input: dir ? { t: 'i', d: dir } : null }
  }, [getDir])

  const guestConn = useRealtimeGuest({
    gameId, mySymbol, isPublic, enabled: !isSpectator && !isHost && game.status === 'playing',
    tick: guestTick,
    setRender, initialRender,
    sfxMap: { die: () => sounds.miss() },
    INPUT_MS: 0,
  })

  const conn = isHost ? hostConn : guestConn

  const matchWinner = (game.scores?.X || 0) >= MATCH_TARGET ? 'X' : (game.scores?.O || 0) >= MATCH_TARGET ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <TronResult winner={game.winner} mySymbol={mySymbol} players={game.players} />
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
        <SpectatorCard game={game} statusOverride="LIVE GRID IS P2P — RESULT ONLY" />
      </div>
    )
  }

  // --- Playing --- (SWITCH GAME is hidden while live — M-76 — replaced by a
  // dedicated FORFEIT ROUND action below, which only concedes this round.)
  const overlayCountdown = render.countdown
  const overlay = showRealtimeOverlay(conn.status, overlayCountdown)
    ? <RealtimeOverlay conn={conn.status} countdown={overlayCountdown} retry={conn.retry} gameId={gameId} mySymbol={mySymbol} opponentOnline={opponentOnline} />
    : null

  return (
    <div className="space-y-3 [@media(max-height:420px)]:space-y-1.5">
      <TronArena
        ref={arenaRef}
        cycles={render.cycles}
        mySide={mySymbol}
        namesX={game.players?.X?.name}
        namesO={game.players?.O?.name}
        dim={conn.status !== 'connected'}
        overlay={overlay}
      />
      <TouchCoachmark
        gameKey="tron"
        gesture="swipe"
        text="SWIPE OR HOLD + DRAG TO STEER"
        active={coachActive}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim [@media(max-height:420px)]:hidden">LAST CYCLE ALIVE WINS · FIRST TO {MATCH_TARGET} ROUNDS WINS</p>
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
