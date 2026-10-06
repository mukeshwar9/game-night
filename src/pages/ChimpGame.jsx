import { useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { serverNow } from '../lib/serverClock'
import { LEVEL_COUNTDOWN_MS } from '../lib/levelRaceLogic'
import {
  normalizeChimpLayout, CHIMP_START_LEVEL,
  evaluateChimpTap, buildChimpAdvance, resolveChimpLevel, buildChimpReplay,
} from '../lib/chimpLogic'
import ChimpBoard from '../components/ChimpBoard'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'

// Opponent-idle claim: presence only catches real disconnects, so an opponent
// who is online but walked away would leave me waiting forever. After I finish
// my level, if their state hasn't changed for this long I may claim the round.
const CLAIM_IDLE_MS = 45000
const CLAIM_HINT_MS = 30000  // show the countdown hint this far in

export default function ChimpGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const layout = normalizeChimpLayout(game.chimpLayout)
  const level   = game.chimpLevel ?? CHIMP_START_LEVEL

  // Spectators follow X's board (labelled X/O rather than ME/OP).
  const myKey  = mySymbol === 'O' ? 'O' : 'X'
  const opKey  = myKey === 'X' ? 'O' : 'X'

  const myProgress = game[`chimpProgress${myKey}`] ?? 0
  const opProgress = game[`chimpProgress${opKey}`] ?? 0
  const myDone     = game[`chimpDone${myKey}`]     ?? false
  const opDone     = game[`chimpDone${opKey}`]     ?? false
  // A slip records the wrong cell; the level still waits for the other player.
  const myFail     = game[`chimpFail${myKey}`]     ?? null
  const opFail     = game[`chimpFail${opKey}`]     ?? null
  const myOut      = myDone || myFail != null
  const opOut      = opDone || opFail != null

  // Start round 1's memorize clock when the room actually starts playing (join, lobby
  // START, play again), not when it was created — otherwise the numbers had already
  // expired for both players by the time O joined. First client to see it wins.
  useEffect(() => {
    if (game.status !== 'playing' || game.chimpRoundStartedAt != null) return
    runTransaction(ref(db, `games/${gameId}/chimpRoundStartedAt`), cur => cur ?? serverNow() + LEVEL_COUNTDOWN_MS).catch(() => {})
  }, [gameId, game.status, game.chimpRoundStartedAt])

  // Taps land faster than the Firebase echo re-renders myProgress, so the next tap
  // would be judged against stale progress and count as a mis-tap. Track the last
  // progress this client sent, per round.
  const roundSig = `${level}:${layout.join(',')}`
  const sentRef = useRef({ sig: null, progress: 0, busy: false })

  const resolvedRef = useRef(null) // the level outcome this client already acted on
  const [claimBusy, runClaim] = useBusy()

  // --- Opponent-idle claim ---
  // opIdleSinceRef is set to Date.now() in the effect body (safe — not during
  // render). Never initialized with Date.now() here to satisfy react-hooks/purity.
  const opIdleSinceRef = useRef(null)
  const [opIdleMs, setOpIdleMs] = useState(0)
  // Finished my level (cleared or slipped) while the opponent, online but idle, has not.
  const claimEligible = game.status === 'playing' && !!mySymbol && myOut && !opOut

  // Single combined effect: restarts on any relevant state change, recording the
  // new session start time via a ref and resetting the display state via a
  // setTimeout callback (async — avoids react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!claimEligible) return
    opIdleSinceRef.current = Date.now()
    // Reset display asynchronously so we don't call setState synchronously in the
    // effect body — the timeout fires on the next event-loop tick before any paint.
    const reset = setTimeout(() => setOpIdleMs(0), 0)
    const interval = setInterval(() => {
      if (opIdleSinceRef.current != null) {
        setOpIdleMs(Date.now() - opIdleSinceRef.current)
      }
    }, 1000)
    return () => { clearTimeout(reset); clearInterval(interval) }
  }, [claimEligible, opProgress, opDone, opFail, level, myDone, myFail, game.status])

  const claimReady     = claimEligible && opIdleMs >= CLAIM_IDLE_MS
  const showClaimHint  = claimEligible && !claimReady && opIdleMs >= CLAIM_HINT_MS
  const claimCountdown = Math.max(1, Math.ceil((CLAIM_IDLE_MS - opIdleMs) / 1000))

  // Resolve the round in my favor.
  // Two-step write to avoid spreading ...current through a root transaction (which
  // would write players.O.playerId under X's auth.uid and fail the security rule):
  //   1. Narrow CAS on `winner` only — `players` is never in scope of this ref.
  //   2. Targeted update() for status + scores (same pattern as handleCellClick).
  // useBusy's synchronous guard prevents a second in-flight call while the first
  // is pending (and drives the CLAIMING… button state).
  // I slipped and the opponent stopped playing: their level ends where they are, as
  // a slip with no wrong cell, and the progress tiebreak settles the round.
  const endIdleLevel = () => runClaim(async () => {
    if (game.status !== 'playing' || game[`chimpFail${myKey}`] == null || game[`chimpDone${opKey}`]) return
    await runTransaction(ref(db, `games/${gameId}/chimpFail${opKey}`), cur => (cur == null ? -1 : undefined))
  }, () => toast.error('CLAIM FAILED — CHECK CONNECTION'))

  const claimIdleRound = () => runClaim(async () => {
    // Local pre-condition re-check before any network call
    if (game.status !== 'playing' || !game[`chimpDone${myKey}`] || game[`chimpDone${opKey}`]) return
    if (game[`chimpFail${opKey}`] != null) return
    // Atomic CAS: only write winner if the slot is still empty
    let claimed = false
    await runTransaction(ref(db, `games/${gameId}/winner`), currentWinner => {
      if (currentWinner != null) return  // abort — already resolved
      claimed = true
      return myKey
    })
    if (!claimed) return  // opponent finished at the same instant — no-op
    await update(ref(db, `games/${gameId}`), {
      status: 'finished',
      [`scores/${myKey}`]: (game.scores?.[myKey] || 0) + 1,
    })
  }, () => toast.error('CLAIM FAILED — CHECK CONNECTION'))

  // When both players are done, one client advances the level. The whole
  // patch (level + fresh layout + reset progress/done) is written in a
  // single update() call so it lands atomically — no window where chimpLevel
  // has moved on but chimpLayout/progress/done still describe the old round
  // (that mismatch previously meant `layout[progress]` pointed past the new,
  // shorter/older array and both players insta-lost next round).
  // Deduplication across the two clients calling this concurrently is via a
  // CAS on chimpLevel first: only the client that wins the CAS proceeds to
  // write the round patch, so at most one patch is written per advance.
  const tryAdvanceLevel = async () => {
    // Pre-condition from local state (watcher always has fresh values here)
    if (!(game.chimpDoneX ?? false) || !(game.chimpDoneO ?? false)) return
    const currentLevel = game.chimpLevel ?? CHIMP_START_LEVEL
    let claimed = false
    try {
      await runTransaction(ref(db, `games/${gameId}/chimpLevel`), lvl => {
        if ((lvl ?? CHIMP_START_LEVEL) !== currentLevel) return  // abort — already advanced
        claimed = true
        return currentLevel + 1
      })
    } catch { /* other client already advanced */ }
    if (!claimed) return
    try {
      await update(ref(db, `games/${gameId}`), {
        ...buildChimpAdvance(currentLevel),
        chimpRoundStartedAt: serverNow() + LEVEL_COUNTDOWN_MS,
      })
    } catch {
      // The round patch failed to land after the level CAS succeeded — revert
      // the level so the game doesn't sit on an advanced level with the old
      // round's layout/progress/done still in place (the insta-lose bug).
      try {
        await runTransaction(ref(db, `games/${gameId}/chimpLevel`), lvl =>
          lvl === currentLevel + 1 ? currentLevel : undefined)
      } catch { /* best-effort revert */ }
      toast.error('ROUND ADVANCE FAILED — CHECK CONNECTION')
    }
  }

  // The level resolves once both players have an outcome (resolveChimpLevel). Every
  // write below is guarded by a CAS, so both clients can run this safely.
  const outcome = resolveChimpLevel({
    doneX: game.chimpDoneX ?? false, doneO: game.chimpDoneO ?? false,
    failX: game.chimpFailX ?? null, failO: game.chimpFailO ?? null,
    progressX: game.chimpProgressX ?? 0, progressO: game.chimpProgressO ?? 0,
    timeX: game.chimpTimeX ?? 0, timeO: game.chimpTimeO ?? 0,
  })
  const outcomeKey = game.status === 'playing' && outcome.type !== 'pending'
    ? `${roundSig}:${outcome.type}:${outcome.winner ?? ''}` : null

  const resolveWin = async (winner) => {
    const loser = winner === 'X' ? 'O' : 'X'
    let claimed = false
    await runTransaction(ref(db, `games/${gameId}/winner`), currentWinner => {
      if (currentWinner != null) return  // abort — already resolved
      claimed = true
      return winner
    })
    if (!claimed) return
    const miss = game[`chimpFail${loser}`]
    await update(ref(db, `games/${gameId}`), {
      status: 'finished',
      [`scores/${winner}`]: (game.scores?.[winner] || 0) + 1,
      // The end screen shows the loser's board with the slip marked.
      chimpMiss: miss != null && miss >= 0 ? { by: loser, cell: miss } : null,
    })
  }

  const replayLevel = async () => {
    const started = game.chimpRoundStartedAt ?? null
    let claimed = false
    await runTransaction(ref(db, `games/${gameId}/chimpRoundStartedAt`), cur => {
      if ((cur ?? null) !== started) return  // abort — another client already replayed
      claimed = true
      return serverNow() + LEVEL_COUNTDOWN_MS
    })
    if (!claimed) return
    await update(ref(db, `games/${gameId}`), buildChimpReplay(level))
  }

  useEffect(() => {
    if (!outcomeKey || resolvedRef.current === outcomeKey) return
    resolvedRef.current = outcomeKey
    const act = outcome.type === 'advance' ? tryAdvanceLevel()
      : outcome.type === 'win' ? resolveWin(outcome.winner)
        : replayLevel()
    Promise.resolve(act).catch(() => toast.error('ROUND UPDATE FAILED — CHECK CONNECTION'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on outcomeKey (one per level outcome); the actions read fresh state from this render
  }, [outcomeKey])

  const handleCellClick = async (cellIndex) => {
    if (sentRef.current.sig !== roundSig) sentRef.current = { sig: roundSig, progress: 0, busy: false }
    if (!mySymbol || myOut || game.status !== 'playing' || sentRef.current.busy) return

    const progress = Math.max(myProgress, sentRef.current.progress)
    const tap = evaluateChimpTap({ layout, progress, level, cellIndex })
    if (!tap.valid) return

    if (!tap.correct) {
      // A slip ends my level, not the round: the opponent still has to clear it.
      sentRef.current.busy = true
      sounds.miss()
      try {
        await update(ref(db, `games/${gameId}`), { [`chimpFail${myKey}`]: cellIndex })
      } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
      finally { sentRef.current.busy = false }
      return
    }

    sentRef.current.progress = tap.newProgress
    sounds.move(mySymbol)

    if (tap.done) {
      try {
        // Clear time (server clock, from the shared round start) breaks a tie
        // when both players later slip on the same level with equal progress.
        const startedAt = game.chimpRoundStartedAt ?? serverNow()  // the reveal's start (after the countdown)
        await update(ref(db, `games/${gameId}`), {
          [`chimpProgress${myKey}`]: tap.newProgress,
          [`chimpDone${myKey}`]: true,
          [`chimpTime${myKey}`]: (game[`chimpTime${myKey}`] ?? 0) + Math.max(0, serverNow() - startedAt),
        })
      } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
    } else {
      try {
        await update(ref(db, `games/${gameId}`), { [`chimpProgress${myKey}`]: tap.newProgress })
      } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
    }
  }

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    const miss = game.chimpMiss ?? null
    return (
      <div className="space-y-4">
        {layout.length > 0 && (
          <ChimpBoard
            key={`reveal-${level}-${layout.join(',')}`}
            onMove={() => {}}
            disabled
            reveal
            // Show the board of whoever missed (their progress and wrong tile).
            missCell={miss?.cell ?? null}
            chimpLayout={layout}
            myProgress={game[`chimpProgress${miss?.by ?? myKey}`] ?? 0}
            opProgress={game[`chimpProgress${(miss?.by ?? myKey) === 'X' ? 'O' : 'X'}`] ?? 0}
            myDone={false}
            opDone={false}
            chimpLevel={level}
            spectating={!mySymbol || (miss != null && miss.by !== myKey)}
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

  return (
    <div className="space-y-4">
      {!mySymbol && <SpectatorCard game={game} />}
      {mySymbol && myFail != null && !opOut && (
        <p className="font-pixel text-[9px] text-center text-retro-danger leading-relaxed" role="status">
          YOU SLIPPED — {(game.players?.[opKey]?.name || 'OPPONENT').toUpperCase()} MUST CLEAR LEVEL {level} TO WIN
        </p>
      )}
      {mySymbol && opFail != null && !myOut && (
        <p className="font-pixel text-[9px] text-center text-retro-win text-glow-win leading-relaxed" role="status">
          {(game.players?.[opKey]?.name || 'OPPONENT').toUpperCase()} SLIPPED — CLEAR THIS LEVEL TO WIN
        </p>
      )}
      <ChimpBoard
        // Remount per round so the memorize countdown (and its local-fallback
        // start-time ref) resets cleanly instead of needing derived-state
        // reconciliation inside the board component.
        key={`${level}-${layout.join(',')}`}
        onMove={handleCellClick}
        disabled={!mySymbol || myOut}
        // The layout stays hidden from a slipped player until the level resolves, so
        // they cannot call the numbers out to the other player.
        reveal={false}
        chimpLayout={layout}
        myProgress={myProgress}
        opProgress={opProgress}
        myDone={myDone}
        opDone={opDone}
        chimpLevel={level}
        roundStartedAt={game.chimpRoundStartedAt ?? null}
        spectating={!mySymbol}
      />
      {!opponentOnline && mySymbol && <OfflineNotice label="OPPONENT" />}
      {showClaimHint && (
        <p className="font-pixel text-[9px] text-retro-dim text-center arcade-blink">
          OPPONENT IDLE — CLAIM UNLOCKS IN {claimCountdown}s
        </p>
      )}
      {claimReady && (
        <button
          onClick={myFail != null ? endIdleLevel : claimIdleRound}
          disabled={claimBusy}
          className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta press disabled:opacity-50 disabled:cursor-default"
        >
          {claimBusy ? 'CLAIMING…' : myFail != null ? 'END LEVEL — OPPONENT IDLE' : 'CLAIM ROUND — OPPONENT IDLE'}
        </button>
      )}
      {/* No in-play SWITCH GAME: the room header's switch icon covers it
          mid-match, and the end screen (GameStatus) keeps the full button. */}
    </div>
  )
}
