// Array normalizers for Firebase reads. Firebase hands an array-shaped field
// back either as a real array or as a numeric-keyed object (when it is sparse,
// or when it was written key by key), so every read must map by explicit key.
// Never `Object.values(raw)`: it compacts gaps and silently shifts values to
// the wrong index (the Mancala `normalizePits` bug —
// see .claude/rules/firebase-rules.md).
//
// Pure — no DOM/Firebase/React.

const isIndexKey = (k) => /^\d+$/.test(k)

/**
 * Normalize a Firebase array read into a real array, placing every value at
 * its numeric key.
 *
 * @param {unknown} raw - array, numeric-keyed object, or null/undefined.
 * @param {number} [len] - fixed length. Missing slots get `fill`; indexes at or
 *   beyond `len` are dropped. Omit for "as long as the highest key + 1".
 * @param {*} [fill=null] - value for missing slots (null/undefined entries and gaps).
 * @returns {Array}
 */
export function normalizeArray(raw, len, fill = null) {
  const fixed = Number.isInteger(len) && len >= 0
  const entries = []
  if (Array.isArray(raw)) {
    raw.forEach((v, i) => entries.push([i, v]))
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (isIndexKey(k)) entries.push([parseInt(k, 10), v])
    }
  }
  let size = fixed ? len : 0
  if (!fixed) for (const [i, v] of entries) if (v != null && i + 1 > size) size = i + 1
  const out = Array(size).fill(fill)
  for (const [i, v] of entries) {
    if (i < size && v != null) out[i] = v
  }
  return out
}

/**
 * Normalize an append-only list (bids, log lines, dice): values in key order,
 * gaps and null entries dropped. Unlike `Object.values`, order follows the
 * numeric key even when the object's own key order doesn't.
 *
 * @param {unknown} raw
 * @returns {Array}
 */
export function normalizeList(raw) {
  return normalizeArray(raw).filter(v => v != null)
}
