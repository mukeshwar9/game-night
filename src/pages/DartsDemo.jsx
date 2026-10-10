import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DartsTable from '../components/DartsTable'
import DartsSetup from '../components/DartsSetup'
import {
  BOT_LEVELS, DEFAULT_CFG, botTarget, botThrow, createRound, normalizeCfg, replay, standings, threeDartAverage, throwDart,
} from '../lib/dartsLogic'
import { useAuth } from '../lib/AuthContext'
import { sounds } from '../lib/sounds'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'
import { cn } from '@/lib/utils'

// STEADY HAND without a room: SOLO against a bot (/solo/darts) and PASS & PLAY
// for 2–4 on one phone (/local/darts). The match is the same round object the
// online room stores, kept in React state and played through the same replay,
// so every mode plays by one rules engine. The bot throws with the same aim
// model as a person (Nerves included), just with a wider error at EASY.

const BOT = 'bot'
const HANDOFF_MS = 1000
const BOT_THINK_MS = 520
const BOT_AIM_MS = 750

function Seg({ label, value, options, onChange }) {
  return (
    <div className="space-y-1">
      <p className="font-pixel text-[8px] tracking-widest text-retro-dim">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr overflow-hidden rounded border border-retro-border">
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn(
              'min-h-11 border-r border-retro-border px-1 font-pixel text-[8px] transition-colors last:border-r-0',
              value === v ? 'bg-retro-tint-cta text-retro-cta' : 'bg-retro-card text-retro-dim hover:text-retro-text',
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function DartsLocal({ mode = 'local' }) {
  const solo = mode === 'solo'
  const { profile } = useAuth()
  const myName = useMemo(() => {
    const stored = (() => { try { return localStorage.getItem('playerName') } catch { return '' } })()
    return String(profile?.displayName || stored || 'YOU').toUpperCase().slice(0, 12)
  }, [profile?.displayName])

  const [cfg, setCfg] = useState(DEFAULT_CFG)
  const [count, setCount] = useState(2)
  const [faceToFace, setFaceToFace] = useState(false)
  const [level, setLevel] = useState('normal')
  const [round, setRound] = useState(null)
  const [record, setRecord] = useState(() => readBotRecord('darts'))
  const [unlocked, setUnlocked] = useState(null)
  const tableRef = useRef(null)

  const uids = useMemo(() => (solo ? ['p0', BOT] : Array.from({ length: count }, (_, i) => `p${i}`)), [solo, count])
  const names = useMemo(() => {
    const out = {}
    uids.forEach((u, i) => { out[u] = u === BOT ? `BOT ${level.toUpperCase()}` : solo ? myName : (i === 0 ? myName : `P${i + 1}`) })
    return out
  }, [uids, solo, myName, level])
  const bots = useMemo(() => ({ [BOT]: true }), [])

  const state = useMemo(() => (round ? replay(round) : null), [round])
  const turnUid = state?.turnUid ?? null
  const botTurn = !!turnUid && turnUid === BOT

  const start = () => setRound(createRound(uids, normalizeCfg(cfg)))

  // A short lockout after every change of thrower in pass-and-play, so the tap
  // that hands the phone over cannot start the next player's aim.
  const handoffKey = state ? `${state.turnUid}:${state.visitNo}:${state.leg}` : null
  useEffect(() => {
    if (!handoffKey || solo) return undefined
    const id = setTimeout(() => setUnlocked(handoffKey), HANDOFF_MS)
    return () => clearTimeout(id)
  }, [handoffKey, solo])

  // The latest round, so a dart thrown a frame after another still lands on it.
  const roundRef = useRef(null)
  useEffect(() => { roundRef.current = round }, [round])
  const onThrow = useCallback((shot) => {
    const r = roundRef.current
    const cur = r && replay(r)
    const out = cur && throwDart(r, cur.turnUid, shot)
    if (!out) return false
    roundRef.current = out.round
    setRound(out.round)
    if (out.state.over) {
      const won = out.state.winner === 'p0'
      if (!solo || won) sounds.win(); else sounds.lose()
      if (solo) setRecord(recordBotResult('darts', level, won ? 'win' : 'loss'))
    }
    return true
  }, [solo, level])

  // The bot's visit, one dart at a time: think, slide the crosshair, throw.
  useEffect(() => {
    if (!state || state.over || !botTurn) return undefined
    let cancelled = false
    const table = tableRef.current
    const id = setTimeout(async () => {
      if (cancelled) return
      const rng = Math.random
      const target = botTarget(state, BOT, level, rng)
      const shot = botThrow(state, BOT, level, rng)
      await table?.aimThenThrow(target, shot, BOT_AIM_MS)
    }, BOT_THINK_MS)
    return () => { cancelled = true; clearTimeout(id); table?.cancelBot() }
  }, [state, botTurn, level])

  // ─── Setup ──────────────────────────────────────────────────────────────
  if (!state) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-3">
        <p className="text-center font-mono text-[11px] leading-relaxed text-retro-dim">
          {solo ? 'You against a bot. Same throw, same nerves.' : `Pass the phone: 2–4 players, three darts a visit.`}
        </p>
        {!solo && (
          <>
            <Seg label="PLAYERS" value={count} onChange={setCount} options={[[2, '2'], [3, '3'], [4, '4']]} />
            {count === 2 && (
              <Seg
                label="SEATING"
                value={faceToFace}
                onChange={setFaceToFace}
                options={[[false, 'SAME SIDE'], [true, 'FACE TO FACE']]}
              />
            )}
          </>
        )}
        {solo && (
          <div className="space-y-1">
            <p className="font-pixel text-[8px] tracking-widest text-retro-dim">BOT LEVEL</p>
            <div className="flex gap-1.5">
              {BOT_LEVELS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={level === d}
                  aria-label={`${d} bot, your record ${describeLevelRecord(record[d])}`}
                  onClick={() => setLevel(d)}
                  className={cn(
                    'press flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded border-2 font-pixel text-[8px] uppercase transition',
                    level === d ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
                  )}
                >
                  <span>{d}</span>
                  {formatLevelRecord(record[d]) && <span className="text-[7px] text-retro-dim">{formatLevelRecord(record[d])}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <DartsSetup cfg={cfg} onChange={(patch) => setCfg((c) => normalizeCfg({ ...c, ...patch }))} />
        <button
          type="button"
          onClick={start}
          className="press min-h-12 w-full rounded bg-retro-cta py-3 font-pixel text-xs text-retro-bg transition hover:shadow-neon-cta"
        >
          START
        </button>
      </div>
    )
  }

  // ─── Playing ────────────────────────────────────────────────────────────
  const humanTurn = !state.over && !botTurn
  const controls = humanTurn && (solo || unlocked === handoffKey)
  const turnIdx = state.seats.indexOf(turnUid)
  const flip = !solo && faceToFace && count === 2 && turnIdx === 1
  const winnerName = state.winner ? names[state.winner] : null
  const ranking = standings(state)

  return (
    <div className="mx-auto w-full max-w-md space-y-2.5">
      <DartsTable
        ref={tableRef}
        state={state}
        names={names}
        bots={bots}
        myUid={humanTurn ? turnUid : null}
        controls={controls}
        ctrl={state.cfg.ctrl}
        flip={flip}
        onThrow={onThrow}
      />
      {state.over && (
        <div className="space-y-2 text-center">
          <p className={cn('font-pixel text-sm', !solo || state.winner === 'p0' ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>
            {solo ? (state.winner === 'p0' ? 'YOU WIN!' : `${winnerName} WINS`) : `${winnerName} WINS!`}
          </p>
          <ol className="space-y-1 rounded border border-retro-border bg-retro-card p-2">
            {ranking.map((uid, i) => (
              <li key={uid} className="flex items-center gap-2 font-mono text-[11px]">
                <span className="w-4 font-pixel text-[8px] text-retro-dim">{i + 1}</span>
                <span className="flex-1 truncate text-left">{names[uid]}</span>
                <span className="font-pixel text-[9px] tabular-nums">
                  {state.cfg.mode === 'turf' ? `${state.points[uid]} PTS` : state.scores[uid] === 0 ? 'OUT' : `${state.scores[uid]} LEFT`}
                  {state.cfg.mode === 'x01' ? ` · ${threeDartAverage(state, uid)} AVG` : ''}
                </span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={start} className="press min-h-11 rounded bg-retro-cta py-2.5 font-pixel text-[9px] text-retro-bg transition hover:shadow-neon-cta">
              PLAY AGAIN
            </button>
            <button type="button" onClick={() => setRound(null)} className="press min-h-11 rounded border border-retro-border py-2.5 font-pixel text-[9px] text-retro-dim transition hover:text-retro-text">
              CHANGE SETUP
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
