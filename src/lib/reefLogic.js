// REEF RUN — pure simulation + race helpers. No DOM, no Firebase, no React.
// Ported from the step() prototype, with analog input and the level-6 auto-scroll chase.
import { buildLevel, raceLevelIndex, maxScoreFor } from './reefLevels'

export const REEF_RACE_MS = 180_000

// Hitboxes [dx, dy, w, h] in px relative to the sprite's top-left.
export const HIT = {
  jelly: [2, 1, 8, 8], shark: [6, 5, 28, 10], eel: [3, 3, 19, 6], urchin: [3, 3, 7, 7],
  mine: [3, 3, 7, 7], angler: [4, 7, 12, 10], pearl: [0, 0, 7, 7], shell: [0, 0, 11, 9],
  star: [1, 1, 9, 9], heartB: [1, 1, 11, 11], anem: [2, 4, 12, 10], goal: [2, 2, 10, 22],
}
export const HARM = new Set(['jelly', 'shark', 'eel', 'urchin', 'mine', 'angler'])
export const HITBOX = [3, 5, 11, 7] // fish sprite is 18x15

const ACC = 0.14
const DRAG = 0.92
const MAX_SPEED = 1.7
const DASH_SPEED = 3.4
const DASH_COOLDOWN = 60
const HIT_INV = 90
const HIT_KNOCK = 3
const CONTINUE_INV = 120
export const MAX_HP = 3
// Every this many pearls collected restores one heart (up to MAX_HP).
export const PEARLS_PER_HEART = 50
const VIEW_W = 160
const VIEW_H = 128
const SCROLL_EDGE = 4 // fish sprite x never goes below scrollX + this
const CHASER_OFFSET = 26 // chaser sprite x = scrollX - this (hitbox then overlaps the edge-hugging fish)
export const SCORE = { pearl: 10, shell: 50, star: 100, heartFull: 200 }

const overlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const toInt = (v, lo, hi) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? clamp(n, lo, hi) : lo
}

/** True if a w*h box at world (x, y) hits the ceiling, floor or world edge. */
export function solidAt(level, x, y, w, h) {
  if (y < 2 || x < 0 || x + w > level.cols * 8) return true
  for (let c = Math.floor(x / 8); c <= Math.floor((x + w - 1) / 8); c++) {
    if (y < level.ceil[c] * 8 || y + h > level.floor[c] * 8) return true
  }
  return false
}

function startScrollX(level, x) {
  return level.scroll ? Math.max(0, x - 40) : 0
}

function snapCam(run, level) {
  const N = run.nemo
  run.cam.x = level.scroll ? run.scrollX : N.x + 8 - 80
  run.cam.y = N.y + 5 - 64
  clampCam(run, level)
}

function clampCam(run, level) {
  run.cam.x = clamp(run.cam.x, 0, Math.max(0, level.cols * 8 - VIEW_W))
  run.cam.y = clamp(run.cam.y, 0, Math.max(0, level.rows * 8 - VIEW_H))
}

/** Fresh run state for a level; `carry` brings score/pearls/stars over from earlier levels. */
export function createRun(level, carry = { score: 0, pearls: 0, stars: 0 }) {
  const score = carry?.score || 0
  const pearls = carry?.pearls || 0
  const stars = carry?.stars || 0
  const ents = level.ents.map((e) => ({ ...e, gone: false, on: false }))
  const run = {
    t: 0,
    mode: 'play',
    nemo: { x: level.spawn.x, y: level.spawn.y, vx: 0, vy: 0, face: 1, hp: MAX_HP, inv: 0, dashCd: 0, moving: false },
    ents,
    cam: { x: 0, y: 0 },
    scrollX: startScrollX(level, level.spawn.x),
    score,
    pearls,
    stars,
    hits: 0,
    bonus: 0,
    cp: { x: level.spawn.x, y: level.spawn.y, score, pearls, stars, gone: [], on: [] },
    lastScoreAt: 0,
  }
  snapCam(run, level)
  return run
}

/** Time/hearts bonus: hp*500, +1000 if never hit, + (par - elapsed seconds)*10, rounded to 10. */
export function clearBonus(run, level) {
  const noHit = run.hits === 0 ? 1000 : 0
  const time = Math.max(0, level.parSec - run.t / 60) * 10
  return run.nemo.hp * 500 + noHit + Math.round(time / 10) * 10
}

function scrollSpeed(run, level) {
  const goal = level.ents.find((e) => e.k === 'goal')
  const end = goal ? goal.x : level.cols * 8
  const span = Math.max(1, end - level.spawn.x)
  const p = clamp((run.nemo.x - level.spawn.x) / span, 0, 1)
  return level.scroll.speed0 + (level.scroll.speed1 - level.scroll.speed0) * p
}

/**
 * Advance one 60Hz frame. MUTATES run. input = { ix, iy, dash } (ix/iy analog in [-1,1],
 * vector length clamped to 1; dash is true only on the frame the button was pressed).
 * Returns events: 'dash' 'hit' 'pearl' 'shell' 'star' 'heart' 'checkpoint' 'clear' 'dead'.
 * Does nothing unless run.mode === 'play'.
 */
export function stepRun(run, level, input = {}) {
  const events = []
  if (run.mode !== 'play') return events
  const N = run.nemo
  run.t++

  let ix = Number(input.ix) || 0
  let iy = Number(input.iy) || 0
  const len = Math.hypot(ix, iy)
  if (len > 1) { ix /= len; iy /= len }

  // level-6 auto-scroll
  if (level.scroll) {
    run.scrollX = Math.min(run.scrollX + scrollSpeed(run, level), Math.max(0, level.cols * 8 - VIEW_W))
  }

  N.vx += ix * ACC
  N.vy += iy * ACC
  if (input.dash && N.dashCd <= 0) {
    const dm = Math.hypot(ix, iy)
    N.vx = dm ? (ix / dm) * DASH_SPEED : N.face * DASH_SPEED
    N.vy = dm ? (iy / dm) * DASH_SPEED : 0
    N.dashCd = DASH_COOLDOWN
    events.push('dash')
  }
  if (N.dashCd > 0) N.dashCd--
  const sp = Math.hypot(N.vx, N.vy)
  const max = N.dashCd > 45 ? DASH_SPEED : MAX_SPEED
  if (sp > max) { N.vx *= max / sp; N.vy *= max / sp }
  N.vx *= DRAG
  N.vy *= DRAG
  if (Math.abs(iy) < 0.05) N.vy += Math.sin(run.t * 0.06) * 0.01
  if (Math.abs(ix) > 0.2) N.face = ix > 0 ? 1 : -1
  N.moving = Math.abs(N.vx) + Math.abs(N.vy) > 0.3

  const hb = HITBOX
  if (!solidAt(level, N.x + N.vx + hb[0], N.y + hb[1], hb[2], hb[3])) N.x += N.vx
  else N.vx *= -0.2
  if (!solidAt(level, N.x + hb[0], N.y + N.vy + hb[1], hb[2], hb[3])) N.y += N.vy
  else N.vy *= -0.2
  if (level.scroll && N.x < run.scrollX + SCROLL_EDGE) {
    N.x = run.scrollX + SCROLL_EDGE
    if (N.vx < 0) N.vx = 0
  }
  if (N.inv > 0) N.inv--

  // entity motion
  for (const e of run.ents) {
    if (e.k === 'jelly' || e.k === 'mine') {
      e.y = e.by + Math.sin(run.t * (e.k === 'jelly' ? 0.025 : 0.02) + e.ph) * e.amp
    } else if (e.chaser) {
      e.x = run.scrollX - CHASER_OFFSET
    } else if (e.k === 'shark' || e.k === 'eel') {
      e.x += e.flip ? -e.v : e.v
      if (e.x > e.b) e.flip = true
      if (e.x < e.a) e.flip = false
    }
  }

  // collisions / pickups
  const me = [N.x + hb[0], N.y + hb[1], hb[2], hb[3]]
  const gain = (n) => { run.score += n; run.lastScoreAt = run.t }
  for (const e of run.ents) {
    if (e.gone) continue
    const h = HIT[e.k]
    if (!h || !overlap(me, [e.x + h[0], e.y + h[1], h[2], h[3]])) continue
    if (HARM.has(e.k)) {
      if (N.inv > 0) continue
      N.hp--
      N.inv = HIT_INV
      run.hits++
      const dx = N.x + 8 - (e.x + h[0] + h[2] / 2)
      const dy = N.y + 5 - (e.y + h[1] + h[3] / 2)
      const d = Math.hypot(dx, dy) || 1
      N.vx = (dx / d) * HIT_KNOCK
      N.vy = (dy / d) * HIT_KNOCK
      events.push('hit')
      if (N.hp <= 0) {
        N.hp = 0
        run.mode = 'dead'
        events.push('dead')
        break
      }
    } else if (e.k === 'pearl') {
      e.gone = true
      gain(SCORE.pearl)
      run.pearls++
      events.push('pearl')
      if (run.pearls % PEARLS_PER_HEART === 0 && N.hp < MAX_HP) { N.hp++; events.push('heart') }
    } else if (e.k === 'shell') {
      e.gone = true
      gain(SCORE.shell)
      events.push('shell')
    } else if (e.k === 'star') {
      e.gone = true
      run.stars++
      gain(SCORE.star)
      events.push('star')
    } else if (e.k === 'heartB') {
      e.gone = true
      if (N.hp < MAX_HP) N.hp++
      else gain(SCORE.heartFull)
      events.push('heart')
    } else if (e.k === 'anem' && !e.on) {
      e.on = true
      N.hp = Math.min(MAX_HP, N.hp + 1)
      run.cp = {
        x: e.x,
        y: e.y - 12,
        score: run.score,
        pearls: run.pearls,
        stars: run.stars,
        gone: run.ents.filter((o) => o.gone).map((o) => o.id),
        on: run.ents.filter((o) => o.on).map((o) => o.id),
      }
      events.push('checkpoint')
    } else if (e.k === 'goal') {
      run.mode = 'clear'
      run.bonus = clearBonus(run, level)
      gain(run.bonus)
      events.push('clear')
      break
    }
  }

  // camera
  if (level.scroll) run.cam.x = run.scrollX
  else run.cam.x += (N.x + 8 + N.face * 20 - 80 - run.cam.x) * 0.08
  run.cam.y += (N.y + 5 - 64 - run.cam.y) * 0.1
  clampCam(run, level)
  return events
}

/**
 * Solo only: after death, restore the last checkpoint (position, score, pearls, stars,
 * picked-up and activated flags) with full hp and 120 frames of invulnerability.
 * Returns false (and changes nothing) unless the run is dead.
 */
export function continueRun(run, level) {
  if (run.mode !== 'dead') return false
  const cp = run.cp
  const N = run.nemo
  N.x = cp.x; N.y = cp.y; N.vx = 0; N.vy = 0
  N.hp = MAX_HP
  N.inv = CONTINUE_INV
  N.dashCd = 0
  run.score = cp.score
  run.pearls = cp.pearls
  run.stars = cp.stars
  const gone = new Set(cp.gone)
  const on = new Set(cp.on)
  for (const e of run.ents) { e.gone = gone.has(e.id); e.on = on.has(e.id) }
  run.mode = 'play'
  run.scrollX = startScrollX(level, cp.x)
  snapCam(run, level)
  return true
}

// ── Race helpers ──────────────────────────────────────────────────────────

/** Stats pushed to Firebase. `done` / `dead` are only present when true (falsy keys are dropped). */
export function reefStatsFrom(run) {
  const stats = { score: run.score, pearls: run.pearls, hp: run.nemo.hp, at: run.lastScoreAt }
  if (run.mode === 'clear') stats.done = true
  if (run.mode === 'dead') stats.dead = true
  return stats
}

/** Sanitise stats read from Firebase: integers, score <= maxScore, hp 0..3, booleans only when true. */
export function normalizeReefStats(raw, maxScore = Infinity) {
  if (!raw || typeof raw !== 'object') return null
  const out = {
    score: toInt(raw.score, 0, Math.max(0, Number.isFinite(maxScore) ? maxScore : 1e9)),
    pearls: toInt(raw.pearls, 0, 99999),
    hp: toInt(raw.hp, 0, MAX_HP),
    at: toInt(raw.at, 0, 1e7),
  }
  if (raw.done === true) out.done = true
  if (raw.dead === true) out.dead = true
  return out
}

export const isReefDone = (stats) => !!stats?.done || !!stats?.dead

function roundMax(round) {
  return maxScoreFor(buildLevel(raceLevelIndex(round.seed), round.seed))
}

/** Sort entry: higher score first, then the earlier `at`. sortKey is null when there are no stats. */
export function reefRaceEntry(stats, round) {
  const s = normalizeReefStats(stats, roundMax(round))
  if (!s) return { sortKey: null, score: 0 }
  return { sortKey: [-s.score, s.at], score: s.score }
}

/** Row model for the shared race table (same shape as minesRow). */
export function reefRow(stats, round) {
  const s = normalizeReefStats(stats, roundMax(round))
  if (!s) return { primary: '0 PTS', secondary: '', progress: null, status: 'idle', detail: '' }
  const status = s.dead ? 'out' : s.done ? 'done' : 'racing'
  return {
    primary: `${s.score} PTS`,
    secondary: `${s.pearls} PEARLS`,
    progress: null,
    status,
    detail: status === 'out' ? 'OUT' : status === 'done' ? '✓' : `${s.hp}HP`,
  }
}
