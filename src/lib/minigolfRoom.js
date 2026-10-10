// @ts-check
// minigolfRoom.js — normalizers for Minigolf's Firebase room keys (pure).
// Firebase hands back arrays or numeric-keyed objects depending on sparsity,
// and drops empty nodes, so every read goes through these.

/**
 * golfOrder: seat uids in play order.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeGolfOrder(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(v => typeof v === 'string' && v)
  if (typeof raw !== 'object') return []
  return Object.entries(raw)
    .map(([k, v]) => [parseInt(k, 10), v])
    .filter(([k, v]) => Number.isInteger(k) && typeof v === 'string' && v)
    .sort((a, b) => /** @type {number} */ (a[0]) - /** @type {number} */ (b[0]))
    .map(([, v]) => /** @type {string} */ (v))
}

/** Stroke key for the n-th stroke: s0000, s0001… (sorts in play order). @param {number} n */
export const shotKey = (n) => `s${String(n).padStart(4, '0')}`

/**
 * golfShots { s0000: { by, h, a, p, k }, … } → ordered stroke list. Malformed
 * entries are dropped (the replay would ignore them anyway).
 * @param {unknown} raw
 * @returns {{ by: string, h: number, a: number, p: number, k: number }[]}
 */
export function normalizeGolfShots(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.keys(raw)
    .filter(k => /^s\d{4}$/.test(k))
    .sort()
    .map(k => /** @type {any} */ (raw)[k])
    .filter(s => s && typeof s.by === 'string' && [s.h, s.a, s.p, s.k].every(Number.isFinite))
    .map(s => ({ by: s.by, h: s.h, a: s.a, p: s.p, k: s.k }))
}

/** Number of pick-ups in golfSkip (array or object of { uid: reason }). @param {unknown} raw */
export function skipCount(raw) {
  if (!raw || typeof raw !== 'object') return 0
  return Object.values(raw).reduce((n, row) => n + (row && typeof row === 'object' ? Object.keys(row).length : 0), 0)
}
