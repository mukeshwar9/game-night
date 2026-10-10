// ANIMAL STACK art helpers — pure, no DOM. The animals' silhouettes and colour
// roles are the grids in lib/animalStackPixels.js; this turns a theme's --c-*
// tokens into the shades those grids are painted with, and paints them.

// ─── Palette ─────────────────────────────────────────────────────────────────

/** Parse a --c-* token value ("r g b") into [r, g, b]. */
export function parseRgb(v) {
  const n = String(v || '').trim().split(/[\s,]+/).map(Number)
  return n.length >= 3 && n.slice(0, 3).every(Number.isFinite) ? n.slice(0, 3) : [128, 128, 128]
}
export const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
export const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * Shades of one animal's tone, all derived from the theme: `L`/`D` are the
 * theme's lighter/darker ends (bg and text), so every theme keeps its own
 * palette. A tone that nearly matches the backdrop is lifted toward the text
 * colour so the animal never vanishes, and `pale` flips toward D when the
 * tone already sits at the light end (the penguin on a dark theme, whose tone
 * is the light text colour) so bellies still read. `hi`/`lo` are the light
 * and shadow the painter blends toward.
 */
export function rolePalette(rawTone, { bg, text, beak, blush }) {
  const [L, D] = lum(bg) >= lum(text) ? [bg, text] : [text, bg]
  const tone = Math.abs(lum(rawTone) - lum(bg)) < 0.1 ? mix(rawTone, text, 0.35) : rawTone
  const atLight = dist(tone, L) < 70
  return {
    base: tone,
    light: atLight ? mix(tone, D, 0.14) : mix(tone, L, 0.35),
    pale: atLight ? mix(tone, D, 0.5) : mix(tone, L, 0.7),
    shade: mix(tone, D, 0.28),
    spot: mix(tone, D, 0.45),
    dark: mix(tone, D, 0.62),
    beak,
    blush: mix(blush, tone, 0.3),
    eye: mix(L, tone, 0.08),
    pupil: mix(D, tone, 0.1),
    hi: mix(L, tone, 0.1),
    lo: mix(D, tone, 0.15),
  }
}

// ─── Painted sprites ─────────────────────────────────────────────────────────
// The grid stays the source of truth for both the hull and the colour roles,
// but each animal is painted at full resolution rather than as flat squares:
// colours blend between cells, a soft height field gives it volume under a
// light from the upper left, each kind of animal gets a surface texture, eyes
// get a sclera, iris and catchlight, and a blurred copy of the silhouette
// becomes its contact shadow. The cell staircase is smoothed into a contour,
// clipped to the physics boxes, so the art never leaves the hull. Pure maths on arrays; the caller
// turns the result into canvases once per (theme, scale).

/** Surface texture per animal. */
export const SKINS = {
  elephant: 'hide', rhino: 'hide', hippo: 'hide', pig: 'smooth',
  giraffe: 'fur', chick: 'down', owl: 'feather', penguin: 'feather',
  croc: 'scale', snake: 'scale', turtle: 'scale', frog: 'wet',
}
// spec: highlight strength, shine: highlight tightness
const SURFACE = {
  hide: { spec: 0.06, shine: 10 },
  smooth: { spec: 0.14, shine: 18 },
  fur: { spec: 0.04, shine: 8 },
  down: { spec: 0.03, shine: 8 },
  feather: { spec: 0.1, shine: 16 },
  scale: { spec: 0.16, shine: 22 },
  wet: { spec: 0.38, shine: 34 },
}
const CELL_ROLE = { B: 'base', L: 'light', S: 'shade', P: 'pale', D: 'dark', W: 'base', K: 'base', O: 'beak', R: 'blush' }
const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
const LIGHT = (() => { const v = [-0.5, -0.8, 0.9], m = Math.hypot(...v); return v.map(c => c / m) })()
const HALF = (() => { const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1], m = Math.hypot(...v); return v.map(c => c / m) })()

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const ease = (t) => 0.5 * t + 0.5 * smooth(0, 1, t)
const fract = (v) => v - Math.floor(v)
const hash = (x, y, s) => fract(Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453)
function vnoise(u, v, s = 0) {
  const x = Math.floor(u), y = Math.floor(v)
  const fx = smooth(0, 1, u - x), fy = smooth(0, 1, v - y)
  const a = hash(x, y, s), b = hash(x + 1, y, s), c = hash(x, y + 1, s), d = hash(x + 1, y + 1, s)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
/** Distance gap between the two nearest jittered points: ~0 on a scale's border. */
function worley(u, v) {
  const x = Math.floor(u), y = Math.floor(v)
  let f1 = 9, f2 = 9
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const px = x + i + 0.15 + 0.7 * hash(x + i, y + j, 9), py = y + j + 0.15 + 0.7 * hash(x + i, y + j, 13)
    const d = Math.hypot(u - px, v - py)
    if (d < f1) { f2 = f1; f1 = d } else if (d < f2) f2 = d
  }
  return [f1, f2]
}

/** Surface relief in [-1, 1]-ish at cell coords (u, v): + lightens, - darkens. */
export function texture(skin, u, v) {
  switch (skin) {
    case 'hide': {
      const w = Math.sin(v * 5.5 + vnoise(u * 0.7, v * 0.7, 2) * 6)
      return (vnoise(u * 0.8, v * 0.8, 1) - 0.5) * 0.14 - smooth(0.85, 1, w) * 0.08
    }
    case 'smooth': return (vnoise(u * 1.2, v * 1.2, 3) - 0.5) * 0.07
    case 'fur': return (vnoise(u * 4.5, v * 1.2, 4) - 0.5) * 0.2
    case 'down': return (vnoise(u * 3, v * 3, 5) - 0.5) * 0.18
    case 'feather': {
      const row = Math.floor(v / 0.75)
      const fx = fract(u / 0.9 + (row % 2) * 0.5) - 0.5, fy = fract(v / 0.75)
      return -smooth(0.36, 0.5, Math.hypot(fx, fy * 0.8)) * 0.13 + (vnoise(u * 2, v * 2, 6) - 0.5) * 0.05
    }
    case 'scale': {
      const [f1, f2] = worley(u / 0.75, v / 0.75)
      return -(1 - smooth(0, 0.14, f2 - f1)) * 0.18 + (0.45 - f1) * 0.08
    }
    case 'wet':
      return (vnoise(u * 1.5, v * 1.5, 7) - 0.5) * 0.1 - smooth(0.68, 0.78, vnoise(u * 1.1, v * 1.1, 8)) * 0.14
    default: return 0
  }
}

/** Box-blur each row of a w×h field by `r` px, writing the result transposed (h×w). */
function blurRowsT(a, out, w, h, r) {
  const k = 1 / (2 * r + 1)
  for (let y = 0; y < h; y++) {
    const o = y * w
    let s = 0
    for (let x = 0; x <= r && x < w; x++) s += a[o + x]
    for (let x = 0; x < w; x++) {
      out[x * h + y] = s * k
      if (x - r >= 0) s -= a[o + x - r]
      if (x + r + 1 < w) s += a[o + x + r + 1]
    }
  }
}

/** Separable box blur of a w×h field, `r` px, repeated `passes` times (zero outside). */
export function blur(src, w, h, r, passes = 1) {
  const a = Float32Array.from(src)
  if (r < 1) return a
  const t = new Float32Array(a.length)
  for (let p = 0; p < passes; p++) {
    blurRowsT(a, t, w, h, r) // rows, transposed
    blurRowsT(t, a, h, w, r) // columns, transposed back
  }
  return a
}

/** Colour of the filled cell nearest to cell coords (u, v), within two cells. */
function nearestCol(cellCol, u, v) {
  let best = null, bd = 9
  for (let y = Math.floor(v) - 2; y <= Math.floor(v) + 2; y++) for (let x = Math.floor(u) - 2; x <= Math.floor(u) + 2; x++) {
    const c = cellCol[y]?.[x]
    if (!c) continue
    const d = Math.hypot(x + 0.5 - u, y + 0.5 - v)
    if (d < bd) { bd = d; best = c }
  }
  return best
}

/** Connected groups of eye cells (W/K) with their pixel ellipse and pupil. */
function eyesOf(grid, n) {
  const seen = new Set(), eyes = []
  const isEye = (x, y) => grid[y]?.[x] === 'W' || grid[y]?.[x] === 'K'
  grid.forEach((row, y) => row.forEach((_, x) => {
    if (!isEye(x, y) || seen.has(`${x},${y}`)) return
    const cells = [], stack = [[x, y]]
    seen.add(`${x},${y}`)
    while (stack.length) {
      const [cx, cy] = stack.pop()
      cells.push([cx, cy])
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${cx + dx},${cy + dy}`
        if (isEye(cx + dx, cy + dy) && !seen.has(k)) { seen.add(k); stack.push([cx + dx, cy + dy]) }
      }
    }
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1])
    const ks = cells.filter(([cx, cy]) => grid[cy][cx] === 'K')
    const x0 = Math.min(...xs) * n, x1 = (Math.max(...xs) + 1) * n, y0 = Math.min(...ys) * n, y1 = (Math.max(...ys) + 1) * n
    const rx = (x1 - x0) / 2, ry = Math.max((y1 - y0) / 2, n * 0.62)
    const kx = ks.length ? (ks.reduce((s, c) => s + c[0], 0) / ks.length + 0.5) * n : (x0 + x1) / 2
    const ky = ks.length ? (ks.reduce((s, c) => s + c[1], 0) / ks.length + 0.5) * n : (y0 + y1) / 2
    const pr = Math.max(0.9, Math.min(Math.sqrt(Math.max(1, ks.length)) * n * 0.46, Math.min(rx, ry) * 0.98))
    eyes.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx, ry, kx, ky, pr })
  }))
  return eyes
}

/**
 * Paint a padded grid (lib/animalStackPixels `grid`, outline ring included) at
 * `n` px per cell with palette `pal` (rolePalette) and surface `skin`. `parts`
 * are its physics boxes (metres, grid centre origin, y up) at `cell` metres
 * per cell; without them the contour is clipped to the drawn cells.
 * Returns { w, h, rgba, shadow: { w, h, pad, alpha } }; the shadow is the
 * silhouette blurred into a margin of `pad` px on every side.
 */
export function paintAnimal(grid, pal, n, skin = 'hide', { parts = null, cell = 1 } = {}) {
  const gh = grid.length, gw = grid[0].length, W = gw * n, H = gh * n
  const isFilled = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && grid[y][x] !== '.'
  // cell colours; the outline ring takes on its neighbours' colour, a shade darker
  const cellCol = grid.map((row, y) => row.map((ch, x) => {
    if (ch === '.') return null
    if (ch !== '#') return pal[CELL_ROLE[ch]] || pal.base
    let s = [0, 0, 0], c = 0
    for (const [dx, dy] of N8) {
      const o = grid[y + dy]?.[x + dx]
      if (!o || o === '.' || o === '#') continue
      const v = pal[CELL_ROLE[o]] || pal.base
      s = s.map((t, i) => t + v[i]); c++
    }
    return c ? mix(s.map(t => t / c), pal.shade, 0.25) : pal.shade
  }))
  const M = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) M[y * W + x] = isFilled(Math.floor(x / n), Math.floor(y / n)) ? 1 : 0
  // clip region: the physics boxes, so smoothing may fill a concave step the
  // hull already covers but never paints outside it
  const C = parts ? new Uint8Array(W * H) : M
  if (parts) {
    for (const b of parts) {
      const x0 = Math.round((b[0][0] / cell + gw / 2) * n), x1 = Math.round((b[1][0] / cell + gw / 2) * n)
      const y0 = Math.round((gh / 2 - b[2][1] / cell) * n), y1 = Math.round((gh / 2 - b[0][1] / cell) * n)
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) C[y * W + x] = 1
    }
  }
  const round = blur(M, W, H, Math.max(1, Math.round(n * 0.75)), 2)
  const A = new Float32Array(W * H) // coverage of the smoothed contour
  for (let i = 0; i < A.length; i++) A[i] = C[i] ? smooth(0.4, 0.6, round[i]) : 0
  const rim = blur(A, W, H, Math.max(1, Math.round(n * 0.3)), 1)
  const height = blur(A, W, H, Math.max(1, Math.round(n * 1.3)), 3)
  const eyes = eyesOf(grid, n)
  const surf = SURFACE[skin] || SURFACE.hide
  const texK = clamp01((n - 2) / 5)
  const iris = mix(pal.pupil, pal.base, 0.4)
  const rgba = new Uint8ClampedArray(W * H * 4)

  // flat per-cell colour table (null cells: NaN) so the pixel loop allocates nothing
  const CC = new Float32Array(gw * gh * 3).fill(NaN)
  cellCol.forEach((row, y) => row.forEach((c, x) => { if (c) CC.set(c, (y * gw + x) * 3) }))
  const [hiR, hiG, hiB] = pal.hi, [loR, loG, loB] = pal.lo
  const shineK = surf.shine, specK = surf.spec
  const eyeBoxes = eyes.map(e => ({ ...e, x0: e.cx - e.rx * 1.08, x1: e.cx + e.rx * 1.08, y0: e.cy - e.ry * 1.08, y1: e.cy + e.ry * 1.08 }))
  const wts = [0, 0, 0, 0]

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    const a = A[i]
    if (a <= 0) continue
    // colour: cell colours blended between filled neighbours; eased weights
    // keep role boundaries soft but not smeared
    const gx = (x + 0.5) / n - 0.5, gy = (y + 0.5) / n - 0.5
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = ease(gx - ix), fy = ease(gy - iy)
    wts[0] = (1 - fx) * (1 - fy); wts[1] = fx * (1 - fy); wts[2] = (1 - fx) * fy; wts[3] = fx * fy
    let r = 0, g = 0, b = 0, wsum = 0
    for (let q = 0; q < 4; q++) {
      const cx = ix + (q & 1), cy = iy + (q >> 1), wt = wts[q]
      if (wt <= 0 || cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue
      const o = (cy * gw + cx) * 3
      if (CC[o] !== CC[o]) continue // NaN: empty cell
      r += CC[o] * wt; g += CC[o + 1] * wt; b += CC[o + 2] * wt; wsum += wt
    }
    if (wsum) { r /= wsum; g /= wsum; b /= wsum } else {
      const c = nearestCol(cellCol, x / n, y / n) || pal.shade
      r = c[0]; g = c[1]; b = c[2]
    }
    // light: normal from the height field's slope (per cell), Lambert + Blinn
    const hx = ((height[y * W + Math.min(W - 1, x + 1)] - height[y * W + Math.max(0, x - 1)]) / 2) * n
    const hy = ((height[Math.min(H - 1, y + 1) * W + x] - height[Math.max(0, y - 1) * W + x]) / 2) * n
    const nx = -hx * 1.6, ny = -hy * 1.6, nm = Math.sqrt(nx * nx + ny * ny + 1)
    const diffuse = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / nm)
    let f = (diffuse - LIGHT[2]) * 1.3 + (0.5 - y / H) * 0.14
    f -= (1 - smooth(0.25, 0.6, height[i])) * 0.18 // occlusion toward the edges
    if (texK) f += texture(skin, x / n, y / n) * texK
    let t = f >= 0 ? Math.min(0.45, f) : Math.min(0.55, -f)
    if (f >= 0) { r += (hiR - r) * t; g += (hiG - g) * t; b += (hiB - b) * t } else { r += (loR - r) * t; g += (loG - g) * t; b += (loB - b) * t }
    const sd = Math.max(0, (nx * HALF[0] + ny * HALF[1] + HALF[2]) / nm)
    if (sd > 0.8) {
      t = Math.min(0.6, Math.pow(sd, shineK) * specK)
      r += (hiR - r) * t; g += (hiG - g) * t; b += (hiB - b) * t
    }
    t = (1 - smooth(0.45, 0.9, rim[i])) * 0.5 // soft edge line
    r += (loR - r) * t; g += (loG - g) * t; b += (loB - b) * t
    // eyes: sclera with a lid shadow, iris, pupil and catchlight
    for (const e of eyeBoxes) {
      if (x + 0.5 < e.x0 || x + 0.5 > e.x1 || y + 0.5 < e.y0 || y + 0.5 > e.y1) continue
      const ex = (x + 0.5 - e.cx) / e.rx, ey = (y + 0.5 - e.cy) / e.ry
      const ed = ex * ex + ey * ey
      if (ed >= 1.15) continue
      const edgePx = (1 - Math.sqrt(ed)) * Math.min(e.rx, e.ry)
      let ec = mix(pal.eye, pal.shade, 0.45 * (1 - clamp01((y + 0.5 - (e.cy - e.ry)) / (2 * e.ry))) ** 2)
      const dp = Math.hypot(x + 0.5 - e.kx, y + 0.5 - e.ky)
      ec = mix(ec, iris, clamp01(e.pr - dp + 0.5))
      ec = mix(ec, pal.pupil, clamp01(e.pr * 0.6 - dp + 0.5))
      const cl = Math.hypot(x + 0.5 - (e.kx - e.pr * 0.35), y + 0.5 - (e.ky - e.pr * 0.38))
      ec = mix(ec, pal.hi, clamp01(Math.max(0.7, e.pr * 0.3) - cl + 0.5) * 0.95)
      ec = mix(ec, pal.lo, (1 - clamp01(edgePx / Math.max(1, n * 0.18))) * 0.6)
      t = clamp01(edgePx + 0.5)
      r += (ec[0] - r) * t; g += (ec[1] - g) * t; b += (ec[2] - b) * t
    }
    const o = i * 4
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b
    rgba[o + 3] = Math.round(255 * a)
  }

  const pad = Math.ceil(n * 1.2), SW = W + 2 * pad, SH = H + 2 * pad
  const S = new Float32Array(SW * SH)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) S[(y + pad) * SW + x + pad] = A[y * W + x]
  const sb = blur(S, SW, SH, Math.max(1, Math.round(n * 0.55)), 3)
  const alpha = new Uint8ClampedArray(SW * SH)
  for (let j = 0; j < sb.length; j++) alpha[j] = Math.round(255 * sb[j])
  return { w: W, h: H, rgba, shadow: { w: SW, h: SH, pad, alpha } }
}
