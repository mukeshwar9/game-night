// Shared connection-status overlay for real-time games. Renders connecting /
// reconnecting / countdown / failed states identically across Pong, Snake,
// and the other real-time games, so each page doesn't re-paste ~18 lines.
//
// Mount it only while showRealtimeOverlay(conn, countdown) is true — the
// arenas dim + blur the court whenever an overlay element is passed.
//
// When the link is down AND the opponent's room presence is offline, it
// offers WAIT / CLAIM WIN (dropPrompt in connectionLogic.js) instead of
// leaving the player on a spinner until Game.jsx's 60 s abandon banner.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import PixelDots from '@/components/loading/PixelDots'
import useBusy from '@/hooks/useBusy'
import { dropPrompt } from './connectionLogic'
import { claimAbandonedRound } from './claimWin'

const btn = 'min-h-11 px-4 py-2 font-pixel text-[10px] rounded active:scale-95 disabled:opacity-50'

function RetryButton({ retry }) {
  return (
    <button
      onClick={() => retry()}
      className={`${btn} bg-retro-cta text-retro-bg hover:shadow-neon-cta`}
    >
      RETRY
    </button>
  )
}

/**
 * @param {object} p
 * @param {string} p.conn              peer status
 * @param {number} p.countdown         seconds left in the (re)start countdown
 * @param {() => void} p.retry
 * @param {string} [p.gameId]          with mySymbol + opponentOnline, enables the claim prompt
 * @param {'X'|'O'} [p.mySymbol]
 * @param {boolean} [p.opponentOnline] opponent's Firebase room presence
 */
export function RealtimeOverlay({ conn, countdown, retry, gameId, mySymbol, opponentOnline }) {
  // When the opponent went offline (drives the claim countdown), and a
  // ticking clock while they are — Date.now() can't be read during render.
  const [clock, setClock] = useState({ since: null, now: 0 })
  const offlineSince = clock.since
  const [dismissedFor, setDismissedFor] = useState(null)
  const [claiming, runClaim] = useBusy()

  const canPrompt = !!gameId && (mySymbol === 'X' || mySymbol === 'O')
  const opponentGone = canPrompt && opponentOnline === false && conn !== 'connected'

  useEffect(() => {
    const t = opponentOnline === false ? Date.now() : null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stamps the external presence transition; the timestamp is not derivable during render
    setClock({ since: t, now: t ?? 0 })
  }, [opponentOnline])

  useEffect(() => {
    if (!opponentGone) return
    const id = setInterval(() => setClock(c => ({ ...c, now: Date.now() })), 500)
    return () => clearInterval(id)
  }, [opponentGone])

  const prompt = canPrompt
    ? dropPrompt({ conn, opponentOnline, offlineSince, now: Math.max(clock.now, offlineSince ?? 0) })
    : { show: false }
  // WAIT hides the big prompt for this offline episode only.
  const dismissed = prompt.show && dismissedFor != null && dismissedFor === offlineSince

  const who = mySymbol === 'O' ? 'HOST' : 'OPPONENT'
  const claim = () => runClaim(async () => {
    const ok = await claimAbandonedRound(gameId, mySymbol)
    if (!ok) toast.error(`COULDN'T CLAIM — ${who} MAY BE BACK`)
  }, () => toast.error('CLAIM FAILED — CHECK CONNECTION'))
  const claimLabel = claiming
    ? 'CLAIMING…'
    : prompt.canClaim ? 'CLAIM WIN' : `CLAIM WIN IN ${Math.ceil((prompt.claimInMs ?? 0) / 1000)}`

  if (prompt.show && !dismissed) {
    return (
      <div role="alert" className="text-center space-y-3 px-4">
        <p className="font-pixel text-[10px] text-retro-p2 leading-relaxed">{who} DISCONNECTED</p>
        <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">
          GAME PAUSED · WAIT FOR THEM TO RETURN<br />OR CLAIM THIS ROUND
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setDismissedFor(offlineSince)}
            className={`${btn} border border-retro-border text-retro-text hover:border-retro-cta`}
          >
            WAIT
          </button>
          <button
            onClick={claim}
            disabled={!prompt.canClaim || claiming}
            className={`${btn} bg-retro-cta text-retro-bg hover:shadow-neon-cta`}
          >
            {claimLabel}
          </button>
        </div>
      </div>
    )
  }

  if (prompt.show) {
    return (
      <div className="text-center space-y-2 px-4">
        <p className="font-pixel text-[9px] text-retro-p2">WAITING FOR {who}…</p>
        <PixelDots size="sm" tone="p2" className="justify-center" />
        <button
          onClick={claim}
          disabled={!prompt.canClaim || claiming}
          className="min-h-11 px-3 font-pixel text-[8px] text-retro-dim hover:text-retro-cta disabled:opacity-50"
        >
          {claimLabel}
        </button>
      </div>
    )
  }

  if (conn === 'failed') {
    return (
      <div role="alert" className="text-center space-y-3 px-4">
        <p className="font-pixel text-[9px] text-retro-p2 leading-relaxed">
          CONNECTION FAILED<br />TRY A DIFFERENT NETWORK
        </p>
        <p className="font-pixel text-[8px] text-retro-dim">EITHER PLAYER CAN RETRY</p>
        <RetryButton retry={retry} />
      </div>
    )
  }
  if (conn === 'reconnecting') {
    return (
      <div role="status" className="text-center space-y-2 px-4">
        <p className="font-pixel text-[10px] text-retro-p2">RECONNECTING…</p>
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest">GAME PAUSED</p>
        <PixelDots size="sm" tone="p2" className="justify-center" />
      </div>
    )
  }
  if (conn !== 'connected') {
    return (
      <div className="text-center space-y-2">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest">LINKING PLAYERS</p>
        <PixelDots size="sm" tone="cta" className="justify-center" />
      </div>
    )
  }
  if (countdown > 0) {
    return <p className="font-pixel text-5xl text-retro-win text-glow-win">{countdown}</p>
  }
  return null
}
