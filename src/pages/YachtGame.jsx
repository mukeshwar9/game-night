import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction, serverTimestamp, update } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  BOXES, MAX_PLAYERS, MIN_PLAYERS, ROLLS_PER_TURN, YACHT_AWAY_GRACE_MS,
  canRoll, lastRollMatches, normalizeRound, pendingRoll, resolveRoll, scoreTurn, sheetTotals, skipTurn, toggleHold,
} from '../lib/yachtLogic'
import { isRoomCoordinator } from '../lib/coordinator'
import YachtBoard from '../components/YachtBoard'
import Avatar from '../components/Avatar'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'

// YACHT — 2–4 players, turn-based.
//
// Room model: uid-keyed players with a lobby → START flow (the party-game
// infra, like Chain Reaction 4P). The match is one object under the room's
// `round` node (yachtLogic.js); every move is a transaction that re-checks
// the turn, so two taps cannot both land.
//
// Rolls: the roller writes a request stamped with the server's time; any
// seated client then resolves it from (seed, roll number, that time). Each
// client re-derives the dice it is shown and warns on a mismatch.
//
// A player who drops on their turn is passed over after
// YACHT_AWAY_GRACE_MS: their first open box scores what is on the table.

const boxLabel = (id) => BOXES.find((b) => b.id === id)?.label ?? ''

function playersToSeats(players) {
  return Object.values(players || {})
    .filter((p) => p && p.playerId)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

export default function YachtGame({
  gameId, game, mySeat, players,
  onStart, onSwitchGame, onNewMatch,
}) {
  const [busy, run] = useBusy()
  const lobbySeats = useMemo(() => playersToSeats(players), [players])
  const round = useMemo(() => normalizeRound(game.round), [game.round])
  const status = game.status ?? 'waiting'
  const amSeated = !!mySeat && !!players?.[mySeat]
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)
  const inRound = !!round && round.seats.includes(mySeat)
  const turnUid = round ? round.seats[round.turn] : null
  const myTurn = status === 'playing' && inRound && turnUid === mySeat
  const pending = round ? pendingRoll(game.round) : null

  // Which sheet is on screen (mine by default; a spectator follows the roller).
  const [viewPick, setViewPick] = useState(null)
  const viewUid = round?.seats.includes(viewPick) ? viewPick : inRound ? mySeat : turnUid
  // The picked box only stands for the dice it was picked against.
  const [pick, setPick] = useState(null)
  const selected = pick && round && pick.at === round.rollIndex && pick.turn === round.turn ? pick.id : null

  const roomRef = ref(db, `games/${gameId}`)

  const roll = () => {
    if (!myTurn || !canRoll(game.round, mySeat)) return
    run(
      () => update(ref(db, `games/${gameId}/round`), { yReq: { i: round.rollIndex, by: mySeat, at: serverTimestamp() } }),
      () => toast.error('ROLL FAILED — CHECK CONNECTION'),
    )
  }

  const hold = (k) => {
    const next = toggleHold(game.round, mySeat, k)
    if (!next) return
    sounds.touch()
    update(ref(db, `games/${gameId}/round`), { yHeld: next.yHeld }).catch(() => toast.error('HOLD FAILED — CHECK CONNECTION'))
  }

  const score = () => {
    if (!myTurn || !selected) return
    const id = selected
    run(async () => {
      await runTransaction(roomRef, (g) => {
        if (!g || g.status !== 'playing') return g
        const res = scoreTurn(g.round, mySeat, id)
        if (!res) return g
        return { ...g, round: res.round, lastActivityAt: Date.now(), ...(res.result ? { winner: res.result.winner, status: 'finished' } : {}) }
      })
      setPick(null)
    }, () => toast.error('SCORE FAILED — CHECK CONNECTION'))
  }

  // Resolve a stamped roll request. The roller does it at once; the others
  // wait a moment first, so a roller whose tab died mid-roll does not stall
  // the table.
  const pendingKey = pending ? `${pending.i}:${pending.at}` : null
  useEffect(() => {
    if (!pendingKey || !inRound || status !== 'playing') return
    const resolve = () => runTransaction(ref(db, `games/${gameId}`), (g) => {
      if (!g || g.status !== 'playing') return
      const next = resolveRoll(g.round)
      if (!next) return
      return { ...g, round: next, lastActivityAt: Date.now() }
    }).catch(() => {})
    const id = setTimeout(resolve, turnUid === mySeat ? 0 : 1500)
    return () => clearTimeout(id)
  }, [pendingKey, inRound, status, gameId, turnUid, mySeat])

  // Every resolved roll is re-derived from the request it came from.
  const prevRoundRef = useRef(null)
  useEffect(() => {
    const prev = prevRoundRef.current
    prevRoundRef.current = game.round ?? null
    if (!prev || !game.round) return
    const before = normalizeRound(prev)
    const after = normalizeRound(game.round)
    if (!before || !after) return
    if (after.rollIndex === before.rollIndex + 1) {
      sounds.pigRoll(1)
      if (lastRollMatches(game.round, prev) === false) toast.error('ROLL MISMATCH — TAMPERING SUSPECTED')
    }
    if (after.last && after.last !== before.last && (after.last.by !== before.last?.by || after.last.box !== before.last?.box)) {
      if (after.last.pts > 0) sounds.move(after.last.by === mySeat ? 'X' : 'O'); else sounds.buzz()
    }
  }, [game.round, mySeat])

  const winner = game.winner ?? null
  const prevWinnerRef = useRef(winner)
  useEffect(() => {
    if (winner && prevWinnerRef.current !== winner && inRound) {
      if (winner === mySeat) sounds.win(); else if (winner === 'draw') sounds.draw(); else sounds.lose()
    }
    prevWinnerRef.current = winner
  }, [winner, mySeat, inRound])

  // Away skip: each seated client times how long it has seen the roller away
  // (local durations only, so clock skew cannot matter); the transaction
  // re-checks presence and the turn, so racing clients skip at most once.
  const turnAway = status === 'playing' && !!turnUid && players?.[turnUid]?.online === false
  const awayKey = turnAway ? `${round.turn}:${round.rollIndex}:${turnUid}` : null
  const [awayClock, setAwayClock] = useState({ key: null, left: 0 })
  useEffect(() => {
    if (!awayKey || !inRound) return
    const uid = awayKey.split(':')[2]
    const since = Date.now()
    const tick = () => {
      const waited = Date.now() - since
      setAwayClock({ key: awayKey, left: Math.max(0, Math.ceil((YACHT_AWAY_GRACE_MS - waited) / 1000)) })
      if (waited < YACHT_AWAY_GRACE_MS) return
      runTransaction(ref(db, `games/${gameId}`), (g) => {
        if (!g || g.status !== 'playing' || g.players?.[uid]?.online !== false) return
        const res = skipTurn(g.round, uid)
        if (!res) return
        return { ...g, round: res.round, lastActivityAt: Date.now(), ...(res.result ? { winner: res.result.winner, status: 'finished' } : {}) }
      }).catch(() => {})
    }
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [awayKey, inRound, gameId])
  const awayLeft = awayClock.key === awayKey ? awayClock.left : Math.ceil(YACHT_AWAY_GRACE_MS / 1000)

  // ─── Lobby ─────────────────────────────────────────────────────────────────
  if (!round || status === 'waiting') {
    const enough = lobbySeats.length >= MIN_PLAYERS
    return (
      <div className="w-full max-w-sm mx-auto space-y-3 text-center">
        <div className="space-y-1.5">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">YACHT</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            {MIN_PLAYERS}–{MAX_PLAYERS} players. Five dice, three rolls a turn.<br />Fill all {BOXES.length} boxes; the highest total wins.
          </p>
        </div>
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">PLAYERS ({Math.min(lobbySeats.length, MAX_PLAYERS)}/{MAX_PLAYERS})</p>
          {lobbySeats.length === 0 && <p className="font-mono text-[11px] text-retro-dim arcade-blink">WAITING…</p>}
          {lobbySeats.map((p, i) => (
            <div key={p.playerId} className={cn('flex items-center gap-2 font-mono text-[11px]', p.online === false && 'opacity-40')}>
              <Avatar id={p.avatar} size={24} />
              <span className={cn('truncate flex-1 text-left', p.playerId === mySeat ? 'text-retro-p1' : 'text-retro-text')}>
                {p.name}{p.playerId === mySeat ? ' (YOU)' : ''}
              </span>
              <span className="font-pixel text-[8px] text-retro-dim">{i < MAX_PLAYERS ? `P${i + 1}` : 'WATCHING'}</span>
            </div>
          ))}
        </div>
        {amCoordinator && enough && (
          <button
            onClick={() => run(async () => { await onStart() })}
            disabled={busy}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press disabled:opacity-50"
          >
            {busy ? 'STARTING…' : 'START MATCH'}
          </button>
        )}
        {amCoordinator && !enough && (
          <p className="font-pixel text-[10px] text-retro-p2 arcade-blink">NEED {MIN_PLAYERS}+ PLAYERS — SHARE THE ROOM CODE</p>
        )}
        {!amCoordinator && (
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
            {amSeated ? 'WAITING TO START…' : 'SPECTATING — WAITING TO START…'}
          </p>
        )}
        <GameSwitcher currentType="yacht" onSwitch={onSwitchGame} />
      </div>
    )
  }

  // ─── Playing / finished ────────────────────────────────────────────────────
  const nameOf = (uid) => (uid === mySeat ? 'YOU' : (players?.[uid]?.name ?? 'PLAYER'))
  const seats = round.seats.map((uid) => ({
    uid, name: nameOf(uid), avatar: players?.[uid]?.avatar, online: players?.[uid]?.online,
    total: sheetTotals(round.sheets[uid]).total,
  }))
  const finished = status === 'finished'
  const last = round.last
  const announce = last && round.seats.includes(last.by)
    ? { seat: round.seats.indexOf(last.by), text: `${nameOf(last.by).toUpperCase()} · ${boxLabel(last.box)} +${last.pts}${last.away ? ' (AWAY)' : ''}` }
    : null
  const rollable = myTurn && !finished && canRoll(game.round, mySeat)
  const rolled = round.rollsLeft < ROLLS_PER_TURN
  const ranking = seats.slice().sort((a, b) => b.total - a.total)

  return (
    <div className="w-full max-w-sm mx-auto space-y-2.5">
      <YachtBoard
        key={`${round.turn}:${round.rollIndex}`}
        seats={seats}
        turnUid={finished ? null : turnUid}
        myUid={mySeat}
        viewUid={viewUid}
        onView={setViewPick}
        dice={round.dice}
        held={round.held}
        rollsLeft={round.rollsLeft}
        rolling={rolled}
        sheet={round.sheets[viewUid] ?? {}}
        myTurn={myTurn && !finished && !pending}
        selected={selected}
        onSelect={(id) => { sounds.touch(); setPick({ id, at: round.rollIndex, turn: round.turn }) }}
        onHold={hold}
        onRoll={rollable ? roll : null}
        onScore={myTurn && !finished && rolled ? score : null}
        busy={busy || !!pending}
        rollLabel={busy || pending ? 'ROLLING…' : 'ROLL'}
        announce={announce}
        justBox={last && last.by === viewUid ? last.box : null}
      />

      {!finished && (
        <p className={cn('text-center font-pixel text-[9px]', myTurn ? 'text-retro-cta' : 'text-retro-dim')} role="status">
          {myTurn
            ? (!rolled ? 'YOUR TURN · ROLL THE DICE' : selected ? 'TAP SCORE TO BANK IT' : round.rollsLeft ? 'HOLD DICE, ROLL AGAIN OR PICK A BOX' : 'NO ROLLS LEFT · PICK A BOX')
            : `${nameOf(turnUid).toUpperCase()} IS ROLLING…`}
        </p>
      )}
      {!finished && turnAway && !myTurn && (
        <p className="text-center font-pixel text-[9px] text-retro-p2" role="status">
          {`${nameOf(turnUid).toUpperCase()} IS OFFLINE — `}{inRound ? `PASSING THEIR TURN IN ${awayLeft}s` : 'THEIR TURN WILL BE PASSED'}
        </p>
      )}

      {finished && (
        <div className="text-center space-y-2 py-1">
          <p className={cn('font-pixel text-sm', winner === mySeat ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
            {winner === 'draw' ? 'IT\'S A DRAW' : winner === mySeat ? 'YOU WIN!' : `${nameOf(winner).toUpperCase()} WINS`}
          </p>
          <ol className="bg-retro-card border border-retro-border rounded p-2 space-y-1">
            {ranking.map((s, i) => (
              <li key={s.uid} className="flex items-center gap-2 font-mono text-[11px]">
                <span className="font-pixel text-[8px] text-retro-dim w-4">{i + 1}</span>
                <Avatar id={s.avatar} size={24} />
                <span className="flex-1 text-left truncate">{s.name}</span>
                <span className="font-pixel text-[10px] tabular-nums">{s.total}</span>
              </li>
            ))}
          </ol>
          {amCoordinator ? (
            <button
              onClick={() => run(async () => { await onNewMatch() }, () => toast.error('NEW MATCH FAILED — CHECK CONNECTION'))}
              disabled={busy}
              className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press disabled:opacity-50"
            >
              {busy ? 'RESETTING…' : 'NEW MATCH'}
            </button>
          ) : (
            <p className="font-pixel text-[9px] text-retro-dim">WAITING FOR THE HOST TO START A NEW MATCH</p>
          )}
        </div>
      )}

      <GameSwitcher currentType="yacht" onSwitch={onSwitchGame} />
    </div>
  )
}
