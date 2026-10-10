import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FirstCutTable from '../components/FirstCutTable'
import { SEAT_KEYS, anglesFor } from '../lib/firstCutLayout'
import FirstCutSettings from '../components/FirstCutSettings'
import useFirstCutPlay from '../hooks/useFirstCutPlay'
import useGameKeys from '../hooks/useGameKeys'
import { useAuth } from '../lib/AuthContext'
import { newRaceSeed } from '../lib/raceLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import {
  BOT_LEVELS, DEFAULT_FC_CONFIG, FC_TARGET, addReport, botTapAt, describeFcConfig, indexAt, normalizeFcConfig, receipt,
} from '../lib/firstCutLogic'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'

// FIRST CUT on one phone: /local/firstcut puts 2 to 4 players round one table,
// /solo/firstcut is you against 1 to 3 bots. Same rules module and same play
// loop as the online race, with no network in between: the reports live in
// React state and the clock is the device's own.

const COUNT_STEP_MS = 650
const END_DELAY_MS = 800
const NAMES = ['P1', 'P2', 'P3', 'P4']

const Seg = ({ label, options, value, onChange, disabled }) => (
  <div className="space-y-1.5">
    <p className="font-pixel text-[8px] text-retro-dim tracking-widest">{label}</p>
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map(([v, text, sub]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cn(
            'min-h-11 flex-1 rounded border px-2 py-1 font-pixel text-[9px] transition-colors motion-reduce:transition-none flex flex-col items-center justify-center gap-0.5 disabled:opacity-60',
            value === v
              ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
              : 'border-retro-border bg-retro-card text-retro-dim hover:border-retro-p1/60 hover:text-retro-text',
          )}
        >
          <span>{text}</span>
          {sub && <span className="text-[7px] text-retro-dim">{sub}</span>}
        </button>
      ))}
    </div>
  </div>
)

function FirstCutPlay({ local }) {
  const { profile } = useAuth()
  const [config, setConfig] = useState(DEFAULT_FC_CONFIG)
  const [count, setCount] = useState(2)             // seats on the table (solo: you + bots)
  const [level, setLevel] = useState('normal')
  const [record, setRecord] = useState(() => readBotRecord('firstcut'))
  const [phase, setPhase] = useState('setup')       // setup | countdown | play | over
  const [countdown, setCountdown] = useState(0)
  const [game, setGame] = useState(() => ({ seed: newRaceSeed(), n: 0 }))
  const [reports, setReports] = useState({})
  const startRef = useRef(0)
  const tableRef = useRef(null)
  const endedRef = useRef(null)

  const seats = useMemo(() => Array.from({ length: count }, (_, i) => (
    local
      ? { id: `p${i}`, slot: i, name: NAMES[i], bot: false }
      : i === 0
        ? { id: 'you', slot: 0, name: String(profile?.displayName || 'YOU').toUpperCase().slice(0, 12), bot: false }
        : { id: `bot${i}`, slot: i, name: 'BOT', bot: true }
  )), [local, count, profile?.displayName])
  const racers = useMemo(() => seats.map(s => s.id), [seats])
  const angles = useMemo(() => anglesFor(count), [count])
  const slotOf = useCallback((id) => seats.find(s => s.id === id)?.slot ?? 0, [seats])
  const getTime = useCallback(() => (phase === 'play' ? performance.now() - startRef.current : null), [phase])

  const play = useFirstCutPlay({
    seed: game.seed, config, seats, angles, racers, slotOf, reports, target: FC_TARGET,
    getTime, active: phase === 'play', tableRef, resetKey: game.n,
  })
  const winner = play.res.winner

  const begin = () => {
    endedRef.current = null
    setGame(g => ({ seed: newRaceSeed(), n: g.n + 1 }))
    setReports({})
    setCountdown(3)
    sounds.cutTick(false)
    setPhase('countdown')
  }

  // 3 - 2 - 1, then the clock starts.
  useEffect(() => {
    if (phase !== 'countdown') return undefined
    let c = 3
    const id = setInterval(() => {
      c -= 1
      if (c > 0) { setCountdown(c); sounds.cutTick(false); return }
      clearInterval(id)
      startRef.current = performance.now()
      sounds.cutTick(true)
      setPhase('play')
    }, COUNT_STEP_MS)
    return () => clearInterval(id)
  }, [phase])

  const onTap = (i) => {
    if (phase !== 'play' || winner) return
    const id = seats[i]?.id
    if (!id) return
    const plan = play.tap(id)
    setReports(r => addReport(r, id, plan))
  }

  useGameKeys((e) => {
    if (e.repeat) return false
    const k = e.key.toLowerCase()
    let i = SEAT_KEYS.indexOf(k)
    if (k === ' ' && !local) i = 0
    if (i < 0 || i >= seats.length || seats[i].bot) return false
    onTap(i)
    return true
  }, { enabled: phase === 'play' })

  // Bots decide once per item: when they would tap, or never.
  useEffect(() => {
    if (phase !== 'play' || play.index < 0 || winner || !play.entry) return undefined
    const k = play.index
    const e = play.entry
    const timers = []
    for (const s of seats) {
      if (!s.bot) continue
      const ms = botTapAt(level, e)
      if (ms == null) continue
      const wait = Math.max(0, e.start + ms - (performance.now() - startRef.current))
      timers.push(setTimeout(() => {
        const now = performance.now() - startRef.current
        if (indexAt(game.seed, config, now) !== k) return
        const plan = play.tap(s.id)
        setReports(r => addReport(r, s.id, plan))
      }, wait))
    }
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per item; play.tap is stable
  }, [phase, play.index, winner])

  // Someone reached the target: let the last cut land, then the results.
  useEffect(() => {
    if (phase !== 'play' || !winner || endedRef.current === game.n) return undefined
    endedRef.current = game.n
    const t = setTimeout(() => {
      const humanWon = local ? true : winner === 'you'
      tableRef.current?.fx?.confetti(humanWon ? [255, 255, 255] : [255, 214, 80])
      if (!local) {
        if (humanWon) sounds.matchWin(); else sounds.lose()
        setRecord(recordBotResult('firstcut', level, humanWon ? 'win' : 'loss'))
      } else {
        sounds.matchWin()
      }
      setPhase('over')
    }, END_DELAY_MS)
    return () => clearTimeout(t)
  }, [phase, winner, game.n, local, level])

  const rows = phase === 'over' ? receipt(play.res, racers) : []
  const winnerSeat = seats.find(s => s.id === winner)
  const busy = phase === 'countdown' || phase === 'play'
  const cfgLabel = describeFcConfig(config)

  return (
    <div className="w-full max-w-sm mx-auto space-y-3">
      <FirstCutTable
        ref={tableRef}
        layout={count}
        short
        label={local ? 'First Cut, one phone' : 'First Cut against bots'}
        {...play.tableProps}
        onTap={onTap}
      >
        {phase === 'setup' && (
          <div className="fc-overlay">
            <div className="space-y-3">
              <p className="fc-big">FIRST CUT</p>
              <p className="font-mono text-[12px] leading-relaxed text-retro-dim">
                Cut the fruit. Leave the lookalikes.<br />First to {FC_TARGET} wins.
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">{cfgLabel}</p>
              <button
                type="button"
                onClick={begin}
                className="min-h-11 px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press"
              >
                START
              </button>
            </div>
          </div>
        )}
        {phase === 'countdown' && (
          <div className="fc-overlay"><span key={countdown} className="fc-count" aria-live="assertive">{countdown || ''}</span></div>
        )}
        {phase === 'over' && (
          <div className="fc-overlay">
            <div className="space-y-3 w-full">
              <p className="fc-big" style={{ color: winnerSeat ? `rgb(var(--c-p${winnerSeat.slot + 1}))` : undefined }}>
                {winnerSeat ? (local ? `${winnerSeat.name} WINS` : winnerSeat.bot ? 'BOT WINS' : 'YOU WIN!') : 'GAME OVER'}
              </p>
              <table className="mx-auto font-mono text-[11px] text-retro-text">
                <thead>
                  <tr className="text-retro-dim font-pixel text-[7px]">
                    <th className="px-2 py-1" /><th className="px-2 py-1">SCORE</th><th className="px-2 py-1">AVG CUT</th><th className="px-2 py-1">BLOCKED</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = seats.find(x => x.id === r.id)
                    return (
                      <tr key={r.id}>
                        <td className="px-2 py-1 font-pixel text-[9px]" style={{ color: `rgb(var(--c-p${(s?.slot ?? 0) + 1}))` }}>{s?.name}</td>
                        <td className="px-2 py-1 text-center">{r.score}</td>
                        <td className="px-2 py-1 text-center">{r.avgMs != null ? `${r.avgMs} ms` : '—'}</td>
                        <td className="px-2 py-1 text-center">{r.blocks}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={begin}
                  className="min-h-11 px-5 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press"
                >
                  REMATCH
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('setup')}
                  className="min-h-11 px-4 py-2.5 border border-retro-border text-retro-text font-pixel text-[10px] rounded hover:border-retro-cta transition press"
                >
                  CHANGE SETUP
                </button>
              </div>
            </div>
          </div>
        )}
      </FirstCutTable>

      <p className="font-pixel text-[8px] text-retro-dim text-center leading-relaxed">
        {local
          ? 'LAY THE PHONE FLAT · ONE THUMB EACH · KEYS A · L · Q · P'
          : 'TAP YOUR PAD WHEN A FRUIT SHOWS · SPACE WORKS TOO'}
      </p>

      <section className="bg-retro-card border border-retro-border rounded p-3 space-y-3" aria-label="Players">
        {local ? (
          <Seg
            label="PLAYERS"
            value={count}
            disabled={busy}
            onChange={setCount}
            options={[[2, '2'], [3, '3'], [4, '4']]}
          />
        ) : (
          <>
            <Seg
              label="BOTS"
              value={count}
              disabled={busy}
              onChange={setCount}
              options={[[2, '1 BOT'], [3, '2 BOTS'], [4, '3 BOTS']]}
            />
            <div className="space-y-1.5">
              <p className="font-pixel text-[8px] text-retro-dim tracking-widest">BOT LEVEL</p>
              <div role="radiogroup" aria-label="Bot level" className="flex gap-1.5">
                {BOT_LEVELS.map(d => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={level === d}
                    disabled={busy}
                    aria-label={`${d} bots, your record ${describeLevelRecord(record[d])}`}
                    onClick={() => setLevel(d)}
                    className={cn(
                      'min-h-11 flex-1 rounded border px-2 py-1 font-pixel text-[9px] uppercase transition-colors motion-reduce:transition-none flex flex-col items-center justify-center gap-0.5 disabled:opacity-60',
                      level === d
                        ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
                        : 'border-retro-border bg-retro-card text-retro-dim hover:border-retro-p1/60 hover:text-retro-text',
                    )}
                  >
                    <span>{d}</span>
                    {formatLevelRecord(record[d]) && <span className="text-[7px] text-retro-dim">{formatLevelRecord(record[d])}</span>}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      <FirstCutSettings
        config={config}
        disabled={busy}
        title="TABLE SETUP"
        note={busy ? 'LOCKED WHILE PLAYING' : null}
        onChange={(patch) => setConfig(c => normalizeFcConfig({ ...c, ...patch }))}
      />
    </div>
  )
}

/** /solo/firstcut: you against 1 to 3 bots. */
export default function FirstCutSolo() {
  return <FirstCutPlay local={false} />
}

/** /local/firstcut: 2 to 4 players on one phone. */
export function FirstCutLocal() {
  return <FirstCutPlay local />
}
