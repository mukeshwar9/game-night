import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import PulpField from '../../components/PulpField'
import { Hearts, TugBar } from '../../components/PulpRacer'
import useCourseTime from '../../hooks/useCourseTime'
import { sounds } from '../../lib/sounds'
import { newRaceSeed } from '../../lib/raceLogic'
import { readSoloBest, recordSoloBest } from '../../lib/soloBest'
import {
  ARENA_H, DUEL_MS, HARVEST_MS, HARVEST_TARGET_PER_PLAYER, SOLO_MS, TEAM_HEARTS,
  applySwipe, buildCourse, createField, fieldHearts, fieldScore,
} from '../../lib/pulpLogic'

// PULP RUSH on one device, no Firebase:
//   SOLO       — 60 s score attack against your own best
//   SPLIT DUEL — two players face to face: the phone lies flat, each gets a
//                half (the far one upside down) and the same seeded throws
//   TWO-TONE   — co-op on one shared field: green pieces are P1's, purple
//                P2's, 2× pieces need both swipes within 250 ms; shared hearts
// Each finger is bound to the half it lands on (pointer capture), so two
// thumbs play at once.

const COUNTDOWN_MS = 3000
const FX_KEEP = 16
const TWO_TONE_TARGET = HARVEST_TARGET_PER_PLAYER * 2

const MODES = {
  solo: { label: 'SOLO', ms: SOLO_MS, blurb: '60s SCORE ATTACK · BEAT YOUR BEST' },
  duel: { label: 'SPLIT DUEL', ms: DUEL_MS, blurb: '2 PLAYERS · FACE TO FACE · SAME THROWS' },
  twotone: { label: 'TWO-TONE', ms: HARVEST_MS, blurb: '2 PLAYERS · CO-OP · SLICE ONLY YOUR COLOUR' },
}

const now = () => performance.now()

export default function PulpRushDemo() {
  const [mode, setMode] = useState('solo')
  const [phase, setPhase] = useState('menu') // menu | live | done
  const [seed, setSeed] = useState(0)
  const [goAt, setGoAt] = useState(0)
  const [fields, setFields] = useState(null)
  const [fx, setFx] = useState({})
  const [best, setBest] = useState(() => readSoloBest('pulprush'))
  const [newBest, setNewBest] = useState(false)
  const fieldsRef = useRef(null)

  const duration = MODES[mode].ms
  const twoTone = mode === 'twotone'
  const course = useMemo(() => buildCourse(seed, duration, { twoTone }), [seed, duration, twoTone])
  const spriteOf = useMemo(() => new Map(course.map(p => [p.id, p.sprite])), [course])

  const clock = useCallback(() => now() - goAt, [goAt])
  const t = useCourseTime(clock, phase === 'live')

  const start = (m) => {
    const f = m === 'duel'
      ? { X: createField(['X']), O: createField(['O']) }
      : m === 'twotone' ? { team: createField(['X', 'O']) } : { me: createField(['me']) }
    fieldsRef.current = f
    setMode(m)
    setFields(f)
    setFx({})
    setNewBest(false)
    setSeed(newRaceSeed())
    setGoAt(now() + COUNTDOWN_MS)
    setPhase('live')
  }

  // Round end: the clock, or (TWO-TONE) the basket / the hearts.
  const hearts = twoTone && fields ? fieldHearts(course, fields.team, Math.min(t, duration), TEAM_HEARTS) : null
  const teamPulp = twoTone && fields ? fieldScore(fields.team) : 0
  const ended = phase === 'live' && (t >= duration || (twoTone && (hearts <= 0 || teamPulp >= TWO_TONE_TARGET)))
  const endScore = mode === 'solo' && fields ? fields.me.players.me.score : 0
  const endWon = teamPulp >= TWO_TONE_TARGET
  useEffect(() => {
    if (!ended) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot round end keyed on the clock/basket crossing
    setPhase('done')
    if (mode === 'solo' && recordSoloBest('pulprush', endScore)) { setNewBest(true); setBest(endScore) }
    if (mode !== 'twotone') sounds.win()
    else if (endWon) sounds.matchWin()
    else sounds.lose()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once when the round crosses its end
  }, [ended])

  const handleSwipe = (key, player, seg) => {
    if (phase !== 'live' || seg.t1 < 0 || seg.t1 >= duration) return
    const cur = fieldsRef.current[key]
    const res = applySwipe(cur, course, player, seg, { twoTone })
    if (!res.events.length) return
    fieldsRef.current = { ...fieldsRef.current, [key]: res.field }
    setFields(fieldsRef.current)
    for (const e of res.events) {
      if (e.type === 'slice' || e.type === 'double') sounds.hit(e.combo ?? 3)
      else if (e.type === 'rot' || e.type === 'wrong') sounds.miss()
    }
    setFx(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), ...res.events.map(e => ({ ...e, at: seg.t1, sprite: spriteOf.get(e.id) }))].slice(-FX_KEEP),
    }))
  }

  const secs = Math.max(0, Math.ceil((duration - Math.max(0, t)) / 1000))
  const counting = phase === 'live' && t < 0
  const countLabel = counting ? Math.ceil(-t / 1000) : null

  // ── menu / results ─────────────────────────────────────────────────
  if (phase === 'menu' || phase === 'done') {
    return (
      <div className="space-y-3">
        {phase === 'done' && fields && <Results mode={mode} fields={fields} course={course} duration={duration} best={best} newBest={newBest} />}
        <p className="font-pixel text-[8px] text-retro-dim text-center leading-relaxed">
          SWIPE TO SLICE · 3+ IN A CHAIN = COMBO · NEVER THE ROTTEN APPLE
        </p>
        <div className="grid gap-2">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              onClick={() => start(key)}
              className={cn(
                'w-full py-3 px-3 rounded border-2 font-pixel text-[10px] text-left active:scale-95 transition-all',
                key === 'solo' ? 'bg-retro-cta text-retro-bg border-retro-cta hover:shadow-neon-cta'
                  : 'border-retro-p1 text-retro-p1 hover:shadow-neon-p1',
              )}
            >
              {phase === 'done' && key === mode ? 'AGAIN · ' : ''}{m.label}
              <span className={cn('block font-pixel text-[8px] mt-1', key === 'solo' ? 'text-retro-bg/80' : 'text-retro-dim')}>{m.blurb}</span>
            </button>
          ))}
        </div>
        {best > 0 && <p className="font-pixel text-[8px] text-retro-dim text-center">SOLO BEST <span className="text-retro-win">{best}</span></p>}
      </div>
    )
  }

  // ── solo: inline field ─────────────────────────────────────────────
  if (mode === 'solo') {
    const me = fields.me.players.me
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 font-pixel">
          <span className="text-[9px] text-retro-p1">SCORE <span className="text-retro-win">{me.score}</span></span>
          <span className={cn('text-lg tabular-nums', secs <= 10 ? 'text-retro-danger text-glow-danger' : 'text-retro-win text-glow-win')}>{secs}</span>
          <span className="text-[9px] text-retro-dim">BEST {Math.max(best, 0)}</span>
        </div>
        <div className="relative">
          <PulpField course={course} field={fields.me} t={t} clock={clock} onSwipe={(p, seg) => handleSwipe('me', p, seg)} fx={fx.me} stunned={me.stunUntil > t && t >= 0} className="w-full" />
          {counting && <Countdown n={countLabel} />}
        </div>
        <button onClick={() => setPhase('menu')} className="w-full min-h-11 py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded active:scale-95">QUIT</button>
      </div>
    )
  }

  // ── two players on one phone: full-screen, face to face ────────────
  const fieldWidth = `min(calc(100vw - 1.5rem), calc((100dvh - 7rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)) / 2 / ${ARENA_H}))`
  const exit = (
    <button onClick={() => setPhase('menu')} className="min-h-10 min-w-11 px-3 border border-retro-border text-retro-dim font-pixel text-[10px] rounded active:scale-95">EXIT</button>
  )

  if (mode === 'duel') {
    const x = fields.X.players.X
    const o = fields.O.players.O
    return (
      <div className="fixed inset-0 z-50 bg-retro-bg flex flex-col items-center justify-between py-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] select-none" style={{ touchAction: 'none' }}>
        <div className="rotate-180 flex flex-col items-center gap-1">
          <PlayerHud label="P2" score={o.score} tone="p2" />
          <div className="relative" style={{ width: fieldWidth }}>
            <PulpField course={course} field={fields.O} t={t} clock={clock} onSwipe={(p, seg) => handleSwipe('O', p, seg)} playerAt={() => 'O'} trailFor={() => 'p2'} fx={fx.O} stunned={o.stunUntil > t && t >= 0} className="w-full" label="Player 2 field" />
            {counting && <Countdown n={countLabel} />}
          </div>
        </div>
        <div className="w-full max-w-md flex items-center gap-2 px-3">
          <span className="font-pixel text-[9px] text-retro-p2 w-8 text-center">{o.score}</span>
          <div className="flex-1 rotate-180"><TugBar a={o.score} b={x.score} /></div>
          <span className="font-pixel text-[9px] text-retro-p1 w-8 text-center">{x.score}</span>
          <span className={cn('font-pixel text-[10px] tabular-nums w-8 text-center', secs <= 10 ? 'text-retro-danger' : 'text-retro-cta')}>{secs}</span>
          {exit}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="relative" style={{ width: fieldWidth }}>
            <PulpField course={course} field={fields.X} t={t} clock={clock} onSwipe={(p, seg) => handleSwipe('X', p, seg)} playerAt={() => 'X'} fx={fx.X} stunned={x.stunUntil > t && t >= 0} className="w-full" label="Player 1 field" />
            {counting && <Countdown n={countLabel} />}
          </div>
          <PlayerHud label="P1" score={x.score} tone="p1" />
        </div>
      </div>
    )
  }

  // TWO-TONE: one shared field; the half a finger lands on picks its player.
  const team = fields.team
  const sharedWidth = `min(calc(100vw - 1.5rem), calc((100dvh - 6rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)) / ${ARENA_H}))`
  return (
    <div className="fixed inset-0 z-50 bg-retro-bg flex flex-col items-center justify-between py-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] select-none" style={{ touchAction: 'none' }}>
      <div className="rotate-180"><PlayerHud label="P2 · PURPLE" score={team.players.O.score} tone="p2" /></div>
      <div className="relative" style={{ width: sharedWidth }}>
        <PulpField
          course={course}
          field={team}
          t={t}
          clock={clock}
          onSwipe={(p, seg) => handleSwipe('team', p, seg)}
          playerAt={({ y }) => (y >= ARENA_H / 2 ? 'X' : 'O')}
          trailFor={(p) => (p === 'O' ? 'p2' : 'p1')}
          fx={fx.team}
          twoTone
          className="w-full"
          label="Shared field: bottom half is player 1 (green), top half is player 2 (purple)"
        />
        <div className="absolute left-0 right-0 top-1/2 border-t-2 border-dashed border-retro-border/60 pointer-events-none" />
        {counting && <Countdown n={countLabel} />}
      </div>
      <div className="w-full max-w-md flex items-center justify-between gap-2 px-3 font-pixel text-[9px]">
        <Hearts left={hearts} />
        <span className="text-retro-win">{teamPulp}/{TWO_TONE_TARGET}</span>
        <span className={cn('tabular-nums', secs <= 10 ? 'text-retro-danger' : 'text-retro-cta')}>{secs}</span>
        <PlayerHud label="P1 · GREEN" score={team.players.X.score} tone="p1" compact />
        {exit}
      </div>
    </div>
  )
}

function PlayerHud({ label, score, tone, compact = false }) {
  return (
    <div className={cn('flex items-center gap-3 font-pixel', compact ? 'text-[9px]' : 'text-[10px] px-2')}>
      <span className={tone === 'p2' ? 'text-retro-p2' : 'text-retro-p1'}>{label}</span>
      {!compact && <span className="text-retro-win text-sm">{score}</span>}
    </div>
  )
}

function Countdown({ n }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/50 pointer-events-none">
      <p className="font-pixel text-5xl text-retro-win text-glow-win">{n}</p>
      <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
    </div>
  )
}

function Results({ mode, fields, course, duration, best, newBest }) {
  if (mode === 'solo') {
    const me = fields.me.players.me
    return (
      <div className="bg-retro-surface border border-retro-border rounded p-4 text-center space-y-2">
        <p className="font-pixel text-[9px] text-retro-dim">TIME!</p>
        <p className="font-pixel text-3xl text-retro-win text-glow-win">{me.score}</p>
        <p className="font-pixel text-[8px] text-retro-dim">{me.sliced} SLICED · {me.best}× BEST COMBO · {me.rot} ROTTEN</p>
        <p className={cn('font-pixel text-[9px]', newBest ? 'text-retro-cta arcade-blink' : 'text-retro-dim')}>{newBest ? 'NEW BEST!' : `BEST ${best}`}</p>
      </div>
    )
  }
  if (mode === 'duel') {
    const x = fields.X.players.X
    const o = fields.O.players.O
    const headline = x.score === o.score ? 'DRAW!' : x.score > o.score ? 'P1 WINS!' : 'P2 WINS!'
    return (
      <div className="bg-retro-surface border border-retro-border rounded p-4 text-center space-y-3">
        <p className="font-pixel text-lg text-retro-win text-glow-win">{headline}</p>
        <div className="grid grid-cols-2 gap-2">
          {[['P1', x, 'text-retro-p1'], ['P2', o, 'text-retro-p2']].map(([label, p, cls]) => (
            <div key={label} className="bg-retro-card border border-retro-border rounded p-2 space-y-1">
              <p className={cn('font-pixel text-[9px]', cls)}>{label}</p>
              <p className="font-pixel text-xl text-retro-text">{p.score}</p>
              <p className="font-pixel text-[8px] text-retro-dim">{p.sliced} SLICED · {p.best}×</p>
            </div>
          ))}
        </div>
      </div>
    )
  }
  const team = fields.team
  const pulp = fieldScore(team)
  const won = pulp >= TWO_TONE_TARGET
  const heartsLeft = fieldHearts(course, team, duration, TEAM_HEARTS)
  return (
    <div className="bg-retro-surface border border-retro-border rounded p-4 text-center space-y-2">
      <p className={cn('font-pixel text-lg', won ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>{won ? 'BASKET FULL!' : 'HARVEST FAILED'}</p>
      <p className="font-pixel text-[9px] text-retro-dim">{pulp}/{TWO_TONE_TARGET} PULP · {heartsLeft} HEART{heartsLeft === 1 ? '' : 'S'} LEFT</p>
      <p className="font-pixel text-[8px] text-retro-dim">
        <span className="text-retro-p1">P1 {team.players.X.score}</span> · <span className="text-retro-p2">P2 {team.players.O.score}</span>
      </p>
    </div>
  )
}
