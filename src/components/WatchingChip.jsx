// "N WATCHING" — how many spectators have the room open right now (live
// `spectators/{uid}` presence, one entry per connection). Hidden at zero.
export default function WatchingChip({ count }) {
  if (!count) return null
  return (
    <span
      className="game-header-meta inline-flex items-center gap-1 font-pixel text-[8px] text-retro-dim border border-retro-border px-2 py-0.5 rounded"
      aria-label={`${count} watching`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" />
      </svg>
      {count} WATCHING
    </span>
  )
}
