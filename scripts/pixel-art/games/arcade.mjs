// Arcade & duel games added after the first art pass: Puck Rush, Yacht, Face Off,
// Chop Chop, Sticky Fingers, Fender Bender, Lazy Susan, Steady Hand (darts),
// Bamboozle, Bonk Buggies, First Cut, Quiver and Side Kick.
import { Cv, text } from '../px.mjs'
import { P } from '../palette.mjs'
import { make, T, castGround, objectGround, bands, face, die } from '../kit.mjs'

// Draw `fn(t, L)` at scale s inside a scene (outline + shadow like the other scenes).
const prop = (cv, fn, ox, oy, s, shadow, opts = {}) => cv.sticker(L => fn(T(L, ox, oy, s), L), { shadow, ...opts })

// ── Puck Rush ────────────────────────────────────────────────────────────
function puckrush(t) {
  t.rect(1, 6, 11, 6, P.blue); t.rect(1, 6, 11, 2, P.lblue); t.rect(1, 11, 11, 1, P.dblue)
  t.rect(20, 6, 11, 6, P.blue); t.rect(20, 6, 11, 2, P.lblue); t.rect(20, 11, 11, 1, P.dblue)
  t.disc(16, 22, 5.5, P.ink2); t.ellipse(16, 20, 5.5, 3.5, P.slate); t.ellipse(16, 20.5, 3.5, 1.6, P.ink2)
}

// ── Yacht ────────────────────────────────────────────────────────────────
const yachtDice = L => {
  ;[[2, 4], [12, 2], [22, 5], [7, 16], [18, 16]].forEach(([x, y]) => die(L, x, y, 9, 6, { face: P.cream, shade: P.sand }))
}

// ── Face Off ─────────────────────────────────────────────────────────────
function faceCard(L, x, y, skin, hair, down = false) {
  L.rrect(x, y, 9, 11, down ? P.ink2 : P.cream, 1)
  if (down) {
    L.dither(x + 1, y + 1, 7, 9, P.slate, 0)
    return
  }
  L.disc(x + 4, y + 5, 3.2, skin); L.disc(x + 4, y + 3, 3.2, hair, (dx, dy) => dy < -0.5)
  L.rect(x + 2, y + 5, 1, 2, P.ink); L.rect(x + 6, y + 5, 1, 2, P.ink); L.rect(x + 3, y + 8, 3, 1, P.dcoral)
}
function faceoff(t, L) {
  const p = [[P.skin, P.dbrown, 0], [P.dskin, P.ink, 0], [P.skin, P.orange, 1], [P.dskin, P.brown, 0], [P.skin, P.yellow, 0], [P.dskin, P.ink2, 1]]
  p.forEach(([skin, hair, down], k) => faceCard(L, 2 + (k % 3) * 10, 4 + Math.floor(k / 3) * 13, skin, hair, !!down))
  L.box(12, 17, 11, 13, P.yellow)
}

// ── Chop Chop ────────────────────────────────────────────────────────────
function crate(t, x, y, w = 10) {
  t.rect(x, y, w, w, P.brown);
  t.rect(x, y, w, 1, P.lbrown); t.rect(x, y + w - 1, w, 1, P.dbrown); t.rect(x, y, 1, w, P.dbrown); t.rect(x + w - 1, y, 1, w, P.dbrown)
  t.seg(x + 1.5, y + 1.5, x + w - 2, y + w - 2, 1, P.dbrown); t.seg(x + w - 2, y + 1.5, x + 1.5, y + w - 2, 1, P.lbrown)
}
function chopchop(t) {
  crate(t, 3, 17); crate(t, 14, 17); crate(t, 8.5, 7)
  t.rect(0, 5, 32, 2, P.coral); t.rect(0, 5, 32, 1, P.lcoral)
}

// ── Sticky Fingers ───────────────────────────────────────────────────────
function bill(t, x, y, a = 0) {
  const pts = [[0, 0], [16, 0], [16, 9], [0, 9]].map(([px, py]) => {
    const dx = px - 8, dy = py - 4.5
    return [x + 8 + dx * Math.cos(a) - dy * Math.sin(a), y + 4.5 + dx * Math.sin(a) + dy * Math.cos(a)]
  })
  t.poly(pts, P.lgreen)
  const inset = pts.map(([px, py], k) => {
    const cx = x + 8, cy = y + 4.5
    return [px + (cx - px) * 0.14, py + (cy - py) * (k < 2 ? 0.28 : 0.28)]
  })
  t.poly(inset, P.green)
  t.disc(x + 8, y + 4.5, 2, P.lgreen)
}
function stickyfingers(t) {
  bill(t, 6, 17, 0.15); bill(t, 9, 11, -0.2); bill(t, 12, 5, 0.1)
  t.rrect(1, 18, 9, 8, P.skin, 2); t.rect(1, 22, 9, 3, P.dskin)
  ;[19, 21, 23].forEach(y => t.rect(8, y, 7, 2, P.skin))
  t.set(14, 20, P.yellow); t.set(14, 24, P.yellow)
}

// ── Fender Bender ────────────────────────────────────────────────────────
function fenderbender(t) {
  // red car pointing up, blue car shoving it from the right
  t.rrect(5, 6, 9, 17, P.red, 3); t.rect(6, 9, 7, 4, P.haze); t.rect(6, 17, 7, 2, P.dred); t.rect(5, 6, 9, 1, P.coral)
  t.rect(4, 8, 1, 3, P.ink); t.rect(14, 8, 1, 3, P.ink); t.rect(4, 18, 1, 3, P.ink); t.rect(14, 18, 1, 3, P.ink)
  t.rrect(17, 14, 14, 9, P.blue, 3); t.rect(21, 15, 4, 7, P.haze); t.rect(17, 14, 14, 1, P.lblue); t.rect(27, 15, 3, 7, P.dblue)
  t.rect(18, 13, 3, 1, P.ink); t.rect(18, 23, 3, 1, P.ink); t.rect(27, 13, 3, 1, P.ink); t.rect(27, 23, 3, 1, P.ink)
  t.poly([[14, 12], [16, 13.5], [18, 11], [17, 15], [20, 16.5], [16, 17], [15, 20], [14, 17], [11, 16.5], [14, 15]], P.yellow)
}

// ── Lazy Susan ───────────────────────────────────────────────────────────
function nigiri(t, x, y, top) {
  t.ellipse(x, y + 0.5, 4, 2.4, P.white); t.ellipse(x, y + 1.6, 4, 1.2, P.cloud)
  t.ellipse(x, y - 1, 4.2, 1.9, top); t.ellipse(x - 1, y - 1.6, 2, 0.8, P.lcoral)
}
function lazysusan(t) {
  t.disc(16, 16, 14, P.dbrown); t.disc(16, 15, 14, P.lbrown); t.disc(16, 15, 11.5, P.cream); t.ring(16, 15, 11.5, 1, P.sand)
  nigiri(t, 16, 6.5, P.orange); nigiri(t, 25.5, 16.5, P.coral); nigiri(t, 16, 25, P.lyellow); nigiri(t, 6.5, 15.5, P.orange)
  t.disc(16, 15, 2.6, P.dbrown); t.disc(16, 14.5, 2, P.brown)
  t.rect(26, 7, 2, 2, P.lime)
}

// ── Steady Hand (darts) ──────────────────────────────────────────────────
function board(t, cx = 16, cy = 16, r = 13) {
  const L = t.L
  const [px, py] = t.at(cx, cy)
  const rr = r * t.s
  L.disc(px, py, rr, P.ink)
  const wedge = (x, y) => Math.floor((Math.atan2(y, x) + Math.PI) / (Math.PI / 4)) % 2
  for (let y = -Math.ceil(rr); y <= rr; y++) for (let x = -Math.ceil(rr); x <= rr; x++) {
    const d = Math.hypot(x, y)
    if (d > rr * 0.86 || d < rr * 0.2) continue
    const scoring = d > rr * 0.7 || (d > rr * 0.42 && d < rr * 0.55)
    const c = scoring ? (wedge(x, y) ? P.red : P.green) : (wedge(x, y) ? P.ink : P.cream)
    L.set(px + x, py + y, c)
  }
  L.disc(px, py, rr * 0.2, P.green); L.disc(px, py, rr * 0.09, P.red)
}
function darts(t) {
  board(t)
  t.seg(23, 8, 29, 2, 1.2, P.slate); t.poly([[28, 0], [32, 0], [32, 4], [30, 3.4]], P.coral)
  t.seg(18, 14, 23, 9, 1.4, P.cloud)
}

// ── Bamboozle ────────────────────────────────────────────────────────────
function bamboozle(t) {
  t.seg(26, 1, 21, 22, 3, P.brown); t.seg(25.2, 1, 20.2, 22, 1, P.lbrown); t.disc(21, 23, 2.4, P.red)
  t.disc(10, 19, 9, P.stone); t.disc(10, 19, 9, P.dstone, (dx, dy) => dx + dy > 6); t.disc(7, 15, 2.4, P.lstone)
  t.rect(6, 20, 3, 1, P.dstone); t.rect(12, 23, 3, 1, P.dstone)
  t.disc(9, 7, 3.6, P.skin); t.disc(9, 5.5, 3.6, P.brown, (dx, dy) => dy < -0.5)
}

// ── Bonk Buggies ─────────────────────────────────────────────────────────
function buggy(t, x, y, body, dark, flip = 1) {
  const X = v => x + v * flip
  t.rrect(flip > 0 ? x : x - 14, y + 7, 14, 6, body, 2); t.rect(flip > 0 ? x : x - 14, y + 11, 14, 2, dark)
  t.disc(X(3.5), y + 14, 3.4, P.ink); t.disc(X(3.5), y + 14, 1.4, P.cloud)
  t.disc(X(10.5), y + 14, 3.4, P.ink); t.disc(X(10.5), y + 14, 1.4, P.cloud)
  t.disc(X(6), y + 3, 3, P.skin); t.disc(X(6), y + 2, 3.2, P.yellow, (dx, dy) => dy < 0)
  t.rect(flip > 0 ? x + 5 : x - 9, y + 5, 4, 3, dark)
}
function bonkbuggies(t) {
  buggy(t, 1, 10, P.red, P.dred, 1); buggy(t, 31, 10, P.blue, P.dblue, -1)
  t.poly([[16, 7], [17.5, 10], [20.5, 9], [18.5, 12], [21, 14.5], [17.5, 14], [16, 17], [14.5, 14], [11, 14.5], [13.5, 12], [11.5, 9], [14.5, 10]], P.yellow)
}

// ── First Cut ────────────────────────────────────────────────────────────
function firstcut(t) {
  const half = (cx, cy, off) => {
    const side = (dx, dy) => (dx + dy) * off > 0
    t.disc(cx, cy, 10, P.green, side)
    t.disc(cx, cy, 8.4, P.red, side); t.disc(cx, cy, 8.4, P.dcoral, (dx, dy) => side(dx, dy) && dx * dx + dy * dy > 40)
    ;[[-2, -1], [1, 2], [-3, 3], [3, -2]].forEach(([dx, dy]) => side(dx, dy) && t.set(cx + dx, cy + dy, P.ink))
  }
  half(14, 18, 1); half(18, 14, -1)
  t.seg(2, 31, 31, 2, 1, P.white)
  t.seg(30, 3, 22, 9, 2, P.cloud); t.seg(30, 3, 22, 9, 1, P.white)
  t.seg(30, 3, 31, 2, 3, P.dbrown)
}

// ── Quiver ───────────────────────────────────────────────────────────────
function arrowInto(t, ang, rIn) {
  const ux = Math.cos(ang), uy = Math.sin(ang)
  const x0 = 16 + ux * rIn, y0 = 16 + uy * rIn, x1 = 16 + ux * 15.5, y1 = 16 + uy * 15.5
  t.seg(x0, y0, x1, y1, 1.2, P.lbrown)
  t.seg(x1, y1, x1 + ux * 3, y1 + uy * 3, 2.2, P.coral)
}
function quiver(t) {
  t.disc(16, 16, 13, P.dbrown); t.disc(16, 16, 12, P.lbrown)
  t.disc(16, 16, 10, P.cream); t.disc(16, 16, 7.5, P.red); t.disc(16, 16, 5, P.cream); t.disc(16, 16, 2.4, P.red)
  ;[0, 1, 2, 3].forEach(k => { const a = k * Math.PI / 2 + 0.78; t.seg(16, 16, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, 0.8, P.dbrown) })
  arrowInto(t, -0.7, 3); arrowInto(t, 2.5, 6); arrowInto(t, 0.5, 8)
  t.disc(16, 16, 1.4, P.dyellow)
}

// ── Side Kick ────────────────────────────────────────────────────────────
function sidekick(t) {
  // rider on a red bike (left) kicking a rival wheel (right)
  t.disc(7, 22, 4.6, P.ink); t.disc(7, 22, 2.6, P.lstone); t.disc(7, 22, 1, P.ink)
  t.disc(21, 22, 4.6, P.ink); t.disc(21, 22, 2.6, P.lstone); t.disc(21, 22, 1, P.ink)
  t.poly([[7, 21], [13, 13], [21, 13], [21, 16], [15, 22]], P.red); t.rect(11, 11, 8, 3, P.dred); t.rect(10, 12, 3, 1, P.coral)
  t.seg(21, 22, 18, 13, 1.2, P.slate)
  t.rrect(8, 5, 6, 8, P.blue, 2); t.disc(11, 3, 3.2, P.yellow); t.rect(12, 2, 3, 2, P.haze)
  t.seg(12, 13, 25, 15, 2.6, P.dblue); t.rrect(24, 13, 5, 4, P.ink2, 1)
  t.poly([[29, 19], [30, 21.5], [32, 21], [30.5, 23], [32, 25], [29.5, 24.5], [28.5, 27], [28, 24.5], [26, 25], [27.5, 23], [26.5, 21]], P.yellow)
}

export default {
  puckrush: make({
    bg: P.tile, dk: P.tiledk, lt: P.white,
    objectBack(cv) { cv.rect(0, 15, 32, 1, P.lcoral); for (let y = 2; y < 26; y += 4) for (let x = 2; x < 32; x += 4) cv.set(x, y, P.lstone) },
    obj: puckrush,
    objectExtra(cv) { cv.dither(14, 14, 5, 5, P.gray, 0, P.tile); cv.rect(15, 9, 2, 1, P.coral) },
    cast: { x: 0, y: 0, face: [16, 19, { sp: 2, mood: 'grin' }] },
    scene() {
      const cv = new Cv(64, 64, P.tile)
      for (let y = 4; y < 64; y += 5) for (let x = 4; x < 64; x += 5) cv.set(x, y, P.lstone)
      cv.box(0, 0, 64, 64, P.blue); cv.box(1, 1, 62, 62, P.dblue)
      cv.rect(2, 36, 60, 1, P.lcoral)
      prop(cv, puckrush, 0, -6, 2, P.dblue, {})
      cv.sticker(L => { L.disc(14, 54, 4, P.ink2); L.disc(32, 56, 4, P.ink2); L.disc(50, 53, 4, P.ink2) }, {})
      cv.dither(30, 40, 4, 10, P.gray, 0, P.tile)
      return cv
    },
  }),

  yacht: make({
    bg: P.sea, dk: P.dsea, lt: P.lsea,
    obj() {},
    object() {
      const cv = objectGround(P.sea, P.dsea)
      cv.sticker(yachtDice, { shadow: P.dsea })
      cv.rect(11, 27, 10, 1, P.cream)
      return cv
    },
    cast: { draw() {
      const cv = castGround(P.sea, P.lsea)
      cv.sticker(L => L.rrect(6, 6, 20, 20, P.cream, 4), { shadow: P.dsea })
      cv.rect(8, 22, 16, 3, P.sand)
      face(cv, 16, 12, { sp: 3, mood: 'happy' })
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.felt)
      cv.box(0, 0, 64, 64, P.dbrown); cv.box(1, 1, 62, 62, P.brown); cv.dither(2, 2, 60, 60, P.dgreen, 0, P.felt)
      cv.sticker(L => { [[5, 8, 6], [21, 5, 6], [37, 9, 6], [11, 23, 6], [28, 21, 6]].forEach(([x, y, n]) => die(L, x, y, 12, n, { face: P.cream, shade: P.sand })) }, { shadow: P.ddgreen, sx: 2, sy: 2 })
      cv.sticker(L => { L.rrect(6, 42, 52, 16, P.cream, 2) }, { shadow: P.ddgreen })
      text(cv, 9, 45, 'YACHT 50', P.dred); text(cv, 9, 52, 'FULL 25', P.ink2)
      cv.sticker(L => die(L, 46, 28, 12, 6, { face: P.cream, shade: P.sand }), { shadow: P.ddgreen, sx: 2, sy: 2 })
      return cv
    },
  }),

  faceoff: make({
    bg: P.purple, dk: P.dpurple, lt: P.lpurple,
    obj: faceoff,
    cast: { draw() {
      const cv = castGround(P.purple, P.lpurple)
      cv.sticker(L => { L.rrect(4, 5, 24, 22, P.cream, 3); L.disc(16, 16, 8, P.skin); L.disc(16, 12, 8, P.dbrown, (dx, dy) => dy < -2.5) }, { shadow: P.dpurple })
      face(cv, 16, 15, { sp: 3, mood: 'worried', cheek: P.dcoral })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.dpurple], [38, P.purple], [54, P.dpurple]])
      cv.sticker(L => {
        ;[[P.skin, P.dbrown, 0], [P.dskin, P.ink, 1], [P.skin, P.orange, 0], [P.dskin, P.brown, 0], [P.skin, P.yellow, 1], [P.dskin, P.ink2, 0], [P.skin, P.dbrown, 0], [P.dskin, P.orange, 0]]
          .forEach(([skin, hair, down], k) => {
            const x = 4 + (k % 4) * 15, y = 4 + Math.floor(k / 4) * 20
            L.rrect(x, y, 12, 16, down ? P.ink2 : P.cream, 2)
            if (down) L.dither(x + 1, y + 1, 10, 14, P.slate, 0)
            else { L.disc(x + 6, y + 8, 4.6, skin); L.disc(x + 6, y + 5, 4.6, hair, (dx, dy) => dy < -1); L.rect(x + 3, y + 8, 2, 2, P.ink); L.rect(x + 7, y + 8, 2, 2, P.ink); L.rect(x + 4, y + 12, 4, 1, P.dcoral) }
          })
      }, { shadow: P.space })
      cv.box(34, 22, 15, 20, P.yellow); cv.box(35, 23, 13, 18, P.yellow)
      cv.sticker(L => { L.rrect(4, 46, 30, 12, P.cream, 2) }, { shadow: P.space })
      text(cv, 7, 49, 'BEARD?', P.dpurple)
      return cv
    },
  }),

  chopchop: make({
    bg: P.lnavy, dk: P.navy, lt: P.lblue,
    obj: chopchop,
    objectExtra(cv) { cv.dither(0, 7, 32, 2, P.yellow, 0, P.lnavy) },
    cast: { draw() {
      const cv = castGround(P.lnavy, P.lblue)
      cv.sticker(L => { L.rect(5, 6, 22, 21, P.brown); L.rect(5, 6, 22, 2, P.lbrown); L.rect(5, 25, 22, 2, P.dbrown); L.rect(5, 6, 2, 21, P.dbrown); L.rect(25, 6, 2, 21, P.dbrown); L.seg(7, 9, 24, 24, 1.5, P.dbrown) }, { shadow: P.navy })
      face(cv, 16, 13, { sp: 3, mood: 'shock' })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.navy], [36, P.lnavy], [50, P.ink2]])
      cv.rect(0, 22, 64, 3, P.coral); cv.rect(0, 22, 64, 1, P.lcoral); cv.dither(0, 25, 64, 2, P.yellow, 0, P.lnavy)
      prop(cv, chopchop, 4, 8, 1.5, P.space, {})
      cv.sticker(L => { L.rect(50, 30, 10, 10, P.brown); L.rect(50, 30, 10, 1, P.lbrown); L.seg(51, 31, 58, 38, 1, P.dbrown); L.seg(58, 31, 51, 38, 1, P.lbrown) }, { shadow: P.space })
      cv.sticker(L => { L.rect(52, 6, 3, 3, P.brown); L.rect(58, 12, 2, 2, P.lbrown); L.rect(46, 14, 2, 2, P.brown) }, {})
      return cv
    },
  }),

  stickyfingers: make({
    bg: P.dgreen, dk: P.ddgreen, lt: P.green,
    obj: stickyfingers,
    objectExtra(cv) { cv.set(25, 27, P.yellow); cv.set(26, 28, P.lyellow) },
    cast: { draw() {
      const cv = castGround(P.dgreen, P.green)
      cv.sticker(L => { L.rrect(5, 8, 22, 15, P.lgreen, 2); L.rect(5, 8, 22, 1, P.lime); L.box(7, 10, 18, 11, P.green); L.rect(5, 22, 22, 1, P.green) }, { shadow: P.ddgreen })
      cv.sticker(L => { L.rrect(9, 20, 14, 9, P.skin, 3); L.rect(9, 26, 14, 3, P.dskin); L.rect(10, 18, 3, 4, P.skin); L.rect(15, 18, 3, 4, P.skin); L.rect(20, 18, 3, 4, P.skin) }, { shadow: P.ddgreen })
      face(cv, 16, 11, { sp: 3, mood: 'grin' })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.ddgreen], [38, P.dgreen], [52, P.ink]])
      prop(cv, stickyfingers, 8, 8, 1.7, P.ink, {})
      cv.sticker(L => { L.disc(52, 14, 5, P.yellow); L.disc(51, 13, 2, P.lyellow); L.disc(52, 14, 5, P.dyellow, (dx, dy) => dx + dy > 5) }, { shadow: P.ink })
      text(cv, 50, 12, '$', P.dyellow)
      return cv
    },
  }),

  fenderbender: make({
    bg: P.dstone, dk: P.ink2, lt: P.stone,
    objectBack(cv) { cv.rect(0, 15, 2, 4, P.yellow); cv.rect(30, 15, 2, 4, P.yellow); for (let y = 1; y < 28; y += 7) cv.rect(15, y, 2, 3, P.lstone) },
    obj: fenderbender,
    cast: { draw() {
      const cv = castGround(P.dstone, P.stone)
      cv.sticker(L => { L.rrect(7, 4, 18, 24, P.red, 5); L.rect(9, 11, 14, 5, P.haze); L.rect(9, 21, 14, 3, P.dred); L.rect(7, 4, 18, 2, P.coral) }, { shadow: P.ink2 })
      face(cv, 16, 17, { sp: 3, mood: 'angry' })
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.dstone)
      cv.dither(0, 0, 64, 64, P.stone, 0, P.dstone)
      cv.rect(0, 0, 4, 64, P.green); cv.rect(60, 0, 4, 64, P.green); cv.rect(4, 0, 1, 64, P.white); cv.rect(59, 0, 1, 64, P.white)
      for (let y = 2; y < 64; y += 12) { cv.rect(31, y, 2, 6, P.yellow) }
      prop(cv, fenderbender, 14, 10, 1.4, P.ink2, {})
      cv.sticker(L => { L.rrect(8, 48, 10, 14, P.green, 3); L.rect(10, 50, 6, 4, P.haze); L.rrect(44, 2, 10, 14, P.orange, 3); L.rect(46, 8, 6, 4, P.haze) }, { shadow: P.ink2 })
      return cv
    },
  }),

  lazysusan: make({
    bg: P.coral, dk: P.dcoral, lt: P.lcoral,
    obj: lazysusan,
    cast: { draw() {
      const cv = castGround(P.coral, P.lcoral)
      cv.sticker(L => { L.disc(16, 16, 12, P.cream); L.disc(16, 16, 12, P.sand, (dx, dy) => dx + dy > 12); L.disc(16, 22, 6, P.white, (dx, dy) => dy > 0.5); L.ellipse(16, 10, 6, 2.4, P.orange) }, { shadow: P.dcoral })
      face(cv, 16, 14, { sp: 3, mood: 'happy', cheek: P.pink })
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.dbrown)
      cv.dither(0, 0, 64, 64, P.brown, 0, P.dbrown)
      cv.sticker(L => { L.rect(0, 52, 64, 12, P.brown) }, {})
      prop(cv, lazysusan, 2, 0, 2, P.dcoral, {})
      cv.sticker(L => { L.rrect(28, 56, 8, 4, P.cream, 1) }, { shadow: P.dbrown })
      cv.sticker(L => { L.disc(6, 8, 3.5, P.skin); L.disc(58, 8, 3.5, P.dskin) }, { shadow: P.dbrown })
      return cv
    },
  }),

  darts: make({
    bg: P.ink2, dk: P.ink, lt: P.slate,
    obj: darts,
    cast: { draw() {
      const cv = castGround(P.ink2, P.slate)
      cv.sticker(L => { const t = T(L, 0, 0, 1); t.disc(16, 16, 12, P.ink); t.disc(16, 16, 10, P.cream); t.disc(16, 16, 7, P.red); t.disc(16, 16, 4.5, P.cream) }, { shadow: P.ink })
      face(cv, 16, 13, { sp: 2, mood: 'grin' })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.ink2], [44, P.dbrown], [52, P.brown]])
      cv.sticker(L => { L.rrect(6, 4, 52, 40, P.brown, 3); L.rect(8, 6, 48, 36, P.dgreen) }, { shadow: P.ink })
      prop(cv, darts, 12, 6, 1.2, P.ddgreen, {})
      cv.sticker(L => { L.seg(46, 38, 54, 30, 1.2, P.cloud); L.poly([[52, 28], [57, 29], [56, 33]], P.coral) }, {})
      cv.rect(20, 56, 24, 2, P.lbrown)
      return cv
    },
  }),

  bamboozle: make({
    bg: P.lgreen, dk: P.green, lt: P.lime,
    objectBack(cv) { cv.dither(0, 26, 32, 3, P.lime, 0) },
    obj: bamboozle,
    cast: { draw() {
      const cv = castGround(P.lgreen, P.lime)
      cv.sticker(L => { L.disc(16, 24, 11, P.stone); L.disc(16, 24, 11, P.dstone, (dx, dy) => dx + dy > 9); L.disc(16, 12, 7, P.skin); L.disc(16, 9, 7.2, P.brown, (dx, dy) => dy < -1.5) }, { shadow: P.green })
      face(cv, 16, 10, { sp: 3, mood: 'worried' })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.haze], [18, P.lime], [28, P.lgreen]])
      cv.dither(0, 40, 64, 24, P.green, 0, P.lgreen)
      prop(cv, bamboozle, 8, 8, 1.7, P.dgreen, {})
      cv.sticker(L => { L.disc(50, 50, 6, P.stone); L.disc(50, 50, 6, P.dstone, (dx, dy) => dx + dy > 4); L.disc(14, 54, 3.5, P.stone) }, { shadow: P.dgreen })
      return cv
    },
  }),

  bonkbuggies: make({
    bg: P.sand, dk: P.lbrown, lt: P.cream,
    objectBack(cv) { cv.dither(0, 24, 32, 3, P.lbrown, 1) },
    obj: bonkbuggies,
    cast: { draw() {
      const cv = castGround(P.sand, P.cream)
      cv.sticker(L => { L.disc(16, 17, 11, P.skin); L.disc(16, 14, 12, P.red, (dx, dy) => dy < -1); L.rect(5, 14, 22, 3, P.dred); L.rect(10, 12, 12, 2, P.lcoral) }, { shadow: P.lbrown })
      face(cv, 16, 17, { sp: 3, mood: 'shock' })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.sky], [18, P.haze], [30, P.sand]])
      cv.dither(0, 40, 64, 24, P.lbrown, 0, P.sand)
      cv.ellipse(32, 56, 28, 6, P.lbrown); cv.ellipse(32, 55, 28, 5, P.sand)
      prop(cv, bonkbuggies, 1, 12, 2, P.dorange, {})
      cv.sticker(L => { L.ellipse(32, 56, 5, 2, P.dorange) }, {})
      return cv
    },
  }),

  firstcut: make({
    bg: P.teal, dk: P.dteal, lt: P.lgreen,
    obj: firstcut,
    cast: { draw() {
      const cv = castGround(P.teal, P.lgreen)
      cv.sticker(L => { L.disc(16, 17, 11, P.red); L.disc(16, 17, 11, P.dred, (dx, dy) => dx + dy > 10); L.ring(16, 17, 11, 2, P.green) }, { shadow: P.dteal })
      face(cv, 16, 14, { sp: 3, mood: 'shock' })
      cv.line(3, 29, 29, 3, P.white)
      return cv
    } },
    scene() {
      const cv = bands([[0, P.dteal], [40, P.teal], [52, P.dgreen]])
      prop(cv, firstcut, 0, 0, 2, P.ink, {})
      cv.sticker(L => { L.disc(8, 50, 4, P.orange); L.disc(52, 52, 4, P.yellow); L.rect(7, 46, 2, 2, P.green) }, { shadow: P.ink })
      return cv
    },
  }),

  quiver: make({
    bg: P.lnavy, dk: P.navy, lt: P.lblue,
    obj: quiver,
    cast: { draw() {
      const cv = castGround(P.lnavy, P.lblue)
      cv.sticker(L => { L.disc(16, 16, 12, P.lbrown); L.disc(16, 16, 10, P.cream); L.disc(16, 16, 7, P.red); L.disc(16, 16, 4, P.cream) }, { shadow: P.navy })
      face(cv, 16, 13, { sp: 2, mood: 'happy' })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.navy], [40, P.lnavy], [52, P.ink2]])
      prop(cv, quiver, 0, 0, 2, P.space, {})
      cv.sticker(L => { L.seg(4, 56, 12, 46, 1.2, P.lbrown); L.seg(12, 46, 14, 44, 2.4, P.coral) }, {})
      return cv
    },
  }),

  sidekick: make({
    bg: P.orange, dk: P.dorange, lt: P.lyellow,
    objectBack(cv) { cv.rect(0, 26, 32, 6, P.ink2); cv.rect(3, 29, 6, 1, P.yellow); cv.rect(14, 29, 6, 1, P.yellow); cv.rect(25, 29, 6, 1, P.yellow) },
    obj: sidekick,
    cast: { draw() {
      const cv = castGround(P.orange, P.lyellow)
      cv.sticker(L => { L.disc(16, 17, 11, P.blue); L.disc(16, 17, 11, P.dblue, (dx, dy) => dx + dy > 10); L.ellipse(16, 15, 9, 6, P.haze) }, { shadow: P.dorange })
      face(cv, 16, 13, { sp: 3, mood: 'grin' })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.coral], [16, P.orange], [30, P.yellow], [40, P.ink2]])
      cv.disc(46, 22, 8, P.lyellow); cv.rect(0, 40, 64, 24, P.ink2); cv.dither(0, 44, 64, 20, P.ink, 0, P.ink2)
      ;[4, 24, 44].forEach(x => cv.rect(x, 54, 12, 2, P.yellow))
      prop(cv, sidekick, 2, 14, 1.8, P.ink, {})
      return cv
    },
  }),
}
