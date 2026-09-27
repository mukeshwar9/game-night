// Generates the descriptive game-art PNGs (256×256, fixed bright palette in
// the style of the "80+ GAMES" reference: bold bg color, chunky shapes, dark
// sticker outline). No dependencies — pure Node (manual PNG encoder).
// Run: npm run art   → outputs public/game-art/<type>.png
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const W = 256
const H = 256
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'game-art')

// Fixed art palette (lives in this script only — theming-rules.md governs
// code colors in src/, not binary image content).
const OUTLINE = hex('#232733')
const CREAM = hex('#F7E9C4')
const WHITE = hex('#FFFFFF')

function hex(h) {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function canvas() {
  return { data: new Uint8ClampedArray(W * H * 4) }
}

function set(cv, x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  const d = cv.data
  if (a >= 255) {
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255
    return
  }
  const s = a / 255
  const t = 1 - s
  d[i] = Math.round(r * s + d[i] * t)
  d[i + 1] = Math.round(g * s + d[i + 1] * t)
  d[i + 2] = Math.round(b * s + d[i + 2] * t)
  d[i + 3] = 255
}

function paint(cv, pred, color, alpha = 255) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pred(x, y)) set(cv, x, y, color, alpha)
    }
  }
}

// --- shape predicates (pixel centers) ---
const rr = (x, y, w, h, r) => (px, py) => {
  if (px < x || px >= x + w || py < y || py >= y + h) return false
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}
const circ = (cx, cy, r) => (px, py) => {
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}
const distToSeg = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0
  t = Math.min(Math.max(t, 0), 1)
  const ex = px - (x1 + t * dx)
  const ey = py - (y1 + t * dy)
  return { d: Math.hypot(ex, ey), t: t * Math.sqrt(len2) }
}
const seg = (x1, y1, x2, y2, w) => (px, py) =>
  distToSeg(px, py, x1, y1, x2, y2).d <= w / 2
const dashSeg = (x1, y1, x2, y2, w, dash, gap) => (px, py) => {
  const { d, t } = distToSeg(px, py, x1, y1, x2, y2)
  return d <= w / 2 && (t % (dash + gap)) < dash
}

// --- pieces ---
function tile(bg) {
  const cv = canvas()
  paint(cv, rr(4, 4, 248, 248, 54), OUTLINE)
  paint(cv, rr(17, 17, 222, 222, 42), bg)
  return cv
}

function disc(cv, cx, cy, r, color) {
  paint(cv, circ(cx, cy, r + 4), OUTLINE)
  paint(cv, circ(cx, cy, r), color)
  paint(cv, circ(cx - r * 0.3, cy - r * 0.35, r * 0.28), WHITE, 150)
}

function tictactoe() {
  const coral = hex('#E2604D')
  const teal = hex('#3FA7A0')
  const cv = tile(coral)
  // centered even grid: board 52..204, lines at thirds
  for (const s of [
    seg(103, 52, 103, 204, 13), seg(153, 52, 153, 204, 13),
    seg(52, 103, 204, 103, 13), seg(52, 153, 204, 153, 13),
  ]) paint(cv, s, CREAM)
  // X top-left + center
  for (const [cx, cy] of [[77, 77], [128, 128]]) {
    paint(cv, seg(cx - 11, cy - 11, cx + 11, cy + 11, 13), OUTLINE)
    paint(cv, seg(cx + 11, cy - 11, cx - 11, cy + 11, 13), OUTLINE)
  }
  // matching teal O rings top-right + bottom-left
  for (const [cx, cy] of [[179, 77], [77, 179]]) {
    paint(cv, circ(cx, cy, 20), OUTLINE)
    paint(cv, circ(cx, cy, 17), teal)
    paint(cv, circ(cx, cy, 8), coral)
  }
  return cv
}

function connectfour() {
  const cv = tile(hex('#3E7CC4'))
  const board = hex('#2456A6')
  const yellow = hex('#F2C230')
  const red = hex('#E05252')
  // board with outline
  paint(cv, rr(22, 54, 212, 176, 32), OUTLINE)
  paint(cv, rr(30, 62, 196, 160, 26), board)
  const xs = [62, 97, 132, 167, 202]
  const ys = [102, 134, 166, 198]
  const taken = new Set(['0,3', '1,2', '2,1', '3,0', '4,3', '4,2', '1,3'])
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      if (!taken.has(`${c},${r}`)) paint(cv, circ(xs[c], ys[r], 13), WHITE)
    }
  }
  // winning diagonal (yellow) + rivals (red)
  for (const [c, r] of [[0, 3], [1, 2], [2, 1], [3, 0]]) disc(cv, xs[c], ys[r], 13, yellow)
  for (const [c, r] of [[4, 3], [4, 2], [1, 3]]) disc(cv, xs[c], ys[r], 13, red)
  // falling disc
  disc(cv, 167, 32, 12, yellow)
  return cv
}

function pong() {
  const cv = tile(hex('#43A864'))
  const field = hex('#2E7D4F')
  paint(cv, rr(20, 64, 216, 128, 24), OUTLINE)
  paint(cv, rr(28, 72, 200, 112, 18), field)
  paint(cv, dashSeg(128, 84, 128, 172, 6, 10, 8), CREAM)
  // paddles with outline
  for (const x of [42, 200]) {
    paint(cv, rr(x - 3, 101, 20, 54, 9), OUTLINE)
    paint(cv, rr(x, 104, 14, 48, 7), CREAM)
  }
  // ball with motion trail
  paint(cv, circ(116, 129, 7), WHITE, 70)
  paint(cv, circ(133, 124, 9), WHITE, 130)
  paint(cv, circ(152, 119, 14), OUTLINE)
  paint(cv, circ(152, 119, 11), WHITE)
  return cv
}

// --- extra shape helpers for the full-catalog rollout ---
const ell = (cx, cy, rx, ry) => (px, py) =>
  ((px - cx) ** 2) / (rx * rx) + ((py - cy) ** 2) / (ry * ry) <= 1

function inPoly(pts) {
  return (px, py) => {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
}

function R(cv, x, y, w, h, r, c, ow = 0, oc = OUTLINE) {
  if (ow) paint(cv, rr(x - ow, y - ow, w + ow * 2, h + ow * 2, r + ow), oc)
  paint(cv, rr(x, y, w, h, r), c)
}
function C(cv, cx, cy, r, c, ow = 0, oc = OUTLINE, a = 255) {
  if (ow) paint(cv, circ(cx, cy, r + ow), oc)
  paint(cv, circ(cx, cy, r), c, a)
}
function E(cv, cx, cy, rx, ry, c, ow = 0, oc = OUTLINE) {
  if (ow) paint(cv, ell(cx, cy, rx + ow, ry + ow), oc)
  paint(cv, ell(cx, cy, rx, ry), c)
}
function Ln(cv, x1, y1, x2, y2, w, c) {
  paint(cv, seg(x1, y1, x2, y2, w), c)
}
function Pg(cv, pts, c, a = 255) {
  paint(cv, inPoly(pts), c, a)
}
function die(cv, cx, cy, s, v, face = CREAM) {
  R(cv, cx - s / 2, cy - s / 2, s, s, 10, face, 5)
  const o = s * 0.26
  const P = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  }[v]
  for (const [dx, dy] of P) paint(cv, circ(cx + dx * o, cy + dy * o, s * 0.075), OUTLINE)
}

// --- full catalog art (one fn per non-variant game) ---
const PLUM = hex('#7C5CBF')
const BROWN = hex('#8A5A3B')
const NAVY = hex('#2456A6')
const MAROON = hex('#8A3B3B')
const SLATE = hex('#4A5568')
const DARK = hex('#2B2F3A')
const WOOD = hex('#C98F4E')
const SKY = hex('#7FB6D9')
const SAND = hex('#E8C87A')
const BLUE = hex('#3E7CC4')
const GREEN = hex('#43A864')
const DGREEN = hex('#2E7D4F')
const YELLOW = hex('#F2C230')
const RED = hex('#E05252')
const TEAL = hex('#3FA7A0')
const ORANGE = hex('#E8913A')
const PURPLE = hex('#5B4B8A')
const VIOLET = hex('#6B4FA8')
const PINK = hex('#E2789B')

function sim() {
  const cv = tile(PLUM)
  Ln(cv, 48, 52, 24, 148, 10, CREAM)
  Ln(cv, 24, 148, 168, 148, 10, CREAM)
  Ln(cv, 168, 148, 48, 52, 12, RED)
  C(cv, 48, 52, 11, CREAM, 4)
  C(cv, 24, 148, 11, CREAM, 4)
  C(cv, 168, 148, 11, CREAM, 4)
  return cv
}

function chomp() {
  const cv = tile(BROWN)
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 5; c++) {
      if (r === 0 && c === 0) R(cv, 30 + c * 40, 48 + r * 40, 34, 34, 7, DARK, 3)
      else if (r === 2 && c === 4) R(cv, 30 + c * 40, 48 + r * 40, 34, 34, 7, BROWN, 3, CREAM)
      else R(cv, 30 + c * 40, 48 + r * 40, 34, 34, 7, CREAM, 3)
    }
  C(cv, 47, 65, 8, CREAM)
  return cv
}

function breakthrough() {
  const cv = tile(NAVY)
  for (let y = 40; y <= 170; y += 22) paint(cv, circ(128, y, 4), CREAM)
  Pg(cv, [[128, 28], [108, 58], [148, 58]], YELLOW)
  C(cv, 128, 150, 24, CREAM, 6)
  R(cv, 96, 168, 64, 16, 6, CREAM)
  C(cv, 70, 60, 16, RED, 5)
  return cv
}

function ataxx() {
  const cv = tile(TEAL)
  C(cv, 92, 140, 40, RED, 7)
  C(cv, 168, 106, 26, RED, 6)
  C(cv, 172, 168, 26, RED, 6)
  C(cv, 92, 140, 52, CREAM, 0)
  paint(cv, inPoly([[40, 88], [144, 88], [144, 96], [40, 96]]), TEAL)
  C(cv, 92, 140, 40, RED, 0)
  C(cv, 92, 140, 54, CREAM)
  paint(cv, circ(92, 140, 48), TEAL)
  C(cv, 200, 90, 20, BLUE, 5)
  return cv
}

function kamisado() {
  const cv = tile(DARK)
  const cols = [RED, YELLOW, GREEN, TEAL, PURPLE]
  cols.forEach((c, i) => {
    R(cv, 34 + i * 38, 120 - i * 12, 26, 60 + i * 12, 5, c, 4)
  })
  Ln(cv, 128, 60, 128, 100, 10, CREAM)
  Pg(cv, [[128, 44], [112, 66], [144, 66]], CREAM)
  return cv
}

function onitama() {
  const cv = tile(GREEN)
  R(cv, 36, 44, 80, 100, 10, CREAM, 6)
  R(cv, 140, 44, 80, 100, 10, CREAM, 6)
  C(cv, 76, 94, 12, RED, 4)
  C(cv, 180, 94, 12, BLUE, 4)
  C(cv, 128, 180, 20, RED, 5)
  Ln(cv, 128, 144, 128, 160, 8, CREAM)
  return cv
}

function quarto() {
  const cv = tile(BROWN)
  R(cv, 44, 60, 26, 120, 6, CREAM, 5)
  R(cv, 92, 110, 26, 70, 6, DARK, 5)
  C(cv, 150, 120, 26, CREAM, 5)
  C(cv, 150, 120, 12, BROWN)
  R(cv, 196, 110, 30, 70, 6, DARK, 5)
  C(cv, 128, 200, 14, YELLOW, 4)
  return cv
}

function santorini() {
  const cv = tile(SKY)
  R(cv, 58, 150, 140, 50, 8, CREAM, 5)
  R(cv, 78, 110, 100, 44, 8, CREAM, 5)
  R(cv, 98, 72, 60, 42, 8, CREAM, 5)
  C(cv, 128, 52, 20, BLUE, 5)
  C(cv, 80, 96, 10, RED, 4)
  return cv
}

function loa() {
  const cv = tile(MAROON)
  Ln(cv, 52, 180, 200, 70, 12, CREAM)
  C(cv, 52, 180, 16, YELLOW, 5)
  C(cv, 104, 143, 16, YELLOW, 5)
  C(cv, 152, 106, 16, YELLOW, 5)
  C(cv, 200, 70, 16, YELLOW, 5)
  C(cv, 200, 70, 24, CREAM, 0)
  paint(cv, circ(200, 70, 24), MAROON)
  C(cv, 200, 70, 16, YELLOW, 0)
  return cv
}

function yavalath() {
  const cv = tile(SLATE)
  ;[56, 96, 136, 176].forEach(x => C(cv, x, 100, 17, YELLOW, 5))
  ;[76, 116].forEach(x => C(cv, x, 160, 15, RED, 5))
  paint(cv, circ(156, 160, 15), SLATE)
  Ln(cv, 40, 100, 192, 100, 8, CREAM)
  return cv
}

function hangwoman() {
  const cv = tile(CREAM)
  Ln(cv, 60, 200, 196, 200, 10, DARK)
  Ln(cv, 80, 200, 80, 40, 10, DARK)
  Ln(cv, 80, 40, 160, 40, 10, DARK)
  Ln(cv, 160, 40, 160, 70, 8, DARK)
  C(cv, 160, 92, 20, YELLOW, 6, DARK)
  ;[52, 92, 132, 172].forEach(x => R(cv, x, 216, 28, 8, 3, DARK))
  return cv
}

function dotsandboxes() {
  const cv = tile(CREAM)
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) paint(cv, circ(48 + c * 40, 48 + r * 40, 7), DARK)
  R(cv, 88, 88, 40, 40, 4, YELLOW)
  Ln(cv, 88, 88, 128, 88, 7, DARK)
  Ln(cv, 88, 128, 128, 128, 7, DARK)
  Ln(cv, 88, 88, 88, 128, 7, DARK)
  Ln(cv, 128, 88, 128, 128, 7, DARK)
  return cv
}

function sos() {
  const cv = tile(RED)
  R(cv, 28, 78, 58, 58, 10, CREAM, 5)
  R(cv, 99, 78, 58, 58, 10, CREAM, 5)
  R(cv, 170, 78, 58, 58, 10, CREAM, 5)
  Ln(cv, 78, 90, 44, 90, 9, DARK)
  Ln(cv, 44, 90, 44, 107, 9, DARK)
  Ln(cv, 44, 107, 78, 107, 9, DARK)
  Ln(cv, 78, 107, 78, 124, 9, DARK)
  Ln(cv, 78, 124, 44, 124, 9, DARK)
  C(cv, 128, 107, 19, TEAL, 0)
  paint(cv, circ(128, 107, 19), TEAL)
  paint(cv, circ(128, 107, 10), CREAM)
  Ln(cv, 220, 90, 186, 90, 9, DARK)
  Ln(cv, 186, 90, 186, 107, 9, DARK)
  Ln(cv, 186, 107, 220, 107, 9, DARK)
  Ln(cv, 220, 107, 220, 124, 9, DARK)
  Ln(cv, 220, 124, 186, 124, 9, DARK)
  Ln(cv, 40, 160, 216, 160, 9, YELLOW)
  return cv
}

function simon() {
  const cv = tile(DARK)
  R(cv, 52, 52, 70, 70, 16, RED, 4)
  R(cv, 134, 52, 70, 70, 16, GREEN, 4)
  R(cv, 52, 134, 70, 70, 16, YELLOW, 4)
  R(cv, 134, 134, 70, 70, 16, BLUE, 4)
  R(cv, 134, 134, 70, 70, 16, BLUE, 0)
  paint(cv, rr(134, 134, 70, 70, 16), BLUE)
  R(cv, 128, 128, 82, 82, 20, BLUE, 0)
  paint(cv, rr(128, 128, 82, 82, 20), BLUE)
  paint(cv, rr(141, 141, 56, 56, 14), CREAM)
  return cv
}

function chimp() {
  const cv = tile(PURPLE)
  R(cv, 44, 60, 52, 52, 10, CREAM, 5)
  R(cv, 120, 90, 52, 52, 10, CREAM, 5)
  R(cv, 180, 56, 52, 52, 10, CREAM, 5)
  R(cv, 80, 150, 52, 52, 10, CREAM, 5)
  R(cv, 160, 160, 52, 52, 10, CREAM, 5)
  paint(cv, circ(70, 86, 9), DARK)
  paint(cv, circ(133, 109, 9), DARK)
  paint(cv, circ(159, 109, 9), DARK)
  paint(cv, circ(193, 75, 9), DARK)
  paint(cv, circ(219, 75, 9), DARK)
  paint(cv, circ(93, 169, 9), DARK)
  paint(cv, circ(119, 169, 9), DARK)
  paint(cv, circ(145, 169, 9), DARK)
  return cv
}

function numbermemory() {
  const cv = tile(DARK)
  for (const x of [70, 128, 186]) Ln(cv, x, 50, x, 206, 8, CREAM)
  C(cv, 70, 90, 13, RED, 4)
  C(cv, 70, 150, 13, YELLOW, 4)
  C(cv, 128, 120, 13, TEAL, 4)
  C(cv, 186, 80, 13, GREEN, 4)
  C(cv, 186, 140, 13, BLUE, 4)
  C(cv, 186, 180, 13, PURPLE, 4)
  return cv
}

function reaction() {
  const cv = tile(YELLOW)
  Pg(cv, [[140, 40], [100, 130], [128, 130], [110, 210], [160, 120], [130, 120]], DARK)
  C(cv, 70, 70, 14, CREAM, 5)
  C(cv, 190, 180, 14, CREAM, 5)
  return cv
}

function aim() {
  const cv = tile(RED)
  C(cv, 128, 128, 70, CREAM)
  C(cv, 128, 128, 50, RED)
  C(cv, 128, 128, 30, CREAM)
  C(cv, 128, 128, 14, RED)
  Ln(cv, 128, 20, 128, 60, 8, DARK)
  Ln(cv, 128, 196, 128, 236, 8, DARK)
  Ln(cv, 20, 128, 60, 128, 8, DARK)
  Ln(cv, 196, 128, 236, 128, 8, DARK)
  return cv
}

function typing() {
  const cv = tile(DARK)
  R(cv, 44, 70, 48, 48, 8, CREAM, 4)
  R(cv, 104, 70, 48, 48, 8, CREAM, 4)
  R(cv, 164, 70, 48, 48, 8, YELLOW, 4)
  R(cv, 44, 130, 48, 48, 8, CREAM, 4)
  R(cv, 104, 130, 48, 48, 8, CREAM, 4)
  R(cv, 164, 130, 48, 48, 8, CREAM, 4)
  R(cv, 64, 190, 128, 30, 8, TEAL, 4)
  return cv
}

function math() {
  const cv = tile(BLUE)
  Ln(cv, 70, 70, 70, 130, 16, CREAM)
  Ln(cv, 40, 100, 100, 100, 16, CREAM)
  Ln(cv, 150, 150, 200, 200, 16, YELLOW)
  Ln(cv, 200, 150, 150, 200, 16, YELLOW)
  Ln(cv, 60, 180, 120, 180, 14, CREAM)
  C(cv, 180, 90, 26, YELLOW, 0)
  paint(cv, circ(180, 90, 26), YELLOW)
  paint(cv, circ(180, 90, 17), BLUE)
  Ln(cv, 168, 90, 192, 90, 10, YELLOW)
  return cv
}

function arrows() {
  const cv = tile(DARK)
  Ln(cv, 128, 190, 128, 90, 18, CREAM)
  Pg(cv, [[128, 50], [100, 92], [156, 92]], CREAM)
  Ln(cv, 60, 128, 110, 128, 14, TEAL)
  Pg(cv, [[118, 106], [118, 150], [76, 128]], TEAL)
  C(cv, 190, 128, 22, YELLOW, 0)
  paint(cv, circ(190, 128, 22), YELLOW)
  paint(cv, circ(190, 128, 14), DARK)
  return cv
}

function updraft() {
  const cv = tile(SKY)
  ;[150, 110, 70].forEach((y) => {
    Pg(cv, [[88, y], [128, y - 28], [168, y]], CREAM)
    Ln(cv, 88, y + 12, 128, y - 16, 10, CREAM)
    Ln(cv, 128, y - 16, 168, y + 12, 10, CREAM)
  })
  Ln(cv, 40, 180, 70, 180, 8, CREAM)
  Ln(cv, 186, 200, 216, 200, 8, CREAM)
  return cv
}

function snake() {
  const cv = tile(DGREEN)
  C(cv, 70, 180, 17, GREEN, 4)
  C(cv, 105, 175, 17, GREEN, 4)
  C(cv, 138, 160, 17, GREEN, 4)
  C(cv, 165, 135, 17, GREEN, 4)
  C(cv, 185, 105, 19, GREEN, 4)
  paint(cv, circ(192, 100, 5), DARK)
  paint(cv, circ(178, 100, 5), DARK)
  Ln(cv, 200, 88, 210, 76, 6, RED)
  C(cv, 80, 80, 20, RED, 5)
  Ln(cv, 80, 60, 80, 46, 7, DGREEN)
  Pg(cv, [[80, 46], [94, 52], [80, 60]], GREEN)
  return cv
}

function tron() {
  const cv = tile(hex('#0B0E1A'))
  Ln(cv, 40, 200, 40, 90, 10, hex('#22D3EE'))
  Ln(cv, 40, 90, 130, 90, 10, hex('#22D3EE'))
  Ln(cv, 216, 200, 216, 120, 10, hex('#F0F'))
  Ln(cv, 216, 120, 140, 120, 10, hex('#F0F'))
  Pg(cv, [[140, 96], [150, 116], [172, 118], [156, 132], [160, 154], [140, 140], [120, 154], [124, 132], [108, 118], [130, 116]], CREAM)
  return cv
}

function sumo() {
  const cv = tile(SAND)
  C(cv, 128, 128, 88, SAND, 0)
  paint(cv, circ(128, 128, 88), SAND)
  paint(cv, circ(128, 128, 80), SAND)
  Ln(cv, 48, 128, 208, 128, 6, DARK)
  paint(cv, circ(128, 128, 80), SAND)
  C(cv, 128, 128, 80, SAND, 6, DARK)
  C(cv, 92, 128, 26, RED, 5)
  C(cv, 164, 128, 26, BLUE, 5)
  C(cv, 128, 128, 8, DARK)
  return cv
}

function spaceduel() {
  const cv = tile(hex('#0B0E1A'))
  ;[[40, 50], [90, 40], [200, 60], [150, 180], [60, 200], [220, 190]].forEach(([x, y]) => paint(cv, circ(x, y, 4), CREAM))
  Pg(cv, [[60, 120], [60, 170], [100, 145]], CREAM)
  Pg(cv, [[196, 120], [196, 170], [156, 145]], RED)
  ;[115, 130, 145].forEach(x => paint(cv, circ(x, 145, 5), YELLOW))
  return cv
}

function paintturf() {
  const cv = tile(CREAM)
  R(cv, 40, 150, 176, 56, 10, BLUE, 5)
  Ln(cv, 200, 120, 200, 70, 12, DARK)
  R(cv, 120, 48, 120, 34, 8, RED, 5)
  Ln(cv, 200, 65, 240, 65, 10, DARK)
  C(cv, 60, 60, 10, RED)
  C(cv, 200, 220, 8, BLUE)
  C(cv, 222, 200, 6, YELLOW)
  return cv
}

function pacmac() {
  const cv = tile(hex('#1B2A6B'))
  C(cv, 110, 128, 44, YELLOW, 5)
  Pg(cv, [[110, 128], [154, 100], [154, 156]], hex('#1B2A6B'))
  paint(cv, circ(122, 112, 7), DARK)
  ;[180, 200, 220].forEach(x => paint(cv, circ(x, 128, 7), CREAM))
  R(cv, 52, 170, 34, 40, 10, RED, 4)
  C(cv, 69, 170, 17, RED)
  paint(cv, circ(62, 182, 4), CREAM)
  paint(cv, circ(76, 182, 4), CREAM)
  return cv
}

function visualmemory() {
  const cv = tile(DARK)
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) R(cv, 58 + c * 48, 58 + r * 48, 40, 40, 8, SLATE)
  R(cv, 58, 58, 40, 40, 8, YELLOW, 4, CREAM)
  R(cv, 154, 106, 40, 40, 8, YELLOW, 4, CREAM)
  R(cv, 106, 154, 40, 40, 8, YELLOW, 4, CREAM)
  return cv
}

function gomoku() {
  const cv = tile(WOOD)
  for (let i = 0; i < 7; i++) {
    Ln(cv, 48 + i * 26, 48, 48 + i * 26, 204, 3, DARK)
    Ln(cv, 48, 48 + i * 26, 204, 48 + i * 26, 3, DARK)
  }
  ;[74, 100, 126, 152, 178].forEach(x => C(cv, x, 126, 11, DARK, 3))
  C(cv, 178, 126, 16, YELLOW, 0)
  paint(cv, circ(178, 126, 16), YELLOW)
  paint(cv, circ(178, 126, 11), DARK)
  return cv
}

function reversi() {
  const cv = tile(GREEN)
  C(cv, 108, 128, 52, DARK, 6)
  C(cv, 148, 128, 52, CREAM, 6)
  paint(cv, inPoly([[100, 76], [256, 76], [256, 180], [100, 180]]), GREEN)
  C(cv, 108, 128, 52, DARK, 0)
  paint(cv, circ(108, 128, 52), DARK)
  C(cv, 190, 70, 24, DARK, 5)
  C(cv, 190, 70, 24, CREAM, 0)
  paint(cv, circ(190, 70, 24), CREAM)
  C(cv, 70, 190, 24, CREAM, 5)
  return cv
}

function chainreaction() {
  const cv = tile(hex('#232A45'))
  R(cv, 52, 52, 72, 72, 12, SLATE, 3)
  R(cv, 132, 52, 72, 72, 12, SLATE, 3)
  R(cv, 52, 132, 72, 72, 12, SLATE, 3)
  R(cv, 132, 132, 72, 72, 12, SLATE, 3)
  C(cv, 88, 88, 13, RED, 4)
  paint(cv, circ(88, 88, 5), CREAM)
  C(cv, 168, 88, 13, YELLOW, 4)
  paint(cv, circ(162, 84, 4), CREAM)
  paint(cv, circ(174, 92, 4), CREAM)
  C(cv, 88, 168, 13, TEAL, 4)
  paint(cv, circ(82, 164, 4), CREAM)
  paint(cv, circ(94, 164, 4), CREAM)
  paint(cv, circ(88, 174, 4), CREAM)
  C(cv, 168, 168, 20, ORANGE, 5, CREAM)
  return cv
}

function blockade() {
  const cv = tile(ORANGE)
  Ln(cv, 40, 40, 216, 40, 10, YELLOW)
  R(cv, 120, 80, 18, 60, 4, CREAM, 4)
  R(cv, 120, 150, 18, 60, 4, CREAM, 4)
  R(cv, 150, 115, 60, 18, 4, CREAM, 4)
  C(cv, 70, 190, 20, RED, 5)
  C(cv, 190, 190, 20, BLUE, 5)
  return cv
}

function orderchaos() {
  const cv = tile(DARK)
  Ln(cv, 70, 60, 120, 110, 22, CREAM)
  Ln(cv, 120, 60, 70, 110, 22, CREAM)
  C(cv, 185, 85, 30, RED, 0)
  paint(cv, circ(185, 85, 30), RED)
  paint(cv, circ(185, 85, 17), DARK)
  Ln(cv, 60, 160, 200, 160, 14, YELLOW)
  return cv
}

function dice() {
  const cv = tile(GREEN)
  die(cv, 105, 130, 110, 5)
  die(cv, 195, 185, 62, 2)
  return cv
}

function hextile() {
  const cv = tile(BLUE)
  Pg(cv, [[196, 128], [162, 186], [94, 186], [60, 128], [94, 70], [162, 70]], BLUE)
  paint(cv, inPoly([[196, 128], [162, 186], [94, 186], [60, 128], [94, 70], [162, 70]]), BLUE)
  const hx = [[196, 128], [162, 186], [94, 186], [60, 128], [94, 70], [162, 70]]
  for (let i = 0; i < 6; i++) {
    const [x1, y1] = hx[i]
    const [x2, y2] = hx[(i + 1) % 6]
    Ln(cv, x1, y1, x2, y2, 10, CREAM)
  }
  ;[[110, 128], [135, 140], [160, 128], [150, 105]].forEach(([x, y]) => C(cv, x, y, 13, NAVY, 4))
  R(cv, 40, 118, 16, 20, 4, YELLOW)
  R(cv, 200, 118, 16, 20, 4, YELLOW)
  return cv
}

function minesweeper() {
  const cv = tile(GREEN)
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      if (r === 1 && c === 1) R(cv, 78 + c * 52, 78 + r * 52, 44, 44, 8, DGREEN, 3)
      else R(cv, 78 + c * 52, 78 + r * 52, 44, 44, 8, CREAM, 3)
    }
  Ln(cv, 182, 60, 182, 110, 8, DARK)
  Pg(cv, [[182, 58], [216, 72], [182, 86]], RED)
  C(cv, 100, 100, 10, DARK)
  return cv
}

function herd() {
  const cv = tile(TEAL)
  const heads = [[70, 90], [130, 80], [190, 95], [90, 150], [150, 150], [200, 160], [120, 195]]
  heads.forEach(([x, y], i) => {
    C(cv, x, y, 20, i % 2 ? CREAM : SAND, 4)
    paint(cv, circ(x - 6, y - 3, 3), DARK)
    paint(cv, circ(x + 6, y - 3, 3), DARK)
  })
  C(cv, 130, 80, 28, YELLOW, 0)
  paint(cv, circ(130, 80, 28), YELLOW)
  paint(cv, circ(130, 80, 20), CREAM)
  paint(cv, circ(124, 77, 3), DARK)
  paint(cv, circ(136, 77, 3), DARK)
  return cv
}

function trivia() {
  const cv = tile(PURPLE)
  R(cv, 58, 60, 140, 90, 18, CREAM, 5)
  Pg(cv, [[80, 148], [80, 180], [110, 148]], CREAM)
  Pg(cv, [[128, 78], [134, 96], [152, 97], [138, 108], [143, 126], [128, 115], [113, 126], [118, 108], [104, 97], [122, 96]], YELLOW)
  C(cv, 190, 170, 16, TEAL, 4)
  Ln(cv, 190, 170, 190, 170, 1, TEAL)
  return cv
}

function battleship() {
  const cv = tile(BLUE)
  R(cv, 48, 130, 110, 34, 12, DARK, 4)
  R(cv, 80, 104, 34, 28, 6, CREAM, 4)
  Ln(cv, 97, 104, 97, 88, 7, DARK)
  Ln(cv, 40, 190, 90, 190, 8, CREAM)
  Ln(cv, 110, 205, 180, 205, 8, CREAM)
  Ln(cv, 190, 190, 230, 190, 8, CREAM)
  Pg(cv, [[196, 52], [202, 70], [220, 72], [206, 83], [211, 101], [196, 90], [181, 101], [186, 83], [172, 72], [190, 70]], YELLOW)
  C(cv, 196, 76, 26, YELLOW, 0)
  paint(cv, circ(196, 76, 26), YELLOW)
  paint(cv, circ(196, 76, 18), BLUE)
  return cv
}

function mancala() {
  const cv = tile(WOOD)
  ;[52, 100, 148].forEach(x => E(cv, x, 128, 20, 26, DARK))
  E(cv, 208, 128, 20, 60, RED, 5)
  ;[[46, 120], [58, 134], [94, 124], [106, 136], [142, 122], [154, 134], [204, 110], [212, 140]].forEach(([x, y]) => paint(cv, circ(x, y, 6), CREAM))
  return cv
}

function checkers() {
  const cv = tile(RED)
  R(cv, 58, 58, 140, 140, 10, CREAM, 5)
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if ((r + c) % 2 === 1) paint(cv, rr(63 + c * 32.5, 63 + r * 32.5, 32.5, 32.5, 2), DARK)
  C(cv, 95, 95, 13, DARK, 3, CREAM)
  C(cv, 160, 160, 13, CREAM, 3)
  C(cv, 160, 160, 20, YELLOW, 0)
  paint(cv, circ(160, 160, 20), YELLOW)
  paint(cv, circ(160, 160, 13), CREAM)
  return cv
}

const ICE = hex('#BFE3F0')
function airhockey() {
  const cv = tile(ICE)
  R(cv, 48, 58, 160, 140, 30, ICE, 6, RED)
  Ln(cv, 128, 66, 128, 190, 6, RED)
  C(cv, 128, 128, 18, RED, 5)
  C(cv, 70, 80, 22, RED, 0)
  paint(cv, circ(70, 80, 22), RED)
  paint(cv, circ(70, 80, 12), ICE)
  C(cv, 70, 80, 5, DARK)
  return cv
}

function artillery() {
  const cv = tile(SKY)
  R(cv, 0, 200, 256, 56, 0, GREEN)
  C(cv, 70, 185, 22, DARK, 4)
  Ln(cv, 70, 185, 130, 120, 16, DARK)
  ;[140, 160, 180, 200].forEach((x, i) => paint(cv, circ(x, 112 - i * 14, 5), DARK))
  C(cv, 210, 60, 20, CREAM, 0)
  paint(cv, circ(210, 60, 20), CREAM)
  paint(cv, circ(210, 60, 12), RED)
  paint(cv, circ(210, 60, 5), CREAM)
  return cv
}

function animalstack() {
  const cv = tile(SKY)
  Ln(cv, 40, 210, 216, 210, 8, DARK)
  E(cv, 128, 185, 55, 24, ORANGE, 5)
  E(cv, 128, 140, 42, 22, TEAL, 5)
  E(cv, 128, 100, 30, 20, PURPLE, 5)
  paint(cv, circ(120, 98, 4), CREAM)
  paint(cv, circ(136, 98, 4), CREAM)
  paint(cv, circ(118, 138, 4), CREAM)
  paint(cv, circ(138, 138, 4), CREAM)
  Pg(cv, [[150, 78], [154, 88], [164, 89], [156, 95], [159, 105], [150, 99], [141, 105], [144, 95], [134, 89], [144, 88]], YELLOW)
  return cv
}

function wirecrossed() {
  const cv = tile(DARK)
  C(cv, 170, 150, 45, DARK, 6, CREAM)
  R(cv, 150, 140, 40, 20, 5, RED)
  Ln(cv, 170, 105, 190, 75, 8, BROWN)
  Pg(cv, [[190, 60], [194, 70], [204, 71], [196, 77], [199, 87], [190, 81], [181, 87], [184, 77], [174, 71], [184, 70]], YELLOW)
  Ln(cv, 40, 60, 130, 120, 9, RED)
  Ln(cv, 40, 130, 130, 150, 9, BLUE)
  Ln(cv, 40, 200, 130, 180, 9, YELLOW)
  return cv
}

function twotruths() {
  const cv = tile(CREAM)
  C(cv, 70, 90, 30, GREEN, 0)
  paint(cv, circ(70, 90, 30), GREEN)
  paint(cv, circ(70, 90, 21), CREAM)
  Ln(cv, 58, 90, 68, 100, 9, GREEN)
  Ln(cv, 68, 100, 84, 78, 9, GREEN)
  C(cv, 186, 90, 30, GREEN, 0)
  paint(cv, circ(186, 90, 30), GREEN)
  paint(cv, circ(186, 90, 21), CREAM)
  Ln(cv, 174, 90, 184, 100, 9, GREEN)
  Ln(cv, 184, 100, 200, 78, 9, GREEN)
  C(cv, 128, 185, 30, RED, 0)
  paint(cv, circ(128, 185, 30), RED)
  paint(cv, circ(128, 185, 21), CREAM)
  Ln(cv, 116, 173, 140, 197, 10, RED)
  Ln(cv, 140, 173, 116, 197, 10, RED)
  return cv
}

function bluff() {
  const cv = tile(PURPLE)
  C(cv, 128, 128, 62, CREAM, 6)
  C(cv, 128, 128, 40, PURPLE)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    R(cv, 128 + Math.cos(a) * 51 - 8, 128 + Math.sin(a) * 51 - 8, 16, 16, 4, PURPLE)
  }
  C(cv, 128, 128, 22, YELLOW, 4)
  return cv
}

function lanterns() {
  const cv = tile(hex('#1E2433'))
  Ln(cv, 30, 50, 226, 50, 6, CREAM)
  const cols = [RED, YELLOW, TEAL]
  ;[70, 128, 186].forEach((x, i) => {
    Ln(cv, x, 50, x, 78, 6, CREAM)
    C(cv, x, 108, 34, cols[i], 90)
    R(cv, x - 18, 82, 36, 52, 14, cols[i], 4)
    R(cv, x - 8, 96, 16, 24, 6, CREAM)
  })
  return cv
}

function docking() {
  const cv = tile(hex('#0B0E1A'))
  C(cv, 128, 128, 62, BLUE, 0)
  paint(cv, circ(128, 128, 62), BLUE)
  paint(cv, circ(128, 128, 44), hex('#0B0E1A'))
  R(cv, 108, 40, 40, 60, 16, CREAM, 5)
  C(cv, 128, 60, 10, TEAL, 3)
  for (let y = 120; y <= 200; y += 20) paint(cv, circ(60, y, 4), CREAM)
  for (let y = 120; y <= 200; y += 20) paint(cv, circ(196, y, 4), CREAM)
  return cv
}

function wavelength() {
  const cv = tile(VIOLET)
  const bands = [RED, ORANGE, YELLOW, GREEN, BLUE]
  bands.forEach((c, i) => R(cv, 48, 90 + i * 22, 160, 18, 6, c, 3))
  Ln(cv, 128, 90, 170, 180, 8, CREAM)
  Pg(cv, [[170, 168], [158, 190], [182, 190]], YELLOW)
  C(cv, 128, 90, 10, CREAM, 3)
  return cv
}

const SKIN = hex('#E8B88A')
function fibbage() {
  const cv = tile(ORANGE)
  R(cv, 52, 60, 152, 80, 16, CREAM, 5)
  Pg(cv, [[76, 138], [76, 168], [104, 138]], CREAM)
  Ln(cv, 76, 90, 110, 90, 8, DARK)
  Ln(cv, 110, 90, 100, 110, 8, DARK)
  Ln(cv, 100, 110, 134, 110, 8, DARK)
  Ln(cv, 134, 110, 128, 90, 8, DARK)
  C(cv, 190, 170, 18, TEAL, 4)
  return cv
}

function spyfair() {
  const cv = tile(DARK)
  C(cv, 110, 110, 52, TEAL, 0)
  paint(cv, circ(110, 110, 52), TEAL)
  paint(cv, circ(110, 110, 38), DARK)
  E(cv, 110, 110, 24, 18, CREAM)
  paint(cv, circ(110, 110, 9), DARK)
  Ln(cv, 148, 148, 195, 195, 14, TEAL)
  R(cv, 170, 50, 52, 52, 10, PURPLE, 4)
  paint(cv, circ(196, 76, 8), YELLOW)
  return cv
}

function headsup() {
  const cv = tile(BLUE)
  C(cv, 128, 165, 45, SKIN, 5)
  paint(cv, circ(112, 160, 6), DARK)
  paint(cv, circ(144, 160, 6), DARK)
  Pg(cv, [[112, 185], [128, 195], [144, 185]], DARK)
  R(cv, 78, 60, 100, 56, 10, CREAM, 5)
  Pg(cv, [[128, 70], [132, 80], [142, 81], [134, 88], [137, 98], [128, 92], [119, 98], [122, 88], [114, 81], [124, 80]], YELLOW)
  return cv
}

function chameleon() {
  const cv = tile(GREEN)
  C(cv, 128, 110, 46, CREAM, 5)
  C(cv, 128, 110, 28, DGREEN)
  paint(cv, circ(128, 110, 14), DARK)
  paint(cv, circ(122, 104, 5), CREAM)
  C(cv, 60, 190, 26, DGREEN, 4)
  C(cv, 200, 185, 20, TEAL, 4)
  C(cv, 190, 70, 14, YELLOW, 4)
  return cv
}

function wordduel() {
  const cv = tile(RED)
  Ln(cv, 70, 60, 186, 190, 16, YELLOW)
  Pg(cv, [[186, 190], [196, 172], [176, 176]], DARK)
  Ln(cv, 186, 60, 70, 190, 16, CREAM)
  Pg(cv, [[70, 190], [60, 172], [80, 176]], DARK)
  R(cv, 52, 190, 44, 44, 8, BLUE, 4)
  R(cv, 160, 190, 44, 44, 8, BLUE, 4)
  return cv
}

function wordcoop() {
  const cv = tile(GREEN)
  R(cv, 48, 70, 64, 64, 10, CREAM, 5)
  R(cv, 144, 70, 64, 64, 10, CREAM, 5)
  C(cv, 128, 170, 24, YELLOW, 0)
  paint(cv, circ(128, 170, 24), YELLOW)
  paint(cv, circ(128, 170, 14), GREEN)
  C(cv, 128, 210, 24, YELLOW, 0)
  paint(cv, circ(128, 210, 24), YELLOW)
  paint(cv, circ(128, 210, 14), GREEN)
  paint(cv, inPoly([[104, 170], [152, 170], [152, 210], [104, 210]]), GREEN)
  C(cv, 128, 170, 24, YELLOW, 0)
  paint(cv, circ(128, 170, 24), YELLOW)
  paint(cv, circ(128, 170, 14), GREEN)
  return cv
}

function converge() {
  const cv = tile(BLUE)
  Ln(cv, 128, 200, 128, 140, 16, CREAM)
  Pg(cv, [[128, 112], [108, 142], [148, 142]], CREAM)
  Ln(cv, 128, 56, 128, 96, 16, YELLOW)
  Pg(cv, [[128, 124], [108, 94], [148, 94]], YELLOW)
  Ln(cv, 56, 128, 96, 128, 16, TEAL)
  Pg(cv, [[124, 128], [94, 108], [94, 148]], TEAL)
  Ln(cv, 200, 128, 160, 128, 16, RED)
  Pg(cv, [[132, 128], [162, 108], [162, 148]], RED)
  C(cv, 128, 128, 12, CREAM, 4)
  return cv
}

function wordrace() {
  const cv = tile(YELLOW)
  Ln(cv, 70, 50, 70, 170, 10, DARK)
  R(cv, 70, 50, 90, 60, 4, CREAM, 4)
  R(cv, 70, 50, 45, 30, 2, DARK)
  R(cv, 115, 80, 45, 30, 2, DARK)
  Ln(cv, 180, 120, 230, 120, 9, DARK)
  Ln(cv, 180, 150, 215, 150, 9, DARK)
  Ln(cv, 180, 180, 230, 180, 9, DARK)
  R(cv, 60, 190, 60, 40, 8, TEAL, 4)
  return cv
}

function wordhunt() {
  const cv = tile(DGREEN)
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      if (r === 1 && c === 1) R(cv, 52 + c * 44, 52 + r * 44, 38, 38, 8, YELLOW, 4)
      else R(cv, 52 + c * 44, 52 + r * 44, 38, 38, 8, CREAM, 4)
    }
  C(cv, 185, 175, 34, TEAL, 0)
  paint(cv, circ(185, 175, 34), TEAL)
  paint(cv, circ(185, 175, 24), DGREEN)
  Ln(cv, 208, 198, 232, 222, 12, TEAL)
  return cv
}

function password() {
  const cv = tile(DARK)
  C(cv, 128, 90, 34, YELLOW, 0)
  paint(cv, circ(128, 90, 34), YELLOW)
  paint(cv, circ(128, 90, 22), DARK)
  R(cv, 88, 100, 80, 90, 12, CREAM, 5)
  paint(cv, inPoly([[94, 100], [162, 100], [162, 124], [94, 124]]), CREAM)
  C(cv, 128, 140, 34, YELLOW, 0)
  paint(cv, circ(128, 140, 34), YELLOW)
  paint(cv, circ(128, 140, 22), DARK)
  paint(cv, circ(128, 145, 9), CREAM)
  R(cv, 122, 150, 12, 24, 5, CREAM)
  return cv
}

function anagrams() {
  const cv = tile(ORANGE)
  R(cv, 48, 90, 52, 52, 10, CREAM, 5)
  R(cv, 102, 90, 52, 52, 10, CREAM, 5)
  R(cv, 156, 90, 52, 52, 10, YELLOW, 5)
  C(cv, 128, 185, 40, TEAL, 0)
  paint(cv, circ(128, 185, 40), TEAL)
  paint(cv, circ(128, 185, 29), ORANGE)
  Pg(cv, [[128, 132], [114, 156], [142, 156]], CREAM)
  Pg(cv, [[170, 205], [150, 195], [162, 175]], CREAM)
  return cv
}

function hunch() {
  const cv = tile(PURPLE)
  C(cv, 128, 110, 52, CREAM, 5)
  C(cv, 70, 180, 14, CREAM, 4)
  C(cv, 100, 205, 10, CREAM, 4)
  paint(cv, circ(122, 108, 7), DARK)
  paint(cv, circ(142, 108, 7), DARK)
  Pg(cv, [[118, 130], [128, 138], [138, 130]], DARK)
  Pg(cv, [[185, 60], [189, 70], [199, 71], [191, 78], [194, 88], [185, 82], [176, 88], [179, 78], [169, 71], [179, 70]], YELLOW)
  return cv
}

function pairs() {
  const cv = tile(BLUE)
  R(cv, 52, 52, 68, 88, 10, YELLOW, 4, CREAM)
  R(cv, 136, 52, 68, 88, 10, YELLOW, 4, CREAM)
  Pg(cv, [[86, 76], [90, 88], [102, 89], [92, 96], [96, 108], [86, 101], [76, 108], [80, 96], [70, 89], [82, 88]], DARK)
  Pg(cv, [[170, 76], [174, 88], [186, 89], [176, 96], [180, 108], [170, 101], [160, 108], [164, 96], [154, 89], [166, 88]], DARK)
  R(cv, 52, 152, 68, 60, 10, RED, 4)
  R(cv, 136, 152, 68, 60, 10, RED, 4)
  paint(cv, circ(86, 182, 9), CREAM)
  paint(cv, circ(170, 182, 9), CREAM)
  return cv
}

function sketch() {
  const cv = tile(CREAM)
  Ln(cv, 60, 190, 170, 80, 18, YELLOW)
  Pg(cv, [[170, 80], [196, 54], [182, 88]], DARK)
  R(cv, 48, 186, 30, 22, 5, PINK)
  Ln(cv, 60, 60, 100, 60, 8, DARK)
  Ln(cv, 100, 60, 90, 90, 8, DARK)
  Ln(cv, 90, 90, 130, 90, 8, DARK)
  Ln(cv, 130, 90, 120, 120, 8, DARK)
  return cv
}

function codewords() {
  const cv = tile(DARK)
  R(cv, 44, 70, 52, 52, 10, CREAM, 4)
  R(cv, 102, 70, 52, 52, 10, CREAM, 4)
  R(cv, 160, 70, 52, 52, 10, CREAM, 4)
  paint(cv, circ(62, 88, 6), DARK)
  paint(cv, circ(84, 104, 6), DARK)
  paint(cv, circ(120, 88, 6), DARK)
  paint(cv, circ(120, 104, 6), DARK)
  paint(cv, circ(142, 104, 6), DARK)
  paint(cv, circ(178, 88, 6), DARK)
  paint(cv, circ(196, 104, 6), DARK)
  C(cv, 128, 175, 26, YELLOW, 0)
  paint(cv, circ(128, 175, 26), YELLOW)
  paint(cv, circ(128, 175, 15), DARK)
  return cv
}

function justone() {
  const cv = tile(TEAL)
  R(cv, 48, 70, 56, 56, 10, CREAM, 4)
  R(cv, 112, 70, 56, 56, 10, CREAM, 4)
  R(cv, 176, 70, 56, 56, 10, CREAM, 4)
  R(cv, 96, 145, 64, 64, 10, YELLOW, 5, CREAM)
  Pg(cv, [[128, 158], [132, 170], [144, 171], [134, 178], [138, 190], [128, 183], [118, 190], [122, 178], [112, 171], [124, 170]], DARK)
  return cv
}

// --- minimal PNG encoder (RGBA, 8-bit) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function toPng(cv) {
  const raw = Buffer.alloc(H * (1 + W * 4))
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0
    Buffer.from(cv.data.slice(y * W * 4, (y + 1) * W * 4))
      .copy(raw, y * (1 + W * 4) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT, { recursive: true })
for (const [name, fn] of Object.entries({
  tictactoe, sim, chomp, breakthrough, ataxx, kamisado, onitama, quarto,
  santorini, loa, yavalath, connectfour, hangwoman, dotsandboxes, sos,
  simon, chimp, numbermemory, reaction, aim, typing, math, arrows, updraft,
  pong, snake, tron, sumo, spaceduel, paint: paintturf, pacmac, visualmemory, gomoku,
  reversi, chainreaction, blockade, orderchaos, dice, hex: hextile, minesweeper, herd,
  trivia, battleship, mancala, checkers, airhockey, artillery, animalstack,
  wirecrossed, twotruths, bluff, lanterns, docking, wavelength, fibbage,
  spyfair, headsup, chameleon, wordduel, wordcoop, converge, wordrace,
  wordhunt, password, anagrams, hunch, pairs, sketch, codewords, justone,
})) {
  const buf = toPng(fn())
  writeFileSync(join(OUT, `${name}.png`), buf)
  console.log(`${name}.png — ${(buf.length / 1024).toFixed(1)} KB`)
}
