import RaceShell from '../components/RaceShell'
import PulpRacer from '../components/PulpRacer'
import { DUEL_MS, pulpRaceEntry, pulpRow } from '../lib/pulpLogic'

// PULP RUSH (DUEL) — N-player race (2–8). Everyone slices the same seeded
// course for 45 seconds in their own field; a rotten apple costs 5 points
// and a 1 s stun. Highest score wins; room flow in RaceShell. Same-device
// split screen lives on the /solo page (PulpRushDemo).

const RACE = {
  type: 'pulprush',
  title: 'PULP RUSH',
  sameWhat: 'COURSE',
  rules: [
    'SWIPE TO SLICE THE PRODUCE · 45s',
    'EVERYONE GETS THE SAME THROWS',
    '3+ IN ONE SWIPE = COMBO BONUS',
    'ROTTEN APPLE = −5 PTS + STUN',
  ],
  baseMs: DUEL_MS,
  scaled: false,
  entry: pulpRaceEntry,
  isDone: () => false, // time-boxed: the round ends at the deadline
  row: (stats) => pulpRow(stats),
}

function DuelRacer(props) {
  return <PulpRacer {...props} mode="duel" />
}

export default function PulpRushGame(props) {
  return <RaceShell {...props} race={RACE} Racer={DuelRacer} />
}
