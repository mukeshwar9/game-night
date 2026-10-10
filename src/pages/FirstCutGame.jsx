import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { getServerNow } from '../hooks/useServerClock'
import RaceShell from '../components/RaceShell'
import FirstCutTable from '../components/FirstCutTable'
import FirstCutSettings from '../components/FirstCutSettings'
import FirstCutFocus, { FirstCutScoreChips } from '../components/FirstCutFocus'
import Avatar from '../components/Avatar'
import useFirstCutPlay from '../hooks/useFirstCutPlay'
import useGameKeys from '../hooks/useGameKeys'
import { cn } from '@/lib/utils'
import {
  FC_ONLINE_TARGET, FC_ROUND_MS, addReport, describeFcConfig, fcDecided, fcRaceEntry, fcRow, katanaPhase,
  normalizeFcConfig, normalizeReports, roundConfig,
} from '../lib/firstCutLogic'

// FIRST CUT — N-player race (2–8). Everyone watches the same seeded plate and
// swings at the fruit, not the lookalikes. A tap is timed on the player's own
// device from the moment the item appeared (server clock), and each racer
// writes only their own reports: `t/{item}` = ms to a cut, `j/{item}` = a
// blocked swing. The fastest legal cut on an item owns it, a dead heat is
// void, and the first to FC_ONLINE_TARGET takes the round (firstCutLogic.js).
// Nobody's arrival order decides anything, so the best connection does not win.

const RACE = {
  type: 'firstcut',
  title: 'FIRST CUT',
  sameWhat: 'PLATE',
  rules: [
    'CUT THE FRUIT · LEAVE THE LOOKALIKES',
    'A LOOKALIKE STOPS YOUR KATANA · YOU MISS THE NEXT ITEM',
    `FIRST TO ${FC_ONLINE_TARGET} CUTS TAKES THE ROUND`,
    'FASTEST TAP WINS THE FRUIT · SAME PLATE FOR EVERYONE',
  ],
  baseMs: FC_ROUND_MS,
  scaled: false,
  configKey: 'firstcutConfig',
  normalizeConfig: normalizeFcConfig,
  Config: FirstCutSettings,
  describeConfig: describeFcConfig,
  entry: fcRaceEntry,
  isDone: () => false, // the round ends at the target or the deadline
  decided: fcDecided,
  row: (stats, round, id) => fcRow(stats, round, id),
  start: (room, seed, config) => ({ extras: { firstcutConfig: normalizeFcConfig(config) } }),
}

function FirstCutRacer({ game, round, mySeat, myStats, statsPath, goAt, now }) {
  const config = roundConfig(round)
  const racers = round.racers
  const live = round.endsAt == null || now < round.endsAt
  const tableRef = useRef(null)
  const [mine, setMine] = useState(() => normalizeReports(myStats))

  // Register as present, so a racer who never swings still ranks.
  useEffect(() => {
    if (!myStats) update(ref(db, statsPath), { v: 1 }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round (the Racer is keyed by round id)
  }, [])

  const slotOf = useCallback((id) => Math.max(0, racers.indexOf(id)) % 4, [racers])
  const myName = String(game.players?.[mySeat]?.name || 'YOU').toUpperCase().slice(0, 12)
  const seats = useMemo(() => [{ id: mySeat, slot: slotOf(mySeat), name: myName, bot: false }], [mySeat, slotOf, myName])
  const angles = useMemo(() => [90], [])
  const reports = useMemo(() => ({ ...round.stats, [mySeat]: mine }), [round.stats, mine, mySeat])
  const getTime = useCallback(() => getServerNow() - goAt, [goAt])

  const play = useFirstCutPlay({
    seed: round.seed, config, seats, angles, racers, slotOf, reports, target: FC_ONLINE_TARGET,
    getTime, active: live, tableRef, resetKey: round.id,
  })
  const winner = play.res.winner

  const onTap = () => {
    if (!live || winner) return
    const plan = play.tap(mySeat)
    const next = addReport({ [mySeat]: mine }, mySeat, plan)
    if (next[mySeat] === mine) return
    setMine(next[mySeat])
    const patch = plan.kind === 'cut' ? { [`t/${plan.k}`]: plan.ms } : { [`j/${plan.k}`]: true }
    update(ref(db, statsPath), patch).catch(() => toast.error('SCORE SYNC FAILED — CHECK CONNECTION'))
  }

  useGameKeys((e) => {
    if (e.repeat || ![' ', 'Enter', 'a', 'l'].includes(e.key)) return false
    onTap()
    return true
  }, { enabled: live && !winner })

  const rivals = racers.filter(id => id !== mySeat)
  const nameOf = (id) => String(game.players?.[id]?.name || 'PLAYER').toUpperCase()
  const winnerName = winner ? (winner === mySeat ? 'YOU' : nameOf(winner)) : null

  return (
    <div className="space-y-2.5">
      {rivals.length > 0 && (
        <ul className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Rivals">
          {rivals.map((id) => {
            const phase = play.index >= 0 ? katanaPhase(play.res.blocked[id], play.index) : 'ready'
            return (
              <li
                key={id}
                className={cn(
                  'flex items-center gap-1.5 rounded border px-2 py-1 font-pixel text-[8px] transition-colors motion-reduce:transition-none',
                  phase === 'ready' ? 'border-retro-border text-retro-text' : 'border-retro-danger text-retro-danger',
                )}
                style={{ boxShadow: `inset 3px 0 0 rgb(var(--c-p${slotOf(id) + 1}))` }}
              >
                <Avatar id={game.players?.[id]?.avatar} size={16} />
                <span className="max-w-[72px] truncate">{nameOf(id)}</span>
                <span className="tabular-nums" data-rival-score>{play.res.scores[id] ?? 0}</span>
                {phase !== 'ready' && <span aria-label="blocked">✕</span>}
              </li>
            )
          })}
        </ul>
      )}
      <FirstCutFocus
        label="First Cut"
        hud={<FirstCutScoreChips seats={[...play.tableProps.seats, ...rivals.map(id => ({ id, slot: slotOf(id), name: nameOf(id), score: play.res.scores[id] ?? 0 }))]} />}
        footer={<p className="font-pixel text-[8px] text-retro-dim text-center leading-relaxed">{!live ? 'TIME!' : winnerName ? `${winnerName} TAKES THE ROUND…` : `FIRST TO ${FC_ONLINE_TARGET}`}</p>}
      >
        <FirstCutTable
          ref={tableRef}
          layout={1}
          short
          keys={false}
          label="First Cut table"
          {...play.tableProps}
          onTap={onTap}
        />
      </FirstCutFocus>
      <p className="font-pixel text-[8px] text-retro-dim text-center leading-relaxed">
        {!live ? 'TIME!' : winnerName ? `${winnerName} TAKES THE ROUND…` : `FIRST TO ${FC_ONLINE_TARGET} · TAP YOUR PAD · SPACE WORKS TOO`}
      </p>
    </div>
  )
}

export default function FirstCutGame(props) {
  return <RaceShell {...props} race={RACE} Racer={FirstCutRacer} />
}
