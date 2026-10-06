import { useCallback, useEffect, useRef, useState } from 'react'
import { SHRINK_START, clashIntensity, edgeDanger } from '../lib/sumoLogic'
import { sounds } from '../lib/sounds'

// Presentation-only "juice" for Sumo Arena: dust puffs and a screen shake on
// a clash, the lunge / squash poses, callouts, the ring-out flash and the
// sound cues. Shared by the solo demo (local sim events) and multiplayer (host
// sim events, relayed to the guest as {k, by}), so both play the same. Clash
// strength is read from the rendered blobs, which the guest also has.
//
// Particles, shake and flash are skipped under reduced motion (the app's
// data-motion pref); poses and sound still play.

const MAX_PARTICLES = 16
const PARTICLE_MS = 450
const CALLOUT_MS = 950
const POSE_MS = 140
// Taiko heartbeat while someone teeters: slow at the warning line, fast on
// the edge.
const TENSION_FROM = 0.72
const BEAT_SLOW_MS = 620
const BEAT_FAST_MS = 260
// The crowd gasps once per near ring-out, re-armed when the wrestler recovers.
const OOH_AT = 0.88
const OOH_REARM = 0.6

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced'

let nextId = 1

const CLASH_CALLS = ['SLAP!', 'OOF!', 'DOSUKOI!', 'WHAM!']

function dust(x, y, count, spread) {
  const out = []
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const d = spread * (0.5 + Math.random() * 0.7)
    out.push({
      id: nextId++, x, y,
      size: 3 + Math.round(Math.random() * 3),
      dx: Math.cos(a) * d, dy: Math.sin(a) * d - spread * 0.25,
      tone: i % 3 === 0 ? 'cta' : 'text',
    })
  }
  return out
}

const EMPTY = {
  particles: [], callout: null, shake: { n: 0, mag: 0 }, flash: 0,
  lunge: null, squash: false, cheer: false,
}

/**
 * @param {{ mySide?: 'X'|'O'|null }} opts
 */
export function useSumoFx({ mySide = null } = {}) {
  const [fx, setFx] = useState(EMPTY)
  const timers = useRef(new Set())
  const meRef = useRef(mySide)
  useEffect(() => { meRef.current = mySide }, [mySide])
  // Frame-to-frame trackers for the tension beat, the gasp and the shrink cue.
  const track = useRef({ beatAt: 0, oohArmed: { X: true, O: true }, lastT: 0, shrinkCalled: false })

  useEffect(() => {
    const pending = timers.current
    return () => { for (const t of pending) clearTimeout(t) }
  }, [])

  const later = useCallback((fn, ms) => {
    const t = setTimeout(() => { timers.current.delete(t); fn() }, ms)
    timers.current.add(t)
  }, [])

  const showCallout = useCallback((text, tone) => {
    const callout = { id: nextId++, text, tone }
    setFx(prev => ({ ...prev, callout }))
    later(() => setFx(prev => (prev.callout?.id === callout.id ? { ...prev, callout: null } : prev)), CALLOUT_MS)
  }, [later])

  const cheer = useCallback((ms) => {
    setFx(prev => (prev.cheer ? prev : { ...prev, cheer: true }))
    later(() => setFx(prev => ({ ...prev, cheer: false })), ms)
  }, [later])

  // Local player's own tap: stomp + lunge pose. Not relayed — the opponent
  // sees the push through the clash it causes.
  const onTap = useCallback(() => {
    const me = meRef.current
    if (!me) return
    sounds.sumoStomp()
    setFx(prev => ({ ...prev, lunge: me }))
    later(() => setFx(prev => (prev.lunge === me ? { ...prev, lunge: null } : prev)), POSE_MS)
  }, [later])

  // Sim events ('clash', 'out') with the blobs as currently rendered.
  const onEvents = useCallback((events, blobs) => {
    if (!events?.length) return
    const calm = reducedMotion()
    for (const e of events) {
      if (e.type === 'clash') {
        const p = clashIntensity(blobs?.X, blobs?.O)
        sounds.sumoClash(p)
        const cx = ((blobs?.X?.x ?? 0.5) + (blobs?.O?.x ?? 0.5)) / 2
        const cy = ((blobs?.X?.y ?? 0.5) + (blobs?.O?.y ?? 0.5)) / 2
        const particles = calm ? [] : dust(cx, cy, 5 + Math.round(p * 7), 16 + p * 26)
        const ids = new Set(particles.map(q => q.id))
        setFx(prev => ({
          ...prev,
          squash: true,
          particles: particles.length ? prev.particles.concat(particles).slice(-MAX_PARTICLES) : prev.particles,
          shake: !calm && p > 0.2 ? { n: prev.shake.n + 1, mag: 2 + Math.round(p * 5) } : prev.shake,
        }))
        later(() => setFx(prev => ({ ...prev, squash: false })), POSE_MS)
        if (ids.size) later(() => setFx(prev => ({ ...prev, particles: prev.particles.filter(q => !ids.has(q.id)) })), PARTICLE_MS)
        if (p > 0.55) {
          showCallout(CLASH_CALLS[Math.floor(Math.random() * CLASH_CALLS.length)], 'cta')
          sounds.sumoCrowd(false)
          cheer(450)
        }
      } else if (e.type === 'out') {
        sounds.sumoRingOut()
        const me = meRef.current
        const tone = e.by === 'X' ? 'O' : 'X'
        showCallout(me ? (e.by === me ? 'OUT!' : 'RING OUT!') : 'RING OUT!', tone)
        setFx(prev => ({
          ...prev,
          flash: calm ? prev.flash : prev.flash + 1,
          shake: calm ? prev.shake : { n: prev.shake.n + 1, mag: 7 },
        }))
        cheer(1600)
      }
    }
  }, [later, showCallout, cheer])

  // Per rendered frame: edge tension beat, the near-miss gasp, the
  // ring-shrinking warning. Cheap — a few comparisons per frame.
  const onFrame = useCallback((view, nowMs) => {
    if (!view?.blobs) return
    const tr = track.current
    const t = view.t ?? 0
    if (t + 0.5 < tr.lastT) { tr.shrinkCalled = false }
    tr.lastT = t
    if (!tr.shrinkCalled && t > SHRINK_START) {
      tr.shrinkCalled = true
      sounds.sumoShrink()
      showCallout('RING SHRINKING!', 'danger')
    }
    let worst = 0
    for (const side of ['X', 'O']) {
      const d = edgeDanger(view.blobs[side], view.arenaR)
      worst = Math.max(worst, d)
      if (tr.oohArmed[side] && d >= OOH_AT) {
        tr.oohArmed[side] = false
        sounds.sumoOoh()
        cheer(500)
      } else if (!tr.oohArmed[side] && d < OOH_REARM) {
        tr.oohArmed[side] = true
      }
    }
    if (worst >= TENSION_FROM) {
      const k = (worst - TENSION_FROM) / (1 - TENSION_FROM)
      const gap = BEAT_SLOW_MS - (BEAT_SLOW_MS - BEAT_FAST_MS) * k
      if (nowMs - tr.beatAt >= gap) {
        tr.beatAt = nowMs
        sounds.sumoTension(k)
      }
    }
  }, [showCallout, cheer])

  // Round opens: gong + the referee's call.
  const start = useCallback(() => {
    track.current = { beatAt: 0, oohArmed: { X: true, O: true }, lastT: 0, shrinkCalled: false }
    sounds.sumoGong()
    showCallout('HAKKEYOI!', 'cta')
  }, [showCallout])

  const reset = useCallback(() => {
    for (const t of timers.current) clearTimeout(t)
    timers.current.clear()
    track.current = { beatAt: 0, oohArmed: { X: true, O: true }, lastT: 0, shrinkCalled: false }
    setFx(EMPTY)
  }, [])

  return { fx, onTap, onEvents, onFrame, start, reset }
}
