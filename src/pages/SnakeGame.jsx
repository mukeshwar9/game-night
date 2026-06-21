import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SnakeArena from '../components/SnakeArena'
import { useSnakeControls } from '../hooks/useSnakeControls'
import { useRealtimePeer } from '../lib/realtime/useRealtimePeer'
import { createState, tick, getWinner, WIN_SCORE, TICK_MS } from '../lib/snakeLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const COUNTDOWN_MS = 2000

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
  const arenaRef = useRef(null)
  const { getDir } = useSnakeControls(arenaRef, !isSpectator && game.status === 'playing')

  // Render state: the latest snake positions + food, for drawing the arena.
  const [render, setRender] = useState({
    snakes: null, food: null, eatenX: 0, eatenO: 0, countdown: 0,
  })

  const guestInputRef = useRef(null)      // host: latest direction from the guest (O)
  const snapRef = useRef(null)            // guest: latest snapshot from the host
  const snapAtRef = useRef(0)             // guest: perf time the snapshot arrived
  const simRef = useRef(null)             // host: authoritative simulation state
  const finishedRef = useRef(false)
  const hostDirRef = useRef(null)         // host: latest local direction (X)

  const onMessage = useCallback((msg) => {
    if (msg.t === 's') {
      // Snapshot: { t:'s', X:[[x,y],...], O:[[x,y],...], f:[x,y]|null, x:eatenX, o:eatenO, d:dirX, e:dirO }
      snapRef.current = msg
      snapAtRef.current = performance.now()
    } else if (msg.t === 'i') {
      guestInputRef.current = msg.d
    } else if (msg.t === 'e') {
      playSfx(msg.k)
    }
  }, [])

  const { status: conn, statusRef: connRef, retryKey, retry, send } = useRealtimePeer({
    gameId,
    mySymbol,
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
  }, [isSpectator, game.status, retryKey])

  // --- Host: authoritative simulation loop ---
  useEffect(() => {
    if (isSpectator || !isHost || game.status !== 'playing') return
    simRef.current = createState()
    finishedRef.current = false
    hostDirRef.current = null
    guestInputRef.current = null
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
      if (connRef.current !== 'connected') {
        startAt = Date.now() + COUNTDOWN_MS
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
        O: guestInputRef.current,
      }
      guestInputRef.current = null  // consume guest input
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
  }, [gameId, isHost, isSpectator, game.status, retryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Guest: render from snapshots, send direction inputs ---
  useEffect(() => {
    if (isSpectator || isHost || game.status !== 'playing') return
    let raf

    const fromSnap = () => {
      const snap = snapRef.current
      if (!snap) return null
      const toSnake = (body, alive) => ({
        body: body.map(([x, y]) => ({ x, y })),
        alive: !!alive,
      })
      return {
        snakes: {
          X: toSnake(snap.X, snap.xa),
          O: toSnake(snap.O, snap.oa),
        },
        food: snap.f ? { x: snap.f[0], y: snap.f[1] } : null,
        eatenX: snap.x,
        eatenO: snap.o,
      }
    }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const view = fromSnap()
      if (view) setRender({ ...view, countdown: 0 })

      // Send direction input (throttled — only when there's a new one).
      const dir = getDir(view?.snakes.O?.dir ?? 'left')
      if (dir) peerSend({ t: 'i', d: dir })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [gameId, isHost, isSpectator, game.status, retryKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim">SPECTATING</p>
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {game.snakeScoreX ?? 0}</span>
            <span className="text-retro-p2">{game.snakeScoreO ?? 0} O</span>
          </div>
          <p className="font-pixel text-[7px] text-retro-dim/70 leading-relaxed">
            LIVE GRID IS PEER-TO-PEER · SCORE ONLY FOR SPECTATORS
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
    overlay = <p className="font-pixel text-[10px] text-retro-dim animate-pulse">CONNECTING…</p>
  } else if (render.countdown > 0) {
    overlay = <p className="font-pixel text-5xl text-retro-win text-glow-win">{render.countdown}</p>
  }

  return (
    <div className="space-y-3">
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
      <p className="text-center font-pixel text-[8px] text-retro-dim">FIRST TO {WIN_SCORE} ROUND WINS</p>
      {!opponentOnline && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">OPPONENT DISCONNECTED</p>
      )}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
