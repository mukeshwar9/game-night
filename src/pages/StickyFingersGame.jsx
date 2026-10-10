import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref as dbRef, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import StickyTable, { StickyScores } from '../components/StickyTable'
import { useStickyControls } from '../hooks/useStickyControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import { showRealtimeOverlay } from '../lib/realtime/connectionLogic'
import {
  ROUND_SECONDS, createState, step, encodeSnapshot, decodeSnapshot, deadReckon, winnerSymbol,
} from '../lib/stickyLogic'
import { playStickyEvent } from '../lib/stickySounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'

// STICKY FINGERS online duel: X hosts the table and the sim, O is a render-only
// guest on the same peer-to-peer transport as Pong and Puck Rush. Each client
// draws its own safe nearest, so the guest sees the table turned around. Your
// own hands are drawn where your fingers are at once; the host's snapshots
// carry everything else. The room itself only holds the standard winner/scores.

const DUEL = { players: 2, countIn: 0, bots: [null, null] }
const makeSim = () => createState({ ...DUEL, seed: (Math.random() * 4294967296) >>> 0 })
const BASE = createState(DUEL)
const initialRender = { ...BASE, countdown: 0 }

// The guest's peer connection reaches 'connected' slightly before the host's
// own countdown gate (see AirHockeyGame). Keep in sync with useRealtimeHost.
const GUEST_COUNTDOWN_MS = 2000
const EVENT_TYPES = ['grab', 'cash', 'bigcash', 'tug', 'won', 'snap', 'dye', 'tick', 'lastcall']

export default function StickyFingersGame({
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
  const players = useMemo(() => [mySeat], [mySeat])
  const controls = useStickyControls(tableRef, { players, getScene, flip: !isHost, enabled: playing })

  const [forfeitArmed, setForfeitArmed] = useState(false)
  const forfeitTimerRef = useRef(null)
  const [forfeitBusy, runForfeit] = useBusy()

  // The round result is the standard winner + scores patch. Loot totals are
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
  const onEvent = useCallback((event) => playStickyEvent(event, mine), [mine])
  const readHostInput = useCallback(() => controls.getInput(0, 2), [controls])
  const stepSim = useCallback((sim, inputs, dt) => step(sim, [inputs.X, inputs.O], dt), [])
  const buildView = useCallback((sim) => ({ ...sim, countdown: 0 }), [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, isPublic, enabled: isHost && playing,
    driver: 'rAF',
    equalizeHostInput: true,
    createState: makeSim,
    stepSim,
    readHostInput,
    consumeGuestInput: false,
    onEvent,
    snapshotMs: 33,
    buildView,
    buildSnapshot: encodeSnapshot,
    getWinner: winnerSymbol,
    finishRound,
    setRender, initialRender,
  })

  const guestTick = useCallback((snap, age) => {
    const scene = deadReckon(decodeSnapshot(snap, BASE), age, controls.getMine())
    return { view: { ...scene, countdown: 0 }, input: { t: 'i', d: controls.getInput(1, 2) } }
  }, [controls])

  const sfxMap = useMemo(() => Object.fromEntries(EVENT_TYPES.map((type) => [type, (by) => playStickyEvent({ type, by }, mine)])), [mine])
  const guestConn = useRealtimeGuest({
    gameId, mySymbol, isPublic, enabled: !isSpectator && !isHost && playing,
    tick: guestTick,
    setRender, initialRender,
    sfxMap,
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

  // First to 3 rounds, the default for real-time duels (matchRules derives the same).
  const matchTarget = 3
  const matchWinner = (game.scores?.X || 0) >= matchTarget ? 'X' : (game.scores?.O || 0) >= matchTarget ? 'O' : null
  const nameOf = (sym) => (mySymbol === sym ? 'YOU' : (game.players?.[sym]?.name?.toUpperCase() ?? sym))
  const names = [nameOf('X'), nameOf('O')]

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <StickyScores scores={scores} names={names} mine={isSpectator ? -1 : mySeat} />
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

  return (
    <div className="space-y-3 [@media(max-height:420px)]:space-y-1.5">
      <StickyTable
        tableRef={tableRef}
        getScene={getScene}
        roundKey={`${gameId}:${game.scores?.X ?? 0}-${game.scores?.O ?? 0}`}
        rotated={!isHost}
        names={names}
        onScores={setScores}
        dim={conn.status !== 'connected'}
        overlay={overlay}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed [@media(max-height:420px)]:hidden">
        DRAG LOOT TO YOUR SAFE · SAME ITEM, SAME MOMENT: LAST HAND HOLDING KEEPS IT · {ROUND_SECONDS}S · FIRST TO {matchTarget} ROUNDS
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
