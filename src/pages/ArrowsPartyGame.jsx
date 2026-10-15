import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import RaceShell from '../components/RaceShell'
import ArrowsBoard from '../components/ArrowsBoard'
import ArrowsPartySettings from '../components/ArrowsPartySettings'
import { Lives } from '../components/ArrowsHud'
import { getServerNow } from '../hooks/useServerClock'
import { applyArrowTap, normalizeGone, countGone } from '../lib/arrowsLogic'
import {
  PARTY_ROUND_MS, PARTY_FREEZE_MS, PARTY_LIVES, PARTY_LAYOUT_INFO, SABOTAGE_STREAK, SABOTAGE_CLEARS,
  partyTier, partyLevel, buildPartyPicture, withPartyCrates, pictureGone, normalizePartyStats, partyIsDone, partyEntry,
  partyLiveKey, partyUsesLives, partyLivesLeft, formatPartyTime, normalizePartyConfig, describePartyConfig,
  normalizeDrops, dropTarget, dropValue, partyCrates, botIdsFor, botName, botTimeline, botPatch, isBotId,
} from '../lib/arrowsPartyLogic'
import { roomCoordinator } from '../lib/coordinator'
import { defaultAvatarForId } from '../lib/avatarKit'
import { melodicNote } from '../lib/arrowsSoundLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// ARROWS PARTY: 2–4 racers clear the same seeded puzzle at the same time on one
// shared picture (arrowsPartyLogic.js). Your zone is the live board at the
// bottom; the others are dim silhouettes that empty as their owners clear.
// Each phone simulates only its own zone: a tap resolves and animates on the
// same frame, and only the clear events travel — `round/stats/{round}/{uid}`
// holds `g/{index}` (a cleared arrow, write-once), `m` (blocked taps), `fin`
// (ms from the go signal to the last clear) and `x` (knocked out, 2 racers).
// RaceShell runs the room around it: lobby, READY, countdown, the round-end
// transaction and a cup (3 / 5 / 7 rounds, 3 / 2 / 1 / 0 points by finish
// order — `placementPoints`).

const TONES = ['p1', 'p2', 'p3', 'p4']
const TONE_TEXT = { p1: 'text-retro-p1', p2: 'text-retro-p2', p3: 'text-retro-cta', p4: 'text-retro-win' }

// The puzzle a round plays: the seeded zone board and its arrow count. A few
// rounds are kept so the live table, the board and the finish check reuse one.
const puzzleCache = new Map()
function puzzleFor(seed, n, tier) {
  const key = `${seed}|${n}|${tier}`
  let hit = puzzleCache.get(key)
  if (!hit) {
    const base = partyLevel(seed, n, tier)
    hit = { base, per: base.arrows.length }
    puzzleCache.set(key, hit)
    if (puzzleCache.size > 8) puzzleCache.delete(puzzleCache.keys().next().value)
  }
  return hit
}
const nameFor = (players, uid, fallback = 'PLAYER') => (isBotId(uid) ? botName(uid) : (players?.[uid]?.name || fallback)).toUpperCase()
const roundPuzzle = (round) => puzzleFor(round.seed, round.racers.length, partyTier(round.raw?.tier))

const RACE = {
  type: 'arrowsparty',
  title: 'ARROWS PARTY',
  sameWhat: 'PUZZLE',
  maxRacers: 4,
  rules: [
    'EVERYONE CLEARS THE SAME PUZZLE ON ONE SHARED BOARD · YOURS IS AT THE BOTTOM',
    'TAP AN ARROW WHOSE PATH IS CLEAR · IT SLIDES OFF YOUR ZONE',
    'TWO RACERS: 3 LIVES · THREE OR FOUR: A BLOCKED TAP FREEZES YOU 2 S',
  ],
  rulesFor: (game, config) => {
    const c = normalizePartyConfig(config)
    return [
      ...RACE.rules,
      ...(c.sabotage ? [`SABOTAGE ON: ${SABOTAGE_STREAK} CLEARS IN A ROW DROP A CRATE ON THE LEADER`] : []),
      `${c.rounds} ROUNDS · 3 / 2 / 1 / 0 POINTS BY FINISH ORDER · BEST CUP WINS`,
    ]
  },
  baseMs: PARTY_ROUND_MS.medium,
  scaled: false,
  configKey: 'arrowsPartyConfig',
  normalizeConfig: normalizePartyConfig,
  Config: ArrowsPartySettings,
  describeConfig: describePartyConfig,
  // The host's picks freeze once the cup is under way.
  configLocked: (game) => Number(game?.cupRaces) > 0,
  durationMs: (cur, config) => PARTY_ROUND_MS[partyTier(config?.tier)],
  // The round locks its own difficulty, so a later settings edit never reshapes a live round.
  // AI racers fill empty seats (up to four racers in all); their speed defaults to the room difficulty.
  botsFor: (room, config, humans) => botIdsFor(humans, config?.bots),
  botName,
  botAvatar: (id) => defaultAvatarForId(`arrowsparty-${id}`),
  start: (cur, seed, config, { bots = [] } = {}) => ({
    extras: {
      tier: partyTier(config?.tier),
      sab: config?.sabotage === true,
      ...(bots.length ? { bots: bots.length, botSpeed: config?.botSpeed ?? partyTier(config?.tier), botHost: roomCoordinator(cur.players, cur.hostUid ?? null) } : {}),
    },
  }),
  entry: (stats) => partyEntry(stats),
  isDone: partyIsDone,
  liveKey: (stats, round) => (round?.id ? partyLiveKey(stats, roundPuzzle(round).per) : null),
  row: (stats, round) => {
    if (!round?.id) return { primary: '—', secondary: '', progress: null, status: 'idle', detail: '' }
    const { per } = roundPuzzle(round)
    const s = normalizePartyStats(stats, per)
    const lives = partyUsesLives(round.racers.length)
    return {
      primary: s.out ? 'OUT' : s.fin != null ? formatPartyTime(s.fin) : stats ? `${Math.round((s.cleared / per) * 100)}%` : '—',
      secondary: s.misses ? (lives ? `${partyLivesLeft(s.misses)} LIVES` : `${s.misses} BLOCKED`) : '',
      progress: s.fin != null ? 1 : s.cleared / per,
      status: s.out ? 'out' : s.fin != null ? 'done' : stats ? 'racing' : 'idle',
      detail: `${s.cleared}/${per}`,
    }
  },
}

/** Zone overlay for the board: each racer's tone, % cleared (or finish time) and the seat's rectangle. */
function zoneOverlay({ zones, racers, perSeat, stats, per, mySeat }) {
  return zones.map((z) => {
    const uid = racers[z.seat]
    const s = normalizePartyStats(stats[uid], per)
    const cleared = uid === mySeat ? countGone(perSeat[z.seat]) : s.cleared
    const done = cleared >= per
    const label = s.out ? 'OUT' : done ? (s.fin != null ? formatPartyTime(s.fin) : '✓') : `${Math.round((cleared / per) * 100)}%`
    return { x: z.x, y: z.y, w: z.w, h: z.h, tone: TONES[z.seat], label, mine: uid === mySeat }
  })
}

function Legend({ racers, players, mySeat, perSeat, stats, per, lives, myMisses = 0 }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 justify-center font-pixel text-[8px]" aria-label="Racers">
      {racers.map((uid, seat) => {
        const s = normalizePartyStats(stats[uid], per)
        const cleared = uid === mySeat ? countGone(perSeat[seat]) : s.cleared
        const tone = TONES[seat]
        return (
          <li key={uid} className={cn('flex items-center gap-1', TONE_TEXT[tone], !isBotId(uid) && players?.[uid] && players[uid].online === false && 'opacity-50')}>
            <span aria-hidden="true">●</span>
            <span className="max-w-[72px] truncate">{uid === mySeat ? 'YOU' : nameFor(players, uid)}</span>
            <span className="tabular-nums text-retro-dim">{s.fin != null ? formatPartyTime(s.fin) : `${cleared}/${per}`}</span>
            {lives && <Lives n={partyLivesLeft(uid === mySeat ? myMisses : s.misses)} size="sm" />}
          </li>
        )
      })}
    </ul>
  )
}

function PartyRacer({ gameId, game, round, mySeat, myStats, statsPath, goAt, phase, done }) {
  const racers = round.racers
  const n = racers.length
  const { base, per } = useMemo(() => roundPuzzle(round), [round.seed, n, round.raw?.tier]) // eslint-disable-line react-hooks/exhaustive-deps -- the round node is replaced per round
  const myIdx = racers.indexOf(mySeat)
  const picture = useMemo(() => buildPartyPicture({ base, n, viewer: myIdx }), [base, n, myIdx])
  const { zones } = picture
  const sab = round.raw?.sab === true
  // Crates rivals dropped: derived from the drop records, the same on every phone.
  const racersKey = racers.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- racers is fixed for a round (racersKey)
  const drops = useMemo(() => normalizeDrops(round.raw?.drops, { roundId: round.id, racers }), [round.raw?.drops, round.id, racersKey])
  const dropsKey = JSON.stringify(drops)
  const crates = useMemo(() => {
    if (!sab) return null
    const out = {}
    racers.forEach((uid, seat) => { if (drops[uid]) out[seat] = partyCrates({ base, seed: round.seed, seat, drops: drops[uid] }) })
    return out
  }, [sab, dropsKey, base, round.seed]) // eslint-disable-line react-hooks/exhaustive-deps -- dropsKey stands for drops
  const { level } = useMemo(() => withPartyCrates(picture, crates), [picture, crates])
  const mine = zones[myIdx]
  const home = useMemo(() => new Set(Array.from({ length: per }, (_, i) => mine.first + i)), [mine.first, per])
  const rivals = useMemo(() => new Set(level.arrows.map((_, i) => i).filter((i) => !home.has(i))), [level, home])
  const usesLives = partyUsesLives(n)

  // My zone is local and authoritative for me; seeded from Firebase so a reload
  // mid-round resumes where I was.
  const [myGone, setMyGone] = useState(() => normalizePartyStats(myStats, per).gone)
  const [misses, setMisses] = useState(() => normalizePartyStats(myStats, per).misses)
  const [feedback, setFeedback] = useState(null)
  const [frozenUntil, setFrozenUntil] = useState(0)
  const [notice, setNotice] = useState(null)
  const [tick, setTick] = useState(() => Date.now())
  const streak = useRef(0)
  const writeErrorAt = useRef(0)

  const frozen = frozenUntil > tick
  useEffect(() => {
    if (frozenUntil <= Date.now()) return undefined
    const id = setInterval(() => {
      const t = Date.now()
      setTick(t)
      if (t >= frozenUntil) clearInterval(id)
    }, 100)
    return () => clearInterval(id)
  }, [frozenUntil])

  // A crate landing on me: say who sent it.
  const incoming = drops[mySeat]?.length ?? 0
  const seenIncoming = useRef(incoming)
  useEffect(() => {
    if (incoming > seenIncoming.current) {
      const last = drops[mySeat][incoming - 1]
      setNotice({ text: `CRATE FROM ${nameFor(game.players, last.from, 'A RIVAL')}`, bad: true })
    }
    seenIncoming.current = incoming
  }, [incoming]) // eslint-disable-line react-hooks/exhaustive-deps -- fires on a new drop only
  useEffect(() => {
    if (!notice) return undefined
    const id = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(id)
  }, [notice])

  // The room host's phone plays the AI racers: each bot's run is a fixed timeline
  // (botTimeline), written to its own stats node as the server clock passes each event.
  const botIds = racers.filter(isBotId)
  const botSpeed = round.raw?.botSpeed
  const playsBots = botIds.length > 0 && round.raw?.botHost === mySeat
  const timelines = useMemo(
    () => (playsBots ? botIds.map((id) => botTimeline({ base, seed: round.seed, slot: racers.indexOf(id), speed: botSpeed, lives: usesLives })) : []),
    [playsBots, base, round.seed, botSpeed, usesLives, racersKey], // eslint-disable-line react-hooks/exhaustive-deps -- botIds/racers follow racersKey
  )
  useEffect(() => {
    if (!playsBots || phase !== 'racing') return undefined
    const sent = timelines.map(() => 0)
    const flush = () => {
      const elapsed = getServerNow() - goAt
      timelines.forEach((events, k) => {
        const due = events.filter((e) => e.at <= elapsed).length
        if (due <= sent[k]) return
        sent[k] = due
        update(ref(db, `games/${gameId}/round/stats/${round.id}/${botIds[k]}`), botPatch(events, elapsed)).catch(() => { sent[k] = 0 })
      })
    }
    flush()
    const id = setInterval(flush, 200)
    return () => clearInterval(id)
  }, [playsBots, phase, timelines, goAt, gameId, round.id]) // eslint-disable-line react-hooks/exhaustive-deps -- botIds follow racersKey

  const livesLeft = partyLivesLeft(misses)
  const knockedOut = usesLives && livesLeft <= 0
  const finished = countGone(myGone) >= per
  const racing = phase === 'racing'

  const perSeat = racers.map((uid) => (uid === mySeat ? myGone : normalizeGone(round.stats[uid]?.g, per)))
  const goneKey = perSeat.map((g) => g.map(Number).join('')).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when a cleared set changes
  const gone = useMemo(() => pictureGone(perSeat, per), [goneKey, per])

  const write = (patch) => {
    update(ref(db, statsPath), patch).catch(() => {
      // One toast per burst — a dropped connection would otherwise fire one per tap.
      if (Date.now() - writeErrorAt.current > 4000) toast.error('SYNC FAILED — CHECK CONNECTION')
      writeErrorAt.current = Date.now()
    })
  }

  // A streak earns a crate for the leader (only when they are ahead of me).
  const sendCrate = (myCleared) => {
    const standings = racers.map((uid) => ({
      uid,
      cleared: uid === mySeat ? myCleared : normalizePartyStats(round.stats[uid], per).cleared,
      done: uid !== mySeat && partyIsDone(round.stats[uid]),
    }))
    const used = Object.fromEntries(Object.entries(drops).map(([uid, list]) => [uid, list.length]))
    const target = dropTarget({ standings, from: mySeat, used })
    if (!target) return
    const slot = used[target] ?? 0
    const at = standings.find((r) => r.uid === target).cleared
    // Write-once: a clash with another sender for the same slot is simply refused.
    update(ref(db, `games/${gameId}/round/drops/${target}`), { [slot]: dropValue(at, round.id, mySeat) })
      .then(() => setNotice({ text: `CRATE SENT TO ${nameFor(game.players, target, 'THE LEADER')}`, bad: false }))
      .catch(() => {})
  }

  const handleTap = (index) => {
    if (!racing || done || finished || knockedOut || frozen || !home.has(index)) return
    const applied = applyArrowTap(level, gone, PARTY_LIVES, index)
    if (!applied) return
    if (applied.result === 'blocked') {
      streak.current = 0
      const m = misses + 1
      setMisses(m)
      setFeedback({ index, blocker: applied.blocker, gap: applied.gap, asleep: applied.asleep, key: Date.now() })
      sounds.buzz()
      const patch = { m }
      if (usesLives && partyLivesLeft(m) <= 0) patch.x = 1
      else if (!usesLives) setFrozenUntil(Date.now() + PARTY_FREEZE_MS)
      write(patch)
      return
    }
    const local = index - mine.first
    const next = myGone.slice()
    next[local] = true
    setMyGone(next)
    sounds.hitNote(melodicNote(streak.current), streak.current)
    streak.current += 1
    const patch = { [`g/${local}`]: true }
    const cleared = countGone(next)
    if (cleared >= per) patch.fin = Math.max(1, Math.round(getServerNow() - goAt))
    write(patch)
    if (sab && cleared < per && streak.current % SABOTAGE_STREAK === 0) sendCrate(cleared)
  }

  const overlay = zoneOverlay({ zones, racers, perSeat, stats: round.stats, per, mySeat })
  const myFin = normalizePartyStats(myStats, per).fin
  const layout = PARTY_LAYOUT_INFO[n]

  return (
    <div className="space-y-2">
      <Legend racers={racers} players={game.players} mySeat={mySeat} perSeat={perSeat} stats={round.stats} per={per} lives={usesLives} myMisses={misses} />
      <div className="relative">
        <ArrowsBoard
          key={round.id}
          level={level}
          gone={gone}
          onTap={handleTap}
          interactive={racing && !done && !finished && !knockedOut && !frozen}
          feedback={feedback}
          zoomable
          rivals={rivals}
          zones={overlay}
          home={home}
          label={`${layout.label} board, ${per - countGone(myGone)} of your ${per} arrows left`}
        />
        {notice && (
        <p className={cn('text-center font-pixel text-[9px] arcade-blink', notice.bad ? 'text-retro-danger' : 'text-retro-cta')} role="status">
          {notice.bad ? '⚠ ' : '➤ '}{notice.text}{notice.bad ? ` · OPENS AFTER ${SABOTAGE_CLEARS} MORE CLEARS` : ''}
        </p>
      )}
      {frozen && (
          <div className="absolute inset-x-0 top-1 flex justify-center pointer-events-none" role="status">
            <span className="font-pixel text-[9px] px-2 py-1 rounded border border-retro-danger bg-retro-bg/90 text-retro-danger text-glow-danger arcade-blink">
              FROZEN · {Math.max(1, Math.ceil((frozenUntil - tick) / 1000))}
            </span>
          </div>
        )}
      </div>
      <p className="text-center font-pixel text-[8px] leading-relaxed text-retro-dim">
        {knockedOut
          ? 'OUT OF LIVES — WATCH THE REST FINISH'
          : finished || myFin != null
            ? `CLEARED${myFin != null ? ` IN ${formatPartyTime(myFin)}` : ''} ✓`
            : usesLives
              ? <>LIVES <Lives n={livesLeft} size="sm" /> · FIRST TO CLEAR WINS</>
              : `${layout.label} · A BLOCKED TAP FREEZES YOU 2 S`}
      </p>
    </div>
  )
}

/** What a spectator (or a benched seat) sees: the whole picture, in seat 0's frame, read-only. */
function PartyWatcher({ game, round }) {
  const racers = round.racers
  const n = racers.length
  const { base, per } = useMemo(() => roundPuzzle(round), [round.seed, n, round.raw?.tier]) // eslint-disable-line react-hooks/exhaustive-deps -- the round node is replaced per round
  const { level, zones } = useMemo(() => buildPartyPicture({ base, n, viewer: null }), [base, n])
  const perSeat = racers.map((uid) => normalizeGone(round.stats[uid]?.g, per))
  const gone = pictureGone(perSeat, per)
  const overlay = zoneOverlay({ zones, racers, perSeat, stats: round.stats, per, mySeat: null })
  return (
    <div className="space-y-2">
      <Legend racers={racers} players={game.players} mySeat={null} perSeat={perSeat} stats={round.stats} per={per} lives={false} />
      <ArrowsBoard key={round.id} level={level} gone={gone} zoomable zones={overlay} label="Arrows Party, spectating" />
    </div>
  )
}

const PARTY_RACE = { ...RACE, Watcher: PartyWatcher }

export default function ArrowsPartyGame(props) {
  return <RaceShell {...props} race={PARTY_RACE} Racer={PartyRacer} />
}
