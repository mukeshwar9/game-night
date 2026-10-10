import { useCallback, useEffect, useRef, useState } from 'react'
import SideKickPlay from '../components/SideKickPlay'
import Avatar from '../components/Avatar'
import useSideKickRun, { ordinal } from '../hooks/useSideKickRun'
import { useSideKickControls } from '../hooks/useSideKickControls'
import { useAuth } from '../lib/AuthContext'
import { defaultAvatarForId } from '../lib/avatarKit'
import {
  TRACKS, TRACK_ORDER, TRACK_SEED, DIFFICULTY, DIFFICULTY_IDS, CUP_RACES, BOT_NAMES,
  createWorld, standings, cupAward, formatRaceTime,
} from '../lib/sideKickLogic'
import { sounds } from '../lib/sounds'
import { recordBotResult, readBotRecord, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'
import { cn } from '@/lib/utils'

// SIDE KICK on one phone: you against three bots, three races to a cup (3 / 2 / 1 / 0
// points a race). The same sim the online room runs, with no network. Behind the
// setup sheet the four bots race each other, so the road is never empty.

const STORAGE_KEY = 'sidekick-settings'
const TRACK_CHOICES = [['tour', 'CUP TOUR'], ['meadow', 'MEADOW'], ['pass', 'SWITCHBACK'], ['rush', 'RUSH HOUR'], ['random', 'RANDOM']]
const LEVEL_LABEL = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' }
const DEFAULTS = { track: 'tour', level: 'normal', pixel: false }

function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return {
      track: TRACK_CHOICES.some(([id]) => id === raw?.track) ? raw.track : DEFAULTS.track,
      level: DIFFICULTY_IDS.includes(raw?.level) ? raw.level : DEFAULTS.level,
      pixel: !!raw?.pixel,
    }
  } catch { return { ...DEFAULTS } }
}

const blankCup = () => ({ race: 0, pts: [0, 0, 0, 0], order: null })
const randomSeed = () => (Math.random() * 1e9) | 0

/** The road id for race `n` of a cup under these settings. */
const trackIdFor = (cfg, n) => (cfg.track === 'tour' ? TRACK_ORDER[n % TRACK_ORDER.length] : cfg.track)
/** A road to build: its id and seed (a fresh seed each time for RANDOM). */
function roadFor(cfg, n) {
  const id = trackIdFor(cfg, n)
  return { id, seed: id === 'random' ? randomSeed() : TRACK_SEED }
}

function readStoredAvatar() {
  try { return localStorage.getItem('playerAvatar') } catch { return null }
}

const chip = (on) => cn(
  'press min-h-9 rounded border-2 px-2.5 py-1.5 font-pixel text-[8px] uppercase transition',
  on ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
)

function Sheet({ children, testId }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3">
      <div data-testid={testId} className="seat-pop w-full max-h-full overflow-y-auto rounded-2xl border border-retro-border bg-retro-card/85 p-4 text-center backdrop-blur-md">
        {children}
      </div>
    </div>
  )
}

export default function SideKickDemo() {
  const { profile } = useAuth()
  const myAvatar = profile?.avatar || readStoredAvatar() || defaultAvatarForId('sidekick-you')
  const [cfg, setCfg] = useState(readSettings)
  const [phase, setPhase] = useState('idle')          // idle | racing | results
  const [cup, setCup] = useState(blankCup)
  const [result, setResult] = useState(null)
  const worldRef = useRef(null)
  const phaseRef = useRef('idle')
  const cfgRef = useRef(cfg)
  const cupRef = useRef(cup)
  const [record, setRecord] = useState(() => readBotRecord('sidekick'))
  const names = ['YOU', ...BOT_NAMES.slice(0, 3)]
  const avatars = [myAvatar, ...names.slice(1).map((n) => defaultAvatarForId(`sidekick-${n}`))]
  const avatarsRef = useRef(avatars)
  useEffect(() => { avatarsRef.current = avatars })

  const controls = useSideKickControls({ enabled: phase === 'racing' })
  const setPhaseBoth = useCallback((p) => { phaseRef.current = p; setPhase(p) }, [])

  const attract = useCallback(() => {
    const road = roadFor(cfgRef.current, 0)
    worldRef.current = createWorld({
      seed: road.seed, trackId: road.id, difficulty: cfgRef.current.level, phase: 'race',
      riders: names.map((name, i) => ({ id: `r${i}`, name, avatar: avatarsRef.current[i], bot: true })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names is a constant list
  }, [])

  useEffect(() => { attract() }, [attract])

  const applyCfg = (patch) => {
    const next = { ...cfgRef.current, ...patch }
    cfgRef.current = next
    setCfg(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
    const fresh = blankCup()
    cupRef.current = fresh
    setCup(fresh)
    setResult(null)
    setPhaseBoth('idle')
    attract()
  }

  const startRace = (cupState = cupRef.current) => {
    sounds.touch()
    const road = roadFor(cfgRef.current, cupState.race)
    // Last place in the previous race starts in front: the order is best first, so it is back to front already.
    const grid = cupState.order
    worldRef.current = createWorld({
      seed: road.seed, trackId: road.id, difficulty: cfgRef.current.level, phase: 'count',
      gridBackToFront: grid,
      riders: names.map((name, i) => ({ id: `r${i}`, name, avatar: avatars[i], bot: i > 0 })),
    })
    controls.reset()
    run.rendererRef.current?.reset()
    setResult(null)
    setPhaseBoth('racing')
  }

  const startCup = () => {
    const fresh = blankCup()
    cupRef.current = fresh
    setCup(fresh)
    startRace(fresh)
  }

  const finishRace = (world) => {
    if (phaseRef.current !== 'racing') return
    const order = standings(world)
    const ids = order.map((r) => r.i)
    const paybacks = Object.fromEntries(world.riders.map((r) => [r.i, r.paybacks]))
    const award = cupAward(ids, paybacks)
    const pts = cupRef.current.pts.map((p, i) => p + (award[i] || 0))
    const next = { race: cupRef.current.race + 1, pts, order: ids }
    cupRef.current = next
    setCup(next)
    const won = ids[0] === 0
    if (won) sounds.win(); else sounds.lose()
    setRecord(recordBotResult('sidekick', cfgRef.current.level, won ? 'win' : 'loss'))
    setResult({
      rows: order.map((r, place) => ({ i: r.i, name: r.name, done: r.done, time: r.time, hits: r.hits, offs: r.offs, gain: award[r.i] || 0, place: place + 1 })),
      cupOver: next.race >= CUP_RACES,
      race: next.race,
    })
    setPhaseBoth('results')
  }

  const run = useSideKickRun({
    worldRef,
    view: 0,
    enabled: true,
    getInput: phase === 'racing' ? controls.getInput : null,
    ui: { pixel: cfg.pixel, avatars: true },
    onEvent: (ev, world) => { if (ev.t === 'results') finishRace(world) },
    afterFrame: (world) => {
      if (phaseRef.current === 'idle' && world.phase === 'done') attract()
    },
  })

  const roadId = trackIdFor(cfg, phase === 'idle' ? 0 : Math.max(0, cup.race - (phase === 'results' ? 1 : 0)))
  const raceNo = Math.min(CUP_RACES, (phase === 'results' ? cup.race : cup.race + 1))
  const status = phase === 'idle' ? 'SIDE KICK · SOLO' : `RACE ${raceNo} OF ${CUP_RACES} · ${TRACKS[roadId].name}`
  const level = DIFFICULTY[cfg.level]?.label ?? 'NORMAL'
  const rec = record[cfg.level]

  let cover = null
  if (phase === 'idle') {
    cover = (
      <Sheet testId="sidekick-start">
        <p className="font-pixel text-2xl leading-tight text-retro-p1 text-glow-p1">SIDE KICK</p>
        <p className="mt-2 font-mono text-xs leading-relaxed text-retro-dim">Three races, three bots. Pull level and kick them off the road. 3 / 2 / 1 / 0 points a race.</p>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Road">
            {TRACK_CHOICES.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={cfg.track === id} onClick={() => applyCfg({ track: id })} className={chip(cfg.track === id)}>{label}</button>
            ))}
          </div>
          <div className="flex justify-center gap-1.5" role="group" aria-label="Bot level">
            {DIFFICULTY_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={cfg.level === id} onClick={() => applyCfg({ level: id })} className={chip(cfg.level === id)}>{LEVEL_LABEL[id]}</button>
            ))}
          </div>
          <div className="flex justify-center gap-1.5" role="group" aria-label="Art style">
            {[[false, 'SMOOTH'], [true, 'PIXEL']].map(([px, label]) => (
              <button key={label} type="button" aria-pressed={cfg.pixel === px} onClick={() => { const n = { ...cfgRef.current, pixel: px }; cfgRef.current = n; setCfg(n); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(n)) } catch { /* storage unavailable */ } }} className={chip(cfg.pixel === px)}>{label}</button>
            ))}
          </div>
          {rec && <p className="font-pixel text-[8px] text-retro-dim" aria-label={`Your record on ${level}: ${describeLevelRecord(rec)}`}>{level} RECORD {formatLevelRecord(rec)}</p>}
        </div>
        <button type="button" onClick={startCup} data-testid="sidekick-go" className="press mt-3 min-h-11 rounded bg-retro-cta px-5 py-2.5 font-pixel text-xs text-retro-bg hover:shadow-neon-cta">START CUP</button>
      </Sheet>
    )
  } else if (phase === 'results' && result) {
    const me = result.rows.find((r) => r.i === 0)
    const best = Math.max(...cup.pts)
    const champs = cup.pts.map((p, i) => (p === best ? i : -1)).filter((i) => i >= 0)
    cover = (
      <Sheet testId="sidekick-results">
        <p className="font-pixel text-xs leading-relaxed text-retro-text">
          {result.cupOver
            ? (champs.includes(0) ? 'YOU WON THE CUP!' : `${names[champs[0]]} WON THE CUP`)
            : (me.place === 1 ? 'YOU WON THE ROAD' : `YOU FINISHED ${ordinal(me.place)}`)}
        </p>
        <ol className="mt-3 space-y-1.5 text-left">
          {result.rows.map((r) => (
            <li key={r.i} className={cn('grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-2 rounded-lg px-2 py-1.5 font-pixel text-[9px]', r.i === 0 ? 'bg-retro-tint-p1 outline outline-2 outline-retro-p1/50' : 'bg-retro-card/60')}>
              <b className="text-retro-dim">{ordinal(r.place)}</b>
              <Avatar id={avatars[r.i]} size={24} />
              <span className="truncate">{r.name}</span>
              <em className="not-italic tabular-nums">{r.done ? formatRaceTime(r.time) : 'STILL RIDING'}</em>
              <u className="col-span-4 mt-0.5 text-[7px] text-retro-dim no-underline">{r.hits} KICKS · {r.offs} FALLS · +{r.gain} PTS · CUP {cup.pts[r.i]}</u>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {result.cupOver
            ? <button type="button" onClick={startCup} data-testid="sidekick-again" className="press min-h-11 rounded bg-retro-cta px-5 py-2.5 font-pixel text-xs text-retro-bg hover:shadow-neon-cta">NEW CUP</button>
            : <button type="button" onClick={() => startRace(cupRef.current)} data-testid="sidekick-again" className="press min-h-11 rounded bg-retro-cta px-5 py-2.5 font-pixel text-xs text-retro-bg hover:shadow-neon-cta">NEXT RACE</button>}
          <button type="button" onClick={() => { const fresh = blankCup(); cupRef.current = fresh; setCup(fresh); setPhaseBoth('idle'); attract() }} className="press min-h-11 rounded border border-retro-border px-4 py-2.5 font-pixel text-[9px] text-retro-dim hover:border-retro-p1/50">MENU</button>
        </div>
      </Sheet>
    )
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <SideKickPlay run={run} controls={controls} avatars={avatars} enabled={phase === 'racing'} cover={cover} status={status} hideHud={phase === 'idle'} />
      <p className="mt-2 text-center font-pixel text-[7px] leading-relaxed text-retro-dim">
        HOLD STEER · TAP KICK L / R · HOLD BOOST · KEYS ← → A D SPACE
      </p>
    </div>
  )
}
