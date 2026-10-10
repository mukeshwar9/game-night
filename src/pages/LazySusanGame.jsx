import { useCallback, useEffect, useMemo, useRef } from 'react'
import { push, ref, runTransaction, serverTimestamp, set } from 'firebase/database'
import { db } from '../lib/firebase'
import { getServerNow } from '../hooks/useServerClock'
import {
  MAX_PLAYERS, MIN_PLAYERS, TARGETS, derive, seatAnglesFor, standings, winnerOf,
} from '../lib/lazySusanLogic'
import LazySusanArena from '../components/LazySusanArena'
import LiveAnnouncer from '../components/LiveAnnouncer'
import Avatar from '../components/Avatar'
import GameSwitcher from '../components/GameSwitcher'
import { isRoomCoordinator } from '../lib/coordinator'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'

// LAZY SUSAN — 2–4 players, one shared plate, real time.
//
// Room model: uid-keyed players with a lobby → START flow (the party-game
// infra, like Yacht). The match is one object under the room's `round` node
// (lazySusanLogic.js) and holds no positions: every client turns the same
// plate from (seed, start time, claims). Taking a piece is a write-once claim
// at round/lsClaims/p{plate}_{piece}; the rules refuse a second writer, so the
// first claim in server order owns the piece and the loser sees TAKEN, with no
// penalty. A tap on nothing is an append-only miss. Scores are replayed from
// claims and misses, so no client reports a score.
//
// The first client to see a winner finishes the room in a transaction.

const TEXT_TOK = ['text-retro-p1', 'text-retro-p2', 'text-retro-p3', 'text-retro-p4']

function playersToSeats(players) {
  return Object.values(players || {})
    .filter((p) => p && p.playerId)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

export default function LazySusanGame({
  gameId, game, mySeat, players,
  onStart, onSwitchGame, onNewMatch,
}) {
  const [busy, run] = useBusy()
  const arenaRef = useRef(null)
  const lobbySeats = useMemo(() => playersToSeats(players), [players])
  const d = useMemo(() => derive(game.round), [game.round])
  const status = game.status ?? 'waiting'
  const amSeated = !!mySeat && !!players?.[mySeat]
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)
  const seatsUids = useMemo(() => d?.round.seats ?? [], [d])
  const myIdx = seatsUids.indexOf(mySeat)
  const inRound = myIdx >= 0
  const playing = status === 'playing' && !!d
  const finished = status === 'finished'

  const clock = getServerNow
  const seats = useMemo(() => seatsUids.map((uid) => ({
    uid,
    name: (uid === mySeat ? 'YOU' : (players?.[uid]?.name ?? 'PLAYER')).toUpperCase(),
    online: players?.[uid]?.online !== false,
  })), [seatsUids, mySeat, players])
  const localSeats = useMemo(() => (inRound && playing ? [myIdx] : []), [inRound, playing, myIdx])
  const flip = inRound && Math.sin(seatAnglesFor(seatsUids.length)[myIdx]) < 0

  // A tap resolved against the round: write the claim or the miss.
  const onAct = useCallback((i, outcome) => {
    const base = `games/${gameId}/round`
    if (outcome.kind === 'miss') {
      const slot = push(ref(db, `${base}/lsMiss`))
      set(slot, { by: mySeat, at: serverTimestamp() }).catch(() => toast.error('TAP FAILED — CHECK CONNECTION'))
      return
    }
    set(ref(db, `${base}/lsClaims/${outcome.key}`), { by: mySeat, at: serverTimestamp() }).catch((err) => {
      // Someone's claim landed first: the piece is theirs, nothing is lost.
      if (err?.code === 'PERMISSION_DENIED' || /permission_denied/i.test(err?.message ?? '')) arenaRef.current?.rejected(i)
      else toast.error('TAP FAILED — CHECK CONNECTION')
    })
  }, [gameId, mySeat])

  // The first client to see the target reached finishes the room. The
  // transaction re-derives the winner from the room's own round, so a client
  // cannot name one.
  const derivedWinner = d?.winner ?? null
  useEffect(() => {
    if (!derivedWinner || status !== 'playing' || !inRound) return
    runTransaction(ref(db, `games/${gameId}`), (g) => {
      if (!g || g.status !== 'playing') return
      const w = winnerOf(g.round)
      if (!w) return
      return { ...g, status: 'finished', winner: w, lastActivityAt: Date.now() }
    }).catch(() => {})
  }, [derivedWinner, status, inRound, gameId])

  // Everyone else left: the last one standing may end it.
  const onlineSeats = seats.filter((s) => s.online).length
  const alone = playing && inRound && onlineSeats <= 1 && seats.length > 1
  const claimWin = () => run(async () => {
    await runTransaction(ref(db, `games/${gameId}`), (g) => {
      if (!g || g.status !== 'playing' || !g.round) return
      const others = (d?.round.seats ?? []).filter((u) => u !== mySeat)
      if (others.some((u) => g.players?.[u]?.online !== false)) return
      return { ...g, status: 'finished', winner: mySeat, lastActivityAt: Date.now() }
    })
  }, () => toast.error('COULD NOT CLAIM — CHECK CONNECTION'))

  // ─── Lobby ─────────────────────────────────────────────────────────────────
  if (!d || status === 'waiting') {
    const enough = lobbySeats.length >= MIN_PLAYERS
    return (
      <div className="w-full max-w-sm mx-auto space-y-3 text-center">
        <div className="space-y-1.5">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">LAZY SUSAN</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            {MIN_PLAYERS}–{MAX_PLAYERS} players, one turning plate.<br />
            Tap when a piece is in your gate. A tap on nothing costs a point.
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
        {enough && (
          <p className="font-pixel text-[9px] text-retro-dim">FIRST TO {TARGETS[Math.min(lobbySeats.length, MAX_PLAYERS)]} WINS</p>
        )}
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
        <GameSwitcher currentType="lazysusan" onSwitch={onSwitchGame} />
      </div>
    )
  }

  // ─── Playing / finished ────────────────────────────────────────────────────
  const winner = game.winner ?? derivedWinner
  const board = standings(d)
  const nameOf = (uid) => (uid === mySeat ? 'YOU' : (players?.[uid]?.name ?? 'PLAYER'))
  const winnerIdx = seatsUids.indexOf(winner)
  const headline = winner === mySeat ? 'YOU WIN!' : `${String(nameOf(winner)).toUpperCase()} WINS`

  return (
    <div className="w-full max-w-sm mx-auto space-y-2.5">
      <LiveAnnouncer message={finished ? `${headline}. ${board.map((b) => `${nameOf(b.uid)} ${b.score}`).join(', ')}` : ''} />
      <LazySusanArena
        key={d.round.start}
        ref={arenaRef}
        round={game.round}
        clock={clock}
        seats={seats}
        localSeats={localSeats}
        single
        flip={flip}
        paused={finished}
        onAct={onAct}
      />

      {!finished && (
        <p className="text-center font-pixel text-[9px] text-retro-dim" role="status">
          {inRound ? `FIRST TO ${d.round.target} · TAP WHEN A PIECE IS IN YOUR GATE` : 'SPECTATING'}
        </p>
      )}
      {alone && (
        <div className="text-center space-y-1.5">
          <p className="font-pixel text-[9px] text-retro-p2" role="status">EVERYONE ELSE LEFT</p>
          <button
            onClick={claimWin}
            disabled={busy}
            className="px-5 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition press disabled:opacity-50"
          >
            {busy ? 'CLAIMING…' : 'CLAIM WIN'}
          </button>
        </div>
      )}

      {finished && (
        <div className="text-center space-y-2 py-1" data-testid="lazysusan-result">
          <p className={cn('font-pixel text-sm', winner === mySeat ? 'text-retro-win text-glow-win' : 'text-retro-text')}>{headline}</p>
          <ol className="bg-retro-card border border-retro-border rounded p-2 space-y-1">
            {board.map((b, i) => (
              <li key={b.uid} className="flex items-center gap-2 font-mono text-[11px]">
                <span className="font-pixel text-[8px] text-retro-dim w-4">{i + 1}</span>
                <Avatar id={players?.[b.uid]?.avatar} size={24} />
                <span className={cn('flex-1 text-left truncate', b.uid === seatsUids[winnerIdx] && TEXT_TOK[b.seat])}>{nameOf(b.uid)}</span>
                <span className="font-pixel text-[10px] tabular-nums">{b.score}</span>
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

      <GameSwitcher currentType="lazysusan" onSwitch={onSwitchGame} />
    </div>
  )
}
