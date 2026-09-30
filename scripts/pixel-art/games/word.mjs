// Word games.
import { Cv, text } from '../px.mjs'
import { P } from '../palette.mjs'
import { make, castGround, room, stage, tile, face, TICK5, CROSS5 } from '../kit.mjs'

const greenTile = { bg: P.green, fg: P.white, shade: P.dgreen }
const heart = (t, x, y, c) => { t.disc(x - 4, y, 3.2, c); t.disc(x + 4, y, 3.2, c); t.poly([[x - 7.5, y + 1], [x + 7.5, y + 1], [x, y + 9]], c) }
const person = (L, x, y, hair, shirt) => { L.rrect(x - 7, y + 7, 14, 10, shirt, 3); L.disc(x, y, 5.5, P.skin); L.disc(x, y - 3, 5.5, hair, (dx, dy) => dy < -1.5) }
const bubble = (L, x, y, w, h, tailX, dir = 1) => { L.rrect(x, y, w, h, P.white, 2); L.poly([[tailX, y + h - 1], [tailX + 4 * dir, y + h - 1], [tailX + dir, y + h + 4]], P.white) }

export default {
  twotruths: make({
    bg: P.cream, dk: P.sand, lt: P.lcream,
    obj(t) {
      t.disc(8, 9, 5, P.green); t.disc(8, 9, 5, P.dgreen, (dx, dy) => dy > 3)
      t.disc(24, 9, 5, P.green); t.disc(24, 9, 5, P.dgreen, (dx, dy) => dy > 3)
      t.disc(16, 20, 5.5, P.red); t.disc(16, 20, 5.5, P.dred, (dx, dy) => dy > 3.5)
    },
    objectExtra(cv) { cv.spr(6, 7, TICK5, { '#': P.white }); cv.spr(22, 7, TICK5, { '#': P.white }); cv.spr(14, 18, CROSS5, { '#': P.white }) },
    cast: { draw() {
      const cv = castGround(P.cream, P.lcream)
      cv.sticker(L => { L.disc(6, 7, 3.5, P.green); L.disc(26, 7, 3.5, P.green) }, { shadow: P.sand })
      cv.spr(4, 6, ['...#', '#.#.', '.#..'], { '#': P.white }); cv.spr(24, 6, ['...#', '#.#.', '.#..'], { '#': P.white })
      cv.sticker(L => L.ball(16, 17, 9, P.red, P.lcoral, P.dred), { shadow: P.sand })
      cv.rect(11, 14, 3, 3, P.white); cv.rect(18, 14, 3, 3, P.white); cv.rect(13, 15, 1, 2, P.ink); cv.rect(20, 15, 1, 2, P.ink)
      cv.set(10, 12, P.ink); cv.set(11, 11, P.ink); cv.set(21, 12, P.ink); cv.set(20, 11, P.ink); cv.rect(14, 21, 5, 1, P.ink); cv.set(19, 20, P.ink)
      return cv
    } },
    scene() {
      const cv = stage(P.dpurple, P.purple, P.lpurple)
      ;[[4, P.green, 't'], [23, P.green, 't'], [42, P.red, 'x']].forEach(([x, c, k]) => {
        cv.sticker(L => { L.rect(x + 8, 24, 2, 14, P.brown); L.rrect(x, 8, 18, 16, P.cream, 2); L.disc(x + 9, 16, 5, c) }, { shadow: P.ink })
        cv.spr(x + 7, 14, k === 't' ? TICK5 : CROSS5, { '#': P.white })
      })
      cv.sticker(L => { person(L, 13, 42, P.dbrown, P.teal); person(L, 32, 42, P.ink2, P.coral); person(L, 51, 42, P.yellow, P.blue) }, { shadow: P.ink })
      face(cv, 51, 41, { sp: 1, mood: 'grin' })
      return cv
    },
  }),

  wordduel: make({
    bg: P.green, dk: P.dgreen, lt: P.lgreen,
    obj(t) {
      t.rrect(1, 7, 11, 14, P.yellow, 1); t.rect(2, 20, 9, 1, P.dyellow)
      t.rrect(20, 7, 11, 14, P.cream, 1); t.rect(21, 20, 9, 1, P.sand)
      t.poly([[17, 3], [12.5, 15], [15.5, 15], [13.5, 26], [19.5, 12], [16.5, 12], [19, 3]], P.lyellow)
    },
    objectExtra(cv) { text(cv, 3, 9, 'W', P.ink, 2); text(cv, 22, 9, 'D', P.ink, 2) },
    cast: { draw() {
      const cv = castGround(P.green, P.lgreen)
      cv.sticker(L => { L.rrect(8, 6, 16, 19, P.yellow, 2); L.rect(9, 24, 14, 1, P.dyellow) }, { shadow: P.dgreen })
      text(cv, 11, 8, 'W', P.dyellow, 2)
      face(cv, 16, 17, { sp: 3, mood: 'angry' })
      cv.spr(24, 2, ['..#.', '.##.', '####', '.##.', '.#..'], { '#': P.lyellow })
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.ink2)
      const grids = [['gyxxg', 'ggxyg', 'ggggg'], ['xyxxy', 'yxgxx', 'gyxgx']]
      const col = { g: P.green, y: P.yellow, x: P.slate }
      grids.forEach((g, side) => {
        const x0 = side ? 35 : 1
        for (let j = 0; j < 6; j++) for (let i = 0; i < 5; i++) {
          const ch = g[j]?.[i]
          cv.rect(x0 + i * 6, 16 + j * 7, 5, 6, ch ? col[ch] : P.ink)
          if (!ch) cv.box(x0 + i * 6, 16 + j * 7, 5, 6, P.slate)
        }
      })
      text(cv, 26, 3, 'VS', P.lyellow, 2)
      cv.rect(1, 58, 28, 3, P.green); cv.rect(35, 58, 14, 3, P.coral); cv.rect(49, 58, 14, 3, P.slate)
      return cv
    },
  }),

  wordcoop: make({
    bg: P.pink, dk: P.magenta, lt: P.lcream,
    obj(t) { heart(t, 16, 18, P.red); t.disc(12, 16, 1.2, P.lcoral) },
    objectExtra(cv) { cv.sticker(L => { ;['W', 'O', 'R', 'D'].forEach((ch, k) => tile(L, 2 + k * 7.5 | 0, 3, ch, greenTile)) }, { shadow: P.magenta }) },
    cast: { draw() {
      const cv = castGround(P.pink, P.lcream)
      cv.sticker(L => { L.disc(11, 14, 6, P.red); L.disc(21, 14, 6, P.red); L.poly([[4.5, 16], [27.5, 16], [16, 28]], P.red); L.disc(9, 12, 1.6, P.lcoral) }, { shadow: P.magenta })
      face(cv, 16, 14, { sp: 3, mood: 'happy', cheek: P.pink })
      return cv
    } },
    scene() {
      const cv = stage(P.magenta, P.pink, P.lcream)
      cv.sticker(L => { ;['W', 'O', 'R', 'D'].forEach((ch, k) => tile(L, 12 + k * 10, 8, ch, { ...greenTile, scale: 2 })) }, { shadow: P.magenta })
      cv.sticker(L => { L.ball(20, 42, 7, P.coral, P.lcoral, P.dcoral); L.ball(44, 42, 7, P.blue, P.lblue, P.dblue); L.rect(26, 43, 12, 2, P.skin) }, { shadow: P.magenta })
      face(cv, 20, 39, { sp: 2, mood: 'happy' }); face(cv, 44, 39, { sp: 2, mood: 'happy' })
      cv.spr(29, 28, ['.##.##.', '#######', '.#####.', '..###..', '...#...'], { '#': P.red })
      return cv
    },
  }),

  converge: make({
    bg: P.sea, dk: P.dsea, lt: P.lsea,
    obj(t) {
      t.rect(1, 13, 7, 3, P.yellow); t.poly([[7, 9.5], [7, 18.5], [11.5, 14.5]], P.yellow)
      t.rect(25, 13, 6, 3, P.coral); t.poly([[25, 9.5], [25, 18.5], [20.5, 14.5]], P.coral)
    },
    objectExtra(cv) { cv.sticker(L => tile(L, 12, 10, 'O'), {}) },
    cast: { draw() {
      const cv = castGround(P.sea, P.lsea)
      cv.sticker(L => { L.rrect(9, 7, 14, 17, P.cream, 2); L.rect(10, 23, 12, 1, P.sand); L.poly([[1, 12], [1, 20], [6, 16]], P.yellow); L.poly([[31, 12], [31, 20], [26, 16]], P.coral) }, { shadow: P.dsea })
      face(cv, 16, 12, { sp: 2, mood: 'happy' })
      return cv
    } },
    scene() {
      const cv = room(P.lsea, { wall2: P.sea, table: P.dsea, edge: P.sky, dark: P.navy, y: 52 })
      cv.sticker(L => { bubble(L, 2, 4, 26, 11, 8); bubble(L, 36, 4, 26, 11, 54, -1) }, { shadow: P.dsea })
      text(cv, 9, 7, 'SUN', P.ink); text(cv, 43, 7, 'SUN', P.ink)
      cv.sticker(L => { person(L, 10, 42, P.dbrown, P.yellow); person(L, 54, 42, P.ink2, P.coral) }, { shadow: P.dsea })
      cv.sticker(L => tile(L, 27, 24, 'S', { scale: 2, bg: P.yellow, shade: P.dyellow }), { shadow: P.dsea })
      ;[[22, 20], [42, 20], [24, 36], [40, 36]].forEach(([x, y]) => cv.spr(x, y, ['.#.', '###', '.#.'], { '#': P.white }))
      return cv
    },
  }),

  wordrace: make({
    bg: P.yellow, dk: P.dyellow, lt: P.lyellow,
    obj(t) {
      t.rect(4, 2, 2, 25, P.ink2)
      for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) t.rect(6 + i * 3, 3 + j * 3 + (i % 2), 3, 3, (i + j) % 2 ? P.ink : P.white)
    },
    objectExtra(cv) { cv.sticker(L => tile(L, 19, 16, 'W', { bg: P.teal, fg: P.white, shade: P.dteal }), {}); ;[[14, 18], [13, 21]].forEach(([x, y]) => cv.rect(x, y, 4, 1, P.white)) },
    cast: { draw() {
      const cv = castGround(P.yellow, P.lyellow)
      cv.sticker(L => { L.rrect(11, 5, 14, 17, P.teal, 2); L.rect(12, 21, 12, 1, P.dteal); L.rect(13, 22, 2, 5, P.ink2); L.rect(20, 22, 2, 4, P.ink2); L.rect(21, 25, 3, 1, P.ink2); L.rect(11, 27, 4, 1, P.ink2) }, { shadow: P.dyellow })
      text(cv, 15, 7, 'W', P.white)
      face(cv, 18, 13, { sp: 2, mood: 'grin' })
      ;[[3, 10], [2, 14], [4, 18]].forEach(([x, y]) => cv.rect(x, y, 5, 1, P.white))
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.green)
      cv.rect(0, 12, 64, 42, P.slate)
      ;[12, 26, 40, 53].forEach(y => cv.rect(0, y, 64, 1, P.white))
      ;[19, 33, 46].forEach(y => { for (let x = 2; x < 50; x += 8) cv.rect(x, y, 4, 1, P.gray) })
      for (let j = 0; j < 14; j++) for (let i = 0; i < 2; i++) cv.rect(52 + i * 3, 13 + j * 3, 3, 3, (i + j) % 2 ? P.ink : P.white)
      cv.sticker(L => { tile(L, 40, 15, 'W', { bg: P.teal, fg: P.white, shade: P.dteal, scale: 1 }); tile(L, 28, 29, 'O', { bg: P.coral, fg: P.white, shade: P.dcoral }); tile(L, 16, 43, 'R', { bg: P.purple, fg: P.white, shade: P.dpurple }) }, {})
      ;[[34, 18], [22, 32], [10, 46]].forEach(([x, y]) => { cv.rect(x, y, 4, 1, P.white); cv.rect(x - 2, y + 3, 5, 1, P.white) })
      return cv
    },
  }),

  wordhunt: make({
    bg: P.dgreen, dk: P.ddgreen, lt: P.moss,
    obj(t) {
      const hot = new Set([0, 1, 2])
      for (let k = 0; k < 9; k++) { const x = 2 + (k % 3) * 8, y = 2 + Math.floor(k / 3) * 8; t.rrect(x, y, 7, 7, hot.has(k) ? P.yellow : P.cream, 1); t.rect(x + 1, y + 6, 5, 1, hot.has(k) ? P.dyellow : P.sand) }
      t.ring(22, 20, 6, 2, P.ink2); t.disc(22, 20, 4, P.haze); t.set(20, 18, P.white); t.set(21, 17, P.white)
      t.seg(26.5, 24.5, 30, 28, 3, P.brown)
    },
    objectExtra(cv) { ;['CAT', 'ORE', 'DIG'].forEach((row, j) => [...row].forEach((ch, i) => { if (!(i === 2 && j > 0) && !(i === 1 && j === 2)) text(cv, 4 + i * 8, 3 + j * 8, ch, P.ink2) })) },
    cast: { draw() {
      const cv = castGround(P.dgreen, P.moss)
      cv.sticker(L => { L.seg(20, 21, 27, 28, 4, P.brown); L.ring(14, 14, 10, 3, P.ink2); L.disc(14, 14, 7, P.white) }, { shadow: P.ddgreen })
      cv.disc(14, 14, 4, P.teal); cv.disc(14, 14, 2, P.ink); cv.set(12, 12, P.white); cv.set(13, 12, P.white)
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.ddgreen)
      const g = ['CATSO', 'ORBEN', 'DIGAL', 'WORDE', 'HUNTS']
      g.forEach((row, j) => [...row].forEach((ch, i) => {
        const x = 3 + i * 12, y = 3 + j * 12, hot = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]].some(([a, b]) => a === i && b === j)
        cv.rrect(x, y, 10, 10, hot ? P.yellow : P.cream, 1); cv.rect(x + 1, y + 9, 8, 1, hot ? P.dyellow : P.sand)
        text(cv, x + 4, y + 2, ch, P.ink2)
      }))
      cv.seg(8, 8, 44, 8, 1, P.coral); cv.seg(44, 8, 44, 20, 1, P.coral)
      cv.sticker(L => { L.ring(46, 46, 9, 2.5, P.ink2); L.seg(53, 53, 62, 62, 4, P.brown) }, {})
      return cv
    },
  }),

  password: make({
    bg: P.ink2, dk: P.ink, lt: P.slate,
    obj(t) {
      t.ring(16, 12, 6.5, 2.2, P.gray); t.ring(16, 12, 6.5, 1, P.lstone)
      t.rrect(7, 12, 18, 14, P.yellow, 2); t.rect(7, 24, 18, 2, P.dyellow); t.rect(23, 13, 2, 11, P.dyellow); t.rect(8, 13, 1, 10, P.lyellow)
      t.disc(16, 17, 1.8, P.ink); t.rect(15, 18, 2, 4, P.ink)
    },
    cast: { draw() {
      const cv = castGround(P.ink2, P.slate)
      cv.sticker(L => { L.ring(16, 12, 7, 2.4, P.gray); L.rrect(6, 12, 20, 15, P.yellow, 2); L.rect(6, 25, 20, 2, P.dyellow); L.rect(24, 13, 2, 12, P.dyellow) }, { shadow: P.ink })
      face(cv, 16, 16, { sp: 3, mood: 'happy', cheek: P.orange })
      return cv
    } },
    scene() {
      const cv = room(P.lnavy, { wall2: P.navy, table: P.brown })
      cv.sticker(L => { L.rrect(4, 4, 56, 38, P.stone, 3); L.rect(7, 7, 50, 32, P.ink); L.rect(28, 42, 8, 5, P.dstone); L.rect(20, 47, 24, 3, P.stone) }, { shadow: P.space })
      cv.sticker(L => { L.ring(32, 16, 4.5, 1.6, P.gray); L.rrect(26, 16, 12, 9, P.yellow, 1); L.rect(31, 19, 2, 3, P.ink) }, {})
      cv.rect(12, 29, 40, 7, P.white); ;[0, 1, 2, 3, 4].forEach(k => cv.disc(17 + k * 7, 32, 1.6, P.ink2)); cv.rect(51, 30, 1, 5, P.blue)
      cv.sticker(L => { L.rect(46, 44, 14, 12, P.lyellow); L.rect(46, 44, 14, 2, P.yellow) }, { shadow: P.dbrown })
      text(cv, 49, 48, 'SH', P.ink2)
      return cv
    },
  }),

  anagrams: make({
    bg: P.orange, dk: P.dorange, lt: P.lyellow,
    obj(t) {
      t.disc(15.5, 14, 9, P.teal, (dx, dy) => dy < -3 && dx * dx + dy * dy > 6.6 * 6.6 && dx < 6)
      t.poly([[20.5, 7.5], [26, 7], [23.5, 12]], P.teal)
    },
    objectExtra(cv) { cv.sticker(L => { tile(L, 4, 14, 'T'); tile(L, 12, 14, 'A'); tile(L, 20, 14, 'C') }, { shadow: P.dorange }) },
    cast: { draw() {
      const cv = castGround(P.orange, P.lyellow)
      cv.sticker(L => { L.rrect(9, 7, 14, 17, P.cream, 2); L.rect(10, 23, 12, 1, P.sand) }, { shadow: P.dorange })
      text(cv, 14, 9, 'A', P.ink2, 1)
      face(cv, 16, 16, { sp: 2, mood: 'grin' })
      cv.sticker(L => { L.disc(16, 16, 14.5, P.teal, (dx, dy) => dx * dx + dy * dy > 12.8 * 12.8 && dy < -6 && dx < 8); L.poly([[22, 1], [27, 5], [21, 6]], P.teal) }, { outline: null })
      return cv
    } },
    scene() {
      const cv = room(P.lyellow, { wall2: P.yellow, table: P.brown })
      cv.sticker(L => { L.rect(6, 42, 52, 6, P.lbrown); L.rect(6, 46, 52, 2, P.dbrown) }, { shadow: P.dbrown })
      cv.sticker(L => { ;['C', 'A', 'T', 'S'].forEach((ch, k) => tile(L, 10 + k * 12, 28, ch, { scale: 2 })) }, { shadow: P.dbrown })
      cv.seg(15, 26, 27, 26, 1, P.teal); cv.seg(15, 26, 15, 22, 1, P.teal); cv.seg(27, 26, 27, 22, 1, P.teal); cv.poly([[25, 23], [29, 23], [27, 20]], P.teal)
      text(cv, 6, 5, 'ACTS', P.dorange); text(cv, 6, 12, 'CAST', P.dorange); text(cv, 38, 5, 'CATS', P.dorange); text(cv, 38, 12, 'SCAT', P.dgreen)
      return cv
    },
  }),
}
