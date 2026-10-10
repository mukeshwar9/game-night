// Shared building blocks for the three pixel styles:
//   object  32×32  the game's signature object, 3-tone shading, 1 px ink outline, dithered floor
//   cast    32×32  a character with a face on a spotlight disc (same outline + shading)
//   scene   64×64  a mid-game moment with its surroundings and dithered depth
import { Cv, mulberry32, text } from './px.mjs'
import { P } from './palette.mjs'

// Draw in a 32-unit design space at any offset/scale: one object definition
// serves the 32 px object/cast tiles and the 64 px scene. Lengths round to
// whole pixels (never below 1) so scaled strokes stay even.
export function T(L, ox = 0, oy = 0, s = 1) {
  const X = v => ox + v * s
  const Y = v => oy + v * s
  const W = v => Math.max(1, Math.round(v * s))
  const R = v => Math.round(v)
  const scaled = pred => pred && ((dx, dy) => pred(dx / s, dy / s))
  return {
    s,
    L,
    rect: (x, y, w, h, c) => L.rect(R(X(x)), R(Y(y)), W(w), W(h), c),
    rrect: (x, y, w, h, c, r = 1) => L.rrect(R(X(x)), R(Y(y)), W(w), W(h), c, Math.max(1, Math.round(r * s))),
    disc: (cx, cy, r, c, pred) => L.disc(X(cx), Y(cy), r * s, c, scaled(pred)),
    ring: (cx, cy, r, t, c) => L.ring(X(cx), Y(cy), r * s, t * s, c),
    ellipse: (cx, cy, rx, ry, c, pred) => L.ellipse(X(cx), Y(cy), rx * s, ry * s, c, scaled(pred)),
    ball: (cx, cy, r, b, l, d) => L.ball(X(cx), Y(cy), r * s, b, l, d),
    seg: (x0, y0, x1, y1, w, c) => L.seg(X(x0), Y(y0), X(x1), Y(y1), w * s, c),
    poly: (pts, c) => L.poly(pts.map(([x, y]) => [X(x), Y(y)]), c),
    set: (x, y, c) => L.rect(R(X(x)), R(Y(y)), W(1), W(1), c),
    // native-pixel position of a design-space point (for faces, labels)
    at: (x, y) => [R(X(x)), R(Y(y))],
  }
}

// ── grounds ───────────────────────────────────────────────────────────────
export function objectGround(bg, dk) {
  const cv = new Cv(32, 32, bg)
  cv.dither25(0, 26, 32, 6, dk)
  cv.rect(0, 29, 32, 3, dk)
  cv.dither(0, 29, 32, 1, bg)
  return cv
}

export function castGround(bg, lt) {
  const cv = new Cv(32, 32, bg)
  cv.disc(15.5, 15.5, 13.5, lt)
  cv.ring(15.5, 15.5, 13.5, 1.6, bg)
  cv.dither(0, 0, 32, 32, lt, 0, bg)
  cv.disc(15.5, 15.5, 12, lt)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x - 15.5, dy = y - 15.5
    if (dx * dx + dy * dy > 15.5 * 15.5) cv.set(x, y, bg)
  }
  return cv
}

// ── faces ────────────────────────────────────────────────────────────────
// (x, y) = the point between the eyes' top edges, in native pixels.
export function face(L, x, y, { sp = 3, mood = 'happy', ink = P.ink, eye = P.white, cheek } = {}) {
  const l = x - sp - 1, r = x + sp
  L.rect(l, y, 2, 3, eye); L.rect(r, y, 2, 3, eye)
  if (mood === 'shock') { L.rect(l, y + 1, 1, 1, ink); L.rect(r + 1, y + 1, 1, 1, ink) } else { L.rect(l + 1, y + 1, 1, 2, ink); L.rect(r, y + 1, 1, 2, ink) }
  if (mood === 'angry') { L.set(l - 1, y - 2, ink); L.set(l, y - 1, ink); L.set(r + 2, y - 2, ink); L.set(r + 1, y - 1, ink) }
  if (mood === 'worried') { L.set(l - 1, y - 1, ink); L.set(l, y - 2, ink); L.set(r + 2, y - 1, ink); L.set(r + 1, y - 2, ink) }
  if (mood === 'happy') { L.set(x - 2, y + 4, ink); L.rect(x - 1, y + 5, 2, 1, ink); L.set(x + 1, y + 4, ink) }
  if (mood === 'shock') L.rect(x - 1, y + 4, 2, 2, ink)
  if (mood === 'angry') L.rect(x - 2, y + 5, 4, 1, ink)
  if (mood === 'worried') { L.set(x - 2, y + 5, ink); L.set(x - 1, y + 4, ink); L.set(x, y + 5, ink); L.set(x + 1, y + 4, ink) }
  if (mood === 'grin') { L.rect(x - 2, y + 4, 4, 2, ink); L.rect(x - 1, y + 4, 2, 1, P.white) }
  if (cheek) { L.set(l - 1, y + 3, cheek); L.set(r + 2, y + 3, cheek) }
}

// ── shared props ────────────────────────────────────────────────────────
export const X4 = ['#..#', '.##.', '.##.', '#..#']
export const O4 = ['.##.', '#..#', '#..#', '.##.']
export const STAR5 = ['..#..', '.###.', '#####', '.###.', '.#.#.']
export const HEART7 = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']
export const TICK5 = ['....#', '...#.', '#.#..', '.#...']
export const CROSS5 = ['#...#', '.#.#.', '..#..', '.#.#.', '#...#']
export const COIN5 = ['.###.', '#l###', '#####', '####d', '.#dd.']
export const COIN8 = ['..oooo..', '.olllod.', 'olddddod', 'oldoodod', 'odooodod', 'ooddddod', '.oooodd.', '..oddd..']

export function coin5(L, x, y, ch) {
  if (ch === '.') return L.spr(x, y, COIN5, { '#': P.night, l: P.night, d: P.night })
  const [b, l, d] = ch === 'r' ? [P.red, P.pink, P.dred] : [P.yellow, P.lyellow, P.dyellow]
  L.spr(x, y, COIN5, { '#': b, l, d })
}

// Die with pips; s = 9 (1 px pips) or 12 (2 px pips) or 18 (3 px pips).
export function die(L, x, y, s, n, { face: f = P.white, shade = P.cloud, pip = P.ink } = {}) {
  L.rrect(x, y, s, s, f, s >= 12 ? 2 : 1)
  L.rect(x + 1, y + s - 1, s - 2, 1, shade); L.rect(x + s - 1, y + 1, 1, s - 2, shade)
  const ps = s >= 18 ? 3 : s >= 12 ? 2 : 1
  const pos = s >= 18 ? [3, 7.5, 12] : s >= 12 ? [2, 5, 8] : [2, 4, 6]
  const at = {
    1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  }[n]
  at.forEach(([i, j]) => L.rect(Math.round(x + pos[i]), Math.round(y + pos[j]), ps, ps, pip))
}

// Letter tile: 7×8 (3×5 glyph) or 10×13 at scale 2.
export function tile(L, x, y, ch, { bg = P.cream, fg = P.ink, shade = P.sand, scale = 1 } = {}) {
  const w = scale === 2 ? 10 : 7, h = scale === 2 ? 13 : 8
  L.rrect(x, y, w, h, bg, 1)
  L.rect(x + 1, y + h - 1, w - 2, 1, shade)
  text(L, x + 2, y + (scale === 2 ? 1 : 1), ch, fg, scale)
}

// Pencil along an axis: graphite point → wood cone → body → ferrule → eraser.
export function pencil(cv, x0, y0, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0, Ln = Math.hypot(dx, dy)
  const ux = dx / Ln, uy = dy / Ln
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    const px = x - x0, py = y - y0
    const t = (px * ux + py * uy) / Ln
    const d = px * -uy + py * ux
    if (t < 0 || t > 1) continue
    const half = w / 2
    const coneT = 0.22
    const lim = t < coneT ? half * (t / coneT) : half
    if (Math.abs(d) > lim) continue
    let c
    if (t < 0.07) c = P.ink
    else if (t < coneT) c = d > half * 0.2 ? P.brown : P.sand
    else if (t < 0.82) c = d < -half * 0.35 ? P.lyellow : d > half * 0.35 ? P.dyellow : P.yellow
    else if (t < 0.88) c = d > 0 ? P.gray : P.cloud
    else c = d > half * 0.35 ? P.magenta : P.pink
    cv.set(x, y, c)
  }
}

export function ghost(L, x, y, body, eyes = 'look', w = 11) {
  const cx = x + (w - 1) / 2
  L.disc(cx, y + 5, 5.3, body, (dx, dy) => dy <= 0)
  L.rect(x, y + 5, w, 4, body)
  for (let i = 0; i < w; i++) if ((i % 4) !== 3) L.set(x + i, y + 9, body)
  for (let i = 0; i < w; i++) if ((i % 4) === 0 || (i % 4) === 1) L.set(x + i, y + 10, body)
  if (eyes === 'look') {
    L.rect(x + 2, y + 3, 3, 3, P.white); L.rect(x + 6, y + 3, 3, 3, P.white)
    L.rect(x + 4, y + 4, 1, 2, P.blue); L.rect(x + 8, y + 4, 1, 2, P.blue)
  } else {
    L.rect(x + 3, y + 3, 2, 2, P.cream); L.rect(x + 6, y + 3, 2, 2, P.cream)
    ;[[2, 7], [3, 6], [4, 7], [5, 6], [6, 7], [7, 6], [8, 7]].forEach(([i, j]) => L.set(x + i, y + j, P.cream))
  }
}

export function pac(L, cx, cy, r, open = 0.62, dir = 1, shade = true) {
  const mouth = (dx, dy) => Math.abs(Math.atan2(dy, dx * dir)) > open
  L.disc(cx, cy, r, P.yellow, mouth)
  if (shade) {
    L.disc(cx, cy, r, P.dyellow, (dx, dy) => mouth(dx, dy) && dy > r * 0.45)
    L.disc(cx - r * 0.35 * dir, cy - r * 0.45, Math.max(0.6, r * 0.18), P.lyellow)
  }
}

export function spikedMine(L, cx, cy, r) {
  const s = r + 2.5
  ;[[1, 0], [0, 1], [0.72, 0.72], [0.72, -0.72]].forEach(([ux, uy]) => {
    L.seg(cx - ux * s, cy - uy * s, cx + ux * s, cy + uy * s, r > 4 ? 2.2 : 1, P.ink2)
  })
  L.ball(cx, cy, r, P.ink2, null, P.ink)
  L.disc(cx - r * 0.4, cy - r * 0.4, Math.max(0.6, r * 0.25), P.white)
}

export const rng = seed => mulberry32(seed)
export function stars(cv, n, seed, cols, onto) {
  const r = rng(seed)
  for (let k = 0; k < n; k++) {
    const x = Math.floor(r() * cv.w), y = Math.floor(r() * cv.h)
    if (onto && cv.get(x, y) !== onto) continue
    cv.set(x, y, cols[k % cols.length])
  }
}

// ── scene grounds (64×64) ───────────────────────────────────────────────
// A wall with a table edge in front: the default "game night" room.
export function room(wall, { table = P.brown, edge = P.sand, dark = P.dbrown, y = 50, wall2 } = {}) {
  const cv = new Cv(64, 64, wall)
  if (wall2) cv.dither(0, 0, 64, y, wall2, 0)
  cv.rect(0, y, 64, 64 - y, table); cv.rect(0, y, 64, 1, edge); cv.dither(0, y + 6, 64, 64 - y - 6, dark, 0)
  return cv
}
// Top-down wooden tabletop (board games seen from above).
export function tabletop(seed = 1, { wood = P.brown, grain = P.dbrown, fleck = P.sand } = {}) {
  const cv = new Cv(64, 64, wood)
  for (let y = 0; y < 64; y += 13) cv.rect(0, y, 64, 1, grain)
  const r = rng(seed)
  for (let k = 0; k < 90; k++) cv.set(Math.floor(r() * 64), Math.floor(r() * 64), k % 3 ? grain : fleck)
  return cv
}
// Vertical banded gradient with checker dither between bands: [[y, colour], …].
export function bands(stops) {
  const cv = new Cv(64, 64, stops[0][1])
  stops.forEach(([y, c], i) => {
    const next = stops[i + 1] ? stops[i + 1][0] : 64
    cv.rect(0, y, 64, next - y, c)
    if (i > 0) cv.dither(0, y - 3, 64, 3, c, 0)
  })
  return cv
}
// Stage with a spotlight pool (party games).
export function stage(back, front, glow) {
  const cv = new Cv(64, 64, back)
  cv.dither(0, 0, 64, 64, front, 0, back)
  cv.ellipse(32, 30, 26, 24, glow)
  cv.ellipse(32, 30, 28, 26, glow, (dx, dy) => (Math.round(dx) + Math.round(dy)) % 2 === 0)
  cv.rect(0, 52, 64, 12, front); cv.rect(0, 52, 64, 1, glow); cv.dither(0, 56, 64, 8, back, 0)
  return cv
}

// ── assembling the three styles from one definition ─────────────────────
// def = { bg, dk, lt, obj(t), objectExtra(cv), cast: { x, y, s, face: [x, y, opts] }, castExtra(cv, L), scene(cv) }
export function make(def) {
  return {
    object() {
      if (def.object) return def.object()
      const cv = objectGround(def.bg, def.dk)
      def.objectBack?.(cv)
      cv.sticker(L => def.obj(T(L, 0, 0, 1), L), { shadow: def.dk })
      def.objectExtra?.(cv)
      return cv
    },
    cast() {
      if (def.cast?.draw) return def.cast.draw()
      const c = def.cast || {}
      const cv = castGround(def.bg, def.lt)
      def.castBack?.(cv)
      cv.sticker(L => {
        def.obj(T(L, c.x ?? 0, c.y ?? 0, c.s ?? 1), L)
        if (c.face) face(L, c.face[0], c.face[1], c.face[2])
        c.extra?.(L)
      }, { shadow: def.dk })
      c.after?.(cv)
      return cv
    },
    scene() {
      return def.scene()
    },
  }
}
