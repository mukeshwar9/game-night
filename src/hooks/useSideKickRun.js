import { useEffect, useRef, useState } from 'react'
import { DT, MAXSPD, PIPS, BOOST_MIN, BOOST_TOP, CATCHUP_TOP, SLIPSTREAM_TOP, standings, step, formatRaceTime } from '../lib/sideKickLogic'
import { playSideKickEvent, createEngineHum } from '../lib/sideKickSound'
import { isReducedMotion } from './useMotionPref'

// The frame loop shared by the solo page and the online racer: a fixed 60 Hz
// sim step fed by the controls, the renderer drawn every frame, sounds on
// events, and a throttled HUD snapshot for React. The pages decide what makes
// a world and what happens around a step (ghosts, the network, bots).
//
//   worldRef      → { current: world | null }; nothing runs until it is set
//   view          → the rider index this phone follows
//   getInput      → () => { steer, kick, boost } (useSideKickControls)
//   getClockT     → optional () => seconds since the shared go signal (online)
//   beforeFrame   → (world, dt) once per frame, before the steps
//   afterFrame    → (world, events) once per frame with the events of its steps
//   onEvent       → (ev) for each event, after the built-in sound / toast
//   ui            → { pixel, avatars } read each frame
//   paused        → stop stepping (the frame is still drawn)
const HUD_MS = 80
const MAX_STEPS = 5

const ORD = ['1ST', '2ND', '3RD', '4TH']
export const ordinal = (n) => ORD[n - 1] ?? `${n}TH`

/** What the HUD shows for rider `view`. Plain data: compared and re-rendered by React. */
export function hudOf(world, view) {
  const me = world.riders[view]
  const st = standings(world)
  const down = me.state === 'down'
  const cu = me.cu > 0 && !down
  return {
    phase: world.phase,
    place: st.indexOf(me) + 1,
    total: world.riders.length,
    speed: Math.round((me.speed / MAXSPD) * 190),
    time: formatRaceTime(Math.max(0, world.t)),
    pips: down ? 0 : me.pips,
    hurt: me.pips < PIPS || down,
    down,
    done: me.done,
    cool: me.cd > 0,
    strain: Math.round(Math.min(1, me.strain) * 100) / 100,
    boost: Math.round(me.boost * 100) / 100,
    boosting: me.boosting,
    boostReady: me.boost >= BOOST_MIN && !me.boosting,
    chip: me.boosting ? `BOOST +${Math.round((BOOST_TOP - 1) * 100)}%` : cu ? `CATCH-UP +${Math.round((CATCHUP_TOP - 1) * 100)}%` : me.draft > 0.5 ? `SLIPSTREAM +${Math.round((SLIPSTREAM_TOP - 1) * 100)}%` : null,
    marked: me.mark >= 0 && world.riders[me.mark] ? world.riders[me.mark].name : null,
    count: world.phase === 'count' ? Math.max(1, Math.ceil(world.countT - 0.2)) : null,
    rail: world.riders.map((r) => ({ i: r.i, at: Math.round(Math.max(0, Math.min(1, r.z / world.track.finish)) * 1000) / 1000, down: r.state === 'down' })),
  }
}

function toastFor(ev, world, me) {
  const rs = world.riders
  const name = (i) => rs[i]?.name ?? '?'
  switch (ev.t) {
    case 'hit':
      if (ev.by === me && !ev.ko) return [`KICKED ${name(ev.to)}`, '']
      if (ev.to === me && !ev.ko) return [`${name(ev.by)} KICKED YOU`, 'bad']
      return null
    case 'miss': return ev.by === me ? ['WHIFF', 'dim'] : null
    case 'down':
      if (ev.to === me) return [ev.why === 'car' ? 'WIPEOUT' : ev.why === 'over' ? 'TOO MANY KICKS · YOU FELL' : `KNOCKED OFF BY ${name(ev.by)}`, 'bad']
      if (ev.by === me) return [`${name(ev.to)} IS OFF THE BIKE`, 'good']
      return null
    case 'ghostdown': return ev.by === me ? [`${name(ev.to)} IS OFF THE BIKE`, 'good'] : null
    case 'payback': return ev.by === me ? [`PAYBACK! +1 CUP POINT`, 'good'] : null
    case 'oil': return ev.to === me ? ['OIL', 'dim'] : null
    case 'clang': return ev.by === me ? ['CLANG · THEY ARE SHIELDED', 'dim'] : null
    case 'up': return ev.to === me && ev.catchUp ? ['BACK ON · CATCH-UP', 'good'] : null
    default: return null
  }
}

export default function useSideKickRun({
  worldRef, view, enabled = true, getInput, getClockT = null, beforeFrame = null, afterFrame = null,
  onEvent = null, ui = {}, paused = false,
}) {
  const rendererRef = useRef(null)
  const [hud, setHud] = useState(null)
  const [toast, setToast] = useState(null)
  const cb = useRef({})
  useEffect(() => { cb.current = { getInput, getClockT, beforeFrame, afterFrame, onEvent, ui, paused, view } })

  useEffect(() => {
    if (!enabled) return undefined
    let raf = 0
    let last = 0
    let acc = 0
    let hudAt = 0
    let hudKey = ''
    let toastAt = 0
    let goAt = 0
    const engine = createEngineHum()
    const showToast = (text, tone) => { toastAt = performance.now(); setToast({ text, tone, id: toastAt }) }
    const loop = (ts) => {
      raf = requestAnimationFrame(loop)
      const world = worldRef.current
      const renderer = rendererRef.current
      const c = cb.current
      if (!world || !renderer) { last = ts; return }
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0
      last = ts
      const me = world.riders[c.view]
      const events = []
      if (!c.paused && !document.hidden) {
        c.beforeFrame?.(world, dt)
        if (!renderer.tickHitStop(dt)) acc += dt
        let n = 0
        while (acc >= DT && n++ < MAX_STEPS) {
          const input = c.getInput?.()
          const clockT = c.getClockT?.()
          step(world, input ? { [c.view]: input } : {}, DT, clockT ?? null)
          if (world.events.length) events.push(...world.events.splice(0))
          acc -= DT
        }
        if (n >= MAX_STEPS) acc = 0
      } else acc = 0
      for (const ev of events) {
        renderer.event(ev, world, c.view)
        playSideKickEvent(ev, c.view)
        if (ev.t === 'go') goAt = performance.now()
        const t = toastFor(ev, world, c.view)
        if (t) showToast(t[0], t[1])
        c.onEvent?.(ev, world)
      }
      c.afterFrame?.(world, events)
      renderer.draw(world, c.view, dt, { pixel: !!c.ui?.pixel, avatars: c.ui?.avatars !== false, reduced: isReducedMotion(), paused: !!c.paused })
      engine.update({
        speed: me.speed / MAXSPD, boosting: me.boosting, wobble: me.stag > 0,
        live: world.phase === 'race' || world.phase === 'finishing' || world.phase === 'count', time: ts / 1000,
      })
      if (ts - hudAt >= HUD_MS) {
        hudAt = ts
        const next = hudOf(world, c.view)
        next.go = goAt > 0 && performance.now() - goAt < 900
        const key = JSON.stringify(next)
        if (key !== hudKey) { hudKey = key; setHud(next) }
        if (toastAt && performance.now() - toastAt > 1300) { toastAt = 0; setToast(null) }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      engine.stop()
    }
  }, [enabled, worldRef])

  return { rendererRef, hud, toast }
}
