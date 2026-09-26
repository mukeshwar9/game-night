import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import {
  SUITS, MODES, MAX_CLUES, MAX_FUSES, applyAction, actionProblem, clueTargets,
  dealRound, describeAction, maxScore, normalizeRound, ratingFor, scoreOf, winThreshold, other,
} from '../lib/lanternsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '../hooks/useBusy'
import { TeamHeader, RoundEndActions, SetupChoices } from '../components/TeamRoundShell'

// Literal class strings per suit so Tailwind keeps them. Colour is never the
// only cue: every card also carries its suit glyph.
const SUIT_TONE = [
  'text-retro-p1 border-retro-p1',
  'text-retro-p2 border-retro-p2',
  'text-retro-p3 border-retro-p3',
  'text-retro-p4 border-retro-p4',
  'text-retro-cta border-retro-cta',
]
const SUIT_TINT = ['bg-retro-tint-p1', 'bg-retro-tint-p2', 'bg-retro-tint-p3', 'bg-retro-tint-p4', 'bg-retro-tint-cta']

function notList(mask, count, render) {
  const out = []
  for (let i = 0; i < count; i++) if (mask & (1 << i)) out.push(render(i))
  return out
}

// What a seat has been told about one card: known suit/number big, ruled-out
// suits/numbers small underneath.
function MarkLine({ mark, suits }) {
  const notS = notList(mark.notS, suits, i => SUITS[i].glyph)
  const notN = notList(mark.notN, 6, i => i).filter(n => n >= 1)
  if (!notS.length && !notN.length) return null
  return (
    <span className="block font-mono text-[8px] leading-tight text-retro-dim truncate" aria-label={`Not ${[...notS, ...notN].join(' ')}`}>
      ≠{notS.join('')}{notN.join('')}
    </span>
  )
}

function CardFace({ card, mark, selected, flash, onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        'relative flex-1 min-w-0 aspect-[3/4] rounded border-2 flex flex-col items-center justify-center gap-0.5 transition-transform',
        SUIT_TONE[card.s], SUIT_TINT[card.s],
        selected && 'ring-2 ring-offset-2 ring-offset-retro-bg ring-retro-text -translate-y-1',
        flash && 'lanterns-flash',
        'disabled:cursor-default',
      )}
    >
      <span className="font-pixel text-[18px] leading-none">{card.n}</span>
      <span className="text-[16px] leading-none" aria-hidden="true">{SUITS[card.s].glyph}</span>
      {mark && (
        <span className="absolute bottom-0.5 inset-x-0.5 flex justify-center gap-0.5 font-pixel text-[7px] text-retro-text">
          <span className={cn(Number.isInteger(mark.s) ? '' : 'opacity-30')}>{Number.isInteger(mark.s) ? SUITS[mark.s].glyph : '·'}</span>
          <span className={cn(Number.isInteger(mark.n) ? '' : 'opacity-30')}>{Number.isInteger(mark.n) ? mark.n : '·'}</span>
        </span>
      )}
    </button>
  )
}

function CardBack({ mark, suits, selected, flash, onClick, disabled, label }) {
  const knownS = Number.isInteger(mark.s)
  const knownN = Number.isInteger(mark.n)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        'relative flex-1 min-w-0 aspect-[3/4] rounded border-2 flex flex-col items-center justify-center gap-0.5 px-0.5 transition-transform',
        knownS ? cn(SUIT_TONE[mark.s], SUIT_TINT[mark.s]) : 'border-retro-border bg-retro-surface text-retro-dim',
        selected && 'ring-2 ring-offset-2 ring-offset-retro-bg ring-retro-text -translate-y-1',
        flash && 'lanterns-flash',
        'disabled:cursor-default',
      )}
    >
      <span className={cn('font-pixel text-[18px] leading-none', !knownN && 'opacity-40')}>{knownN ? mark.n : '?'}</span>
      <span className={cn('text-[16px] leading-none', !knownS && 'opacity-40')} aria-hidden="true">{knownS ? SUITS[mark.s].glyph : '✦'}</span>
      <MarkLine mark={mark} suits={suits} />
    </button>
  )
}

function Pips({ count, max, glyph, onClass, label }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${label} ${count} of ${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} aria-hidden="true" className={cn('text-[10px] leading-none', i < count ? onClass : 'text-retro-border')}>{glyph}</span>
      ))}
    </span>
  )
}

function Rows({ round }) {
  return (
    <div className="w-full grid gap-1.5" style={{ gridTemplateColumns: `repeat(${round.stacks.length}, minmax(0, 1fr))` }}>
      {round.stacks.map((top, s) => (
        <div
          key={s}
          className={cn('rounded border-2 py-1.5 flex flex-col items-center gap-0.5', SUIT_TONE[s], top ? SUIT_TINT[s] : 'bg-retro-surface opacity-80')}
          aria-label={`${SUITS[s].name} row at ${top}`}
        >
          <span className="text-[14px] leading-none" aria-hidden="true">{SUITS[s].glyph}</span>
          <span className="font-pixel text-[14px] leading-none">{top || '–'}</span>
          <span className="flex gap-px" aria-hidden="true">
            {[1, 2, 3, 4, 5].map(n => <span key={n} className={cn('w-1.5 h-1 rounded-sm', n <= top ? 'bg-current' : 'bg-retro-border')} />)}
          </span>
        </div>
      ))}
    </div>
  )
}

function Discards({ round }) {
  if (!round.discards.length) return <p className="font-mono text-[10px] text-retro-dim text-center">No cards discarded yet.</p>
  return (
    <div className="w-full grid gap-1" role="list">
      {round.stacks.map((_, s) => {
        const cards = round.discards.filter(c => c.s === s).sort((a, b) => a.n - b.n)
        if (!cards.length) return null
        return (
          <div key={s} className={cn('flex items-center gap-1.5 font-pixel text-[10px]', SUIT_TONE[s])} role="listitem">
            <span aria-hidden="true">{SUITS[s].glyph}</span>
            <span className="text-retro-dim text-[8px] w-10">{SUITS[s].name}</span>
            <span className="tracking-widest">{cards.map(c => c.n).join(' ')}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function LanternsGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const [dealing, runDeal] = useBusy()
  const [acting, runAct] = useBusy()
  const [dealPick, setDealPick] = useState(null)
  const [pick, setPick] = useState(null) // { side: 'mine' | 'theirs', slot }
  const [showDiscards, setShowDiscards] = useState(false)
  const raw = game?.round
  const round = useMemo(() => normalizeRound(raw), [raw])
  const live = round && (round.phase === 'playing' || round.phase === 'done')
  const isSpectator = !mySymbol
  const me = mySymbol || 'X'
  const partner = other(me)
  const names = { X: game?.players?.X?.name || 'X', O: game?.players?.O?.name || 'O' }
  const myTurn = !isSpectator && round?.phase === 'playing' && round.turn === mySymbol
  const partnerOffline = !isSpectator && opponentOnline === false
  const suits = round?.stacks?.length || 5

  // Drop a stale selection whenever the turn or the hands move on.
  const actionKey = `${round?.turn}-${round?.lastAction?.at ?? ''}-${round?.phase}`
  const [trackedKey, setTrackedKey] = useState(actionKey)
  if (trackedKey !== actionKey) {
    setTrackedKey(actionKey)
    setPick(null)
  }

  // Sounds: my turn, the partner's play, the end of the evening.
  const prev = useRef(null)
  useEffect(() => {
    const before = prev.current
    prev.current = round
    if (!before || !round || before.phase !== 'playing') return
    if (round.phase === 'done') {
      if (round.result?.outcome === 'win') sounds.win()
      else sounds.lose()
      return
    }
    const last = round.lastAction
    if (!last || last.at === before.lastAction?.at) return
    if (last.by !== mySymbol) {
      if (last.type === 'play' && !last.ok) sounds.miss()
      else sounds.move(last.by)
    }
    if (!isSpectator && round.turn === mySymbol) sounds.go()
  }, [round, mySymbol, isSpectator])

  const deal = (mode) => {
    setDealPick(mode)
    runDeal(async () => {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.gameType !== 'lanterns' || current.status !== 'playing') return
        const phase = current.round?.phase
        if (phase === 'playing' || phase === 'done') return
        const starter = current.starter === 'O' ? 'O' : current.currentTurn === 'O' ? 'O' : 'X'
        const next = dealRound({ mode, starter })
        return { ...current, round: next, currentTurn: next.turn, lastActivityAt: Date.now() }
      })
    }, () => toast.error('DEAL FAILED — CHECK CONNECTION'))
  }

  const act = (action) => {
    const problem = actionProblem(round, mySymbol, action)
    if (problem) { sounds.miss(); toast(problem); return }
    runAct(async () => {
      const tx = await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.gameType !== 'lanterns' || current.status !== 'playing') return
        const next = applyAction(current.round, mySymbol, action, Date.now())
        if (!next) return
        const out = { ...current, round: next, currentTurn: next.turn, lastActivityAt: Date.now(), proposal: null }
        if (next.result?.outcome === 'win') {
          out.scores = { X: (current.scores?.X || 0) + 1, O: (current.scores?.O || 0) + 1 }
        }
        return out
      })
      if (!tx.committed) return
      if (action.type === 'play') {
        const ok = tx.snapshot.val()?.round?.lastAction?.ok
        if (ok) sounds.move(mySymbol)
        else sounds.miss()
      } else sounds.move(mySymbol)
    }, () => toast.error('MOVE FAILED — CHECK CONNECTION'))
  }

  if (!live) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 max-w-md mx-auto">
        <TeamHeader game={game} mySymbol={mySymbol} opponentOnline={opponentOnline} status="LANTERNS" />
        <p className="font-mono text-[10px] text-retro-dim text-center max-w-xs">
          You see your partner&apos;s cards, never your own. Clue each other, then light the rows 1 to 5.
        </p>
        {isSpectator ? (
          <p className="font-pixel text-[9px] text-retro-dim arcade-blink">WAITING FOR THE DEAL…</p>
        ) : (
          <SetupChoices
            title="PICK A DECK"
            note="Either of you can deal."
            options={Object.entries(MODES).map(([id, m]) => ({ id, label: m.label, desc: m.desc }))}
            busy={dealing ? dealPick : false}
            disabled={dealing}
            onPick={deal}
          />
        )}
      </div>
    )
  }

  const done = round.phase === 'done'
  const score = scoreOf(round)
  const max = maxScore(round.mode)
  const last = round.lastAction
  const cluedMine = last?.type === 'clue' && last.by === partner ? new Set(last.slots || []) : new Set()
  const cluedTheirs = last?.type === 'clue' && last.by === me ? new Set(last.slots || []) : new Set()

  const status = isSpectator ? 'SPECTATING'
    : done ? (round.result?.outcome === 'win' ? 'THE SKY IS LIT' : 'LANTERNS OUT')
      : myTurn ? 'YOUR TURN'
        : partnerOffline ? 'PARTNER OFFLINE'
          : 'PARTNER THINKING…'
  const tone = done ? (round.result?.outcome === 'win' ? 'win' : 'loss') : myTurn ? 'act' : 'idle'

  const theirSeat = isSpectator ? 'O' : partner
  const mySeat = isSpectator ? 'X' : me
  const pickedTheirs = pick?.side === 'theirs' ? round.hands[theirSeat][pick.slot] : null
  const suitClue = pickedTheirs ? { type: 'clue', kind: 'suit', value: pickedTheirs.s } : null
  const numberClue = pickedTheirs ? { type: 'clue', kind: 'number', value: pickedTheirs.n } : null
  const canClue = myTurn && round.clues > 0

  return (
    <div className="flex flex-col items-center gap-3 py-2 max-w-md mx-auto">
      <TeamHeader game={game} mySymbol={mySymbol} opponentOnline={opponentOnline} status={status} tone={tone} />

      <div className="w-full flex items-center justify-between gap-2 font-pixel text-[8px] text-retro-dim tracking-wider">
        <span className="flex items-center gap-1">CLUES <Pips count={round.clues} max={MAX_CLUES} glyph="◆" onClass="text-retro-cta" label="Clue tokens" /></span>
        <span className="flex items-center gap-1">FUSES <Pips count={MAX_FUSES - round.fuses} max={MAX_FUSES} glyph="✹" onClass="text-retro-danger" label="Fuses left" /></span>
        <span>DECK {round.deck.length}</span>
      </div>
      {round.finalTurns !== null && !done && (
        <p className="w-full text-center font-pixel text-[8px] text-retro-p2 tracking-wider" role="status">LAST CARD DRAWN — ONE MORE TURN EACH</p>
      )}

      <section className="w-full space-y-1.5" aria-label={`${names[theirSeat]}'s hand`}>
        <p className="font-pixel text-[8px] text-retro-dim tracking-wider">
          {isSpectator ? `${names.O}'S HAND` : `${names[theirSeat]}'S HAND — THEY CAN'T SEE THESE`}
        </p>
        <div className="flex gap-1.5">
          {round.hands[theirSeat].map((c, i) => (
            <CardFace
              key={c.id}
              card={c}
              mark={round.knowledge[theirSeat][i]}
              selected={pick?.side === 'theirs' && pick.slot === i}
              flash={cluedTheirs.has(i)}
              disabled={isSpectator || done}
              onClick={() => setPick(p => (p?.side === 'theirs' && p.slot === i ? null : { side: 'theirs', slot: i }))}
              label={`${names[theirSeat]} card ${i + 1}: ${SUITS[c.s].name} ${c.n}`}
            />
          ))}
        </div>
        {pickedTheirs && !done && (
          <div className="w-full grid grid-cols-2 gap-2">
            {[suitClue, numberClue].map(clue => {
              const count = clueTargets(round, theirSeat, clue).length
              const text = clue.kind === 'suit' ? `${SUITS[clue.value].glyph} ${SUITS[clue.value].name}` : `ALL ${clue.value}s`
              return (
                <button
                  key={clue.kind}
                  type="button"
                  onClick={() => act(clue)}
                  disabled={!canClue || acting}
                  className="min-h-11 px-2 rounded border-2 border-retro-cta text-retro-cta font-pixel text-[9px] tracking-wider hover:bg-retro-tint-cta disabled:opacity-40"
                >{acting ? 'CLUING…' : `CLUE ${text} (${count})`}</button>
              )
            })}
            {!myTurn && <p className="col-span-2 text-center font-mono text-[10px] text-retro-dim">Clue on your turn.</p>}
            {myTurn && round.clues === 0 && <p className="col-span-2 text-center font-mono text-[10px] text-retro-dim">No clues left: play or discard to earn one.</p>}
          </div>
        )}
      </section>

      <Rows round={round} />
      <div className="w-full flex items-center justify-between gap-2">
        <span className="font-pixel text-[9px] text-retro-text tracking-wider">LIT {score}/{max}</span>
        <button
          type="button"
          onClick={() => setShowDiscards(v => !v)}
          aria-expanded={showDiscards}
          className="min-h-9 px-3 rounded border border-retro-border font-pixel text-[8px] text-retro-dim tracking-wider hover:text-retro-text"
        >DISCARDS {round.discards.length} {showDiscards ? '▴' : '▾'}</button>
      </div>
      {showDiscards && <Discards round={round} />}

      <p className="w-full min-h-4 text-center font-pixel text-[8px] text-retro-p2 tracking-wider" aria-live="polite">
        {describeAction(last, names)}
      </p>

      <section className="w-full space-y-1.5" aria-label="Your hand">
        <p className="font-pixel text-[8px] text-retro-dim tracking-wider">
          {isSpectator ? `${names.X}'S HAND` : 'YOUR HAND — ONLY WHAT YOU’VE BEEN TOLD'}
        </p>
        <div className="flex gap-1.5">
          {round.hands[mySeat].map((c, i) => (isSpectator ? (
            <CardFace key={c.id} card={c} mark={round.knowledge[mySeat][i]} disabled label={`${names.X} card ${i + 1}: ${SUITS[c.s].name} ${c.n}`} />
          ) : (
            <CardBack
              key={c.id}
              mark={round.knowledge[mySeat][i]}
              suits={suits}
              selected={pick?.side === 'mine' && pick.slot === i}
              flash={cluedMine.has(i)}
              disabled={done}
              onClick={() => setPick(p => (p?.side === 'mine' && p.slot === i ? null : { side: 'mine', slot: i }))}
              label={`Your card ${i + 1}`}
            />
          )))}
        </div>
        {pick?.side === 'mine' && !done && (
          <div className="w-full grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => act({ type: 'play', slot: pick.slot })}
              disabled={!myTurn || acting}
              className="min-h-11 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-wider hover:shadow-neon-cta disabled:opacity-40"
            >{acting ? 'PLAYING…' : 'PLAY'}</button>
            <button
              type="button"
              onClick={() => act({ type: 'discard', slot: pick.slot })}
              disabled={!myTurn || acting || round.clues >= MAX_CLUES}
              className="min-h-11 rounded border-2 border-retro-border text-retro-text font-pixel text-[10px] tracking-wider hover:border-retro-p1/60 disabled:opacity-40"
            >{acting ? 'DISCARDING…' : 'DISCARD'}</button>
            {!myTurn && <p className="col-span-2 text-center font-mono text-[10px] text-retro-dim">Play or discard on your turn.</p>}
            {myTurn && round.clues >= MAX_CLUES && <p className="col-span-2 text-center font-mono text-[10px] text-retro-dim">Clue tokens are full, so you can&apos;t discard.</p>}
          </div>
        )}
        {!pick && !done && !isSpectator && (
          <p className="font-mono text-[10px] text-retro-dim text-center">
            {myTurn ? 'Tap a partner card to clue it, or one of yours to play or discard.' : `${names[partner]} is taking a turn.`}
          </p>
        )}
      </section>

      {partnerOffline && !done && (
        <p className="font-pixel text-[9px] text-retro-p2 text-center" role="status">PARTNER OFFLINE — THE TABLE WAITS FOR THEM</p>
      )}

      {done && (
        <>
          <div className={cn(
            'w-full rounded border-2 p-4 text-center space-y-1.5',
            round.result?.outcome === 'win' ? 'border-retro-win bg-retro-card shadow-neon-win' : 'border-retro-danger bg-retro-tint-danger',
          )}>
            <p className={cn('font-pixel text-lg tracking-widest', round.result?.outcome === 'win' ? 'text-retro-win' : 'text-retro-danger')}>
              {score}/{max}
            </p>
            <p className="font-pixel text-[10px] tracking-widest text-retro-text">{ratingFor(score, round.mode)}</p>
            <p className="font-mono text-[10px] text-retro-dim">
              {round.result?.reason === 'fuses' ? 'Three fuses burned out.' : round.result?.reason === 'perfect' ? 'Every row climbed to 5.' : 'The deck ran out.'}
              {' '}{winThreshold(round.mode)}+ lights a team star.
            </p>
          </div>
          <RoundEndActions
            gameType="lanterns"
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
