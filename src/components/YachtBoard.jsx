import { cn } from '@/lib/utils'
import Avatar from './Avatar'
import { BOXES, ROLLS_PER_TURN, UPPER_BONUS, UPPER_BONUS_AT, bestBox, scoreBox, sheetTotals } from '../lib/yachtLogic'

// Yacht table — rendering only. The page owns the round, the rolls and every
// rule; this draws seats, the dice tray, one score sheet and the two buttons.
//
// Seat colours are the app's four player accents; a held die also says HELD
// and sits higher in the tray, so the kept set never rests on colour alone.

const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
const SEAT = [
  { text: 'text-retro-p1', border: 'border-retro-p1', tint: 'bg-retro-tint-p1', fill: 'bg-retro-p1' },
  { text: 'text-retro-p2', border: 'border-retro-p2', tint: 'bg-retro-tint-p2', fill: 'bg-retro-p2' },
  { text: 'text-retro-p3', border: 'border-retro-p3', tint: 'bg-retro-tint-p3', fill: 'bg-retro-p3' },
  { text: 'text-retro-p4', border: 'border-retro-p4', tint: 'bg-retro-tint-p4', fill: 'bg-retro-p4' },
]

function Pips({ value, className }) {
  return (
    <span className="grid grid-cols-3 grid-rows-3 w-full h-full" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIPS[value]?.includes(i) && <span className={cn('w-[62%] aspect-square rounded-[2px]', className)} />}
        </span>
      ))}
    </span>
  )
}

function Die({ value, held, rolling, seat, onClick, disabled, index }) {
  const blank = !value
  return (
    <div className="relative w-[17%] max-w-14 aspect-square">
      {/* The socket stays put, so a lifted die visibly leaves it. */}
      <div className="absolute inset-x-0.5 top-1 -bottom-1 rounded-lg border-2 border-dashed border-retro-text/25" />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={held}
        aria-label={blank ? `Die ${index + 1}, not rolled` : `Die ${index + 1}: ${value}${held ? ', held' : ''}`}
        className={cn(
          'absolute inset-0 rounded-lg border-2 p-[14%] transition-transform duration-fast press',
          'shadow-[0_4px_0_rgb(var(--c-text)/0.3)]',
          held ? cn('-translate-y-2', seat.border, seat.tint) : 'border-retro-text bg-retro-card',
          blank && 'border-dashed bg-retro-surface shadow-none',
          disabled && 'cursor-default',
        )}
        style={rolling && !held ? { animation: `place-pop 0.28s ease-out ${index * 35}ms both` } : undefined}
      >
        {!blank && <Pips value={value} className={held ? seat.fill : 'bg-retro-text'} />}
      </button>
      {held && (
        <span className={cn('absolute inset-x-0.5 -bottom-4 rounded-sm text-center font-pixel text-[6px] leading-none py-0.5 text-retro-card', seat.fill)}>
          HELD
        </span>
      )}
    </div>
  )
}

function MiniDie({ face }) {
  return (
    <span className="w-3.5 h-3.5 shrink-0 rounded-[2px] border border-current p-px">
      <Pips value={face} className="bg-current" />
    </span>
  )
}

export function YachtSeats({ seats, turnUid, viewUid, onView }) {
  return (
    <div className={cn('grid gap-1.5', seats.length > 2 ? 'grid-cols-4' : 'grid-cols-2')}>
      {seats.map((s, i) => {
        const c = SEAT[i % SEAT.length]
        const on = s.uid === turnUid
        const compact = seats.length > 2
        return (
          <button
            key={s.uid}
            type="button"
            onClick={() => onView?.(s.uid)}
            aria-pressed={viewUid === s.uid}
            aria-label={`${s.name}: ${s.total} points${on ? ', rolling now' : ''}. Show their sheet`}
            className={cn(
              'relative flex items-center gap-1.5 rounded border-2 px-1.5 py-1 min-w-0 text-left transition press-card',
              compact && 'flex-col text-center gap-0.5',
              on ? cn(c.border, c.tint) : 'border-retro-border bg-retro-card',
              viewUid === s.uid && !on && 'border-retro-structure',
              s.online === false && 'opacity-50',
            )}
          >
            {on && (
              <span className={cn('absolute -top-2 left-1 rounded-sm px-1 py-px font-pixel text-[6px] text-retro-card', c.fill)}>TURN</span>
            )}
            <Avatar id={s.avatar} size={compact ? 28 : 32} />
            <span className="min-w-0 flex-1 font-mono text-[10px] truncate max-w-full">{s.name}</span>
            <span className={cn('font-pixel text-xs tabular-nums', c.text)}>{s.total}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function YachtBoard({
  seats,                // [{ uid, name, avatar, total, online }]
  turnUid,
  myUid,
  viewUid,              // whose sheet is on screen
  onView,
  dice, held, rollsLeft,
  rolling = false,      // replay the landing pop on the dice that were just rolled
  sheet,                // the viewed player's sheet { boxId: points }
  myTurn = false,
  selected = null,
  onSelect,
  onHold,
  onRoll,
  onScore,
  busy = false,
  rollLabel,
  announce = null,      // { text, seat } shown over the tray after a box is banked
  justBox = null,       // box id that was just filled on the viewed sheet
  notice = null,
}) {
  const turnSeat = Math.max(0, seats.findIndex((s) => s.uid === turnUid))
  const c = SEAT[turnSeat % SEAT.length]
  const rolled = rollsLeft < ROLLS_PER_TURN
  const mine = viewUid === myUid
  const live = myTurn && mine && rolled
  const used = ROLLS_PER_TURN - rollsLeft
  const totals = sheetTotals(sheet)
  const best = live ? bestBox(sheet, dice) : null
  const selPts = selected ? scoreBox(selected, dice) : 0
  const selLabel = selected ? BOXES.find((b) => b.id === selected)?.label : null
  const viewed = seats.find((s) => s.uid === viewUid)
  const turnName = seats[turnSeat]?.uid === myUid ? 'YOUR' : `${(seats[turnSeat]?.name ?? '').toUpperCase()}'S`

  const box = (b) => {
    const v = sheet[b.id]
    const done = v != null
    const pts = live && !done ? scoreBox(b.id, dice) : null
    const isSel = selected === b.id
    return (
      <button
        key={b.id}
        type="button"
        disabled={done || !live}
        onClick={() => onSelect?.(b.id)}
        aria-pressed={isSel}
        aria-label={done ? `${b.label}: ${v}` : pts == null ? `${b.label}: open` : `${b.label}: score ${pts}`}
        className={cn(
          'relative flex items-center justify-between gap-1 h-8 w-full rounded border px-1.5 font-pixel text-[7px] text-left transition',
          done ? 'bg-retro-deep border-retro-border text-retro-dim cursor-default'
            : isSel ? 'bg-retro-tint-cta border-2 border-retro-cta text-retro-text'
              : best === b.id ? 'bg-retro-card border-2 border-dashed border-retro-cta text-retro-text press'
                : cn('bg-retro-card border-retro-border press', pts === 0 ? 'text-retro-dim' : 'text-retro-text'),
        )}
        style={justBox === b.id ? { animation: 'box-claim 0.2s ease-out both' } : undefined}
      >
        <span className="flex items-center gap-1 min-w-0">
          {b.face && <MiniDie face={b.face} />}
          <span className="truncate">{b.label}</span>
        </span>
        {best === b.id && !isSel && (
          <span className="absolute -top-1.5 right-8 rounded-sm border border-retro-cta bg-retro-card px-0.5 text-[6px] text-retro-cta">BEST</span>
        )}
        {done
          ? <span className="text-[9px] text-retro-text tabular-nums">{v}</span>
          : pts == null ? null
            : pts > 0
              ? <span className="rounded-sm bg-retro-cta px-1 py-0.5 text-[9px] text-retro-card tabular-nums">+{pts}</span>
              : <span className="text-[9px] text-retro-structure">0</span>}
      </button>
    )
  }

  return (
    <div className="space-y-2.5">
      <YachtSeats seats={seats} turnUid={turnUid} viewUid={viewUid} onView={onView} />

      {/* Dice tray, tinted in the colour of whoever is rolling */}
      <div className={cn('relative rounded-lg border-2 border-retro-text px-2 pt-1.5 pb-5 shadow-[inset_0_4px_0_rgb(var(--c-text)/0.12)]', c.tint)}>
        <div className="flex items-center justify-between font-pixel text-[7px] pb-3">
          <span className={c.text}>{turnName} DICE</span>
          <span className="flex items-center gap-1 text-retro-text" aria-label={`Roll ${used} of ${ROLLS_PER_TURN}`}>
            ROLL {used}/{ROLLS_PER_TURN}
            {Array.from({ length: ROLLS_PER_TURN }, (_, i) => (
              <span key={i} className={cn('w-2 h-2 rounded-[2px] border border-retro-text', i < used ? 'bg-retro-text' : 'bg-retro-card')} />
            ))}
          </span>
        </div>
        <div className="flex justify-between">
          {dice.map((v, k) => (
            <Die
              key={k} index={k} value={v} held={!!held[k]} rolling={rolling} seat={c}
              disabled={!myTurn || !rolled || rollsLeft <= 0 || busy}
              onClick={() => onHold?.(k)}
            />
          ))}
        </div>
        {announce && (
          <div
            role="status"
            className={cn('absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border-2 border-retro-text px-2 py-1 font-pixel text-[8px] text-retro-card shadow-[0_3px_0_rgb(var(--c-text)/0.4)]', SEAT[announce.seat % SEAT.length].fill)}
            style={{ animation: 'place-pop 0.25s ease-out both' }}
          >
            {announce.text}
          </div>
        )}
      </div>

      {/* One sheet: yours, or the seat you tapped */}
      {!mine && viewed && (
        <p className="text-center font-pixel text-[7px] text-retro-dim">
          {viewed.name.toUpperCase()}&apos;S SHEET · <button type="button" className="underline text-retro-cta min-h-6" onClick={() => onView?.(myUid)}>BACK TO YOURS</button>
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-1">
          <p className="flex justify-between font-pixel text-[6px] text-retro-dim px-0.5"><span>NUMBERS</span><span>ADD THAT FACE</span></p>
          {BOXES.slice(0, 6).map(box)}
          <div
            className={cn('flex items-center gap-1 h-8 rounded border border-dashed px-1.5 font-pixel text-[6px]', totals.bonus ? 'border-retro-win text-retro-win bg-retro-tint-p1' : 'border-retro-structure text-retro-dim')}
            aria-label={`Bonus ${UPPER_BONUS} at ${UPPER_BONUS_AT}: ${Math.min(totals.upper, UPPER_BONUS_AT)} so far`}
          >
            <span className="whitespace-nowrap">BONUS +{UPPER_BONUS}</span>
            <span className="flex-1 h-1.5 rounded-sm border border-retro-text/50 bg-retro-card overflow-hidden">
              <span className="block h-full bg-retro-win origin-left" style={{ transform: `scaleX(${Math.min(1, totals.upper / UPPER_BONUS_AT)})` }} />
            </span>
            <span className="tabular-nums">{Math.min(totals.upper, UPPER_BONUS_AT)}/{UPPER_BONUS_AT}</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-pixel text-[6px] text-retro-dim px-0.5">COMBOS</p>
          {BOXES.slice(6).map(box)}
        </div>
      </div>

      {notice}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onRoll}
          disabled={!onRoll || busy}
          className="min-h-12 rounded border-2 border-retro-cta bg-retro-card font-pixel text-[10px] text-retro-cta shadow-[0_4px_0_rgb(var(--c-cta)/0.55)] press disabled:opacity-45 disabled:shadow-none"
        >
          {rollLabel ?? 'ROLL'}
          <span className="block text-[7px] text-retro-dim mt-1">{rollsLeft ? `${rollsLeft} LEFT` : 'NONE LEFT'}</span>
        </button>
        <button
          type="button"
          onClick={onScore}
          disabled={!onScore || !selected || busy}
          className={cn(
            'min-h-12 rounded border-2 border-retro-cta font-pixel text-[10px] press disabled:opacity-45 disabled:shadow-none',
            selected && onScore ? 'bg-retro-cta text-retro-card shadow-[0_4px_0_rgb(var(--c-text)/0.55)]' : 'bg-retro-tint-cta text-retro-cta shadow-[0_4px_0_rgb(var(--c-cta)/0.55)]',
          )}
        >
          {selected ? `SCORE +${selPts}` : 'SCORE'}
          <span className={cn('block text-[7px] mt-1', selected && onScore ? 'text-retro-tint-cta' : 'text-retro-dim')}>{selLabel ?? 'PICK A BOX'}</span>
        </button>
      </div>
    </div>
  )
}
