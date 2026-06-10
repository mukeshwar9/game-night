import { toast } from 'sonner'

export default function WaitingRoom({ gameId }) {
  const shareUrl = `${window.location.origin}/game/${gameId}`

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

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-retro-cta animate-bounce shadow-neon-cta"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
      <div className="text-center space-y-1">
        <p className="font-pixel text-xs text-retro-text">WAITING FOR OPPONENT</p>
        <p className="font-mono text-xs text-retro-dim">share the link to invite a friend</p>
      </div>
      <div className="w-full bg-retro-card border border-retro-border rounded p-3 flex items-center gap-2">
        <p className="text-retro-dim text-xs font-mono truncate flex-1">{shareUrl}</p>
        <button
          onClick={copyLink}
          className="flex-shrink-0 px-3 py-1.5 bg-retro-cta text-retro-bg
            font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95"
        >
          COPY
        </button>
      </div>
      <p className="font-pixel text-[10px] text-retro-dim">
        CODE: <span className="text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
      </p>
    </div>
  )
}
