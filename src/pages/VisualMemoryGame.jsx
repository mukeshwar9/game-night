import { useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { serverNow } from '../lib/serverClock'
import {
  normalizeVmArray, vmRevealMs, VM_START_LEVEL, VM_RECALL_MS,
  evaluateVmDuelTap, buildVmDuelLevel,
} from '../lib/visualMemoryLogic'
import { resolveLevelRace, LEVEL_COUNTDOWN_MS } from '../lib/levelRaceLogic'
import VisualMemoryBoard from '../components/VisualMemoryBoard'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { sounds } from '../lib/sounds'

// Visual Memory duel: both players memorize the SAME pattern at the same moment
// (a shared server-clock reveal after a 3-2-1), then recall it on their own boards.
// A level resolves once both have cleared or slipped (resolveLevelRace): a slip only
// costs the round if the opponent clears that level. Pass-and-play keeps the
// turn-based board (registry `localBoard`).
//
// Trust model: vmPattern sits in the room node in the clear, like Pairs' deck.
export default function VisualMemoryGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const level = game.vmLevel ?? VM_START_LEVEL
  const pattern = normalizeVmArray(game.vmPattern)
  const revealMs = vmRevealMs(level)
  const startAt = game.vmRoundStartedAt ?? null

  // Spectators follow X's board.
  const myKey = mySymbol === 'O' ? 'O' : 'X'
  const opKey = myKey === 'X' ? 'O' : 'X'
  const seat = k => ({
    clicked: normalizeVmArray(game[`vmClicked${k}`]),
    done: game[`vmDone${k}`] ?? false,
    fail: game[`vmFail${k}`] ?? null,
    time: game[`vmTime${k}`] ?? 0,
  })
  const me = seat(myKey)
  const op = seat(opKey)
  const myOut = me.done || me.fail != null
  const opOut = op.done || op.fail != null

  // Stamp the first level's start once the room is playing (join, START, play again).
  useEffect(() => {
    if (game.status !== 'playing' || game.vmRoundStartedAt != null) return
    runTransaction(ref(db, `games/${gameId}/vmRoundStartedAt`), cur => cur ?? serverNow() + LEVEL_COUNTDOWN_MS).catch(() => {})
  }, [gameId, game.status, game.vmRoundStartedAt])

  // Phase clock: countdown → reveal → recall, all on server time so both screens agree.
  const [now, setNow] = useState(() => serverNow())
  useEffect(() => {
    if (game.status !== 'playing') return undefined
    const t = setInterval(() => setNow(serverNow()), 100)
    return () => clearInterval(t)
  }, [game.status])
  const phase = startAt == null || now < startAt ? 'countdown'
    : now < startAt + revealMs ? 'reveal'
      : 'recall'
  const recallEndsAt = startAt == null ? null : startAt + revealMs + VM_RECALL_MS

  // Taps land faster than the Firebase echo; judge each against what this client sent.
  const roundSig = `${level}:${pattern.join(',')}`
  const sentRef = useRef({ sig: null, clicked: [] })

  const handleTap = (cell) => {
    if (!mySymbol || myOut || phase !== 'recall' || game.status !== 'playing') return
    if (sentRef.current.sig !== roundSig) sentRef.current = { sig: roundSig, clicked: [] }
    const clicked = sentRef.current.clicked.length >= me.clicked.length ? sentRef.current.clicked : me.clicked
    const tap = evaluateVmDuelTap({ pattern, clicked, level, cell })
    if (!tap.valid) return
    if (!tap.correct) {
      sounds.miss()
      update(ref(db, `games/${gameId}`), { [`vmFail${myKey}`]: cell }).catch(() => toast.error('MOVE FAILED — CHECK CONNECTION'))
      return
    }
    sentRef.current.clicked = tap.clicked
    sounds.step()
    const patch = { [`vmClicked${myKey}`]: tap.clicked }
    if (tap.done) {
      patch[`vmDone${myKey}`] = true
      // Recall time on the server clock: the tiebreak when both later slip evenly.
      patch[`vmTime${myKey}`] = me.time + Math.max(0, serverNow() - (startAt + revealMs))
    }
    update(ref(db, `games/${gameId}`), patch).catch(() => toast.error('MOVE FAILED — CHECK CONNECTION'))
  }

  // Out of recall time: whoever has not finished is counted as a slip (-1). Either
  // client may write it, once (CAS), which also covers an opponent who walked away.
  useEffect(() => {
    if (game.status !== 'playing' || recallEndsAt == null || now < recallEndsAt) return
    for (const k of ['X', 'O']) {
      if (!(game[`vmDone${k}`] ?? false) && (game[`vmFail${k}`] ?? null) == null) {
        runTransaction(ref(db, `games/${gameId}/vmFail${k}`), cur => (cur == null ? -1 : undefined)).catch(() => {})
      }
    }
  }, [now >= (recallEndsAt ?? Infinity), game.status, gameId]) // eslint-disable-line react-hooks/exhaustive-deps -- fires once when the recall window closes

  // Level outcome — every write is CAS-guarded so both clients can run this.
  const outcome = resolveLevelRace({
    doneX: game.vmDoneX ?? false, doneO: game.vmDoneO ?? false,
    failX: game.vmFailX ?? null, failO: game.vmFailO ?? null,
    progressX: normalizeVmArray(game.vmClickedX).length, progressO: normalizeVmArray(game.vmClickedO).length,
    timeX: game.vmTimeX ?? 0, timeO: game.vmTimeO ?? 0,
  })
  const outcomeKey = game.status === 'playing' && outcome.type !== 'pending'
    ? `${roundSig}:${outcome.type}:${outcome.winner ?? ''}` : null
  const resolvedRef = useRef(null)

  useEffect(() => {
    if (!outcomeKey || resolvedRef.current === outcomeKey) return
    resolvedRef.current = outcomeKey
    const run = async () => {
      if (outcome.type === 'win') {
        const { winner } = outcome
        const loser = winner === 'X' ? 'O' : 'X'
        let claimed = false
        await runTransaction(ref(db, `games/${gameId}/winner`), cur => {
          if (cur != null) return
          claimed = true
          return winner
        })
        if (!claimed) return
        const miss = game[`vmFail${loser}`]
        await update(ref(db, `games/${gameId}`), {
          status: 'finished',
          [`scores/${winner}`]: (game.scores?.[winner] || 0) + 1,
          vmMiss: miss != null && miss >= 0 ? { by: loser, cell: miss } : null,
        })
        return
      }
      // advance or replay: claim the level change with a CAS on the start stamp.
      const nextLevel = outcome.type === 'advance' ? level + 1 : level
      let claimed = false
      const nextStart = serverNow() + LEVEL_COUNTDOWN_MS
      await runTransaction(ref(db, `games/${gameId}/vmRoundStartedAt`), cur => {
        if ((cur ?? null) !== startAt) return
        claimed = true
        return nextStart
      })
      if (!claimed) return
      if (outcome.type === 'advance') sounds.go()
      await update(ref(db, `games/${gameId}`), buildVmDuelLevel(nextLevel, nextStart))
    }
    run().catch(() => toast.error('ROUND UPDATE FAILED — CHECK CONNECTION'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on outcomeKey (one per level outcome)
  }, [outcomeKey])

  const opName = (game.players?.[opKey]?.name || 'OPPONENT').toUpperCase()
  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    const miss = game.vmMiss ?? null
    const shown = seat(miss?.by ?? myKey)
    return (
      <div className="space-y-4">
        {pattern.length > 0 && (
          <VisualMemoryBoard
            onMove={() => {}}
            disabled
            vmPattern={pattern}
            vmClicked={shown.clicked}
            vmLevel={level}
            vmMiss={miss?.cell ?? null}
            finished
            reveal={false}
            mySymbol={mySymbol}
            hint={miss ? `${miss.by === myKey ? 'YOUR' : `${opName}'S`} SLIP — DASHED TILES WERE THE PATTERN` : 'OUT OF TIME — DASHED TILES WERE THE PATTERN'}
          />
        )}
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

  const recallLeft = recallEndsAt == null ? 0 : Math.max(0, Math.ceil((recallEndsAt - now) / 1000))
  const hint = !mySymbol
    ? (phase === 'recall' ? `X ${me.clicked.length}/${pattern.length} · O ${op.clicked.length}/${pattern.length}` : null)
    : me.fail != null ? `YOU SLIPPED — ${opName} MUST CLEAR LEVEL ${level} TO WIN`
      : me.done ? (opOut ? 'BOTH DONE' : `CLEARED! WAITING FOR ${opName}…`)
        : op.fail != null && phase === 'recall' ? `${opName} SLIPPED — CLEAR IT TO WIN · ${recallLeft}s`
          : phase === 'recall' ? `TAP THE TILES YOU SAW — ${me.clicked.length}/${pattern.length} · ${recallLeft}s`
            : null

  return (
    <div className="space-y-4">
      {!mySymbol && <SpectatorCard game={game} />}
      <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim">
        <span>{mySymbol ? 'ME' : 'X'} {me.clicked.length}/{pattern.length}{me.done ? ' ✓' : me.fail != null ? ' ✕' : ''}</span>
        <span>{mySymbol ? opName : 'O'} {op.clicked.length}/{pattern.length}{op.done ? ' ✓' : op.fail != null ? ' ✕' : ''}</span>
      </div>
      <div className="relative">
        <VisualMemoryBoard
          key={roundSig}
          onMove={handleTap}
          disabled={!mySymbol || myOut || phase !== 'recall'}
          vmPattern={pattern}
          vmClicked={me.clicked}
          vmLevel={level}
          vmMiss={me.fail != null && me.fail >= 0 ? me.fail : null}
          // The answer stays hidden until the level resolves, so a slipped player cannot
          // call it out to the other; the hint says what happened.
          finished={false}
          reveal={phase === 'reveal'}
          revealMsLeft={phase === 'reveal' ? startAt + revealMs - now : null}
          mySymbol={mySymbol}
          hint={hint}
        />
        {phase === 'countdown' && (
          <div className="absolute inset-0 bg-retro-bg/80 flex flex-col items-center justify-center gap-2 rounded z-10" role="status">
            <p className="font-pixel text-[9px] text-retro-dim tracking-widest">LEVEL {level} · GET READY</p>
            <p className="font-pixel text-3xl text-retro-cta text-glow-cta">{startAt == null ? '…' : Math.max(1, Math.ceil((startAt - now) / 1000))}</p>
          </div>
        )}
      </div>
      {!opponentOnline && mySymbol && <OfflineNotice label="OPPONENT" />}
    </div>
  )
}
