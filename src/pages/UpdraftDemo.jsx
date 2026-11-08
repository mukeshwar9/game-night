import { useEffect, useMemo, useRef, useState } from 'react'
import UpdraftArena from '../components/UpdraftArena'
import UpdraftClimbChart from '../components/UpdraftClimbChart'
import { HudPill, ThumbRail, UpdraftHud } from '../components/UpdraftControls'
import UpdraftIcon from '../components/UpdraftIcons'
import UpdraftStage, { EnterStageButton } from '../components/UpdraftStage'
import TouchCoachmark from '../components/TouchCoachmark'
import useClimbTrace from '../hooks/useClimbTrace'
import useOwnAvatar from '../hooks/useOwnAvatar'
import { useUpdraftControls } from '../hooks/useUpdraftControls'
import { useUpdraftHazards } from '../hooks/useUpdraftHazards'
import { playRunSounds, useNotice, useUpdraftRun } from '../hooks/useUpdraftRun'
import { defaultAvatarForId } from '../lib/avatarKit'
import {
  COUNTDOWN_MS, GUST_DRIFT, SUMMIT_Y, botInput, climbStats, createRun, curseAhead, generateTower, hazardForPickup,
  normalizeSeat, raceOutcome, randomUpdraftSeed, toMetres, versusPickups,
} from '../lib/updraftLogic'
import { bestDelta, gapText, gapToRival, summitTime } from '../lib/updraftStageLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo UPDRAFT: race a bot ghost up the same seeded tower. CHAOS (default)
// turns gem pickups into sabotage both ways, exactly like a live room. Your
// best summit time per level stays on this device. From START CLIMB to the
// result the arena takes the whole screen (UpdraftStage); the result is a
// climb chart with RETRY THIS TOWER (same seed) and NEW TOWER.
const LEVELS = { easy: 0.5, normal: 0.8, hard: 1 }
const COUNTDOWN_SECS = COUNTDOWN_MS / 1000
const BOT_GUST_MS = 3000
const BEST_KEY = 'updraft-demo-best'
const GHOST_AVATAR = defaultAvatarForId('updraft-ghost')

function readBests() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {} } catch { return {} }
}

const chip = (on, tone = 'cta') => cn(
  'min-h-11 px-3 font-pixel text-[10px] rounded border-2 transition press',
  on ? (tone === 'p2' ? 'border-retro-p2 text-retro-p2 bg-retro-tint-p2' : 'border-retro-cta text-retro-cta bg-retro-tint-cta') : 'border-retro-border text-retro-dim',
)

function StartCard({ level, chaos, best, onLevel, onChaos, onStart }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-4 pb-16 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[18rem] space-y-3 rounded-lg border-2 border-retro-border bg-retro-card/95 p-4 text-center">
        <p className="font-pixel text-[10px] text-retro-dim">VS GHOST · SAME TOWER</p>
        <p className="font-pixel text-2xl text-retro-p1 text-glow-p1">UPDRAFT</p>
        <p className="font-pixel text-[10px] leading-relaxed text-retro-dim">FIRST TO {toMetres(SUMMIT_Y)}m WINS. DRAG ANYWHERE OR TILT TO STEER.</p>
        <div className="space-y-1">
          <p className="font-pixel text-[10px] text-retro-dim text-left">MODE</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onChaos(true)} aria-pressed={chaos} className={chip(chaos, 'p2')}>CHAOS</button>
            <button type="button" onClick={() => onChaos(false)} aria-pressed={!chaos} className={chip(!chaos)}>PURE</button>
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-pixel text-[10px] text-retro-dim text-left">GHOST</p>
          <div className="flex gap-2">
            {Object.keys(LEVELS).map(l => (
              <button key={l} type="button" onClick={() => onLevel(l)} aria-pressed={level === l} className={chip(level === l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <p className="flex justify-between font-pixel text-[10px] text-retro-dim tabular-nums">
          <span>BEST SUMMIT · {level.toUpperCase()}</span>
          <span className="text-retro-text">{best != null ? `${best.toFixed(1)}s` : '—'}</span>
        </p>
        <button
          type="button"
          onClick={onStart}
          className="min-h-12 w-full rounded border-2 border-retro-cta bg-retro-tint-cta font-pixel text-xs text-retro-cta hover:shadow-neon-cta press"
        >START CLIMB</button>
      </div>
    </div>
  )
}

export default function UpdraftDemo() {
  const [level, setLevel] = useState('normal')
  const [chaos, setChaos] = useState(true)
  const [seed, setSeed] = useState(() => randomUpdraftSeed())
  const [attempt, setAttempt] = useState(0)
  const [started, setStarted] = useState(false)
  const [staged, setStaged] = useState(true)
  const [count, setCount] = useState(COUNTDOWN_SECS)
  const [result, setResult] = useState(null)
  const [bests, setBests] = useState(readBests)
  const [sent, setSent] = useState(0)
  const [notice, showNotice] = useNotice()
  const tower = useMemo(() => generateTower(seed), [seed])
  const arenaRef = useRef(null)
  const touchRef = useRef(null)
  const racing = started && count <= 0
  const live = racing && !result
  const myAvatar = useOwnAvatar()
  // A gust on the bot: a sideways drift that a timer clears.
  const botDrift = useRef(0)
  const botGust = useRef(null)
  const hazardNo = useRef(0)
  const bestsRef = useRef(bests)
  const delta = useRef(null)

  const controls = useUpdraftControls(arenaRef, touchRef, live)
  const hazardsRef = useRef(null)
  const botRef = useRef(null)
  const meRef = useRef(null)

  // Decide from both live runs after every frame of either (a rAF callback,
  // not an effect); both runs stop once it is decided.
  const judge = () => {
    const a = meRef.current?.runRef.current
    const b = botRef.current?.runRef.current
    if (!a || !b) return
    const outcome = raceOutcome({ X: normalizeSeat(a), O: normalizeSeat(b) })
    if (outcome) setResult(r => r ?? outcome)
  }

  const trace = useClimbTrace({
    active: live,
    resetKey: `${seed}:${attempt}`,
    heights: () => ({ me: meRef.current?.runRef.current.best ?? 0, rival: botRef.current?.runRef.current.best ?? 0 }),
  })
  const mark = trace.mark

  const me = useUpdraftRun({
    tower, active: live,
    readInput: controls.readInput,
    envFor: () => ({ goal: SUMMIT_Y, pickups: versusPickups(chaos), drift: hazardsRef.current?.drift() ?? 0 }),
    onEvents: (events, run) => {
      playRunSounds(events, sounds)
      for (const e of events) {
        if (e.type === 'top') {
          delta.current = bestDelta(bestsRef.current[level] ?? null, run.t)
          setBests(prev => {
            if (prev[level] != null && prev[level] <= run.t) return prev
            const next = { ...prev, [level]: run.t }
            try { localStorage.setItem(BEST_KEY, JSON.stringify(next)) } catch { /* private mode */ }
            return next
          })
        }
        if (e.type === 'pickup' && e.kind === 'feather') showNotice('FEATHER — FLOAT!')
        if (e.type !== 'pickup' || e.kind !== 'gem') continue
        const k = hazardForPickup(seed, e.id)
        showNotice(`SENT ${k.toUpperCase()} TO GHOST`)
        setSent(n => n + 1)
        mark('sent')
        const b = botRef.current
        if (k === 'crumble') b.setRun(curseAhead(b.runRef.current, tower))
        else if (k === 'gust') {
          botDrift.current = (e.id % 2 ? -1 : 1) * GUST_DRIFT
          clearTimeout(botGust.current)
          botGust.current = setTimeout(() => { botDrift.current = 0 }, BOT_GUST_MS)
        }
      }
    },
    onFrame: judge,
  })
  const hazards = useUpdraftHazards({ tower, runRef: me.runRef, setRun: me.setRun })
  const bot = useUpdraftRun({
    tower, active: live,
    readInput: (run) => botInput(run, tower, LEVELS[level]),
    envFor: () => ({ goal: SUMMIT_Y, pickups: versusPickups(chaos), drift: botDrift.current }),
    onEvents: (events) => {
      for (const e of events) {
        const mine = meRef.current?.runRef.current
        if (e.type === 'pickup' && e.kind === 'gem' && mine && !mine.dead && !mine.top) {
          hazardsRef.current?.receive({ k: hazardForPickup(seed, 1000 + e.id), at: hazardNo.current++ })
          mark('took')
        }
      }
    },
    onFrame: judge,
  })
  useEffect(() => {
    meRef.current = me
    botRef.current = bot
    hazardsRef.current = hazards
    bestsRef.current = bests
  })
  useEffect(() => () => clearTimeout(botGust.current), [])
  useEffect(() => { if (me.run.dead && !me.run.top) mark('fall') }, [me.run.dead, me.run.top, mark])

  // 3-2-1 countdown after START CLIMB, then GO.
  useEffect(() => {
    if (!started || count <= 0) return undefined
    const id = setTimeout(() => {
      setCount(c => c - 1)
      if (count === 1) sounds.go()
    }, 1000)
    return () => clearTimeout(id)
  }, [started, count])

  useEffect(() => {
    if (!result) return
    if (result === 'X') sounds.win()
    else if (result === 'draw') sounds.draw()
    else sounds.lose()
  }, [result])

  // A new attempt: same tower (RETRY THIS TOWER) or a fresh one, straight
  // into the countdown; `toSetup` goes back to the start card instead.
  const restart = ({ fresh = false, toSetup = false } = {}) => {
    hazards.reset()
    clearTimeout(botGust.current)
    botDrift.current = 0
    delta.current = null
    if (fresh) setSeed(randomUpdraftSeed())
    setAttempt(a => a + 1)
    me.setRun(createRun())
    bot.setRun(createRun())
    setResult(null)
    setSent(0)
    setCount(COUNTDOWN_SECS)
    setStarted(!toSetup)
    setStaged(true)
  }

  const start = () => {
    setCount(COUNTDOWN_SECS)
    setStarted(true)
  }

  const secs = Math.max(1, count)
  const gap = gapToRival(me.run.best, bot.run.best)

  if (result) {
    const mineTop = me.run.top
    const headline = result === 'X' ? (mineTop ? 'SUMMIT!' : 'YOU OUTCLIMBED IT') : result === 'draw' ? 'DRAW' : me.run.dead ? 'YOU FELL' : 'GHOST SUMMITED'
    const time = summitTime(me.run)
    return (
      <div className="space-y-3 max-w-sm mx-auto">
        <p className="text-center font-pixel text-[10px] text-retro-dim">{chaos ? 'CHAOS' : 'PURE'} · {level.toUpperCase()}</p>
        <p className={cn('text-center font-pixel text-base', result === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
          {headline}{time ? ` · ${time}` : ''}
        </p>
        <p className="text-center font-pixel text-[10px] text-retro-dim">YOU {toMetres(me.run.best)}m · GHOST {toMetres(bot.run.best)}m</p>
        <UpdraftClimbChart
          samples={trace.samples}
          marks={trace.marks}
          goal={SUMMIT_Y}
          meSide="X"
          meLabel="YOU"
          rivalLabel="GHOST"
          run={me.run}
          tally={{ sent, took: hazards.took }}
          summit={mineTop}
        />
        {mineTop && delta.current && (
          <p className={cn('text-center font-pixel text-[10px]', delta.current.best ? 'text-retro-win' : 'text-retro-dim')}>{delta.current.text}</p>
        )}
        <p className="sr-only">{climbStats(me.run, { sent, took: hazards.took })}</p>
        <button
          type="button"
          onClick={() => restart()}
          className="min-h-12 w-full rounded border-2 border-retro-cta bg-retro-tint-cta font-pixel text-xs text-retro-cta hover:shadow-neon-cta press"
        >RETRY THIS TOWER</button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => restart({ fresh: true })} className={cn(chip(false), 'w-full')}>NEW TOWER</button>
          <button type="button" onClick={() => restart({ fresh: true, toSetup: true })} className={cn(chip(false), 'w-full')}>CHANGE SETUP</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto space-y-3">
      <UpdraftStage staged={staged} touchRef={touchRef} label="UPDRAFT">
        {(size) => (
          <UpdraftArena
            ref={arenaRef}
            tower={tower}
            run={me.run}
            mySide="X"
            ghost={{ x: bot.run.x, y: bot.run.y, dead: bot.run.dead }}
            ghostSide="O"
            ghostTag="GHOST"
            goal={SUMMIT_Y}
            pickups={versusPickups(chaos)}
            fog={hazards.fog}
            gust={hazards.gust}
            marked={hazards.marked}
            banner={hazards.banner}
            notice={notice}
            avatars={{ X: myAvatar, O: GHOST_AVATAR }}
            size={size}
            rail={[{ side: 'X', y: me.run.best }, { side: 'O', y: bot.run.best, dead: bot.run.dead }]}
            label={`You ${toMetres(me.run.best)} metres, ghost ${toMetres(bot.run.best)} metres, summit ${toMetres(SUMMIT_Y)}`}
            hud={(
              <UpdraftHud tilt={controls.tilt} setTilt={controls.setTilt} onLeave={staged ? () => setStaged(false) : null}>
                <HudPill className="text-retro-p1"><span className="text-2xl">{toMetres(me.run.best)}</span> m</HudPill>
                {started && (
                  <HudPill className={cn('truncate', gap.ahead === 'them' ? 'text-retro-p2' : gap.ahead === 'me' ? 'text-retro-win' : 'text-retro-dim')}>
                    {bot.run.dead ? 'GHOST FELL' : gapText(gap, 'GHOST')}
                  </HudPill>
                )}
              </UpdraftHud>
            )}
            foot={(
              <>
                <div className="px-6 pb-1"><TouchCoachmark gameKey="updraft" gesture="drag" text="DRAG ANYWHERE TO STEER" active={started && !racing} /></div>
                <ThumbRail x={me.run.x} />
              </>
            )}
            overlay={!racing && (
              !started ? (
                <StartCard
                  level={level}
                  chaos={chaos}
                  best={bests[level] ?? null}
                  onLevel={setLevel}
                  onChaos={setChaos}
                  onStart={start}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-deep/60 text-center px-6 pointer-events-none">
                  <p className="font-pixel text-5xl text-retro-cta text-glow-cta tabular-nums" aria-live="assertive">{secs}</p>
                  <p className="font-pixel text-[10px] text-retro-dim leading-relaxed">SAME TOWER FOR BOTH<br />FIRST TO {toMetres(SUMMIT_Y)}m WINS</p>
                </div>
              )
            )}
          />
        )}
      </UpdraftStage>
      {!staged && (
        <>
          <EnterStageButton onClick={() => setStaged(true)} />
          <p className="text-center font-pixel text-[10px] text-retro-dim leading-relaxed">
            YOU BOUNCE BY YOURSELF — JUST STEER.
            <br /><UpdraftIcon name="feather" className="text-retro-win" /> FEATHERS FLOAT YOU UP.
            {chaos ? <><br /><UpdraftIcon name="gem" className="text-retro-cta" /> GEMS SEND YOUR RIVAL A HAZARD.</> : null}
          </p>
        </>
      )}
    </div>
  )
}
