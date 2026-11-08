import { useCallback, useEffect, useRef, useState } from 'react'
import SideKickPlay from '../components/SideKickPlay'
import SideKickPrefs, { PrefRow } from '../components/SideKickPrefs'
import SideKickStandings from '../components/SideKickStandings'
import useSideKickRun, { ordinal } from '../hooks/useSideKickRun'
import { useSideKickControls } from '../hooks/useSideKickControls'
import { useSideKickPrefs } from '../hooks/useSideKickPrefs'
import { useAuth } from '../lib/AuthContext'
import { defaultAvatarForId } from '../lib/avatarKit'
import {
  TRACKS, DUST_TRACKS, TRACK_ORDER, DUST_TRACK_ORDER, TRACK_SEED, DIFFICULTY, DIFFICULTY_IDS, CUP_RACES, BOT_NAMES, DUST_BOT_NAMES,
  createWorld, standings, cupAward, formatRaceTime,
} from '../lib/sideKickLogic'
import { sounds } from '../lib/sounds'
import { recordBotResult, readBotRecord, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'
import { cn } from '@/lib/utils'

// SIDE KICK on one phone: you against three bots, three races to a cup (3 / 2 / 1 / 0
// points a race). The same sim the online room runs, with no network. Behind the
// setup sheet the four bots race each other, so the road is never empty. DUST KICK
// is this page with `dust` on: the Western rules, roads and wording.

const VARIANT = {
  sidekick: {
    key: 'sidekick', title: 'SIDE KICK', storage: 'sidekick-settings', roads: TRACKS, order: TRACK_ORDER, botNames: BOT_NAMES, kick: 'KICK', boost: 'BOOST', road: 'road',
    choices: [['tour', 'CUP TOUR'], ['meadow', 'MEADOW'], ['pass', 'SWITCHBACK'], ['rush', 'RUSH HOUR'], ['random', 'RANDOM']],
    blurb: 'Three races, three bots. 3 / 2 / 1 / 0 points a race.',
    hint: 'TILT OR HOLD STEER · TAP KICK (IT AIMS AT THE RIDER BESIDE YOU) · TAP BOOST (NEAR MISSES AND SLIPSTREAM FILL IT) · KEYS ← → K SPACE C',
  },
  dustkick: {
    key: 'dustkick', title: 'DUST KICK', storage: 'dustkick-settings', roads: DUST_TRACKS, order: DUST_TRACK_ORDER, botNames: DUST_BOT_NAMES, kick: 'BUCK', boost: 'SPURS', road: 'trail',
    choices: [['tour', 'CUP TOUR'], ['canyon', 'CANYON'], ['prairie', 'PRAIRIE'], ['town', 'TOWN']],
    blurb: 'Three races, three bots. 3 / 2 / 1 / 0 points a race.',
    hint: 'TILT OR HOLD STEER · TAP BUCK (IT AIMS AT THE RIDER BESIDE YOU) · TAP SPURS (HAY, KICKS AND DUST FILL IT) · LASSO WITH A COIL · KEYS ← → K SPACE E',
  },
}
const LEVEL_LABEL = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' }
const DEFAULTS = { track: 'tour', level: 'normal', pixel: false }

function readSettings(v) {
  try {
    const raw = JSON.parse(localStorage.getItem(v.storage) || 'null')
    return {
      track: v.choices.some(([id]) => id === raw?.track) ? raw.track : DEFAULTS.track,
      level: DIFFICULTY_IDS.includes(raw?.level) ? raw.level : DEFAULTS.level,
      pixel: !!raw?.pixel,
    }
  } catch { return { ...DEFAULTS } }
}

const blankCup = () => ({ race: 0, pts: [0, 0, 0, 0], order: null })
const randomSeed = () => (Math.random() * 1e9) | 0

/** The road id for race `n` of a cup under these settings. */
const trackIdFor = (cfg, n, v) => (cfg.track === 'tour' ? v.order[n % v.order.length] : cfg.track)
/** A road to build: its id and seed (a fresh seed each time for RANDOM). */
function roadFor(cfg, n, v) {
  const id = trackIdFor(cfg, n, v)
  return { id, seed: id === 'random' ? randomSeed() : TRACK_SEED }
}

function readStoredAvatar() {
  try { return localStorage.getItem('playerAvatar') } catch { return null }
}

const chip = (on) => cn(
  'press min-h-9 rounded border-2 px-2.5 py-1.5 font-pixel text-[8px] uppercase transition',
  on ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
)

/**
 * A card over the road with its action row pinned at the bottom, so the primary button is always on screen.
 * The body scrolls when it is taller than the road, and a MORE cue shows while there is more below.
 */
function Sheet({ children, footer, testId }) {
  const bodyRef = useRef(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return undefined
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 6)
    check()
    el.addEventListener('scroll', check, { passive: true })
    if (typeof ResizeObserver === 'undefined') return () => el.removeEventListener('scroll', check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [])
  return (
    <div className="absolute inset-0 flex items-center justify-center p-2.5">
      <div data-testid={testId} className="seat-pop relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-retro-border bg-retro-card/90 text-center backdrop-blur-md">
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-1.5 pt-2.5">{children}</div>
        {more && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[58px] flex h-8 items-end justify-center bg-gradient-to-t from-retro-card to-transparent pb-0.5 font-pixel text-[7px] text-retro-dim" data-testid="sidekick-more" aria-hidden="true">▼ MORE</div>
        )}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-retro-border bg-retro-card px-3 py-2">{footer}</div>
      </div>
    </div>
  )
}

function Demo({ variant }) {
  const v = VARIANT[variant]
  const dust = variant === 'dustkick'
  const { profile } = useAuth()
  const myAvatar = profile?.avatar || readStoredAvatar() || defaultAvatarForId(`${v.key}-you`)
  const [cfg, setCfg] = useState(() => readSettings(v))
  const [phase, setPhase] = useState('idle')          // idle | racing | results
  const [cup, setCup] = useState(blankCup)
  const [result, setResult] = useState(null)
  const worldRef = useRef(null)
  const phaseRef = useRef('idle')
  const cfgRef = useRef(cfg)
  const cupRef = useRef(cup)
  const [record, setRecord] = useState(() => readBotRecord(v.key))
  const names = ['YOU', ...v.botNames.slice(0, 3)]
  const avatars = [myAvatar, ...names.slice(1).map((n) => defaultAvatarForId(`${v.key}-${n}`))]
  const avatarsRef = useRef(avatars)
  useEffect(() => { avatarsRef.current = avatars })

  const [prefs] = useSideKickPrefs()
  const controls = useSideKickControls({ enabled: phase === 'racing' })
  const setPhaseBoth = useCallback((p) => { phaseRef.current = p; setPhase(p) }, [])

  const attract = useCallback(() => {
    const road = roadFor(cfgRef.current, 0, v)
    worldRef.current = createWorld({
      seed: road.seed, trackId: road.id, difficulty: cfgRef.current.level, phase: 'race', dust,
      riders: names.map((name, i) => ({ id: `r${i}`, name, avatar: avatarsRef.current[i], bot: true })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names is a constant list
  }, [])

  useEffect(() => { attract() }, [attract])

  const applyCfg = (patch) => {
    const next = { ...cfgRef.current, ...patch }
    cfgRef.current = next
    setCfg(next)
    try { localStorage.setItem(v.storage, JSON.stringify(next)) } catch { /* storage unavailable */ }
    const fresh = blankCup()
    cupRef.current = fresh
    setCup(fresh)
    setResult(null)
    setPhaseBoth('idle')
    attract()
  }

  const startRace = (cupState = cupRef.current) => {
    sounds.touch()
    const road = roadFor(cfgRef.current, cupState.race, v)
    // Last place in the previous race starts in front: the order is best first, so it is back to front already.
    const grid = cupState.order
    worldRef.current = createWorld({
      seed: road.seed, trackId: road.id, difficulty: cfgRef.current.level, phase: 'count', dust,
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
    setRecord(recordBotResult(v.key, cfgRef.current.level, won ? 'win' : 'loss'))
    setResult({
      rows: order.map((r, place) => ({ i: r.i, name: r.name, done: r.done, time: r.time, hits: r.hits, offs: r.offs, paybacks: r.paybacks, gain: award[r.i] || 0, place: place + 1 })),
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
    ui: { pixel: cfg.pixel, avatars: true, camera: prefs.cam },
    onEvent: (ev, world) => { if (ev.t === 'results') finishRace(world) },
    afterFrame: (world) => {
      if (phaseRef.current === 'idle' && world.phase === 'done') attract()
    },
  })

  const roadId = trackIdFor(cfg, phase === 'idle' ? 0 : Math.max(0, cup.race - (phase === 'results' ? 1 : 0)), v)
  const raceNo = Math.min(CUP_RACES, (phase === 'results' ? cup.race : cup.race + 1))
  const status = phase === 'idle' ? `${v.title} · SOLO` : `RACE ${raceNo} OF ${CUP_RACES} · ${v.roads[roadId].name}`
  const level = DIFFICULTY[cfg.level]?.label ?? 'NORMAL'
  const rec = record[cfg.level]

  let cover = null
  if (phase === 'idle') {
    cover = (
      <Sheet
        testId="sidekick-start"
        footer={<button type="button" onClick={startCup} data-testid="sidekick-go" className="press min-h-11 w-full rounded bg-retro-cta px-5 py-2.5 font-pixel text-xs text-retro-bg hover:shadow-neon-cta">START CUP</button>}
      >
        <p className="font-pixel text-xl leading-tight text-retro-p1 text-glow-p1">{v.title}</p>
        <p className="mt-1.5 font-mono text-[11px] leading-snug text-retro-dim">{v.blurb}</p>
        <div className="mt-2 space-y-1">
          <PrefRow label={dust ? 'TRAIL' : 'ROAD'} ariaLabel={dust ? 'Trail' : 'Road'}>
            {v.choices.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={cfg.track === id} onClick={() => applyCfg({ track: id })} className={chip(cfg.track === id)}>{label}</button>
            ))}
          </PrefRow>
          <PrefRow label="BOTS" ariaLabel="Bot level">
            {DIFFICULTY_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={cfg.level === id} onClick={() => applyCfg({ level: id })} className={chip(cfg.level === id)}>{LEVEL_LABEL[id]}</button>
            ))}
          </PrefRow>
          <PrefRow label="ART" ariaLabel="Art style">
            {[[false, 'SMOOTH'], [true, 'PIXEL']].map(([px, label]) => (
              <button key={label} type="button" aria-pressed={cfg.pixel === px} onClick={() => { const n = { ...cfgRef.current, pixel: px }; cfgRef.current = n; setCfg(n); try { localStorage.setItem(v.storage, JSON.stringify(n)) } catch { /* storage unavailable */ } }} className={chip(cfg.pixel === px)}>{label}</button>
            ))}
          </PrefRow>
          <SideKickPrefs dust={dust} />
          {rec && <p className="font-pixel text-[8px] text-retro-dim" aria-label={`Your record on ${level}: ${describeLevelRecord(rec)}`}>{level} RECORD {formatLevelRecord(rec)}</p>}
        </div>
      </Sheet>
    )
  } else if (phase === 'results' && result) {
    const me = result.rows.find((r) => r.i === 0)
    const best = Math.max(...cup.pts)
    const champs = cup.pts.map((p, i) => (p === best ? i : -1)).filter((i) => i >= 0)
    const standingsRows = result.rows.map((r) => ({
      i: r.i, name: r.name, avatar: avatars[r.i], place: r.place, time: r.done ? formatRaceTime(r.time) : 'RIDING',
      hits: r.hits, offs: r.offs, gain: r.gain, cup: cup.pts[r.i], paybacks: r.paybacks, me: r.i === 0,
    }))
    cover = (
      <Sheet
        testId="sidekick-results"
        footer={(
          <>
            {result.cupOver
              ? <button type="button" onClick={startCup} data-testid="sidekick-again" className="press min-h-11 rounded bg-retro-cta px-5 py-2.5 font-pixel text-xs text-retro-bg hover:shadow-neon-cta">NEW CUP</button>
              : <button type="button" onClick={() => startRace(cupRef.current)} data-testid="sidekick-again" className="press min-h-11 rounded bg-retro-cta px-5 py-2.5 font-pixel text-xs text-retro-bg hover:shadow-neon-cta">NEXT RACE</button>}
            <button type="button" onClick={() => { const fresh = blankCup(); cupRef.current = fresh; setCup(fresh); setPhaseBoth('idle'); attract() }} className="press min-h-11 rounded border border-retro-border px-4 py-2.5 font-pixel text-[9px] text-retro-dim hover:border-retro-p1/50">MENU</button>
          </>
        )}
      >
        <p className="mb-1.5 font-pixel text-xs leading-relaxed text-retro-p1">
          {result.cupOver
            ? (champs.includes(0) ? 'YOU WON THE CUP!' : `${names[champs[0]]} WON THE CUP`)
            : (me.place === 1 ? 'YOU WON THE ROAD' : `YOU FINISHED ${ordinal(me.place)}`)}
        </p>
        <SideKickStandings rows={standingsRows} dust={dust} />
      </Sheet>
    )
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <SideKickPlay run={run} controls={controls} avatars={avatars} enabled={phase === 'racing'} cover={cover} status={status} hideHud={phase !== 'racing'} dust={dust} />
      <p className="mt-2 text-center font-pixel text-[7px] leading-relaxed text-retro-dim">{v.hint}</p>
    </div>
  )
}

export default function SideKickDemo() {
  return <Demo variant="sidekick" />
}

export function DustKickDemo() {
  return <Demo variant="dustkick" />
}
