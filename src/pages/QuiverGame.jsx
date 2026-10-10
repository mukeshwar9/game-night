import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref as dbRef, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import QuiverTable, { QuiverScores } from '../components/QuiverTable'
import { useQuiverControls } from '../hooks/useQuiverControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import { showRealtimeOverlay } from '../lib/realtime/connectionLogic'
import {
  WHEELS, WHEEL_SECONDS, createState, step, encodeSnapshot, decodeSnapshot, deadReckon, winnerSymbol,
} from '../lib/quiverLogic'
import { playQuiverEvent } from '../lib/quiverSounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'

// QUIVER online duel: X hosts the wheel and the sim, O is a render-only guest on
// the same peer-to-peer transport as Pong, Puck Rush and Sticky Fingers. Each
// client draws its own button nearest, so the guest sees the table turned
// around. A tap is sent as { press: n }; the host decides what it hit. The guest
// shows its own arrow at once and the host's snapshot replaces it a moment
// later. The room itself only holds the standard winner/scores.

const DUEL = { players: 2, countIn: 0, banner: true, bots: [null, null] }
const makeSim = () => createState({ ...DUEL, seed: (Math.random() * 4294967296) >>> 0 })
const BASE = createState(DUEL)
const initialRender = { ...BASE, countdown: 0 }

// The guest's peer connection reaches 'connected' slightly before the host's
// own countdown gate (see AirHockeyGame). Keep in sync with useRealtimeHost.
const GUEST_COUNTDOWN_MS = 2000
const EVENT_TYPES = ['throw', 'stick', 'star', 'gold', 'shave', 'clink', 'bomb', 'flip', 'wheel', 'sudden', 'tick', 'end']

export default function QuiverGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const isPublic = game.visibility === 'public'
  const playing = !isSpectator && game.status === 'playing'
  const mySeat = isHost ? 0 : 1
  const tableRef = useRef(null)

  const sceneRef = useRef(initialRender)
  const [countdown, setCountdown] = useState(0)
  const [scores, setScores] = useState([0, 0])
  const countdownRef = useRef(0)
  const setRender = useCallback((view) => {
    sceneRef.current = view
    const c = view.countdown || 0
    if (c !== countdownRef.current) { countdownRef.current = c; setCountdown(c) }
  }, [])
  const getScene = useCallback(() => sceneRef.current, [])
  const mySeats = useMemo(() => [mySeat], [mySeat])
  const controls = useQuiverControls()
  const connectedRef = useRef(false)

  const [forfeitArmed, setForfeitArmed] = useState(false)
  const forfeitTimerRef = useRef(null)
  const [forfeitBusy, runForfeit] = useBusy()

  // The round result is the standard winner + scores patch (a draw scores
  // nobody). Quiver counts are not stored: both players already hold the table.
  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(dbRef(db, `games/${gameId}`), (current) => {
        if (!current || current.status === 'finished') return
        const next = { ...(current.scores || {}) }
        if (winner !== 'draw') next[winner] = (next[winner] || 0) + 1
        return { ...current, winner, status: 'finished', scores: next }
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
    runForfeit(() => finishRound(isHost ? 'O' : 'X'), () => toast.error('FORFEIT FAILED — CHECK CONNECTION'))
  }
  useEffect(() => () => clearTimeout(forfeitTimerRef.current), [])

  const mine = useCallback((by) => by === mySeat, [mySeat])
  const onEvent = useCallback((event) => playQuiverEvent(event, mine), [mine])
  const readHostInput = useCallback(() => ({ press: controls.take(0) }), [controls])
  const stepSim = useCallback((sim, inputs, dt) => step(sim, [
    { fire: (inputs.X?.press ?? 0) > 0 },
    { fire: (inputs.O?.press ?? 0) > 0 },
  ], dt), [])
  const buildView = useCallback((sim) => ({ ...sim, countdown: 0 }), [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, isPublic, enabled: isHost && playing,
    driver: 'rAF',
    equalizeHostInput: true,
    consumeGuestInput: true,
    createState: makeSim,
    stepSim,
    readHostInput,
    onEvent,
    snapshotMs: 33,
    buildView,
    buildSnapshot: encodeSnapshot,
    getWinner: winnerSymbol,
    finishRound,
    setRender, initialRender,
  })

  const guestTick = useCallback((snap, age) => {
    const scene = deadReckon(decodeSnapshot(snap, BASE), age)
    const n = controls.take(1)
    return { view: { ...scene, countdown: 0 }, input: n > 0 ? { t: 'i', d: { press: n } } : null }
  }, [controls])

  const sfxMap = useMemo(
    () => Object.fromEntries(EVENT_TYPES.map((type) => [type, (by) => playQuiverEvent({ type, by }, mine)])),
    [mine],
  )
  const guestConn = useRealtimeGuest({
    gameId, mySymbol, isPublic, enabled: !isSpectator && !isHost && playing,
    tick: guestTick,
    setRender, initialRender,
    sfxMap,
    INPUT_MS: 0,
  })

  const conn = isHost ? hostConn : guestConn
  const connected = conn.status === 'connected'
  useEffect(() => {
    connectedRef.current = connected
    // Taps made while the link was down must not fire the moment it returns.
    controls.reset()
  }, [connected, controls])
  const onPress = useCallback((seat) => { if (connectedRef.current) controls.press(seat) }, [controls])

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

  // First to 3 rounds, the default for real-time duels (matchRules derives the same).
  const matchTarget = 3
  const matchWinner = (game.scores?.X || 0) >= matchTarget ? 'X' : (game.scores?.O || 0) >= matchTarget ? 'O' : null
  const nameOf = (sym) => (mySymbol === sym ? 'YOU' : (game.players?.[sym]?.name?.toUpperCase() ?? sym))
  const names = [nameOf('X'), nameOf('O')]

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <QuiverScores scores={scores} names={names} mine={isSpectator ? -1 : mySeat} />
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

  const overlayCountdown = isHost ? countdown : guestCountdown
  const overlay = showRealtimeOverlay(conn.status, overlayCountdown)
    ? <RealtimeOverlay conn={conn.status} countdown={overlayCountdown} retry={conn.retry} gameId={gameId} mySymbol={mySymbol} opponentOnline={opponentOnline} />
    : null

  const footer = (
    <>
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
    </>
  )

  return (
    <div className="space-y-3 [@media(max-height:420px)]:space-y-1.5">
      <QuiverTable
        tableRef={tableRef}
        getScene={getScene}
        roundKey={`${gameId}:${game.scores?.X ?? 0}-${game.scores?.O ?? 0}`}
        rotated={!isHost}
        names={names}
        mySeats={mySeats}
        onPress={onPress}
        enabled={playing}
        predict={!isHost}
        onScores={setScores}
        dim={!connected}
        overlay={overlay}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed [@media(max-height:420px)]:hidden">
        TAP TO SHOOT · LEAD THE WHEEL · A CLINK COSTS 1 · {WHEELS} WHEELS OF {WHEEL_SECONDS}S · FIRST TO {matchTarget} ROUNDS
      </p>
      {footer}
    </div>
  )
}
