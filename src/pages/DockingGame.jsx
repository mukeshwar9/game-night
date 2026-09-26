import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import {
  LEVELS, MAX_TILT, MAX_COOLANT, DEBRIS_SLOTS, ROLE, LOSS_TEXT,
  applyPlace, applyReady, diceLeft, dockLimit, forecast, legalSlots, newApproach,
  normalizeRound, placeProblem, slotValue, other,
} from '../lib/dockingLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '../hooks/useBusy'
import { TeamHeader, RoundEndActions, SetupChoices } from '../components/TeamRoundShell'

const SEAT_TONE = { X: 'text-retro-p1 border-retro-p1', O: 'text-retro-p2 border-retro-p2' }
const SHORT = { X: 'CMD', O: 'ENG' }

function Die({ value, seat, dim, selected, onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        'w-14 h-14 rounded-lg border-2 font-pixel text-[20px] flex items-center justify-center bg-retro-card transition-transform',
        SEAT_TONE[seat],
        selected && 'ring-2 ring-retro-cta -translate-y-1 shadow-neon-cta',
        dim && 'opacity-25',
        'disabled:cursor-default',
      )}
    >{value}</button>
  )
}

// One console slot. Shows the die placed there, or a tappable target when the
// selected die may go there.
function Slot({ placed, seat, label, name, target, onPlace, busy }) {
  if (placed != null) {
    return (
      <div aria-label={`${name}: ${placed}`} className={cn('min-h-11 flex-1 rounded border-2 flex items-center justify-center gap-1.5 font-pixel bg-retro-card', seat ? SEAT_TONE[seat] : 'border-retro-structure text-retro-text')}>
        <span className="text-[14px]">{placed}</span>
        <span className="text-[7px] text-retro-dim">{label}</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onPlace}
      disabled={!target || busy}
      aria-label={`${name}${target ? ', place here' : ''}`}
      className={cn(
        'min-h-11 flex-1 rounded border-2 border-dashed font-pixel text-[8px] tracking-wider',
        target ? 'border-retro-cta text-retro-cta bg-retro-tint-cta animate-pulse' : 'border-retro-border text-retro-dim',
      )}
    >{label}</button>
  )
}

function Module({ title, note, children }) {
  return (
    <div className="w-full rounded border border-retro-border bg-retro-surface p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-pixel text-[8px] tracking-widest text-retro-text">{title}</span>
        {note && <span className="font-mono text-[9px] text-retro-dim text-right">{note}</span>}
      </div>
      <div className="flex gap-1.5">{children}</div>
    </div>
  )
}

function ApproachTrack({ round }) {
  const cells = Array.from({ length: round.start + 1 }, (_, i) => round.start - i)
  return (
    <div className="w-full space-y-1" aria-label={`Distance ${round.distance} of ${round.start}`}>
      <div className="flex gap-0.5">
        {cells.map(at => {
          const debris = round.debris.find(d => d.at === at)
          const here = round.distance === at
          return (
            <div
              key={at}
              className={cn(
                'flex-1 min-w-0 h-11 rounded-sm border flex flex-col items-center justify-center',
                at === 0 ? 'border-retro-win text-retro-win' : 'border-retro-border text-retro-dim',
                here && 'bg-retro-tint-cta border-retro-cta',
              )}
              aria-label={`${at === 0 ? 'Port' : `Distance ${at}`}${debris ? `, debris ${debris.v}${debris.cleared ? ' cleared' : ''}` : ''}${here ? ', capsule here' : ''}`}
            >
              <span className={cn('text-[12px] leading-none', here ? 'text-retro-cta' : '')} aria-hidden="true">
                {here ? '◈' : at === 0 ? '⊓' : debris ? (debris.cleared ? '·' : '✶') : '·'}
              </span>
              {debris && <span className={cn('font-pixel text-[8px] leading-none mt-0.5', debris.cleared ? 'line-through opacity-50' : 'text-retro-danger')}>{debris.v}</span>}
            </div>
          )
        })}
      </div>
      <div className="flex justify-between font-pixel text-[7px] text-retro-dim tracking-wider">
        <span>START {round.start}</span><span>PORT</span>
      </div>
    </div>
  )
}

function TiltGauge({ tilt, preview }) {
  return (
    <div className="flex gap-0.5" aria-label={`Tilt ${tilt}${preview !== null && preview !== tilt ? `, after this burn ${preview}` : ''}`}>
      {Array.from({ length: MAX_TILT * 2 + 1 }, (_, i) => i - MAX_TILT).map(t => (
        <span
          key={t}
          className={cn(
            'w-5 h-5 rounded-sm border flex items-center justify-center font-pixel text-[7px]',
            t === 0 ? 'border-retro-win' : 'border-retro-border',
            t === tilt && 'bg-retro-cta text-retro-bg border-retro-cta',
            preview !== null && t === preview && t !== tilt && 'ring-1 ring-retro-p2',
          )}
          aria-hidden="true"
        >{t === 0 ? '0' : ''}</span>
      ))}
    </div>
  )
}

export default function DockingGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const [dealing, runDeal] = useBusy()
  const [readying, runReady] = useBusy()
  const [placing, runPlace] = useBusy()
  const [levelPick, setLevelPick] = useState(null)
  const [pick, setPick] = useState(null) // die index
  const [adjust, setAdjust] = useState(0)
  const raw = game?.round
  const round = useMemo(() => normalizeRound(raw), [raw])
  const live = round && ['talk', 'place', 'done'].includes(round.phase)
  const isSpectator = !mySymbol
  const me = mySymbol || 'X'
  const partner = other(me)
  const names = { X: game?.players?.X?.name || 'X', O: game?.players?.O?.name || 'O' }
  const myTurn = !isSpectator && round?.phase === 'place' && round.turn === mySymbol
  const partnerOffline = !isSpectator && opponentOnline === false

  const turnKey = `${round?.phase}-${round?.burn}-${round?.placed?.length ?? 0}`
  const [trackedKey, setTrackedKey] = useState(turnKey)
  if (trackedKey !== turnKey) {
    setTrackedKey(turnKey)
    setPick(null)
    setAdjust(0)
  }

  const prev = useRef(null)
  useEffect(() => {
    const before = prev.current
    prev.current = round
    if (!before || !round) return
    if (before.phase !== 'done' && round.phase === 'done') {
      if (round.result?.outcome === 'win') sounds.win()
      else sounds.lose()
      return
    }
    if (before.phase === 'talk' && round.phase === 'place') sounds.drop()
    if (before.phase === 'place' && round.phase === 'talk') sounds.bell()
    if (round.phase === 'place' && round.placed.length > before.placed.length) {
      const last = round.placed.at(-1)
      if (last.by !== mySymbol) sounds.move(last.by)
      if (!isSpectator && round.turn === mySymbol) sounds.go()
    }
  }, [round, mySymbol, isSpectator])

  const start = (level) => {
    setLevelPick(level)
    runDeal(async () => {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.gameType !== 'docking' || current.status !== 'playing') return
        if (['talk', 'place', 'done'].includes(current.round?.phase)) return
        const starter = current.starter === 'O' ? 'O' : current.currentTurn === 'O' ? 'O' : 'X'
        const next = newApproach({ level, starter })
        return { ...current, round: next, currentTurn: next.turn, lastActivityAt: Date.now() }
      })
    }, () => toast.error('LAUNCH FAILED — CHECK CONNECTION'))
  }

  const toggleReady = () => runReady(async () => {
    const want = !round.ready[mySymbol]
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.gameType !== 'docking' || current.status !== 'playing') return
      const next = applyReady(current.round, mySymbol, want)
      if (!next) return
      return { ...current, round: next, currentTurn: next.turn, lastActivityAt: Date.now() }
    })
  }, () => toast.error('READY FAILED — CHECK CONNECTION'))

  const place = (slot) => {
    if (pick === null) return
    const move = { die: pick, slot, adjust }
    const problem = placeProblem(round, mySymbol, move)
    if (problem) { sounds.miss(); toast(problem); return }
    runPlace(async () => {
      const tx = await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.gameType !== 'docking' || current.status !== 'playing') return
        const next = applyPlace(current.round, mySymbol, move)
        if (!next) return
        const out = { ...current, round: next, currentTurn: next.turn, lastActivityAt: Date.now(), proposal: null }
        if (next.result?.outcome === 'win') {
          out.scores = { X: (current.scores?.X || 0) + 1, O: (current.scores?.O || 0) + 1 }
        }
        return out
      })
      if (tx.committed) sounds.move(mySymbol)
    }, () => toast.error('PLACE FAILED — CHECK CONNECTION'))
  }

  if (!live) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 max-w-md mx-auto">
        <TeamHeader game={game} mySymbol={mySymbol} opponentOnline={opponentOnline} status="DOCKING" />
        <p className="font-mono text-[10px] text-retro-dim text-center max-w-xs">
          Talk, roll four secret dice each, then place them in silence to fly the capsule into the port.
        </p>
        {isSpectator ? (
          <p className="font-pixel text-[9px] text-retro-dim arcade-blink">WAITING FOR LAUNCH…</p>
        ) : (
          <SetupChoices
            title="PICK AN APPROACH"
            note="Either of you can launch."
            options={Object.entries(LEVELS).map(([id, l]) => ({ id, label: l.label, desc: l.desc }))}
            busy={dealing ? levelPick : false}
            disabled={dealing}
            onPick={start}
          />
        )}
      </div>
    )
  }

  const done = round.phase === 'done'
  const talk = round.phase === 'talk'
  const fc = forecast(round)
  const limit = dockLimit(round)
  const legal = myTurn && pick !== null ? new Set(legalSlots(round, mySymbol, pick, adjust)) : new Set()
  const canTarget = (slot) => legal.has(slot)
  const myDice = round.dice[isSpectator ? 'X' : me]
  const pickedValue = pick !== null ? myDice[pick]?.v + adjust : null
  const lb = round.lastBurn

  const status = isSpectator ? 'SPECTATING'
    : done ? (round.result?.outcome === 'win' ? 'DOCKED!' : 'MISSION LOST')
      : talk ? (round.ready[me] ? 'READY — WAITING' : 'TALK & PLAN')
        : myTurn ? 'PLACE A DIE'
          : partnerOffline ? 'PARTNER OFFLINE'
            : 'PARTNER PLACING…'
  const tone = done ? (round.result?.outcome === 'win' ? 'win' : 'loss') : (myTurn || (talk && !round.ready[me])) ? 'act' : 'idle'

  const SLOT_NAME = { att: 'Attitude', thr: 'Thrust', cool: 'Coolant' }
  const pair = (slot) => ['X', 'O'].map(seat => {
    const v = slotValue(round, seat, slot)
    const mine = seat === mySymbol
    return (
      <Slot
        key={seat}
        seat={seat}
        placed={v}
        label={SHORT[seat]}
        name={`${SLOT_NAME[slot]} ${ROLE[seat].toLowerCase()}`}
        target={mine && canTarget(slot)}
        busy={placing}
        onPlace={() => place(slot)}
      />
    )
  })
  const debrisPlaced = round.placed.filter(p => p.slot === 'deb')

  return (
    <div className="flex flex-col items-center gap-2.5 py-2 max-w-md mx-auto">
      <TeamHeader game={game} mySymbol={mySymbol} opponentOnline={opponentOnline} status={status} tone={tone} teamLabel={LEVELS[round.level].label} />

      <div className="w-full flex items-center justify-between font-pixel text-[8px] tracking-wider text-retro-dim">
        <span>BURN {Math.min(round.burn, round.maxBurns)}/{round.maxBurns}</span>
        <span>DOCK ≤ {limit}</span>
        <span aria-label={`Coolant ${round.coolant} of ${MAX_COOLANT}`}>
          COOLANT {Array.from({ length: MAX_COOLANT }, (_, i) => (i < round.coolant ? '●' : '○')).join('')}
        </span>
      </div>
      <ApproachTrack round={round} />
      <div className="w-full flex items-center justify-between gap-2">
        <span className="font-pixel text-[8px] tracking-wider text-retro-dim">TILT</span>
        <TiltGauge tilt={round.tilt} preview={round.phase === 'place' ? fc.tilt : null} />
      </div>

      {talk && (
        <div className="w-full rounded border-2 border-retro-cta bg-retro-tint-cta p-3 space-y-2 text-center">
          {lb && (
            <p className="font-mono text-[10px] text-retro-text">
              Burn {lb.burn}: thrust {lb.thrust} closed {lb.move}, tilt now {lb.tilt}.
            </p>
          )}
          <p className="font-pixel text-[9px] tracking-wider text-retro-cta">TALK NOW — SILENCE ONCE THE DICE ROLL</p>
          <p className="font-mono text-[10px] text-retro-dim">
            {names[round.lead]} ({ROLE[round.lead]}) places first this burn.
          </p>
          {!isSpectator && (
            <button
              type="button"
              onClick={toggleReady}
              disabled={readying}
              className={cn(
                'min-h-11 px-5 rounded font-pixel text-[10px] tracking-wider disabled:opacity-50',
                round.ready[me] ? 'border-2 border-retro-border text-retro-text' : 'bg-retro-cta text-retro-bg hover:shadow-neon-cta',
              )}
            >{readying ? 'SAVING…' : round.ready[me] ? 'NOT READY' : 'READY TO ROLL'}</button>
          )}
          <p className="font-pixel text-[8px] text-retro-dim tracking-wider">
            {SHORT.X} {round.ready.X ? '✓' : '…'} · {SHORT.O} {round.ready.O ? '✓' : '…'}
          </p>
        </div>
      )}

      {round.phase === 'place' && (
        <p className="w-full text-center font-pixel text-[8px] tracking-widest text-retro-p2" role="status">
          ◉ SILENT RUN — NO TALKING UNTIL THE BURN RESOLVES
        </p>
      )}

      {!talk && (
        <div className="w-full space-y-1.5" aria-label="Console">
          <Module title="ATTITUDE" note={fc.tilt !== null ? `tilt → ${fc.tilt}` : 'CMD − ENG tilts'}>{pair('att')}</Module>
          <Module title="THRUST" note={fc.thrust !== null ? `${fc.thrust}: close ${fc.move}` : '≤4 hold · 5–8 one · 9+ two'}>{pair('thr')}</Module>
          <Module title="DEBRIS" note="match a debris value">
            {Array.from({ length: DEBRIS_SLOTS }, (_, i) => (
              <Slot
                key={i}
                seat={debrisPlaced[i]?.by}
                placed={debrisPlaced[i]?.v ?? null}
                label={debrisPlaced[i] ? SHORT[debrisPlaced[i].by] : 'CLEAR'}
                name={`Debris slot ${i + 1}`}
                target={i === debrisPlaced.length && canTarget('deb')}
                busy={placing}
                onPlace={() => place('deb')}
              />
            ))}
          </Module>
          <Module title="SWITCHES" note={`each armed: dock limit +1`}>
            {round.systems.map((s, i) => (
              s.armed ? (
                <div key={i} className={cn('min-h-11 flex-1 rounded border-2 flex flex-col items-center justify-center font-pixel bg-retro-card', SEAT_TONE[s.owner])}>
                  <span className="text-[9px]">ON</span>
                  <span className="text-[7px] text-retro-dim">{SHORT[s.owner]} {s.v}</span>
                </div>
              ) : (
                <Slot key={i} seat={null} placed={null} label={`${SHORT[s.owner]} =${s.v}`} name={`${ROLE[s.owner].toLowerCase()} switch needing ${s.v}`} target={canTarget(`sys${i}`)} busy={placing} onPlace={() => place(`sys${i}`)} />
              )
            ))}
          </Module>
          <Module title="COOLANT" note="bank a token">{pair('cool')}</Module>
        </div>
      )}

      {round.phase === 'place' && !isSpectator && (
        <section className="w-full space-y-2" aria-label="Your dice">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[8px] tracking-wider text-retro-dim">YOUR DICE · {ROLE[me]}</span>
            <span className="font-pixel text-[8px] tracking-wider text-retro-dim">{ROLE[partner]}: {diceLeft(round, partner)} HIDDEN</span>
          </div>
          <div className="flex justify-center gap-2">
            {myDice.map((d, i) => (
              <Die
                key={i}
                seat={me}
                value={pick === i ? pickedValue : d.v}
                dim={d.used}
                selected={pick === i}
                disabled={d.used || !myTurn || placing}
                onClick={() => { setPick(p => (p === i ? null : i)); setAdjust(0) }}
                label={`Die ${i + 1}: ${d.v}${d.used ? ', placed' : ''}`}
              />
            ))}
          </div>
          {pick !== null && myTurn && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setAdjust(a => (a === -1 ? 0 : -1))}
                disabled={round.coolant <= 0 || myDice[pick].v <= 1}
                aria-pressed={adjust === -1}
                className={cn('min-h-10 px-3 rounded border-2 font-pixel text-[9px] disabled:opacity-30', adjust === -1 ? 'border-retro-cta text-retro-cta' : 'border-retro-border text-retro-text')}
              >−1</button>
              <span className="font-mono text-[9px] text-retro-dim">coolant nudge</span>
              <button
                type="button"
                onClick={() => setAdjust(a => (a === 1 ? 0 : 1))}
                disabled={round.coolant <= 0 || myDice[pick].v >= 6}
                aria-pressed={adjust === 1}
                className={cn('min-h-10 px-3 rounded border-2 font-pixel text-[9px] disabled:opacity-30', adjust === 1 ? 'border-retro-cta text-retro-cta' : 'border-retro-border text-retro-text')}
              >+1</button>
              <button
                type="button"
                onClick={() => place('vent')}
                disabled={!canTarget('vent') || placing}
                className="min-h-10 px-3 rounded border-2 border-retro-border font-pixel text-[9px] text-retro-dim disabled:opacity-30"
              >{placing ? 'VENTING…' : 'VENT'}</button>
            </div>
          )}
          <p className="font-mono text-[10px] text-retro-dim text-center">
            {myTurn ? (pick === null ? 'Pick a die, then a lit slot.' : 'Tap a lit slot to place it.') : `${names[partner]} is placing.`}
          </p>
        </section>
      )}

      {partnerOffline && !done && (
        <p className="font-pixel text-[9px] text-retro-p2 text-center" role="status">PARTNER OFFLINE — THE CAPSULE HOLDS POSITION</p>
      )}

      {done && (
        <>
          <div className={cn(
            'w-full rounded border-2 p-4 text-center space-y-1.5',
            round.result?.outcome === 'win' ? 'border-retro-win bg-retro-card shadow-neon-win' : 'border-retro-danger bg-retro-tint-danger',
          )}>
            <p className={cn('font-pixel text-lg tracking-widest', round.result?.outcome === 'win' ? 'text-retro-win' : 'text-retro-danger')}>
              {round.result?.outcome === 'win' ? 'DOCKED' : 'LOST'}
            </p>
            <p className="font-mono text-[10px] text-retro-text">
              {round.result?.outcome === 'win'
                ? `Soft capture on burn ${round.result.burn} of ${round.maxBurns}.`
                : LOSS_TEXT[round.result?.reason] || 'The approach failed.'}
            </p>
            {lb && <p className="font-mono text-[10px] text-retro-dim">Last burn: thrust {lb.thrust} (limit {lb.limit}), tilt {lb.tilt}.</p>}
          </div>
          <RoundEndActions
            gameType="docking"
            isSpectator={isSpectator}
            proposal={proposal}
            onPlayAgain={onPlayAgain}
            onNewMatch={onNewMatch}
            onSwitchGame={onSwitchGame}
          />
        </>
      )}
    </div>
  )
}
