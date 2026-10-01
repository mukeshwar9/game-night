// @ts-check
// Fixed, theme-independent avatar palette. Avatars are cosmetics a player may pay
// for, so unlike every other colour in the app they must look the same in every
// theme (a gold crown stays gold in 1-BIT MONO). Colours are therefore stored as
// RGB triplets here rather than as --c-* tokens, and never read from the theme.
//
// Each ramp has five steps: 0 outline/deep shadow, 1 shadow, 2 base, 3 light,
// 4 highlight. Shadows lean cool, highlights lean warm. Ramp ids are wire format
// (via the ordered lists in catalog.js) - append, never reorder.

/** @typedef {[number, number, number]} RGB */

/** @type {Record<string, RGB[] | null>} */
export const RAMPS = {

    red:    [[58, 13, 30], [138, 28, 46], [211, 60, 60], [244, 122, 90], [255, 195, 161]],
    orange: [[64, 21, 15], [154, 63, 21], [232, 116, 31], [255, 169, 74], [255, 224, 160]],
    yellow: [[63, 42, 12], [163, 106, 18], [240, 180, 41], [255, 217, 94], [255, 244, 184]],
    lime:   [[28, 48, 15], [74, 122, 20], [141, 194, 42], [194, 232, 97], [240, 255, 184]],
    green:  [[14, 42, 31], [29, 107, 63], [53, 163, 90], [111, 208, 122], [198, 245, 181]],
    teal:   [[10, 42, 46], [20, 107, 107], [34, 168, 160], [94, 216, 200], [194, 255, 240]],
    sky:    [[13, 36, 64], [31, 95, 158], [58, 154, 224], [120, 200, 255], [210, 240, 255]],
    blue:   [[16, 20, 63], [38, 52, 143], [63, 91, 216], [122, 149, 255], [200, 214, 255]],
    purple: [[31, 15, 58], [77, 37, 144], [124, 69, 208], [176, 124, 255], [230, 210, 255]],
    pink:   [[58, 15, 46], [140, 33, 103], [216, 71, 154], [255, 133, 192], [255, 208, 232]],
    brown:  [[36, 18, 12], [92, 51, 32], [143, 90, 54], [192, 138, 90], [236, 199, 154]],
    white:  [[42, 40, 56], [138, 138, 160], [201, 202, 214], [238, 240, 246], [255, 255, 255]],
    grey:   [[20, 20, 32], [58, 59, 78], [98, 100, 122], [145, 148, 170], [200, 202, 216]],
    black:  [[10, 10, 18], [21, 21, 31], [38, 38, 58], [61, 61, 86], [106, 106, 136]],
    // skin — ten tones, porcelain to ebony
    s1:  [[74, 42, 42], [217, 165, 143], [246, 211, 192], [255, 232, 220], [255, 246, 240]],
    s2:  [[74, 42, 34], [207, 150, 122], [239, 194, 163], [251, 220, 196], [255, 240, 226]],
    s3:  [[70, 38, 25], [196, 132, 102], [229, 173, 137], [245, 201, 168], [255, 228, 204]],
    s4:  [[64, 36, 26], [179, 118, 79], [217, 156, 111], [236, 185, 140], [251, 214, 176]],
    s5:  [[58, 32, 22], [158, 99, 64], [198, 135, 90], [220, 164, 118], [240, 196, 154]],
    s6:  [[51, 32, 15], [138, 94, 51], [178, 130, 79], [201, 160, 107], [226, 192, 142]],
    s7:  [[46, 24, 14], [122, 69, 38], [166, 101, 58], [194, 132, 83], [220, 166, 118]],
    s8:  [[38, 19, 11], [94, 51, 25], [138, 81, 48], [168, 109, 71], [201, 143, 104]],
    s9:  [[28, 13, 8], [71, 36, 18], [107, 58, 32], [138, 82, 52], [170, 112, 80]],
    s10: [[20, 9, 6], [48, 22, 9], [74, 38, 20], [100, 56, 34], [132, 80, 52]],
    // natural hair
    hblack:  [[8, 7, 12], [22, 19, 28], [42, 36, 51], [68, 58, 79], [106, 93, 120]],
    hdark:   [[20, 11, 8], [46, 26, 16], [74, 44, 26], [107, 67, 40], [148, 100, 62]],
    hbrown:  [[30, 15, 8], [74, 40, 20], [116, 66, 34], [156, 99, 52], [198, 138, 82]],
    hauburn: [[36, 10, 8], [92, 28, 18], [142, 50, 32], [184, 80, 46], [224, 122, 72]],
    hginger: [[46, 18, 6], [122, 54, 16], [192, 90, 28], [232, 132, 58], [255, 184, 112]],
    hblonde: [[58, 42, 14], [154, 122, 46], [214, 178, 90], [240, 216, 138], [255, 242, 196]],
    hplat:   [[58, 56, 68], [156, 152, 168], [214, 212, 220], [238, 236, 242], [255, 255, 255]],
    hgrey:   [[30, 30, 36], [85, 85, 95], [138, 138, 148], [180, 180, 188], [220, 220, 226]],
    // metals & materials (fixed)
    gold:    [[58, 36, 6], [138, 90, 16], [212, 160, 32], [255, 216, 74], [255, 246, 192]],
    silver:  [[30, 34, 48], [90, 98, 120], [154, 162, 184], [208, 214, 230], [255, 255, 255]],
    // premium, animated (resolved per frame in rampAt)
    holo:    null, galaxy: null, lava: null, neon: null, ice: null, goldfx: null,
}

export const CLOTH = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'sky', 'blue', 'purple', 'pink', 'brown', 'white', 'grey', 'black']
export const SKIN = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']
export const NATURAL_HAIR = ['hblack', 'hdark', 'hbrown', 'hauburn', 'hginger', 'hblonde', 'hplat', 'hgrey']
export const FANTASY_HAIR = ['pink', 'sky', 'teal', 'purple', 'lime', 'red']
export const EYE_RAMPS = ['hdark', 'brown', 'hbrown', 'sky', 'green', 'teal', 'grey', 'purple', 'red', 'gold']
// Animated premium ramps - resolved per frame in colourAt (palette cycling).
export const PREMIUM_RAMPS = ['holo', 'galaxy', 'goldfx', 'lava', 'neon', 'ice']

export const RAMP_LABEL = {
  red: 'CHERRY', orange: 'TANGERINE', yellow: 'BANANA', lime: 'LIME', green: 'CLOVER', teal: 'LAGOON',
  sky: 'SKY', blue: 'COBALT', purple: 'GRAPE', pink: 'BUBBLEGUM', brown: 'COCOA', white: 'CLOUD',
  grey: 'PEBBLE', black: 'INK',
  s1: 'PORCELAIN', s2: 'FAIR', s3: 'LIGHT', s4: 'BEIGE', s5: 'TAN', s6: 'OLIVE', s7: 'BRONZE', s8: 'BROWN', s9: 'DEEP', s10: 'EBONY',
  hblack: 'BLACK', hdark: 'ESPRESSO', hbrown: 'CHESTNUT', hauburn: 'AUBURN', hginger: 'GINGER', hblonde: 'BLONDE', hplat: 'PLATINUM', hgrey: 'SILVER',
  gold: 'GOLD', silver: 'SILVER',
  holo: 'HOLO FOIL', galaxy: 'GALAXY', goldfx: '24K GOLD', lava: 'LAVA', neon: 'NEON', ice: 'DIAMOND',
}

const WHITE = /** @type {RGB} */ ([255, 255, 255])
const hash = (/** @type {number} */ x, /** @type {number} */ y) => {
  let n = x * 374761393 + y * 668265263
  n = (n ^ (n >>> 13)) * 1274126177
  return (n ^ (n >>> 16)) >>> 0
}

/** @param {number} h @param {number} s @param {number} l @returns {RGB} */
function hslToRgb(h, s, l) {
  const hh = (((h % 360) + 360) % 360) / 360
  const ss = s / 100
  const ll = l / 100
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  const f = (/** @type {number} */ t) => {
    const k = (t + 1) % 1
    return k < 1 / 6 ? p + (q - p) * 6 * k : k < 0.5 ? q : k < 2 / 3 ? p + (q - p) * (2 / 3 - k) * 6 : p
  }
  return [Math.round(f(hh + 1 / 3) * 255), Math.round(f(hh) * 255), Math.round(f(hh - 1 / 3) * 255)]
}

/** @param {RGB} a @param {RGB} b @param {number} k @returns {RGB} */
export function mix(a, b, k) {
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)]
}

const GALAXY = /** @type {RGB[]} */ ([[10, 6, 32], [30, 18, 80], [58, 34, 144], [106, 72, 208], [192, 176, 255]])
const GOLDFX = /** @type {RGB[]} */ ([[58, 36, 6], [138, 90, 16], [212, 160, 32], [255, 216, 74], [255, 246, 192]])
const ICE = /** @type {RGB[]} */ ([[12, 42, 64], [42, 106, 154], [106, 184, 232], [184, 236, 255], [255, 255, 255]])
const LAVA = /** @type {RGB[]} */ ([[42, 6, 6], [138, 26, 12], [224, 70, 26], [255, 154, 42], [255, 240, 122]])
const NEON_ON = /** @type {RGB[]} */ ([[42, 6, 54], [176, 32, 154], [255, 62, 200], [255, 154, 232], [255, 255, 255]])
const NEON_OFF = /** @type {RGB[]} */ ([[30, 4, 40], [122, 22, 114], [200, 46, 160], [255, 106, 212], [255, 208, 244]])

/**
 * Resolve a ramp shade at pixel (x, y) and time t (seconds). Static ramps ignore
 * x/y/t; the premium ramps palette-cycle, so an item animates without sprite frames.
 * @param {string} ramp @param {number} s @param {number} x @param {number} y @param {number} t
 * @returns {RGB}
 */
export function colourAt(ramp, s, x, y, t) {
  const r = RAMPS[ramp]
  if (r) return r[s]
  const L = [16, 34, 54, 72, 90]
  if (ramp === 'holo') return hslToRgb(t * 90 + (x + y) * 14 + s * 8, 90, L[s] + (s === 0 ? 0 : 4))
  if (ramp === 'galaxy') {
    const hh = hash(x, y)
    if (s >= 1 && hh % 11 === 0 && (Math.floor(t * 5) + hh) % 4 === 0) return WHITE
    if (s >= 1 && hh % 17 === 3) return [232, 216, 255]
    return GALAXY[s]
  }
  if (ramp === 'goldfx' || ramp === 'ice') {
    const base = ramp === 'goldfx' ? GOLDFX : ICE
    const band = (((x + y - Math.floor(t * 16)) % 22) + 22) % 22
    if (s >= 1 && band === 0) return WHITE
    if (s >= 1 && band === 1) return base[4]
    return base[s]
  }
  if (ramp === 'lava') {
    const w = Math.sin(y * 0.9 - t * 7 + x * 0.3)
    const k = Math.max(0, Math.min(4, s + (w > 0.55 ? 1 : w < -0.55 ? -1 : 0)))
    return s === 0 ? LAVA[0] : LAVA[k]
  }
  if (ramp === 'neon') return (Math.sin(t * 5) > -0.2 ? NEON_ON : NEON_OFF)[s]
  return [255, 0, 255]
}

export { hash }
