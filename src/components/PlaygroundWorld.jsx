import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from './Avatar'
import { usePlaygroundControls } from '../hooks/usePlaygroundControls'
import {
  createState, step, activeStation, nearestNpcIndex,
  STATIONS, DISTRICTS, NPCS, WORLD_W, WORLD_H, GOAL,
  readGoalBest, writeGoalBest,
} from '../lib/playgroundLogic'
import { getGameConfig } from '../lib/games'
import { sounds } from '../lib/sounds'
import { todayKey, getDailyNumber, getStreak, readBest } from '../lib/daily'
import { EMOTES_PRIMARY } from '../lib/emotes'
import { cn } from '@/lib/utils'

const STEP_SOUND_INTERVAL_MS = 250 // ~4/sec footstep throttle
const EMOTE_KEYS = EMOTES_PRIMARY.slice(0, 4) // bound to number keys 1-4
const EMOTE_DURATION_MS = 1600
const CAM_LERP_RATE = 8 // /sec — higher = snappier camera catch-up

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Direct DOM write for one entity's position/facing/bob — called every rAF frame instead
// of going through setState, so 60 fps movement never re-renders React (see PERF SPLIT
// note below). posEl carries left/top/transform; bobEl (nested inside) gets the walk-bob
// class toggled — a separate element because animating transform on the SAME element as
// the position/facing transform would clobber it (bit us during the single-avatar build).
function writeEntity(posEl, bobEl, x, y, facing, moving) {
  if (!posEl) return
  posEl.style.left = `${(x / WORLD_W) * 100}%`
  posEl.style.top = `${(y / WORLD_H) * 100}%`
  posEl.style.transform = `translate(-50%, -50%) scaleX(${facing === 'left' ? -1 : 1})`
  if (bobEl) bobEl.classList.toggle('pg-walk-bob', moving)
}

// Fullscreen camera-follow hub: walk the avatar around a WORLD_W×WORLD_H world, kick a
// ball into the goal, chat with wandering NPCs, and enter a solo demo by standing on a
// cabinet. Two-layer DOM: `viewport` is the fixed on-screen window (focus target, HUD
// lives here); `world` is the full-size content layer camera-panned via translate3d.
//
// PERF SPLIT: everything that changes every frame (avatar/ball/NPC position, facing,
// bob, camera pan) is a direct ref/DOM write in the rAF loop — no setState. React state
// holds only a shallow-diffed discrete snapshot (active station, nearest NPC, goal count)
// that changes rarely, so re-renders stay rare regardless of movement.
export default function PlaygroundWorld({ avatarId, controlsEnabled = true }) {
  const navigate = useNavigate()
  const viewportRef = useRef(null)
  const worldRef = useRef(null)
  const avatarPosRef = useRef(null)
  const avatarBobRef = useRef(null)
  const ballRef = useRef(null)
  const npcPosRefs = useRef([])
  const npcBobRefs = useRef([])

  // First-paint-only snapshot, held in state (not a ref) purely so JSX below can read
  // starting positions without tripping the "no ref reads during render" lint rule.
  // simRef is the live mutable sim the rAF loop drives; after mount, direct DOM writes
  // (writeEntity, camera transform) — not React state — keep everything on screen in
  // sync with it, so re-renders from `initialSim` staying frozen never stomp position.
  const [initialSim] = useState(createState)
  const simRef = useRef(initialSim)

  const camRef = useRef({ x: 0, y: 0 })
  const camInitRef = useRef(false)
  const sRef = useRef(1) // px per world unit
  const reducedMotionRef = useRef(false)
  const lastStepSoundRef = useRef(0)
  const prevKickedRef = useRef(false)
  const burstIdRef = useRef(0)
  const emoteKeyRef = useRef(0)
  const emoteTimerRef = useRef(null)

  const { getInput, getDrag } = usePlaygroundControls(viewportRef, controlsEnabled)
  const joyBaseRef = useRef(null)
  const joyKnobRef = useRef(null)
  const goalBestRef = useRef(0)

  const [display, setDisplay] = useState(() => ({
    stationType: null, nearNpcIndex: -1, nearNpcKind: null,
    nearNpcLine: null, nearNpcPos: null, band: 'center', goals: 0, best: readGoalBest(),
  }))

  useEffect(() => { goalBestRef.current = display.best }, [display.best])
  const displayRef = useRef(display)
  const [emote, setEmote] = useState(null)
  const [bursts, setBursts] = useState([])

  // Focus on mount, and re-focus whenever controls come back (e.g. a HUD
  // sheet closing re-enables input) — otherwise keyboard stays dead until
  // the player clicks the world again.
  useEffect(() => {
    if (controlsEnabled) viewportRef.current?.focus()
  }, [controlsEnabled])

  // Reduced-motion preference: camera snaps to target instead of lerping.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotionRef.current = mq.matches }
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  // Viewport size → px-per-world-unit scale + the world layer's pixel dimensions.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const applySize = () => {
      const s = Math.max(1, Math.min(el.clientWidth, el.clientHeight))
      sRef.current = s
      if (worldRef.current) {
        worldRef.current.style.width = `${WORLD_W * s}px`
        worldRef.current.style.height = `${WORLD_H * s}px`
      }
    }
    applySize()
    const ro = new ResizeObserver(applySize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let raf, last = performance.now()
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1

      const next = step(simRef.current, getInput(), dt)
      simRef.current = next

      if (next.moving && now - lastStepSoundRef.current >= STEP_SOUND_INTERVAL_MS) {
        lastStepSoundRef.current = now
        sounds.step()
      }
      if (next.ballKicked && !prevKickedRef.current) sounds.kick()
      prevKickedRef.current = next.ballKicked
      if (next.goalScored) {
        sounds.hit(Math.min(next.goals, 8))
        if (next.goals > goalBestRef.current) {
          goalBestRef.current = next.goals
          writeGoalBest(next.goals)
        }
        const id = burstIdRef.current++
        setBursts(list => [...list, { id }])
        setTimeout(() => setBursts(list => list.filter(b => b.id !== id)), 700)
      }

      // Continuous entity writes — direct DOM, no re-render.
      writeEntity(avatarPosRef.current, avatarBobRef.current, next.x, next.y, next.facing, next.moving)
      if (ballRef.current) {
        ballRef.current.style.left = `${(next.ball.x / WORLD_W) * 100}%`
        ballRef.current.style.top = `${(next.ball.y / WORLD_H) * 100}%`
      }
      next.npcs.forEach((npc, i) => {
        writeEntity(npcPosRefs.current[i], npcBobRefs.current[i], npc.x, npc.y, npc.facing, npc.moving)
      })

      // Camera: follow the avatar, clamped so the viewport never shows past the world
      // edge; centers on the shorter axis if the world is smaller than the viewport.
      const vp = viewportRef.current
      const s = sRef.current
      if (vp && worldRef.current) {
        const vw = vp.clientWidth / s
        const vh = vp.clientHeight / s
        const targetX = WORLD_W <= vw ? (WORLD_W - vw) / 2 : clamp(next.x - vw / 2, 0, WORLD_W - vw)
        const targetY = WORLD_H <= vh ? (WORLD_H - vh) / 2 : clamp(next.y - vh / 2, 0, WORLD_H - vh)
        const cam = camRef.current
        if (!camInitRef.current) {
          cam.x = targetX; cam.y = targetY; camInitRef.current = true
        } else if (reducedMotionRef.current) {
          cam.x = targetX; cam.y = targetY
        } else {
          const t = Math.min(1, dt * CAM_LERP_RATE)
          cam.x += (targetX - cam.x) * t
          cam.y += (targetY - cam.y) * t
        }
        worldRef.current.style.transform = `translate3d(${(-cam.x * s).toFixed(1)}px, ${(-cam.y * s).toFixed(1)}px, 0)`
      }

      // Visible drag joystick — direct DOM, no re-render.
      const drag = getDrag()
      const joyBase = joyBaseRef.current
      const joyKnob = joyKnobRef.current
      if (joyBase && joyKnob) {
        if (drag.active && vp) {
          const rect = vp.getBoundingClientRect()
          const ox = drag.ox - rect.left
          const oy = drag.oy - rect.top
          let kx = drag.cx - rect.left - ox
          let ky = drag.cy - rect.top - oy
          const kd = Math.hypot(kx, ky)
          const MAX_KNOB = 40
          if (kd > MAX_KNOB) { kx = (kx / kd) * MAX_KNOB; ky = (ky / kd) * MAX_KNOB }
          joyBase.style.display = 'block'
          joyBase.style.left = `${ox}px`
          joyBase.style.top = `${oy}px`
          joyKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`
        } else {
          joyBase.style.display = 'none'
        }
      }

      // Discrete state — shallow-diffed before setState, so this only re-renders on
      // an actual station/NPC/goal transition, not every frame.
      const station = activeStation(next)
      const stationType = station?.type ?? null
      const nearNpcIndex = nearestNpcIndex(next)
      const prevDisplay = displayRef.current
      if (
        prevDisplay.stationType !== stationType ||
        prevDisplay.nearNpcIndex !== nearNpcIndex ||
        prevDisplay.goals !== next.goals
      ) {
        let nearNpcLine = prevDisplay.nearNpcLine
        let nearNpcPos = prevDisplay.nearNpcPos
        let nearNpcKind = prevDisplay.nearNpcKind
        let band = prevDisplay.band
        if (nearNpcIndex !== prevDisplay.nearNpcIndex) {
          if (nearNpcIndex >= 0) {
            const def = NPCS[nearNpcIndex]
            const npc = next.npcs[nearNpcIndex]
            nearNpcKind = def.kind
            nearNpcLine = def.kind === 'flavor' ? def.lines[Math.floor(Math.random() * def.lines.length)] : null
            nearNpcPos = { x: npc.x, y: npc.y }
            // Band decision is viewport-space, not world-space — the world is much
            // bigger than the screen now, so world-thirds no longer line up with
            // what's actually visible.
            const vpX = (npc.x - camRef.current.x) * s
            const clientW = vp?.clientWidth || 1
            band = vpX < clientW / 3 ? 'left' : vpX > (clientW * 2) / 3 ? 'right' : 'center'
          } else {
            nearNpcLine = null
            nearNpcPos = null
            nearNpcKind = null
          }
        }
        const nextDisplay = { stationType, nearNpcIndex, nearNpcKind, nearNpcLine, nearNpcPos, band, goals: next.goals, best: goalBestRef.current }
        displayRef.current = nextDisplay
        setDisplay(nextDisplay)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current)
  }, [])

  const enterStation = (type) => navigate(`/solo/${type}`)
  const goToDaily = () => navigate('/daily')

  const fireEmote = (glyph) => {
    sounds.reaction(glyph)
    emoteKeyRef.current += 1
    setEmote({ glyph, key: emoteKeyRef.current })
    if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current)
    emoteTimerRef.current = setTimeout(() => setEmote(null), EMOTE_DURATION_MS)
  }

  const onKeyDown = (e) => {
    const n = Number(e.key)
    if (n >= 1 && n <= 4 && EMOTE_KEYS[n - 1]) {
      e.preventDefault()
      fireEmote(EMOTE_KEYS[n - 1])
      return
    }
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (display.stationType) {
      e.preventDefault()
      enterStation(display.stationType)
    } else if (display.nearNpcIndex >= 0 && NPCS[display.nearNpcIndex].kind === 'daily') {
      e.preventDefault()
      goToDaily()
    }
  }

  const sim = initialSim

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ touchAction: 'none' }}
      className="relative w-full h-full bg-retro-card overflow-hidden focus:outline-none"
    >
      <div ref={worldRef} className="absolute top-0 left-0" style={{ willChange: 'transform' }}>
        {/* district floor labels */}
        {DISTRICTS.map((d) => (
          <p
            key={d.id}
            aria-hidden="true"
            className="absolute font-pixel text-[7px] text-retro-dim/60 tracking-widest text-center pointer-events-none"
            style={{ left: `${(d.x / WORLD_W) * 100}%`, top: `${(d.y / WORLD_H) * 100}%`, transform: 'translate(-50%, -50%)' }}
          >
            {d.label}
          </p>
        ))}
        {/* goal net */}
        <div
          className="absolute border-2 border-retro-p2 rounded-sm"
          style={{
            left: `${(GOAL.x / WORLD_W) * 100}%`,
            top: `${(GOAL.y / WORLD_H) * 100}%`,
            width: `${(GOAL.w / WORLD_W) * 100}%`,
            height: `${(GOAL.h / WORLD_H) * 100}%`,
            backgroundImage: 'repeating-linear-gradient(45deg, rgb(var(--c-p2) / 0.18) 0 2px, transparent 2px 6px)',
          }}
        />
        <div
          className="absolute w-1 bg-retro-p2"
          style={{ left: `${(GOAL.x / WORLD_W) * 100}%`, top: `${(GOAL.y / WORLD_H) * 100}%`, height: `${(GOAL.h / WORLD_H) * 100}%` }}
        />
        <div
          className="absolute w-1 bg-retro-p2"
          style={{ left: `${((GOAL.x + GOAL.w) / WORLD_W) * 100}%`, top: `${(GOAL.y / WORLD_H) * 100}%`, height: `${(GOAL.h / WORLD_H) * 100}%` }}
        />

        {STATIONS.map((s) => {
          const cfg = getGameConfig(s.type)
          const Icon = cfg.Icon
          const isActive = display.stationType === s.type
          return (
            <div
              key={s.type}
              className="absolute flex flex-col items-center gap-1"
              style={{
                left: `${(s.x / WORLD_W) * 100}%`, top: `${(s.y / WORLD_H) * 100}%`, transform: 'translate(-50%, -50%)',
                cursor: isActive ? 'var(--cursor-hand)' : undefined,
              }}
              onClick={isActive ? () => enterStation(s.type) : undefined}
              title={isActive ? `Play ${cfg.label}` : cfg.label}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded flex items-center justify-center border-2',
                  isActive
                    ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta text-retro-cta'
                    : 'border-retro-border bg-retro-surface text-retro-dim',
                )}
              >
                {Icon && <Icon />}
              </div>
              <p className="font-pixel text-[6px] text-retro-dim text-center leading-tight">
                {cfg.badge || cfg.label}
              </p>
            </div>
          )
        })}

        {/* kickable ball */}
        <div
          ref={ballRef}
          className="absolute w-2.5 h-2.5 rounded-full bg-retro-p1 shadow-glow-dot"
          style={{
            left: `${(sim.ball.x / WORLD_W) * 100}%`,
            top: `${(sim.ball.y / WORLD_H) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* goal bursts */}
        {bursts.map((b) => (
          <div
            key={b.id}
            className="absolute w-8 h-8 rounded-full border-2 border-retro-win pointer-events-none"
            style={{
              left: `${((GOAL.x + GOAL.w / 2) / WORLD_W) * 100}%`,
              top: `${((GOAL.y + GOAL.h / 2) / WORLD_H) * 100}%`,
              animation: 'pg-goal-burst 0.6s ease-out forwards',
            }}
          />
        ))}

        {/* wandering NPCs */}
        {NPCS.map((def, i) => (
          <div
            key={def.id}
            ref={(el) => { npcPosRefs.current[i] = el }}
            className="absolute"
            style={{
              left: `${(sim.npcs[i].x / WORLD_W) * 100}%`,
              top: `${(sim.npcs[i].y / WORLD_H) * 100}%`,
              transform: `translate(-50%, -50%) scaleX(${sim.npcs[i].facing === 'left' ? -1 : 1})`,
            }}
          >
            <div ref={(el) => { npcBobRefs.current[i] = el }} className={cn(sim.npcs[i].moving && 'pg-walk-bob')}>
              <Avatar id={def.avatar} tile={false} size={40} animate />
            </div>
          </div>
        ))}

        {/* avatar */}
        <div
          ref={avatarPosRef}
          className="absolute"
          style={{
            left: `${(sim.x / WORLD_W) * 100}%`,
            top: `${(sim.y / WORLD_H) * 100}%`,
            transform: `translate(-50%, -50%) scaleX(${sim.facing === 'left' ? -1 : 1})`,
          }}
        >
          <div ref={avatarBobRef} className={cn('relative', sim.moving && 'pg-walk-bob')}>
            <Avatar id={avatarId} tile={false} size={40} animate />
            {emote && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 pointer-events-none">
                <div key={emote.key} className="text-lg" style={{ animation: 'emote-float 1.6s ease-out forwards' }}>
                  {emote.glyph}
                </div>
              </div>
            )}
          </div>
        </div>

        <NpcSpeechBubble display={display} onPlay={goToDaily} />
      </div>

      {/* Screen-reader wayfinding: the canvas world is invisible to AT. */}
      <nav aria-label="Playground stations" className="sr-only">
        <ul>
          {STATIONS.map((s) => (
            <li key={s.type}>
              <a href={`/solo/${s.type}`}>Play {getGameConfig(s.type).label}</a>
            </li>
          ))}
          <li><a href="/daily">Play the daily puzzle</a></li>
        </ul>
      </nav>

      {/* Drag joystick — painted by the rAF loop, hidden unless dragging. */}
      <div
        ref={joyBaseRef}
        aria-hidden="true"
        className="absolute z-20 w-20 h-20 rounded-full border-2 border-retro-cta/60 bg-retro-surface/40 pointer-events-none"
        style={{ display: 'none', transform: 'translate(-50%, -50%)' }}
      >
        <div
          ref={joyKnobRef}
          className="absolute left-1/2 top-1/2 w-8 h-8 rounded-full bg-retro-cta"
          style={{ transform: 'translate(-50%, -50%)' }}
        />
      </div>

      {/* HUD — fixed to the viewport, unaffected by the camera pan */}
      <p className="absolute top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-20 font-pixel text-[8px] text-retro-dim bg-retro-surface/80 px-2 py-1 rounded whitespace-nowrap">
        ARROWS · WASD · SHIFT SPRINT · DRAG · 1-4 EMOTE
      </p>

      <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-20 px-2 py-1 rounded bg-retro-surface border border-retro-border font-pixel text-[8px] text-retro-win">
        ⚽ {display.goals}{display.best > 0 ? ` · BEST ${display.best}` : ''}
      </div>

      {display.stationType ? (
        <button
          onClick={() => enterStation(display.stationType)}
          className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-retro-cta text-retro-bg font-pixel text-[8px] rounded shadow-neon-cta active:scale-95"
        >
          ENTER TO PLAY {(getGameConfig(display.stationType).label || '').toUpperCase()}
        </button>
      ) : display.nearNpcKind === 'daily' ? (
        <button
          onClick={goToDaily}
          className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-retro-surface border border-retro-cta/60 text-retro-cta font-pixel text-[8px] rounded active:scale-95"
        >
          PRESS ENTER FOR DAILY
        </button>
      ) : null}

      <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 flex gap-1.5">
        {EMOTE_KEYS.map((g) => (
          <button
            key={g}
            onClick={() => fireEmote(g)}
            aria-label={`Emote ${g}`}
            className="w-11 h-11 rounded bg-retro-surface border border-retro-border text-base flex items-center justify-center active:scale-95"
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  )
}

// Nearest-NPC speech bubble — daily-hub content for the wizard, a rotating flavor line
// for everyone else. Positioned in world-space percent (so the camera transform carries
// it along automatically); horizontal alignment band is pre-computed in the rAF loop in
// viewport space so the bubble never overflows the visible screen edge.
function NpcSpeechBubble({ display, onPlay }) {
  const { nearNpcIndex, nearNpcPos, nearNpcLine, band } = display
  if (nearNpcIndex < 0 || !nearNpcPos) return null
  const def = NPCS[nearNpcIndex]
  const xForm = band === 'left' ? 'translate(0%, -100%)' : band === 'right' ? 'translate(-100%, -100%)' : 'translate(-50%, -100%)'
  const style = {
    left: `${(nearNpcPos.x / WORLD_W) * 100}%`,
    top: `${((nearNpcPos.y - 0.08) / WORLD_H) * 100}%`,
    transform: xForm,
  }

  if (def.kind === 'daily') return <DailyBubble style={style} onPlay={onPlay} />

  return (
    <div
      className="absolute z-10 bg-retro-surface border border-retro-border rounded p-2 font-pixel text-[7px] text-retro-text max-w-[9rem]"
      style={style}
    >
      <p>{nearNpcLine}</p>
    </div>
  )
}

// Speech bubble showing today's daily-puzzle status, for the wizard NPC only.
function DailyBubble({ style, onPlay }) {
  const today = todayKey()
  const dailyNum = getDailyNumber(today)
  const streak = getStreak().count
  const best = readBest(today)

  return (
    <div
      className="absolute z-10 bg-retro-surface border border-retro-border rounded p-2 font-pixel text-[7px] text-retro-text space-y-1 max-w-[9rem]"
      style={style}
    >
      <p>DAILY #{dailyNum}</p>
      {streak > 0 && <p className="text-retro-cta">🔥{streak}</p>}
      <p className="text-retro-dim">{best ? `BEST ${best.best}` : 'NOT PLAYED YET'}</p>
      <button onClick={onPlay} className="text-retro-win hover:text-glow-win">PLAY →</button>
    </div>
  )
}
