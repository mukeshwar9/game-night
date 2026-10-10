import { useEffect, useRef } from 'react'
import { ref, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import RaceShell from '../components/RaceShell'
import SideKickPlay from '../components/SideKickPlay'
import Avatar from '../components/Avatar'
import useSideKickRun, { ordinal } from '../hooks/useSideKickRun'
import { useSideKickControls } from '../hooks/useSideKickControls'
import { getServerNow } from '../hooks/useServerClock'
import { isRoomCoordinator } from '../lib/coordinator'
import { defaultAvatarForId } from '../lib/avatarKit'
import {
  TRACKS, TRACK_SEED, RACE_MAX, DT, MAXSPD, BOT_NAMES, CUP_RACES, SYNC_MS,
  createWorld, applyGhost, receiveKick, promoteBot, demoteBot, encodeRider, decodeRider, kickKey, parseKick,
  raceEntry, raceIsDone, raceDecided, decorateRound, rosterOf, isBotId, gridFor, normalizeGrid, roundTrack,
  trackForRace, trackLength, formatRaceTime,
} from '../lib/sideKickLogic'
import { cn } from '@/lib/utils'

// SIDE KICK online: a 2–4 rider road race with bots in the empty seats, run as a
// three-race cup inside RaceShell (lobby, READY, results, NEW MATCH). Each phone
// simulates only its own bike; the others are ghosts placed from their ~10 Hz
// reports under `round/stats/{round}/{uid}`. A kick is judged on the kicker's
// phone and delivered to the victim as `k/{n} = "victim|side"` on the kicker's
// node; the victim's phone applies the shove, the pip and the stagger. The room
// coordinator's phone also drives the bots, writing their reports under `botN`.

const RACE = {
  type: 'sidekick',
  title: 'SIDE KICK',
  sameWhat: 'ROAD',
  maxRacers: 4,
  rules: [
    'HOLD STEER · TAP KICK L / R TO HIT A RIDER BESIDE YOU',
    'THREE HITS UNSEAT A RIDER · TOO MANY KICKS TIRE YOU OUT',
    'BOTS FILL EMPTY SEATS · HOLD BOOST · SIT IN A WAKE',
    `${CUP_RACES} RACES · 3 / 2 / 1 / 0 POINTS A RACE · BEST CUP WINS`,
  ],
  baseMs: (RACE_MAX + 10) * 1000,
  scaled: false,
  hideClock: true,
  hideLive: true,
  liveCountdown: true,
  entry: (stats) => raceEntry(stats),
  isDone: raceIsDone,
  decided: raceDecided,
  decorate: decorateRound,
  durationMs: () => (RACE_MAX + 10) * 1000,
  // Each race of the cup rides the next named road; last place starts in front.
  start: (cur) => ({ extras: { track: trackForRace(Number(cur?.cupRaces) || 0), ...(cur?.raceResult?.grid ? { grid: cur.raceResult.grid } : {}) } }),
  row: (stats, round) => {
    const s = decodeRider(stats)
    const len = trackLength(roundTrack(round?.raw?.track))
    return {
      primary: s ? (s.fin ? formatRaceTime(s.fin / 1000) : `${Math.round(Math.min(1, s.z / len) * 100)}%`) : '—',
      secondary: s ? `${s.hk} KICKS · ${s.dn} FALLS` : '',
      progress: s ? Math.min(1, s.z / len) : null,
      status: !s ? 'idle' : s.fin ? 'done' : 'racing',
      detail: s ? String(Math.round(s.z)) : '',
    }
  },
}

const statsBase = (statsPath) => statsPath.slice(0, statsPath.lastIndexOf('/'))

function SideKickRacer({ game, round, mySeat, myStats, statsPath, goAt, phase }) {
  const players = game.players
  const roster = rosterOf(round.racers)
  const rosterKey = roster.join(',')
  const view = roster.indexOf(mySeat)
  const trackId = roundTrack(round.raw?.track)
  const avatars = roster.map((id) => (isBotId(id) ? defaultAvatarForId(`sidekick-${id}`) : players?.[id]?.avatar || null))
  const amCoord = isRoomCoordinator(mySeat, players, game.hostUid ?? null)
  const racing = phase === 'racing'

  const worldRef = useRef(null)
  const live = useRef({ stats: null, coord: amCoord, goAt, statsPath, players, myStats, grid: round.raw?.grid })
  useEffect(() => {
    live.current = { stats: game.round?.stats?.[round.id] ?? null, coord: amCoord, goAt, statsPath, players, myStats, grid: round.raw?.grid }
  })
  const seen = useRef(new Set())
  const net = useRef({ last: {}, errorAt: 0, finalSent: false })

  // One world per round. A reload mid-race resumes this rider from its last report,
  // and kicks already in the room are history, not new blows.
  useEffect(() => {
    const L = live.current
    const names = roster.map((id, i) => (isBotId(id) ? BOT_NAMES[Number(id.slice(3)) - 1] ?? 'BOT' : (L.players?.[id]?.name || 'RIDER').toUpperCase().slice(0, 8) || `R${i + 1}`))
    const world = createWorld({
      seed: TRACK_SEED, trackId, seedRng: round.seed ?? 1, phase: 'count', difficulty: 'normal',
      gridBackToFront: gridFor(roster, normalizeGrid(L.grid)),
      riders: roster.map((id, i) => ({
        id, name: names[i], avatar: avatars[i], bot: isBotId(id),
        local: id === mySeat || (isBotId(id) && L.coord),
      })),
    })
    const mine = decodeRider(L.myStats)
    const me = world.riders[view]
    if (mine && me && mine.z > 0) {
      me.z = mine.z; me.x = mine.x; me.speed = mine.v * MAXSPD
      me.kickCount = mine.kn; me.hits = mine.hk; me.offs = mine.dn; me.paybacks = mine.pb; me.pips = mine.pp
      if (mine.fin > 0) { me.done = true; me.time = mine.fin / 1000 }
    }
    seen.current = new Set()
    for (const [kid, raw] of Object.entries(L.stats || {})) {
      for (const n of Object.keys(raw?.k && typeof raw.k === 'object' ? raw.k : {})) seen.current.add(`${kid}#${n}`)
    }
    net.current = { last: {}, errorAt: 0, finalSent: false }
    worldRef.current = world
    return () => { worldRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new world per round / roster; the rest is read from `live`
  }, [round.id, rosterKey])

  const controls = useSideKickControls({ enabled: racing })

  const write = (id, patch) => {
    const L = live.current
    update(ref(db, `${statsBase(L.statsPath)}/${id}`), patch).catch(() => {
      if (Date.now() - net.current.errorAt > 4000) toast.error('SYNC FAILED — CHECK CONNECTION')
      net.current.errorAt = Date.now()
    })
  }

  const beforeFrame = (world) => {
    const L = live.current
    const now = getServerNow()
    const clockT = (now - L.goAt) / 1000
    if (clockT < 0) { world.phase = 'count'; world.countT = -clockT + DT } else if (world.phase === 'count') { world.phase = 'race'; world.events.push({ t: 'go' }) }
    for (const r of world.riders) {
      if (r.bot) {
        if (L.coord && !r.local) promoteBot(r)
        else if (!L.coord && r.local) demoteBot(r)
      }
    }
    const stats = L.stats || {}
    for (const r of world.riders) if (!r.local) applyGhost(world, r, decodeRider(stats[r.id]), now, view)
    // Kicks addressed to a rider this phone runs.
    for (const [kickerId, raw] of Object.entries(stats)) {
      const k = raw?.k
      if (!k || typeof k !== 'object') continue
      const by = roster.indexOf(kickerId)
      if (by < 0 || world.riders[by].local) continue
      for (const [n, v] of Object.entries(k)) {
        const key = `${kickerId}#${n}`
        if (seen.current.has(key)) continue
        seen.current.add(key)
        const p = parseKick(v)
        const to = p ? roster.indexOf(p.to) : -1
        if (p && to >= 0 && world.riders[to].local) receiveKick(world, to, by, p.side)
      }
    }
  }

  const afterFrame = (world, events) => {
    const now = getServerNow()
    const n = net.current
    for (const ev of events) {
      if (ev.t === 'send' && ev.kind === 'kick') {
        const kicker = world.riders[ev.by]
        write(kicker.id, { [`k/${kicker.kickCount}`]: kickKey(world.riders[ev.to].id, ev.side) })
      }
    }
    if (world.phase === 'done' && n.finalSent) return
    for (const r of world.riders) {
      if (!r.local) continue
      const urgent = events.some((e) => (e.t === 'down' && e.to === r.i) || (e.t === 'up' && e.to === r.i) || (e.t === 'finish' && e.to === r.i) || (e.t === 'swing' && e.by === r.i))
      const every = r.done ? 400 : SYNC_MS
      if (urgent || now - (n.last[r.id] || 0) >= every) {
        n.last[r.id] = now
        write(r.id, encodeRider(r, now))
      }
    }
    if (world.phase === 'done') n.finalSent = true
  }

  const run = useSideKickRun({
    worldRef, view: Math.max(0, view), enabled: view >= 0,
    getInput: racing ? controls.getInput : null,
    getClockT: () => (getServerNow() - live.current.goAt) / 1000,
    beforeFrame, afterFrame,
    ui: { pixel: false, avatars: true },
  })

  const cupRace = (Number(game.cupRaces) || 0) + 1
  const status = `RACE ${Math.min(CUP_RACES, cupRace)} OF ${CUP_RACES} · ${TRACKS[trackId].name}`
  const finished = run.hud?.done
  const cover = finished ? (
    <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
      <div className="seat-pop rounded-xl border border-retro-border bg-retro-card/85 px-3 pb-1.5 pt-2.5 font-pixel text-[9px] text-retro-text backdrop-blur-sm" data-testid="sidekick-finished">
        YOU FINISHED {ordinal(run.hud.place)} · WAITING FOR THE REST
      </div>
    </div>
  ) : null

  if (view < 0) return null
  return (
    <div className="mx-auto w-full max-w-sm">
      <SideKickPlay run={run} controls={controls} avatars={avatars} enabled={racing && !finished} cover={cover} status={status} />
    </div>
  )
}

/** The road result with everyone on it (bots too) and what it was worth. */
function SideKickFinal({ game, round, result, mySeat, players }) {
  if (!round || !result) return null
  const ids = rosterOf(round.racers)
  const order = Array.isArray(result.grid) ? result.grid.filter((id) => ids.includes(id)) : ids
  const nameOf = (id) => (isBotId(id) ? BOT_NAMES[Number(id.slice(3)) - 1] ?? 'BOT' : (players?.[id]?.name || 'RIDER')).toUpperCase()
  const avatarOf = (id) => (isBotId(id) ? defaultAvatarForId(`sidekick-${id}`) : players?.[id]?.avatar)
  return (
    <div className="space-y-2 rounded border border-retro-border bg-retro-card p-3" data-testid="sidekick-final">
      <p className="text-center font-pixel text-[9px] tracking-widest text-retro-dim">THE ROAD · BOTS INCLUDED</p>
      <ol className="space-y-1.5" aria-label="Road result">
        {order.map((id, i) => {
          const s = decodeRider(round.stats?.[id])
          const pts = result.points?.[id]
          return (
            <li key={id} className={cn('grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-2 rounded border px-2 py-1.5 font-pixel text-[9px]', id === mySeat ? 'border-retro-p1/60 bg-retro-tint-p1' : 'border-retro-border bg-retro-surface')}>
              <b className="w-8 text-retro-dim">{ordinal(i + 1)}</b>
              <Avatar id={avatarOf(id)} size={20} />
              <span className="truncate">{nameOf(id)}{id === mySeat ? ' (YOU)' : ''}</span>
              <em className="not-italic tabular-nums">{s?.fin ? formatRaceTime(s.fin / 1000) : s ? 'STILL RIDING' : 'DNF'}</em>
              <u className="col-span-4 mt-0.5 text-[7px] text-retro-dim no-underline">
                {s ? `${s.hk} KICKS · ${s.dn} FALLS` : ''}{pts != null ? ` · +${pts} PTS` : ''}{!isBotId(id) ? ` · CUP ${Number(game.scores?.[id]) || 0}` : ''}
              </u>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function SideKickGame(props) {
  return <RaceShell {...props} race={RACE} Racer={SideKickRacer} Final={SideKickFinal} />
}
