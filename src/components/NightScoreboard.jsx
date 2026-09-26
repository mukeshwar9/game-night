import { useState } from 'react'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { getGameConfig } from '../lib/games'
import { normalizeNight, rankStandings, nightRecap } from '../lib/nightLogic'
import { shareNightRecap, startNewNight } from '../lib/night'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import { cn } from '@/lib/utils'

const MAX_ROWS = 6
const RECENT = 3

// Compact NIGHT scoreboard (report 4.3 "Game-night mode"): tonight's
// standings across every game the room played — they survive game switches
// and NEW MATCH — plus the last few results, the recap share card, and the
// host's START A NEW NIGHT. Renders nothing until the first match is recorded.
export default function NightScoreboard({ game, gameId, myUid, isHost }) {
  const night = normalizeNight(game?.night)
  const ranked = rankStandings(game?.night)
  const [shareBusy, runShare] = useBusy()
  const [confirmNew, setConfirmNew] = useState(false)
  const [showAll, setShowAll] = useState(false)
  if (night.history.length === 0) return null

  const recap = nightRecap(game?.night)
  const label = (type) => getGameConfig(type)?.label || type.toUpperCase()
  const nameOf = (uid) => night.standings[uid]?.name || '???'
  const rows = showAll ? ranked : ranked.slice(0, MAX_ROWS)
  const recent = night.history.slice(-RECENT).reverse()

  const share = () => runShare(async () => {
    const ok = await shareNightRecap(game, gameId)
    if (!ok) throw new Error('share failed')
  }, () => toast.error("COULDN'T SHARE THE RECAP — TRY AGAIN"))

  return (
    <section className="w-full bg-retro-card border border-retro-border rounded p-3 space-y-3" aria-label="Tonight's scoreboard">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">TONIGHT</p>
        <p className="font-pixel text-[8px] text-retro-dim tracking-wider">
          {night.history.length} GAME{night.history.length === 1 ? '' : 'S'} PLAYED
        </p>
      </div>

      <ol className="space-y-1.5">
        {rows.map((s, i) => (
          <li
            key={s.uid}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded border',
              s.uid === myUid ? 'border-retro-p1/50 bg-retro-tint-p1/40' : 'border-retro-border bg-retro-surface',
            )}
          >
            <span className="font-pixel text-[9px] text-retro-dim w-4 text-right">{i + 1}</span>
            <Avatar id={s.avatar} size={20} />
            <span className="font-mono text-xs text-retro-text truncate flex-1 min-w-0">
              {s.name}{s.uid === myUid ? ' (YOU)' : ''}
              {recap.mvp?.uid === s.uid && <span className="ml-1.5 font-pixel text-[8px] text-retro-win">MVP</span>}
            </span>
            <span className="font-pixel text-[8px] text-retro-dim whitespace-nowrap" title={`${s.wins} wins in ${s.played} games`}>
              {s.wins}W · {s.played}G
            </span>
            <span className="font-pixel text-[10px] text-retro-cta whitespace-nowrap w-12 text-right">{s.points} PTS</span>
          </li>
        ))}
      </ol>
      {ranked.length > MAX_ROWS && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="font-pixel text-[8px] text-retro-dim hover:text-retro-text transition-colors p-2 -m-2"
        >
          {showAll ? 'SHOW LESS' : `+${ranked.length - MAX_ROWS} MORE`}
        </button>
      )}

      <div className="space-y-1">
        <p className="font-pixel text-[8px] text-retro-dim tracking-wider">LATEST</p>
        <ul className="space-y-0.5">
          {recent.map(h => (
            <li key={h.id} className="font-mono text-[11px] text-retro-dim flex justify-between gap-2">
              <span className="truncate">{label(h.gameType)}</span>
              <span className="text-retro-text truncate">
                {h.draw ? 'DRAW' : h.winners.map(nameOf).join(' + ')}
                {!h.draw && (h.hi || h.lo) ? ` · ${h.hi}–${h.lo}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <button
          onClick={share}
          disabled={shareBusy}
          className="min-h-11 px-4 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
        >
          {shareBusy ? 'SHARING…' : 'SHARE RECAP'}
        </button>
        {isHost && (
          <button
            onClick={() => setConfirmNew(true)}
            className="min-h-11 px-4 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:text-retro-text hover:border-retro-p1/50 transition-all active:scale-95"
          >
            START A NEW NIGHT
          </button>
        )}
      </div>

      {confirmNew && (
        <ConfirmDialog
          title="START A NEW NIGHT?"
          message="TONIGHT'S STANDINGS AND RESULTS WILL BE CLEARED FOR EVERYONE."
          confirmLabel="NEW NIGHT"
          busyLabel="RESETTING…"
          errorMsg="COULDN'T START A NEW NIGHT — TRY AGAIN"
          onConfirm={() => startNewNight(gameId)}
          onClose={() => setConfirmNew(false)}
        />
      )}
    </section>
  )
}
