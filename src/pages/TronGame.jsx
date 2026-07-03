import { useRef, useState, useCallback } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import TronArena from '../components/TronArena'
import { useTronControls } from '../hooks/useTronControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import { createState, tick, getWinner, TICK_MS } from '../lib/tronLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

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
            <p className="font-pixel text-[8px] text-retro-dim">single round</p>
          </div>
        )
      })}
    </div>
  )
}

const initialRender = { cycles: null, countdown: 0 }

export default function TronGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const arenaRef = useRef(null)
  const { getDir } = useTronControls(arenaRef, !isSpectator && game.status === 'playing')

  const [render, setRender] = useState(initialRender)

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
    gameId, mySymbol, enabled: isHost && game.status === 'playing',
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

  const guestTick = useCallback((snap) => {
    const toCycle = (body, alive, dir) => ({
      body: body.map(([x, y]) => ({ x, y })),
      alive: !!alive,
      dir: dir || (body.length > 1 ? null : null),
    })
    const view = {
      cycles: {
        X: toCycle(snap.X, snap.xa, snap.dx),
        O: toCycle(snap.O, snap.oa, snap.dy),
      },
      countdown: 0,
    }
    const dir = getDir(view.cycles.O.dir ?? 'left')
    return { view, input: dir ? { t: 'i', d: dir } : null }
  }, [getDir])

  const guestConn = useRealtimeGuest({
    gameId, mySymbol, enabled: !isSpectator && !isHost && game.status === 'playing',
    tick: guestTick,
    setRender, initialRender,
    sfxMap: { die: () => sounds.miss() },
    INPUT_MS: 0,
  })

  const conn = isHost ? hostConn : guestConn

  const matchWinner = (game.scores?.X || 0) >= 1 ? 'X' : (game.scores?.O || 0) >= 1 ? 'O' : null

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
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim">SPECTATING</p>
          <p className="font-pixel text-[7px] text-retro-dim/70 leading-relaxed">
            LIVE GRID IS P2P · SPECTATORS SEE RESULT ONLY
          </p>
        </div>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  const overlay = <RealtimeOverlay conn={conn.status} countdown={render.countdown} retry={conn.retry} />

  return (
    <div className="space-y-3">
      <TronArena
        ref={arenaRef}
        cycles={render.cycles}
        mySide={mySymbol}
        namesX={game.players?.X?.name}
        namesO={game.players?.O?.name}
        dim={conn.status !== 'connected'}
        overlay={overlay}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">SINGLE ROUND · LAST CYCLE ALIVE WINS</p>
      {!opponentOnline && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">OPPONENT DISCONNECTED</p>
      )}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
