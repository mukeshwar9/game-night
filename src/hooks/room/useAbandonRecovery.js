import { useEffect, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../../lib/firebase'
import { getGameConfig } from '../../lib/games'
import { isSeatOnline } from '../../lib/presenceLogic'

// Abandoned-opponent recovery (F-23) — after 120s of CONTINUOUS opponent
// offline time in a standard 2P turn-based round, offer claim-win / invite
// / go-home instead of leaving the board interactive forever. Restarts the
// window (not cumulative) on any presence flap, and clears on every
// status/gameType change (round end, rematch, switch) so it never fires stale.
// An opponent who tapped LEAVE (`opponentLeft`, a `leftAt` marker on their
// presence) gets no grace window — the banner shows straight away.
export default function useAbandonRecovery({ game, gameId, mySymbol, opponentOnline, opponentLeft = false }) {
  const [showAbandonBanner, setShowAbandonBanner] = useState(false)
  const [claimingWin, setClaimingWin] = useState(false)
  const abandonTimerRef = useRef(null)

  const hasPlayerX = !!game?.players?.X
  const hasPlayerO = !!game?.players?.O
  useEffect(() => {
    if (abandonTimerRef.current) { clearTimeout(abandonTimerRef.current); abandonTimerRef.current = null }
    // Reset is intentionally synchronous and unconditional here — it must
    // clear on every dep change (round end, rematch, switch) before the
    // guards below decide whether to re-arm the timer, so a stale banner
    // never lingers into a new round.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowAbandonBanner(false)

    if (!game || !mySymbol.current) return
    const gcfg = getGameConfig(game.gameType)
    // Co-op partners never claim a win from each other; the co-op page lets
    // the online partner keep playing instead.
    if (gcfg.nPlayer || gcfg.coop) return
    if (game.status !== 'playing') return
    const opSym = mySymbol.current === 'X' ? 'O' : 'X'
    if (!game.players?.[opSym]) return
    if (opponentOnline) return
    if (opponentLeft) {
      setShowAbandonBanner(true)
      return
    }

    // Custom real-time games (Pong/Sumo/Pac-Mac) use a shorter window: a
    // vanished peer freezes the round outright, and without this banner the
    // guest's only exit is self-forfeit — which rewards the vanished player.
    abandonTimerRef.current = setTimeout(() => setShowAbandonBanner(true), gcfg.custom ? 60_000 : 120_000)
    return () => {
      if (abandonTimerRef.current) { clearTimeout(abandonTimerRef.current); abandonTimerRef.current = null }
    }
    // `game` is deliberately omitted — depending on the whole object would
    // restart this 120s window on every move/turn flip, not just on the
    // gameType/status/presence transitions that should actually reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.gameType, game?.status, opponentOnline, opponentLeft, hasPlayerX, hasPlayerO])

  // F-23 claim-win — same finish shape as a normal round win (winner + score
  // bump on the standard `games/{id}` node), so the existing win-effect/
  // recordMatch machinery fires on both clients unmodified. Wrapped in a
  // transaction that re-reads status/presence server-side so a last-second
  // reconnect-and-move from the opponent can't be clobbered.
  const claimAbandonedWin = async () => {
    if (!game || !mySymbol.current || claimingWin) return
    const mySym = mySymbol.current
    const opSym = mySym === 'X' ? 'O' : 'X'
    setClaimingWin(true)
    try {
      const { committed } = await runTransaction(ref(db, `games/${gameId}`), cur => {
        if (!cur || cur.status !== 'playing') return
        // Per-connection presence: offline only once every one of the
        // opponent's connections is gone (a closed second tab or a late
        // onDisconnect leaves the legacy flag false while they're present).
        const presenceOp = cur.presence?.[opSym]
        const stillOffline = !!presenceOp && !isSeatOnline(presenceOp)
        if (!stillOffline) return
        return {
          ...cur,
          winner: mySym,
          status: 'finished',
          scores: { ...(cur.scores || {}), [mySym]: (cur.scores?.[mySym] || 0) + 1 },
          lastActivityAt: Date.now(),
        }
      })
      if (!committed) toast.error("COULDN'T CLAIM — OPPONENT MAY BE BACK")
    } catch { toast.error('CLAIM FAILED — CHECK CONNECTION') }
    finally { setClaimingWin(false) }
  }

  return { showAbandonBanner, claimingWin, claimAbandonedWin }
}
