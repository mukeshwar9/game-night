import Avatar from './Avatar'
import { ordinal } from '../lib/raceLogic'
import { cn } from '@/lib/utils'

// Shared live results table for the N-player races (Reaction Time, Aim
// Trainer, Typing Race, Mental Math, Mine Race). Live, it orders racers by
// current standing and shows each one's progress as they go; final, it shows
// the ranking with ties ("=2ND") and DNFs. Rendering only — rows are built by
// RaceShell from the game's logic module (see src/lib/raceLogic.js).
//
// Props:
//   title   header line ('LIVE' / 'RESULTS')
//   final   true once the round is ranked
//   rows    [{ id, name, avatar, you, online, place, tied, dnf, primary,
//             secondary, progress (0..1 | null), status ('idle'|'racing'|
//             'done'|'out'), detail, wins }]

const STATUS_MARK = {
  done: { text: '✓', className: 'text-retro-win' },
  out: { text: '💥', className: 'text-retro-danger' },
  racing: { text: '…', className: 'text-retro-dim' },
  idle: { text: '', className: 'text-retro-dim' },
}

function placeLabel(row, final) {
  if (final && row.dnf) return 'DNF'
  if (!final) return row.place != null ? String(row.place) : '—'
  return `${row.tied ? '=' : ''}${ordinal(row.place)}`
}

export default function RaceResults({ title, final = false, rows = [] }) {
  if (!rows.length) return null
  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-2">
      {title && (
        <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">{title}</p>
      )}
      <ol className="space-y-1.5" aria-label={final ? 'Race results' : 'Live standings'}>
        {rows.map(row => {
          const mark = STATUS_MARK[row.status] || STATUS_MARK.idle
          const winner = final && !row.dnf && row.place === 1
          const label = placeLabel(row, final)
          return (
            <li
              key={row.id}
              data-testid={`race-row-${row.id}`}
              aria-label={`${label} ${row.name}${row.you ? ' (you)' : ''}: ${row.primary}${row.dnf && final ? ', did not finish' : ''}${row.online === false ? ', offline' : ''}`}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1.5 border',
                row.you ? 'border-retro-p1/60 bg-retro-tint-p1' : 'border-retro-border bg-retro-surface',
                row.online === false && 'opacity-60',
              )}
            >
              <span className={cn(
                'font-pixel text-[9px] w-9 shrink-0 tabular-nums',
                winner ? 'text-retro-win text-glow-win' : row.dnf && final ? 'text-retro-danger' : 'text-retro-dim',
              )}>
                {label}
              </span>
              <Avatar id={row.avatar} size={20} />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={cn(
                    'font-pixel text-[9px] truncate',
                    row.you ? 'text-retro-p1' : 'text-retro-text',
                  )}>
                    {(row.name || '?').toUpperCase()}{row.you ? ' (YOU)' : ''}
                  </span>
                  {row.wins > 0 && (
                    <span className="font-pixel text-[8px] text-retro-cta shrink-0" title="Round wins">★{row.wins}</span>
                  )}
                  {row.online === false && (
                    <span className="font-pixel text-[8px] text-retro-dim shrink-0">OFFLINE</span>
                  )}
                </div>
                {!final && row.progress != null && (
                  <div className="h-1.5 bg-retro-deep rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        row.status === 'out' ? 'bg-retro-danger' : row.you ? 'bg-retro-p1' : 'bg-retro-p2',
                      )}
                      style={{ width: `${Math.round(Math.min(1, Math.max(0, row.progress)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className={cn(
                  'font-pixel text-[10px] tabular-nums',
                  winner ? 'text-retro-win text-glow-win' : 'text-retro-text',
                )}>
                  {row.primary}
                </p>
                {row.secondary && (
                  <p className="font-pixel text-[8px] text-retro-dim tabular-nums">{row.secondary}</p>
                )}
              </div>
              <span className={cn('font-pixel text-[10px] w-4 text-center shrink-0', mark.className)} aria-hidden="true">
                {mark.text}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
