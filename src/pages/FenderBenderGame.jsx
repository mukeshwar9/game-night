import { useCallback, useEffect, useRef, useState } from 'react'
import { ref as dbRef, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { FenderArena, FenderPad } from '../components/FenderBoard'
import { SEAT_STYLES, heartsText } from '../components/fenderSeats'
import { useFenderControls } from '../hooks/useFenderControls'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import { showRealtimeOverlay } from '../lib/realtime/connectionLogic'
import {
  createState, step, getWinner, encodeSnapshot, decodeSnapshot, advanceView, HORN_COOLDOWN,
} from '../lib/fenderLogic'
import { playFenderEvent } from '../lib/fenderSound'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

// Online FENDER BENDER duel. X hosts the one true sim and streams ~30 Hz
// snapshots; O draws them and sends its stick. Firebase holds only the room
// (presence, signaling, the standard winner and round scores): no new keys.

const SEATS = ['X', 'O']
// The guest's peer connection reaches 'connected' slightly before the host's
// own countdown gate (see PuckRushGame). Keep in sync with useRealtimeHost.
const GUEST_COUNTDOWN_MS = 2000
// Hold the result back so both screens see the wreck or the splash.
const END_HOLD_MS = 900
const matchTarget = 3

const initialRender = { sim: createState({ players: 2, seed: 1 }), countdown: 0 }

function FenderResult({ winner, mySymbol, players, cars }) {
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="fender-result">
      {SEATS.map((sym, i) => {
        const car = cars?.[i]
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', mySymbol === sym ? SEAT_STYLES[i].border : 'border-retro-border')}>
            <p className={cn('font-pixel text-[8px]', SEAT_STYLES[i].text)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {winner === sym ? 'LAST CAR' : car && car.why === 'fell' ? 'SWIM' : car && !car.alive ? 'WRECKED' : '–'}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">{car ? heartsText(car.hp) : ''}</p>
          </div>
        )
      })}
    </div>
  )
}

export default function FenderBenderGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const isPublic = game.visibility === 'public'
  const playing = !isSpectator && game.status === 'playing'
  const mySeat = mySymbol === 'O' ? 1 : 0

  const ctl = useFenderControls({ count: 1, keymap: { [mySeat]: 'both' }, enabled: playing })
  const rendererRef = useRef(null)
  const viewRef = useRef(initialRender.sim)
  const [countdown, setCountdown] = useState(0)
  const [hud, setHud] = useState(null)
  const hudKey = useRef('')

  // The arena draws from the ref; React only re-renders when the HUD changes.
  const setRender = useCallback((view) => {
    viewRef.current = view.sim
    const s = view.sim
    const key = `${view.countdown}|${s.cars.map((c) => `${c.alive ? 1 : 0}${c.hp}${Math.ceil(c.cd)}`).join('|')}`
    if (key !== hudKey.current) {
      hudKey.current = key
      setCountdown(view.countdown)
      setHud(s.cars.map((c) => ({ alive: c.alive, hp: c.hp, cd: c.cd, why: c.why, hornOn: true, ghost: false })))
    }
  }, [])

  const [forfeitArmed, setForfeitArmed] = useState(false)
  const forfeitTimerRef = useRef(null)
  const [forfeitBusy, runForfeit] = useBusy()

  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(dbRef(db, `games/${gameId}`), (current) => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
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
    runForfeit(() => finishRound(mySymbol === 'X' ? 'O' : 'X'), () => toast.error('FORFEIT FAILED — CHECK CONNECTION'))
  }
  useEffect(() => () => clearTimeout(forfeitTimerRef.current), [])

  const showEvent = useCallback((e) => {
    rendererRef.current?.event(e, viewRef.current)
    playFenderEvent(e)
  }, [])

  // The relay speaks { type, by }; the sim speaks { k, i }.
  const stepSim = useCallback((sim, inputs, dt) => {
    const res = step(sim, [inputs.X, inputs.O], dt)
    return { state: res.state, events: res.events.map((e) => ({ type: e.k, by: e.i, p: e.p })) }
  }, [])
  const onEvent = useCallback((event, sim) => {
    showEvent({ k: event.type, i: event.by, p: event.p }, sim)
  }, [showEvent])
  const readHostInput = useCallback(() => ctl.getInput(mySeat), [ctl, mySeat])
  const buildView = useCallback((sim) => ({ sim, countdown: 0 }), [])
  const buildSnapshot = useCallback((sim) => encodeSnapshot(sim), [])
  const createSim = useCallback(() => createState({ players: 2, seed: (Math.random() * 1e9) | 0 }), [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, isPublic, enabled: isHost && playing,
    driver: 'rAF',
    equalizeHostInput: true,   // host input delayed ≈ RTT/2 so neither seat has a latency edge
    createState: createSim,
    stepSim,
    readHostInput,
    consumeGuestInput: false,
    onEvent,
    snapshotMs: 33,
    buildView,
    buildSnapshot,
    getWinner,
    finishRound: (winner) => new Promise((resolve) => { setTimeout(() => resolve(finishRound(winner)), END_HOLD_MS) }),
    setRender, initialRender,
  })

  const lastSnapRef = useRef(null)
  const decodedRef = useRef(null)
  const guestTick = useCallback((snap, age) => {
    if (snap !== lastSnapRef.current) { lastSnapRef.current = snap; decodedRef.current = decodeSnapshot(snap, 2) }
    const sim = advanceView(decodedRef.current, age)
    return { view: { sim, countdown: 0 }, input: { t: 'i', d: ctl.getInput(mySeat) } }
  }, [ctl, mySeat])

  const relayed = useCallback((k) => (by) => showEvent({ k, i: by ?? 0 }), [showEvent])
  const guestConn = useRealtimeGuest({
    gameId, mySymbol, isPublic, enabled: !isSpectator && !isHost && playing,
    tick: guestTick,
    setRender, initialRender,
    sfxMap: {
      bump: relayed('bump'), hit: relayed('hit'), crash: relayed('crash'),
      wreck: relayed('wreck'), fell: relayed('fell'), horn: relayed('horn'),
    },
    INPUT_MS: 33,
  })

  const conn = isHost ? hostConn : guestConn

  const [guestCountdown, setGuestCountdown] = useState(0)
  const guestStartAtRef = useRef(0)
  useEffect(() => {
    if (isHost || isSpectator || !playing || guestConn.status !== 'connected') {
      guestStartAtRef.current = 0
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way reset driven by the external peer/game-status transition, mirrors PuckRushGame
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

  const getView = useCallback(() => viewRef.current, [])
  const getUi = useCallback(() => ({ running: true, mySeat }), [mySeat])

  const matchWinner = (game.scores?.X || 0) >= matchTarget ? 'X' : (game.scores?.O || 0) >= matchTarget ? 'O' : null
  const names = {
    X: mySymbol === 'X' ? 'YOU' : (game.players?.X?.name?.toUpperCase() ?? 'X'),
    O: mySymbol === 'O' ? 'YOU' : (game.players?.O?.name?.toUpperCase() ?? 'O'),
  }

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <FenderResult winner={game.winner} mySymbol={mySymbol} players={game.players} cars={isSpectator ? null : hud} />
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

  // Spectators: the live road is peer-to-peer between the two players.
  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride="LIVE ROAD IS PEER-TO-PEER" />
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
    <div className="mx-auto space-y-2 [@media(max-height:420px)]:space-y-1" style={{ maxWidth: 'min(100%, calc((100dvh - 330px) * 0.818))', minWidth: 'min(100%, 300px)' }}>
      <div className="flex items-start justify-between gap-2 font-pixel">
        {SEATS.map((sym, i) => (
          <div
            key={sym}
            data-testid={`fender-hearts-${sym}`}
            className={cn('min-w-0 space-y-0.5', i === 1 && 'text-right', SEAT_STYLES[i].text, hud && !hud[i].alive && 'opacity-45')}
          >
            <p className="text-[8px] truncate">{names[sym]} · {game.scores?.[sym] ?? 0} OF {matchTarget}</p>
            <p className="text-[10px] tabular-nums">{hud ? (hud[i].alive ? heartsText(hud[i].hp) : 'OUT') : heartsText(3)}</p>
          </div>
        ))}
      </div>
      <FenderArena
        getView={getView}
        getUi={getUi}
        rendererRef={rendererRef}
        className={conn.status !== 'connected' ? 'opacity-70' : undefined}
        overlay={overlay && (
          <div data-testid="fender-overlay" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      />
      <FenderPad
        seat={mySeat} name={names[mySymbol]} bind={ctl.bind} getKnob={ctl.getKnob}
        info={hud ? { ...hud[mySeat], pts: undefined } : undefined}
        enabled={playing && conn.status === 'connected'}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed [@media(max-height:420px)]:hidden">
        DRAG TO STEER · TAP TO HONK ({HORN_COOLDOWN}S) · SHOVE THEM OFF THE ROAD · FIRST TO {matchTarget} ROUNDS
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
