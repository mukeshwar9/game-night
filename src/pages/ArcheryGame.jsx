import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import useBusy from '../hooks/useBusy'
import useBowDraw from '../hooks/useBowDraw'
import useGameKeys from '../hooks/useGameKeys'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import ArcheryRange from '../components/ArcheryRange'
import ArcheryScorecard from '../components/ArcheryScorecard'
import GameStatus from '../components/GameStatus'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import {
  ARCHERY_FORMATS, ARCHERY_SEATS, ARROWS_PER_END, advanceArcheryShot,
  advanceArcheryTimeout, archeryFormat, archerySeats, arrowTurn, normalizeShots,
  scorecard, shotResult, windForShot, withSteadyAim,
} from '../lib/archeryLogic'
import { isRoomCoordinator } from '../lib/coordinator'
import { cn } from '@/lib/utils'

const SHOT_CLOCK_MS = 30_000
const STEADY_KEY = 'archery-steady-aim'
const SEAT_TONE = { X: 'text-retro-p1', O: 'text-retro-p2', A: 'text-retro-p3', B: 'text-retro-p4' }

function orderedPlayers(players) {
  return Object.values(players || {})
    .filter(player => player?.playerId)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

function readSteady() {
  try { return localStorage.getItem(STEADY_KEY) !== 'off' } catch { return true }
}

export default function ArcheryGame(props) {
  const { gameId, game, mySymbol: twoPlayerSymbol, mySeat, players, isHost, onStart, onSwitchGame, onPlayAgain, onNewMatch } = props
  const party = game.gameType === 'archery4'
  const roomRef = useMemo(() => ref(db, `games/${gameId}`), [gameId])
  const [busy, run] = useBusy()
  const [steady, setSteady] = useState(readSteady)
  const { now } = useServerClock(1000)
  const roster = useMemo(() => orderedPlayers(players || game.players), [game.players, players])
  const derivedSeatUids = useMemo(() => {
    const map = {}
    roster.slice(0, 4).forEach((player, i) => { map[ARCHERY_SEATS[i]] = player.playerId })
    return map
  }, [roster])
  const seatUids = game.archerySeatUids || derivedSeatUids
  const seats = useMemo(() => party ? archerySeats(seatUids) : ['X', 'O'], [party, seatUids])
  const me = party
    ? ARCHERY_SEATS.find(seat => seatUids[seat] === mySeat) ?? null
    : twoPlayerSymbol
  const shots = normalizeShots(game.archeryShots)
  const tieShots = normalizeShots(game.archeryShootOffShots)
  const mainShots = shots.filter(Boolean)
  const format = archeryFormat(game.archeryFormat)
  const phase = game.archeryPhase || 'main'
  const mainTurn = arrowTurn(shots.length, seats, format)
  const tieSeats = Array.isArray(game.archeryTied) ? game.archeryTied : []
  const turn = phase === 'shootOff'
    ? { seat: game.currentTurn, end: ARCHERY_FORMATS[format].ends, arrowInEnd: 0 }
    : mainTurn
  const currentDistance = phase === 'shootOff' ? 70 : (ARCHERY_FORMATS[format].distances[turn.end] ?? 70)
  const liveShotIndex = phase === 'shootOff' ? shots.length + tieShots.length : shots.length
  const status = game.status ?? 'waiting'
  const myTurn = status === 'playing' && !!me && game.currentTurn === me && !busy
  const isCoordinator = party ? (isHost ?? isRoomCoordinator(mySeat, players, game.hostUid)) : me === 'X'
  const names = useMemo(() => {
    if (party) return Object.fromEntries(ARCHERY_SEATS.map(seat => [seat, players?.[seatUids[seat]]?.name || 'PLAYER']))
    return Object.fromEntries(['X', 'O'].map(seat => [seat, game.players?.[seat]?.name || `PLAYER ${seat}`]))
  }, [game.players, party, players, seatUids])
  const card = useMemo(() => scorecard(shots, seats, game.archerySeed, format), [format, game.archerySeed, seats, shots])
  const fireRef = useRef(null)
  const turnOwnerUid = party ? seatUids[game.currentTurn] : game.players?.[game.currentTurn]?.playerId
  const turnOnline = party
    ? players?.[turnOwnerUid]?.online !== false
    : game.presence?.[game.currentTurn]?.online !== false
  const turnOfflineAt = party
    ? players?.[turnOwnerUid]?.offlineAt
    : game.presence?.[game.currentTurn]?.leftAt
  const startedAt = typeof game.archeryTurnStartedAt === 'number' ? game.archeryTurnStartedAt : Number.NaN
  const clockStart = Number.isFinite(startedAt)
    ? turnOnline ? startedAt : Math.max(startedAt, Number(turnOfflineAt) || startedAt)
    : now
  const allowedMs = SHOT_CLOCK_MS
  const secondsLeft = Math.max(0, Math.ceil((allowedMs - (now - clockStart)) / 1000))

  const shoot = useCallback((input) => {
    if (!myTurn || !me || !gameId) return
    return run(async () => {
      const shotIndex = phase === 'shootOff' ? mainShots.length + tieShots.length : shots.length
      const result = shotResult({ ...input, shotIndex }, shotIndex, game.archerySeed, currentDistance)
      const commit = await runTransaction(roomRef, current => {
        if (!current || current.status !== 'playing' || current.currentTurn !== me) return
        const delta = advanceArcheryShot(current, { ...input, by: me }, seats)
        if (!delta) return
        const next = { ...current, ...delta, archeryTurnStartedAt: getServerNow(), lastActivityAt: getServerNow() }
        if (delta.status === 'finished' && !party) {
          next.scores = { ...current.scores, [delta.winner]: (current.scores?.[delta.winner] || 0) + 1 }
        }
        return next
      })
      if (!commit.committed) { toast.error('ARROW NOT SAVED — RETRY'); return }
      sounds.archeryLoose()
      sounds.archeryHit(result.score)
    }, () => toast.error('ARROW FAILED — CHECK CONNECTION'))
  }, [currentDistance, game.archerySeed, gameId, mainShots.length, me, myTurn, party, phase, roomRef, run, seats, shots.length, tieShots.length])
  const drawHook = useBowDraw((input) => { void fireRef.current?.(input) }, { enabled: myTurn, steady, mirror: me === 'O' })
  useEffect(() => { fireRef.current = shoot }, [shoot])
  const manualAim = useCallback(() => withSteadyAim({
    ax: me === 'O' ? -drawHook.draw.ax : drawHook.draw.ax,
    ay: 0, dr: drawHook.draw.dr, drawMs: drawHook.draw.drawMs,
  }, steady, (liveShotIndex % 16) * Math.PI / 8), [drawHook.draw.ax, drawHook.draw.drawMs, drawHook.draw.dr, liveShotIndex, me, steady])
  useGameKeys((event) => {
    if ((event.code === 'Space' || event.key === 'Enter') && myTurn) {
      fireRef.current?.(manualAim())
      return true
    }
    return false
  }, { enabled: myTurn })

  // Establish a server-clock turn stamp on older/newly-started rooms.
  useEffect(() => {
    if (status !== 'playing' || Number.isFinite(startedAt)) return
    runTransaction(roomRef, current => {
      if (!current || current.status !== 'playing' || Number.isFinite(Number(current.archeryTurnStartedAt))) return
      return { ...current, archeryTurnStartedAt: getServerNow() }
    }).catch(() => {})
  }, [roomRef, startedAt, status])

  // Thirty seconds to shoot. Any seated client can skip the timed-out
  // archer’s remaining end as misses; the transaction rechecks the turn.
  useEffect(() => {
    if (status !== 'playing' || !Number.isFinite(startedAt) || now - clockStart < allowedMs) return
    runTransaction(roomRef, current => {
      if (!current || current.status !== 'playing' || current.currentTurn !== game.currentTurn) return
      const liveStart = Number(current.archeryTurnStartedAt)
      if (!Number.isFinite(liveStart) || getServerNow() - liveStart < SHOT_CLOCK_MS) return
      const next = advanceArcheryTimeout(current, seats)
      if (!next) return
      const endedAt = getServerNow()
      const result = { ...next, archeryTurnStartedAt: endedAt, lastActivityAt: endedAt }
      if (next.status === 'finished' && !party && next.winner) {
        result.scores = { ...current.scores, [next.winner]: (current.scores?.[next.winner] || 0) + 1 }
      }
      return result
    }).catch(() => {})
  }, [allowedMs, clockStart, game.currentTurn, now, party, roomRef, seats, startedAt, status, turnOnline])

  const setFormat = (value) => {
    if (!isCoordinator || !ARCHERY_FORMATS[value] || value === format) return
    run(async () => update(roomRef, { archeryFormat: value }), () => toast.error('FORMAT NOT SAVED'))
  }
  const onStartMatch = () => run(async () => onStart?.(), () => toast.error('START FAILED — CHECK CONNECTION'))
  const toggleSteady = (checked) => {
    setSteady(checked)
    try { localStorage.setItem(STEADY_KEY, checked ? 'on' : 'off') } catch { /* private mode */ }
  }

  if (party && status === 'waiting') {
    const enough = roster.length >= 2
    return (
      <div className="mx-auto w-full max-w-sm space-y-3 text-center">
        <div className="space-y-1.5">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">ARCHERY RANGE · 4P</p>
          <p className="font-mono text-[11px] leading-relaxed text-retro-dim">2–4 archers · Three arrows each per end · Highest score wins.</p>
        </div>
        <div className="rounded border border-retro-border bg-retro-card p-3 text-left">
          <p className="mb-2 font-pixel text-[9px] tracking-widest text-retro-dim">ARCHERS ({roster.length}/4)</p>
          {roster.slice(0, 4).map((player, i) => {
            const symbol = ARCHERY_SEATS[i]
            return <div key={player.playerId} className="flex items-center gap-2 py-1 font-mono text-[11px]">
              <span className={cn('w-6 text-center', SEAT_TONE[symbol])}>{['●', '▲', '■', '◆'][i]}</span>
              <span className="flex-1 truncate text-retro-text">{player.name}{player.playerId === mySeat ? ' (YOU)' : ''}</span>
              <span className={cn('text-[9px]', player.online === false && 'opacity-40')}>{player.online === false ? 'AWAY' : 'READY'}</span>
            </div>
          })}
        </div>
        {isCoordinator && (
          <label className="flex items-center justify-between gap-2 rounded border border-retro-border bg-retro-card px-3 py-2 font-pixel text-[8px] text-retro-dim">
            RANGE FORMAT
            <select value={format} onChange={e => setFormat(e.target.value)} disabled={busy} className="min-h-11 min-w-0 max-w-[62%] bg-retro-deep px-2 text-retro-cta">
              {Object.entries(ARCHERY_FORMATS).map(([id, item]) => <option key={id} value={id}>{item.label} · {item.ends} ENDS</option>)}
            </select>
          </label>
        )}
        {isCoordinator && enough && <button onClick={onStartMatch} disabled={busy} className="min-h-11 rounded bg-retro-cta px-6 py-2.5 font-pixel text-xs text-retro-bg">{busy ? 'STARTING…' : `START · ${roster.length} ARCHERS`}</button>}
        {isCoordinator && !enough && <p className="font-pixel text-[9px] text-retro-p2">NEED 2+ ARCHERS — INVITE FRIENDS</p>}
        {!isCoordinator && <p className="font-pixel text-[9px] text-retro-dim arcade-blink">WAITING FOR THE RANGE HOST…</p>}
        {onSwitchGame && <GameSwitcher currentType="archery4" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  const isSpectator = !me
  const isShootOff = phase === 'shootOff'
  const arrowNumber = isShootOff ? tieShots.length % Math.max(1, tieSeats.length) + 1 : turn.arrowInEnd + 1
  const nameTurn = names[game.currentTurn] || `PLAYER ${game.currentTurn || ''}`
  const windNow = windForShot(game.archerySeed, liveShotIndex, currentDistance, drawHook.draw.dr)
  const aimPreview = myTurn ? {
    ...drawHook.draw,
    ax: me === 'O' ? -drawHook.draw.ax : drawHook.draw.ax,
    wind: windNow,
  } : null
  const statusText = status === 'finished'
    ? (game.winner === me ? 'BULLSEYE · YOU WIN' : `${names[game.winner] || game.winner || 'MATCH'} WINS`)
    : isShootOff ? `SHOOT-OFF · ${nameTurn} · CLOSEST TO CENTER`
      : myTurn ? `YOUR END · ARROW ${arrowNumber} / ${ARROWS_PER_END}` : `${nameTurn} SHOOTS…`

  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <ArcheryScorecard seats={seats} card={card} names={names} currentTurn={game.currentTurn} format={ARCHERY_FORMATS[format].label} />
      <div className="flex items-center justify-between gap-2 font-pixel text-[8px]">
        <span className={cn('min-w-0 truncate', SEAT_TONE[me] || 'text-retro-dim', myTurn && 'text-glow-p1')}>{statusText}</span>
        <span className="shrink-0 text-retro-cta">WIND {windNow < 0 ? '←' : '→'} {Math.abs(windNow)} MM</span>
        {status === 'playing' && <span className={cn('shrink-0 tabular-nums', secondsLeft <= 5 ? 'text-retro-p2 arcade-blink' : 'text-retro-dim')}>{secondsLeft}s</span>}
      </div>
      {isShootOff && <p className="text-center font-pixel text-[8px] text-retro-cta">TIED ON SCORE + X COUNT · 70 M · NEAREST ARROW TAKES IT</p>}
      {isSpectator && status !== 'waiting' && <p className="text-center font-pixel text-[9px] text-retro-dim">SPECTATING · RANGE IS LIVE</p>}
      <ArcheryRange
        shots={shots}
        shootOffShots={tieShots}
        seed={game.archerySeed}
        format={format}
        currentDistance={currentDistance}
        activeDraw={myTurn ? aimPreview : null}
        disabled={!myTurn}
        pointerProps={drawHook.pointerProps}
      />
      {status === 'playing' && !isSpectator && myTurn && (
        <p className="text-center font-mono text-[9px] text-retro-dim">DRAG FROM BOW GRIP · PULL DOWN FOR POWER · SLIDE BACK TO CANCEL</p>
      )}
      {status === 'playing' && !isSpectator && (
        <>
          <label className="flex items-center justify-between rounded border border-retro-border bg-retro-card px-3 py-2 font-mono text-[11px] text-retro-text">
            <span>STEADY AIM <span className="text-retro-dim">· ASSIST</span></span>
            <input type="checkbox" checked={steady} onChange={e => toggleSteady(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--c-win))]" />
          </label>
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded border border-retro-border bg-retro-card px-3 py-2">
            <label className="font-mono text-[10px] text-retro-dim" htmlFor="archery-draw">DRAW LENGTH · {drawHook.draw.dr} MM
              <input id="archery-draw" type="range" min="600" max="1000" step="5" value={drawHook.draw.dr} disabled={!myTurn} onChange={e => drawHook.setAim({ dr: Number(e.target.value) })} className="mt-1 block w-full accent-[rgb(var(--c-cta))]" />
            </label>
            <label className="font-mono text-[10px] text-retro-dim" htmlFor="archery-aim">AIM · {drawHook.draw.ax}
              <input id="archery-aim" type="range" min="-350" max="350" step="10" value={drawHook.draw.ax} disabled={!myTurn} onChange={e => drawHook.setAim({ ax: Number(e.target.value) })} className="mt-1 block w-24 accent-[rgb(var(--c-cta))]" />
            </label>
          </div>
          <button onClick={() => shoot(manualAim())} disabled={!myTurn || busy}
            className="min-h-12 w-full rounded bg-retro-cta py-3 font-pixel text-xs text-retro-bg hover:shadow-neon-cta active:scale-[0.98] disabled:opacity-40">
            {busy ? 'RELEASING…' : 'LOOSE ARROW'}
          </button>
          <p className="text-center font-mono text-[9px] text-retro-dim"><span className="kbd-hint">SPACE / ENTER · </span>DRAG FROM GRIP TO DRAW · 30S PER ARROW</p>
        </>
      )}
      {status === 'finished' && (
        <div className="space-y-2 rounded border border-retro-win/40 bg-retro-card p-3 text-center">
          <p className="font-pixel text-xs text-retro-win text-glow-win">{statusText}</p>
          <p className="font-mono text-[10px] text-retro-dim">FINAL · {seats.map(seat => `${names[seat]} ${card[seat]?.score ?? 0} · X${card[seat]?.xCount ?? 0}`).join(' / ')}</p>
          {party && isCoordinator && <button onClick={() => run(async () => onNewMatch?.(), () => toast.error('NEW MATCH FAILED'))} disabled={busy} className="min-h-11 rounded bg-retro-cta px-6 py-2.5 font-pixel text-[9px] text-retro-bg">{busy ? 'RESETTING…' : 'NEW MATCH'}</button>}
        </div>
      )}
      {!party && <GameStatus status={status} winner={game.winner} currentTurn={game.currentTurn} mySymbol={me || 'X'} scores={game.scores} players={game.players} gameType={game.gameType} onPlayAgain={onPlayAgain ?? null} onNewMatch={onNewMatch ?? null} onSwitchGame={!isSpectator ? onSwitchGame : null} />}
      {party && onSwitchGame && status !== 'waiting' && <GameSwitcher currentType="archery4" onSwitch={onSwitchGame} />}
    </div>
  )
}
