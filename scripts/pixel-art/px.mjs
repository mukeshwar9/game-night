// Tiny pixel-art DSL + zero-dependency indexed-PNG encoder.
// Every sprite is drawn on a 32×32 grid of house-palette colours and written
// out 1:1; the app upscales it with `image-rendering: pixelated`. There is no
// anti-aliasing anywhere, so the output is crisp and byte-for-byte repeatable.
import { deflateSync } from 'node:zlib'

import { P } from './palette.mjs'

export class Cv {
  constructor(w, h, bg = null) {
    this.w = w
    this.h = h
    this.p = new Array(w * h).fill(bg)
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y)
    if (c == null || x < 0 || y < 0 || x >= this.w || y >= this.h) return this
    this.p[y * this.w + x] = c
    return this
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null
    return this.p[y * this.w + x]
  }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c)
    return this
  }
  box(x, y, w, h, c) {
    for (let i = x; i < x + w; i++) { this.set(i, y, c); this.set(i, y + h - 1, c) }
    for (let j = y; j < y + h; j++) { this.set(x, j, c); this.set(x + w - 1, j, c) }
    return this
  }
  // Rect with its four corner pixels knocked out (pixel-art rounding).
  rrect(x, y, w, h, c, r = 1) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const dx = Math.min(i - x, x + w - 1 - i)
        const dy = Math.min(j - y, y + h - 1 - j)
        if (dx + dy < r) continue
        this.set(i, j, c)
      }
    }
    return this
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1)
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.set(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
    return this
  }
  // Thick segment by distance test (pixel centres).
  seg(x0, y0, x1, y1, w, c) {
    const minX = Math.floor(Math.min(x0, x1) - w), maxX = Math.ceil(Math.max(x0, x1) + w)
    const minY = Math.floor(Math.min(y0, y1) - w), maxY = Math.ceil(Math.max(y0, y1) + w)
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let t = l2 ? ((x - x0) * dx + (y - y0) * dy) / l2 : 0
        t = Math.max(0, Math.min(1, t))
        const ex = x - (x0 + t * dx), ey = y - (y0 + t * dy)
        if (ex * ex + ey * ey <= (w / 2) * (w / 2)) this.set(x, y, c)
      }
    }
    return this
  }
  // Filled disc; cx/cy may sit on half pixels for even diameters.
  disc(cx, cy, r, c, pred) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = x - cx, dy = y - cy
        if (dx * dx + dy * dy <= r * r + r * 0.6 && (!pred || pred(dx, dy))) this.set(x, y, c)
      }
    }
    return this
  }
  ring(cx, cy, r, t, c) {
    return this.disc(cx, cy, r, c, (dx, dy) => {
      const ri = r - t
      return dx * dx + dy * dy > ri * ri + ri * 0.6
    })
  }
  ellipse(cx, cy, rx, ry, c, pred) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x - cx) / (rx + 0.3), dy = (y - cy) / (ry + 0.3)
        if (dx * dx + dy * dy <= 1 && (!pred || pred(x - cx, y - cy))) this.set(x, y, c)
      }
    }
    return this
  }
  // Shaded ball: dark crescent lower-right, highlight upper-left.
  ball(cx, cy, r, base, light, dark) {
    this.disc(cx, cy, r, base)
    if (dark) this.disc(cx, cy, r, dark, (dx, dy) => (dx + dy) / Math.SQRT2 > r * 0.45)
    if (light) this.disc(cx - r * 0.38, cy - r * 0.38, Math.max(0.6, r * 0.22), light)
    return this
  }
  poly(pts, c) {
    const ys = pts.map(p => p[1])
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const yc = y + 0.5
      const xs = []
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax))
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, c)
      }
    }
    return this
  }
  // ASCII sprite stamp: map char -> colour; '.' and ' ' are transparent.
  spr(x, y, rows, map) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return
      this.set(x + i, y + j, map[ch])
    }))
    return this
  }
  // Checker dither of colour c over a region (optionally only onto `onto`).
  dither(x, y, w, h, c, phase = 0, onto) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if ((i + j + phase) % 2) continue
      if (onto && this.get(i, j) !== onto) continue
      this.set(i, j, c)
    }
    return this
  }
  // Sparse 25% dither (every other pixel on every other row).
  dither25(x, y, w, h, c, onto) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (j % 2) continue
      if ((i + (j % 4 === 0 ? 0 : 1)) % 2) continue
      if (onto && this.get(i, j) !== onto) continue
      this.set(i, j, c)
    }
    return this
  }
  // Add a 1px outline around every opaque pixel (4-neighbour, rounder corners).
  outline(c, diag = false) {
    const add = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y) != null) continue
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      if (diag) n.push([1, 1], [-1, -1], [1, -1], [-1, 1])
      if (n.some(([dx, dy]) => this.get(x + dx, y + dy) != null)) add.push([x, y])
    }
    add.forEach(([x, y]) => this.set(x, y, c))
    return this
  }
  // Composite another layer on top (optionally offset / recoloured).
  draw(layer, dx = 0, dy = 0, tint) {
    for (let y = 0; y < layer.h; y++) for (let x = 0; x < layer.w; x++) {
      const c = layer.get(x, y)
      if (c != null) this.set(x + dx, y + dy, tint || c)
    }
    return this
  }
  // Layer helper: draw fn onto a fresh transparent layer, outline it, drop a
  // shadow, composite. The house "sticker" treatment for hero objects.
  sticker(fn, { outline = P.ink, shadow, sx = 1, sy = 1, diag = false } = {}) {
    const L = new Cv(this.w, this.h)
    fn(L)
    if (outline) L.outline(outline, diag)
    if (shadow) this.draw(L, sx, sy, shadow)
    this.draw(L)
    return this
  }
  // Punch a transparent disc (bites, cut-outs) out of a layer.
  hole(cx, cy, r) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = x - cx, dy = y - cy
        if (x >= 0 && y >= 0 && x < this.w && y < this.h && dx * dx + dy * dy <= r * r + r * 0.6) this.p[y * this.w + x] = null
      }
    }
    return this
  }
  // Replace colour a with b everywhere.
  swap(a, b) { this.p = this.p.map(c => (c === a ? b : c)); return this }
}

// 3×5 pixel font (A–Z, 0–9 and a little punctuation); `scale` doubles it
// for the few big labels.
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  '?': ['##.', '..#', '.#.', '...', '.#.'], '=': ['...', '###', '...', '###', '...'], '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'], '!': ['.#.', '.#.', '.#.', '...', '.#.'], ':': ['...', '.#.', '...', '.#.', '...'],
  _: ['...', '...', '...', '...', '###'],
}
export function text(cv, x, y, str, c, scale = 1) {
  ;[...str].forEach((ch, k) => {
    const g = FONT[ch]
    if (!g) return
    g.forEach((row, j) => [...row].forEach((px, i) => {
      if (px === '#') cv.rect(x + (k * 4 + i) * scale, y + j * scale, scale, scale, c)
    }))
  })
}

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- PNG ---
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

// Indexed (palette) PNG at `scale`× nearest-neighbour: smallest files, and
// the palette chunk makes the colour budget auditable.
export function png(cv, scale = 1) {
  const cols = [...new Set(cv.p)]
  const idx = new Map(cols.map((c, i) => [c, i]))
  const W = cv.w * scale, H = cv.h * scale
  const raw = Buffer.alloc((W + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W + 1)] = 0
    for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = idx.get(cv.p[Math.floor(y / scale) * cv.w + Math.floor(x / scale)])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const plte = Buffer.concat(cols.map(c => Buffer.from(c == null ? [0, 0, 0] : rgb(c))))
  const parts = [chunk('IHDR', ihdr), chunk('PLTE', plte)]
  if (cols.includes(null)) parts.push(chunk('tRNS', Buffer.from(cols.map(c => (c == null ? 0 : 255)))))
  parts.push(chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...parts])
}

// Several canvases side by side (for contact sheets), each scaled to `cell`.
export function sheet(rows, cell, gap = 8, bg = '#f2f2ee') {
  const cols = Math.max(...rows.map(r => r.length))
  const W = cols * cell + (cols + 1) * gap, H = rows.length * cell + (rows.length + 1) * gap
  const out = new Cv(W, H, bg)
  rows.forEach((row, r) => row.forEach((cv, c) => {
    const s = Math.floor(cell / cv.w)
    for (let y = 0; y < cv.h * s; y++) for (let x = 0; x < cv.w * s; x++) {
      const v = cv.p[Math.floor(y / s) * cv.w + Math.floor(x / s)]
      if (v != null) out.set(gap + c * (cell + gap) + x, gap + r * (cell + gap) + y, v)
    }
  }))
  return out
}
