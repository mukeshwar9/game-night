import Avatar from './Avatar'
import { cn } from '@/lib/utils'
import { COINS_PER_HEART } from '../lib/bamboozleLogic'
import { Coins, Hearts } from './BamboozlePad'
import { seatCss as seatColor } from '../lib/bamboozlePalette'

// Small pieces shared by the BAMBOOZLE pages: the plate over the garden
// (TAP TO PLAY, 3·2·1, round result) and a seat's card (avatar, hearts, coins,
// round wins). Colours are theme tokens; the seat colour is the theme's p1–p4.

/** A plate centred over the garden. Pass `onClick` to make it a button. */
export function Plate({ title, sub, seat = null, onClick, className }) {
  const color = seat != null ? seatColor(seat) : 'rgb(var(--c-cta))'
  const body = (
    <>
      <span className="block font-pixel text-[11px] leading-snug" style={{ color }}>{title}</span>
      {sub && <span className="block mt-1.5 font-pixel text-[7px] text-retro-dim leading-relaxed">{sub}</span>}
    </>
  )
  const cls = cn(
    'absolute left-1/2 -translate-x-1/2 min-w-[62%] max-w-[88%] px-4 py-3 rounded-lg bg-retro-card/95 border-[3px] text-center shadow-lg',
    onClick && 'press',
    className,
  )
  const style = { borderColor: color }
  return onClick
    ? <button type="button" data-nopad onClick={onClick} className={cn(cls, 'top-[48%] -translate-y-1/2')} style={style}>{body}</button>
    : <div role="status" className={cn(cls, 'top-[48%] -translate-y-1/2 pointer-events-none')} style={style}>{body}</div>
}

/** The 3·2·1 over the garden. */
export function CountNumber({ n }) {
  if (!(n > 0)) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-live="assertive">
      <span key={n} className="bz-count font-pixel text-7xl text-retro-text text-glow-cta">{n}</span>
    </div>
  )
}

/** A bobbing tag above your own dodger while the count-in runs. */
export function YouTag({ x, y, n }) {
  return (
    <span
      aria-hidden="true"
      className="absolute pointer-events-none -translate-x-1/2 -translate-y-full"
      style={{ left: `${((42 + x * (276 / n)) / 360) * 100}%`, top: `${((42 + y * (276 / n)) / 360) * 100 - 6}%` }}
    >
      <span
        className="block bz-bob font-pixel text-[8px] px-1.5 py-1 rounded bg-retro-card border border-retro-border"
        style={{ color: seatColor(0) }}
      >
        YOU
      </span>
    </span>
  )
}

/** One seat's card: avatar, name, hearts, coins and round wins. */
export function SeatCard({
  seat, name, avatar, hp, coins = 0, wins = 0, out = false, you = false, showCoins = false, size = 'md', end, className,
}) {
  const small = size === 'sm'
  return (
    <div
      className={cn('flex items-center gap-2 rounded border-2 bg-retro-card px-2 py-1.5 min-w-0', out && 'opacity-55', className)}
      style={{ borderColor: seatColor(seat) }}
      data-seat={seat}
      data-hp={hp}
      data-out={out ? '1' : '0'}
    >
      <Avatar id={avatar} size={small ? 24 : 48} view="bust" tile={false} className="shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-pixel text-[8px] leading-none truncate" style={{ color: seatColor(seat) }}>
          {name}{you && name !== 'YOU' ? ' · YOU' : ''}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {out ? <span className="font-pixel text-[8px] text-retro-dim">OUT</span> : <Hearts hp={hp} size={small ? 11 : 13} />}
          {showCoins && !out && <Coins coins={coins} of={COINS_PER_HEART} />}
        </div>
      </div>
      {wins > 0 && <span className="font-pixel text-[8px] text-retro-cta shrink-0" aria-label={`${wins} round wins`}>{'★'.repeat(wins)}</span>}
      {end}
    </div>
  )
}
