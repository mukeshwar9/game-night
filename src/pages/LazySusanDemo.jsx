import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LazySusanArena from '../components/LazySusanArena'
import LiveAnnouncer from '../components/LiveAnnouncer'
import {
  BOT_LEVELS, DEFAULT_TWISTS, MAX_PLAYERS, MIN_PLAYERS, TARGETS, applyOutcome, createRound, derive, standings,
} from '../lib/lazySusanLogic'
import { generateSeed } from '../lib/mathLogic'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'
import { cn } from '@/lib/utils'

// LAZY SUSAN offline modes — no Firebase:
//   /solo/lazysusan  → you against a bot (easy / normal / hard)
//   /local/lazysusan → 2–4 players on one phone, one quarter or half each
// Both run the same round object and the same rules as the online room
// (lazySusanLogic.js); here the round lives in React state and the clock is
// Date.now.

const TEXT_TOK = ['text-retro-p1', 'text-retro-p2', 'text-retro-p3', 'text-retro-p4']
const CTA = 'min-h-11 px-6 py-3 bg-retro-cta text-retro-bg font-pixel text-xs rounded transition press disabled:opacity-50 hover:shadow-neon-cta'
const SEC = 'min-h-11 px-5 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-[10px] rounded transition press hover:border-retro-p1/50 hover:text-retro-p1'
const SOLO_UIDS = ['you', 'bot']

const TWISTS = [
  { id: 'turn', label: 'THE TURN', blurb: 'every new plate turns the other way' },
  { id: 'chili', label: 'HOT CHILI', blurb: 'a chili costs 2 points and freezes your sticks' },
  { id: 'last', label: 'LAST BITE', blurb: 'the final piece is gold, worth double, and the plate speeds up' },
]

function Seg({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr rounded border border-retro-border overflow-hidden">
      {options.map(([v, text, sub]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'min-h-11 font-pixel text-[9px] border-r last:border-r-0 border-retro-border transition-colors flex flex-col items-center justify-center gap-0.5',
            value === v ? 'bg-retro-tint-cta text-retro-cta' : 'bg-retro-card text-retro-dim hover:text-retro-text',
          )}
        >
          <span>{text}</span>
          {sub && <span className="text-[7px] text-retro-dim">{sub}</span>}
        </button>
      ))}
    </div>
  )
}

function TwistToggles({ twists, onChange }) {
  return (
    <div className="space-y-1" role="group" aria-label="Twists">
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest">TWISTS</p>
      {TWISTS.map((t) => (
        <label key={t.id} className="flex items-center justify-between gap-3 min-h-11 py-1.5 border-b border-retro-border/60 cursor-pointer">
          <span className="min-w-0">
            <span className="block font-pixel text-[9px] text-retro-text">{t.label}</span>
            <span className="block font-mono text-[10px] text-retro-dim leading-snug">{t.blurb}</span>
          </span>
          <input
            type="checkbox"
            checked={twists[t.id]}
            onChange={(e) => onChange({ ...twists, [t.id]: e.target.checked })}
            className="w-5 h-5 shrink-0 accent-[rgb(var(--c-win))]"
          />
        </label>
      ))}
    </div>
  )
}

function Setup({ local, onStart }) {
  const [count, setCount] = useState(2)
  const [level, setLevel] = useState('normal')
  const [twists, setTwists] = useState(DEFAULT_TWISTS)
  const [record] = useState(() => readBotRecord('lazysusan'))
  const players = local ? count : 2
  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-retro-dim leading-relaxed text-center">
        One plate turns. Tap when a piece is inside <span className="text-retro-text">your gate</span> to take it.
        A tap on nothing costs a point. First to {TARGETS[players]} wins.
      </p>
      {local ? (
        <div className="space-y-1">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">PLAYERS</p>
          <Seg
            label="Players"
            value={count}
            onChange={setCount}
            options={Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, k) => [MIN_PLAYERS + k, String(MIN_PLAYERS + k), `FIRST TO ${TARGETS[MIN_PLAYERS + k]}`])}
          />
          <p className="font-mono text-[10px] text-retro-dim leading-snug">
            {count === 2 && 'Each of you owns one end of the phone: bottom half and top half.'}
            {count === 3 && 'One at the bottom; two share the top, left and right.'}
            {count === 4 && 'One corner each. Tap anywhere in your corner.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">BOT</p>
          <Seg
            label="Bot level"
            value={level}
            onChange={setLevel}
            options={BOT_LEVELS.map((l) => [l, l.toUpperCase(), formatLevelRecord(record[l])])}
          />
          <p className="sr-only">{BOT_LEVELS.map((l) => `${l} bot, your record ${describeLevelRecord(record[l])}`).join('. ')}</p>
        </div>
      )}
      <TwistToggles twists={twists} onChange={setTwists} />
      <div className="text-center pt-1">
        <button className={CTA} onClick={() => onStart({ local, players, level, twists })}>START</button>
      </div>
    </div>
  )
}

function Match({ setup, onExit }) {
  const { local, players, level, twists } = setup
  const uids = useMemo(() => (local ? Array.from({ length: players }, (_, i) => `p${i + 1}`) : SOLO_UIDS), [local, players])
  const make = useCallback(() => createRound(uids, generateSeed(), Date.now(), twists), [uids, twists])
  const [match, setMatch] = useState(() => ({ id: 0, round: make() }))
  const missId = useRef(0)
  const recorded = useRef(-1)
  const [record, setRecord] = useState(null)

  const d = derive(match.round)
  const seats = useMemo(
    () => uids.map((u, i) => ({ uid: u, name: local ? `P${i + 1}` : u === 'you' ? 'YOU' : 'BOT', online: true })),
    [uids, local],
  )
  const localSeats = useMemo(() => (local ? uids.map((_, i) => i) : [0]), [local, uids])
  const bots = useMemo(() => (local ? {} : { 1: level }), [local, level])
  const clock = useCallback(() => Date.now(), [])

  const onAct = useCallback((i, outcome, now) => {
    setMatch((m) => {
      const next = applyOutcome(m.round, uids[i], outcome, now, `m${missId.current++}`)
      return next ? { ...m, round: next } : m
    })
  }, [uids])

  const winner = d?.winner ?? null
  useEffect(() => {
    if (!winner || local || recorded.current === match.id) return
    recorded.current = match.id
    setRecord(recordBotResult('lazysusan', level, winner === 'you' ? 'win' : 'loss'))
  }, [winner, local, level, match.id])

  const again = () => { setRecord(null); setMatch((m) => ({ id: m.id + 1, round: make() })) }
  const board = d ? standings(d) : []
  const winnerSeat = winner ? uids.indexOf(winner) : -1
  const title = !winner ? '' : local ? `P${winnerSeat + 1} WINS!` : winner === 'you' ? 'YOU WIN!' : 'BOT WINS'

  return (
    <div className="space-y-3">
      <LiveAnnouncer message={winner ? `${title} ${board.map((b) => `${seats[b.seat].name} ${b.score}`).join(', ')}` : ''} />
      <LazySusanArena
        key={match.id}
        round={match.round}
        clock={clock}
        seats={seats}
        localSeats={localSeats}
        bots={bots}
        single={!local}
        onAct={onAct}
      />
      {winner ? (
        <div className="text-center space-y-2" data-testid="lazysusan-result">
          <p className={cn('font-pixel text-sm', local ? TEXT_TOK[winnerSeat] : winner === 'you' ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>{title}</p>
          <p className="font-pixel text-[9px] text-retro-dim">{board.map((b) => `${seats[b.seat].name} ${b.score}`).join(' · ')}</p>
          {record && <p className="font-mono text-[10px] text-retro-dim">VS {level.toUpperCase()} BOT · {formatLevelRecord(record[level])}</p>}
          <div className="flex gap-2 justify-center flex-wrap">
            <button className={CTA} onClick={again}>PLAY AGAIN</button>
            <button className={SEC} onClick={onExit}>SETTINGS</button>
          </div>
        </div>
      ) : (
        <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
          TAP WHEN A PIECE IS IN YOUR GATE · A TAP ON NOTHING COSTS 1<br />
          <span className="kbd-hint">{local ? (players === 4 ? 'KEYS Z · M · P · Q' : players === 3 ? 'KEYS SPACE · P · Q' : 'KEYS SPACE · ENTER') : 'SPACE OR TAP'}</span>
        </p>
      )}
    </div>
  )
}

export default function LazySusanDemo({ local = false }) {
  const [setup, setSetup] = useState(null)
  const [runId, setRunId] = useState(0)
  if (!setup) return <Setup local={local} onStart={(s) => { setSetup(s); setRunId((r) => r + 1) }} />
  return <Match key={runId} setup={setup} onExit={() => setSetup(null)} />
}

/** /local/lazysusan — two to four players on one phone. */
export function LazySusanLocal() {
  return <LazySusanDemo local />
}
