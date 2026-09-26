// @ts-check
// detMath.js — bit-deterministic math shared by the replay sims (Artillery,
// Minigolf). Every client replays the same inputs and must reach identical
// state, so these helpers use only + − × ÷ on IEEE-754 doubles:
//   * detSin/detCos are Taylor polynomials — the ECMAScript spec lets engines
//     round Math.sin/cos differently, which is the classic cross-browser
//     desync trap
//   * mulberry32 is the seeded PRNG every sim draws randomness from

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
export const TWO_PI = 6.283185307179586
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
