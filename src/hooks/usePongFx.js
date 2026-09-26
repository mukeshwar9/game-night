import { useCallback, useEffect, useRef, useState } from 'react'
import { PICKUP_INFO } from '../lib/pongLogic'
import { sounds } from '../lib/sounds'

// Presentation-only "juice" for Pong: hit particles, callouts, goal flashes,
// screen shake and sound, all driven by the sim's event list. Shared by the
// solo demo (local sim events) and multiplayer (host sim events, relayed to
// the guest over the data channel) so both feel identical.
//
// Particles are skipped under reduced motion (the app's data-motion pref,
// which already defaults from the OS setting); PongCourt skips the shake.

const MAX_PARTICLES = 60
const PARTICLE_MS = 450
const CALLOUT_MS = 950
const FLASH_MS = 380
const HIT_MS = 90

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced'

let nextId = 1

function burst(x, y, color, count, spread) {
  const out = []
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const d = spread * (0.5 + Math.random() * 0.7)
    out.push({ id: nextId++, x, y, color, size: 3 + Math.round(Math.random() * 3), dx: Math.cos(a) * d, dy: Math.sin(a) * d })
  }
  return out
}

/**
 * @param {{ mySide?: 'X'|'O'|null, names?: {X?:string, O?:string} }} opts
 * @returns {{ fx: object, emit: (events: object[]) => void, reset: () => void }}
 */
export function usePongFx({ mySide = null, names = {} } = {}) {
  const [fx, setFx] = useState({ particles: [], callout: null, flash: null, hit: null, shake: { n: 0, mag: 0 } })
  const timers = useRef(new Set())
  const optsRef = useRef({ mySide, names })
  useEffect(() => { optsRef.current = { mySide, names } }, [mySide, names])

  useEffect(() => {
    const pending = timers.current
    return () => { for (const t of pending) clearTimeout(t) }
  }, [])

  const emit = useCallback((events) => {
    if (!events?.length) return
    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.current.delete(t); fn() }, ms)
      timers.current.add(t)
    }
    const { mySide: me } = optsRef.current
    const calm = reducedMotion()
    let particles = []
    let callout = null
    let flash = null
    let hit = null
    let shake = 0

    for (const e of events) {
      switch (e.type) {
        case 'paddle':
          sounds.hit(e.rally ?? 0)
          hit = { side: e.side }
          particles = particles.concat(burst(e.x, e.y, e.side, 6 + Math.min(6, e.rally ?? 0), 26))
          if ((e.speed ?? 0) > 1.5) shake = Math.max(shake, 2)
          break
        case 'wall':
          sounds.wall?.()
          particles = particles.concat(burst(e.x, e.y, 'text', 3, 14))
          break
        case 'bump':
          sounds.kick?.()
          particles = particles.concat(burst(e.x, e.y, 'cta', 5, 20))
          break
        case 'pickup': {
          sounds.join?.()
          const info = PICKUP_INFO[e.kind]
          callout = { text: `${info?.name ?? 'POWER-UP'}!`, tone: e.by }
          particles = particles.concat(burst(e.x, e.y, 'win', 12, 40))
          break
        }
        case 'shield':
          sounds.kick?.()
          callout = { text: 'BLOCKED!', tone: e.side }
          particles = particles.concat(burst(e.x, e.y, 'win', 10, 34))
          shake = Math.max(shake, 4)
          break
        case 'score':
          if (me && e.by !== me) sounds.miss()
          else sounds.go()
          flash = e.by
          callout = { text: me ? (e.by === me ? 'POINT!' : 'MISSED!') : 'POINT!', tone: e.by }
          particles = particles.concat(burst(e.x ?? 0.5, e.y ?? 0.5, e.by, 16, 60))
          shake = Math.max(shake, 7)
          break
        case 'rally':
          if (!callout) callout = { text: `RALLY ${e.n}!`, tone: 'cta' }
          break
        case 'timeup':
          sounds.buzz?.()
          callout = { text: e.suddenDeath ? 'SUDDEN DEATH!' : 'TIME!', tone: 'danger' }
          break
        case 'life':
          sounds.miss()
          callout = { text: e.lives > 0 ? `${e.lives} ${e.lives === 1 ? 'LIFE' : 'LIVES'} LEFT` : 'GAME OVER', tone: 'danger' }
          shake = Math.max(shake, 7)
          break
        default:
          break
      }
    }

    if (calm) particles = []
    const ids = new Set(particles.map(p => p.id))
    const calloutWithId = callout && { ...callout, id: nextId++ }
    setFx(prev => ({
      particles: particles.length ? prev.particles.concat(particles).slice(-MAX_PARTICLES) : prev.particles,
      callout: calloutWithId || prev.callout,
      flash: flash || prev.flash,
      hit: hit || prev.hit,
      shake: shake ? { n: prev.shake.n + 1, mag: shake } : prev.shake,
    }))
    if (ids.size) later(() => setFx(prev => ({ ...prev, particles: prev.particles.filter(p => !ids.has(p.id)) })), PARTICLE_MS)
    if (calloutWithId) later(() => setFx(prev => (prev.callout?.id === calloutWithId.id ? { ...prev, callout: null } : prev)), CALLOUT_MS)
    if (flash) later(() => setFx(prev => ({ ...prev, flash: null })), FLASH_MS)
    if (hit) later(() => setFx(prev => ({ ...prev, hit: null })), HIT_MS)
  }, [])

  const reset = useCallback(() => {
    for (const t of timers.current) clearTimeout(t)
    timers.current.clear()
    setFx({ particles: [], callout: null, flash: null, hit: null, shake: { n: 0, mag: 0 } })
  }, [])

  return { fx, emit, reset }
}
