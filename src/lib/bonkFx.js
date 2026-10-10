// bonkFx.js — BONK BUGGIES presentation logic: particles, screen shake, the
// camera that frames both buggies, and the words on the banner. Pure — no DOM,
// no canvas, no audio; the renderer paints what this describes and the page
// plays the sound cues applyEvent() returns. Nothing here affects the rules.
//
// `rng` is injectable so tests are deterministic; the page passes Math.random.
import { VIEW, arenaById, arenaGeometry } from './bonkArenas'
import { T, SEATS } from './bonkLogic'

const MAX_PARTS = 260

export function createFx(rng = Math.random) {
  return { parts: [], shake: 0, flash: 0, rng }
}

/** Emit `n` particles of one kind from (x, y). Kinds: dust smoke spark drop ring star lid. */
export function emit(fx, type, x, y, n, o = {}) {
  const rnd = fx.rng
  for (let i = 0; i < n && fx.parts.length < MAX_PARTS; i++) {
    const a = (o.a0 ?? 0) + rnd() * (o.spread ?? Math.PI * 2)
    const sp = (o.speed ?? 2) * (0.4 + rnd() * 0.8)
    const jit = o.jit ?? 0.1
    fx.parts.push({
      type, x: x + (rnd() - 0.5) * jit, y: y + (rnd() - 0.5) * jit,
      vx: Math.cos(a) * sp + (o.vx ?? 0), vy: Math.sin(a) * sp + (o.vy ?? 0),
      life: o.life ?? 0.5, max: o.life ?? 0.5, size: (o.size ?? 0.1) * (0.6 + rnd() * 0.8),
      col: o.col, rot: rnd() * 6, g: o.g ?? 0, spin: (rnd() - 0.5) * 12,
    })
  }
}

/**
 * Turn one sim event into particles, shake and flash, and return the sound
 * cues to play: [{ cue, power? }]. With `reduced` there is no shake, flash or
 * screen-filling spray: the sounds and one small mark stay.
 */
export function applyEvent(fx, e, { reduced = false } = {}) {
  const cues = []
  const shake = (v) => { if (!reduced) fx.shake = Math.max(fx.shake, v) }
  switch (e.type) {
    case 'hit':
      if (e.cars) {
        emit(fx, 'spark', e.x, e.y, Math.min(10, 2 + Math.round(e.power * 2)), { speed: 5, life: 0.3, g: 9 })
        if (e.power > 1.6) { cues.push({ cue: 'clash', power: Math.min(1, e.power / 6) }); shake(0.12) }
      } else if (e.power > 1.4) {
        emit(fx, 'dust', e.x, e.y, 3, { speed: 1.2, life: 0.45, size: 0.14, a0: 0.3, spread: 2.5 })
        if (e.power > 3) cues.push({ cue: 'thud', power: Math.min(1, e.power / 10) })
      }
      break
    case 'splash':
      emit(fx, 'drop', e.x, e.y, 6 + Math.round(e.power * 2), { speed: 2 + e.power * 0.6, a0: 0.5, spread: 2.1, life: 0.8, g: 11, size: 0.06 })
      emit(fx, 'ring', e.x, e.y, 1, { speed: 0, life: 0.6, size: 1.1, col: 'foam' })
      cues.push({ cue: 'splash' })
      break
    case 'hop':
      emit(fx, 'dust', e.x - e.ux * 0.5, e.y - e.uy * 0.5, 7, { speed: 2.2, life: 0.4, size: 0.13 })
      cues.push({ cue: 'hop' })
      break
    case 'shield':
      emit(fx, 'lid', e.x, e.y, 1, { speed: 4, a0: 1.1, spread: 0.9, life: 1.3, g: 12, size: 0.3, col: 'cta' })
      emit(fx, 'ring', e.x, e.y, 1, { speed: 0, life: 0.45, size: 1.3, col: 'cta' })
      emit(fx, 'star', e.x, e.y, 5, { speed: 3, life: 0.5, size: 0.12, col: 'cta' })
      cues.push({ cue: 'shield' })
      shake(0.2)
      break
    case 'bonk':
    case 'self':
      emit(fx, 'star', e.x, e.y, 12, { speed: 4.5, life: 0.9, size: 0.17, col: 'cta', g: 3 })
      emit(fx, 'lid', e.x, e.y, 1, { speed: 5, a0: 1, spread: 1.1, life: 1.6, g: 12, size: 0.21, col: 'lid' })
      emit(fx, 'ring', e.x, e.y, 1, { speed: 0, life: 0.5, size: 1.6, col: 'foam' })
      emit(fx, 'smoke', e.x, e.y, 5, { speed: 0.8, life: 1.1, size: 0.16, vy: 0.9 })
      cues.push({ cue: 'bonk' })
      shake(0.5)
      if (!reduced) fx.flash = 0.5
      break
    case 'sunk':
      emit(fx, 'drop', e.x, e.y, 22, { speed: 5, a0: 0.6, spread: 1.9, life: 1, g: 11, size: 0.08 })
      emit(fx, 'ring', e.x, e.y, 2, { speed: 0, life: 0.8, size: 1.8, col: 'foam' })
      cues.push({ cue: 'sunk' })
      break
    case 'count': cues.push({ cue: 'tick', digit: e.digit }); break
    case 'go': cues.push({ cue: 'go' }); break
    case 'chose': cues.push({ cue: 'chose' }); break
    default: break
  }
  return cues
}

/** Per-frame ambient effects from the current view: wheel dust and smoke off a wreck. */
export function ambient(fx, view, dt) {
  const rnd = fx.rng
  if (view.phase !== 'play' && view.phase !== 'ko') return
  for (const c of view.cars) {
    if (c.alive && c.d && rnd() < 0.3 * dt * 60) {
      const w = c.wheels[c.d > 0 ? 0 : 1]
      emit(fx, 'dust', w.x, w.y - 0.26, 1, { speed: 0.8, a0: c.d > 0 ? 2.4 : 0.2, spread: 0.6, life: 0.4, size: 0.1 })
    }
    if (!c.alive && c.out && c.out.reason !== 'sunk' && rnd() < 0.12 * dt * 60) {
      emit(fx, 'smoke', c.x, c.y + 0.3, 1, { speed: 0.3, life: 1, size: 0.14, vy: 1 })
    }
  }
}

/** Advance particles, shake and flash by `dt` real seconds. */
export function stepFx(fx, dt) {
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const q = fx.parts[i]
    q.life -= dt
    if (q.life <= 0) { fx.parts.splice(i, 1); continue }
    q.vy -= q.g * dt
    q.x += q.vx * dt
    q.y += q.vy * dt
    q.rot += q.spin * dt
    if (q.type === 'dust' || q.type === 'smoke') { q.vx *= 0.94; q.vy *= 0.94 }
  }
  fx.shake = Math.max(0, fx.shake - dt * 1.6)
  fx.flash = Math.max(0, fx.flash - dt * 2.5)
}

// ─── camera ──────────────────────────────────────────────────────────────────
export const NEW_CAMERA = { x: 0, y: 6.6, z: 0.66 }

/**
 * Where the camera wants to be: wide while the buggies are apart, closing in as
 * they meet, and on the point of impact during the knockout (not when reduced).
 */
export function cameraTarget(view, { focus = null, reduced = false } = {}) {
  const geo = arenaGeometry(view.arena)
  const half = geo.half
  const zMin = VIEW.w / (half * 2 + 2.4)
  let tz = zMin
  let tx = 0
  if (view.phase === 'play' || view.phase === 'ko') {
    let lo = Infinity
    let hi = -Infinity
    for (const c of view.cars) { lo = Math.min(lo, c.x); hi = Math.max(hi, c.x) }
    tz = Math.max(zMin, Math.min(1.12, VIEW.w / (hi - lo + 6.5)))
    const room = Math.max(0, half + 1.2 - VIEW.w / 2 / tz)
    tx = Math.max(-room, Math.min(room, (lo + hi) / 2))
  }
  const zoomIn = view.phase === 'ko' && focus && !reduced
  if (zoomIn) {
    tz = Math.min(1.5, tz * 1.3)
    tx += (focus.x - tx) * 0.6
  }
  let ty = VIEW.y0 + 4.5 / tz
  if (zoomIn) ty = Math.max(ty, focus.y - 1.2 / tz)
  return { x: tx, y: ty, z: tz }
}

/** Ease `cam` toward `target`; a reduced-motion camera simply follows without the zoom. */
export function stepCamera(cam, target, dt, phase) {
  const k = Math.min(1, dt * (phase === 'ko' ? 7 : 2.6))
  cam.x += (target.x - cam.x) * k
  cam.y += (target.y - cam.y) * k
  cam.z += (target.z - cam.z) * k
  return cam
}

// ─── words ───────────────────────────────────────────────────────────────────
/** "TIDE IN 7", "TIDE RISING" — and whether it is warning or live. */
export function tideChip(view) {
  const left = view.tideLeft
  if (view.phase === 'count') return { text: `TIDE IN ${T.tideStart}`, hot: false, warn: false }
  if (left > 0) return { text: `TIDE IN ${Math.ceil(left)}`, hot: false, warn: left <= 3 && view.phase === 'play' }
  return { text: 'TIDE RISING', hot: true, warn: false }
}

/**
 * The big word in the middle of the arena, or null. `names` maps seat letters
 * to what to call them ({ X: 'YOU', O: 'BOB' }).
 */
export function bannerFor(view, names) {
  const call = (seat) => names?.[seat] ?? seat
  const verb = (seat) => (call(seat) === 'YOU' ? 'SCORE' : 'SCORES')
  if (view.phase === 'count') {
    const arena = arenaById(view.arena).name
    return view.digit > 0 ? { big: String(view.digit), small: arena, kind: 'count' } : null
  }
  if (view.phase === 'play') return view.timer < 0.55 ? { big: 'GO', small: '', kind: 'go' } : null
  if (view.phase === 'ko' && view.outcome) {
    const o = view.outcome
    if (o.double) return { big: 'DOUBLE SPLASH', small: 'NO POINT · REPLAY', kind: 'ko' }
    const seat = SEATS[o.winner]
    const big = o.reason === 'bonk' ? 'BONK!' : o.reason === 'self' ? 'OWN LID!' : 'SPLASH!'
    return { big, small: `${call(seat)} ${verb(seat)}`, kind: 'ko' }
  }
  return null
}

// ─── what React needs ────────────────────────────────────────────────────────
const HOP_STEPS = 24

/**
 * The slow-changing facts the HUD renders: phase, score, the banner, the tide
 * chip, who holds a spare lid, and each pad's hop charge in 1/24ths. The page
 * keeps the last one and only sets state when sameHud() says it changed, so a
 * 60 Hz view does not become a 60 Hz React render.
 */
export function hudOf(view, names) {
  return {
    phase: view.phase,
    round: view.round,
    score: view.score,
    arena: view.arena,
    banner: bannerFor(view, names),
    tide: tideChip(view),
    lids: view.cars.map((c) => c.shield),
    hop: view.cars.map((c) => Math.round((1 - Math.min(1, Math.max(0, c.hopCd / T.hopCooldown))) * HOP_STEPS) / HOP_STEPS),
    pick: view.pick ? { by: view.pick.by, options: view.pick.options, secs: Math.ceil(view.pick.left) } : null,
    winner: view.winner,
  }
}

export function sameHud(a, b) {
  if (!a || !b) return a === b
  return JSON.stringify(a) === JSON.stringify(b)
}
