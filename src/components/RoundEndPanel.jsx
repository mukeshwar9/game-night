import useBusy from '@/hooks/useBusy'
import { shareResult } from '../lib/shareCard'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Shared end-of-round / end-of-match panel for party pages: an optional
// headline block, an optional scoreboard, and a row of async CTAs (NEW MATCH,
// NEXT PROMPT, SHARE…). Every CTA follows the useBusy convention
// (.claude/rules/async-busy-rules.md): busy set synchronously, disabled while
// busy, an "…ING" label, and a toast on failure.
//
// Props:
//   caption   small line above the headline ('MATCH OVER')
//   headline  big line ('YOU WIN!')
//   sub       optional node under the headline
//   scores    { title, rows: [{ id, name, score, you?, delta?, marker?, muted?, win? }] }
//   actions   [{ key, label, busyLabel, onClick, variant?: 'primary'|'next', errorMsg?, disabled? }]
//             falsy entries are skipped, so callers can write `cond && {...}`.
//   share     { gameLabel, headline, sub, accentVar? } — adds a SHARE button
//   children  extra content rendered between the scoreboard and the CTAs

const ACTION_CLASS = {
  primary: 'px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50',
  next: 'w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-50',
}

function BusyAction({ label, busyLabel, onClick, variant = 'primary', errorMsg, disabled }) {
  const [busy, run] = useBusy()
  return (
    <button
      onClick={() => run(
        async () => { await onClick() },
        () => toast.error(errorMsg || `${label} FAILED — CHECK CONNECTION`),
      )}
      disabled={busy || disabled}
      className={ACTION_CLASS[variant] || ACTION_CLASS.primary}
    >
      {busy ? (busyLabel || 'WORKING…') : label}
    </button>
  )
}

function ShareAction({ gameLabel, headline, sub, accentVar = '--c-cta' }) {
  const [sharing, run] = useBusy()
  return (
    <button
      onClick={() => run(async () => {
        const ok = await shareResult({ gameLabel, headline, sub, accentVar, url: window.location.href })
        if (!ok) toast.error("COULDN'T BUILD SHARE CARD — TRY AGAIN")
      }, () => toast.error("COULDN'T BUILD SHARE CARD — TRY AGAIN"))}
      disabled={sharing}
      className="px-6 py-2.5 min-w-[6.5rem] font-pixel text-xs border-2 border-retro-border text-retro-dim rounded hover:border-retro-cta hover:text-retro-cta transition-all active:scale-95 disabled:opacity-50"
    >
      {sharing ? 'BUILDING…' : 'SHARE'}
    </button>
  )
}

export function ScoreList({ title, rows }) {
  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
      {title && (
        <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">{title}</p>
      )}
      {rows.map(r => (
        <div key={r.id} className="flex items-center justify-between font-mono text-[11px]">
          <span className={cn('truncate', r.you ? 'text-retro-p1' : 'text-retro-text', r.muted && 'opacity-70')}>
            {r.marker ? `${r.marker} ` : ''}{r.name}{r.you ? ' (YOU)' : ''}
          </span>
          <span className="flex items-center gap-2 shrink-0 ml-2">
            {r.delta != null && (
              <span className={r.delta > 0 ? 'text-retro-win' : 'text-retro-dim'}>
                {r.delta > 0 ? `+${r.delta}` : '+0'}
              </span>
            )}
            <span className={r.win ? 'text-retro-win' : 'text-retro-cta'}>{r.score}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function RoundEndPanel({ caption, headline, sub, scores, actions = [], share, children }) {
  const shown = actions.filter(Boolean)
  const hasPrimaryRow = shown.some(a => (a.variant || 'primary') === 'primary') || !!share
  return (
    <div className="space-y-3">
      {(caption || headline) && (
        <div className="space-y-1 text-center">
          {caption && <p className="font-pixel text-[10px] text-retro-dim tracking-widest">{caption}</p>}
          {headline && <p className="font-pixel text-base text-retro-cta text-glow-cta">{headline}</p>}
          {sub}
        </div>
      )}
      {scores?.rows?.length > 0 && <ScoreList title={scores.title} rows={scores.rows} />}
      {children}
      {shown.filter(a => a.variant === 'next').map(({ key, ...a }) => (
        <BusyAction key={key || a.label} {...a} />
      ))}
      {hasPrimaryRow && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {shown.filter(a => (a.variant || 'primary') === 'primary').map(({ key, ...a }) => (
            <BusyAction key={key || a.label} {...a} />
          ))}
          {share && <ShareAction {...share} />}
        </div>
      )}
    </div>
  )
}
