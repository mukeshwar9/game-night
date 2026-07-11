// Shared connection-status overlay for real-time games. Renders connecting /
// reconnecting / countdown / failed states identically across Pong, Snake,
// and the new real-time games, so each page doesn't re-paste ~18 lines.
import { useEffect, useState } from 'react'
import ArcadeLoader from '@/components/ArcadeLoader'
import PixelDots from '@/components/loading/PixelDots'

export function RealtimeOverlay({ conn, countdown, retry }) {
  // Tracks whether this mount has ever reached 'connected' — distinguishes a
  // first-time connect (INSERT COIN is start-up language, fine) from a
  // mid-game drop (needs recovery copy, never start-up copy).
  const [everConnected, setEverConnected] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way ratchet driven by the external RTC peer's status, not derivable from this render's props alone
    if (conn === 'connected') setEverConnected(true)
  }, [conn])

  if (conn === 'failed') {
    return (
      <div className="text-center space-y-3 px-4">
        <p className="font-pixel text-[9px] text-retro-p2 leading-relaxed">
          CONNECTION FAILED<br />TRY A DIFFERENT NETWORK
        </p>
        <button
          onClick={() => retry()}
          className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
        >
          RETRY
        </button>
      </div>
    )
  }
  if (conn !== 'connected') {
    if (everConnected) {
      return (
        <div className="text-center space-y-2 px-4">
          <p className="font-pixel text-[9px] text-retro-p2">SIGNAL LOST — RECONNECTING</p>
          <PixelDots size="sm" tone="p2" className="justify-center" />
        </div>
      )
    }
    return (
      <div className="text-center space-y-2">
        <ArcadeLoader variant="realtime" />
        <p className="font-pixel text-[7px] text-retro-dim tracking-widest">LINKING PLAYERS</p>
      </div>
    )
  }
  if (countdown > 0) {
    return <p className="font-pixel text-5xl text-retro-win text-glow-win">{countdown}</p>
  }
  return null
}