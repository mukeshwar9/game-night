import RaceShell from '../components/RaceShell'
import PulpRacer from '../components/PulpRacer'
import {
  HARVEST_MS, HARVEST_TARGET_PER_PLAYER, TEAM_HEARTS, harvestDecided, harvestEntry, pulpRow,
} from '../lib/pulpLogic'

// PULP RUSH · HARVEST — co-op race (2–8). Everyone slices the same seeded
// course in their own field; the team fills one basket (summed pulp) before
// the 60 s are up, sharing hearts that every drop and rotten slice costs.
// Team state is derived from each racer's own stats (harvestTeam), so there
// is no shared counter to write.

const RACE = {
  type: 'pulpharvest',
  title: 'PULP HARVEST',
  sameWhat: 'COURSE',
  rules: [
    'CO-OP · FILL THE TEAM BASKET · 60s',
    `${HARVEST_TARGET_PER_PLAYER} PULP PER PLAYER`,
    `${TEAM_HEARTS} SHARED HEARTS`,
    'A DROP OR A ROTTEN SLICE = −1 HEART',
  ],
  baseMs: HARVEST_MS,
  scaled: false,
  entry: harvestEntry,
  isDone: () => false,
  decided: harvestDecided,
  row: (stats) => pulpRow(stats),
  coop: { won: 'BASKET FULL — TEAM WINS!', lost: 'HARVEST FAILED' },
}

function HarvestRacer(props) {
  return <PulpRacer {...props} mode="harvest" />
}

export default function PulpHarvestGame(props) {
  return <RaceShell {...props} race={RACE} Racer={HarvestRacer} />
}
