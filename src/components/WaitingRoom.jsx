import { toast } from 'sonner'
import { getGameConfig } from '../lib/games'
import QrCode from './QrCode'

export default function WaitingRoom({ gameId, gameType }) {
  const shareUrl = `${window.location.origin}/game/${gameId}`
  const label = getGameConfig(gameType)?.label

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const el = document.createElement('textarea')
      el.value = shareUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    toast.success('Link copied!')
  }

  const shareInvite = async () => {
    const data = { title: 'Game Night', text: 'Join my Game Night room!', url: shareUrl }
    if (navigator.share) {
      try { await navigator.share(data); return } catch { /* cancelled — ignore */ }
    }
    copyLink()
  }

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      {/* Bouncing dots */}
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-retro-cta animate-bounce shadow-neon-cta"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>

      {/* Status text + game label */}
      <div className="text-center space-y-1">
        <p className="font-pixel text-xs text-retro-text">WAITING FOR OPPONENT</p>
        {label && (
          <p className="font-pixel text-[10px] text-retro-dim">· {label} ·</p>
        )}
        <p className="font-mono text-xs text-retro-dim">share the link to invite a friend</p>
      </div>

      {/* QR code */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="bg-white p-2 rounded">
          <QrCode value={shareUrl} size={150} />
        </div>
        <p className="font-pixel text-[9px] text-retro-dim">SCAN TO JOIN</p>
      </div>

      {/* Share + Copy buttons */}
      <div className="flex gap-2">
        <button
          onClick={shareInvite}
          className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded
            hover:shadow-neon-cta transition-all active:scale-95 shadow-neon-cta"
        >
          SHARE
        </button>
        <button
          onClick={copyLink}
          className="px-4 py-2 bg-retro-card border border-retro-border text-retro-dim
            font-pixel text-[10px] rounded hover:text-retro-text hover:border-retro-p1
            transition-all active:scale-95"
        >
          COPY
        </button>
      </div>

      {/* URL row */}
      <div className="w-full bg-retro-card border border-retro-border rounded p-3 flex items-center gap-2">
        <p className="text-retro-dim text-xs font-mono truncate flex-1">{shareUrl}</p>
      </div>

      {/* Room code */}
      <p className="font-pixel text-[10px] text-retro-dim">
        CODE: <span className="text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
      </p>
    </div>
  )
}
