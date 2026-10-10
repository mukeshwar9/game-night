import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { serverNow } from '../lib/serverClock'
import { getMemoryKit } from '../lib/memoryKits'
import { levelRand, newSeed, memLevelOutcome, memLevelPatch, memStreamOutcome } from '../lib/memoryRaceLogic'
import { LEVEL_COUNTDOWN_MS } from '../lib/levelRaceLogic'
import { mulberry32 } from '../lib/detMath'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { CountdownCover } from '../components/memory/MemoryParts'

// A level has this long (from its start) before anyone still playing it is
// counted as a slip; a stream duel ends for everyone this long after it starts.
// Starting values (posture B): long enough for the slowest level's study + recall.
export const LEVEL_DEADLINE_MS = 60000
export const STREAM_DEADLINE_MS = 240000

function BoardFallback() {
  return <div className="min-h-[18rem] rounded border-2 border-retro-border bg-retro-surface" aria-hidden="true" />
}

// Online duel for a memory kit (src/lib/memoryKits.js). Both players get the same
// seeded deal (or stream) after a shared 3-2-1 and play it on their own boards:
// level kits resolve each level with memLevelOutcome (a slip only loses once the
// other player clears that level); stream kits are a score race once both are out.
// Room state: games/{id}/mem (memoryRaceLogic.js). Every resolution write is a CAS.
export default function MemoryDuelGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const kit = getMemoryKit(game.gameType)
  const mem = game.mem ?? {}
  const myKey = mySymbol === 'O' ? 'O' : 'X'
  const opKey = myKey === 'X' ? 'O' : 'X'
  const me = mem[myKey] ?? {}
  const op = mem[opKey] ?? {}
  const startAt = mem.startAt ?? null
  const playing = game.status === 'playing'
  const memPath = `games/${gameId}/mem`

  // Stamp the start once the room is playing (join, START, play again).
  useEffect(() => {
    if (!playing || mem.startAt != null || mem.seed == null) return
    runTransaction(ref(db, `${memPath}/startAt`), cur => cur ?? serverNow() + LEVEL_COUNTDOWN_MS).catch(() => {})
  }, [playing, mem.startAt, mem.seed, memPath])

  const [now, setNow] = useState(() => serverNow())
  useEffect(() => {
    if (!playing) return undefined
    const t = setInterval(() => setNow(serverNow()), 250)
    return () => clearInterval(t)
  }, [playing])

  const write = patch => update(ref(db, memPath), patch).catch(() => toast.error('MOVE FAILED — CHECK CONNECTION'))

  // ── level kits ──
  const deal = useMemo(
    () => (kit.mode === 'level' && mem.seed != null ? kit.deal(mem.level ?? 1, levelRand(mem.seed, mem.level ?? 1)) : null),
    [kit, mem.seed, mem.level],
  )
  const myOut = kit.mode === 'level' ? (!!me.done || me.fail != null) : !!me.over
  const opOut = kit.mode === 'level' ? (!!op.done || op.fail != null) : !!op.over

  const onProgress = n => { if (mySymbol && !myOut) write({ [`${myKey}/progress`]: n }) }
  const onDone = () => {
    if (!mySymbol || myOut) return
    write({ [`${myKey}/done`]: true, [`${myKey}/time`]: (me.time ?? 0) + Math.max(0, serverNow() - (startAt ?? serverNow())) })
  }
  const onFail = info => { if (mySymbol && !myOut) write({ [`${myKey}/fail`]: typeof info?.cell === 'number' ? info.cell : 0 }) }

  // ── stream kits ──
  const rand = useMemo(() => (mem.seed != null ? mulberry32(mem.seed) : null), [mem.seed])
  const onChange = run => { if (mySymbol) write({ [myKey]: { score: run.score, lives: run.lives, over: !!run.over } }) }
  // A stream run cannot resume after a reload (the board's run is local), so a
  // seat that comes back mid-run is counted out with the score it had.
  const resumeChecked = useRef(false)
  useEffect(() => {
    if (resumeChecked.current || kit.mode !== 'stream' || !mySymbol || !playing || mem.seed == null) return
    resumeChecked.current = true
    if ((me.score ?? 0) > 0 && !me.over) write({ [`${myKey}/over`]: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checked once, on the first render that has the room
  }, [mem.seed, playing])

  // Deadline: anyone without an outcome is counted out (a CAS per seat).
  const deadline = startAt == null ? null : startAt + (kit.mode === 'level' ? LEVEL_DEADLINE_MS : STREAM_DEADLINE_MS)
  const pastDeadline = deadline != null && now >= deadline
  useEffect(() => {
    if (!playing || !pastDeadline) return
    for (const k of ['X', 'O']) {
      if (kit.mode === 'level') {
        runTransaction(ref(db, `${memPath}/${k}`), cur => (cur && !cur.done && cur.fail == null ? { ...cur, fail: -1 } : undefined)).catch(() => {})
      } else {
        runTransaction(ref(db, `${memPath}/${k}/over`), cur => (cur ? undefined : true)).catch(() => {})
      }
    }
  }, [playing, pastDeadline, kit.mode, memPath])

  // Resolution.
  const outcome = kit.mode === 'level' ? memLevelOutcome(mem) : memStreamOutcome(mem)
  const outcomeKey = playing && outcome.type !== 'pending' ? `${mem.seed}:${mem.level ?? 0}:${outcome.type}:${outcome.winner ?? ''}` : null
  const resolvedRef = useRef(null)
  useEffect(() => {
    if (!outcomeKey || resolvedRef.current === outcomeKey) return
    resolvedRef.current = outcomeKey
    const run = async () => {
      if (outcome.type === 'win' || outcome.type === 'draw') {
        const result = outcome.type === 'draw' ? 'draw' : outcome.winner
        let claimed = false
        await runTransaction(ref(db, `games/${gameId}/winner`), cur => { if (cur != null) return; claimed = true; return result })
        if (!claimed) return
        await update(ref(db, `games/${gameId}`), {
          status: 'finished',
          ...(outcome.type === 'win' ? { [`scores/${outcome.winner}`]: (game.scores?.[outcome.winner] || 0) + 1 } : {}),
        })
        return
      }
      // advance / replay (level kits): claim the change with a CAS on the start stamp.
      const nextStart = serverNow() + LEVEL_COUNTDOWN_MS
      let claimed = false
      await runTransaction(ref(db, `${memPath}/startAt`), cur => { if ((cur ?? null) !== startAt) return; claimed = true; return nextStart })
      if (!claimed) return
      await update(ref(db, memPath), memLevelPatch(mem, outcome.type === 'advance' ? (mem.level ?? 1) + 1 : (mem.level ?? 1), nextStart, newSeed()))
    }
    run().catch(() => toast.error('ROUND UPDATE FAILED — CHECK CONNECTION'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one resolution per outcome key
  }, [outcomeKey])

  const opName = (game.players?.[opKey]?.name || 'OPPONENT').toUpperCase()
  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null
  const Board = kit.Board

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <p className="font-pixel text-[9px] text-center text-retro-dim leading-relaxed">
          {kit.mode === 'level'
            ? `LEVEL ${mem.level ?? 1} · YOU ${me.done ? 'CLEARED IT' : 'SLIPPED'} · ${opName} ${op.done ? 'CLEARED IT' : 'SLIPPED'}`
            : `YOU ${me.score ?? 0} ${kit.unit} · ${opName} ${op.score ?? 0} ${kit.unit}`}
        </p>
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal ? onPlayAgain : null}
          onNewMatch={matchWinner && !proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  const counting = startAt == null || now < startAt
  const status = kit.mode === 'level'
    ? (!mySymbol ? null
      : me.fail != null ? `YOU SLIPPED — ${opName} MUST CLEAR LEVEL ${mem.level ?? 1} TO WIN`
        : me.done ? (opOut ? 'BOTH DONE' : `CLEARED! WAITING FOR ${opName}…`)
          : op.fail != null ? `${opName} SLIPPED — CLEAR THIS LEVEL TO WIN`
            : null)
    : (!mySymbol ? null : me.over && !opOut ? `OUT — WAITING FOR ${opName} (${op.score ?? 0} SO FAR)` : null)

  return (
    <div className="space-y-4">
      {!mySymbol && <SpectatorCard game={game} />}
      <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim">
        <span>
          {mySymbol ? 'YOU' : 'X'} {kit.mode === 'level' ? `${me.done ? '✓' : me.fail != null ? '✕' : '…'}` : `${me.score ?? 0}${me.over ? ' · OUT' : ''}`}
        </span>
        <span className="text-retro-cta">{kit.mode === 'level' ? `LEVEL ${mem.level ?? 1}` : 'SAME STREAM'}</span>
        <span>
          {mySymbol ? opName : 'O'} {kit.mode === 'level' ? `${op.done ? '✓' : op.fail != null ? '✕' : '…'}` : `${op.score ?? 0}${op.over ? ' · OUT' : ''}`}
        </span>
      </div>
      {status && <p className="font-pixel text-[9px] text-center text-retro-text leading-relaxed" role="status">{status}</p>}
      <div className="relative">
        {counting && <CountdownCover msLeft={startAt == null ? null : startAt - now} label={kit.mode === 'level' ? `LEVEL ${mem.level ?? 1} · GET READY` : 'GET READY'} />}
        <Suspense fallback={<BoardFallback />}>
          {kit.mode === 'level' && deal && (
            <Board
              key={`${mem.seed}:${mem.level}`}
              deal={deal}
              level={mem.level ?? 1}
              startAt={startAt}
              clock={serverNow}
              disabled={!mySymbol || myOut}
              answer={false}
              revealOnFail={false}
              onProgress={onProgress}
              onDone={onDone}
              onFail={onFail}
            />
          )}
          {kit.mode === 'stream' && rand && (counting ? <BoardFallback /> : (
            <Board key={mem.seed} rand={rand} disabled={!mySymbol || myOut} onChange={onChange} onOver={() => {}} />
          ))}
        </Suspense>
      </div>
      {!opponentOnline && mySymbol && <OfflineNotice label="OPPONENT" />}
    </div>
  )
}
