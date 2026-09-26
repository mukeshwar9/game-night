import { getGameConfig } from '../../lib/games'
import { Link } from 'react-router-dom'
import { PARTY_BLURB } from './partyBlurbs'

// ─── Party game card ──────────────────────────────────────────────────────────

export default function PartyGameCard({ type }) {
  const cfg = getGameConfig(type)
  return (
    <div className="space-y-4 text-center py-6">
      <p className="font-pixel text-sm text-retro-cta text-glow-cta">{cfg.label}</p>
      <p className="font-mono text-xs text-retro-dim leading-relaxed">{PARTY_BLURB[type] || cfg.desc}</p>
      <p className="font-pixel text-[10px] text-retro-dim leading-relaxed">
        NEEDS 2+ PLAYERS —<br />NO SOLO BOT FOR THIS ONE.
      </p>
      <Link
        to="/"
        className="inline-block px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
      >
        CREATE A ROOM →
      </Link>
    </div>
  )
}
