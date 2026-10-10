import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StickyTable from '../components/StickyTable'
import { useStickyControls } from '../hooks/useStickyControls'
import {
  BOT_LEVELS, ROUND_SECONDS, LAST_CALL_SECONDS, TABLE_H, createState, step, botInput, createBrain, handsFor, getWinner, ranking, seatsFor,
} from '../lib/stickyLogic'
import { playStickyEvent } from '../lib/stickySounds'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'

// Solo STICKY FINGERS against 1–3 bots, or 2–4 people at the edges of one
// phone. The same sim the online duel runs, with no network in between.
//   /solo/stickyfingers   both modes
//   /local/stickyfingers  one phone only (registry LocalPage)

const LEVELS = Object.keys(BOT_LEVELS)
const DT = 1 / 120

const chip = (on) => cn(
  'px-3 py-1.5 font-pixel text-[8px] uppercase rounded border-2 transition press flex flex-col items-center gap-0.5 min-h-9',
  on ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
)

function Result({ names, ranks, humansOnly, youWon, onAgain }) {
  const top = ranks[0]
  return (
    <div className="w-[88%] space-y-2 text-center" data-testid="sticky-result">
      <p className={cn('font-pixel text-xs', youWon || humansOnly ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>
        {humansOnly ? `${names[top.i]} WINS!` : youWon ? 'YOU WIN!' : `${names[top.i]} WINS`}
      </p>
      <ol className="space-y-1">
        {ranks.map((r, k) => (
          <li key={r.i} className="flex items-center gap-2 rounded border border-retro-border bg-retro-card px-2 py-1 font-pixel text-[8px] text-retro-text">
            <span className="w-3 text-retro-dim">{k + 1}</span>
            <span className="min-w-0 flex-1 truncate text-left">{names[r.i]}</span>
            <span className="tabular-nums">{r.score}</span>
          </li>
        ))}
      </ol>
      <button
        onClick={onAgain}
        className="min-h-11 px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press"
      >
        PLAY AGAIN
      </button>
    </div>
  )
}

export function StickyFingersPlay({ only = null }) {
  const [mode, setMode] = useState(only ?? 'bots')            // 'bots' | 'phone'
  const [level, setLevel] = useState('normal')
  const [rivals, setRivals] = useState(1)                      // bots in solo
  const [humans, setHumans] = useState(2)                      // people on one phone
  const [dye, setDye] = useState(true)
  const [lastCall, setLastCall] = useState(true)
  const [round, setRound] = useState(0)
  const [result, setResult] = useState(null)
  const [record, setRecord] = useState(() => readBotRecord('stickyfingers'))
  const phone = mode === 'phone'
  const n = phone ? humans : 1 + rivals
  const tableRef = useRef(null)
  const stateRef = useRef(null)
  const getScene = useCallback(() => stateRef.current, [])
  const seats = useMemo(() => (phone ? Array.from({ length: n }, (_, i) => i) : [0]), [phone, n])
  const controls = useStickyControls(tableRef, { players: seats, getScene, enabled: !result })
  const controlsRef = useRef(controls)
  useEffect(() => { controlsRef.current = controls })

  const names = useMemo(
    () => Array.from({ length: n }, (_, i) => (phone ? `P${i + 1}` : i === 0 ? 'YOU' : n === 2 ? 'BOT' : `BOT ${i}`)),
    [n, phone],
  )

  useEffect(() => {
    const bots = Array.from({ length: n }, (_, i) => (phone || i === 0 ? null : level))
    const fresh = createState({ players: n, bots, seed: (Math.random() * 4294967296) >>> 0, dyePacks: dye, lastCall })
    stateRef.current = fresh
    const per = handsFor(n)
    const brains = fresh.players.map(() => createBrain(per))
    const mine = (by) => (phone ? true : by === 0)
    controlsRef.current.reset()
    let alive = true
    let raf = 0
    let last = 0
    let acc = 0
    let done = false
    const loop = (ts) => {
      if (!alive) return
      raf = requestAnimationFrame(loop)
      const frame = Math.min(0.05, (ts - (last || ts)) / 1000)
      last = ts
      if (done) return
      acc += frame
      const cur = stateRef.current
      const c = controlsRef.current
      if (c.twoHandsSeen()) brains.forEach((b) => { b.secondHand = true })
      const inputs = cur.players.map((p) => (p.bot ? botInput(cur, p.i, p.bot, brains[p.i], frame) : c.getInput(p.i, per)))
      while (acc >= DT) {
        acc -= DT
        const r = step(stateRef.current, inputs, DT)
        stateRef.current = r.state
        r.events.forEach((ev) => playStickyEvent(ev, mine))
        if (r.state.phase === 'over') {
          done = true
          const w = getWinner(r.state)
          const youWon = phone || w === 0
          if (youWon) sounds.win(); else sounds.lose()
          if (!phone) setRecord(recordBotResult('stickyfingers', level, w === 0 ? 'win' : 'loss'))
          setResult({ ranks: ranking(r.state), youWon })
          break
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(raf) }
  }, [phone, n, level, dye, lastCall, round])

  const restart = (fn) => { fn(); setResult(null); setRound((r) => r + 1) }
  // A person across the table reads their score window upside down.
  const flipSeat = useCallback((i) => phone && seatsFor(n)[i].y < TABLE_H / 2, [phone, n])

  return (
    <div className="space-y-3">
      <StickyTable
        tableRef={tableRef}
        getScene={getScene}
        roundKey={`${round}:${n}`}
        flipSeat={flipSeat}
        names={names}
        overlay={result
          ? <Result names={names} ranks={result.ranks} humansOnly={phone} youWon={result.youWon} onAgain={() => restart(() => {})} />
          : null}
      />
      <div className="space-y-2">
        {!only && (
          <div className="flex flex-wrap justify-center gap-1.5">
            <button onClick={() => restart(() => setMode('bots'))} aria-pressed={!phone} className={chip(!phone)}>SOLO</button>
            <button onClick={() => restart(() => setMode('phone'))} aria-pressed={phone} className={chip(phone)}>ONE PHONE</button>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-1.5">
          {!phone && LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => restart(() => setLevel(l))}
              aria-pressed={level === l}
              aria-label={`${l} bots, your record ${describeLevelRecord(record[l])}`}
              className={chip(level === l)}
            >
              <span>{l}</span>
              {formatLevelRecord(record[l]) && <span className="text-[7px] text-retro-dim">{formatLevelRecord(record[l])}</span>}
            </button>
          ))}
          {!phone && [1, 2, 3].map((k) => (
            <button key={k} onClick={() => restart(() => setRivals(k))} aria-pressed={rivals === k} className={chip(rivals === k)}>
              {k} {k === 1 ? 'BOT' : 'BOTS'}
            </button>
          ))}
          {phone && [2, 3, 4].map((k) => (
            <button key={k} onClick={() => restart(() => setHumans(k))} aria-pressed={humans === k} className={chip(humans === k)}>
              {k} PLAYERS
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          <button onClick={() => restart(() => setDye((v) => !v))} aria-pressed={dye} className={chip(dye)}>DYE PACKS {dye ? 'ON' : 'OFF'}</button>
          <button onClick={() => restart(() => setLastCall((v) => !v))} aria-pressed={lastCall} className={chip(lastCall)}>LAST CALL {lastCall ? 'ON' : 'OFF'}</button>
        </div>
      </div>
      <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
        PRESS THE TABLE · YOUR ARM REACHES OUT FROM YOUR SAFE · DRAG LOOT HOME<br />
        TWO HANDS ON A BILL RIP IT · THE STRETCHED ARM LOSES A COIN · {ROUND_SECONDS}S, MOST LOOT WINS<br />
        {phone ? 'EACH PLAYER TOUCHES THEIR OWN END OF THE TABLE · ' : ''}LAST {LAST_CALL_SECONDS}S PAYS DOUBLE
      </p>
    </div>
  )
}

export default function StickyFingersDemo() { return <StickyFingersPlay /> }
export function StickyFingersLocal() { return <StickyFingersPlay only="phone" /> }
