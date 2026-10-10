// Party games and dice & bluff games.
import { Cv, text } from '../px.mjs'
import { P } from '../palette.mjs'
import { make, T, castGround, objectGround, room, bands, stage, tabletop, stars, face, die, STAR5 } from '../kit.mjs'

const person = (L, x, y, hair, shirt) => { L.rrect(x - 7, y + 7, 14, 10, shirt, 3); L.disc(x, y, 5.5, P.skin); L.disc(x, y - 3, 5.5, hair, (dx, dy) => dy < -1.5) }

function sheep(t, dark = false) {
  const wool = dark ? P.ink2 : P.white, shade = dark ? P.ink : P.cloud
  ;[[8, 22], [12, 22], [18, 22], [22, 22]].forEach(([x, y]) => t.rect(x, y, 2, 4, P.ink2))
  ;[[10, 13], [16, 11], [22, 13], [12, 18], [20, 18], [16, 17]].forEach(([x, y]) => t.disc(x, y, 4.2, wool))
  ;[[12, 18], [20, 18]].forEach(([x, y]) => t.disc(x, y, 4.2, shade, (dx, dy) => dy > 2))
  t.ellipse(26, 14, 3.2, 4, P.ink2); t.rect(22, 11, 3, 2, P.ink2)
}
function dial(t, needle = -0.35) {
  t.disc(16, 22, 13, P.cream, (dx, dy) => dy <= 0)
  const wedge = (a0, a1, c) => t.disc(16, 22, 12, c, (dx, dy) => { const a = Math.atan2(-dy, dx); return dy <= 0 && a >= a0 && a <= a1 })
  wedge(1.05, 1.35, P.yellow); wedge(1.35, 1.6, P.orange); wedge(1.6, 1.85, P.red); wedge(1.85, 2.1, P.orange); wedge(2.1, 2.4, P.yellow)
  t.rect(3, 22, 26, 3, P.dteal)
  const a = Math.PI / 2 + needle
  t.seg(16, 22, 16 + Math.cos(a) * 11, 22 - Math.sin(a) * 11, 1.6, P.ink2)
  t.disc(16, 22, 2.2, P.red)
}
function hat(t) {
  t.ellipse(16, 14, 13, 2.8, P.brown); t.ellipse(16, 15, 13, 2, P.dbrown, (dx, dy) => dy > 0.5)
  t.rrect(8, 4, 16, 10, P.brown, 3); t.rect(8, 11, 16, 2, P.dred); t.rect(13, 4, 6, 2, P.dbrown)
  t.rect(10, 5, 2, 5, P.lbrown)
}
function shades(t, y = 18) { t.rrect(8, y, 7, 4, P.night, 1); t.rrect(17, y, 7, 4, P.night, 1); t.rect(15, y + 1, 2, 1, P.night); t.set(9, y + 1, P.sky); t.set(18, y + 1, P.sky) }
function chameleon(t) {
  t.rect(1, 22, 30, 2, P.brown); t.rect(1, 24, 30, 1, P.dbrown)
  t.ring(6, 17, 3.5, 1.8, P.green); t.seg(8.5, 17, 11, 16, 2, P.green)
  t.ellipse(15, 15, 7.5, 5, P.green); t.ellipse(15, 12, 6, 2, P.lime)
  t.rect(10, 19, 2, 4, P.dgreen); t.rect(18, 19, 2, 4, P.dgreen)
  t.poly([[20, 10], [28, 13], [27, 17], [20, 18]], P.green)
  t.disc(23, 13, 2.6, P.lime); t.disc(23, 13, 1.2, P.ink)
  t.seg(28, 15, 31, 12, 1, P.pink)
}
function buzzer(t) {
  t.rrect(5, 20, 22, 7, P.ink2, 2); t.rect(5, 20, 22, 2, P.slate)
  t.disc(16, 20, 8.5, P.red, (dx, dy) => dy <= 0); t.disc(16, 20, 8.5, P.dred, (dx, dy) => dy <= 0 && dx > 4); t.disc(12.5, 15.5, 1.8, P.pink)
}
function capsule(t, x, y) { t.rrect(x, y, 10, 6, P.white, 2); t.poly([[x + 10, y + 1], [x + 13, y + 3], [x + 10, y + 5]], P.lstone); t.rect(x + 2, y + 2, 2, 2, P.sky); t.rect(x - 2, y + 2, 2, 2, P.orange) }
function cup(t) {
  t.poly([[9, 4], [19, 4], [22, 22], [6, 22]], P.brown); t.poly([[16, 4], [19, 4], [22, 22], [18, 22]], P.dbrown)
  t.rect(5, 20, 18, 3, P.lbrown); t.rect(10, 5, 2, 12, P.lbrown)
}

export default {
  herd: make({
    bg: P.green, dk: P.dgreen, lt: P.lgreen,
    obj: t => sheep(t),
    cast: { draw() {
      const cv = castGround(P.green, P.lgreen)
      cv.sticker(L => { const t = T(L, 0, 0, 1); ;[[8, 9], [16, 6], [24, 9], [7, 16], [25, 16]].forEach(([x, y]) => t.disc(x, y, 4.5, P.white)); t.ellipse(16, 17, 7, 8, P.ink2); t.ellipse(7, 15, 3, 1.6, P.ink2); t.ellipse(25, 15, 3, 1.6, P.ink2) }, { shadow: P.dgreen })
      face(cv, 16, 14, { sp: 2, mood: 'happy', eye: P.white, ink: P.ink })
      cv.rect(14, 21, 4, 1, P.pink)
      return cv
    } },
    scene() {
      const cv = bands([[0, P.sky], [22, P.haze], [28, P.lgreen], [34, P.green]])
      cv.dither(0, 44, 64, 20, P.dgreen, 0)
      for (let x = 0; x < 64; x += 8) cv.rect(x, 24, 2, 10, P.lbrown); cv.rect(0, 26, 64, 1, P.lbrown); cv.rect(0, 30, 64, 1, P.lbrown)
      ;[[0, 30, false], [22, 36, false], [42, 30, false], [12, 44, false], [36, 44, true]].forEach(([x, y, dark]) => cv.sticker(L => sheep(T(L, x - 2, y - 10, 0.75), dark), {}))
      cv.disc(8, 8, 4, P.white); cv.disc(13, 7, 5, P.white); cv.disc(50, 12, 4, P.white)
      return cv
    },
  }),

  trivia: make({
    bg: P.purple, dk: P.dpurple, lt: P.lpurple,
    obj: buzzer,
    objectExtra(cv) { text(cv, 23, 2, '?', P.yellow, 2) },
    cast: { draw() {
      const cv = castGround(P.purple, P.lpurple)
      cv.sticker(L => text(L, 10, 4, '?', P.yellow, 4), { shadow: P.dpurple })
      cv.rect(10, 4, 8, 1, P.lyellow)
      cv.rect(11, 5, 2, 2, P.white); cv.rect(15, 5, 2, 2, P.white); cv.set(12, 6, P.ink); cv.set(15, 6, P.ink)
      return cv
    } },
    scene() {
      const cv = stage(P.dpurple, P.purple, P.lpurple)
      cv.sticker(L => { L.rrect(14, 4, 36, 22, P.ink2, 2); L.rect(17, 7, 30, 16, P.navy) }, { shadow: P.ink })
      text(cv, 27, 9, '?', P.yellow, 2)
      ;[[4, P.coral, true], [24, P.teal, false], [44, P.yellow, false]].forEach(([x, c, lit]) => {
        cv.sticker(L => { L.rect(x, 40, 16, 16, c); L.rect(x, 40, 16, 2, P.white); L.ellipse(x + 8, 39, 5, 2, lit ? P.lcoral : P.dred); L.ellipse(x + 8, 38, 5, 2, lit ? P.white : P.red) }, { shadow: P.ink })
      })
      ;[[12, 30], [8, 33], [16, 33]].forEach(([x, y]) => cv.set(x, y, P.lyellow))
      return cv
    },
  }),

  wavelength: make({
    bg: P.teal, dk: P.dteal, lt: P.sky,
    obj: t => dial(t),
    cast: { x: 0, y: 1, face: [16, 13, { sp: 4, mood: 'happy' }] },
    scene() {
      const cv = stage(P.dteal, P.teal, P.sky)
      cv.sticker(L => dial(T(L, 0, -4, 2), -0.2), { shadow: P.dteal })
      cv.sticker(L => { L.rrect(3, 50, 22, 11, P.lyellow, 1); L.rrect(39, 50, 22, 11, P.lblue, 1) }, { shadow: P.dteal })
      text(cv, 6, 53, 'COLD', P.dblue); text(cv, 44, 53, 'HOT', P.dred)
      return cv
    },
  }),

  fibbage: make({
    bg: P.orange, dk: P.dorange, lt: P.lyellow,
    obj(t) { t.rrect(2, 3, 28, 16, P.cream, 3); t.poly([[7, 18], [13, 18], [5, 25]], P.cream); t.rect(3, 18, 26, 1, P.sand) },
    objectExtra(cv) { text(cv, 5, 6, 'FIB', P.dred, 2) },
    cast: { draw() {
      const cv = castGround(P.orange, P.lyellow)
      cv.sticker(L => { L.disc(13, 16, 9, P.skin); L.disc(13, 10, 9, P.dbrown, (dx, dy) => dy < -3); L.rect(19, 15, 11, 3, P.skin); L.rect(19, 17, 11, 1, P.dskin); L.rect(26, 11, 1, 4, P.green); L.rect(27, 11, 2, 2, P.lime) }, { shadow: P.dorange })
      cv.rect(8, 13, 2, 2, P.white); cv.rect(14, 13, 2, 2, P.white); cv.set(9, 14, P.ink); cv.set(15, 14, P.ink); cv.set(8, 11, P.dbrown); cv.rect(10, 20, 5, 1, P.dred); cv.set(15, 19, P.dred)
      return cv
    } },
    scene() {
      const cv = stage(P.dorange, P.orange, P.lyellow)
      const ans = [[4, 'TRUE', false], [4 + 20, 'LIE', true], [44, 'REAL', false]]
      cv.sticker(L => ans.forEach(([x, , lie]) => L.rrect(x, 8, 17, 12, lie ? P.lcoral : P.cream, 2)), { shadow: P.dorange })
      ans.forEach(([x, w, lie]) => text(cv, x + 2 + (w.length === 3 ? 2 : 0), 12, w, lie ? P.dred : P.ink2))
      cv.sticker(L => { person(L, 14, 38, P.dbrown, P.teal); person(L, 32, 38, P.ink2, P.purple); person(L, 50, 38, P.yellow, P.blue) }, { shadow: P.dorange })
      face(cv, 32, 37, { sp: 1, mood: 'grin' })
      cv.seg(32, 22, 32, 28, 1, P.dred)
      return cv
    },
  }),

  spyfair: make({
    bg: P.ink2, dk: P.ink, lt: P.slate,
    obj(t) { hat(t); shades(t, 18) },
    cast: { draw() {
      const cv = castGround(P.ink2, P.slate)
      cv.sticker(L => { const t = T(L, 0, 2, 1); t.disc(16, 17, 8, P.skin); hat(T(L, 0, -2, 1)); shades(t, 15); t.rect(12, 22, 8, 2, P.dbrown) }, { shadow: P.ink })
      return cv
    } },
    scene() {
      const cv = room(P.dpurple, { wall2: P.purple, table: P.dbrown, edge: P.brown, dark: P.ink, y: 54 })
      cv.rect(6, 6, 16, 18, P.lnavy); cv.box(5, 5, 18, 20, P.dbrown); cv.disc(14, 12, 3, P.lyellow)
      cv.sticker(L => { person(L, 14, 42, P.ink2, P.coral); person(L, 50, 42, P.yellow, P.teal) }, { shadow: P.ink })
      cv.sticker(L => { L.disc(32, 40, 6, P.skin); hat(T(L, 16, 23, 1)); shades(T(L, 16, 20, 1), 18); L.rrect(24, 47, 16, 8, P.ink2, 3) }, { shadow: P.ink })
      cv.sticker(L => { L.rrect(44, 6, 16, 20, P.cream, 1); L.rect(46, 9, 12, 8, P.sky); L.rect(46, 19, 10, 1, P.gray); L.rect(46, 22, 7, 1, P.gray) }, { shadow: P.ink })
      text(cv, 50, 10, '?', P.ink2)
      return cv
    },
  }),

  headsup: make({
    bg: P.blue, dk: P.dblue, lt: P.lblue,
    obj(t) {
      t.disc(16, 19, 8, P.skin); t.disc(16, 13, 8, P.dbrown, (dx, dy) => dy < -3.5)
      t.rrect(9, 3, 14, 10, P.white, 1); t.rect(10, 12, 12, 1, P.cloud)
      t.rect(12, 18, 2, 3, P.white); t.rect(18, 18, 2, 3, P.white); t.rect(12, 18, 1, 1, P.ink); t.rect(19, 18, 1, 1, P.ink); t.rect(14, 24, 4, 1, P.dcoral)
    },
    objectExtra(cv) { cv.spr(14, 5, STAR5, { '#': P.yellow }) },
    cast: { draw() {
      const cv = castGround(P.blue, P.lblue)
      cv.sticker(L => { L.disc(16, 19, 10, P.skin); L.disc(16, 12, 10, P.dbrown, (dx, dy) => dy < -4.5); L.rrect(8, 1, 16, 11, P.white, 1) }, { shadow: P.dblue })
      cv.spr(13, 4, STAR5, { '#': P.yellow }); cv.set(15, 3, P.lyellow)
      face(cv, 16, 16, { sp: 3, mood: 'shock' })
      return cv
    } },
    scene() {
      const cv = room(P.lblue, { wall2: P.blue, table: P.brown })
      cv.sticker(L => { person(L, 16, 34, P.dbrown, P.coral); L.rrect(10, 18, 12, 9, P.white, 1); L.rect(8, 28, 3, 6, P.skin); L.rect(21, 28, 3, 6, P.skin) }, { shadow: P.dblue })
      cv.spr(14, 20, STAR5, { '#': P.yellow })
      cv.sticker(L => { person(L, 46, 32, P.yellow, P.teal); L.seg(39, 38, 34, 28, 2.4, P.skin); L.seg(53, 38, 58, 26, 2.4, P.skin) }, { shadow: P.dblue })
      face(cv, 46, 31, { sp: 1, mood: 'grin' })
      ;[[30, 22], [60, 20], [33, 18]].forEach(([x, y]) => cv.rect(x, y, 2, 1, P.white))
      return cv
    },
  }),

  chameleon: make({
    bg: P.yellow, dk: P.dyellow, lt: P.lyellow,
    obj: chameleon,
    cast: { draw() {
      const cv = castGround(P.yellow, P.lyellow)
      cv.sticker(L => { L.ellipse(15, 17, 11, 9, P.green); L.ellipse(15, 12, 8, 3, P.lime); L.disc(9, 15, 4, P.lime); L.disc(22, 15, 4, P.lime); L.rect(9, 23, 13, 1, P.dgreen) }, { shadow: P.dyellow })
      cv.disc(9, 15, 2, P.ink); cv.disc(22, 15, 2, P.ink); cv.set(8, 14, P.white); cv.set(21, 14, P.white)
      cv.rect(11, 21, 9, 1, P.dgreen); cv.rect(15, 22, 1, 3, P.pink)
      return cv
    } },
    scene() {
      const cv = bands([[0, P.dgreen], [30, P.moss]])
      for (let k = 0; k < 26; k++) { const x = (k * 37) % 64, y = (k * 23) % 56; cv.ellipse(x, y, 4, 2.2, k % 2 ? P.green : P.lime) }
      cv.sticker(L => chameleon(T(L, 2, 12, 1.9)), { shadow: P.ddgreen })
      cv.sticker(L => { for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) L.rrect(4 + i * 15, 52 + j * 0, 13, 9, i === 2 ? P.lime : P.cream, 1) }, { shadow: P.ddgreen })
      text(cv, 7, 54, 'CAT', P.ink2); text(cv, 22, 54, 'DOG', P.ink2); text(cv, 37, 54, '???', P.dgreen); text(cv, 52, 54, 'OWL', P.ink2)
      return cv
    },
  }),

  codewords: make({
    bg: P.sand, dk: P.lbrown, lt: P.lcream,
    obj(t) {
      const c = [[P.red, P.cream, P.blue], [P.blue, P.ink2, P.red], [P.cream, P.red, P.cream]]
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const x = 2 + i * 10, y = 2 + j * 8, col = c[j][i]
        t.rrect(x, y, 9, 7, col, 1)
        t.rect(x + 2, y + 3, 5, 1, col === P.cream ? P.gray : col === P.ink2 ? P.slate : P.white)
      }
    },
    cast: { draw() {
      const cv = castGround(P.sand, P.lcream)
      cv.sticker(L => { L.rrect(7, 6, 18, 20, P.ink2, 2); L.rect(8, 24, 16, 2, P.ink) }, { shadow: P.lbrown })
      shades(T(cv, 0, -4, 1), 17)
      cv.rect(13, 20, 6, 1, P.slate); cv.set(12, 19, P.slate)
      return cv
    } },
    scene() {
      const cv = tabletop(15)
      const map = ['rcbcr', 'bcrkb', 'ccbrc', 'rbccb', 'cbrcr']
      const col = { r: P.red, b: P.blue, c: P.cream, k: P.ink2 }
      const shown = new Set(['0,0', '2,0', '1,1', '3,1', '2,2', '0,3', '4,4'])
      cv.sticker(L => {
        for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
          const x = 3 + i * 12, y = 3 + j * 11, c = shown.has(`${i},${j}`) ? col[map[j][i]] : P.lcream
          L.rrect(x, y, 10, 9, c, 1); L.rect(x + 2, y + 4, 6, 1, c === P.lcream ? P.gray : P.white)
        }
      }, { shadow: P.dbrown })
      return cv
    },
  }),

  justone: make({
    bg: P.teal, dk: P.dteal, lt: P.sky,
    obj(t) {
      ;[3, 12].forEach(x => { t.rrect(x, 5, 8, 11, P.cream, 1); t.rect(x + 2, 8, 4, 1, P.ink2); t.rect(x + 2, 10, 3, 1, P.ink2); t.rect(x + 1, 15, 6, 1, P.sand) })
      t.rrect(21, 5, 9, 12, P.cream, 1); t.rect(22, 16, 7, 1, P.sand)
      t.seg(2, 17, 20, 4, 1.6, P.red); t.seg(2, 4, 20, 17, 1.6, P.red)
    },
    objectExtra(cv) { cv.spr(23, 8, STAR5, { '#': P.yellow }) },
    cast: { draw() {
      const cv = castGround(P.teal, P.sky)
      cv.sticker(L => { L.rrect(8, 4, 16, 21, P.cream, 2); L.rect(9, 24, 14, 1, P.sand) }, { shadow: P.dteal })
      cv.spr(13, 6, STAR5, { '#': P.yellow })
      face(cv, 16, 14, { sp: 3, mood: 'happy', cheek: P.pink })
      return cv
    } },
    scene() {
      const cv = tabletop(16, { wood: P.dteal, grain: P.ink2, fleck: P.teal })
      const cards = [[4, 30, 'SEA'], [19, 34, 'SEA'], [34, 30, 'WET'], [49, 34, 'SUN']]
      cv.sticker(L => cards.forEach(([x, y]) => { L.rrect(x, y, 13, 16, P.cream, 1); L.rect(x + 1, y + 15, 11, 1, P.sand) }), { shadow: P.ink })
      cards.forEach(([x, y, w]) => text(cv, x + 1, y + 5, w, P.ink2))
      cv.seg(3, 29, 34, 51, 1.4, P.red); cv.seg(3, 47, 33, 32, 1.4, P.red)
      cv.sticker(L => { person(L, 32, 9, P.dbrown, P.coral) }, { shadow: P.ink })
      text(cv, 42, 3, '?', P.yellow, 2)
      return cv
    },
  }),

  dice: make({
    bg: P.green, dk: P.dgreen, lt: P.lgreen,
    obj() {},
    object() {
      const cv = objectGround(P.green, P.dgreen)
      cv.sticker(L => { die(L, 3, 10, 12, 5); die(L, 18, 15, 9, 3) }, { shadow: P.dgreen })
      cv.sticker(L => { L.disc(23, 7, 4.5, P.pink); L.ellipse(23, 7.5, 2.5, 1.8, P.magenta); L.set(22, 7, P.dred); L.set(24, 7, P.dred) }, { shadow: P.dgreen })
      return cv
    },
    cast: { draw() {
      const cv = castGround(P.green, P.lgreen)
      cv.sticker(L => { L.poly([[6, 4], [11, 8], [6, 10]], P.pink); L.poly([[26, 4], [21, 8], [26, 10]], P.pink); L.disc(16, 16, 10, P.pink); L.ellipse(16, 20, 4.5, 3, P.magenta) }, { shadow: P.dgreen })
      cv.set(14, 20, P.dred); cv.set(18, 20, P.dred); cv.rect(11, 13, 2, 2, P.ink); cv.rect(19, 13, 2, 2, P.ink)
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.felt)
      cv.box(0, 0, 64, 64, P.dbrown); cv.box(1, 1, 62, 62, P.brown); cv.dither(2, 2, 60, 60, P.dgreen, 0, P.felt)
      cv.sticker(L => { die(L, 14, 22, 18, 6); die(L, 36, 30, 12, 1) }, { shadow: P.ddgreen, sx: 2, sy: 2 })
      cv.sticker(L => { L.rrect(6, 4, 22, 12, P.cream, 1) }, { shadow: P.ddgreen })
      text(cv, 9, 8, 'PIG', P.dred); text(cv, 23, 8, '0', P.ink2)
      cv.sticker(L => { ;[[46, 6], [52, 8], [49, 12], [55, 13]].forEach(([x, y]) => { L.disc(x, y, 3, P.pink); L.ellipse(x, y + 0.5, 1.5, 1, P.magenta) }) }, { shadow: P.ddgreen })
      return cv
    },
  }),

  bluff: make({
    bg: P.blue, dk: P.dblue, lt: P.lblue,
    obj: cup,
    objectExtra(cv) { cv.sticker(L => die(L, 20, 17, 9, 6), { shadow: P.dblue }); text(cv, 23, 2, '?', P.yellow, 2) },
    cast: { draw() {
      const cv = castGround(P.blue, P.lblue)
      cv.sticker(L => die(L, 7, 7, 18, 4), { shadow: P.dblue })
      face(cv, 16, 13, { sp: 3, mood: 'angry' })
      cv.set(20, 19, P.ink); cv.set(21, 18, P.ink)
      return cv
    } },
    scene() {
      const cv = tabletop(17, { wood: P.dblue, grain: P.navy, fleck: P.blue })
      cv.sticker(L => { cup(T(L, 2, 6, 1.1)); cup(T(L, 36, 2, 1.1)) }, { shadow: P.navy })
      cv.sticker(L => { die(L, 30, 44, 12, 4); die(L, 44, 40, 12, 4); die(L, 16, 46, 9, 2) }, { shadow: P.navy })
      cv.sticker(L => { L.rrect(3, 52, 11, 9, P.cream, 1) }, { shadow: P.navy })
      text(cv, 5, 54, '4?', P.dred)
      return cv
    },
  }),

  docking: make({
    bg: P.purple, dk: P.dpurple, lt: P.lpurple,
    objectBack(cv) { stars(cv, 14, 5, [P.white, P.lilac], P.purple) },
    obj(t) { t.ring(20, 14, 8.5, 3, P.gray); t.ring(20, 14, 8.5, 1, P.lstone); t.disc(20, 14, 5.5, P.dpurple); t.rect(19, 3, 2, 3, P.stone); capsule(t, 2, 11) },
    cast: { draw() {
      const cv = castGround(P.purple, P.lpurple)
      cv.sticker(L => { L.rrect(5, 9, 20, 13, P.white, 4); L.poly([[25, 11], [30, 15.5], [25, 20]], P.lstone); L.rect(2, 13, 3, 5, P.orange); L.rect(6, 20, 18, 2, P.cloud) }, { shadow: P.dpurple })
      face(cv, 15, 12, { sp: 3, mood: 'happy' })
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.night)
      stars(cv, 60, 13, [P.white, P.lilac, P.sky], P.night)
      cv.disc(8, 58, 16, P.lspace); cv.disc(8, 58, 16, P.space, (dx, dy) => dx + dy > 4)
      cv.sticker(L => {
        L.rect(26, 26, 36, 12, P.stone); L.rect(26, 26, 36, 2, P.lstone); L.rect(26, 36, 36, 2, P.dstone)
        L.rect(40, 12, 8, 14, P.stone); L.rect(40, 38, 8, 14, P.stone)
        L.rect(34, 2, 2, 60, P.dstone); L.rect(20, 29, 6, 6, P.gray)
        L.rect(50, 8, 12, 4, P.dblue); L.rect(50, 52, 12, 4, P.dblue)
      }, { shadow: P.space })
      cv.sticker(L => { const t = T(L, 0, 0, 1); capsule(t, 4, 29) }, {})
      ;[[16, 32], [17, 31], [18, 32]].forEach(([x, y]) => cv.set(x, y, P.lyellow))
      cv.sticker(L => die(L, 50, 44, 9, 4), {})
      return cv
    },
  }),
}
