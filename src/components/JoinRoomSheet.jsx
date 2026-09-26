import BottomSheet from './BottomSheet'

export default function JoinRoomSheet({ code, onChange, onJoin, onClose, error = null, busy = false }) {
  return (
    <BottomSheet onClose={onClose} ariaLabel="Join a game room" className="space-y-4">
      <div>
        <p className="font-pixel text-[11px] text-retro-cta tracking-widest">JOIN A ROOM</p>
        <p className="font-mono text-xs text-retro-dim mt-1">Enter the six-character code your friend shared.</p>
      </div>
      <label className="block">
        <span className="font-pixel text-[9px] text-retro-dim tracking-wider">ROOM CODE</span>
        <input
          autoFocus
          type="text"
          value={code}
          onChange={e => onChange(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && onJoin()}
          maxLength={6}
          placeholder="ABC123"
          aria-invalid={!!error}
          aria-describedby={error ? 'join-code-error' : undefined}
          autoCapitalize="characters"
          autoComplete="off"
          className={`mt-1 w-full min-h-12 bg-retro-card border-2 ${error ? 'border-retro-danger' : 'border-retro-border'} text-retro-p1
            font-mono text-base tracking-[0.3em] placeholder-retro-dim rounded px-3 py-2
            focus:outline-none focus:border-retro-p1 transition-colors`}
        />
      </label>
      {error && <p id="join-code-error" role="alert" className="font-pixel text-[9px] text-retro-danger tracking-wider leading-relaxed -mt-2">{error}</p>}
      <button
        onClick={onJoin}
        disabled={busy}
        className="w-full min-h-12 flex items-center justify-center bg-retro-cta text-retro-bg disabled:opacity-60
          font-pixel text-[10px] tracking-widest rounded hover:shadow-neon-cta transition-all active:scale-[0.98]"
      >
        {busy ? 'CHECKING…' : 'JOIN ROOM'}
      </button>
    </BottomSheet>
  )
}
