import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import { showRealtimeOverlay } from '../lib/realtime/connectionLogic'
import SnakeArena from '../components/SnakeArena'
import TouchCoachmark from '../components/TouchCoachmark'
import { useSnakeControls } from '../hooks/useSnakeControls'
import { useRealtimePeer } from '../lib/realtime/useRealtimePeer'
import { createState, tick, getWinner, WIN_SCORE, TICK_MS } from '../lib/snakeLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

const COUNTDOWN_MS = 3000  // a full 3-2-1 before the first tick, on both seats
const RENDER_DELAY_MS = 100  // guest: render slightly behind realtime so there are always two snapshots to interpolate between

const playSfx = (kind) => {
  if (kind === 'eat') sounds.hit()
  else if (kind === 'die') sounds.miss()
}

function SnakeResult({ eatenX, eatenO, winner, mySymbol, players }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const eaten = sym === 'X' ? eatenX : eatenO
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {eaten}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">food eaten</p>
          </div>
        )
      })}
    </div>
  )
}

export default function SnakeGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  // Public-lobby rooms go relay-only when TURN is configured (rtc.js).
  const isPublic = game.visibility === 'public'
  const arenaRef = useRef(null)
  const { getDir } = useSnakeControls(arenaRef, !isSpectator && game.status === 'playing')
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

  // Render state: the latest snake positions + food, for drawing the arena.
  const [render, setRender] = useState({
    snakes: null, food: null, eatenX: 0, eatenO: 0, countdown: 0,
  })

  const guestQueueRef = useRef([])        // host: queued directions from the guest (O), cap 2 pending
  const snapRef = useRef(null)            // guest: latest snapshot from the host
  const snapAtRef = useRef(0)             // guest: perf time the latest snapshot arrived
  const prevSnapRef = useRef(null)        // guest: previous snapshot, for interpolation
  const prevSnapAtRef = useRef(0)         // guest: perf time the previous snapshot arrived
  const connectedAtRef = useRef(0)        // guest: perf time we first saw 'connected', for a local GET READY countdown
  const simRef = useRef(null)             // host: authoritative simulation state
  const finishedRef = useRef(false)
  const hostDirRef = useRef(null)         // host: latest local direction (X)

  const onMessage = useCallback((msg) => {
    if (msg.t === 's') {
      // Snapshot: { t:'s', X:[[x,y],...], O:[[x,y],...], f:[x,y]|null, x:eatenX, o:eatenO, d:dirX, e:dirO }
      prevSnapRef.current = snapRef.current
      prevSnapAtRef.current = snapAtRef.current
      snapRef.current = msg
      snapAtRef.current = performance.now()
    } else if (msg.t === 'i') {
      // M-XX: queue guest turns (cap 2 pending distinct changes) instead of
      // last-write-wins — two quick sequential turns sent one rAF frame
      // apart must both register across consecutive host ticks, not
      // collapse into whichever arrived last before a given tick.
      const q = guestQueueRef.current
      if (q[q.length - 1] !== msg.d) {
        q.push(msg.d)
        if (q.length > 2) q.shift()
      }
    } else if (msg.t === 'e') {
      playSfx(msg.k)
    }
  }, [])

  const { status: conn, statusRef: connRef, retry, send } = useRealtimePeer({
    gameId,
    mySymbol,
    isPublic,
    enabled: !isSpectator && game.status === 'playing',
    onMessage,
  })
  const sendRef = useRef(send)
  useEffect(() => { sendRef.current = send }, [send])
  const peerSend = (obj) => sendRef.current(obj)

  const finishRound = async (winner) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        return {
          ...current, winner, status: 'finished', scores,
          snakeScoreX: simRef.current?.snakes.X.eaten ?? current.snakeScoreX ?? 0,
          snakeScoreO: simRef.current?.snakes.O.eaten ?? current.snakeScoreO ?? 0,
        }
      })
    } catch { /* the other client resolved it */ }
  }

  // Reset round-guard on (re)start
  useEffect(() => {
    if (!isSpectator && game.status === 'playing') finishedRef.current = false
  }, [isSpectator, game.status])

  // --- Host: authoritative simulation loop ---
  useEffect(() => {
    if (isSpectator || !isHost || game.status !== 'playing') return
    simRef.current = createState()
    finishedRef.current = false
    hostDirRef.current = null
    guestQueueRef.current = []
    let timer, lastSnap = 0, startAt = 0

    const renderSim = (countdown = 0) => {
      const s = simRef.current
      setRender({
        snakes: s.snakes,
        food: s.food,
        eatenX: s.snakes.X.eaten,
        eatenO: s.snakes.O.eaten,
        countdown,
      })
    }

    const loop = () => {
      timer = setTimeout(loop, TICK_MS)
      // Link down (F-47): the sim is frozen here — no ticks, no scoring —
      // and queued guest turns are dropped so none land stale on resume.
      if (connRef.current !== 'connected') {
        startAt = Date.now() + COUNTDOWN_MS
        guestQueueRef.current = []
        renderSim(0)
        return
      }
      if (Date.now() < startAt) {
        renderSim(Math.ceil((startAt - Date.now()) / 1000))
        return
      }

      const s = simRef.current
      const inputs = {
        X: getDir(s.snakes.X.dir),
        // Dequeue one pending guest turn per tick (instead of always taking
        // only the latest) so two quick sequential turns both register
        // across consecutive ticks rather than collapsing into one.
        O: guestQueueRef.current.shift() ?? null,
      }
      const { state: next, events } = tick(s, inputs)
      simRef.current = next

      for (const e of events) {
        playSfx(e.type)
        peerSend({ t: 'e', k: e.type })
        if (e.type === 'eat') {
          update(ref(db, `games/${gameId}`), {
            snakeScoreX: next.snakes.X.eaten,
            snakeScoreO: next.snakes.O.eaten,
          }).catch(() => {})
        }
      }

      renderSim(0)

      // Broadcast snapshot every tick (bandwidth is tiny at 8 Hz).
      const now = performance.now()
      if (now - lastSnap >= TICK_MS) {
        lastSnap = now
        peerSend({
          t: 's',
          X: next.snakes.X.body.map(c => [c.x, c.y]),
          O: next.snakes.O.body.map(c => [c.x, c.y]),
          xa: next.snakes.X.alive ? 1 : 0,
          oa: next.snakes.O.alive ? 1 : 0,
          f: next.food ? [next.food.x, next.food.y] : null,
          x: next.snakes.X.eaten,
          o: next.snakes.O.eaten,
          // Real current direction per side — the guest decode used to
          // default to 'left' when this was missing, and the 180°-reversal
          // guard then rejected legitimate 'right' turns from the guest.
          d: next.snakes.X.dir,
          e: next.snakes.O.dir,
        })
      }

      const w = getWinner(next)
      if (w && !finishedRef.current) {
        finishedRef.current = true
        clearTimeout(timer)
        finishRound(w)
      }
    }
    timer = setTimeout(loop, TICK_MS)
    return () => clearTimeout(timer)
  }, [gameId, isHost, isSpectator, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Guest: render from snapshots, send direction inputs ---
  useEffect(() => {
    if (isSpectator || isHost || game.status !== 'playing') return
    connectedAtRef.current = 0
    let raf

    // Render a blend of the last two snapshots, ~RENDER_DELAY_MS behind
    // realtime, so playback timing isn't at the mercy of irregular ~8Hz
    // packet arrival (which otherwise reads as jitter — a snapshot arriving
    // a little early or late used to pop straight onto the screen).
    const fromSnap = () => {
      const snap = snapRef.current
      if (!snap) return null
      const prev = prevSnapRef.current
      const now = performance.now()
      let t = 1
      if (prev) {
        const span = snapAtRef.current - prevSnapAtRef.current
        t = span > 0 ? (now - RENDER_DELAY_MS - prevSnapAtRef.current) / span : 1
        t = Math.min(Math.max(t, 0), 1)
      }

      const lerpBody = (prevBody, curBody) => {
        if (!prevBody || prevBody.length !== curBody.length) {
          return curBody.map(([x, y]) => ({ x, y }))
        }
        return curBody.map(([cx, cy], i) => {
          const [px, py] = prevBody[i]
          const dx = cx - px, dy = cy - py
          // Skip lerp across a wrap-around or grow jump (>1 cell) — snap
          // straight to the new cell instead of sliding across the board.
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return { x: cx, y: cy }
          return { x: px + dx * t, y: py + dy * t }
        })
      }

      const toSnake = (body, prevBody, alive, dir) => ({
        body: lerpBody(prevBody, body),
        alive: !!alive,
        dir: dir || 'left',
      })

      return {
        snakes: {
          X: toSnake(snap.X, prev?.X, snap.xa, snap.d),
          O: toSnake(snap.O, prev?.O, snap.oa, snap.e),
        },
        food: snap.f ? { x: snap.f[0], y: snap.f[1] } : null,
        eatenX: snap.x,
        eatenO: snap.o,
      }
    }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = performance.now()

      // Local "GET READY" countdown mirroring the host's own COUNTDOWN_MS
      // window. The snapshot carries no countdown info, so this is derived
      // purely from when we locally observed the connection go 'connected'.
      if (connRef.current !== 'connected') {
        connectedAtRef.current = 0
      } else if (!connectedAtRef.current) {
        connectedAtRef.current = now
      }
      const elapsed = connectedAtRef.current ? now - connectedAtRef.current : 0
      const countdown = connectedAtRef.current && elapsed < COUNTDOWN_MS
        ? Math.ceil((COUNTDOWN_MS - elapsed) / 1000) : 0

      const view = fromSnap()
      if (view) setRender({ ...view, countdown })

      // Send direction input (throttled — only when there's a new one).
      const dir = getDir(view?.snakes.O?.dir ?? 'left')
      if (dir) peerSend({ t: 'i', d: dir })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [gameId, isHost, isSpectator, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  // --- Finished screen (everyone) ---
  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <SnakeResult
          eatenX={game.snakeScoreX ?? render.eatenX}
          eatenO={game.snakeScoreO ?? render.eatenO}
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
            <span className="text-retro-p1">X {game.snakeScoreX ?? 0}</span>
            <span className="text-retro-p2">{game.snakeScoreO ?? 0} O</span>
          </div>
          <p className="font-pixel text-[8px] text-retro-dim/70 leading-relaxed">
            THIS ROUND&apos;S FOOD EATEN
          </p>
        </div>
      </div>
    )
  }

  // --- Playing --- (SWITCH GAME is hidden while live — M-76 — replaced by a
  // dedicated FORFEIT ROUND action below, which only concedes this round.)
  const overlayCountdown = render.countdown
  const overlay = showRealtimeOverlay(conn, overlayCountdown)
    ? <RealtimeOverlay conn={conn} countdown={overlayCountdown} retry={retry} gameId={gameId} mySymbol={mySymbol} opponentOnline={opponentOnline} />
    : null

  return (
    <div className="space-y-3 [@media(max-height:420px)]:space-y-1.5">
      <SnakeArena
        ref={arenaRef}
        snakes={render.snakes}
        food={render.food}
        eatenX={render.eatenX}
        eatenO={render.eatenO}
        mySide={mySymbol}
        namesX={game.players?.X?.name}
        namesO={game.players?.O?.name}
        dim={conn !== 'connected'}
        overlay={overlay}
      />
      <TouchCoachmark
        gameKey="snake"
        gesture="swipe"
        text="SWIPE OR HOLD + DRAG TO STEER"
        active={coachActive}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim [@media(max-height:420px)]:hidden">FIRST TO {WIN_SCORE} ROUND WINS</p>
      {!opponentOnline && <OfflineNotice label="OPPONENT" />}
      {!proposal && (
        // Kept well clear of the play controls; only turns danger-styled once
        // armed, so a stray tap near the controls can't read as a real forfeit.
        <div className="text-center pt-6">
          <button
            onClick={handleForfeit}
            disabled={forfeitBusy}
            className={cn(
              'min-h-11 px-4 font-pixel text-[9px] tracking-wide rounded border transition-colors disabled:opacity-50',
              forfeitArmed
                ? 'text-retro-danger border-retro-danger bg-retro-danger/10'
                : 'text-retro-dim border-transparent hover:text-retro-danger',
            )}
          >
            {forfeitBusy ? 'FORFEITING…' : forfeitArmed ? 'TAP AGAIN TO FORFEIT' : 'FORFEIT ROUND'}
          </button>
        </div>
      )}
    </div>
  )
}
