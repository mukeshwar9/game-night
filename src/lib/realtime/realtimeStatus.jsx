// Shared connection-status overlay for real-time games. Renders connecting /
// countdown / failed states identically across Pong, Snake, and the new
// real-time games, so each page doesn't re-paste ~18 lines.
import ArcadeLoader from '@/components/ArcadeLoader'

export function RealtimeOverlay({ conn, countdown, retry }) {
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
    return <ArcadeLoader variant="realtime" />
  }
  if (countdown > 0) {
    return <p className="font-pixel text-5xl text-retro-win text-glow-win">{countdown}</p>
  }
  return null
}