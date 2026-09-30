// Memory games.
import { Cv, text } from '../px.mjs'
import { P } from '../palette.mjs'
import { make, T, castGround, room, tabletop, HEART7, STAR5 } from '../kit.mjs'

function simonDisc(t) {
  t.disc(16, 14, 11, P.green, (dx, dy) => dx < 0 && dy < 0)
  t.disc(16, 14, 11, P.lcoral, (dx, dy) => dx >= 0 && dy < 0)
  t.disc(16, 14, 11, P.yellow, (dx, dy) => dx < 0 && dy >= 0)
  t.disc(16, 14, 11, P.blue, (dx, dy) => dx >= 0 && dy >= 0)
  t.disc(16, 14, 11, P.dgreen, (dx, dy) => dx < 0 && dy < 0 && dx * dx + dy * dy > 72)
  t.disc(16, 14, 11, P.dyellow, (dx, dy) => dx < 0 && dy >= 0 && dx * dx + dy * dy > 72)
  t.disc(16, 14, 11, P.dblue, (dx, dy) => dx >= 0 && dy >= 0 && dx * dx + dy * dy > 72)
  t.rect(15, 3, 2, 23, P.ink); t.rect(5, 13, 23, 2, P.ink)
  t.disc(16, 14, 4, P.ink2); t.disc(16, 14, 4, P.ink, (dx, dy) => dx + dy > 2)
  t.set(20, 6, P.white); t.set(21, 7, P.white)
}

function chimpHead(L, x = 0, y = 0) {
  L.disc(x + 7, y + 15, 3.2, P.brown); L.disc(x + 25, y + 15, 3.2, P.brown)
  L.disc(x + 7, y + 15, 1.6, P.skin); L.disc(x + 25, y + 15, 1.6, P.skin)
  L.disc(x + 16, y + 14, 9.5, P.brown)
  L.ellipse(x + 16, y + 19, 6.5, 4.5, P.skin); L.disc(x + 13, y + 13, 3.2, P.skin); L.disc(x + 19, y + 13, 3.2, P.skin)
  L.rect(x + 12, y + 12, 2, 3, P.ink); L.rect(x + 18, y + 12, 2, 3, P.ink); L.set(x + 12, y + 12, P.white); L.set(x + 18, y + 12, P.white)
  L.set(x + 15, y + 17, P.dskin); L.set(x + 17, y + 17, P.dskin)
  L.rect(x + 13, y + 20, 6, 1, P.dbrown); L.set(x + 12, y + 19, P.dbrown); L.set(x + 19, y + 19, P.dbrown)
  L.rect(x + 10, y + 6, 12, 1, P.dbrown)
}

function brain(L, x = 0, y = 0) {
  L.ellipse(x + 16, y + 15, 11, 8.5, P.pink)
  L.ellipse(x + 16, y + 15, 11, 8.5, P.magenta, (dx, dy) => dy > 5)
  ;[[9, 10, 12, 13], [20, 9, 23, 12], [7, 16, 10, 18], [22, 17, 25, 15], [13, 20, 17, 21]].forEach(([a, b, c, d]) => L.seg(x + a, y + b, x + c, y + d, 1, P.magenta))
  L.rect(x + 16, y + 7, 1, 16, P.magenta)
}

export default {
  simon: make({
    bg: P.ink2, dk: P.ink, lt: P.slate,
    obj: simonDisc,
    cast: { x: 0, y: 2, face: [16, 11, { sp: 4, mood: 'happy' }] },
    scene() {
      const cv = new Cv(64, 64, P.ink2)
      cv.dither(0, 0, 64, 64, P.ink, 0)
      cv.disc(46, 14, 15, P.dcoral, (dx, dy) => (Math.round(dx) + Math.round(dy)) % 2 === 0)
      cv.sticker(L => simonDisc(T(L, 0, -2, 2)), { shadow: P.night, sx: 2, sy: 2 })
      ;[P.green, P.lcoral, P.lcoral, P.blue, P.yellow].forEach((c, k) => cv.sticker(L => L.disc(14 + k * 9, 59, 2.5, c), {}))
      return cv
    },
  }),

  chimp: make({
    bg: P.purple, dk: P.dpurple, lt: P.lpurple,
    obj(t) {
      t.rrect(3, 4, 9, 9, P.yellow, 1); t.rect(4, 12, 7, 1, P.dyellow)
      t.rrect(19, 3, 9, 9, P.cream, 1); t.rect(20, 11, 7, 1, P.sand)
      t.rrect(11, 15, 9, 9, P.white, 1); t.rect(12, 23, 7, 1, P.cloud)
      t.rrect(22, 16, 7, 7, P.white, 1); t.rect(23, 22, 5, 1, P.cloud)
    },
    objectExtra(cv) { text(cv, 6, 6, '1', P.ink); text(cv, 22, 5, '2', P.ink) },
    cast: { draw() { const cv = castGround(P.purple, P.lpurple); cv.sticker(L => chimpHead(L, 0, 1), { shadow: P.dpurple }); return cv } },
    scene() {
      const cv = new Cv(64, 64, P.dpurple)
      cv.dither(0, 0, 64, 64, P.purple, 0)
      const tiles = [[6, 6, '1'], [30, 4, '2'], [48, 14, '3'], [14, 26, '4'], [38, 30, '5'], [6, 44, '6']]
      cv.sticker(L => tiles.forEach(([x, y], k) => { L.rrect(x, y, 11, 11, k === 0 ? P.yellow : P.white, 1); L.rect(x + 1, y + 10, 9, 1, k === 0 ? P.dyellow : P.cloud) }), { shadow: P.ink })
      tiles.forEach(([x, y, n], k) => { if (k < 2) text(cv, x + 4, y + 3, n, P.ink) })
      cv.sticker(L => chimpHead(L, 30, 32), { shadow: P.ink })
      return cv
    },
  }),

  numbermemory: make({
    bg: P.navy, dk: P.space, lt: P.lnavy,
    obj(t) { t.rrect(3, 8, 26, 15, P.stone, 2); t.rect(5, 10, 22, 11, P.ink); t.rect(3, 22, 26, 1, P.dstone) },
    objectExtra(cv) { text(cv, 5, 11, '471', P.lime, 2) },
    cast: { draw() { const cv = castGround(P.navy, P.lnavy); cv.sticker(L => { brain(L, 0, 1); }, { shadow: P.space }); cv.rect(11, 14, 2, 3, P.white); cv.rect(19, 14, 2, 3, P.white); cv.rect(12, 15, 1, 2, P.ink); cv.rect(19, 15, 1, 2, P.ink); cv.rect(14, 20, 4, 1, P.dred); return cv } },
    scene() {
      const cv = room(P.lnavy, { wall2: P.navy, table: P.ink2, edge: P.slate, dark: P.ink })
      cv.sticker(L => { L.rrect(5, 6, 54, 36, P.stone, 3); L.rect(8, 9, 48, 30, P.ink); L.rect(28, 42, 8, 5, P.dstone); L.rect(20, 47, 24, 3, P.stone) }, { shadow: P.space })
      text(cv, 13, 15, '83915', P.lime, 2)
      cv.rect(11, 32, 42, 3, P.ink2); cv.rect(11, 32, 28, 3, P.yellow)
      for (let y = 10; y < 39; y += 2) for (let x = 9; x < 56; x++) if (cv.get(x, y) === P.ink) cv.set(x, y, P.scan)
      return cv
    },
  }),

  visualmemory: make({
    bg: P.slate, dk: P.ink2, lt: P.gray,
    obj(t) {
      const lit = new Set([0, 4, 5, 7])
      for (let k = 0; k < 9; k++) {
        const x = 4 + (k % 3) * 9, y = 1 + Math.floor(k / 3) * 9
        t.rect(x, y, 7, 7, lit.has(k) ? P.yellow : P.ink2)
        t.rect(x, y, 7, 1, lit.has(k) ? P.lyellow : P.slate)
      }
    },
    cast: { draw() {
      const cv = castGround(P.slate, P.gray)
      const lit = new Set([0, 2, 6, 7, 8])
      cv.sticker(L => { for (let k = 0; k < 9; k++) { const x = 5 + (k % 3) * 8, y = 4 + Math.floor(k / 3) * 8; L.rect(x, y, 6, 6, lit.has(k) ? P.yellow : P.ink2); L.rect(x, y, 6, 1, lit.has(k) ? P.lyellow : P.slate) } }, { shadow: P.ink2 })
      return cv
    } },
    scene() {
      const cv = new Cv(64, 64, P.ink)
      const lit = new Set([1, 7, 8, 12, 18, 19, 23])
      for (let k = 0; k < 25; k++) {
        const x = 4 + (k % 5) * 11.5, y = 4 + Math.floor(k / 5) * 11.5
        const on = lit.has(k)
        if (on) cv.rect(Math.round(x) - 1, Math.round(y) - 1, 12, 12, P.dyellow)
        cv.rect(Math.round(x), Math.round(y), 10, 10, on ? P.yellow : P.ink2)
        cv.rect(Math.round(x), Math.round(y), 10, 1, on ? P.lyellow : P.slate)
      }
      cv.ring(32, 32, 7, 1, P.white); cv.rect(31, 24, 2, 3, P.white); cv.rect(31, 37, 2, 3, P.white)
      return cv
    },
  }),

  pairs: make({
    bg: P.teal, dk: P.dteal, lt: P.sky,
    obj(t) {
      const up = (x, y) => { t.rrect(x, y, 10, 11, P.cream, 1); t.rect(x + 1, y + 10, 8, 1, P.sand) }
      const down = (x, y) => { t.rrect(x, y, 10, 11, P.blue, 1); t.rect(x + 2, y + 2, 6, 7, P.lblue); t.rect(x + 3, y + 3, 4, 5, P.dblue); t.rect(x + 1, y + 10, 8, 1, P.dblue) }
      up(5, 3); down(17, 3); down(5, 15); up(17, 15)
    },
    objectExtra(cv) { cv.spr(7, 6, HEART7, { '#': P.red }); cv.spr(19, 18, HEART7, { '#': P.red }) },
    cast: { draw() {
      const cv = castGround(P.teal, P.sky)
      cv.sticker(L => { L.rrect(9, 4, 14, 20, P.cream, 2); L.rect(10, 23, 12, 1, P.sand) }, { shadow: P.dteal })
      cv.spr(12, 7, HEART7, { '#': P.red }); cv.set(13, 8, P.pink)
      cv.rect(12, 16, 2, 3, P.ink); cv.rect(18, 16, 2, 3, P.ink); cv.rect(15, 20, 2, 1, P.ink)
      return cv
    } },
    scene() {
      const cv = tabletop(14, { wood: P.dteal, grain: P.ink2, fleck: P.teal })
      const icons = { '0,0': 'h', '3,1': 'h', '1,2': 's', '2,0': 'down', '1,0': 'down', '3,0': 'down', '0,1': 'down', '1,1': 'down', '2,1': 'down', '0,2': 'down', '2,2': 'down', '3,2': 's' }
      cv.sticker(L => {
        for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
          const x = 4 + i * 15, y = 6 + j * 18, k = icons[`${i},${j}`]
          if (k === 'down') { L.rrect(x, y, 12, 15, P.blue, 1); L.rect(x + 2, y + 2, 8, 11, P.lblue); L.rect(x + 3, y + 3, 6, 9, P.dblue) } else L.rrect(x, y, 12, 15, P.cream, 1)
        }
      }, { shadow: P.ink })
      cv.spr(6, 11, HEART7, { '#': P.red }); cv.spr(51, 29, HEART7, { '#': P.red })
      cv.spr(23, 47, STAR5, { '#': P.yellow }); cv.spr(50, 47, STAR5, { '#': P.yellow })
      cv.ring(56.5, 48.5, 9, 1, P.lyellow); cv.ring(25.5, 48.5, 9, 1, P.lyellow)
      return cv
    },
  }),
}

