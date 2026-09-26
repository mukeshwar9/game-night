import { Link } from 'react-router-dom'

// Shared dead-end screen (404, room not found, broken room): a clear title,
// one plain-language line, and always a way forward — never bare text.
export default function DeadEnd({ title, message, primary, secondary }) {
  return (
    <div className="min-h-[70vh] bg-retro-bg flex flex-col items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm bg-retro-card border border-retro-border rounded p-6 text-center space-y-4">
        <p className="font-pixel text-sm text-retro-text tracking-wider">{title}</p>
        {message && <p className="font-mono text-sm text-retro-dim leading-relaxed">{message}</p>}
        <div className="flex flex-col gap-2 pt-1">
          {primary}
          {secondary ?? (
            <Link to="/" className="min-h-11 flex items-center justify-center border border-retro-border rounded font-pixel text-[10px] tracking-widest text-retro-text hover:border-retro-p1">
              BACK TO HOME
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export const deadEndPrimaryClass = 'min-h-12 flex items-center justify-center bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-widest rounded hover:shadow-neon-cta transition-all active:scale-[0.98] disabled:opacity-50'
