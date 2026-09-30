import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { getServerNow } from '../hooks/useServerClock'
import useCourseTime from '../hooks/useCourseTime'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import PulpField from './PulpField'
import {
  DUEL_MS, HARVEST_MS, TEAM_HEARTS, applySwipe, buildCourse, createField, harvestTeam, normalizePulpStats, pulpStats,
} from '../lib/pulpLogic'

// The live play surface for online PULP RUSH (RaceShell's `Racer`). Every
// racer runs the same seeded course locally from `round.seed`, on the server
// clock from `goAt`; only the racer's own stats go to Firebase (throttled).
// mode 'duel' ranks scores; mode 'harvest' is co-op: the team's summed pulp
// against a basket target, with shared hearts (harvestTeam).

const SYNC_MS = 250
const FX_KEEP = 16

export default function PulpRacer({ game, round, myStats, statsPath, goAt, mySeat, mode = 'duel' }) {
  const harvest = mode === 'harvest'
  const duration = round.endsAt != null && goAt != null ? round.endsAt - goAt : (harvest ? HARVEST_MS : DUEL_MS)
  const course = useMemo(() => buildCourse(round.seed, duration), [round.seed, duration])
  const spriteOf = useMemo(() => new Map(course.map(p => [p.id, p.sprite])), [course])

  // A reload mid-round keeps the score already synced (the pieces already
  // flown are gone either way).
  const [field, setField] = useState(() => {
    const f = createField(['me'])
    const s = normalizePulpStats(myStats)
    f.players.me = { ...f.players.me, score: s.score, sliced: s.sliced, best: s.best, rot: s.rot }
    return f
  })
  const fieldRef = useRef(field)
  const [fx, setFx] = useState([])

  const clock = useCallback(() => getServerNow() - goAt, [goAt])
  const t = useCourseTime(clock, true)
  const at = Math.min(t, duration)
  const mine = pulpStats(course, field, 'me', at)

  const team = harvest ? harvestTeam({ ...round.stats, [mySeat]: mine }, round.racers) : null
  const over = t >= duration || (team && (team.won || team.failed))
  const me = field.players.me
  const stunned = !over && me.stunUntil > t

  const onSwipe = (_, seg) => {
    if (over) return
    const res = applySwipe(fieldRef.current, course, 'me', seg)
    if (!res.events.length) return
    fieldRef.current = res.field
    setField(res.field)
    for (const e of res.events) {
      if (e.type === 'slice') sounds.hit(e.combo)
      else if (e.type === 'rot') sounds.miss()
    }
    setFx(prev => [...prev, ...res.events.map(e => ({ ...e, at: seg.t1, sprite: spriteOf.get(e.id) }))].slice(-FX_KEEP))
  }

  // Throttled stats sync: at most every SYNC_MS, always flushing the latest.
  const statsKey = `${mine.score}|${mine.sliced}|${mine.best}|${mine.rot}|${mine.dropped}`
  const latestRef = useRef(mine)
  const lastSentRef = useRef({ key: null, at: 0 })
  const timerRef = useRef(null)
  useEffect(() => {
    latestRef.current = mine
    if (lastSentRef.current.key === statsKey || timerRef.current) return
    const send = () => {
      timerRef.current = null
      const s = latestRef.current
      const key = `${s.score}|${s.sliced}|${s.best}|${s.rot}|${s.dropped}`
      if (key === lastSentRef.current.key) return
      lastSentRef.current = { key, at: Date.now() }
      update(ref(db, statsPath), s).catch(() => toast.error('SCORE SYNC FAILED — CHECK CONNECTION'))
    }
    const wait = SYNC_MS - (Date.now() - lastSentRef.current.at)
    if (wait <= 0) send()
    else timerRef.current = setTimeout(send, wait)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stats themselves
  }, [statsKey, statsPath])
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const others = round.racers.filter(id => id !== mySeat)
  const rivalId = !harvest && others.length === 1 ? others[0] : null
  const rival = rivalId ? normalizePulpStats(round.stats?.[rivalId]) : null
  const nameOf = (id) => (game?.players?.[id]?.name || 'RIVAL').toUpperCase()

  return (
    <div className="space-y-2">
      {rival && (
        <div className="space-y-1 px-1">
          <div className="flex justify-between font-pixel text-[9px]">
            <span className="text-retro-p1">YOU {mine.score}</span>
            <span className="text-retro-p2 truncate max-w-[50%]">{nameOf(rivalId)} {rival.score}</span>
          </div>
          <TugBar a={mine.score} b={rival.score} />
        </div>
      )}
      {team && (
        <div className="space-y-1 px-1">
          <div className="flex justify-between items-center font-pixel text-[9px]">
            <Hearts left={team.hearts} />
            <span className="text-retro-win">{team.pulp}/{team.target} PULP</span>
          </div>
          <div className="h-2.5 rounded bg-retro-deep overflow-hidden" role="progressbar" aria-label="Team basket" aria-valuemin={0} aria-valuemax={team.target} aria-valuenow={Math.min(team.pulp, team.target)}>
            <div className="h-full bg-retro-win transition-[width]" style={{ width: `${Math.min(100, (team.pulp / team.target) * 100)}%` }} />
          </div>
        </div>
      )}
      <div className="relative mx-auto" style={{ width: 'min(100%, calc((100dvh - 15rem) / 1.15))' }}>
        <PulpField
          course={course}
          field={field}
          t={t}
          clock={clock}
          onSwipe={onSwipe}
          fx={fx}
          disabled={over}
          stunned={stunned}
          className="w-full"
        />
        {over && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className={cn('font-pixel text-sm arcade-blink', team?.failed ? 'text-retro-danger' : 'text-retro-win text-glow-win')}>
              {team?.won ? 'BASKET FULL!' : team?.failed ? 'OUT OF HEARTS' : 'TIME!'}
            </p>
          </div>
        )}
      </div>
      <div className="flex justify-center gap-5 font-pixel text-[9px] text-retro-dim">
        <span>SCORE <span className="text-retro-win">{mine.score}</span></span>
        <span>SLICED <span className="text-retro-p1">{mine.sliced}</span></span>
        <span>BEST <span className="text-retro-cta">{mine.best}×</span></span>
        {mine.rot > 0 && <span>ROT <span className="text-retro-danger">{mine.rot}</span></span>}
      </div>
    </div>
  )
}

export function TugBar({ a, b }) {
  const total = a + b
  const share = total ? (a / total) * 100 : 50
  return (
    <div className="flex h-2.5 rounded overflow-hidden bg-retro-deep" aria-hidden="true">
      <div className="h-full bg-retro-p1 transition-[width]" style={{ width: `${share}%` }} />
      <div className="h-full bg-retro-p2 flex-1" />
    </div>
  )
}

export function Hearts({ left, of: max = TEAM_HEARTS }) {
  return (
    <span className="text-retro-danger tracking-[0.2em]" aria-label={`${left} hearts left`}>
      {'♥'.repeat(left)}<span className="text-retro-dim">{'♡'.repeat(Math.max(0, max - left))}</span>
    </span>
  )
}
