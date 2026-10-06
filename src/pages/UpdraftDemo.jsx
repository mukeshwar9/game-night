import { useEffect, useMemo, useRef, useState } from 'react'
import UpdraftArena from '../components/UpdraftArena'
import { ThumbBand } from '../components/UpdraftControls'
import TouchCoachmark from '../components/TouchCoachmark'
import useFocusArena from '../hooks/useFocusArena'
import { useUpdraftControls } from '../hooks/useUpdraftControls'
import { useUpdraftHazards } from '../hooks/useUpdraftHazards'
import { playRunSounds, useUpdraftRun } from '../hooks/useUpdraftRun'
import {
  COUNTDOWN_MS, GUST_DRIFT, SUMMIT_Y, botInput, createRun, curseAhead, generateTower, hazardForPickup, normalizeSeat,
  raceOutcome, randomUpdraftSeed, toMetres,
} from '../lib/updraftLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo UPDRAFT: race a bot ghost up the same seeded tower. CHAOS (default)
// turns pickups into sabotage both ways, exactly like a live room.
const LEVELS = { easy: 0.5, normal: 0.8, hard: 1 }
const COUNTDOWN_SECS = COUNTDOWN_MS / 1000
const BOT_GUST_MS = 3000

export default function UpdraftDemo() {
  const [level, setLevel] = useState('normal')
  const [chaos, setChaos] = useState(true)
  const [seed, setSeed] = useState(() => randomUpdraftSeed())
  const [count, setCount] = useState(COUNTDOWN_SECS)
  const [result, setResult] = useState(null)
  const tower = useMemo(() => generateTower(seed), [seed])
  const arenaRef = useRef(null)
  const touchRef = useRef(null)
  const racing = count <= 0
  const live = racing && !result
  useFocusArena(arenaRef, count < COUNTDOWN_SECS)
  // A gust on the bot: a sideways drift that a timer clears.
  const botDrift = useRef(0)
  const botGust = useRef(null)
  const hazardNo = useRef(0)

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

  const me = useUpdraftRun({
    tower, active: live,
    readInput: controls.readInput,
    envFor: () => ({ goal: SUMMIT_Y, pickups: chaos, drift: hazardsRef.current?.drift() ?? 0 }),
    onEvents: (events) => {
      playRunSounds(events, sounds)
      for (const e of events) {
        if (e.type !== 'pickup') continue
        const k = hazardForPickup(seed, e.id)
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
    envFor: () => ({ goal: SUMMIT_Y, pickups: chaos, drift: botDrift.current }),
    onEvents: (events) => {
      for (const e of events) {
        if (e.type === 'pickup') hazardsRef.current?.receive({ k: hazardForPickup(seed, 1000 + e.id), at: hazardNo.current++ })
      }
    },
    onFrame: judge,
  })
  useEffect(() => {
    meRef.current = me
    botRef.current = bot
    hazardsRef.current = hazards
  })
  useEffect(() => () => clearTimeout(botGust.current), [])

  // 3-2-1 countdown, then GO.
  useEffect(() => {
    if (count <= 0) return
    const id = setTimeout(() => {
      setCount(c => c - 1)
      if (count === 1) sounds.go()
    }, 1000)
    return () => clearTimeout(id)
  }, [count])

  useEffect(() => {
    if (!result) return
    if (result === 'X') sounds.win()
    else if (result === 'draw') sounds.draw()
    else sounds.lose()
  }, [result])

  const restart = (opts = {}) => {
    hazards.reset()
    clearTimeout(botGust.current)
    botDrift.current = 0
    setSeed(randomUpdraftSeed())
    me.setRun(createRun())
    bot.setRun(createRun())
    setResult(null)
    setCount(COUNTDOWN_SECS)
    if (opts.level) setLevel(opts.level)
    if (opts.chaos !== undefined) setChaos(opts.chaos)
  }

  const secs = Math.max(1, count)

  return (
    <div className="space-y-3 max-w-sm mx-auto">
      <div className="flex flex-wrap justify-center gap-2">
        {Object.keys(LEVELS).map(l => (
          <button
            key={l}
            type="button"
            onClick={() => restart({ level: l })}
            className={cn(
              'min-h-11 px-3 font-pixel text-[9px] rounded border transition active:scale-95',
              level === l ? 'border-retro-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
            )}
          >{l.toUpperCase()}</button>
        ))}
        <button
          type="button"
          onClick={() => restart({ chaos: !chaos })}
          aria-pressed={chaos}
          className={cn(
            'min-h-11 px-3 font-pixel text-[9px] rounded border transition active:scale-95',
            chaos ? 'border-retro-p2 text-retro-p2' : 'border-retro-border text-retro-dim',
          )}
        >{chaos ? 'CHAOS' : 'PURE'}</button>
      </div>
      <div ref={touchRef} className="space-y-2 touch-none">
        <UpdraftArena
          ref={arenaRef}
          tower={tower}
          run={me.run}
          mySide="X"
          ghost={{ x: bot.run.x, y: bot.run.y, dead: bot.run.dead }}
          ghostSide="O"
          goal={SUMMIT_Y}
          pickupsOn={chaos}
          fog={hazards.fog}
          gust={hazards.gust}
          banner={hazards.banner}
          rail={[{ side: 'X', y: me.run.best }, { side: 'O', y: bot.run.best }]}
          label={`You ${toMetres(me.run.best)} metres, ghost ${toMetres(bot.run.best)} metres, summit ${toMetres(SUMMIT_Y)}`}
          hud={(
            <>
              <span className="px-1.5 py-1 rounded border border-retro-p1 text-retro-p1 bg-retro-deep/70">YOU {toMetres(me.run.best)}m</span>
              <span className="px-1.5 py-1 rounded border border-retro-p2 text-retro-p2 bg-retro-deep/70 mr-5">GHOST {toMetres(bot.run.best)}m</span>
            </>
          )}
          overlay={(!racing || result) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-retro-deep/80 text-center px-6">
              {!racing ? (
                <>
                  <p className="font-pixel text-4xl text-retro-cta text-glow-cta tabular-nums" aria-live="assertive">{secs}</p>
                  <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">SAME TOWER FOR BOTH<br />FIRST TO {toMetres(SUMMIT_Y)}m WINS</p>
                </>
              ) : (
                <>
                  <p className={cn('font-pixel text-sm', result === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
                    {result === 'X' ? (me.run.top ? 'SUMMIT!' : 'YOU OUTCLIMBED IT') : result === 'draw' ? 'DRAW' : me.run.dead ? 'YOU FELL' : 'GHOST SUMMITED'}
                  </p>
                  <p className="font-pixel text-[8px] text-retro-dim">YOU {toMetres(me.run.best)}m · GHOST {toMetres(bot.run.best)}m</p>
                  <button
                    type="button"
                    onClick={() => restart()}
                    className="min-h-11 px-5 font-pixel text-[10px] border border-retro-cta text-retro-cta rounded hover:shadow-neon-cta active:scale-95"
                  >NEW TOWER</button>
                </>
              )}
            </div>
          )}
        />
        <TouchCoachmark gameKey="updraft" gesture="drag" text="DRAG LEFT/RIGHT TO STEER" active={!racing} />
        <ThumbBand tilt={controls.tilt} setTilt={controls.setTilt} />
      </div>
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed">
        YOU BOUNCE BY YOURSELF — JUST STEER.{chaos ? <><br />◆ PICKUPS SEND YOUR RIVAL A HAZARD.</> : null}
      </p>
    </div>
  )
}
