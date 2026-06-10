import { getGameConfig } from '../lib/games'

function actionLabel(proposal) {
  if (proposal.action === 'playAgain') return 'PLAY AGAIN'
  if (proposal.action === 'newMatch') return 'A NEW MATCH'
  if (proposal.action === 'switch') return `SWITCH TO ${getGameConfig(proposal.gameType).label}`
  return proposal.action
}

export default function ProposalBanner({ proposal, mySymbol, players, onAccept, onDecline, onCancel }) {
  if (!proposal) return null

  const opponentSym = proposal.by === 'X' ? 'O' : 'X'
  const proposerName = (players?.[proposal.by]?.name || proposal.by).toUpperCase()
  const label = actionLabel(proposal)

  const isProposer = proposal.by === mySymbol
  const isRecipient = mySymbol && !isProposer
  const isSpectator = !mySymbol

  return (
    <div className="border-2 border-retro-cta/50 bg-retro-card rounded p-3 text-center space-y-2">
      {isProposer && (
        <>
          <p className="font-pixel text-[10px] text-retro-cta animate-pulse">
            WAITING FOR {((players?.[opponentSym]?.name) || opponentSym).toUpperCase()}…
          </p>
          <button
            onClick={onCancel}
            className="border border-retro-border text-retro-dim font-pixel text-[10px] px-4 py-2 rounded"
          >
            CANCEL
          </button>
        </>
      )}
      {isRecipient && (
        <>
          <p className="font-pixel text-[10px] text-retro-text leading-relaxed">
            {proposerName} WANTS TO {label}
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={onAccept}
              className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
            >
              ACCEPT
            </button>
            <button
              onClick={onDecline}
              className="border border-retro-p2 text-retro-p2 font-pixel text-[10px] px-4 py-2 rounded hover:shadow-neon-p2"
            >
              DECLINE
            </button>
          </div>
        </>
      )}
      {isSpectator && (
        <p className="font-pixel text-[10px] text-retro-dim">
          {proposerName} PROPOSED {label}
        </p>
      )}
    </div>
  )
}
