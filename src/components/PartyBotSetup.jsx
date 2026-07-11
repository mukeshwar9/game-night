import Avatar from './Avatar'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'

// Reads the local player's display avatar the same way NavBar/Home do — the
// localStorage mirror of `users/{uid}` set on boot (see CLAUDE.md "Player
// identity") — falling back to the deterministic per-uid avatar when unset
// (e.g. a brand-new guest who hasn't been through onboarding yet).
function readOwnAvatar() {
  try {
    return localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  } catch {
    return defaultAvatarForId(getPlayerId())
  }
}

// Shared pre-game setup screen for solo/bot-count party demos (WAVELENGTH,
// FIBBAGE, SPYFAIR): pick how many bots fill the table, preview the roster,
// then START. Purely presentational/local — no Firebase, no useBusy (START
// is a synchronous local action, not an async write).
export default function PartyBotSetup({ title, blurb, botCount, onBotCount, roster, onStart, minBots = 2, maxBots = 7 }) {
  const totalPlayers = botCount + 1
  const myAvatar = readOwnAvatar()

  return (
    <div className="space-y-5 text-center py-6">
      <div className="space-y-1">
        <p className="font-pixel text-sm text-retro-cta text-glow-cta">{title}</p>
        {blurb && <p className="font-mono text-xs text-retro-dim leading-relaxed">{blurb}</p>}
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => onBotCount(botCount - 1)}
          disabled={botCount <= minBots}
          className="w-9 h-9 flex items-center justify-center font-pixel text-sm border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          aria-label="fewer bots"
        >
          −
        </button>
        <div className="min-w-[7.5rem]">
          <p className="font-pixel text-lg text-retro-text">{botCount} BOT{botCount === 1 ? '' : 'S'}</p>
          <p className="font-mono text-[10px] text-retro-dim">{totalPlayers} PLAYERS TOTAL</p>
        </div>
        <button
          type="button"
          onClick={() => onBotCount(botCount + 1)}
          disabled={botCount >= maxBots}
          className="w-9 h-9 flex items-center justify-center font-pixel text-sm border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          aria-label="more bots"
        >
          +
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 bg-retro-tint-p1 border border-retro-p1/50 rounded-full pl-1 pr-3 py-1">
          <Avatar id={myAvatar} size={22} />
          <span className="font-pixel text-[9px] text-retro-p1">YOU</span>
        </div>
        {(roster || []).map(bot => (
          <div key={bot.id} className="flex items-center gap-1.5 bg-retro-card border border-retro-border rounded-full pl-1 pr-3 py-1">
            <Avatar id={bot.avatar} size={22} />
            <span className="font-pixel text-[9px] text-retro-dim">{bot.name}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onStart}
        className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
      >
        START
      </button>
    </div>
  )
}
