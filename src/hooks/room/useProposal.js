import { useEffect, useRef } from 'react'
import { ref, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../../lib/firebase'
import { sounds } from '../../lib/sounds'

// Rematch / new-match / switch-game handshake for 2P rooms. With an opponent
// seated and online, an action becomes a `proposal` they accept or decline;
// alone (or with the opponent offline) it applies straight away through the
// caller's apply functions, which write the next round's state.
export default function useProposal({ game, gameId, mySymbol, opponentOnline, applyPlayAgain, applyNewMatch, applySwitchGame }) {
  const prevProposal = useRef(null)

  // Proposal effect — sound + declined toast
  useEffect(() => {
    if (!game) return
    const proposal = game.proposal ?? null

    // Opponent newly proposed — play join sound
    if (
      proposal &&
      !proposal.declined &&
      proposal.by !== mySymbol.current &&
      mySymbol.current &&
      !prevProposal.current
    ) {
      sounds.join()
    }

    // Opponent declined my proposal (guard: only on the transition to declined)
    if (
      proposal &&
      proposal.declined &&
      proposal.by === mySymbol.current &&
      !prevProposal.current?.declined
    ) {
      const opSym = mySymbol.current === 'X' ? 'O' : 'X'
      const opName = (game.players?.[opSym]?.name || opSym).toUpperCase()
      toast.error(`${opName} DECLINED`)
      update(ref(db, `games/${gameId}`), { proposal: null }).catch(() => {})
    }

    prevProposal.current = proposal
  }, [game, gameId, mySymbol])

  // Propose or apply directly (if solo / opponent offline)
  const propose = async (action, gameType = null) => {
    if (!game || !mySymbol.current) return
    if (!game.players?.O || opponentOnline === false) {
      if (action === 'playAgain') return applyPlayAgain()
      if (action === 'newMatch') return applyNewMatch()
      if (action === 'switch') return applySwitchGame(gameType)
    }
    try {
      await update(ref(db, `games/${gameId}`), {
        proposal: { action, gameType, by: mySymbol.current, declined: false },
      })
    } catch { toast.error('PROPOSAL FAILED — CHECK CONNECTION') }
  }

  const acceptProposal = async () => {
    if (!game?.proposal) return
    const { action, gameType: gt } = game.proposal
    if (action === 'playAgain') return applyPlayAgain()
    if (action === 'newMatch') return applyNewMatch()
    if (action === 'switch') return applySwitchGame(gt)
  }

  const declineProposal = async () => {
    try {
      await update(ref(db, `games/${gameId}`), { 'proposal/declined': true })
    } catch { toast.error('DECLINE FAILED — CHECK CONNECTION') }
  }

  const cancelProposal = async () => {
    try {
      await update(ref(db, `games/${gameId}`), { proposal: null })
    } catch { toast.error('CANCEL FAILED — CHECK CONNECTION') }
  }

  return { propose, acceptProposal, declineProposal, cancelProposal }
}
