// @ts-check
// birdseyeCore.js — the planck-free half of BIRDSEYE: the flock, materials,
// the World 1 forts, shot quantisation, scoring/stars and the online duel's
// turn rules. Kept apart from birdseyeLogic.js (which pulls in the ~48 KB
// physics engine) because games.js sits in the entry bundle and may only
// import this file — the same split as animalStackCore.js.

export const VMAX = 27 // m/s launch speed at 100% power
export const SLING = { x: 0, y: 2.25 }
export const PULL_M = 1.3 // pouch travel at full power (m)
export const ANGLE_STEPS = 4096 // shot angle is stored in 1/4096 turns
export const ANGLE_MIN = -0.17 // rad, a slightly downward shot
export const ANGLE_MAX = 1.4 // rad, a near-vertical lob
export const MIN_POWER = 0.12 // a release under this is a cancel, not a shot
export const MAX_SHOT_TICKS = 540 // 9 s settle cap per shot
export const CROW_POINTS = 1000
export const BIRD_BONUS = 1500 // per unused bird when a fort is cleared

/** The flock. `ability` fires on a tap mid-flight (recorded as tick `k`). */
export const BIRDS = {
  pip: { id: 'pip', name: 'PIP', species: 'sparrow', r: 0.3, density: 5, ability: 'FLAP', tone: 'kam0' },
  dart: { id: 'dart', name: 'DART', species: 'kingfisher', r: 0.27, density: 6, ability: 'DIVE', tone: 'kam6' },
  trio: { id: 'trio', name: 'TRIO', species: 'quail chicks', r: 0.22, density: 5, ability: 'SPLIT', tone: 'kam3' },
}
export const BIRD_IDS = /** @type {const} */ (['pip', 'dart', 'trio'])

/** Materials: `thr` is impulse soaked before damage, `hp` the damage that breaks it. */
export const MATS = {
  wood: { density: 0.7, friction: 0.6, hp: 7, thr: 1.6, points: 50, tone: 'kam0', seg: 0.9 },
  stone: { density: 2.0, friction: 0.8, hp: 26, thr: 4.5, points: 80, tone: 'structure', seg: 1.3 },
  glass: { density: 0.9, friction: 0.25, hp: 1.6, thr: 0.5, points: 120, tone: 'kam6', seg: 1.4, glass: true },
  hay: { density: 0.3, friction: 1.0, hp: 1e9, thr: 1e9, points: 0, tone: 'kam3', seg: 1.15 },
}
export const CROW = { w: 0.6, h: 1.1, density: 0.45, friction: 0.7, hp: 2.6, thr: 1.0 }

// World 1 — FENWICK FARM. Blocks are [material, x, y, w, h, zw]: x/y/w/h live
// in the sim plane (x = down-range, y = up, metres); zw is the block's
// half-width ACROSS the flight line, used only by the renderer so walls face
// the bird. Scarecrows are [x, y] (centre). `stars` = [★★, ★★★] score
// thresholds (★ is any clear), set from headless shot sweeps (see tests).
export const FORTS = [
  {
    id: '1-1', name: 'FIRST FLIGHT', wind: 0, birds: ['pip', 'pip', 'pip'], stars: [2500, 4000],
    tip: 'PULL BACK ANYWHERE, LET GO TO FLY',
    blocks: [
      ['wood', 33.0, 0.8, 0.4, 1.6, 1.8], ['wood', 36.0, 0.8, 0.4, 1.6, 1.8],
      ['wood', 34.5, 1.8, 3.4, 0.4, 2.0],
    ],
    crows: [[34.5, 2.55]],
  },
  {
    id: '1-2', name: 'HAY DAY', wind: 0, birds: ['pip', 'pip', 'pip'], stars: [3400, 4900],
    tip: 'TAP MID-AIR: PIP FLAPS OVER THE HAY',
    blocks: [
      ['hay', 30.0, 0.5, 1.0, 1.0, 2.6], ['hay', 30.0, 1.5, 1.0, 1.0, 2.6],
      ['wood', 35.0, 0.7, 0.4, 1.4, 1.2], ['wood', 37.4, 0.7, 0.4, 1.4, 1.2],
      ['wood', 36.2, 1.6, 2.8, 0.4, 1.6],
    ],
    crows: [[32.6, 0.55], [36.2, 2.35]],
  },
  {
    id: '1-3', name: 'GLASSHOUSE', wind: 0, birds: ['pip', 'dart', 'pip'], stars: [3500, 5000],
    tip: 'TAP TO DIVE: DART SPEARS THROUGH GLASS',
    blocks: [
      ['glass', 34.0, 1.0, 0.3, 2.0, 2.2], ['glass', 37.0, 1.0, 0.3, 2.0, 2.2],
      ['glass', 35.5, 2.15, 3.4, 0.3, 2.4],
      ['stone', 40.0, 0.5, 1.0, 1.0, 1.0],
    ],
    crows: [[35.5, 0.55], [40.0, 1.55]],
  },
  {
    id: '1-4', name: 'FENWICK FARM', wind: -0.6, birds: ['pip', 'dart', 'pip'], stars: [4800, 6500],
    tip: 'WIND BLOWS BACK TOWARD THE SLING',
    blocks: [
      ['hay', 31.2, 0.5, 1.0, 1.0, 2.8],
      ['wood', 34.0, 1.0, 0.4, 2.0, 2.4], ['stone', 36.6, 1.0, 0.4, 2.0, 1.7], ['stone', 39.2, 1.0, 0.4, 2.0, 1.7], ['wood', 41.8, 1.0, 0.4, 2.0, 2.4],
      ['wood', 35.3, 2.2, 2.56, 0.4, 2.4], ['glass', 37.9, 2.2, 2.56, 0.4, 1.7], ['wood', 40.5, 2.2, 2.56, 0.4, 2.4],
      ['wood', 34.6, 3.2, 0.35, 1.6, 0.45], ['wood', 36.0, 3.2, 0.35, 1.6, 0.45], ['wood', 35.3, 4.2, 2.1, 0.4, 1.6],
      ['glass', 37.4, 3.0, 0.3, 1.2, 1.4], ['glass', 38.4, 3.0, 0.3, 1.2, 1.4], ['glass', 37.9, 3.7, 1.5, 0.2, 1.4],
      ['stone', 39.8, 3.2, 0.35, 1.6, 0.6], ['stone', 41.2, 3.2, 0.35, 1.6, 0.6], ['wood', 40.5, 4.2, 2.1, 0.4, 1.9],
    ],
    crows: [[35.3, 0.55], [40.5, 2.95], [35.3, 4.95]],
  },
  {
    id: '1-5', name: 'THE BARN', wind: -0.8, birds: ['pip', 'dart', 'dart'], stars: [4500, 6000],
    tip: 'THE BARN: STONE BELOW, WOOD ABOVE',
    blocks: [
      ['stone', 38.0, 1.0, 0.5, 2.0, 2.6], ['stone', 41.0, 1.0, 0.5, 2.0, 2.0], ['stone', 44.0, 1.0, 0.5, 2.0, 2.6],
      ['wood', 39.5, 2.2, 3.4, 0.4, 2.6], ['wood', 42.5, 2.2, 2.6, 0.4, 2.6],
      ['wood', 38.6, 3.3, 0.35, 1.8, 2.2], ['glass', 41.0, 3.3, 0.3, 1.8, 1.6], ['wood', 43.4, 3.3, 0.35, 1.8, 2.2],
      ['wood', 39.8, 4.4, 2.3, 0.4, 2.2], ['wood', 42.2, 4.4, 2.3, 0.4, 2.2],
      ['hay', 35.6, 0.5, 1.0, 1.0, 2.8],
    ],
    crows: [[39.5, 0.55], [42.5, 0.55], [41.0, 5.15]],
  },
]

export const fortById = (id) => FORTS.find(f => f.id === id) || null

/** Integer shot record every client stores: angle in 1/4096 turns, power per-mille, ability tick (-1 = none). */
export function quantShot(bird, angleRad, power, k = -1) {
  const ang = Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, Number(angleRad) || 0))
  return {
    b: bird,
    a: Math.round(ang / (2 * Math.PI) * ANGLE_STEPS),
    p: Math.max(0, Math.min(1000, Math.round((Number(power) || 0) * 1000))),
    k: Number.isInteger(k) && k >= 0 ? k : -1,
  }
}

/** A shot read back from Firebase, validated and clamped; null when unusable. */
export function normalizeShot(raw) {
  if (!raw || typeof raw !== 'object') return null
  const b = BIRD_IDS.includes(raw.b) ? raw.b : null
  const a = Number(raw.a), p = Number(raw.p), k = Number(raw.k ?? -1)
  if (!b || !Number.isInteger(a) || !Number.isInteger(p) || !Number.isInteger(k)) return null
  const lo = Math.ceil(ANGLE_MIN / (2 * Math.PI) * ANGLE_STEPS), hi = Math.floor(ANGLE_MAX / (2 * Math.PI) * ANGLE_STEPS)
  if (a < lo || a > hi || p < 0 || p > 1000 || k < -1 || k > MAX_SHOT_TICKS) return null
  return { b, a, p, k }
}

/** Score after a solo fort: points earned + the unused-bird bonus on a clear. */
export function fortScore(points, cleared, birdsLeft) {
  return points + (cleared ? birdsLeft * BIRD_BONUS : 0)
}

/** 0-3 stars: ★ any clear, then the fort's two score thresholds. */
export function starsFor(fort, score, cleared) {
  if (!cleared) return 0
  if (score >= fort.stars[1]) return 3
  if (score >= fort.stars[0]) return 2
  return 1
}

// ─── Solo progress (per device; birdseyeProgress.js stores it) ───────────────

/** Clean progress record: { [fortId]: { stars 0-3, best score } } for known forts only. */
export function normalizeProgress(raw) {
  const out = {}
  for (const f of FORTS) {
    const r = raw && typeof raw === 'object' ? raw[f.id] : null
    const stars = Math.max(0, Math.min(3, Math.floor(Number(r?.stars) || 0)))
    const best = Math.max(0, Math.floor(Number(r?.best) || 0))
    if (stars || best) out[f.id] = { stars, best }
  }
  return out
}

/** Fold one finished fort into progress — only ever upward (best stars, best score). */
export function recordFort(progress, fortId, stars, score) {
  const p = normalizeProgress(progress)
  if (!fortById(fortId)) return p
  const cur = p[fortId] || { stars: 0, best: 0 }
  p[fortId] = { stars: Math.max(cur.stars, stars), best: Math.max(cur.best, Math.floor(score) || 0) }
  return p
}

/** Fort `idx` is open once the fort before it has been cleared (1-1 always is). */
export function fortUnlocked(progress, idx) {
  if (idx <= 0) return true
  const prev = FORTS[idx - 1]
  return !!prev && (normalizeProgress(progress)[prev.id]?.stars || 0) > 0
}

// ─── Online duel (two seats, one fort, alternating shots) ────────────────────

export const DUEL_SHOTS_EACH = 3

/** Which bird a seat throws on its n-th (0-based) shot: the fort's flock in order. */
export function duelBird(fort, n) {
  return fort.birds[Math.min(n, fort.birds.length - 1)]
}

/** Sorted shot list (push keys are chronological) with clean records. */
export function duelShots(raw) {
  return Object.keys(raw || {}).sort()
    .map(key => ({ key, by: raw[key]?.by, shot: normalizeShot(raw[key]) }))
    .filter(s => (s.by === 'X' || s.by === 'O') && s.shot)
}

/** Next fort index after `idx` (PLAY AGAIN walks the five forts). */
export const nextFortIndex = (idx) => ((Number.isInteger(idx) ? idx : -1) + 1) % FORTS.length

/** Winner of a finished duel: more scarecrows popped, then more points; else a draw. */
export function duelWinner(pops, points) {
  if (pops.X !== pops.O) return pops.X > pops.O ? 'X' : 'O'
  if (points.X !== points.O) return points.X > points.O ? 'X' : 'O'
  return 'draw'
}

/** Room keys for a fresh duel round on fort `idx` (X throws first). */
export function freshDuel(idx) {
  return { bsFort: Number.isInteger(idx) && idx >= 0 && idx < FORTS.length ? idx : 0, bsShots: null }
}
