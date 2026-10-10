import { useCallback, useEffect, useRef, useState } from 'react'
import { ref as dbRef, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import PuckRushTable, { PuckRushHud } from '../components/PuckRushTable'
import { usePuckrushControls } from '../hooks/usePuckrushControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import { showRealtimeOverlay } from '../lib/realtime/connectionLogic'
import {
  createState, step, getWinner, countSides, COURT_W, COURT_H, PUCK_R, PUCKS_EACH,
} from '../lib/puckrushLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

const r4 = (n) => Math.round(n * 1e4) / 1e4
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

const NO_AIM = { X: null, O: null }
const viewOf = (sim, aims = NO_AIM) => ({
  pucks: sim.pucks.map((p) => ({ x: p.x, y: p.y })),
  held: { ...sim.held },
  left: countSides(sim),
  aims,
  countdown: 0,
})
const initialRender = viewOf(createState())

// The guest's peer connection reaches 'connected' slightly before the host's
// own countdown gate (see AirHockeyGame). Keep in sync with useRealtimeHost.
const GUEST_COUNTDOWN_MS = 2000
// How long a "puck went through" tint stays on the gap.
const FLASH_MS = 260

function PuckRushResult({ winner, mySymbol, players, left }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map((sym) => {
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {winner === sym ? 0 : left?.[sym] ?? '–'}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">{winner === sym ? 'half cleared' : 'pucks left'}</p>
          </div>
        )
      })}
    </div>
  )
}

export default function PuckRushGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const isPublic = game.visibility === 'public'
  const playing = !isSpectator && game.status === 'playing'
  const mySide = mySymbol || 'X'
  const tableRef = useRef(null)

  const [render, setRenderState] = useState(initialRender)
  const pucksRef = useRef(initialRender.pucks)
  const setRender = useCallback((view) => { pucksRef.current = view.pucks; setRenderState(view) }, [])
  const getPucks = useCallback(() => pucksRef.current, [])
  const { getInput, getAim } = usePuckrushControls(tableRef, {
    sides: [mySide], flip: mySide === 'O', getPucks, enabled: playing,
  })

  const [flash, setFlash] = useState(null)
  const flashTimerRef = useRef(null)
  const triggerFlash = useCallback((by) => {
    setFlash(by)
    clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlash(null), FLASH_MS)
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
  useEffect(() => () => clearTimeout(forfeitTimerRef.current), [])

  // The round result is the standard winner + scores patch. Puck counts are
  // not stored: both players already hold the final table.
  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(dbRef(db, `games/${gameId}`), (current) => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        scores[winner] = (scores[winner] || 0) + 1
        return { ...current, winner, status: 'finished', scores }
      })
    } catch { /* the other client resolved it */ }
  }, [gameId])

  const sfx = useCallback((type, by) => {
    if (type === 'fling') sounds.stackRelease()
    else if (type === 'hit') sounds.hit(3)
    else if (type === 'wall') sounds.move('O')
    else if (type === 'cross') { sounds.go(); triggerFlash(by) }
  }, [triggerFlash])

  const onEvent = useCallback((event) => sfx(event.type, event.by), [sfx])
  const readHostInput = useCallback(() => getInput('X'), [getInput])
  const buildView = useCallback((sim) => viewOf(sim, { X: getAim('X'), O: null }), [getAim])
  const buildSnapshot = useCallback((sim) => ({
    t: 's',
    p: sim.pucks.flatMap((p) => [r4(p.x), r4(p.y), r4(p.vx), r4(p.vy)]),
    h: [sim.held.X, sim.held.O],
    q: sim.seq.O,
  }), [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, isPublic, enabled: isHost && playing,
    driver: 'rAF',
    equalizeHostInput: true,
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

  const guestTick = useCallback((snap, age) => {
    const input = getInput('O')
    const aim = getAim('O')
    // Dead-reckon each puck from the snapshot's velocity, capped at 0.1 s.
    const a = Math.min(age, 0.1)
    const pucks = []
    for (let i = 0; i < snap.p.length; i += 4) {
      pucks.push({
        x: clamp(snap.p[i] + snap.p[i + 2] * a, PUCK_R, COURT_W - PUCK_R),
        y: clamp(snap.p[i + 1] + snap.p[i + 3] * a, PUCK_R, COURT_H - PUCK_R),
      })
    }
    // My own puck follows my finger with no round trip, and stays where I let
    // go until the host has applied that fling.
    for (const f of input.f) if (f.q > snap.q && pucks[f.i]) pucks[f.i] = { x: f.x, y: f.y }
    if (aim && pucks[aim.i]) pucks[aim.i] = { x: aim.to.x, y: aim.to.y }
    const held = { X: snap.h[0], O: aim ? aim.i : snap.h[1] }
    let x = 0
    for (const p of pucks) if (p.y > COURT_H / 2) x += 1
    const view = { pucks, held, left: { X: x, O: pucks.length - x }, aims: { X: null, O: aim }, countdown: 0 }
    return { view, input: { t: 'i', d: input } }
  }, [getInput, getAim])

  const guestConn = useRealtimeGuest({
    gameId, mySymbol, isPublic, enabled: !isSpectator && !isHost && playing,
    tick: guestTick,
    setRender, initialRender,
    sfxMap: {
      fling: () => sfx('fling'),
      hit: () => sfx('hit'),
      wall: () => sfx('wall'),
      cross: (by) => sfx('cross', by),
    },
    INPUT_MS: 33,
  })

  const conn = isHost ? hostConn : guestConn

  const [guestCountdown, setGuestCountdown] = useState(0)
  const guestStartAtRef = useRef(0)
  useEffect(() => {
    if (isHost || isSpectator || !playing || guestConn.status !== 'connected') {
      guestStartAtRef.current = 0
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way reset driven by the external peer/game-status transition, mirrors AirHockeyGame
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

  // First to 3 rounds, the default for real-time duels (Game.jsx derives the same).
  const matchTarget = 3
  const matchWinner = (game.scores?.X || 0) >= matchTarget ? 'X' : (game.scores?.O || 0) >= matchTarget ? 'O' : null
  const names = {
    X: mySymbol === 'X' ? 'YOU' : (game.players?.X?.name?.toUpperCase() ?? 'X'),
    O: mySymbol === 'O' ? 'YOU' : (game.players?.O?.name?.toUpperCase() ?? 'O'),
  }

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <PuckRushResult winner={game.winner} mySymbol={mySymbol} players={game.players} left={isSpectator ? null : render.left} />
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

  // Spectators: the live table is peer-to-peer between the two players.
  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride="LIVE TABLE IS PEER-TO-PEER" />
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center">
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {game.scores?.X ?? 0}</span>
            <span className="text-[8px] text-retro-dim self-center">ROUNDS</span>
            <span className="text-retro-p2">{game.scores?.O ?? 0} O</span>
          </div>
        </div>
      </div>
    )
  }

  const overlayCountdown = isHost ? render.countdown : guestCountdown
  const overlay = showRealtimeOverlay(conn.status, overlayCountdown)
    ? <RealtimeOverlay conn={conn.status} countdown={overlayCountdown} retry={conn.retry} gameId={gameId} mySymbol={mySymbol} opponentOnline={opponentOnline} />
    : null

  return (
    <div className="space-y-3 [@media(max-height:420px)]:space-y-1.5">
      <PuckRushHud left={render.left} names={names} mySide={mySide} />
      <PuckRushTable
        tableRef={tableRef}
        pucks={render.pucks}
        held={render.held}
        aims={render.aims}
        mySide={mySide}
        flash={flash}
        dim={conn.status !== 'connected'}
        overlay={overlay}
        labels={{ [mySide]: 'YOUR HALF', [mySide === 'X' ? 'O' : 'X']: `${names[mySide === 'X' ? 'O' : 'X']}'S HALF` }}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed [@media(max-height:420px)]:hidden">
        PULL A PUCK BACK, LET GO · EMPTY YOUR HALF OF ALL {PUCKS_EACH * 2} · FIRST TO {matchTarget} ROUNDS
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
