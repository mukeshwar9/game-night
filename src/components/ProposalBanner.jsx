import { useState } from 'react'
import { toast } from 'sonner'
import { getGameConfig } from '../lib/games'
import PixelDots from './loading/PixelDots'
import useBusy from '../hooks/useBusy'

function actionLabel(proposal) {
  if (proposal.action === 'playAgain') return 'PLAY AGAIN'
  if (proposal.action === 'newMatch') return 'A NEW MATCH'
  if (proposal.action === 'switch') return `SWITCH TO ${getGameConfig(proposal.gameType).label}`
  return proposal.action
}

function firstMoverLabel(proposal, players) {
  if (proposal.goesFirst === 'random') return 'RANDOM STARTS'
  if (proposal.goesFirst === 'X' || proposal.goesFirst === 'O') {
    const name = (players?.[proposal.goesFirst]?.name || proposal.goesFirst).toUpperCase()
    return `${name} STARTS`
  }
  return null
}

export default function ProposalBanner({ proposal, mySymbol, players, onAccept, onDecline, onCancel }) {
  const [busy, run] = useBusy()
  const [tapped, setTapped] = useState(null)

  if (!proposal) return null

  const opponentSym = proposal.by === 'X' ? 'O' : 'X'
  const proposerName = (players?.[proposal.by]?.name || proposal.by).toUpperCase()
  const label = actionLabel(proposal)
  const whoStarts = firstMoverLabel(proposal, players)

  const isProposer = proposal.by === mySymbol
  const isRecipient = mySymbol && !isProposer
  const isSpectator = !mySymbol

  const handle = (action, fn) => {
    setTapped(action)
    run(fn, () => toast.error("COULDN'T UPDATE — CHECK CONNECTION")).finally(() => setTapped(null))
  }

  return (
    <div className="border-2 border-retro-cta/50 bg-retro-card rounded p-3 text-center space-y-2">
      {isProposer && (
        <>
          <PixelDots size="sm" tone="cta" className="justify-center" />
          <p className="font-pixel text-[10px] text-retro-cta arcade-blink">
            WAITING FOR {((players?.[opponentSym]?.name) || opponentSym).toUpperCase()}…
          </p>
          <button
            onClick={() => handle('cancel', onCancel)}
            disabled={busy}
            className="border border-retro-border text-retro-dim font-pixel text-[10px] px-4 py-2 rounded disabled:opacity-50"
          >
            {tapped === 'cancel' ? 'CANCELLING…' : 'CANCEL'}
          </button>
        </>
      )}
      {isRecipient && (
        <>
          <p className="font-pixel text-[10px] text-retro-text leading-relaxed">
            {proposerName} WANTS TO {label}
          </p>
          {whoStarts && (
            <p className="font-pixel text-[9px] text-retro-cta">{whoStarts}</p>
          )}
          <div className="flex justify-center gap-2">
            <button
              onClick={() => handle('accept', onAccept)}
              disabled={busy}
              className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
            >
              {tapped === 'accept' ? 'ACCEPTING…' : 'ACCEPT'}
            </button>
            <button
              onClick={() => handle('decline', onDecline)}
              disabled={busy}
              className="border border-retro-danger text-retro-danger font-pixel text-[10px] px-4 py-2 rounded hover:shadow-neon-danger disabled:opacity-50"
            >
              {tapped === 'decline' ? 'DECLINING…' : 'DECLINE'}
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
