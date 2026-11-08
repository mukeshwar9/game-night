import { cn } from '@/lib/utils'
import Avatar from './Avatar'
import { SEAT } from './sideKickSeats'
import { CUP_POINTS, CUP_RACES } from '../lib/sideKickLogic'
import { ordinal } from '../hooks/useSideKickRun'

// The result of a SIDE KICK / DUST KICK race: a podium for the road, the cup as bars, and badges for the
// paybacks and kicks. Shared by the solo page and the online room. Rendering only: `rows` is plain data.
//
// rows: [{ i, name, avatar, place, time, hits, offs, gain, cup, paybacks, me }]
//   time is already formatted ('1:02.4' or 'STILL RIDING'); `cup` is the running cup total, or null when it is not known (online bots).

const CUP_TOP = CUP_POINTS[0] * CUP_RACES
const PODIUM = [{ place: 2, h: 34 }, { place: 1, h: 46 }, { place: 3, h: 24 }]

function Podium({ rows }) {
  const byPlace = new Map(rows.map((r) => [r.place, r]))
  return (
    <div className="flex items-end justify-center gap-2" data-testid="sidekick-podium" role="list" aria-label="Road result">
      {PODIUM.map(({ place, h }) => {
        const r = byPlace.get(place)
        if (!r) return <div key={place} className="w-[84px]" />
        return (
          <div key={place} role="listitem" className="flex w-[84px] flex-col items-center gap-1" aria-label={`${ordinal(place)} ${r.name}${r.me ? ' (you)' : ''}, ${r.time}`}>
            <Avatar id={r.avatar} size={place === 1 ? 30 : 26} />
            <span className={cn('max-w-full truncate font-pixel text-[8px]', r.me ? 'text-retro-p1' : 'text-retro-text')}>{r.me ? 'YOU' : r.name}</span>
            <span className="font-pixel text-[7px] tabular-nums text-retro-dim">{r.time}</span>
            <div
              className={cn('grid w-full place-items-center rounded-t-lg border-2 font-pixel text-sm', place === 1 ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border bg-retro-surface text-retro-text', r.me && 'outline outline-2 outline-retro-p1/60')}
              style={{ height: h }}
            >
              {place}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CupBars({ rows }) {
  const list = rows.filter((r) => r.cup != null).sort((a, b) => b.cup - a.cup || a.place - b.place)
  if (!list.length) return null
  return (
    <div className="space-y-1 text-left" data-testid="sidekick-cup" role="list" aria-label="Cup standings">
      {list.map((r) => (
        <div key={r.i} role="listitem" className={cn('flex items-center gap-2 rounded-md p-0.5', r.me && 'bg-retro-tint-p1')} aria-label={`${r.name}${r.me ? ' (you)' : ''}: ${r.cup} cup points`}>
          <Avatar id={r.avatar} size={20} />
          <span className="w-[52px] shrink-0 truncate font-pixel text-[8px]">{r.me ? 'YOU' : r.name}</span>
          <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-retro-border" aria-hidden="true">
            <i className={cn('block h-full origin-left rounded-full', SEAT[r.i % 4].bg)} style={{ width: `${Math.max(4, Math.min(1, r.cup / CUP_TOP) * 100)}%` }} />
          </span>
          <span className="w-6 shrink-0 text-right font-pixel text-[9px] tabular-nums">{r.cup}</span>
        </div>
      ))}
    </div>
  )
}

export default function SideKickStandings({ rows, cupLabel = null, dust = false }) {
  const kick = dust ? 'BUCK' : 'KICK'
  const me = rows.find((r) => r.me)
  const paid = rows.filter((r) => r.paybacks > 0)
  return (
    <div className="space-y-1.5">
      <Podium rows={rows} />
      {rows.some((r) => r.cup != null) && (
        <div className="rounded-xl border border-retro-border bg-retro-card/70 p-1.5">
          {cupLabel && <p className="mb-1 text-left font-pixel text-[8px] text-retro-dim">{cupLabel}</p>}
          <CupBars rows={rows} />
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-1.5" data-testid="sidekick-badges">
        {paid.map((r) => (
          <span key={r.i} className="rounded px-1.5 pb-0.5 pt-1 font-pixel text-[8px] bg-retro-tint-p2 text-retro-p2">PAYBACK +1 · {r.me ? 'YOU' : r.name}</span>
        ))}
        {me && <span className="rounded px-1.5 pb-0.5 pt-1 font-pixel text-[8px] bg-retro-tint-cta text-retro-cta">{me.hits} {me.hits === 1 ? kick : `${kick}S`} LANDED · {me.offs} {me.offs === 1 ? 'FALL' : 'FALLS'}</span>}
        {me && me.gain > 0 && <span className="rounded px-1.5 pb-0.5 pt-1 font-pixel text-[8px] bg-retro-tint-p1 text-retro-p1">+{me.gain} PTS</span>}
      </div>
    </div>
  )
}
