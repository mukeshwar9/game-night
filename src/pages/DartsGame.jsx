import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ref, runTransaction, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import useBusy from '../hooks/useBusy'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import DartsTable from '../components/DartsTable'
import DartsSetup from '../components/DartsSetup'
import Avatar from '../components/Avatar'
import GameSwitcher from '../components/GameSwitcher'
import { isRoomCoordinator } from '../lib/coordinator'
import { sounds } from '../lib/sounds'
import {
  DART_CLOCK_MS, DARTS_AWAY_GRACE_MS, MAX_PLAYERS, MIN_PLAYERS, missVisit, normalizeCfg, normalizeRound, replay,
  standings, threeDartAverage, throwDart,
} from '../lib/dartsLogic'
import { cn } from '@/lib/utils'

// STEADY HAND — darts for 2–4 players, turn-based.
//
// Room model: uid-keyed players with a lobby → START flow (the party-game
// infra, like Yacht). The match is one object under the room's `round` node
// (dartsLogic.js): the lobby picks in `dCfg`, then an append-only list of
// integer landing points. Every client replays that list, so scores, busts,
// Turf ownership, legs and the winner come out the same everywhere. Each dart
// is a transaction that re-checks the turn and the dart count, so two taps
// cannot both land.
//
// A dart clock runs per dart; when it runs out, or the thrower has been seen
// offline for DARTS_AWAY_GRACE_MS, the rest of that visit is recorded as misses
// so the leg never stalls.

function lobbySeats(players) {
  return Object.values(players || {})
    .filter((p) => p && p.playerId)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

export default function DartsGame({ gameId, game, mySeat, players, onStart, onSwitchGame, onNewMatch }) {
  const [busy, run] = useBusy()
  const { now } = useServerClock(1000)
  const roomRef = useMemo(() => ref(db, `games/${gameId}`), [gameId])
  const seats = useMemo(() => lobbySeats(players), [players])
  const round = useMemo(() => normalizeRound(game.round), [game.round])
  const state = useMemo(() => replay(game.round), [game.round])
  const status = game.status ?? 'waiting'
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)
  const inRound = !!state && state.seats.includes(mySeat)
  const playing = status === 'playing' && !!state && !state.over
  const myTurn = playing && state.turnUid === mySeat
  const cfg = useMemo(() => normalizeCfg(game.round?.dCfg), [game.round?.dCfg])
  const names = useMemo(() => {
    const out = {}
    for (const uid of state?.seats ?? []) out[uid] = uid === mySeat ? 'YOU' : (players?.[uid]?.name ?? 'PLAYER')
    return out
  }, [state?.seats, players, mySeat])

  const setCfg = (patch) => {
    if (!amCoordinator) return
    const next = normalizeCfg({ ...cfg, ...patch })
    run(
      () => update(ref(db, `games/${gameId}/round`), { dCfg: next }),
      () => toast.error('SETUP NOT SAVED — CHECK CONNECTION'),
    )
  }

  const throwShot = useCallback(async (shot) => {
    if (!myTurn || !state) return false
    const at = state.count
    try {
      const res = await runTransaction(roomRef, (g) => {
        if (!g || g.status !== 'playing') return
        const out = throwDart(g.round, mySeat, shot, at)
        if (!out) return
        return {
          ...g,
          round: { ...out.round, dAt: getServerNow() },
          lastActivityAt: Date.now(),
          ...(out.state.over ? { winner: out.state.winner, status: 'finished' } : {}),
        }
      })
      if (!res.committed) toast.error('DART NOT SAVED — THROW AGAIN')
      return res.committed
    } catch {
      toast.error('DART FAILED — CHECK CONNECTION')
      return false
    }
  }, [myTurn, state, roomRef, mySeat])

  // Stamp the dart clock on a room that has none yet (a fresh START or a dart
  // that landed on an older client).
  const stamped = round?.at != null
  useEffect(() => {
    if (!playing || stamped) return
    runTransaction(roomRef, (g) => {
      if (!g || g.status !== 'playing' || Number.isFinite(g.round?.dAt)) return
      return { ...g, round: { ...g.round, dAt: getServerNow() } }
    }).catch(() => {})
  }, [playing, stamped, roomRef])

  // Out of time, or away: miss the rest of the visit. Any seated client may do
  // it; the transaction re-checks the turn, the dart count and the clock.
  const turnUid = state?.turnUid ?? null
  const turnAway = playing && !!turnUid && players?.[turnUid]?.online === false
  const dartKey = playing ? `${state.count}:${turnUid}` : null
  const awaySince = useRef({ key: null, at: 0 })
  useEffect(() => {
    if (!dartKey || !inRound) return
    if (awaySince.current.key !== dartKey) awaySince.current = { key: dartKey, at: 0 }
    if (turnAway && !awaySince.current.at) awaySince.current.at = Date.now()
    if (!turnAway) awaySince.current.at = 0
    const [count, uid] = [Number(dartKey.split(':')[0]), turnUid]
    const awayFor = awaySince.current.at ? Date.now() - awaySince.current.at : 0
    const overClock = round?.at != null && now - round.at >= DART_CLOCK_MS
    if (!overClock && awayFor < DARTS_AWAY_GRACE_MS) return
    runTransaction(roomRef, (g) => {
      if (!g || g.status !== 'playing') return
      const liveAt = Number(g.round?.dAt)
      const clockOut = Number.isFinite(liveAt) && getServerNow() - liveAt >= DART_CLOCK_MS
      const away = g.players?.[uid]?.online === false
      if (!clockOut && !away) return
      const out = missVisit(g.round, uid, count)
      if (!out) return
      return {
        ...g,
        round: { ...out.round, dAt: getServerNow() },
        lastActivityAt: Date.now(),
        ...(out.state.over ? { winner: out.state.winner, status: 'finished' } : {}),
      }
    }).catch(() => {})
  }, [dartKey, inRound, turnAway, turnUid, now, round?.at, roomRef])

  const winner = game.winner ?? null
  const prevWinner = useRef(winner)
  useEffect(() => {
    if (winner && prevWinner.current !== winner && inRound) {
      if (winner === mySeat) sounds.win(); else sounds.lose()
    }
    prevWinner.current = winner
  }, [winner, mySeat, inRound])

  // ─── Lobby ──────────────────────────────────────────────────────────────
  if (!state || status === 'waiting') {
    const enough = seats.length >= MIN_PLAYERS
    return (
      <div className="mx-auto w-full max-w-sm space-y-3 text-center">
        <div className="space-y-1.5">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">STEADY HAND</p>
          <p className="font-mono text-[11px] leading-relaxed text-retro-dim">
            {MIN_PLAYERS}–{MAX_PLAYERS} players. Three darts a visit.<br />Aim, hold your nerve, let go.
          </p>
        </div>
        <div className="space-y-1.5 rounded border border-retro-border bg-retro-card p-3">
          <p className="font-pixel text-[9px] tracking-widest text-retro-dim">PLAYERS ({Math.min(seats.length, MAX_PLAYERS)}/{MAX_PLAYERS})</p>
          {seats.length === 0 && <p className="arcade-blink font-mono text-[11px] text-retro-dim">WAITING…</p>}
          {seats.map((p, i) => (
            <div key={p.playerId} className={cn('flex items-center gap-2 font-mono text-[11px]', p.online === false && 'opacity-40')}>
              <Avatar id={p.avatar} size={24} />
              <span className={cn('flex-1 truncate text-left', p.playerId === mySeat ? 'text-retro-p1' : 'text-retro-text')}>
                {p.name}{p.playerId === mySeat ? ' (YOU)' : ''}
              </span>
              <span className="font-pixel text-[8px] text-retro-dim">{i < MAX_PLAYERS ? `P${i + 1}` : 'WATCHING'}</span>
            </div>
          ))}
        </div>
        {amCoordinator
          ? <DartsSetup cfg={cfg} onChange={setCfg} disabled={busy} />
          : (
            <p className="rounded border border-retro-border bg-retro-card px-3 py-2 font-mono text-[10px] text-retro-dim">
              {cfg.mode === 'x01' ? `COUNTDOWN ${cfg.start}` : 'TURF'} · {cfg.ctrl === 'aim' ? 'STEADY AIM' : 'ONE BUTTON'}
              {cfg.mode === 'x01' && cfg.legs > 1 ? ' · BEST OF 3' : ''} · NERVES {cfg.nerves ? 'ON' : 'OFF'}
            </p>
          )}
        {amCoordinator && enough && (
          <button
            onClick={() => run(async () => { await onStart() }, () => toast.error('START FAILED — CHECK CONNECTION'))}
            disabled={busy}
            className="press rounded bg-retro-cta px-6 py-2.5 font-pixel text-xs text-retro-bg transition hover:shadow-neon-cta disabled:opacity-50"
          >
            {busy ? 'STARTING…' : 'START MATCH'}
          </button>
        )}
        {amCoordinator && !enough && (
          <p className="arcade-blink font-pixel text-[10px] text-retro-p2">NEED {MIN_PLAYERS}+ PLAYERS — SHARE THE ROOM CODE</p>
        )}
        {!amCoordinator && (
          <p className="arcade-blink font-pixel text-[10px] text-retro-dim">
            {seats.some((p) => p.playerId === mySeat) ? 'WAITING TO START…' : 'SPECTATING — WAITING TO START…'}
          </p>
        )}
        <GameSwitcher currentType="darts" onSwitch={onSwitchGame} />
      </div>
    )
  }

  // ─── Playing / finished ─────────────────────────────────────────────────
  const finished = status === 'finished' || state.over
  const secondsLeft = round?.at != null ? Math.max(0, Math.ceil((DART_CLOCK_MS - (now - round.at)) / 1000)) : null
  const ranking = standings(state)

  return (
    <div className="mx-auto w-full max-w-md space-y-2.5">
      <DartsTable
        state={state}
        names={names}
        myUid={inRound ? mySeat : null}
        controls={myTurn && !busy}
        ctrl={state.cfg.ctrl}
        onThrow={throwShot}
        ariaLabel="Dartboard"
      />
      {playing && (
        <div className="flex items-center justify-between font-pixel text-[8px] text-retro-dim">
          <span>{inRound ? (myTurn ? 'YOUR VISIT' : `${(names[turnUid] ?? 'PLAYER').toUpperCase()} IS UP`) : 'SPECTATING'}</span>
          {secondsLeft !== null && <span className={cn('tabular-nums', secondsLeft <= 5 && 'arcade-blink text-retro-p2')}>{secondsLeft}s</span>}
        </div>
      )}
      {playing && turnAway && !myTurn && (
        <p className="text-center font-pixel text-[9px] text-retro-p2" role="status">
          {`${(names[turnUid] ?? 'PLAYER').toUpperCase()} IS OFFLINE — PASSING THEIR VISIT SOON`}
        </p>
      )}
      {finished && (
        <div className="space-y-2 py-1 text-center">
          <p className={cn('font-pixel text-sm', winner === mySeat ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
            {winner === mySeat ? 'YOU WIN!' : `${(names[winner] ?? 'PLAYER').toUpperCase()} WINS`}
          </p>
          <ol className="space-y-1 rounded border border-retro-border bg-retro-card p-2">
            {ranking.map((uid, i) => (
              <li key={uid} className="flex items-center gap-2 font-mono text-[11px]">
                <span className="w-4 font-pixel text-[8px] text-retro-dim">{i + 1}</span>
                <Avatar id={players?.[uid]?.avatar} size={24} />
                <span className="flex-1 truncate text-left">{names[uid]}</span>
                <span className="font-pixel text-[9px] tabular-nums">
                  {state.cfg.mode === 'turf' ? `${state.points[uid]} PTS` : state.scores[uid] === 0 ? 'OUT' : `${state.scores[uid]} LEFT`}
                  {state.cfg.mode === 'x01' ? ` · ${threeDartAverage(state, uid)} AVG` : ''}
                </span>
              </li>
            ))}
          </ol>
          {amCoordinator ? (
            <button
              onClick={() => run(async () => { await onNewMatch() }, () => toast.error('NEW MATCH FAILED — CHECK CONNECTION'))}
              disabled={busy}
              className="press rounded bg-retro-cta px-6 py-2.5 font-pixel text-xs text-retro-bg transition hover:shadow-neon-cta disabled:opacity-50"
            >
              {busy ? 'RESETTING…' : 'NEW MATCH'}
            </button>
          ) : (
            <p className="font-pixel text-[9px] text-retro-dim">WAITING FOR THE HOST TO START A NEW MATCH</p>
          )}
        </div>
      )}
      <GameSwitcher currentType="darts" onSwitch={onSwitchGame} />
    </div>
  )
}
