// WIRE CROSSED module: GLYPHS. Keys with symbols; the manual has columns of
// symbols and exactly one column holds every key. Tier I is 4 keys and 5
// columns of 6. Tier II is 5 keys and 6 columns of 7. Tier III has two pages
// (A and B); the serial's last digit picks the page (odd = A, even = B), the
// other page holds a decoy column with 4 of the 5 keys, and page B includes
// mirrored glyphs (ids 24-31, the base glyphs of MIRRORABLE flipped).
//
// Pure — no DOM, no Firebase, no React.
import { int, sample, shuffle } from '../rng'
import { serialLastDigit } from '../shell'

export const GLYPH_COUNT = 24
/** Mirrored glyph ids: 24 + MIRRORABLE.indexOf(base) (MIRRORABLE is in WireGlyph.jsx). */
export const GLYPH_MIRROR_FIRST = 24
export const GLYPH_MIRROR_COUNT = 8
export const GLYPH_TOTAL = GLYPH_MIRROR_FIRST + GLYPH_MIRROR_COUNT
export const KEYPAD_COLUMNS = 5
export const KEYPAD_COLUMN_LEN = 6
export const KEYPAD_KEYS = 4

const TIERS = {
  1: { keys: 4, columns: 5, len: 6 },
  2: { keys: 5, columns: 6, len: 7 },
  3: { keys: 5, columns: 6, len: 7 },
}
const MAX_KEYS = 5

export const isMirroredGlyph = (id) => id >= GLYPH_MIRROR_FIRST
/** Tier III: which manual page (0 = A, 1 = B) the serial picks. */
export const keypadPage = (serial) => (serialLastDigit(serial) % 2 === 1 ? 0 : 1)

/** Keypad: how many glyphs are already pressed, in order. */
export const pressedCount = (wire, i) => {
  const n = Number(wire?.mods?.[i]?.pressed)
  return Number.isInteger(n) && n > 0 ? Math.min(MAX_KEYS, n) : 0
}

const range = (n) => Array.from({ length: n }, (_, i) => i)

function genTierOne(rng, tier) {
  const all = range(GLYPH_COUNT)
  for (let attempt = 0; attempt < 200; attempt++) {
    const columns = Array.from({ length: KEYPAD_COLUMNS }, () => sample(rng, all, KEYPAD_COLUMN_LEN))
    const col = int(rng, 0, KEYPAD_COLUMNS - 1)
    const positions = sample(rng, [0, 1, 2, 3, 4, 5], KEYPAD_KEYS).sort((a, b) => a - b)
    const solution = positions.map(p => columns[col][p])
    const unique = columns.every((c, i) => i === col || !solution.every(g => c.includes(g)))
    if (!unique) continue
    return {
      type: 'keypad',
      tier,
      device: { keys: shuffle(rng, solution) },
      manual: { columns },
      solution,
    }
  }
  /* c8 ignore next */
  throw new Error('keypad generation failed')
}

const holdsAll = (col, keys) => keys.every(g => col.includes(g))

/**
 * Tier II (one page) and tier III (two pages). `serial` picks the page in use
 * at tier III. Page A draws base glyphs only. Page B draws all 32; when B is
 * in use exactly one solution key is mirrored, so the decoy on page A can hold
 * the other four.
 */
function genWide(rng, tier, serial) {
  const { keys, columns: nCols, len } = TIERS[tier]
  const base = range(GLYPH_COUNT)
  const full = range(GLYPH_TOTAL)
  const two = tier >= 3
  const usePage = two ? keypadPage(serial) : 0
  for (let attempt = 0; attempt < 500; attempt++) {
    const pool = (page) => (page === 1 ? full : base)
    const pages = (two ? [0, 1] : [0]).map(p => Array.from({ length: nCols }, () => sample(rng, pool(p), len)))
    const cols = pages[usePage]
    const col = int(rng, 0, nCols - 1)
    const positions = sample(rng, range(len), keys).sort((a, b) => a - b)
    const solution = positions.map(p => cols[col][p])
    if (usePage === 1 && solution.filter(isMirroredGlyph).length !== 1) continue
    if (!cols.every((c, i) => i === col || !holdsAll(c, solution))) continue
    if (two) {
      const other = pages[1 - usePage]
      // Decoy on the other page: 4 of the 5 keys, replacing four random slots.
      const decoyKeys = sample(rng, solution.filter(g => !isMirroredGlyph(g) || usePage === 0), 4)
      if (decoyKeys.length < 4) continue
      const at = int(rng, 0, nCols - 1)
      const spots = sample(rng, range(len), 4)
      const rest = other[at].filter(g => !decoyKeys.includes(g))
      const decoy = Array(len).fill(-1)
      spots.forEach((p, k) => { decoy[p] = decoyKeys[k] })
      for (let p = 0; p < len; p++) if (decoy[p] < 0) decoy[p] = rest.shift() ?? -1
      if (decoy.includes(-1) || new Set(decoy).size !== len) continue
      // A decoy page column must not hold a mirrored key on page A.
      if (usePage === 1 && decoy.some(isMirroredGlyph)) continue
      other[at] = decoy
      if (other.some(c => holdsAll(c, solution))) continue
    }
    const manual = two ? { pages } : { columns: pages[0] }
    return { type: 'keypad', tier, device: { keys: shuffle(rng, solution) }, manual, solution, ...(two ? { page: usePage } : {}) }
  }
  /* c8 ignore next */
  throw new Error('keypad generation failed')
}

export default {
  type: 'keypad',
  name: 'GLYPHS',
  maxTier: 3,

  generate(rng, tier = 1, ctx = {}) {
    return tier >= 2 ? genWide(rng, tier, ctx.serial) : genTierOne(rng, tier)
  },

  judge(module, bomb, wire, i, action) {
    if (action.kind !== 'press') return null
    const progress = wire?.mods?.[i] || {}
    const done = pressedCount(wire, i)
    const g = action.glyph
    if (!module.solution.includes(g) || module.solution.indexOf(g) < done) return null
    const ok = module.solution[done] === g
    const pressed = ok ? done + 1 : done
    return {
      ok,
      solved: pressed === module.solution.length,
      progress: { ...progress, pressed },
      text: `PRESSED GLYPH ${module.device.keys.indexOf(g) + 1}`,
    }
  },

  solveNext(module, bomb, wire, i) {
    return { mod: i, kind: 'press', glyph: module.solution[pressedCount(wire, i)] }
  },
}
