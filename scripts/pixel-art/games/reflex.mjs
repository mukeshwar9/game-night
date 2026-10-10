// Reflex & skill games.
import { Cv, text } from '../px.mjs'
import { P } from '../palette.mjs'
import { make, T, castGround, room, bands, stars, tile, face } from '../kit.mjs'

const up = (t, x, y, c) => { t.rect(x + 2, y + 5, 3, 9, c); t.poly([[x - 1, y + 6], [x + 8, y + 6], [x + 3.5, y]], c) }

export default {
  reaction: make({
    bg: P.yellow, dk: P.dyellow, lt: P.lyellow,
    obj(t) {
      t.rect(13, 2, 6, 3, P.red); t.rect(15, 5, 2, 3, P.gray); t.rect(23, 6, 3, 3, P.red)
      t.disc(16, 17, 10, P.stone); t.disc(16, 17, 8, P.white); t.disc(16, 17, 8, P.cloud, (dx, dy) => dx + dy > 7)
      t.rect(15, 10, 2, 2, P.ink2); t.rect(15, 23, 2, 1, P.ink2); t.rect(9, 16, 1, 2, P.ink2); t.rect(22, 16, 1, 2, P.ink2)
      t.seg(16, 17, 20, 12, 1.3, P.red); t.disc(16, 17, 1.3, P.ink)
    },
    cast: { x: 0, y: 1, face: [16, 16, { sp: 3, mood: 'shock' }] },
    scene() {
      const cv = bands([[0, P.ink], [30, P.ink2]])
      cv.sticker(L => {
        L.poly([[34, 2], [22, 20], [30, 20], [26, 34], [42, 14], [33, 14], [38, 2]], P.yellow)
        L.poly([[34, 2], [30, 8], [33, 8]], P.lyellow)
      }, { shadow: P.dyellow })
      cv.sticker(L => {
        L.rrect(6, 42, 52, 18, P.slate, 3); L.rect(6, 42, 52, 2, P.gray); L.rect(6, 58, 52, 2, P.ink2)
        L.ellipse(32, 46, 14, 5, P.dred); L.ellipse(32, 44, 14, 5, P.red); L.ellipse(28, 42.5, 6, 1.6, P.pink)
      }, { shadow: P.night })
      text(cv, 41, 22, 'GO!', P.lime, 2)
      ;[[16, 30], [48, 30], [12, 38], [52, 38]].forEach(([x, y]) => cv.rect(x, y, 2, 2, P.lyellow))
      return cv
    },
  }),

  aim: make({
    bg: P.red, dk: P.dred, lt: P.lcoral,
    obj(t) {
      t.disc(15, 15, 11, P.white); t.disc(15, 15, 8.5, P.red); t.disc(15, 15, 6, P.white); t.disc(15, 15, 3.5, P.red)
      t.disc(15, 15, 11, P.cloud, (dx, dy) => dx + dy > 13.5 && dx * dx + dy * dy > 72)
      t.seg(17, 13, 27, 3, 1.4, P.ink2); t.poly([[27, 1], [30, 1], [30, 4], [28, 5]], P.yellow)
    },
    cast: { x: 0, y: 1, face: [15, 13, { sp: 4, mood: 'grin' }] },
    scene() {
      const cv = bands([[0, P.navy], [40, P.lnavy], [50, P.ink2]])
      const tgt = (L, x, y, r) => { L.disc(x, y, r, P.white); L.disc(x, y, r * 0.72, P.red); L.disc(x, y, r * 0.45, P.white); L.disc(x, y, r * 0.2, P.red) }
      cv.sticker(L => { tgt(L, 12, 14, 6); tgt(L, 50, 10, 5); tgt(L, 44, 40, 7); tgt(L, 16, 46, 4) }, { shadow: P.space })
      ;[[28, 26]].forEach(([x, y]) => cv.spr(x - 4, y - 4, ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'], { '#': P.yellow }))
      cv.ring(44, 40, 11, 1, P.white); cv.rect(43, 26, 2, 5, P.white); cv.rect(43, 49, 2, 5, P.white); cv.rect(30, 39, 5, 2, P.white); cv.rect(53, 39, 5, 2, P.white)
      return cv
    },
  }),

  typing: make({
    bg: P.ink2, dk: P.ink, lt: P.slate,
    obj(t) {
      t.rrect(1, 12, 30, 14, P.slate, 2); t.rect(2, 12, 28, 1, P.gray)
      ;[3, 8, 13, 18, 23].forEach(x => { t.rect(x, 14, 4, 3, x === 13 ? P.yellow : P.cloud); t.rect(x, 16, 4, 1, x === 13 ? P.dyellow : P.gray) })
      ;[5, 10, 15, 20, 25].forEach(x => { t.rect(x, 18, 4, 3, P.cloud); t.rect(x, 20, 4, 1, P.gray) })
      t.rect(8, 22, 16, 2, P.cloud)
    },
    objectExtra(cv) { cv.sticker(L => tile(L, 12, 2, 'A'), {}); cv.rect(21, 4, 1, 5, P.lime) },
    cast: { draw() {
      const cv = castGround(P.ink2, P.slate)
      cv.sticker(L => { L.rrect(6, 7, 20, 18, P.cloud, 3); L.rrect(8, 8, 16, 13, P.white, 2); L.rect(6, 22, 20, 3, P.gray) }, { shadow: P.ink })
      text(cv, 9, 9, 'A', P.ink2)
      face(cv, 16, 13, { sp: 3, mood: 'happy' })
      return cv
    } },
    scene() {
      const cv = room(P.lnavy, { wall2: P.navy, table: P.brown })
      cv.sticker(L => { L.rrect(4, 3, 56, 36, P.stone, 3); L.rect(7, 6, 50, 30, P.ink); L.rect(28, 39, 8, 4, P.dstone) }, { shadow: P.space })
      text(cv, 9, 8, 'THE QUICK', P.lime); text(cv, 9, 15, 'FOX', P.gray); cv.rect(21, 15, 1, 5, P.lime)
      ;[[24, P.coral], [34, P.teal], [18, P.yellow]].forEach(([w, c], k) => { cv.rect(9, 24 + k * 4, 44, 2, P.ink2); cv.rect(9, 24 + k * 4, w, 2, c) })
      cv.sticker(L => { L.rrect(8, 50, 48, 10, P.slate, 2); for (let i = 0; i < 9; i++) { L.rect(10 + i * 5, 52, 4, 2, P.cloud); L.rect(12 + i * 5, 55, 3, 2, P.cloud) } }, { shadow: P.dbrown })
      return cv
    },
  }),

  math: make({
    bg: P.blue, dk: P.dblue, lt: P.lblue,
    obj(t) {
      t.rrect(6, 2, 20, 24, P.stone, 2); t.rect(24, 3, 2, 22, P.dstone); t.rect(8, 4, 16, 7, P.lime)
      ;[8, 13, 18].forEach(x => [13, 17, 21].forEach(y => { const eq = x === 18 && y === 21; t.rect(x, y, 4, 3, eq ? P.orange : P.cloud); t.rect(x, y + 2, 4, 1, eq ? P.dorange : P.gray) }))
    },
    objectExtra(cv) { text(cv, 16, 5, '42', P.ink) },
    cast: { x: 0, y: 2, face: [16, 7, { sp: 3, mood: 'happy', ink: P.ink }] },
    scene() {
      const cv = room(P.cream, { wall2: P.lcream, table: P.brown })
      cv.sticker(L => { L.rect(3, 4, 58, 40, P.lbrown); L.rect(6, 7, 52, 34, P.dgreen); L.rect(6, 44, 52, 3, P.brown) }, { shadow: P.sand })
      for (let x = 7; x < 57; x += 3) cv.set(x, 20 + (x % 7), P.moss)
      text(cv, 10, 12, '7X8=', P.cream, 2)
      text(cv, 42, 28, '?', P.yellow, 2)
      text(cv, 10, 30, '56', P.lcream)
      cv.rect(30, 45, 6, 1, P.white); cv.rect(40, 45, 4, 1, P.pink)
      return cv
    },
  }),

  arrows: make({
    bg: P.dblue, dk: P.navy, lt: P.blue,
    obj(t) {
      up(t, 4, 7, P.yellow)
      t.rect(14, 7, 9, 3, P.teal); t.poly([[21, 3], [21, 14], [28, 8.5]], P.teal)
      t.rect(21, 15, 3, 6, P.coral); t.poly([[17, 19], [28, 19], [22.5, 26]], P.coral)
    },
    cast: { draw() {
      const cv = castGround(P.dblue, P.blue)
      cv.sticker(L => { const t = T(L, 0, 0, 1); t.rect(12, 13, 8, 13, P.yellow); t.poly([[5, 15], [27, 15], [16, 3]], P.yellow); t.rect(17, 15, 3, 11, P.dyellow) }, { shadow: P.navy })
      face(cv, 16, 16, { sp: 2, mood: 'happy' })
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.navy)
      const dirs = ['>v<^.', 'v.>^<', '^<v.>', '.>^v<', '<v.>^']
      dirs.forEach((row, j) => [...row].forEach((ch, i) => {
        const x = 3 + i * 12, y = 3 + j * 12
        cv.rrect(x, y, 10, 10, ch === '.' ? P.lspace : P.dblue, 1)
        if (ch === '.') return
        const c = { '>': P.teal, '<': P.coral, '^': P.yellow, v: P.lpurple }[ch]
        const A = { '>': [[x + 2, y + 4, 4, 2], [[x + 6, y + 2], [x + 6, y + 8], [x + 9, y + 5]]], '<': [[x + 4, y + 4, 4, 2], [[x + 4, y + 2], [x + 4, y + 8], [x + 1, y + 5]]], '^': [[x + 4, y + 4, 2, 4], [[x + 2, y + 4], [x + 8, y + 4], [x + 5, y + 1]]], v: [[x + 4, y + 2, 2, 4], [[x + 2, y + 6], [x + 8, y + 6], [x + 5, y + 9]]] }[ch]
        cv.rect(...A[0], c); cv.poly(A[1], c)
      }))
      cv.ring(32, 32, 8, 1, P.white)
      return cv
    },
  }),

  updraft: make({
    bg: P.sky, dk: P.sea, lt: P.haze,
    obj(t) {
      t.rrect(2, 21, 11, 4, P.white, 1); t.rect(3, 24, 9, 1, P.cloud)
      t.rrect(15, 14, 11, 4, P.white, 1); t.rect(16, 17, 9, 1, P.cloud)
      t.ball(20, 9, 3.3, P.red, P.pink, P.dred)
      ;[4, 9].forEach(y => { t.seg(4, y + 3, 7, y, 1.3, P.white); t.seg(7, y, 10, y + 3, 1.3, P.white) })
      t.rect(17, 13, 1, 2, P.white); t.rect(20, 14, 1, 2, P.white); t.rect(23, 13, 1, 2, P.white)
    },
    cast: { draw() {
      const cv = castGround(P.sky, P.haze)
      cv.sticker(L => { L.rrect(5, 23, 22, 5, P.white, 2); L.rect(6, 27, 20, 1, P.cloud); L.ball(16, 14, 7.5, P.red, P.pink, P.dred) }, { shadow: P.sea })
      face(cv, 16, 12, { sp: 2, mood: 'grin' })
      ;[[4, 8], [26, 6], [27, 14]].forEach(([x, y]) => cv.rect(x, y, 1, 4, P.white))
      return cv
    } },
    scene() {
      const cv = bands([[0, P.blue], [20, P.sky], [44, P.haze]])
      cv.disc(52, 10, 5, P.lyellow)
      ;[[6, 58, 16], [26, 50, 14], [42, 42, 16], [18, 34, 14], [40, 25, 12], [10, 16, 14], [34, 8, 14]].forEach(([x, y, w]) => cv.sticker(L => { L.rrect(x, y, w, 4, P.white, 1); L.rect(x + 1, y + 3, w - 2, 1, P.cloud) }, { shadow: P.sea }))
      cv.sticker(L => { L.ball(46, 20, 3, P.red, P.pink, P.dred); L.ball(24, 30, 3, P.blue, P.lblue, P.dblue) }, {})
      ;[[55, 30], [55, 36], [4, 40], [4, 46]].forEach(([x, y]) => { cv.seg(x - 3, y + 3, x, y, 1, P.white); cv.seg(x, y, x + 3, y + 3, 1, P.white) })
      return cv
    },
  }),

  tron: make({
    bg: P.night, dk: P.space, lt: P.lspace,
    objectBack(cv) { for (let k = 4; k < 32; k += 7) { cv.rect(k, 0, 1, 27, P.space); cv.rect(0, k, 32, 1, P.space) } },
    obj(t) {
      t.rect(2, 20, 12, 2, P.sky); t.rect(12, 8, 2, 14, P.sky); t.rect(11, 4, 4, 4, P.white)
      t.rect(18, 5, 12, 2, P.orange); t.rect(18, 5, 2, 14, P.orange); t.rect(17, 18, 4, 4, P.lyellow)
    },
    cast: { draw() {
      const cv = castGround(P.night, P.lspace)
      cv.sticker(L => { L.ball(16, 15, 10, P.ink2, P.slate, P.ink); L.ring(16, 15, 10, 1.2, P.sky); L.rrect(8, 12, 16, 7, P.night, 2); L.rect(9, 13, 14, 1, P.sky) }, { shadow: P.space })
      cv.rect(11, 15, 2, 2, P.white); cv.rect(19, 15, 2, 2, P.white)
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.night)
      cv.rect(0, 22, 64, 2, P.lspace); cv.dither(0, 18, 64, 4, P.lspace, 0)
      for (let k = -6; k <= 6; k++) cv.line(32, 24, 32 + k * 14, 64, P.lspace)
      ;[26, 29, 33, 38, 45, 54].forEach(y => cv.rect(0, y, 64, 1, P.lspace))
      cv.dither(4, 44, 30, 4, P.dsea, 0); cv.rect(4, 45, 28, 2, P.sky); cv.rect(30, 30, 2, 17, P.sky); cv.dither(29, 30, 4, 16, P.dsea, 0)
      cv.rect(38, 36, 24, 2, P.orange); cv.rect(38, 36, 2, 20, P.orange)
      cv.sticker(L => { L.rect(28, 26, 6, 5, P.white); L.rect(29, 27, 4, 1, P.sky); L.rect(36, 54, 6, 5, P.lyellow); L.rect(37, 55, 4, 1, P.orange) }, {})
      stars(cv, 14, 31, [P.white, P.sky], P.night)
      return cv
    },
  }),

  sumo: make({
    bg: P.sand, dk: P.lbrown, lt: P.lcream,
    obj(t) {
      t.ellipse(16, 22, 14, 5, P.cream); t.ellipse(16, 22, 12, 3.5, P.sand)
      t.ball(10.5, 15, 6.2, P.red, P.pink, P.dred); t.ball(21.5, 15, 6.2, P.blue, P.lblue, P.dblue)
      t.disc(10.5, 7.5, 2, P.ink2); t.disc(21.5, 7.5, 2, P.ink2)
      t.rect(5, 17, 11, 2, P.dbrown); t.rect(16, 17, 11, 2, P.dbrown)
    },
    cast: { x: 0, y: 2, face: [10, 12, { sp: 2, mood: 'angry' }], extra: L => face(L, 21, 12, { sp: 2, mood: 'shock' }) },
    scene() {
      const cv = bands([[0, P.dbrown], [26, P.brown]])
      for (let x = 2; x < 64; x += 5) cv.rect(x, 4 + (x % 3), 3, 5, [P.red, P.blue, P.yellow, P.white][x % 4])
      cv.sticker(L => { L.ellipse(32, 46, 30, 12, P.sand); L.ellipse(32, 50, 30, 10, P.lbrown, (dx, dy) => dy > 3); L.ellipse(32, 45, 24, 8.5, P.cream); L.ellipse(32, 45, 22, 7, P.sand) }, { shadow: P.dbrown })
      const w = (L, x, y, c, l, d) => { L.ball(x, y, 8, c, l, d); L.disc(x, y - 9, 2.4, P.ink2); L.rect(x - 7, y + 3, 14, 3, P.dbrown) }
      cv.sticker(L => { w(L, 25, 34, P.red, P.pink, P.dred); w(L, 43, 32, P.blue, P.lblue, P.dblue) }, {})
      face(cv, 25, 30, { sp: 2, mood: 'angry' }); face(cv, 43, 28, { sp: 2, mood: 'worried' })
      cv.set(52, 24, P.sky); cv.set(53, 25, P.sky)
      return cv
    },
  }),

  paint: make({
    bg: P.cream, dk: P.sand, lt: P.lcream,
    objectBack(cv) { cv.disc(7, 7, 3.5, P.blue); cv.set(12, 5, P.blue); cv.set(3, 11, P.blue); cv.set(11, 10, P.blue) },
    obj(t) {
      t.rect(2, 15, 12, 10, P.red); t.rect(4, 25, 2, 2, P.red); t.rect(9, 25, 2, 3, P.red)
      t.rrect(13, 13, 6, 14, P.coral, 1); t.rect(13, 14, 1, 12, P.lcoral); t.rect(18, 14, 1, 12, P.dcoral)
      t.seg(19, 20, 25, 20, 1.4, P.ink2); t.seg(25, 20, 25, 9, 1.4, P.ink2); t.rrect(23, 2, 5, 8, P.brown, 1); t.rect(26, 3, 1, 6, P.dbrown)
    },
    cast: { draw() {
      const cv = castGround(P.cream, P.lcream)
      cv.sticker(L => { L.disc(16, 14, 9, P.red); L.disc(8, 20, 3, P.red); L.disc(25, 9, 2.5, P.red); L.rect(12, 21, 3, 6, P.red); L.rect(19, 21, 2, 4, P.red); L.disc(13, 10, 2, P.lcoral) }, { shadow: P.sand })
      face(cv, 16, 13, { sp: 3, mood: 'grin' })
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.lcream)
      const g = ['rrr..bbb', 'rrrr.bbb', 'rrr...bb', 'rr.r..b.', '.rrrb.bb', '..rbbbbb', 'r.rrbbb.', 'rrr..bb.']
      g.forEach((row, j) => [...row].forEach((ch, i) => cv.rect(i * 8, j * 8, 8, 8, ch === 'r' ? P.coral : ch === 'b' ? P.sky : P.lcream)))
      for (let k = 8; k < 64; k += 8) { cv.rect(k, 0, 1, 64, P.cream); cv.rect(0, k, 64, 1, P.cream) }
      cv.sticker(L => { L.ball(20, 36, 5, P.red, P.pink, P.dred); L.ball(44, 20, 5, P.blue, P.lblue, P.dblue) }, {})
      face(cv, 20, 34, { sp: 1, mood: 'happy' }); face(cv, 44, 18, { sp: 1, mood: 'angry' })
      return cv
    },
  }),

  airhockey: make({
    bg: P.tile, dk: P.tiledk, lt: P.white,
    objectBack(cv) { cv.rect(0, 13, 32, 1, P.lcoral); cv.ring(16, 13.5, 6, 1, P.lcoral); for (let y = 2; y < 26; y += 4) for (let x = 2; x < 32; x += 4) cv.set(x, y, P.lstone) },
    obj(t) {
      t.disc(11, 19, 6.5, P.dred); t.disc(11, 18, 6.5, P.red); t.disc(11, 16, 3, P.dred); t.disc(11, 15.5, 2.5, P.red); t.set(10, 14, P.pink)
      t.ellipse(23, 9, 4, 2.2, P.ink); t.ellipse(23, 8, 4, 2.2, P.ink2); t.rect(21, 7, 3, 1, P.slate)
    },
    objectExtra(cv) { cv.rect(26, 11, 4, 1, P.gray); cv.rect(27, 13, 3, 1, P.gray) },
    cast: { x: 3, y: 0, face: [14, 15, { sp: 2, mood: 'grin' }] },
    scene() {
      const cv = new Cv(64, 64, P.tile)
      for (let y = 4; y < 64; y += 5) for (let x = 4; x < 64; x += 5) cv.set(x, y, P.lstone)
      cv.box(0, 0, 64, 64, P.blue); cv.box(1, 1, 62, 62, P.blue); cv.box(2, 2, 60, 60, P.dblue)
      cv.rect(3, 31, 58, 2, P.lcoral); cv.ring(32, 32, 9, 1, P.lcoral); cv.rect(22, 0, 20, 3, P.ink); cv.rect(22, 61, 20, 3, P.ink)
      cv.sticker(L => { L.disc(26, 50, 7, P.dred); L.disc(26, 49, 7, P.red); L.disc(26, 47, 3, P.dred); L.disc(26, 46.5, 2.6, P.red) }, {})
      cv.sticker(L => { L.disc(40, 14, 7, P.dblue); L.disc(40, 13, 7, P.blue); L.disc(40, 11, 3, P.dblue); L.disc(40, 10.5, 2.6, P.lblue) }, {})
      cv.sticker(L => { L.ellipse(36, 30, 4, 3, P.ink); L.ellipse(36, 29, 4, 3, P.ink2) }, {})
      cv.dither(30, 33, 5, 10, P.gray, 0, P.tile)
      return cv
    },
  }),

  artillery: make({
    bg: P.sky, dk: P.green, lt: P.haze,
    objectBack(cv) { cv.rect(0, 23, 32, 9, P.green); cv.dither(0, 23, 32, 2, P.sky, 0); cv.dither(0, 27, 32, 5, P.dgreen, 1) },
    obj(t) {
      t.seg(8, 20, 19, 11, 4.2, P.ink2); t.seg(8, 19, 19, 10, 1.2, P.slate)
      t.ring(8, 21, 4.4, 1.6, P.dbrown); t.seg(5, 21, 11, 21, 1, P.dbrown); t.seg(8, 18, 8, 24, 1, P.dbrown)
      t.rect(28, 12, 1, 12, P.ink2); t.poly([[29, 12], [32, 13.5], [29, 15]], P.red)
    },
    objectExtra(cv) { ;[[21, 8], [23, 6], [25, 5], [27, 6]].forEach(([x, y]) => cv.set(x, y, P.white)) },
    cast: { draw() {
      const cv = castGround(P.sky, P.haze)
      ;[[3, 21], [5, 19], [7, 17]].forEach(([x, y], k) => cv.disc(x, y, 1 + k * 0.6, P.white))
      cv.sticker(L => L.ball(17, 14, 8, P.ink2, P.slate, P.ink), { shadow: P.sea })
      face(cv, 17, 12, { sp: 3, mood: 'grin' })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.blue], [18, P.sky], [36, P.haze]])
      cv.disc(52, 9, 4, P.lyellow)
      cv.sticker(L => { L.ellipse(10, 60, 24, 16, P.green); L.ellipse(56, 62, 22, 18, P.lgreen); L.ellipse(56, 62, 22, 18, P.green, dx => dx > 6) }, { shadow: P.dgreen })
      cv.sticker(L => { L.rrect(4, 40, 12, 5, P.red, 1); L.seg(12, 41, 20, 35, 2.2, P.ink2); L.disc(7, 46, 2, P.ink2); L.disc(13, 46, 2, P.ink2) }, {})
      cv.sticker(L => { L.rrect(48, 42, 12, 5, P.blue, 1); L.seg(51, 43, 44, 38, 2.2, P.ink2); L.disc(51, 48, 2, P.ink2); L.disc(57, 48, 2, P.ink2) }, {})
      for (let k = 0; k <= 10; k++) { const x = 22 + k * 2.4, y = 34 - Math.sin(k / 10 * Math.PI) * 18 + k * 0.4; cv.set(Math.round(x), Math.round(y), P.white) }
      cv.sticker(L => { L.disc(47, 32, 3, P.orange); L.disc(45, 30, 2, P.yellow); L.disc(50, 30, 1.5, P.yellow) }, { outline: null })
      return cv
    },
  }),

  animalstack: make({
    bg: P.lime, dk: P.green, lt: P.lyellow,
    obj(t) {
      t.disc(9, 19, 2.2, P.brown); t.disc(23, 19, 2.2, P.brown); t.rrect(6, 19, 20, 8, P.brown, 2); t.rect(6, 25, 20, 2, P.dbrown); t.ellipse(16, 23.5, 3, 2, P.sand)
      t.disc(12, 12.5, 2.2, P.green); t.disc(20, 12.5, 2.2, P.green); t.rrect(9, 13, 14, 6, P.green, 2); t.rect(9, 17, 14, 2, P.dgreen)
      t.rrect(13, 5, 7, 8, P.yellow, 2); t.rect(13, 11, 7, 2, P.dyellow); t.poly([[20, 8], [23, 9], [20, 10]], P.orange)
    },
    objectExtra(cv) {
      ;[[12, 22], [19, 22], [12, 12], [20, 12], [17, 7]].forEach(([x, y]) => cv.set(x, y, P.ink))
      cv.set(16, 23, P.ink)
    },
    cast: { draw() {
      const cv = castGround(P.lime, P.lyellow)
      cv.sticker(L => { L.disc(8, 8, 3.5, P.brown); L.disc(24, 8, 3.5, P.brown); L.disc(8, 8, 1.6, P.sand); L.disc(24, 8, 1.6, P.sand); L.disc(16, 16, 10, P.brown); L.ellipse(16, 20, 5, 3.5, P.sand); L.rect(14, 18, 4, 2, P.ink) }, { shadow: P.green })
      cv.rect(11, 13, 2, 3, P.ink); cv.rect(19, 13, 2, 3, P.ink); cv.set(11, 13, P.white); cv.set(19, 13, P.white); cv.rect(15, 22, 2, 1, P.dbrown)
      return cv
    } },
    scene() {
      const cv = bands([[0, P.sky], [34, P.haze]])
      cv.sticker(L => { L.rrect(14, 54, 36, 6, P.brown, 1); L.rect(14, 58, 36, 2, P.dbrown) }, { shadow: P.sea })
      const blk = [[18, 46, 28, 8, P.pink, P.magenta], [22, 38, 20, 8, P.brown, P.dbrown], [20, 31, 22, 7, P.green, P.dgreen], [26, 23, 12, 8, P.cloud, P.gray], [27, 16, 10, 7, P.yellow, P.dyellow]]
      cv.sticker(L => blk.forEach(([x, y, w, h, c, d]) => { L.rrect(x, y, w, h, c, 2); L.rect(x, y + h - 2, w, 2, d) }), {})
      blk.forEach(([x, y, w]) => { cv.set(x + 3, y + 2, P.ink); cv.set(x + w - 4, y + 2, P.ink) })
      cv.sticker(L => { L.rrect(46, 8, 10, 8, P.orange, 2); L.rect(46, 14, 10, 2, P.dorange) }, {})
      cv.set(48, 10, P.ink); cv.set(53, 10, P.ink)
      ;[[44, 18], [42, 21], [58, 18]].forEach(([x, y]) => cv.rect(x, y, 2, 1, P.white))
      return cv
    },
  }),

  birdseye: make({
    bg: P.sky, dk: P.green, lt: P.haze,
    objectBack(cv) { cv.rect(0, 25, 32, 7, P.green); cv.dither(0, 25, 32, 2, P.sky, 0); cv.dither(0, 28, 32, 4, P.dgreen, 1) },
    obj(t) {
      t.rect(19, 15, 3, 11, P.brown); t.rect(27, 15, 3, 11, P.brown); t.rect(19, 24, 3, 2, P.dbrown); t.rect(27, 24, 3, 2, P.dbrown)
      t.rect(17, 12, 14, 3, P.lbrown); t.rect(17, 14, 14, 1, P.dbrown)
      t.rect(23, 8, 3, 4, P.orange); t.rect(21, 9, 7, 1, P.dbrown); t.disc(24.5, 6, 2.2, P.sand); t.rect(22, 3, 5, 1, P.dbrown); t.rect(23, 1, 3, 2, P.dbrown)
      t.poly([[4, 14], [0, 11], [0, 16]], P.dbrown)
      t.ellipse(8, 14, 5, 3.4, P.lbrown); t.ellipse(8, 15.5, 3.5, 1.6, P.sand); t.disc(12.5, 12, 2.6, P.lbrown)
      t.poly([[14.5, 11], [18, 12.5], [14.5, 14]], P.orange)
      t.ellipse(6.5, 12.5, 3, 1.5, P.brown)
    },
    objectExtra(cv) {
      cv.set(13, 11, P.ink); cv.set(24, 5, P.ink)
      ;[[2, 21], [5, 19], [8, 20]].forEach(([x, y]) => cv.set(x, y, P.white))
    },
    cast: { draw() {
      const cv = castGround(P.sky, P.haze)
      cv.sticker(L => {
        L.poly([[5, 17], [1, 13], [1, 19]], P.dbrown)
        L.disc(16, 16, 10, P.lbrown); L.ellipse(16, 21, 7, 4, P.sand); L.ellipse(10, 14, 3.5, 5, P.brown)
        L.poly([[24, 14], [30, 17], [24, 20]], P.orange)
      }, { shadow: P.sea })
      face(cv, 19, 12, { sp: 2, mood: 'angry' })
      return cv
    } },
    scene() {
      const cv = bands([[0, P.sky], [30, P.haze]])
      cv.disc(10, 9, 4, P.lyellow)
      cv.sticker(L => { L.ellipse(16, 64, 30, 14, P.green); L.ellipse(58, 62, 24, 12, P.lgreen) }, { shadow: P.dgreen })
      cv.sticker(L => { L.rect(40, 40, 4, 20, P.brown); L.rect(54, 40, 4, 20, P.brown); L.rect(37, 36, 24, 5, P.lbrown); L.rect(37, 39, 24, 2, P.dbrown) }, {})
      cv.sticker(L => { L.rect(46, 26, 5, 10, P.orange); L.rect(42, 28, 13, 2, P.dbrown); L.disc(48.5, 22, 4, P.sand); L.rect(43, 15, 11, 2, P.dbrown); L.rect(45, 11, 7, 5, P.dbrown) }, {})
      cv.set(47, 21, P.ink); cv.set(51, 21, P.ink); cv.rect(47, 24, 4, 1, P.ink)
      cv.sticker(L => { L.rect(5, 44, 3, 16, P.dbrown); L.seg(5, 46, 12, 41, 1.6, P.dbrown); L.seg(8, 46, 12, 41, 1.6, P.dbrown) }, {})
      for (let k = 0; k <= 7; k++) { const x = 8 + k * 2.6, y = 42 - Math.sin(k / 7 * Math.PI) * 10 + k * 0.2; cv.set(Math.round(x), Math.round(y), P.white) }
      cv.sticker(L => {
        L.poly([[22, 28], [17, 24], [17, 32]], P.dbrown)
        L.ellipse(27, 28, 7, 5, P.lbrown); L.ellipse(27, 30, 5, 2.4, P.sand); L.disc(33, 26, 3.6, P.lbrown); L.ellipse(25, 25, 4, 2, P.brown)
        L.poly([[36, 25], [41, 27], [36, 29]], P.orange)
      }, {})
      cv.set(34, 25, P.ink)
      return cv
    },
  }),

  wirecrossed: make({
    bg: P.ink2, dk: P.ink, lt: P.slate,
    obj(t) {
      t.rrect(3, 6, 26, 20, P.stone, 2); t.rect(3, 24, 26, 2, P.dstone); t.rect(27, 7, 2, 17, P.dstone)
      t.rect(6, 9, 11, 7, P.ink); t.ball(23, 12, 3, P.red, P.pink, P.dred)
      t.rect(6, 17, 20, 1, P.yellow); t.rect(6, 19, 20, 1, P.blue); t.rect(6, 21, 8, 1, P.red); t.rect(18, 21, 8, 1, P.red)
      t.set(14, 20, P.red); t.set(17, 22, P.red)
    },
    objectExtra(cv) { text(cv, 8, 10, '07', P.red) },
    cast: { draw() {
      const cv = castGround(P.ink2, P.slate)
      cv.sticker(L => { L.ball(15, 18, 9, P.ink2, P.slate, P.ink); L.rect(13, 7, 5, 3, P.stone); L.seg(16, 7, 21, 3, 1.2, P.sand) }, { shadow: P.ink })
      cv.spr(20, 0, ['.#.', '###', '.#.'], { '#': P.yellow }); cv.set(21, 1, P.white)
      face(cv, 15, 16, { sp: 3, mood: 'worried' })
      return cv
    } },
    scene() {
      const cv = room(P.slate, { wall2: P.ink2, table: P.brown })
      cv.sticker(L => {
        L.rrect(4, 26, 34, 26, P.stone, 3); L.rect(4, 49, 34, 3, P.dstone)
        L.rect(8, 30, 16, 9, P.ink); L.ball(31, 34, 4, P.red, P.pink, P.dred)
        ;[[42, P.yellow], [44.5, P.blue], [47, P.red]].forEach(([y, c]) => L.rect(8, y, 26, 1, c))
      }, { shadow: P.dbrown })
      cv.rect(20, 47, 3, 1, P.dstone); text(cv, 10, 32, '0:07', P.red)
      cv.sticker(L => { L.rect(42, 34, 20, 18, P.cream); L.rect(52, 34, 1, 18, P.sand); for (let y = 37; y < 50; y += 3) { L.rect(44, y, 7, 1, P.gray); L.rect(54, y, 6, 1, P.gray) } }, { shadow: P.dbrown })
      cv.sticker(L => { L.ring(24, 57, 2, 1, P.red); L.ring(29, 57, 2, 1, P.red); L.seg(25, 55, 32, 50, 1, P.gray); L.seg(28, 55, 21, 50, 1, P.gray) }, {})
      return cv
    },
  }),
}

