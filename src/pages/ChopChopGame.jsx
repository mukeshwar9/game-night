import { useEffect, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { db } from '../lib/firebase'
import RaceShell from '../components/RaceShell'
import ChopScene from '../components/ChopScene'
import useGameKeys from '../hooks/useGameKeys'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import {
  CHOP_GAME_MS, CHOP_STUN_MS,
  applyChop, chopRaceEntry, chopRow, normalizeChopStats, sideDanger, visibleRows, warnsStill,
} from '../lib/chopLogic'

// CHOP CHOP — N-player race (2–8). Everyone chops the same seeded stack for
// 30 seconds; a beam on your head costs a one-second stun and your streak.
// Most crates wins; the room flow is RaceShell.

const RACE = {
  type: 'chopchop',
  title: 'CHOP CHOP',
  sameWhat: 'STACK',
  rules: [
    'TAP LEFT OR RIGHT TO KNOCK OUT A CRATE · 30s',
    'NEVER STAND UNDER A STRIPED BEAM',
    'A BEAM = 1s STUN, STREAK LOST',
    'EVERYONE GETS THE SAME STACK · MOST CRATES WINS',
  ],
  baseMs: CHOP_GAME_MS,
  scaled: false,
  entry: chopRaceEntry,
  isDone: () => false, // time-boxed: the round ends at the deadline
  row: (stats) => chopRow(stats),
}

function ChopRacer({ game, round, mySeat, myStats, statsPath, now }) {
  const [stats, setStats] = useState(() => normalizeChopStats(myStats))
  const statsRef = useRef(stats)
  const [side, setSide] = useState('L')
  const [lastSide, setLastSide] = useState(null)
  const [stunned, setStunned] = useState(false)
  const stunnedRef = useRef(false)
  const stunTimer = useRef(null)
  const live = round.endsAt == null || now < round.endsAt

  const push = (next) => {
    statsRef.current = next
    setStats(next)
    update(ref(db, statsPath), next).catch(() => toast.error('SCORE SYNC FAILED — CHECK CONNECTION'))
  }

  // Register as present (0 crates) so a racer who never chops still ranks.
  useEffect(() => {
    if (!myStats) update(ref(db, statsPath), statsRef.current).catch(() => {})
    return () => clearTimeout(stunTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round (the Racer is keyed by round id)
  }, [])

  const chop = (s) => {
    if (!live || stunnedRef.current) return
    const res = applyChop(round.seed, statsRef.current, s)
    setSide(s)
    if (res.chopped) { setLastSide(s); sounds.hit(res.stats.streak) }
    if (res.bonk) {
      sounds.bust()
      stunnedRef.current = true
      setStunned(true)
      clearTimeout(stunTimer.current)
      stunTimer.current = setTimeout(() => { stunnedRef.current = false; setStunned(false) }, CHOP_STUN_MS)
    }
    push(res.stats)
  }

  useGameKeys((e) => {
    if (e.repeat || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return false
    chop(e.key === 'ArrowLeft' ? 'L' : 'R')
    return true
  }, { enabled: live })

  // The closest rival: the best other racer's crate count.
  const all = game.round?.stats?.[round.id] || {}
  let rival = null
  for (const [uid, raw] of Object.entries(all)) {
    if (uid === mySeat) continue
    const chops = normalizeChopStats(raw).chops
    if (!rival || chops > rival.chops) rival = { uid, chops }
  }
  const diff = rival ? stats.chops - rival.chops : 0
  const lead = rival ? {
    avatar: game.players?.[rival.uid]?.avatar,
    label: `VS ${(game.players?.[rival.uid]?.name ?? 'RIVAL').toUpperCase()}`,
    text: diff > 0 ? `+${diff} AHEAD` : diff < 0 ? `${-diff} BEHIND` : 'LEVEL',
    ahead: diff >= 0,
  } : null
  const warn = warnsStill(stats)

  return (
    <ChopScene
      rows={visibleRows(round.seed, stats)}
      side={side}
      chops={stats.chops}
      streak={stats.streak}
      stunned={stunned}
      avatar={game.players?.[mySeat]?.avatar}
      lead={lead}
      warn={{ L: warn && sideDanger(round.seed, stats, 'L'), R: warn && sideDanger(round.seed, stats, 'R') }}
      lastSide={lastSide}
      onChop={chop}
      disabled={!live}
      hint={!live ? 'TIME!' : stunned ? 'STUNNED! SHAKE IT OFF…' : warn ? 'THE RED BUTTON IS THE SIDE WITH A BEAM' : 'READ THE STACK · DODGE THE BEAMS'}
    />
  )
}

export default function ChopChopGame(props) {
  return <RaceShell {...props} race={RACE} Racer={ChopRacer} />
}
