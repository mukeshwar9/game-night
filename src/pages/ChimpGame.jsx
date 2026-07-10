import { useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  normalizeChimpLayout, generateChimpLayout, CHIMP_START_LEVEL, CHIMP_GRID,
} from '../lib/chimpLogic'
import ChimpBoard from '../components/ChimpBoard'
import GameStatus from '../components/GameStatus'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'

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

  const myKey  = mySymbol === 'X' ? 'X' : 'O'
  const opKey  = myKey === 'X' ? 'O' : 'X'

  const myProgress = game[`chimpProgress${myKey}`] ?? 0
  const opProgress = game[`chimpProgress${opKey}`] ?? 0
  const myDone     = game[`chimpDone${myKey}`]     ?? false
  const opDone     = game[`chimpDone${opKey}`]     ?? false

  const prevDoneX = useRef(game.chimpDoneX ?? false)
  const prevDoneO = useRef(game.chimpDoneO ?? false)
  const claimingRef = useRef(false)  // prevents double-click on claim button

  // --- Opponent-idle claim ---
  // opIdleSinceRef is set to Date.now() in the effect body (safe — not during
  // render). Never initialized with Date.now() here to satisfy react-hooks/purity.
  const opIdleSinceRef = useRef(null)
  const [opIdleMs, setOpIdleMs] = useState(0)
  const claimEligible = game.status === 'playing' && !!mySymbol && myDone && !opDone

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
  }, [claimEligible, opProgress, opDone, level, myDone, game.status])

  const claimReady     = claimEligible && opIdleMs >= CLAIM_IDLE_MS
  const showClaimHint  = claimEligible && !claimReady && opIdleMs >= CLAIM_HINT_MS
  const claimCountdown = Math.max(1, Math.ceil((CLAIM_IDLE_MS - opIdleMs) / 1000))

  // Resolve the round in my favor.
  // Two-step write to avoid spreading ...current through a root transaction (which
  // would write players.O.playerId under X's auth.uid and fail the security rule):
  //   1. Narrow CAS on `winner` only — `players` is never in scope of this ref.
  //   2. Targeted update() for status + scores (same pattern as handleCellClick).
  // claimingRef prevents a second in-flight call while the first is pending.
  const claimIdleRound = async () => {
    if (claimingRef.current) return
    claimingRef.current = true
    try {
      // Local pre-condition re-check before any network call
      if (game.status !== 'playing' || !game[`chimpDone${myKey}`] || game[`chimpDone${opKey}`]) return
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
    } catch { toast.error('CLAIM FAILED — CHECK CONNECTION') }
    finally { claimingRef.current = false }
  }

  // When both players are done, one client advances the level.
  // Avoids spreading ...current through a root transaction (would re-write
  // players.O.playerId under the wrong auth.uid and fail the security rule).
  // Instead: CAS on chimpLevel (narrow ref, no players in scope) deduplicates
  // concurrent calls; targeted update() writes only the changed game fields.
  const tryAdvanceLevel = async () => {
    // Pre-condition from local state (watcher always has fresh values here)
    if (!(game.chimpDoneX ?? false) || !(game.chimpDoneO ?? false)) return
    const currentLevel = game.chimpLevel ?? CHIMP_START_LEVEL
    // Atomic CAS: only the first client to increment from currentLevel wins;
    // the second sees a different value and aborts.
    let claimed = false
    try {
      await runTransaction(ref(db, `games/${gameId}/chimpLevel`), lvl => {
        if ((lvl ?? CHIMP_START_LEVEL) !== currentLevel) return  // abort — already advanced
        claimed = true
        return currentLevel + 1
      })
    } catch { /* other client already advanced */ }
    if (!claimed) return
    const newLayout = generateChimpLayout(currentLevel + 1)
    try {
      await update(ref(db, `games/${gameId}`), {
        chimpLayout: newLayout,
        chimpProgressX: 0,
        chimpProgressO: 0,
        chimpDoneX: false,
        chimpDoneO: false,
      })
    } catch { /* layout update failed; level was already advanced */ }
  }

  // Also trigger from the watcher side (the player who finishes second)
  useEffect(() => {
    const doneX = game.chimpDoneX ?? false
    const doneO = game.chimpDoneO ?? false
    if (doneX && doneO && (!prevDoneX.current || !prevDoneO.current)) {
      tryAdvanceLevel()
    }
    prevDoneX.current = doneX
    prevDoneO.current = doneO
  }, [game.chimpDoneX, game.chimpDoneO])

  const handleCellClick = async (cellIndex) => {
    if (!mySymbol || myDone || game.status !== 'playing') return
    if (cellIndex < 0 || cellIndex >= CHIMP_GRID) return

    const expected = layout[myProgress]
    if (expected !== cellIndex) {
      sounds.lose()
      try {
        await update(ref(db, `games/${gameId}`), {
          winner: opKey,
          status: 'finished',
          [`scores/${opKey}`]: (game.scores?.[opKey] || 0) + 1,
        })
      } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
      return
    }

    sounds.move(mySymbol)
    const newProgress = myProgress + 1

    if (newProgress === level) {
      try {
        await update(ref(db, `games/${gameId}`), {
          [`chimpProgress${myKey}`]: newProgress,
          [`chimpDone${myKey}`]: true,
        })
        await tryAdvanceLevel()
      } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
    } else {
      try {
        await update(ref(db, `games/${gameId}`), { [`chimpProgress${myKey}`]: newProgress })
      } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
    }
  }

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
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
      <ChimpBoard
        onMove={handleCellClick}
        disabled={!mySymbol || myDone}
        chimpLayout={layout}
        myProgress={myProgress}
        opProgress={opProgress}
        myDone={myDone}
        opDone={opDone}
        chimpLevel={level}
      />
      {!opponentOnline && mySymbol && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">
          OPPONENT IS OFFLINE
        </p>
      )}
      {showClaimHint && (
        <p className="font-pixel text-[9px] text-retro-dim text-center animate-pulse">
          OPPONENT IDLE — CLAIM UNLOCKS IN {claimCountdown}s
        </p>
      )}
      {claimReady && (
        <button
          onClick={claimIdleRound}
          className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta active:scale-95"
        >
          CLAIM ROUND — OPPONENT IDLE
        </button>
      )}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
