// WIRE CROSSED seeded randomness (xmur3 → mulberry32). Both screens must
// derive the same bomb from the same seed; nothing here is secret. Modules
// and generators draw only from an rng passed in — never Math.random or
// Date.now — so a bomb is identical on every client.
//
// Pure — no DOM, no Firebase, no React.

export function makeRng(seed) {
  const s = String(seed)
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  let a = (h ^ (h >>> 16)) >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]
export function shuffle(rng, arr) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
export const sample = (rng, arr, n) => shuffle(rng, arr).slice(0, n)
