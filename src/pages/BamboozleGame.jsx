import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import RaceShell from '../components/RaceShell'
import BamboozleArena from '../components/BamboozleArena'
import BamboozlePad from '../components/BamboozlePad'
import { Plate, SeatCard } from '../components/BamboozleParts'
import useBamboozleControls from '../hooks/useBamboozleControls'
import { getServerNow } from '../hooks/useServerClock'
import { isReducedMotion } from '../hooks/useMotionPref'
import { createFx, feedFx } from '../lib/bamboozleDraw'
import {
  COINS_PER_HEART, bamboozleDecided, bamboozleRaceEntry, bamboozleRow, ghostsFrom, isOutStats,
  normalizeBamboozleStats, packCoord,
} from '../lib/bamboozleLogic'
import { createSim, fastForward, stepSim } from '../lib/bamboozleSim'
import { sounds } from '../lib/sounds'

// BAMBOOZLE — N-player survival race (2–8). Everyone gets the same garden from
// the round's seed: the same boulders, the same walls firing at the same
// moments (the seeded timeline in bamboozleLogic.js, on the server clock).
// Each phone runs only its own dodger and reports hearts and the volley it fell
// in; the others show as faded ghosts from low-rate position writes. Lived
// through the most volleys wins; the room flow is RaceShell.

const RACE = {
  type: 'bamboozle',
  title: 'BAMBOOZLE',
  sameWhat: 'GARDEN',
  rules: [
    'A LIT WALL FIRES POLES ACROSS THE GARDEN',
    'HIDE BEHIND A BOULDER · DRAG TO STEER',
    'THREE HEARTS · LAST DODGER STANDING WINS',
    'COINS IN THE OPEN BUY A HEART BACK',
    'EVERYONE GETS THE SAME GARDEN',
  ],
  baseMs: 0,
  scaled: false,
  durationMs: () => null, // survival: the round ends when at most one racer is left
  entry: bamboozleRaceEntry,
  isDone: (stats) => isOutStats(stats),
  decided: bamboozleDecided,
  row: (stats) => bamboozleRow(stats),
}

/** The garden plays on the 4×4 yard for every racer: nobody shares it, so size does not scale with the room. */
const YARD = 4
const POS_EVERY_MS = 250
const SUBSTEP = 1 / 60

function BamboozleRacer({ game, round, mySeat, myStats, statsPath, goAt }) {
  const controls = useBamboozleControls({ shared: true })
  const [sim] = useState(() => {
    const s0 = normalizeBamboozleStats(myStats)
    const made = createSim({
      seed: round.seed ?? 1, players: [{ id: mySeat }], n: YARD, crumble: true, coins: true, grab: false,
      countIn: 0, endless: true, hearts: s0.out != null ? 1 : s0.hearts,
    })
    const me = made.players[0]
    me.hits = s0.hits
    me.coins = s0.coins % COINS_PER_HEART
    if (s0.out != null) { me.hp = 0; me.out = true; me.outVolley = s0.out }
    return made
  })
  const simRef = useRef(sim)
  const fxRef = useRef(createFx())
  const ghostsRef = useRef([])
  const sent = useRef({ sig: '', pos: '', at: 0 })
  const warned = useRef(false)
  const [hud, setHud] = useState({ hp: sim.players[0].hp, coins: sim.players[0].coins, out: sim.players[0].out, k: 0 })
  const hudKey = useRef('')

  const stats = useMemo(() => round.stats || {}, [round.stats])
  const others = useMemo(() => Object.keys(stats).filter((id) => id !== mySeat).sort(), [stats, mySeat])

  // Other racers as ghosts, from the positions they last reported.
  useEffect(() => {
    const list = ghostsFrom(stats, mySeat)
    ghostsRef.current = list.map((g, idx) => ({
      ...g, avatar: game.players?.[g.id]?.avatar ?? '', seat: others.indexOf(g.id) + 1 || idx + 1,
    }))
  }, [stats, mySeat, game.players, others])

  const push = useCallback((patch) => {
    update(ref(db, statsPath), patch).catch(() => {
      if (!warned.current) { warned.current = true; toast.error('SCORE SYNC FAILED — CHECK CONNECTION') }
    })
  }, [statsPath])

  // Register as present so a racer who never moves still ranks.
  useEffect(() => {
    if (myStats) return
    const me = sim.players[0]
    push({ hearts: me.hp, v: 0, hits: 0, coins: 0, x: packCoord(me.x), y: packCoord(me.y) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round (the Racer is keyed by round id)
  }, [])

  const tick = useCallback(() => {
    const s = simRef.current
    if (!s) return
    const elapsed = (getServerNow() - goAt) / 1000
    let gap = elapsed - s.t
    if (gap <= 0) return
    // A phone that slept (or joined late) skips ahead; hits in the skipped volleys are not replayed.
    if (gap > 0.4) { fastForward(s, elapsed - 0.05); gap = 0.05 }
    const inputs = [controls.getInput(0)]
    const events = []
    while (gap > 1e-6) {
      const h = Math.min(gap, SUBSTEP)
      events.push(...stepSim(s, inputs, h))
      gap -= h
    }
    feedFx(fxRef.current, s, events, { reduced: isReducedMotion() })
    for (const e of events) {
      if (e.type === 'warn') sounds.bzWarn()
      else if (e.type === 'impact') sounds.bzThunk()
      else if (e.type === 'hit') sounds.bzOuch()
      else if (e.type === 'out') sounds.bzOut()
      else if (e.type === 'crack') sounds.bzCrack()
      else if (e.type === 'land') sounds.bzLand()
      else if (e.type === 'coin') sounds.bzCoin()
      else if (e.type === 'heal') sounds.bzHeal()
    }
    const me = s.players[0]
    // Report what changed straight away; position at a low rate.
    const sig = [me.hp, me.out ? me.outVolley : '-', me.hits, me.coins, me.out ? '' : s.view.k].join('|')
    const now = performance.now()
    if (sig !== sent.current.sig) {
      sent.current.sig = sig
      sent.current.at = now
      push({
        hearts: me.hp, v: me.out ? me.outVolley : s.view.k, hits: me.hits, coins: me.coins,
        ...(me.out ? { out: me.outVolley } : {}),
        x: packCoord(me.x), y: packCoord(me.y),
      })
    } else if (!me.out && now - sent.current.at >= POS_EVERY_MS) {
      const pos = `${packCoord(me.x)},${packCoord(me.y)}`
      if (pos !== sent.current.pos) {
        sent.current.pos = pos
        sent.current.at = now
        push({ x: packCoord(me.x), y: packCoord(me.y) })
      }
    }
    const key = `${me.hp}|${me.coins}|${me.out}|${s.view.k}`
    if (key !== hudKey.current) {
      hudKey.current = key
      setHud({ hp: me.hp, coins: me.coins, out: me.out, k: s.view.k })
    }
  }, [controls, goAt, push])

  const me = game.players?.[mySeat]
  const avatars = useMemo(() => [me?.avatar || ''], [me?.avatar])

  return (
    <div className="space-y-2" data-testid="bamboozle-race" data-hearts={hud.hp} data-out={hud.out ? '1' : '0'} data-volley={hud.k}>
      <div className="grid grid-cols-2 gap-2">
        <SeatCard seat={0} name="YOU" avatar={me?.avatar} hp={hud.hp} coins={hud.coins} out={hud.out} you showCoins size="sm" />
        {others.slice(0, 3).map((id, i) => {
          const s = normalizeBamboozleStats(stats[id])
          return (
            <SeatCard
              key={id}
              seat={i + 1}
              name={(game.players?.[id]?.name || 'RIVAL').toUpperCase().slice(0, 10)}
              avatar={game.players?.[id]?.avatar}
              hp={s.hearts}
              out={s.out != null}
              size="sm"
            />
          )
        })}
      </div>
      <BamboozlePad seat={0} controls={controls} disabled={hud.out} className="rounded-lg" label="Drag anywhere to steer">
        <BamboozleArena simRef={simRef} fxRef={fxRef} avatars={avatars} ghostsRef={ghostsRef} onTick={tick} hints className="rounded-lg">
          {hud.out && <Plate title="YOU'RE OUT" sub="WATCH THE REST" />}
        </BamboozleArena>
        <p className="font-pixel text-[8px] text-retro-dim leading-relaxed pt-2 pb-1 text-center">
          {hud.out ? 'THE GARDEN KEEPS FIRING · RIVALS SHOW AS GHOSTS' : 'DRAG ANYWHERE TO STEER · ARROWS / WASD · HIDE BEHIND A BOULDER'}
        </p>
      </BamboozlePad>
    </div>
  )
}

export default function BamboozleGame(props) {
  return <RaceShell {...props} race={RACE} Racer={BamboozleRacer} />
}
