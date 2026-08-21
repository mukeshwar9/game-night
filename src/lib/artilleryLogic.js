// artilleryLogic.js — deterministic Scorched-Earth duel core.
//
// DETERMINISM CONTRACT (docs/prds/artillery.md): every client replays the
// append-only shot list from artillerySeed and MUST reach bit-identical state.
// Therefore this module contains ONLY + − × ÷ on IEEE-754 doubles:
//   * detSin/detCos are Taylor polynomials (NO Math.sin/cos/pow/exp/sqrt*)
//   * all randomness flows from the seed through mulberry32
//   * fixed timestep dt = 1/120
// (*Math.sqrt is correctly rounded per spec, but avoided anyway out of habit.)

export const TERRAIN_COLS = 256
export const GRAVITY = 0.9          // normalized units / s² (y grows downward)
export const POWER_K = 0.01         // v0 = power · POWER_K (power 0–100); full-power 45° range ≈ 1.1 courts
export const BLAST_RADIUS = 0.06    // fraction of court width
export const MAX_DAMAGE = 35
export const TANK_HITBOX = 0.02

const DT = 1 / 120

// ---------------------------------------------------------------------------
// mulberry32 — seeded PRNG (same family used across the repo's sims).
// ---------------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed | 0
  return function () {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// detSin/detCos — Taylor series with exact range reduction.
// Range reduction: wrap into [0, 2π) using floor() (exact for our magnitudes),
// then fold quadrants. Taylor of sin to x^29 keeps error < 1e-12 on [0, π/2].
// ---------------------------------------------------------------------------
const TWO_PI = 6.283185307179586
const INV_TWO_PI = 1 / TWO_PI

// Reciprocal odd factorials: 1/1!, 1/3!, ... 1/29!
const RECIP_FACT = [
  1,
  1 / 6,
  1 / 120,
  1 / 5040,
  1 / 362880,
  1 / 39916800,
  1 / 6227020800,
  1 / 1307674368000,
  1 / 355687428096000,
  1 / 121645100408832000,
]

function taylorSin(x) {
  // |x| <= π/2 assumed. Horner form of Σ (-1)^k · x^(2k+1) · RECIP_FACT[k].
  const x2 = x * x
  let acc = RECIP_FACT[9]
  for (let k = 8; k >= 0; k--) {
    acc = RECIP_FACT[k] - x2 * acc
  }
  return x * acc
}

export function detSin(x) {
  // Wrap into [0, 2π): floor of a modest-magnitude double is exact.
  let r = x - Math.floor(x * INV_TWO_PI) * TWO_PI
  if (r < 0) r += TWO_PI
  // Quadrant fold into [0, π/2].
  if (r <= Math.PI / 2) return taylorSin(r)
  if (r <= Math.PI) return taylorSin(Math.PI - r)
  if (r <= 3 * Math.PI / 2) return -taylorSin(r - Math.PI)
  return -taylorSin(TWO_PI - r)
}

export function detCos(x) {
  // cos(x) = sin(x + π/2) — same reduction inside detSin handles wrapping.
  return detSin(x + Math.PI / 2)
}

// ---------------------------------------------------------------------------
// Terrain — 3 seeded sine layers + midpoint displacement, clamped so both
// spawn thirds stay landable (no towering walls at spawn x-ranges).
// ---------------------------------------------------------------------------
export function generateTerrain(seed) {
  const rng = mulberry32(seed)
  const cols = new Array(TERRAIN_COLS).fill(0)

  // Sine layers.
  const layers = []
  for (let l = 0; l < 3; l++) {
    layers.push({
      amp: 0.05 + rng() * 0.09,
      freq: (2 + Math.floor(rng() * 4)) * Math.PI,
      phase: rng() * TWO_PI,
      base: 0.18 + l * 0.06,
    })
  }
  for (let i = 0; i < TERRAIN_COLS; i++) {
    const x = i / (TERRAIN_COLS - 1)
    let h = 0.35
    for (const L of layers) {
      h += L.amp * (0.5 + 0.5 * detSin(x * L.freq + L.phase)) - L.base * 0.35
    }
    cols[i] = h
  }

  // Midpoint displacement pass (3 rounds of quarter-resolution noise).
  for (let round = 0; round < 3; round++) {
    const stepCount = 8 * (round + 1)
    const mag = 0.08 / (round + 1)
    for (let s = 0; s < stepCount; s++) {
      const center = Math.floor(rng() * TERRAIN_COLS)
      const width = Math.floor(TERRAIN_COLS / stepCount / 2) + 2
      const bump = (rng() - 0.5) * 2 * mag
      for (let i = Math.max(0, center - width); i < Math.min(TERRAIN_COLS, center + width); i++) {
        const falloff = 1 - Math.abs(i - center) / width
        cols[i] += bump * falloff
      }
    }
  }

  // Clamp to a playable band and smooth once.
  for (let i = 0; i < TERRAIN_COLS; i++) {
    cols[i] = clamp01(cols[i])
  }
  const smoothed = cols.slice()
  for (let i = 1; i < TERRAIN_COLS - 1; i++) {
    smoothed[i] = (cols[i - 1] + cols[i] * 2 + cols[i + 1]) / 4
  }
  return smoothed.map(clamp01)
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }

// Surface y in court coords (y grows DOWNWARD, screen-like): tall terrain →
// smaller surface y.
export function surfaceY(terrain, x) {
  const fx = clamp01(x) * (TERRAIN_COLS - 1)
  const i = Math.floor(fx)
  const frac = fx - i
  const j = Math.min(i + 1, TERRAIN_COLS - 1)
  return 1 - (terrain[i] * (1 - frac) + terrain[j] * frac)
}

// Per-shot wind in ±0.15, derived purely from seed + shot index.
export function windForShot(seed, shotIndex) {
  const rng = mulberry32((seed ^ (shotIndex * 2654435761)) | 0)
  return (rng() * 2 - 1) * 0.15
}

export function initialState(seed) {
  const terrain = generateTerrain(seed)
  const rng = mulberry32((seed ^ 0xBEEF) | 0)
  const xX = 0.08 + rng() * 0.2       // left third
  const xO = 0.72 + rng() * 0.2       // right third
  return {
    terrain,
    tanks: {
      X: { x: xX, hp: 100 },
      O: { x: xO, hp: 100 },
    },
    lastShot: null, // { by, angle, power, path:[{x,y}], impact:{x,y}, damage:{X,O}, wind }
    winner: null,
  }
}

// ---------------------------------------------------------------------------
// simulateShot — fire one shell and apply crater/damage/settle to the state.
// angle: 0–90° measured from horizontal, mirrored per side (X fires rightward,
// O leftward). power: 0–100. Returns the NEW state plus the shot record.
// ---------------------------------------------------------------------------
export function simulateShot(state, shot) {
  const { by, angleDeg, power } = shot
  const wind = windForShot(state.seed ?? 0, state.shotIndex ?? 0)

  const rad = (angleDeg * Math.PI) / 180
  const dir = by === 'X' ? 1 : -1
  const v0 = power * POWER_K
  let x = state.tanks[by].x
  let y = surfaceY(state.terrain, state.tanks[by].x) - TANK_HITBOX
  let vx = detCos(rad) * v0 * dir + wind
  let vy = -detSin(rad) * v0

  const path = [{ x, y }]
  let impact = null

  const MAX_TICKS = 2400 // 20 simulated seconds — plenty for any arc
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    vy += GRAVITY * DT
    vx += wind * DT
    x += vx * DT
    y += vy * DT
    path.push({ x, y })

    // Side bounds: miss, no crater.
    if (x < 0 || x > 1) {
      impact = { x: clamp01(x), y, kind: 'out' }
      break
    }

    // Tank hitboxes — the shooter's own box is ignored while the shell is
    // still ascending out of the muzzle (vy < 0).
    for (const sym of ['X', 'O']) {
      if (sym === by && vy < 0) continue
      const t = state.tanks[sym]
      const ty = surfaceY(state.terrain, t.x)
      if (Math.abs(x - t.x) < TANK_HITBOX && Math.abs(y - ty) < TANK_HITBOX * 1.5) {
        impact = { x, y, kind: 'tank', hitTank: sym }
        break
      }
    }
    if (impact) break

    // Terrain contact (column-interpolated).
    if (y >= surfaceY(state.terrain, x)) {
      impact = { x, y, kind: 'ground' }
      break
    }
  }
  if (!impact) impact = { x: clamp01(x), y, kind: 'out' } // flew off forever

  // Apply explosion.
  const next = {
    ...state,
    terrain: state.terrain.slice(),
    tanks: { X: { ...state.tanks.X }, O: { ...state.tanks.O } },
  }
  const damage = { X: 0, O: 0 }
  if (impact.kind !== 'out') {
    // Crater: subtract a smooth arc around impact x.
    const depth = 0.09
    for (let i = 0; i < TERRAIN_COLS; i++) {
      const cx = i / (TERRAIN_COLS - 1)
      const dist = Math.abs(cx - impact.x)
      if (dist < BLAST_RADIUS) {
        const shape = Math.cos((dist / BLAST_RADIUS) * Math.PI / 2) // 1→0
        next.terrain[i] = clamp01(next.terrain[i] - depth * shape)
      }
    }
    // Splash damage on both tanks (self-hits real).
    for (const sym of ['X', 'O']) {
      const t = next.tanks[sym]
      const dist = Math.sqrt((t.x - impact.x) * (t.x - impact.x))
      const d = Math.round(MAX_DAMAGE * Math.max(0, 1 - dist / BLAST_RADIUS))
      damage[sym] = d
      t.hp = Math.max(0, t.hp - d)
      // Tanks re-settle onto lowered terrain.
      t.y = surfaceY(next.terrain, t.x)
    }
  } else {
    for (const sym of ['X', 'O']) {
      next.tanks[sym].y = surfaceY(next.terrain, next.tanks[sym].x)
    }
  }

  next.lastShot = { by, angleDeg, power, wind, path, impact, damage }
  if (next.tanks.X.hp <= 0 && next.tanks.O.hp <= 0) next.winner = 'draw'
  else if (next.tanks.O.hp <= 0) next.winner = 'X'
  else if (next.tanks.X.hp <= 0) next.winner = 'O'
  return { state: next, record: next.lastShot }
}

// ---------------------------------------------------------------------------
// replayAll — THE contract: same seed + same shot list ⇒ identical state on
// any engine. Fold each shot in order.
// ---------------------------------------------------------------------------
export function replayAll(seed, shots = []) {
  let state = initialState(seed)
  const ordered = Object.keys(shots || {})
    .sort()
    .map(k => ({ key: k, ...shots[k] }))
  const records = []
  for (const s of ordered) {
    state.seed = seed
    state.shotIndex = records.length
    const { state: next, record } = simulateShot(state, s)
    state = next
    records.push(record)
    if (state.winner) break
  }
  delete state.seed
  delete state.shotIndex
  return { state, records }
}
