import { useCallback, useEffect, useRef, useState } from 'react'
import { ref as dbRef, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import BonkArena from '../components/BonkArena'
import BonkPad from '../components/BonkPad'
import { BonkBanner, BonkPickSheet, BonkScoreCard, BonkTideChip } from '../components/BonkHud'
import { KEYS_SOLO, useBonkPads } from '../hooks/useBonkPads'
import useBonkFx from '../hooks/useBonkFx'
import { useRealtimeHost } from '../lib/realtime/useRealtimeHost'
import { useRealtimeGuest } from '../lib/realtime/useRealtimeGuest'
import { RealtimeOverlay } from '../lib/realtime/realtimeStatus'
import { showRealtimeOverlay } from '../lib/realtime/connectionLogic'
import { createMatch, step, getWinner, SEATS, TARGET } from '../lib/bonkLogic'
import { arenaById } from '../lib/bonkArenas'
import { viewOf, staticView, encodeSnapshot, decodeSnapshot, decodeEvent, extrapolate } from '../lib/bonkNet'
import { hudOf, sameHud } from '../lib/bonkFx'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

// BONK BUGGIES room page. X hosts the one true sim and streams ~30 Hz
// snapshots over the WebRTC channel; O draws them and sends its two buttons
// (and, when it lost a round, its arena choice). The match — points, spare
// lids, who starts where, the loser's pick — lives inside the host's sim
// (lib/bonkLogic.js). Firebase keeps the room, the final points and the
// standard winner/scores.

const LEAD_COUNT_S = 0.5
// The guest's peer connection reaches 'connected' slightly before the host's
// own countdown gate. Keep in sync with useRealtimeHost's DEFAULT_COUNTDOWN.
const GUEST_COUNTDOWN_MS = 2000
const initialRender = { ...staticView(), countdown: 0 }

function BonkResult({ winner, mySymbol, players, scoreX = 0, scoreO = 0 }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SEATS.map((sym) => {
        const score = sym === 'X' ? scoreX : scoreO
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60') : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>{score}</p>
            <p className="font-pixel text-[8px] text-retro-dim">bonks</p>
          </div>
        )
      })}
    </div>
  )
}

export default function BonkBuggiesGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isHost = mySymbol === 'X'
  const isSpectator = !mySymbol
  const isPublic = game.visibility === 'public'
  const playing = !isSpectator && game.status === 'playing'
  const mySeat = mySymbol === 'O' ? 1 : 0

  const names = {
    X: mySymbol === 'X' ? 'YOU' : (game.players?.X?.name?.toUpperCase() ?? 'X'),
    O: mySymbol === 'O' ? 'YOU' : (game.players?.O?.name?.toUpperCase() ?? 'O'),
  }
  const namesRef = useRef(names)
  useEffect(() => { namesRef.current = names })

  const pads = useBonkPads({ ids: ['me'], keys: { me: KEYS_SOLO }, enabled: playing })
  const { fx, apply } = useBonkFx()

  // The latest view for the canvas (read every frame) and the HUD facts React renders.
  const viewRef = useRef(initialRender)
  const [hud, setHud] = useState(() => ({ ...hudOf(initialRender, names), countdown: 0 }))
  const hudRef = useRef(hud)
  const setRender = useCallback((view) => {
    viewRef.current = view
    const next = { ...hudOf(view, namesRef.current), countdown: view.countdown || 0 }
    if (!sameHud(next, hudRef.current)) { hudRef.current = next; setHud(next) }
  }, [])
  const getView = useCallback(() => viewRef.current, [])

  // The loser's arena choice rides the same input message as the buttons.
  const pickRef = useRef(null)
  useEffect(() => { if (hud.phase !== 'pick') pickRef.current = null }, [hud.phase])
  const onPick = useCallback((id) => { pickRef.current = id }, [])
  const myInput = useCallback(() => ({ ...pads.getInput('me'), pick: pickRef.current }), [pads])

  // ─── host ───
  const simRef = useRef(null)
  const pendingEvents = useRef([])
  const lastScoreWrite = useRef(0)

  const finishRound = useCallback(async (winner) => {
    try {
      await runTransaction(dbRef(db, `games/${gameId}`), (current) => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        scores[winner] = (scores[winner] || 0) + 1
        return {
          ...current, winner, status: 'finished', scores,
          bonkScoreX: simRef.current?.score[0] ?? current.bonkScoreX ?? 0,
          bonkScoreO: simRef.current?.score[1] ?? current.bonkScoreO ?? 0,
        }
      })
    } catch { /* the other client resolved it */ }
  }, [gameId])

  const onEvent = useCallback((event, sim) => {
    simRef.current = sim
    apply(event, { me: mySymbol })
    if (event.type !== 'count') pendingEvents.current.push(event)
    if (event.type === 'point') {
      const now = performance.now()
      if (now - lastScoreWrite.current >= 300) {
        lastScoreWrite.current = now
        update(dbRef(db, `games/${gameId}`), { bonkScoreX: sim.score[0], bonkScoreO: sim.score[1] }).catch(() => {})
      }
    }
  }, [apply, gameId, mySymbol])

  const createHostMatch = useCallback(() => createMatch({ seed: (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0, leadCount: LEAD_COUNT_S }), [])
  const buildSnapshot = useCallback((sim) => {
    simRef.current = sim
    const events = pendingEvents.current
    pendingEvents.current = []
    return encodeSnapshot(sim, events)
  }, [])

  const hostConn = useRealtimeHost({
    gameId, mySymbol, isPublic, enabled: isHost && playing,
    driver: 'rAF',
    equalizeHostInput: true,   // host input delayed ≈ RTT/2 so neither seat has a latency edge
    createState: createHostMatch,
    stepSim: step,
    readHostInput: myInput,
    consumeGuestInput: false,
    onEvent,
    snapshotMs: 33,
    buildView: viewOf,
    buildSnapshot,
    getWinner,
    finishRound,
    setRender, initialRender,
  })

  // ─── guest ───
  const lastSnapRef = useRef(null)
  const baseViewRef = useRef(null)
  const guestTick = useCallback((snap, age) => {
    if (snap !== lastSnapRef.current) {
      lastSnapRef.current = snap
      baseViewRef.current = decodeSnapshot(snap)
      for (const t of snap.ev || []) {
        const e = decodeEvent(t)
        if (e) apply(e, { me: mySymbol })
      }
    }
    const view = { ...extrapolate(baseViewRef.current, age), countdown: 0 }
    return { view, input: { t: 'i', d: myInput() } }
  }, [apply, mySymbol, myInput])

  const guestConn = useRealtimeGuest({
    gameId, mySymbol, isPublic, enabled: !isSpectator && !isHost && playing,
    tick: guestTick,
    setRender, initialRender,
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

  // ─── forfeit ───
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

  // One round decides the match here (first to TARGET points), as in Tron and Sumo.
  const matchWinner = game.winner ?? null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <BonkResult
          winner={game.winner} mySymbol={mySymbol} players={game.players}
          scoreX={game.bonkScoreX ?? hud.score[0]} scoreO={game.bonkScoreO ?? hud.score[1]}
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

  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride="LIVE ARENA IS PEER-TO-PEER" />
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center">
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {game.bonkScoreX ?? 0}</span>
            <span className="text-[8px] text-retro-dim self-center">FIRST TO {TARGET}</span>
            <span className="text-retro-p2">{game.bonkScoreO ?? 0} O</span>
          </div>
        </div>
      </div>
    )
  }

  const overlayCountdown = isHost ? hud.countdown : guestCountdown
  const overlay = showRealtimeOverlay(conn.status, overlayCountdown)
    ? <RealtimeOverlay conn={conn.status} countdown={overlayCountdown} retry={conn.retry} gameId={gameId} mySymbol={mySymbol} opponentOnline={opponentOnline} />
    : null
  const picker = hud.pick ? hud.pick.by === mySeat : false

  return (
    <div className="space-y-3 [@media(max-height:420px)]:space-y-1.5">
      <div className="flex items-stretch gap-2">
        <BonkScoreCard seat={0} name={names.X} score={hud.score[0]} lid={hud.lids[0]} testId="bonk-score-X" />
        <BonkScoreCard seat={1} name={names.O} score={hud.score[1]} lid={hud.lids[1]} testId="bonk-score-O" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-pixel text-[8px] text-retro-dim" data-testid="bonk-arena-name">
          ROUND {hud.round} · {arenaById(hud.arena).name}
        </span>
        <BonkTideChip tide={hud.tide} />
      </div>
      <BonkArena getView={getView} fx={fx} label="Two dune buggies on a rocky island: bonk the other helmet" dim={conn.status !== 'connected'}>
        <BonkBanner banner={hud.phase === 'count' && conn.status !== 'connected' ? null : hud.banner} />
        <BonkPickSheet
          pick={hud.pick}
          name={hud.pick ? names[SEATS[hud.pick.by]] : ''}
          mine={picker}
          onPick={onPick}
        />
        {overlay && (
          <div data-testid="bonk-overlay" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </BonkArena>
      <BonkPad
        id="me" tone={mySeat === 0 ? 'p1' : 'p2'} label="" hop={hud.hop[mySeat]}
        buttonProps={pads.buttonProps} isDown={pads.down}
        disabled={hud.phase === 'pick' || hud.phase === 'over'}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed [@media(max-height:420px)]:hidden">
        TOUCH THEIR HELMET · KEEP YOURS OFF THE GROUND · FIRST TO {TARGET}
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
            {forfeitBusy ? 'FORFEITING…' : forfeitArmed ? 'TAP AGAIN TO FORFEIT' : 'FORFEIT MATCH'}
          </button>
        </div>
      )}
    </div>
  )
}
