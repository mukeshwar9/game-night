// ANIMAL STACK sprite art — data and pure pixel helpers, no DOM.
//
// Every animal's silhouette IS its physics hull (PIECES[k].parts): the
// renderer fills the hull, then paints the details below clipped to it, so
// nothing drawn here can stick out past what the physics collides with.
// Coordinates are metres in the piece's local frame (y up, facing +x).
//
// Detail shapes: { r: role, p: [[x,y],…] } polygon, { r, e: [cx, cy, rx, ry] }
// ellipse, or { r, l: [[x,y],…], w } polyline of width w. Roles resolve to
// shades of the piece's theme tone (see rolePalette); 'beak' and 'blush' are
// the kam7/kam4 accent tokens.

/** Rotated box (half-width, half-height, centre, angle) as a polygon. */
function rbox(hw, hh, cx, cy, a = 0) {
  const c = Math.cos(a), s = Math.sin(a)
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c])
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const mirror = (pts) => pts.map(([x, y]) => [-x, y])

// Snake's front segment is box(0.52, 0.12) at (0.5, 0.13) turned 0.26 rad.
const SNAKE_A = 0.26
const snakeFront = (u, v, hw, hh) => rbox(hw, hh, 0.5 + u * Math.cos(SNAKE_A) - v * Math.sin(SNAKE_A), 0.13 + u * Math.sin(SNAKE_A) + v * Math.cos(SNAKE_A), SNAKE_A)

// Croc's back runs from (-0.9, 0.2) down to (1.1, 0.02).
const crocTop = (x) => 0.2 - (x + 0.9) * 0.09
const crocScute = (x) => ({ r: 'shade', p: [[x - 0.07, crocTop(x - 0.07)], [x + 0.07, crocTop(x + 0.07)], [x, crocTop(x) - 0.08]] })
const crocTooth = (x) => ({ r: 'pale', p: [[x, -0.06], [x + 0.05, -0.06], [x + 0.025, -0.1]] })

export const ART = {
  elephant: {
    details: [
      { r: 'shade', e: [0, -0.36, 0.82, 0.2] },
      { r: 'light', e: [-0.1, 0.6, 0.72, 0.12] },
      { r: 'shade', p: [[0.58, 0.5], [0.84, 0.54], [0.9, 0.24], [0.8, 0.02], [0.62, 0.08]] },
      { r: 'dark', l: [[0.62, 0.08], [0.58, 0.5], [0.84, 0.54]], w: 0.04 },
      { r: 'pale', p: [[0.98, 0.02], [1.12, -0.03], [1.15, 0.05], [1.02, 0.1]] },
      { r: 'dark', l: [[1.09, -0.12], [1.25, -0.12]], w: 0.03 },
      { r: 'dark', l: [[1.09, -0.22], [1.25, -0.22]], w: 0.03 },
      { r: 'dark', l: [[-0.73, 0.34], [-0.69, 0.04]], w: 0.05 },
      { r: 'pale', p: rect(-0.57, -0.63, -0.49, -0.57) }, { r: 'pale', p: rect(-0.43, -0.63, -0.35, -0.57) },
      { r: 'pale', p: rect(0.31, -0.63, 0.39, -0.57) }, { r: 'pale', p: rect(0.45, -0.63, 0.53, -0.57) },
    ],
  },
  giraffe: {
    details: [
      { r: 'shade', e: [0, -0.3, 0.55, 0.12] },
      { r: 'spot', e: [-0.3, 0.07, 0.1, 0.08] }, { r: 'spot', e: [0.02, -0.08, 0.11, 0.08] },
      { r: 'spot', e: [0.22, 0.12, 0.09, 0.07] }, { r: 'spot', e: [-0.06, 0.16, 0.07, 0.05] },
      { r: 'spot', e: [-0.4, -0.16, 0.06, 0.05] },
      { r: 'spot', e: [0.42, 0.48, 0.06, 0.07] }, { r: 'spot', e: [0.44, 0.82, 0.06, 0.07] },
      { r: 'spot', e: [0.4, 1.12, 0.05, 0.06] },
      { r: 'dark', l: [[0.285, 0.3], [0.285, 1.26]], w: 0.05 },
      { r: 'dark', p: rect(0.36, 1.43, 0.42, 1.48) }, { r: 'dark', p: rect(0.46, 1.43, 0.52, 1.48) },
      { r: 'shade', p: rect(0.7, 1.24, 0.8, 1.38) },
      { r: 'dark', p: rect(-0.43, -0.74, -0.29, -0.67) }, { r: 'dark', p: rect(0.29, -0.74, 0.43, -0.67) },
      { r: 'dark', l: [[-0.49, 0.16], [-0.46, -0.12]], w: 0.04 },
    ],
  },
  penguin: {
    bigEyes: true,
    details: [
      { r: 'shade', p: [[-0.4, 0.2], [-0.31, 0.12], [-0.31, -0.24], [-0.42, -0.12]] },
      { r: 'shade', p: mirror([[-0.4, 0.2], [-0.31, 0.12], [-0.31, -0.24], [-0.42, -0.12]]) },
      { r: 'pale', e: [0, -0.12, 0.26, 0.38] },
      { r: 'pale', e: [-0.13, 0.33, 0.1, 0.09] }, { r: 'pale', e: [0.13, 0.33, 0.1, 0.09] },
      { r: 'beak', p: [[-0.08, 0.25], [0.08, 0.25], [0, 0.14]] },
      { r: 'beak', p: rect(-0.24, -0.55, -0.06, -0.49) }, { r: 'beak', p: rect(0.06, -0.55, 0.24, -0.49) },
    ],
  },
  hippo: {
    details: [
      { r: 'shade', e: [0, -0.42, 0.98, 0.2] },
      { r: 'light', e: [-0.1, 0.49, 0.82, 0.12] },
      { r: 'shade', e: [0.72, 0.04, 0.2, 0.16] },
      { r: 'dark', p: rect(-0.44, -0.35, 0.3, -0.29) },
      { r: 'shade', p: [[0.38, 0.42], [0.5, 0.42], [0.45, 0.33]] },
      { r: 'dark', p: rect(0.82, 0.22, 0.86, 0.27) }, { r: 'dark', p: rect(0.9, 0.2, 0.94, 0.25) },
      { r: 'dark', l: [[0.97, -0.05], [0.6, -0.02]], w: 0.03 },
      { r: 'pale', p: rect(0.86, -0.1, 0.91, -0.04) },
    ],
  },
  snake: {
    details: [
      { r: 'pale', p: rect(-1.04, -0.12, 0.08, -0.06) },
      { r: 'pale', p: snakeFront(0, -0.09, 0.52, 0.03) },
      { r: 'shade', p: rect(-0.95, -0.06, -0.85, 0.12) }, { r: 'shade', p: rect(-0.65, -0.06, -0.55, 0.12) },
      { r: 'shade', p: rect(-0.35, -0.06, -0.25, 0.12) }, { r: 'shade', p: rect(-0.05, -0.06, 0.05, 0.12) },
      { r: 'shade', p: snakeFront(-0.3, 0.03, 0.05, 0.09) }, { r: 'shade', p: snakeFront(0, 0.03, 0.05, 0.09) },
      { r: 'dark', p: snakeFront(0.49, -0.02, 0.02, 0.02) },
    ],
  },
  turtle: {
    details: [
      { r: 'light', p: [[-0.2, 0.1], [0.2, 0.1], [0.3, 0.25], [0.2, 0.4], [-0.2, 0.4], [-0.3, 0.25]] },
      { r: 'dark', l: [[-0.2, 0.1], [0.2, 0.1], [0.3, 0.25], [0.2, 0.4], [-0.2, 0.4], [-0.3, 0.25], [-0.2, 0.1]], w: 0.035 },
      { r: 'dark', l: [[-0.3, 0.25], [-0.62, 0.2]], w: 0.035 }, { r: 'dark', l: [[0.3, 0.25], [0.62, 0.2]], w: 0.035 },
      { r: 'dark', l: [[-0.2, 0.1], [-0.3, 0.02]], w: 0.035 }, { r: 'dark', l: [[0.2, 0.1], [0.3, 0.02]], w: 0.035 },
      { r: 'shade', p: rect(-0.8, -0.18, 0.8, 0.02) },
      { r: 'pale', p: rect(-0.8, -0.02, 0.8, 0.02) },
      { r: 'light', p: rect(-0.62, -0.18, -0.4, -0.08) }, { r: 'light', p: rect(0.4, -0.18, 0.62, -0.08) },
      { r: 'light', p: rect(0.78, -0.09, 1.1, 0.13) },
      { r: 'dark', l: [[1.1, -0.04], [0.98, -0.04]], w: 0.025 },
    ],
  },
  frog: {
    bigEyes: true,
    details: [
      { r: 'pale', e: [0, -0.22, 0.36, 0.14] },
      { r: 'shade', p: [[-0.55, -0.3], [-0.28, -0.3], [-0.34, -0.2], [-0.51, -0.2]] },
      { r: 'shade', p: mirror([[-0.55, -0.3], [-0.28, -0.3], [-0.34, -0.2], [-0.51, -0.2]]) },
      { r: 'spot', e: [-0.28, 0.14, 0.06, 0.05] }, { r: 'spot', e: [0.3, 0.1, 0.05, 0.04] }, { r: 'spot', e: [-0.06, 0.2, 0.04, 0.03] },
      { r: 'dark', l: [[-0.3, 0.02], [0, -0.04], [0.3, 0.02]], w: 0.035 },
      { r: 'blush', e: [-0.33, -0.04, 0.06, 0.04] }, { r: 'blush', e: [0.33, -0.04, 0.06, 0.04] },
    ],
  },
  pig: {
    details: [
      { r: 'shade', e: [0, -0.42, 0.6, 0.16] },
      { r: 'light', e: [-0.05, 0.4, 0.5, 0.1] },
      { r: 'light', p: rect(0.55, -0.11, 0.73, 0.19) },
      { r: 'dark', p: rect(0.6, 0.0, 0.63, 0.08) }, { r: 'dark', p: rect(0.66, 0.0, 0.69, 0.08) },
      { r: 'shade', p: [[0.14, 0.34], [0.36, 0.34], [0.3, 0.16]] },
      { r: 'dark', l: [[-0.55, 0.14], [-0.49, 0.2], [-0.46, 0.13], [-0.51, 0.09]], w: 0.03 },
      { r: 'dark', p: rect(-0.45, -0.53, -0.25, -0.47) }, { r: 'dark', p: rect(0.25, -0.53, 0.45, -0.47) },
      { r: 'blush', e: [0.42, -0.05, 0.07, 0.05] },
    ],
  },
  croc: {
    details: [
      { r: 'pale', p: [[-1.1, -0.18], [1.1, -0.14], [1.1, -0.1], [-1.1, -0.12]] },
      crocScute(-0.7), crocScute(-0.45), crocScute(-0.2), crocScute(0.05), crocScute(0.3),
      { r: 'dark', l: [[1.1, -0.06], [0.5, -0.06]], w: 0.025 },
      crocTooth(0.62), crocTooth(0.77), crocTooth(0.92),
      { r: 'dark', p: rect(1.02, -0.02, 1.06, 0.01) },
      { r: 'shade', p: rect(-0.62, -0.17, -0.46, -0.1) }, { r: 'shade', p: rect(0.28, -0.15, 0.44, -0.09) },
    ],
  },
  owl: {
    bigEyes: true,
    details: [
      { r: 'shade', p: [[-0.4, 0.1], [-0.28, 0.0], [-0.3, -0.4], [-0.4, -0.46]] },
      { r: 'shade', p: mirror([[-0.4, 0.1], [-0.28, 0.0], [-0.3, -0.4], [-0.4, -0.46]]) },
      { r: 'shade', p: [[-0.4, 0.5], [-0.14, 0.5], [-0.34, 0.74]] }, { r: 'shade', p: [[0.14, 0.5], [0.4, 0.5], [0.34, 0.74]] },
      { r: 'light', e: [0, -0.2, 0.25, 0.26] },
      { r: 'shade', l: [[-0.12, -0.08], [0, -0.13], [0.12, -0.08]], w: 0.035 },
      { r: 'shade', l: [[-0.12, -0.24], [0, -0.29], [0.12, -0.24]], w: 0.035 },
      { r: 'pale', e: [-0.16, 0.24, 0.15, 0.14] }, { r: 'pale', e: [0.16, 0.24, 0.15, 0.14] },
      { r: 'dark', l: [[-0.32, 0.4], [0, 0.32], [0.32, 0.4]], w: 0.035 },
      { r: 'beak', p: [[-0.05, 0.15], [0.05, 0.15], [0, 0.05]] },
      { r: 'beak', p: rect(-0.2, -0.5, -0.06, -0.45) }, { r: 'beak', p: rect(0.06, -0.5, 0.2, -0.45) },
    ],
  },
  rhino: {
    details: [
      { r: 'shade', e: [0, -0.45, 0.72, 0.2] },
      { r: 'light', e: [-0.1, 0.46, 0.6, 0.12] },
      { r: 'pale', p: [[0.84, 0.22], [1.04, 0.18], [0.98, 0.56]] },
      { r: 'shade', p: [[0.46, 0.38], [0.6, 0.38], [0.56, 0.26]] },
      { r: 'dark', l: [[-0.26, 0.36], [-0.3, -0.1]], w: 0.03 }, { r: 'dark', l: [[0.3, 0.36], [0.34, -0.1]], w: 0.03 },
      { r: 'dark', p: rect(-0.36, -0.38, 0.26, -0.32) },
      { r: 'dark', l: [[1.06, -0.18], [0.9, -0.14]], w: 0.025 },
      { r: 'dark', p: rect(0.98, -0.02, 1.02, 0.02) },
    ],
  },
  chick: {
    details: [
      { r: 'light', e: [0.02, 0.12, 0.2, 0.14] },
      { r: 'shade', p: [[-0.22, -0.02], [0.02, -0.06], [-0.06, -0.19], [-0.22, -0.15]] },
      { r: 'beak', p: [[0.17, 0.07], [0.3, 0.03], [0.18, -0.02]] },
      { r: 'beak', p: rect(-0.13, -0.25, -0.05, -0.21) }, { r: 'beak', p: rect(0.05, -0.25, 0.13, -0.21) },
      { r: 'dark', l: [[0, 0.3], [-0.03, 0.2]], w: 0.03 }, { r: 'dark', l: [[0.02, 0.3], [0.07, 0.21]], w: 0.03 },
      { r: 'blush', e: [0.13, -0.02, 0.04, 0.03] },
    ],
  },
}

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
 * is the light text colour) so bellies still read.
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
  }
}

// ─── Pixel pass ──────────────────────────────────────────────────────────────

/**
 * Turn an anti-aliased RGBA render into crisp pixel art in place: alpha is
 * thresholded, every opaque pixel snaps to the nearest colour in `palette`
 * ([[r,g,b],…]), and opaque pixels on the silhouette's edge become `outline`
 * — an inner outline, so the sprite never grows past the hull it was drawn from.
 */
export function pixelate(data, w, h, palette, outline) {
  const solid = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (data[o + 3] < 110) { data[o + 3] = 0; continue }
    solid[i] = 1
    data[o + 3] = 255
    let best = palette[0], bd = Infinity
    for (const c of palette) {
      const d = (data[o] - c[0]) ** 2 + (data[o + 1] - c[1]) ** 2 + (data[o + 2] - c[2]) ** 2
      if (d < bd) { bd = d; best = c }
    }
    data[o] = best[0]; data[o + 1] = best[1]; data[o + 2] = best[2]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!solid[i]) continue
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !solid[i - 1] || !solid[i + 1] || !solid[i - w] || !solid[i + w]
      if (edge) { const o = i * 4; data[o] = outline[0]; data[o + 1] = outline[1]; data[o + 2] = outline[2] }
    }
  }
  return data
}

/** Local-frame bounds of a piece's hull: [minx, miny, maxx, maxy]. */
export function hullBounds(def) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
  for (const part of def.parts) for (const [x, y] of part) {
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y)
  }
  return [minx, miny, maxx, maxy]
}
