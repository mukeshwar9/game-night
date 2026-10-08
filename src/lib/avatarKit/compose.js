// @ts-check
// Pure pixel compositor for the avatar kit: ASCII-grid parts -> a 24x24 buffer of
// RGB triplets. No DOM, so it runs under Vitest and in the sheet-export script.
//
// Part grids use a one-character legend (see `legend`): '#' primary auto-shade,
// '0'-'4' primary explicit shade, '@' / 'a'-'e' the secondary slot, 'k' skin auto,
// 'j' skin shade 1, 'l' skin 3, 'n' skin 0, 'h' hair auto, 'H' hair 1, 'I' hair 4,
// 'v' / 'V' iris, 'x' pupil, 'w' eye white, 'y' shine, 'z' mouth dark, 't' red,
// 'T' teeth, 'r' blush (blend), 'u' hair-tinted stubble (blend), 'L' lens (blend),
// 'D' dark lens, '*' twinkle, 'E' erase. A part's own `map` overrides any character.

import { RAMPS, colourAt, hash, mix } from './palette.js'

export const W = 24
export const H = 24

/** @typedef {import('./palette.js').RGB} RGB */

const FIX = /** @type {Record<string, RGB>} */ ({
  x: [27, 20, 38], w: [255, 255, 255], y: [255, 255, 255], z: [74, 16, 32], t: [232, 80, 106], T: [255, 248, 240], D: [21, 18, 30],
})
const INK = FIX.x

/** @param {string} ch @param {any} part */
function legend(ch, part) {
  if (part.map && part.map[ch]) return part.map[ch]
  if (ch === '#') return { slot: 'p', s: 'auto' }
  if (ch >= '0' && ch <= '4') return { slot: 'p', s: +ch }
  if (ch === '@') return { slot: 's', s: 'auto' }
  if (ch >= 'a' && ch <= 'e') return { slot: 's', s: ch.charCodeAt(0) - 97 }
  if (ch === 'k') return { slot: 'skin', s: 'auto' }
  if (ch === 'j') return { slot: 'skin', s: 1 }
  if (ch === 'l') return { slot: 'skin', s: 3 }
  if (ch === 'n') return { slot: 'skin', s: 0 }
  if (ch === 'h') return { slot: 'hair', s: 'auto' }
  if (ch === 'H') return { slot: 'hair', s: 1 }
  if (ch === 'I') return { slot: 'hair', s: 4 }
  if (ch === 'v') return { slot: 'eye', s: 2 }
  if (ch === 'V') return { slot: 'eye', s: 3 }
  if (ch === 'r') return { blend: [255, 95, 134], a: 0.42 }
  if (ch === 'u') return { blendSlot: 'hair', a: 0.55 }
  if (ch === 'L') return { blend: INK, a: 0.35 }
  if (ch === '*') return { fx: 'twinkle' }
  if (ch === 'E') return { erase: true }
  if (FIX[ch]) return { rgb: FIX[ch] }
  return null
}

/** @param {Set<number>} mask @param {number} x @param {number} y @param {string} mode */
function autoShade(mask, x, y, mode) {
  const has = (/** @type {number} */ a, /** @type {number} */ b) => mask.has(b * 64 + a)
  if (mode === 'flat') return 2
  if (!has(x, y + 1)) return 1
  if (!has(x + 1, y)) return 1
  if (mode === 'body' && !has(x, y + 2)) return 1
  if (!has(x, y - 1)) return 3
  if (!has(x - 1, y)) return 3
  return 2
}

/**
 * Draw one part into the working buffer. `slots` maps slot names to ramp ids.
 * @param {any[]} buf @param {any} part @param {Record<string, string>} slots
 * @param {number} [ox] @param {number} [oy] @param {number} [frame]
 */
export function applyPart(buf, part, slots, ox = 0, oy = 0, frame = 0) {
  if (!part) return
  const rows = part.frames ? part.frames[frame % part.frames.length] : part.rows
  if (!rows) return
  const px = (part.x || 0) + ox
  const py = (part.y || 0) + oy
  const groups = new Map()
  const cells = []
  rows.forEach((/** @type {string} */ row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx]
      if (ch === '.' || ch === ' ') continue
      const L = legend(ch, part)
      if (!L) continue
      const x = px + rx
      const y = py + ry
      const ramp = L.slot ? (slots[L.slot] || 'grey') : L.ramp
      if (L.s !== undefined && ramp) {
        const key = ramp + (L.group || '')
        if (!groups.has(key)) groups.set(key, new Set())
        groups.get(key).add(y * 64 + x)
        cells.push({ x, y, ramp, s: L.s, key })
      } else cells.push({ x, y, L })
    }
  })
  const own = new Set(cells.map((c) => c.y * 64 + c.x))
  for (const c of cells) {
    if (c.x < 0 || c.y < 0 || c.x >= W || c.y >= H) continue
    const i = c.y * W + c.x
    if (c.L) {
      if (c.L.erase) buf[i] = null
      else if (c.L.rgb) buf[i] = { rgb: c.L.rgb }
      else if (c.L.blend) buf[i] = { blend: c.L.blend, a: c.L.a, under: buf[i] }
      else if (c.L.blendSlot) {
        const rk = slots[c.L.blendSlot]
        const rgb = RAMPS[rk] ? RAMPS[rk][1] : colourAt(rk || 'grey', 1, c.x, c.y, 0)
        buf[i] = buf[i] ? { blend: rgb, a: c.L.a, under: buf[i] } : null
      } else if (c.L.fx) buf[i] = { fx: c.L.fx, under: buf[i] }
      continue
    }
    const s = c.s === 'auto' ? autoShade(groups.get(c.key), c.x, c.y, part.shade || 'rim') : c.s
    buf[i] = { ramp: c.ramp, s }
  }
  // Cast a 1px shadow onto whatever sits directly below this part (hair on a
  // forehead, a hat brim on a face) - reads as depth even at 1x.
  if (part.cast) {
    for (const c of cells) {
      const below = (c.y + 1) * 64 + c.x
      if (own.has(below) || c.y + 1 >= H || c.x < 0 || c.x >= W) continue
      const j = (c.y + 1) * W + c.x
      const p = buf[j]
      if (p && p.ramp && !p.shaded && p.s > 1) buf[j] = { ramp: p.ramp, s: p.s - 1, shaded: true }
    }
  }
}

/** Selective outline: each empty pixel touching the character takes the darkest shade of the ramp it touches. @param {any[]} buf */
export function selOut(buf) {
  const out = buf.slice()
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (buf[y * W + x]) continue
      const n = [[x, y + 1], [x, y - 1], [x - 1, y], [x + 1, y]]
      let pick = null
      for (const [a, b] of n) {
        if (a < 0 || b < 0 || a >= W || b >= H) continue
        const p = buf[b * W + a]
        if (!p) continue
        const base = p.ramp ? p : (p.under && p.under.ramp ? p.under : null)
        if (base) { pick = { ramp: base.ramp, s: 0 }; break }
        pick = pick || { rgb: INK }
      }
      if (pick) out[y * W + x] = pick
    }
  }
  return out
}

/** @param {any} p @param {number} x @param {number} y @param {number} t @returns {RGB | null} */
export function resolve(p, x, y, t) {
  if (!p) return null
  if (p.rgb) return p.rgb
  if (p.ramp) return colourAt(p.ramp, p.s, x, y, t)
  if (p.blend) {
    const u = resolve(p.under, x, y, t)
    return u ? mix(u, p.blend, p.a) : p.blend
  }
  if (p.fx === 'twinkle') {
    const ph = (Math.floor(t * 6) + hash(x, y)) % 6
    if (ph < 2) return [255, 255, 255]
    if (ph < 3) return [255, 242, 168]
    return resolve(p.under, x, y, t) || null
  }
  return null
}

// ── Backdrops and frames (shared by every look) ─────────────────────────────
// `tier` marks premium: 'free' | 'earn' (unlocked by play, never sold) | 'pass' |
// 'pack' (+ `pack` id). Nothing is gated yet - the editor shows the badge only.

export const BACKGROUNDS = {
  none: { label: 'NONE', tier: 'free' },
  solid: { label: 'SOLID', tier: 'free' },
  dots: { label: 'DOTS', tier: 'free' },
  stripes: { label: 'STRIPES', tier: 'free' },
  checker: { label: 'CHECKER', tier: 'free' },
  dusk: { label: 'DUSK', tier: 'earn', note: 'Play 25 games' },
  stars: { label: 'STARFIELD', tier: 'pass', anim: true },
  arcade: { label: 'ARCADE GRID', tier: 'pass', anim: true },
  confetti: { label: 'CONFETTI', tier: 'pack', pack: 'party', anim: true },
  aurora: { label: 'AURORA', tier: 'pass', anim: true },
  arrowfield: { label: 'ARROW FIELD', tier: 'earn', note: '25★ in Arrows', earn: { game: 'arrows', stars: 25 }, anim: true },
  portalsky: { label: 'PORTAL SKY', tier: 'earn', note: '325★ in Arrows', earn: { game: 'arrows', stars: 325 }, anim: true },
}

export const FRAMES = {
  none: { label: 'NONE', tier: 'free' },
  line: { label: 'LINE', tier: 'free' },
  double: { label: 'DOUBLE', tier: 'free' },
  trophy: { label: 'TROPHY', tier: 'earn', note: 'Win 50 matches' },
  streak: { label: 'HOT STREAK', tier: 'earn', note: '7-day streak', anim: true },
  holo: { label: 'HOLO FOIL', tier: 'pass', anim: true },
  gold: { label: '24K', tier: 'pack', pack: 'royal', anim: true },
  neon: { label: 'NEON', tier: 'pass', anim: true },
  candy: { label: 'CANDY', tier: 'pack', pack: 'party', anim: true },
  portalrim: { label: 'PORTAL RIM', tier: 'earn', note: '300★ in Arrows', earn: { game: 'arrows', stars: 300 }, anim: true },
  arrowchase: { label: 'ARROW CHASE', tier: 'earn', note: '350★ in Arrows', earn: { game: 'arrows', stars: 350 }, anim: true },
  goldarrow: { label: 'GOLD ARROWS', tier: 'earn', note: '400★ in Arrows', earn: { game: 'arrows', stars: 400 }, anim: true },
}

const DUSK = /** @type {RGB[]} */ ([[42, 24, 80], [74, 32, 112], [138, 42, 128], [208, 64, 122], [255, 122, 90], [255, 180, 90]])
const CONFETTI = /** @type {RGB[]} */ ([[255, 90, 122], [255, 210, 58], [58, 208, 255], [122, 255, 106], [192, 122, 255]])
const FIELD = /** @type {RGB[]} */ ([[22, 46, 32], [30, 60, 42], [70, 110, 80]])
// Arrow field lanes: [row, speed, length, ramp]
const FIELD_LANES = /** @type {[number, number, number, string][]} */ ([[4, 5, 4, 'lime'], [12, 3, 5, 'white'], [19, 4, 3, 'yellow']])
const PURPLE_LINE = /** @type {RGB} */ ([138, 42, 168])

/** @param {(RGB | null)[]} px @param {string} id @param {string} ramp @param {number} t */
function paintBackground(px, id, ramp, t) {
  if (!id || id === 'none') return
  const R = RAMPS[ramp] || RAMPS.sky
  if (!R) return
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = R[3]
      if (id === 'dots') c = (x % 4 === 1 && y % 4 === 1) || (x % 4 === 3 && y % 4 === 3) ? R[2] : R[3]
      else if (id === 'stripes') c = ((x + y) % 6) < 3 ? R[3] : R[2]
      else if (id === 'checker') c = ((x >> 2) + (y >> 2)) % 2 ? R[3] : R[4]
      else if (id === 'dusk') {
        const k = Math.min(5, Math.floor((y + ((x + y) % 2) * 0.9) / 4))
        c = y >= 18 ? DUSK[0] : DUSK[k]
      } else if (id === 'stars') {
        c = y < 12 ? [11, 10, 36] : [20, 16, 56]
        const h = hash(x + 3, y + 7)
        if (h % 23 === 0) c = (Math.floor(t * 4) + h) % 3 === 0 ? [255, 255, 255] : [138, 136, 200]
        if (h % 97 === 5) c = [255, 230, 138]
      } else if (id === 'arcade') {
        c = y < 12 ? mix([26, 8, 56], [90, 20, 102], y / 12) : [18, 6, 42]
        if (y === 12) c = [255, 90, 208]
        if (y > 12) {
          const d = y - 12
          const off = Math.floor(t * 6) % 3
          if ((d + off) % 3 === 0) c = PURPLE_LINE
          const cx = x - 11.5
          if (Math.abs(Math.round(cx / (0.35 + d * 0.22))) % 2 === 0 && Math.abs(cx) % (1 + d * 0.5) < 0.6) c = PURPLE_LINE
        }
        if (y === 5 && x > 6 && x < 17) c = [255, 180, 80]
        if (y === 6 && x > 5 && x < 18) c = [255, 122, 80]
        if (y === 7 && x > 5 && x < 18) c = [255, 90, 106]
        if (y === 8 && x > 6 && x < 17) c = [224, 64, 106]
      } else if (id === 'confetti') {
        c = R[4]
        const h = hash(x, (y - Math.floor(t * 8) + 240) % 24)
        if (h % 9 === 0) c = CONFETTI[h % CONFETTI.length]
      } else if (id === 'aurora') {
        c = [8, 22, 40]
        const w = Math.sin(x * 0.45 + t * 1.6) * 2.2 + 7
        const w2 = Math.sin(x * 0.3 - t * 1.1 + 2) * 2 + 11
        if (Math.abs(y - w) < 1.6) c = (x + y) % 2 ? [58, 255, 176] : [42, 208, 160]
        else if (Math.abs(y - w) < 2.8) c = [20, 106, 106]
        if (Math.abs(y - w2) < 1.2) c = (x + y) % 2 ? [160, 122, 255] : [122, 90, 224]
        if (y < 5 && hash(x, y) % 19 === 0) c = [207, 232, 255]
      } else if (id === 'arrowfield') {
        c = FIELD[0]
        if (x % 3 === 1 && y % 3 === 1) c = FIELD[2]
        // three little arrows sliding right on their own lanes
        for (const [lane, speed, len, lr] of FIELD_LANES) {
          const head = Math.floor((t * speed * 2 + lane * 3) % (W + len + 2)) - 1
          if (y === lane && x <= head && x > head - len) c = RAMPS[lr][3]
          if (x === head + 1 && y === lane) c = RAMPS[lr][4]
          if (x === head && (y === lane - 1 || y === lane + 1)) c = RAMPS[lr][3]
        }
      } else if (id === 'portalsky') {
        // two pulsing portal rings, blue left and orange right
        c = y < 12 ? [16, 22, 52] : [24, 18, 44]
        const ov = (/** @type {number} */ cx, /** @type {number} */ cy) => ((x - cx) / 2.6) ** 2 + ((y - cy) / 4.4) ** 2
        const a = ov(4.5, 10)
        const b = ov(19.5, 10)
        const pulse = Math.floor(t * 6) % 4
        if (a < 1.05 && a > 0.45) c = colourAt('sky', a > 0.8 ? 3 : 4, x, y, t)
        else if (a <= 0.45) c = pulse === (y % 4) ? [120, 200, 255] : [31, 95, 158]
        if (b < 1.05 && b > 0.45) c = colourAt('orange', b > 0.8 ? 2 : 3, x, y, t)
        else if (b <= 0.45) c = pulse === (y % 4) ? [255, 169, 74] : [154, 63, 21]
      }
      px[y * W + x] = c
    }
  }
}

/** Clockwise index of a border pixel of the ring `d` pixels in, for chasing lights. @param {number} x @param {number} y @param {number} d */
function perim(x, y, d) {
  const w = W - 1 - 2 * d
  const xx = x - d
  const yy = y - d
  if (yy === 0) return xx
  if (xx === w) return w + yy
  if (yy === w) return 3 * w - xx
  return 4 * w - yy
}

/** @param {(RGB | null)[]} px @param {string} id @param {number} t */
function paintFrame(px, id, t) {
  if (!id || id === 'none') return
  const G = RAMPS.grey || []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y)
      /** @type {RGB | null | undefined} */
      let c = null
      if (id === 'line' && d === 0) c = G[1]
      if (id === 'double' && (d === 0 || d === 2)) c = d === 0 ? G[1] : G[3]
      if (id === 'trophy') {
        if (d === 0) c = [138, 90, 16]
        if (d === 1) c = (x + y) % 2 ? [255, 216, 74] : [212, 160, 32]
      }
      if (id === 'streak') {
        if (d === 0) c = [138, 26, 12]
        if (d === 1) c = colourAt('lava', 2 + ((x + y) % 2), x, y, t)
        if (d === 2 && y > 16 && hash(x, Math.floor(t * 8)) % 3 === 0) c = colourAt('lava', 3, x, y, t)
      }
      if (id === 'holo') {
        if (d === 0) c = colourAt('holo', 1, x, y, t)
        if (d === 1) c = colourAt('holo', 3, x, y, t)
      }
      if (id === 'gold') {
        if (d === 0) c = [90, 58, 8]
        if (d === 1) c = colourAt('goldfx', 3, x, y, t)
        if (d === 2 && (x === y || x === W - 1 - y)) c = [255, 246, 192]
      }
      if (id === 'neon') {
        if (d === 0) c = colourAt('neon', 2, x, y, t)
        if (d === 1) c = colourAt('neon', 1, x, y, t)
      }
      if (id === 'candy') {
        if (d === 0) c = [140, 33, 103]
        if (d === 1) c = ((x + y + Math.floor(t * 6)) % 4) < 2 ? [255, 255, 255] : [255, 90, 154]
      }
      if (id === 'arrowchase') {
        if (d === 0) c = RAMPS.green[0]
        if (d === 1) {
          const k = (perim(x, y, 1) - Math.floor(t * 10) + 400) % 5
          c = k === 0 ? RAMPS.white[4] : k < 3 ? RAMPS.lime[3] : RAMPS.green[1]
        }
      }
      if (id === 'portalrim') {
        const blue = x + y < W
        if (d === 0) c = blue ? RAMPS.sky[1] : RAMPS.orange[1]
        if (d === 1) c = colourAt(blue ? 'sky' : 'orange', (perim(x, y, 1) + Math.floor(t * 8)) % 3 === 0 ? 4 : 3, x, y, t)
      }
      if (id === 'goldarrow') {
        if (d === 0) c = [90, 58, 8]
        if (d === 1) {
          const k = (perim(x, y, 1) - Math.floor(t * 8) + 400) % 4
          c = k === 0 ? [255, 246, 192] : colourAt('goldfx', 3, x, y, t)
        }
        if (d === 2 && (x === 2 || y === 2 || x === W - 3 || y === H - 3) && (perim(x, y, 2) + Math.floor(t * 8)) % 6 === 0) c = RAMPS.lime[3]
      }
      if (c) px[y * W + x] = c
    }
  }
}

/** Pixel-rounded tile corners (2px radius), so the tile needs no CSS clipping. @param {(RGB | null)[]} px */
function roundCorners(px) {
  for (const [a, b] of [[0, 0], [1, 0], [0, 1]]) {
    px[b * W + a] = null
    px[b * W + (W - 1 - a)] = null
    px[(H - 1 - b) * W + a] = null
    px[(H - 1 - b) * W + (W - 1 - a)] = null
  }
}

/**
 * Backdrop + frame + (already composed, outlined) character layer -> RGB pixels.
 * @param {any[]} layer output of selOut @param {{ bg?: string, bgColor?: string, frame?: string }} cfg
 * @param {number} t @param {boolean} tile
 * @returns {(RGB | null)[]}
 */
export function paintTile(layer, cfg, t, tile) {
  /** @type {(RGB | null)[]} */
  const px = new Array(W * H).fill(null)
  if (tile) {
    paintBackground(px, cfg.bg || 'solid', cfg.bgColor || 'sky', t)
    paintFrame(px, cfg.frame || 'none', t)
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = resolve(layer[y * W + x], x, y, t)
      if (c) px[y * W + x] = c
    }
  }
  if (tile) roundCorners(px)
  return px
}
