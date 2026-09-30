// Board games: one object per game, reused by all three styles.
import { Cv, text } from '../px.mjs'
import { P } from '../palette.mjs'
import { make, T, tabletop, room, bands, stars, X4, O4 } from '../kit.mjs'

export default {
  // SIM: colour an edge, don't close a triangle of your colour
  sim: make({
    bg: P.purple, dk: P.dpurple, lt: P.lpurple,
    obj(t) {
      t.seg(16, 6, 5, 23, 2.2, P.red); t.seg(16, 6, 27, 23, 2.2, P.red); t.seg(5, 23, 27, 23, 2.2, P.sky)
      ;[[16, 6], [5, 23], [27, 23]].forEach(([x, y]) => t.ball(x, y, 3, P.cream, P.white, P.sand))
    },
    cast: { x: 0, y: 2, face: [16, 17, { mood: 'worried' }] },
    scene() {
      const cv = bands([[0, P.dpurple], [20, P.purple]])
      stars(cv, 20, 9, [P.lpurple], P.dpurple)
      cv.sticker(L => {
        const n = [[32, 6], [56, 20], [52, 48], [12, 48], [8, 20]]
        const e = [[0, 1, P.red], [1, 2, P.sky], [2, 3, P.red], [3, 4, P.sky], [4, 0, P.red], [0, 2, P.sky], [0, 3, P.red], [1, 4, P.sky]]
        e.forEach(([a, b, c]) => L.seg(n[a][0], n[a][1], n[b][0], n[b][1], 2.4, c))
        L.seg(n[1][0], n[1][1], n[3][0], n[3][1], 1, P.lpurple)
        n.forEach(([x, y]) => L.ball(x, y, 4, P.cream, P.white, P.sand))
      }, { shadow: P.dpurple, sx: 1, sy: 2 })
      return cv
    },
  }),

  // CHOMP: eat the bar, dodge the poison square
  chomp: make({
    bg: P.orange, dk: P.dorange, lt: P.lyellow,
    obj(t) {
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
        if ((i === 3 && j < 2) || (i === 2 && j === 0)) continue
        const x = 3 + i * 7, y = 5 + j * 7, poison = i === 0 && j === 2
        t.rect(x - 1, y - 1, 8, 8, P.dbrown)
        t.rect(x, y, 6, 6, poison ? P.lime : P.brown)
        t.rect(x, y, 6, 1, poison ? P.lyellow : P.lbrown); t.rect(x, y, 1, 6, poison ? P.lyellow : P.lbrown)
        t.rect(x + 1, y + 5, 5, 1, poison ? P.green : P.dbrown); t.rect(x + 5, y + 1, 1, 5, poison ? P.green : P.dbrown)
        if (poison) { t.rect(x + 2, y + 2, 2, 2, P.purple) }
      }
    },
    cast: { x: 0, y: 3, face: [13, 15, { mood: 'grin' }] },
    scene() {
      const cv = room(P.lcream, { wall2: P.cream })
      cv.sticker(L => {
        const t = T(L, 6, 12, 1.6)
        for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
          if ((i === 3 && j < 2) || (i === 2 && j === 0)) continue
          const x = 3 + i * 7, y = 5 + j * 7, poison = i === 0 && j === 2
          t.rect(x - 1, y - 1, 8, 8, P.dbrown)
          t.rect(x, y, 6, 6, poison ? P.lime : P.brown)
          t.rect(x, y, 6, 1, poison ? P.lyellow : P.lbrown); t.rect(x, y, 1, 6, poison ? P.lyellow : P.lbrown)
          if (poison) t.rect(x + 2, y + 2, 2, 2, P.purple)
        }
        L.hole(46, 18, 3); L.hole(41, 12, 2.5); L.hole(49, 26, 2)
      }, { shadow: P.sand, sx: 2, sy: 2 })
      ;[[52, 46], [55, 48], [49, 47]].forEach(([x, y]) => cv.rect(x, y, 2, 2, P.dbrown))
      text(cv, 8, 2, 'NOM', P.dorange, 2)
      return cv
    },
  }),

  // BREAKTHROUGH: race a pawn to the far row
  breakthrough: make({
    bg: P.blue, dk: P.dblue, lt: P.lblue,
    obj(t) {
      for (let i = 0; i < 12; i++) t.rect(4 + i * 2, 2, 2, 2, i % 2 ? P.ink : P.white)
      for (let i = 0; i < 12; i++) t.rect(4 + i * 2, 4, 2, 1, i % 2 ? P.white : P.ink)
      t.rrect(9, 23, 14, 4, P.cream, 1); t.rect(9, 26, 14, 1, P.sand)
      t.poly([[11.5, 24], [20.5, 24], [18, 15], [14, 15]], P.cream)
      t.poly([[17, 24], [20.5, 24], [18, 15], [16.5, 15]], P.sand)
      t.rect(13, 14, 6, 2, P.cream)
      t.disc(16, 11, 3.4, P.cream); t.disc(17, 12, 3.4, P.sand, (dx, dy) => dx + dy > 2.5)
      t.seg(26, 20, 26, 11, 2, P.yellow); t.poly([[22.5, 12.5], [29.5, 12.5], [26, 7.5]], P.yellow)
    },
    cast: { x: -2, y: 2, face: [14, 12, { sp: 2, mood: 'angry' }] },
    scene() {
      const cv = new Cv(64, 64, P.brown)
      cv.sticker(L => {
        for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) L.rect(4 + i * 8, 4 + j * 8, 8, 8, (i + j) % 2 ? P.sand : P.lbrown)
        L.rect(4, 4, 56, 2, P.white); for (let i = 0; i < 14; i++) L.rect(4 + i * 4, 4, 2, 2, P.ink)
      }, { shadow: P.dbrown, sx: 2, sy: 2 })
      const pawn = (L, x, y, c, d) => { L.rrect(x - 3, y + 2, 7, 3, c, 1); L.rect(x - 2, y - 1, 5, 3, c); L.disc(x + 0.5, y - 2.5, 2.2, c); L.rect(x + 1, y - 1, 1, 5, d) }
      cv.sticker(L => {
        ;[[8, 22], [24, 22], [40, 38], [56, 22]].forEach(([x, y]) => pawn(L, x, y, P.ink2, P.ink))
        ;[[8, 46], [24, 46], [48, 54], [56, 46]].forEach(([x, y]) => pawn(L, x, y, P.cream, P.sand))
        pawn(L, 32, 14, P.cream, P.sand)
      }, {})
      cv.seg(32.5, 28, 32.5, 20, 1.2, P.yellow); cv.poly([[30, 21], [35, 21], [32.5, 18]], P.yellow)
      return cv
    },
  }),

  // ATAXX: clone, jump, convert the neighbourhood
  ataxx: make({
    bg: P.teal, dk: P.dteal, lt: P.sky,
    objectBack(cv) { for (let k = 8; k < 32; k += 8) { cv.rect(k, 0, 1, 26, P.dteal); cv.rect(0, k, 32, 1, P.dteal) } },
    obj(t) {
      t.ball(11, 18, 6, P.red, P.pink, P.dred)
      t.ball(23, 9, 4.2, P.red, P.pink, P.dred)
      t.ball(24, 22, 4.5, P.blue, P.lblue, P.dblue)
      t.disc(24, 22, 4.5, P.red, dx => dx < -0.5)
    },
    cast: { x: 0, y: 0, face: [11, 17, { sp: 2, mood: 'grin' }] },
    scene() {
      const cv = new Cv(64, 64, P.dteal)
      const cells = ['r..b..b', '.r.....', 'rr....b', '.......', 'b...rr.', '....rb.', 'b.....r']
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) cv.rect(4 + i * 8, 4 + j * 8, 7, 7, (i + j) % 2 ? P.teal : P.sea)
      cv.sticker(L => cells.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === '.') return
        const cx = 7.5 + i * 8, cy = 7.5 + j * 8
        if (ch === 'r') L.ball(cx, cy, 3, P.red, P.pink, P.dred)
        else L.ball(cx, cy, 3, P.blue, P.lblue, P.dblue)
      })), {})
      cv.ring(39.5, 39.5, 5, 1, P.yellow); cv.ring(15.5, 23.5, 5, 1, P.lyellow)
      return cv
    },
  }),

  // KAMISADO: your landing picks their tower
  kamisado: make({
    bg: P.ink2, dk: P.ink, lt: P.slate,
    obj(t) {
      const cols = [P.orange, P.blue, P.purple, P.pink, P.yellow, P.red, P.green, P.brown]
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) t.rect(4 + i * 6, 2 + j * 6, 6, 6, cols[(i * 3 + j * 5) % 8])
      t.ball(13, 11, 3.2, P.ink2, P.slate, P.ink); t.disc(13, 11, 1.3, P.red)
      t.ball(19, 23, 3.2, P.cream, P.white, P.sand); t.disc(19, 23, 1.3, P.blue)
    },
    cast: { x: 0, y: 2, face: [16, 11, { sp: 4, mood: 'happy' }] },
    scene() {
      const cols = [P.orange, P.blue, P.purple, P.pink, P.yellow, P.red, P.green, P.brown]
      const cv = new Cv(64, 64, P.ink)
      cv.sticker(L => { for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) L.rect(4 + i * 7, 3 + j * 7, 7, 7, cols[(i * 3 + j * 5) % 8]) }, { shadow: P.night })
      cv.sticker(L => {
        ;[[0, 0], [2, 0], [5, 0], [7, 0], [3, 3]].forEach(([i, j], k) => { const x = 7.5 + i * 7, y = 6.5 + j * 7; L.ball(x, y, 2.8, P.ink2, P.slate, P.ink); L.disc(x, y, 1, cols[k * 2 % 8]) })
        ;[[1, 7], [4, 7], [6, 7], [2, 5]].forEach(([i, j], k) => { const x = 7.5 + i * 7, y = 6.5 + j * 7; L.ball(x, y, 2.8, P.cream, P.white, P.sand); L.disc(x, y, 1, cols[(k * 3 + 1) % 8]) })
      }, {})
      cv.seg(21.5, 45, 28.5, 28, 1, P.white); cv.set(28, 27, P.white); cv.set(27, 27, P.white); cv.set(29, 28, P.white)
      return cv
    },
  }),

  // ONITAMA: your card becomes their move
  onitama: make({
    bg: P.green, dk: P.dgreen, lt: P.lgreen,
    obj(t) {
      t.rrect(4, 3, 17, 22, P.cream, 1); t.rect(20, 4, 1, 21, P.sand); t.rect(5, 24, 16, 1, P.sand)
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
        const c = (i === 2 && j === 2) ? P.ink : ((i === 1 && j === 1) || (i === 3 && j === 1) || (i === 2 && j === 4)) ? P.red : P.paper
        t.rect(6 + i * 3, 5 + j * 3, 2, 2, c)
      }
      t.rect(6, 21, 9, 1, P.ink2)
      t.rrect(20, 24, 9, 3, P.red, 1); t.poly([[21, 25], [28, 25], [26, 18], [23, 18]], P.red); t.disc(24.5, 16, 2.6, P.red)
      t.rect(26, 19, 1, 6, P.dred); t.set(23, 15, P.pink)
    },
    cast: { x: 1, y: 2, face: [13, 10, { sp: 3, mood: 'angry' }] },
    scene() {
      const cv = tabletop(8, { wood: P.dgreen, grain: P.ddgreen, fleck: P.green })
      cv.sticker(L => {
        for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) L.rect(12 + i * 8, 10 + j * 8, 7, 7, (i === 2 && j === 0) || (i === 2 && j === 4) ? P.sand : P.paper)
      }, { shadow: P.ddgreen, sx: 2, sy: 2 })
      const pawn = (L, x, y, c, d, big) => { L.rrect(x - 3, y + 1, 7, 3, c, 1); L.disc(x + 0.5, y - 1, big ? 3 : 2.3, c); L.rect(x + 2, y, 1, 3, d) }
      cv.sticker(L => {
        ;[[15, 15], [23, 15], [31, 15, 1], [39, 15], [47, 15]].forEach(([x, y, b]) => pawn(L, x, y, P.red, P.dred, b))
        ;[[15, 47], [31, 31], [39, 47, 1], [47, 47]].forEach(([x, y, b]) => pawn(L, x, y, P.blue, P.dblue, b))
      }, {})
      cv.sticker(L => { L.rrect(44, 38, 17, 22, P.cream, 1); for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) L.rect(46 + i * 3, 40 + j * 3, 2, 2, i === 2 && j === 2 ? P.ink : (i === 0 && j === 1) || (i === 4 && j === 1) ? P.blue : P.paper) }, { shadow: P.ddgreen })
      return cv
    },
  }),

  // QUARTO: four pieces, four traits
  quarto: make({
    bg: P.orange, dk: P.dorange, lt: P.lyellow,
    obj(t) {
      t.rect(3, 9, 7, 17, P.cream); t.rect(8, 9, 2, 17, P.sand); t.ellipse(6, 8.5, 3.5, 1.5, P.lcream); t.ellipse(6, 8.5, 1.8, 0.8, P.sand)
      t.rect(12, 16, 8, 10, P.brown); t.rect(18, 16, 2, 10, P.dbrown); t.rect(12, 15, 8, 2, P.lbrown)
      t.rect(22, 6, 7, 20, P.dbrown); t.rect(27, 6, 2, 20, P.ink2); t.rect(22, 5, 7, 2, P.brown); t.rect(24, 5, 3, 1, P.ink2)
    },
    cast: { x: 0, y: 2, face: [16, 18, { sp: 2, mood: 'happy' }] },
    scene() {
      const cv = tabletop(4)
      cv.sticker(L => { L.disc(32, 34, 27, P.dbrown); L.disc(32, 34, 25, P.lbrown) }, { shadow: P.dbrown, sx: 2, sy: 2 })
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) cv.ring(17.5 + i * 10, 19.5 + j * 10, 4, 1, P.brown)
      cv.sticker(L => {
        L.disc(17.5, 19.5, 3.8, P.cream); L.disc(17.5, 19.5, 1.6, P.sand)
        L.rect(24, 16, 8, 8, P.dbrown); L.rect(25, 17, 6, 6, P.brown)
        L.disc(37.5, 29.5, 3.8, P.dbrown)
        L.rect(44, 36, 8, 8, P.cream); L.rect(46, 38, 4, 4, P.sand)
        L.disc(27.5, 39.5, 2.8, P.cream)
      }, {})
      return cv
    },
  }),

  // SANTORINI: climb the island, build their grave
  santorini: make({
    bg: P.sky, dk: P.sea, lt: P.haze,
    obj(t) {
      t.rect(5, 21, 22, 6, P.white); t.rect(5, 26, 22, 1, P.cloud); t.rect(24, 21, 3, 6, P.cloud)
      t.rect(8, 15, 16, 6, P.white); t.rect(21, 15, 3, 6, P.cloud); t.rect(8, 20, 16, 1, P.lstone)
      t.rect(11, 10, 10, 5, P.white); t.rect(18, 10, 3, 5, P.cloud)
      t.disc(16, 10, 4.8, P.blue, (dx, dy) => dy <= 0); t.set(14, 7, P.lblue)
      t.rect(4, 17, 3, 4, P.coral); t.disc(5.5, 15, 1.6, P.coral)
    },
    cast: { x: 0, y: 2, face: [16, 17, { sp: 3, mood: 'happy' }] },
    scene() {
      const cv = bands([[0, P.sky], [30, P.haze], [40, P.sea]])
      cv.dither(0, 40, 64, 24, P.dsea, 1)
      cv.ellipse(50, 8, 5, 5, P.lyellow)
      cv.sticker(L => {
        L.ellipse(32, 50, 30, 10, P.sand); L.ellipse(32, 52, 30, 8, P.lbrown, (dx, dy) => dy > 2)
        const t = T(L, 8, 8, 1.4)
        t.rect(5, 21, 22, 6, P.white); t.rect(24, 21, 3, 6, P.cloud)
        t.rect(8, 15, 16, 6, P.white); t.rect(21, 15, 3, 6, P.cloud)
        t.rect(11, 10, 10, 5, P.white); t.rect(18, 10, 3, 5, P.cloud)
        t.disc(16, 10, 4.8, P.blue, (dx, dy) => dy <= 0)
        L.rect(6, 36, 8, 6, P.white); L.rect(50, 38, 8, 5, P.white); L.rect(52, 34, 5, 4, P.white)
      }, { shadow: P.dsea })
      cv.sticker(L => { L.rect(40, 26, 3, 5, P.coral); L.disc(41.5, 24, 1.8, P.coral); L.rect(12, 30, 3, 5, P.blue); L.disc(13.5, 28, 1.8, P.blue) }, {})
      return cv
    },
  }),

  // LINES OF ACTION: unite all your pieces
  loa: make({
    bg: P.dred, dk: P.ink2, lt: P.red,
    obj(t) {
      t.seg(6, 23, 25, 5, 1.4, P.cream)
      ;[[6, 23], [12.5, 17], [19, 11], [25, 5]].forEach(([x, y]) => t.ball(x, y, 3.2, P.yellow, P.lyellow, P.dyellow))
      t.ball(24, 21, 3.2, P.ink2, P.slate, P.ink)
    },
    cast: { x: 0, y: 2, face: [16, 13, { sp: 3, mood: 'happy' }], s: 1 },
    scene() {
      const cv = new Cv(64, 64, P.dred)
      cv.sticker(L => { for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) L.rect(4 + i * 7, 3 + j * 7, 7, 7, (i + j) % 2 ? P.sand : P.cream) }, { shadow: P.ink2, sx: 2, sy: 2 })
      const yel = [[2, 1], [3, 2], [3, 3], [4, 4], [5, 4], [4, 5]]
      cv.seg(7.5 + 2 * 7, 6.5 + 7, 7.5 + 4 * 7, 6.5 + 5 * 7, 1, P.dyellow)
      cv.sticker(L => {
        yel.forEach(([i, j]) => L.ball(7.5 + i * 7, 6.5 + j * 7, 2.8, P.yellow, P.lyellow, P.dyellow))
        ;[[0, 3], [7, 1], [1, 6], [6, 6], [6, 2]].forEach(([i, j]) => L.ball(7.5 + i * 7, 6.5 + j * 7, 2.8, P.ink2, P.slate, P.ink))
      }, {})
      return cv
    },
  }),

  // YAVALATH: four in a row wins, three in a row loses
  yavalath: make({
    bg: P.slate, dk: P.ink2, lt: P.gray,
    obj(t) {
      t.poly([[16, 2], [28, 8.5], [28, 21.5], [16, 28], [4, 21.5], [4, 8.5]], P.lstone)
      t.poly([[16, 28], [28, 21.5], [28, 20], [16, 26.5], [4, 20], [4, 21.5]], P.stone)
      ;[8, 13, 18, 23].forEach(x => t.ball(x + 0.5, 12.5, 2.4, P.yellow, P.lyellow, P.dyellow))
      ;[11, 16, 21].forEach(x => t.ball(x, 19.5, 2.4, P.red, P.pink, P.dred))
    },
    cast: { x: 0, y: 1, face: [16, 5, { sp: 2, mood: 'shock' }] },
    scene() {
      const cv = new Cv(64, 64, P.ink2)
      const hex = (L, cx, cy, c) => L.poly([[cx, cy - 4.5], [cx + 4, cy - 2.2], [cx + 4, cy + 2.2], [cx, cy + 4.5], [cx - 4, cy + 2.2], [cx - 4, cy - 2.2]], c)
      cv.sticker(L => {
        for (let r = -3; r <= 3; r++) {
          const n = 7 - Math.abs(r)
          for (let i = 0; i < n; i++) {
            const cx = 32 - (n - 1) * 4.5 + i * 9, cy = 32 + r * 7.5
            hex(L, cx, cy, P.lstone)
          }
        }
      }, { outline: P.ink, shadow: P.ink, sx: 1, sy: 2 })
      const at = (r, i) => { const n = 7 - Math.abs(r); return [32 - (n - 1) * 4.5 + i * 9, 32 + r * 7.5] }
      cv.sticker(L => {
        ;[[0, 1], [0, 2], [0, 3], [0, 4]].forEach(([r, i]) => { const [x, y] = at(r, i); L.ball(x, y, 3, P.yellow, P.lyellow, P.dyellow) })
        ;[[-2, 1], [-2, 2], [2, 3], [1, 0]].forEach(([r, i]) => { const [x, y] = at(r, i); L.ball(x, y, 3, P.red, P.pink, P.dred) })
      }, {})
      const [x0, y0] = at(0, 1), [x1] = at(0, 4)
      cv.rect(Math.round(x0), Math.round(y0) + 5, Math.round(x1 - x0) + 1, 1, P.yellow)
      return cv
    },
  }),

  // DOTS & BOXES: claim the most boxes
  dotsandboxes: make({
    bg: P.cream, dk: P.sand, lt: P.lcream,
    obj(t) {
      t.rect(5, 4, 7, 7, P.lcoral)
      t.seg(5, 4, 12, 4, 1.6, P.coral); t.seg(5, 4, 5, 11, 1.6, P.coral); t.seg(12, 4, 12, 11, 1.6, P.coral); t.seg(5, 11, 12, 11, 1.6, P.coral)
      t.seg(12, 11, 19, 11, 1.6, P.teal); t.seg(19, 11, 19, 18, 1.6, P.teal); t.seg(26, 4, 26, 11, 1.6, P.teal); t.seg(12, 18, 12, 25, 1.6, P.coral)
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) t.rect(4 + i * 7, 3 + j * 7, 2, 2, P.ink2)
    },
    cast: { x: 0, y: 1, face: [9, 7, { sp: 1, mood: 'happy' }] },
    scene() {
      const cv = tabletop(5)
      cv.sticker(L => { L.rect(6, 5, 52, 54, P.lcream) }, { shadow: P.dbrown, sx: 2, sy: 2 })
      const g = i => 10 + i * 9
      const owned = { '0,0': 'c', '1,0': 'c', '0,1': 't', '3,2': 't', '2,3': 'c' }
      for (const [k, v] of Object.entries(owned)) { const [i, j] = k.split(',').map(Number); cv.rect(g(i) + 1, g(j) + 1, 8, 8, v === 'c' ? P.lcoral : P.sky) }
      const E = [[0, 0, 1, 0, 'c'], [1, 0, 2, 0, 'c'], [0, 0, 0, 1, 'c'], [2, 0, 2, 1, 'c'], [0, 1, 1, 1, 'c'], [1, 1, 2, 1, 'c'], [1, 0, 1, 1, 'c'], [0, 1, 0, 2, 't'], [1, 1, 1, 2, 't'], [0, 2, 1, 2, 't'],
        [3, 2, 4, 2, 't'], [3, 3, 4, 3, 't'], [3, 2, 3, 3, 't'], [4, 2, 4, 3, 't'], [2, 3, 3, 3, 'c'], [2, 4, 3, 4, 'c'], [2, 3, 2, 4, 'c'], [3, 3, 3, 4, 'c'], [4, 0, 5, 0, 't'], [5, 4, 5, 5, 'c'], [0, 4, 0, 5, 't']]
      E.forEach(([a, b, c, d, o]) => cv.seg(g(a), g(b), g(c), g(d), 2.2, o === 'c' ? P.coral : P.teal))
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) cv.rect(g(i) - 1, g(j) - 1, 2, 2, P.ink2)
      return cv
    },
  }),

  // SOS: spell the most S-O-S
  sos: make({
    bg: P.coral, dk: P.dcoral, lt: P.lcoral,
    obj(t) {
      ;[2, 12, 22].forEach(x => { t.rrect(x, 7, 9, 12, P.cream, 1); t.rect(x + 1, 18, 7, 1, P.sand) })
      t.rect(3, 22, 27, 2, P.yellow)
    },
    objectExtra(cv) {
      const S = ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], O = ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.']
      cv.spr(4, 9, S, { '#': P.ink }); cv.spr(14, 9, O, { '#': P.ink }); cv.spr(24, 9, S, { '#': P.ink })
    },
    cast: { draw() {
      const cv = make({ bg: P.coral, dk: P.dcoral, lt: P.lcoral, obj: () => {}, scene: () => null }).cast()
      cv.sticker(L => { L.rrect(9, 7, 14, 17, P.cream, 2); L.rect(10, 23, 12, 1, P.sand) }, { shadow: P.dcoral })
      cv.spr(11, 9, ['.#####.', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '.#####.'], { '#': P.ink })
      cv.rect(13, 13, 2, 3, P.white); cv.rect(17, 13, 2, 3, P.white); cv.rect(14, 14, 1, 2, P.ink); cv.rect(17, 14, 1, 2, P.ink); cv.rect(15, 17, 2, 2, P.ink)
      return cv
    } },
    scene() {
      const cv = tabletop(6)
      cv.sticker(L => { L.rect(4, 4, 56, 56, P.cream); for (let k = 1; k < 7; k++) { L.rect(4 + k * 8, 4, 1, 56, P.sand); L.rect(4, 4 + k * 8, 56, 1, P.sand) } }, { shadow: P.dbrown, sx: 2, sy: 2 })
      const grid = ['S.O..S.', '.SOS...', '..O.S..', 'O..S.O.', '.S.O.S.', 'S..S..O', '..O..S.']
      grid.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') text(cv, 7 + i * 8, 6 + j * 8, ch, (i + j) % 3 ? P.ink : P.dcoral) }))
      cv.seg(13.5, 17.5, 37.5, 17.5, 1.2, P.coral); cv.seg(21.5, 9.5, 21.5, 33.5, 1.2, P.teal)
      return cv
    },
  }),

  // GOMOKU: five in a row (stones carry their own rim; a shared outline would fuse them)
  gomoku: (() => {
    const blk = (cv, x, y, r = 2.2) => { cv.disc(x, y, r + 0.8, P.ink); cv.ball(x, y, r, P.ink2, P.slate, P.ink2) }
    const wht = (cv, x, y, r = 2.2) => { cv.disc(x, y, r + 0.8, P.ink2); cv.ball(x, y, r, P.white, null, P.cloud) }
    const board = (cv, x0, y0, n, step, c) => { for (let k = 0; k < n; k++) { cv.rect(x0 + k * step, y0, 1, (n - 1) * step + 1, c); cv.rect(x0, y0 + k * step, (n - 1) * step + 1, 1, c) } }
    const def = make({ bg: P.sand, dk: P.lbrown, lt: P.lcream, obj: () => {}, scene: () => null })
    return {
      object() {
        const cv = def.object()
        board(cv, 3, 2, 6, 5, P.lbrown)
        ;[3, 8, 13, 18, 23].forEach(x => blk(cv, x, 12))
        ;[[8, 22], [13, 17], [23, 7], [18, 22]].forEach(([x, y]) => wht(cv, x, y))
        return cv
      },
      cast() {
        const cv = def.cast()
        cv.sticker(L => { L.ball(16, 16, 9, P.ink2, P.slate, P.ink) }, { shadow: P.lbrown })
        cv.sticker(L => { L.ball(25, 8, 4, P.white, null, P.cloud) }, { shadow: P.lbrown })
        cv.rect(11, 13, 2, 3, P.white); cv.rect(19, 13, 2, 3, P.white); cv.rect(12, 14, 1, 2, P.ink); cv.rect(19, 14, 1, 2, P.ink); cv.rect(14, 19, 4, 1, P.white)
        return cv
      },
      scene() {
        const cv = tabletop(9, { wood: P.sand, grain: P.lbrown, fleck: P.lcream })
        board(cv, 4, 4, 12, 5, P.lbrown)
        ;[[14, 14], [19, 19], [24, 24], [29, 29], [34, 34]].forEach(([x, y]) => blk(cv, x, y))
        ;[[19, 14], [29, 24], [39, 34], [24, 39], [44, 24], [14, 44], [39, 49], [34, 19]].forEach(([x, y]) => wht(cv, x, y))
        ;[[39, 39], [49, 14], [19, 49], [9, 29]].forEach(([x, y]) => blk(cv, x, y))
        cv.seg(12, 12, 36, 36, 1, P.red)
        return cv
      },
    }
  })(),

  // REVERSI: flip the board your way
  reversi: make({
    bg: P.green, dk: P.dgreen, lt: P.lgreen,
    objectBack(cv) { for (let k = 8; k < 32; k += 8) { cv.rect(k, 0, 1, 27, P.dgreen); cv.rect(0, k - 2, 32, 1, P.dgreen) } },
    obj(t) {
      t.ball(12, 10, 4.5, P.white, null, P.cloud); t.ball(20, 10, 4.5, P.ink2, P.slate, P.ink)
      t.ball(12, 18, 4.5, P.ink2, P.slate, P.ink); t.ball(20, 18, 4.5, P.white, null, P.cloud)
    },
    cast: { x: 0, y: 2, face: [16, 13, { sp: 4, mood: 'happy' }] },
    scene() {
      const cv = new Cv(64, 64, P.felt)
      cv.box(1, 1, 62, 62, P.dbrown); cv.box(0, 0, 64, 64, P.brown); cv.box(2, 2, 60, 60, P.ddgreen)
      for (let k = 2; k < 64; k += 7.5) { cv.rect(Math.round(k), 2, 1, 60, P.dgreen); cv.rect(2, Math.round(k), 60, 1, P.dgreen) }
      const b = ['........', '...w....', '..bwb...', '..wwwb..', '...bw...', '....b...', '........', '........']
      cv.sticker(L => b.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === '.') return
        const x = 5.5 + i * 7.5, y = 5.5 + j * 7.5
        if (ch === 'w') L.ball(x, y, 3, P.white, null, P.cloud); else L.ball(x, y, 3, P.ink2, P.slate, P.ink)
      })), {})
      cv.sticker(L => { L.ellipse(43, 20.5, 3.3, 1.2, P.white); L.ellipse(43, 21.5, 3.3, 1, P.ink2) }, {})
      return cv
    },
  }),

  // CHAIN REACTION: trigger chain explosions
  chainreaction: make({
    bg: P.ink2, dk: P.ink, lt: P.slate,
    obj(t) {
      for (let a = 0; a < 8; a++) { const ux = Math.cos(a * Math.PI / 4), uy = Math.sin(a * Math.PI / 4); t.seg(16 + ux * 10, 15 + uy * 10, 16 + ux * 13, 15 + uy * 13, 1.4, P.yellow) }
      t.ball(12.5, 17.5, 4, P.red, P.pink, P.dred); t.ball(19.5, 17.5, 4, P.red, P.pink, P.dred); t.ball(16, 11.5, 4, P.red, P.pink, P.dred)
    },
    cast: { x: 0, y: 1, face: [16, 10, { sp: 2, mood: 'shock' }] },
    scene() {
      const cv = new Cv(64, 64, P.ink)
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) cv.box(2 + i * 10, 2 + j * 10, 10, 10, P.slate)
      const orb = (L, x, y, n, c, l, d) => {
        const pos = n === 1 ? [[0, 0]] : n === 2 ? [[-1.8, 0], [1.8, 0]] : [[-1.8, -1], [1.8, -1], [0, 1.8]]
        pos.forEach(([dx, dy]) => L.ball(x + dx, y + dy, 2.2, c, l, d))
      }
      const cells = { '0,0': [1, 'r'], '1,0': [2, 'r'], '4,1': [2, 'b'], '2,2': [3, 'r'], '5,3': [1, 'b'], '1,4': [2, 'b'], '3,4': [1, 'r'], '4,5': [3, 'b'], '0,5': [1, 'r'] }
      cv.sticker(L => Object.entries(cells).forEach(([k, [n, c]]) => { const [i, j] = k.split(',').map(Number); orb(L, 7 + i * 10, 7 + j * 10, n, c === 'r' ? P.red : P.blue, c === 'r' ? P.pink : P.lblue, c === 'r' ? P.dred : P.dblue) }), {})
      ;[[37, 27], [27, 37], [37, 37], [27, 27]].forEach(([x, y]) => cv.spr(x - 2, y - 2, ['..#..', '.#.#.', '#.#.#', '.#.#.', '..#..'], { '#': P.yellow }))
      cv.sticker(L => { L.ball(32, 32, 3, P.red, P.pink, P.dred); L.ball(38, 24, 2, P.red, P.pink, P.dred); L.ball(26, 40, 2, P.red, P.pink, P.dred) }, {})
      return cv
    },
  }),

  // BLOCKADE: race across, wall them off
  blockade: make({
    bg: P.orange, dk: P.dorange, lt: P.lyellow,
    objectBack(cv) { for (let k = 8; k < 32; k += 8) { cv.rect(k, 0, 1, 27, P.dorange); cv.rect(0, k - 1, 32, 1, P.dorange) } },
    obj(t) {
      t.rect(3, 13, 14, 3, P.cream); t.rect(3, 15, 14, 1, P.sand)
      t.rect(19, 3, 3, 16, P.cream); t.rect(21, 3, 1, 16, P.sand)
      t.ball(10, 21, 4.2, P.red, P.pink, P.dred); t.ball(26, 9, 3.8, P.blue, P.lblue, P.dblue)
    },
    cast: { x: 0, y: 0, face: [10, 19, { sp: 2, mood: 'angry' }] },
    scene() {
      const cv = new Cv(64, 64, P.dbrown)
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) cv.rect(3 + i * 8.5, 3 + j * 8.5, 7, 7, P.lbrown)
      cv.sticker(L => {
        L.rect(10, 18, 16, 2, P.cream); L.rect(27, 26, 2, 16, P.cream); L.rect(36, 10, 16, 2, P.cream); L.rect(44, 44, 16, 2, P.cream); L.rect(18, 44, 2, 16, P.cream)
      }, {})
      cv.sticker(L => { L.ball(15, 32, 3.2, P.red, P.pink, P.dred); L.ball(49, 24, 3.2, P.blue, P.lblue, P.dblue); L.ball(40, 50, 3.2, P.red, P.pink, P.dred); L.ball(23, 6, 3.2, P.blue, P.lblue, P.dblue) }, {})
      cv.set(15, 38, P.yellow); cv.set(15, 40, P.yellow); cv.set(15, 42, P.yellow)
      return cv
    },
  }),

  // ORDER & CHAOS: order builds five, chaos blocks
  orderchaos: make({
    bg: P.ink2, dk: P.ink, lt: P.slate,
    obj(t) {
      for (let i = 0; i < 5; i++) { t.rect(1 + i * 6, 9, 6, 7, P.slate); t.rect(1 + i * 6, 15, 6, 1, P.ink) }
      t.rect(1, 19, 24, 2, P.yellow)
    },
    objectExtra(cv) { [0, 1, 2, 3].forEach(i => cv.spr(2 + i * 6, 10, X4, { '#': P.cream })); cv.spr(26, 10, O4, { '#': P.coral }) },
    cast: { draw() {
      const cv = make({ bg: P.ink2, dk: P.ink, lt: P.slate, obj: () => {}, scene: () => null }).cast()
      cv.sticker(L => { L.seg(6, 7, 14, 17, 3.5, P.cream); L.seg(14, 7, 6, 17, 3.5, P.cream); L.ring(22, 17, 5.5, 2.8, P.coral) }, { shadow: P.ink })
      cv.rect(8, 11, 1, 1, P.ink); cv.rect(11, 11, 1, 1, P.ink); cv.rect(20, 14, 1, 1, P.ink); cv.rect(23, 14, 1, 1, P.ink); cv.rect(21, 20, 2, 1, P.ink)
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.ink)
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { cv.rect(3 + i * 10, 3 + j * 10, 9, 9, P.ink2); cv.rect(3 + i * 10, 11 + j * 10, 9, 1, P.night) }
      const g = ['X.O..X', '.XO.O.', 'O.X...', '..OX.O', 'X..OX.', '.O...X']
      g.forEach((row, j) => [...row].forEach((ch, i) => {
        const x = 3 + i * 10, y = 3 + j * 10
        if (ch === 'X') { cv.seg(x + 2, y + 2, x + 6, y + 6, 1.6, P.cream); cv.seg(x + 6, y + 2, x + 2, y + 6, 1.6, P.cream) }
        if (ch === 'O') cv.ring(x + 4, y + 4, 3, 1.3, P.coral)
      }))
      cv.seg(4, 4, 60, 60, 1, P.yellow)
      return cv
    },
  }),

  // HEX: connect your two edges
  hex: make({
    bg: P.blue, dk: P.dblue, lt: P.lblue,
    obj(t) {
      const H = (x, y, c) => t.poly([[x + 3.5, y], [x + 7, y + 2], [x + 7, y + 6], [x + 3.5, y + 8], [x, y + 6], [x, y + 2]], c)
      const cells = [[8, 3, 0], [16, 3, 1], [4, 9, 0], [12, 9, 1], [20, 9, 0], [8, 15, 1], [16, 15, 0], [12, 21, 0]]
      cells.forEach(([x, y, on]) => { H(x - 0.5, y - 0.5, P.ink2); H(x, y, on ? P.red : P.cloud) })
      t.rect(1, 27, 30, 1, P.red); t.rect(1, 1, 30, 1, P.red)
    },
    cast: { x: 0, y: 1, face: [16, 11, { sp: 2, mood: 'happy' }] },
    scene() {
      const cv = new Cv(64, 64, P.dblue)
      const H = (L, x, y, c) => L.poly([[x + 3.5, y], [x + 7, y + 2], [x + 7, y + 6], [x + 3.5, y + 8], [x, y + 6], [x, y + 2]], c)
      const path = new Set(['0,1', '1,1', '1,2', '2,2', '3,3', '4,3', '4,4', '5,4'])
      const blue = new Set(['2,0', '3,1', '2,1', '3,2', '1,4', '0,5', '1,5'])
      cv.sticker(L => {
        for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
          const x = 3 + i * 7 + j * 3.5, y = 10 + j * 6
          H(L, x - 0.5, y - 0.5, P.ink2)
          H(L, x, y, path.has(`${i},${j}`) ? P.red : blue.has(`${i},${j}`) ? P.sky : P.cloud)
        }
      }, { shadow: P.navy })
      cv.rect(0, 0, 64, 1, P.red); cv.rect(0, 63, 64, 1, P.red); cv.rect(0, 0, 1, 64, P.sky); cv.rect(63, 0, 1, 64, P.sky)
      return cv
    },
  }),

  // MANCALA: sow & capture
  mancala: make({
    bg: P.teal, dk: P.dteal, lt: P.sky,
    obj(t) {
      t.rrect(2, 8, 28, 17, P.brown, 4); t.rect(4, 8, 24, 1, P.lbrown); t.rect(4, 24, 24, 1, P.dbrown)
      t.ellipse(6, 16.5, 2.2, 6, P.dbrown); t.ellipse(26, 16.5, 2.2, 6, P.dbrown)
      ;[11, 16, 21].forEach(x => [12.5, 20.5].forEach(y => t.ellipse(x, y, 2.1, 2.1, P.dbrown)))
      ;[[11, 12, P.red], [16, 20, P.yellow], [21, 12, P.sky], [26, 14, P.lime], [26, 18, P.red], [6, 17, P.yellow], [21, 21, P.pink], [11, 21, P.lime]].forEach(([x, y, c]) => t.set(x, y, c))
    },
    cast: { x: 0, y: 1, face: [16, 14, { sp: 5, mood: 'happy' }] },
    scene() {
      const cv = tabletop(10)
      const cols = [P.red, P.yellow, P.sky, P.lime, P.pink, P.white]
      cv.sticker(L => {
        L.rrect(3, 14, 58, 36, P.lbrown, 8); L.rect(8, 14, 48, 1, P.sand); L.rect(8, 49, 48, 1, P.dbrown)
        L.ellipse(10, 32, 4, 12, P.dbrown); L.ellipse(54, 32, 4, 12, P.dbrown)
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) L.ellipse(21 + i * 7.3, 24 + j * 16, 3.2, 4, P.dbrown)
      }, { shadow: P.dbrown, sx: 2, sy: 2 })
      const r = [[20, 23], [22, 25], [28, 24], [36, 22], [35, 25], [43, 24], [21, 40], [28, 41], [29, 38], [43, 40], [9, 28], [10, 33], [11, 36], [54, 27], [53, 31], [55, 35], [54, 38]]
      r.forEach(([x, y], k) => cv.rect(x, y, 2, 2, cols[k % cols.length]))
      return cv
    },
  }),

  // CHECKERS: jumps forced, kings crown
  checkers: make({
    bg: P.red, dk: P.dred, lt: P.lcoral,
    objectBack(cv) { for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) cv.rect(4 + i * 6, 1 + j * 6, 6, 6, (i + j) % 2 ? P.ink2 : P.cream) },
    obj(t) {
      t.ellipse(16, 20, 8, 4, P.dred); t.ellipse(16, 18.5, 8, 4, P.red)
      t.ellipse(16, 15, 8, 4, P.dred); t.ellipse(16, 13.5, 8, 4, P.red); t.ellipse(16, 13.5, 5.5, 2.5, P.coral)
      t.poly([[12, 13], [13, 9], [14.5, 11], [16, 8], [17.5, 11], [19, 9], [20, 13]], P.yellow)
    },
    cast: { x: 0, y: 2, face: [16, 17, { sp: 3, mood: 'happy', eye: P.white }] },
    scene() {
      const cv = new Cv(64, 64, P.dbrown)
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) cv.rect(i * 8, j * 8, 8, 8, (i + j) % 2 ? P.ink2 : P.cream)
      const piece = (L, x, y, c, d, l, king) => { L.ellipse(x, y + 1, 3.2, 2, d); L.ellipse(x, y, 3.2, 2, c); L.ellipse(x, y - 0.3, 2, 1, l); if (king) L.poly([[x - 2, y - 1], [x - 1.5, y - 3.5], [x, y - 2], [x + 1.5, y - 3.5], [x + 2, y - 1]], P.yellow) }
      cv.sticker(L => {
        ;[[1, 0], [5, 0], [7, 0], [2, 1], [6, 1], [1, 2], [3, 2]].forEach(([i, j]) => piece(L, i * 8 + 3.5, j * 8 + 4, P.ink2, P.ink, P.slate))
        ;[[0, 7], [2, 7], [6, 7], [1, 6], [5, 6], [4, 5], [6, 5], [3, 4]].forEach(([i, j], k) => piece(L, i * 8 + 3.5, j * 8 + 4, P.red, P.dred, P.coral, k === 7))
      }, {})
      cv.seg(27.5, 36, 43.5, 20, 1, P.yellow); cv.poly([[41, 19], [45, 19], [44, 23]], P.yellow)
      return cv
    },
  }),

  // LANTERNS: see their cards, never yours
  lanterns: make({
    bg: P.night, dk: P.space, lt: P.lspace,
    objectBack(cv) { cv.disc(16, 14, 11, P.lspace, (dx, dy) => (Math.round(dx) + Math.round(dy)) % 2 === 0); cv.rect(15, 0, 1, 4, P.gray) },
    obj(t) {
      t.rect(12, 3, 8, 2, P.ink2)
      t.ellipse(16, 14, 8, 8, P.red)
      t.ellipse(16, 14, 8, 8, P.dred, dx => dx > 4)
      t.ellipse(16, 14, 8, 8, P.orange, dx => dx < -4.5)
      ;[12, 16, 20].forEach(x => t.rect(x, 7, 1, 14, P.dred))
      t.rect(12, 22, 8, 2, P.ink2); t.rect(15, 24, 2, 4, P.yellow); t.rect(14, 27, 4, 1, P.yellow)
    },
    cast: { x: 0, y: 1, face: [16, 13, { sp: 3, mood: 'happy', cheek: P.pink }] },
    scene() {
      const cv = bands([[0, P.night], [36, P.space], [50, P.navy]])
      stars(cv, 26, 21, [P.white, P.lyellow], P.night)
      cv.seg(-2, 12, 66, 18, 1, P.gray)
      const lan = (L, x, y, c, d, r = 5) => { L.rect(x - 2, y - r - 1, 5, 1, P.ink2); L.ellipse(x, y, r, r + 0.5, c); L.ellipse(x, y, r, r + 0.5, d, dx => dx > r * 0.5); L.rect(x, y - r, 1, r * 2, d); L.rect(x - 2, y + r + 1, 5, 1, P.ink2); L.rect(x, y + r + 2, 1, 3, P.yellow) }
      ;[[10, 21, P.red, P.dred], [26, 24, P.yellow, P.dyellow], [42, 26, P.teal, P.dteal], [56, 28, P.pink, P.magenta]].forEach(([x, y, c, d]) => {
        cv.disc(x, y, 9, P.lspace, (dx, dy) => (Math.round(dx) + Math.round(dy)) % 2 === 0)
        cv.sticker(L => lan(L, x, y, c, d), {})
      })
      cv.rect(0, 52, 64, 12, P.ink2); cv.rect(0, 52, 64, 1, P.slate)
      ;[[8, 48], [18, 49], [40, 48], [50, 49]].forEach(([x, y], k) => cv.sticker(L => { L.rect(x, y, 6, 8, k % 2 ? P.cream : P.white); L.rect(x + 2, y + 2, 2, 2, [P.red, P.yellow, P.teal, P.pink][k]) }, {}))
      return cv
    },
  }),

  // HUNCH: play cards in order, no talking
  hunch: make({
    bg: P.navy, dk: P.space, lt: P.lnavy,
    obj(t) {
      ;[[3, 10], [11, 7], [19, 4]].forEach(([x, y]) => { t.rrect(x, y, 10, 14, P.white, 1); t.rect(x + 9, y + 1, 1, 13, P.cloud) })
    },
    objectExtra(cv) { text(cv, 4, 14, '12', P.ink); text(cv, 12, 11, '37', P.ink); text(cv, 20, 8, '81', P.red) },
    cast: { draw() {
      const cv = make({ bg: P.navy, dk: P.space, lt: P.lnavy, obj: () => {}, scene: () => null }).cast()
      cv.sticker(L => { L.rrect(9, 5, 14, 20, P.white, 2); L.rect(22, 6, 1, 18, P.cloud) }, { shadow: P.space })
      text(cv, 12, 8, '42', P.ink); cv.rect(11, 15, 2, 3, P.ink); cv.rect(18, 15, 2, 3, P.ink); cv.rect(13, 21, 5, 1, P.ink); cv.set(22, 12, P.sky); cv.set(22, 13, P.sky)
      return cv
    } },
    scene() {
      const cv = tabletop(12, { wood: P.navy, grain: P.space, fleck: P.lnavy })
      const card = (L, x, y, n, c) => { L.rrect(x, y, 15, 21, P.white, 2); L.rect(x + 14, y + 2, 1, 18, P.cloud); L.rect(x + 2, y + 20, 11, 1, P.cloud); text(L, x + 2, y + 2, n, c, 2) }
      cv.sticker(L => { card(L, 4, 23, '3', P.ink); card(L, 24, 21, '17', P.ink); card(L, 44, 19, '42', P.red) }, { shadow: P.space, sx: 2, sy: 2 })
      cv.sticker(L => { for (let k = 0; k < 4; k++) { L.rrect(14 + k * 9, 50, 8, 12, P.coral, 1); L.rect(16 + k * 9, 52, 4, 8, P.dcoral) } }, { shadow: P.space })
      cv.sticker(L => { for (let k = 0; k < 4; k++) { L.rrect(14 + k * 9, 2, 8, 12, P.teal, 1); L.rect(16 + k * 9, 4, 4, 8, P.dteal) } }, { shadow: P.space })
      return cv
    },
  }),
}
