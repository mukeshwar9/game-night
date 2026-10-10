import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QuiverTable from '../components/QuiverTable'
import { useQuiverControls } from '../hooks/useQuiverControls'
import {
  BOT_LEVELS, WHEELS, WHEEL_SECONDS, createState, step, botInput, createBrain, getWinner, ranking, seatsFor, teamScore,
} from '../lib/quiverLogic'
import { playQuiverEvent } from '../lib/quiverSounds'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'

// Solo QUIVER against 1-3 bots, or 2-4 people at the edges of one phone. The
// same sim the online duel runs, with no network in between. TEAM UP turns the
// table into one team (bots or friends) against the wheel.
//   /solo/quiver   both modes
//   /local/quiver  one phone only (registry LocalPage)

const LEVELS = Object.keys(BOT_LEVELS)
const DT = 1 / 120
const MAX_FRAME = 0.05

const chip = (on) => cn(
  'px-3 py-1.5 font-pixel text-[8px] uppercase rounded border-2 transition press flex flex-col items-center gap-0.5 min-h-9',
  on ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
)

function Result({ names, ranks, coop, outcome, stars, humansOnly, youWon, onAgain }) {
  const top = ranks[0]
  let headline
  if (coop) headline = outcome === 'team' ? 'WHEELS CLEARED!' : 'OUT OF HEARTS'
  else if (outcome === 'draw') headline = 'DRAW'
  else headline = humansOnly ? `${names[top.i]} WINS!` : youWon ? 'YOU WIN!' : `${names[outcome]} WINS`
  const good = coop ? outcome === 'team' : outcome === 'draw' ? false : humansOnly || youWon
  return (
    <div className="w-[88%] space-y-2 text-center" data-testid="quiver-result">
      <p className={cn('font-pixel text-xs', good ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>{headline}</p>
      {coop ? (
        <p className="font-pixel text-[8px] text-retro-text">TEAM STARS {stars}</p>
      ) : (
        <ol className="space-y-1">
          {ranks.map((r, k) => (
            <li key={r.i} className="flex items-center gap-2 rounded border border-retro-border bg-retro-card px-2 py-1 font-pixel text-[8px] text-retro-text">
              <span className="w-3 text-retro-dim">{k + 1}</span>
              <span className="min-w-0 flex-1 truncate text-left">{names[r.i]}</span>
              <span className="tabular-nums">{r.score}</span>
            </li>
          ))}
        </ol>
      )}
      <button
        onClick={onAgain}
        className="min-h-11 px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press"
      >
        PLAY AGAIN
      </button>
    </div>
  )
}

export function QuiverPlay({ only = null }) {
  const [mode, setMode] = useState(only ?? 'bots')            // 'bots' | 'phone'
  const [level, setLevel] = useState('normal')
  const [rivals, setRivals] = useState(1)                      // bots in solo
  const [humans, setHumans] = useState(2)                      // people on one phone
  const [coop, setCoop] = useState(false)
  const [shave, setShave] = useState(true)
  const [items, setItems] = useState(true)
  const [sight, setSight] = useState(true)
  const [round, setRound] = useState(0)
  const [result, setResult] = useState(null)
  const [record, setRecord] = useState(() => readBotRecord('quiver'))
  const phone = mode === 'phone'
  const n = phone ? humans : 1 + rivals
  const tableRef = useRef(null)
  const stateRef = useRef(null)
  const getScene = useCallback(() => stateRef.current, [])
  const controls = useQuiverControls()
  const controlsRef = useRef(controls)
  useEffect(() => { controlsRef.current = controls })
  const mySeats = useMemo(() => (phone ? Array.from({ length: n }, (_, i) => i) : [0]), [phone, n])

  const names = useMemo(() => {
    if (coop) return Array.from({ length: n }, (_, i) => (phone ? `P${i + 1}` : i === 0 ? 'YOU' : n === 2 ? 'MATE' : `MATE ${i}`))
    return Array.from({ length: n }, (_, i) => (phone ? `P${i + 1}` : i === 0 ? 'YOU' : n === 2 ? 'BOT' : `BOT ${i}`))
  }, [n, phone, coop])

  useEffect(() => {
    const bots = Array.from({ length: n }, (_, i) => (phone || i === 0 ? null : level))
    const fresh = createState({ players: n, bots, seed: (Math.random() * 4294967296) >>> 0, shave, items, sight, coop })
    stateRef.current = fresh
    const brains = fresh.players.map(() => createBrain())
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
      const frame = Math.min(MAX_FRAME, (ts - (last || ts)) / 1000)
      last = ts
      if (done) return
      acc += frame
      const c = controlsRef.current
      // A press is drained once per frame; the first step of the frame gets it.
      const taps = fresh.players.map((p) => (p.bot ? 0 : c.take(p.i)))
      while (acc >= DT) {
        acc -= DT
        const cur = stateRef.current
        const inputs = cur.players.map((p) => (p.bot
          ? botInput(cur, p.i, p.bot, brains[p.i])
          : { fire: taps[p.i] > 0 }))
        taps.fill(0)
        const r = step(cur, inputs, DT)
        stateRef.current = r.state
        r.events.forEach((ev) => playQuiverEvent(ev, mine))
        if (r.state.phase === 'over') {
          done = true
          const w = getWinner(r.state)
          const youWon = coop ? w === 'team' : phone ? w !== 'draw' : w === 0
          if (coop ? w === 'team' : youWon) sounds.win(); else sounds.lose()
          if (!phone && !coop && w !== 'draw') setRecord(recordBotResult('quiver', level, w === 0 ? 'win' : 'loss'))
          setResult({ ranks: ranking(r.state), outcome: w, youWon, stars: teamScore(r.state) })
          break
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(raf) }
  }, [phone, n, level, shave, items, sight, coop, round])

  const restart = (fn) => { fn(); setResult(null); setRound((r) => r + 1) }
  // A person across the table reads their button upside down. The table can
  // still hold the previous round's seats for a frame after a count change.
  const flipSeat = useCallback((i) => phone && !!seatsFor(n)[i]?.flip, [phone, n])
  const onPress = useCallback((seat) => controlsRef.current.press(seat), [])

  return (
    <div className="space-y-3">
      <QuiverTable
        tableRef={tableRef}
        getScene={getScene}
        roundKey={`${round}:${n}`}
        flipSeat={flipSeat}
        names={names}
        mySeats={mySeats}
        onPress={onPress}
        enabled={!result}
        coop={coop}
        overlay={result
          ? (
            <Result
              names={names} ranks={result.ranks} coop={coop} outcome={result.outcome} stars={result.stars}
              humansOnly={phone} youWon={result.youWon} onAgain={() => restart(() => {})}
            />
          )
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
          {!phone && !coop && LEVELS.map((l) => (
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
          {!phone && coop && LEVELS.map((l) => (
            <button key={l} onClick={() => restart(() => setLevel(l))} aria-pressed={level === l} className={chip(level === l)}>
              <span>{l}</span>
            </button>
          ))}
          {!phone && [1, 2, 3].map((k) => (
            <button key={k} onClick={() => restart(() => setRivals(k))} aria-pressed={rivals === k} className={chip(rivals === k)}>
              {k} {coop ? (k === 1 ? 'MATE' : 'MATES') : (k === 1 ? 'BOT' : 'BOTS')}
            </button>
          ))}
          {phone && [2, 3, 4].map((k) => (
            <button key={k} onClick={() => restart(() => setHumans(k))} aria-pressed={humans === k} className={chip(humans === k)}>
              {k} PLAYERS
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          <button onClick={() => restart(() => setCoop((v) => !v))} aria-pressed={coop} className={chip(coop)}>TEAM UP {coop ? 'ON' : 'OFF'}</button>
          <button onClick={() => restart(() => setShave((v) => !v))} aria-pressed={shave} className={chip(shave)}>CLOSE SHAVE {shave ? 'ON' : 'OFF'}</button>
          <button onClick={() => restart(() => setItems((v) => !v))} aria-pressed={items} className={chip(items)}>RIM ITEMS {items ? 'ON' : 'OFF'}</button>
          {!coop && <button onClick={() => restart(() => setSight((v) => !v))} aria-pressed={sight} className={chip(sight)}>UNDERDOG SIGHT {sight ? 'ON' : 'OFF'}</button>}
        </div>
      </div>
      <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
        TAP YOUR BUTTON · THE ARROW FLIES TO THE HUB · LEAD THE WHEEL<br />
        STAR +1 · A CLINK ON A STUCK ARROW COSTS 1 · {WHEELS} WHEELS OF {WHEEL_SECONDS}S<br />
        {phone ? 'EACH PLAYER TAPS THEIR OWN BUTTON · ' : ''}{coop ? 'CLEAR EVERY WHEEL WITH A HEART LEFT' : 'MOST STARS WINS'}
      </p>
    </div>
  )
}

export default function QuiverDemo() { return <QuiverPlay /> }
export function QuiverLocal() { return <QuiverPlay only="phone" /> }
