// The first ten games, drawn for the design review (Lavish board
// games-pixel-thumbnails-s1) and approved as drawn.
import { Cv, text } from '../px.mjs'
import { P } from '../palette.mjs'
import { objectGround, castGround, coin5, COIN8, X4, O4, pencil, ghost, pac, spikedMine, rng, stars } from '../kit.mjs'

const G = {
  tictactoe: { bg: P.coral, dk: P.dcoral, lt: P.lcoral },
  connectfour: { bg: P.blue, dk: P.dblue, lt: P.lblue },
  pong: { bg: P.green, dk: P.dgreen, lt: P.lgreen },
  snake: { bg: P.dgreen, dk: P.ddgreen, lt: P.moss },
  pacmac: { bg: P.space, dk: P.night, lt: P.lspace },
  spaceduel: { bg: P.navy, dk: P.space, lt: P.lnavy },
  battleship: { bg: P.sea, dk: P.dsea, lt: P.lsea },
  minesweeper: { bg: P.stone, dk: P.dstone, lt: P.lstone },
  hangwoman: { bg: P.cream, dk: P.sand, lt: P.lcream },
  sketch: { bg: P.lpurple, dk: P.purple, lt: P.lilac },
}

void X4; void O4

export default {
  // ───────────────────────────── TIC TAC TOE ─────────────────────────────
  tictactoe: {
    object() {
      const g = G.tictactoe, cv = objectGround(g.bg, g.dk)
      cv.sticker(L => {
        L.seg(5, 5, 16, 16, 5.2, P.sand); L.seg(16, 5, 5, 16, 5.2, P.sand)
        L.seg(5, 4, 16, 15, 5.2, P.cream); L.seg(16, 4, 5, 15, 5.2, P.cream)
        L.set(5, 3, P.white); L.set(6, 4, P.white); L.set(4, 4, P.white)
      }, { shadow: g.dk })
      cv.sticker(L => {
        L.ring(21, 20, 8.2, 4, P.dteal)
        L.ring(21, 19, 8.2, 4, P.teal)
        L.set(15, 15, P.sky); L.set(16, 14, P.sky); L.set(17, 13, P.sky)
      }, { shadow: g.dk })
      return cv
    },
    cast() {
      const g = G.tictactoe, cv = castGround(g.bg, g.lt)
      cv.sticker(L => {
        L.seg(4, 9, 15, 20, 5.4, P.cream); L.seg(15, 9, 4, 20, 5.4, P.cream)
        L.seg(4, 19, 5, 20, 3, P.sand); L.seg(15, 19, 14, 20, 3, P.sand)
        L.rect(7, 12, 1, 2, P.ink); L.rect(12, 12, 1, 2, P.ink)
        L.set(6, 10, P.ink); L.set(7, 11, P.ink); L.set(13, 10, P.ink); L.set(12, 11, P.ink)
        L.rect(8, 16, 4, 1, P.ink); L.set(8, 15, P.ink)
      }, { shadow: g.dk })
      cv.sticker(L => {
        L.ball(22.5, 17.5, 7.5, P.teal, P.sky, P.dteal)
        L.rect(19, 14, 2, 3, P.white); L.rect(24, 14, 2, 3, P.white)
        L.set(20, 15, P.ink); L.set(20, 16, P.ink); L.set(24, 15, P.ink); L.set(24, 16, P.ink)
        L.ring(22.5, 21, 2, 1, P.ink)
      }, { shadow: g.dk })
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.brown)
      for (let y = 0; y < 64; y += 13) cv.rect(0, y, 64, 1, P.dbrown)
      const r = rng(7)
      for (let k = 0; k < 90; k++) cv.set(Math.floor(r() * 64), Math.floor(r() * 64), k % 3 ? P.dbrown : P.sand)
      cv.sticker(L => {
        L.rect(7, 5, 49, 53, P.cream)
        L.rect(7, 5, 49, 3, P.coral)
        for (let y = 14; y < 58; y += 6) L.rect(8, y, 47, 1, P.paper)
      }, { shadow: P.dbrown, sx: 2, sy: 2 })
      const gx = [12, 26, 40], gy = [13, 27, 41]
      cv.rect(24, 12, 2, 41, P.ink2); cv.rect(38, 12, 2, 41, P.ink2)
      cv.rect(11, 24, 41, 2, P.ink2); cv.rect(11, 38, 41, 2, P.ink2)
      const X = (c, rr) => { const x = gx[c], y = gy[rr]; cv.seg(x + 2, y + 1, x + 9, y + 8, 2.4, P.ink); cv.seg(x + 9, y + 1, x + 2, y + 8, 2.4, P.ink) }
      const O = (c, rr) => { cv.ring(gx[c] + 5.5, gy[rr] + 4.5, 4.6, 2, P.teal) }
      X(0, 0); X(1, 1); X(2, 2); O(2, 0); O(0, 2); O(1, 0)
      cv.seg(12, 12, 51, 51, 2.2, P.red)
      // pencil lying across the corner
      const L = new Cv(64, 64)
      pencil(L, 44, 62, 63, 45, 5)
      L.outline(P.ink)
      cv.draw(L, 1, 1, P.dbrown); cv.draw(L)
      return cv
    },
  },

  // ───────────────────────────── CONNECT FOUR ─────────────────────────────
  connectfour: {
    object() {
      const g = G.connectfour, cv = objectGround(g.bg, g.dk)
      cv.sticker(L => {
        L.rect(2, 12, 27, 17, P.dblue)
        L.rect(2, 12, 27, 1, P.lblue)
        L.rect(27, 13, 2, 16, P.navy)
        const cells = ['.ry.', 'ryrr']
        cells.forEach((row, j) => [...row].forEach((ch, i) => coin5(L, 4 + i * 6, 15 + j * 7, ch)))
      }, { shadow: g.dk })
      cv.sticker(L => L.spr(12, 1, COIN8, { o: P.yellow, l: P.lyellow, d: P.dyellow }), { shadow: g.dk })
      cv.rect(12, 12, 8, 1, P.ink)
      return cv
    },
    cast() {
      const g = G.connectfour, cv = castGround(g.bg, g.lt)
      cv.sticker(L => {
        L.ball(16, 14, 8.3, P.red, P.pink, P.dred)
        L.ring(16, 14, 5.4, 1, P.dred)
        L.rect(12, 9, 3, 4, P.white); L.rect(18, 9, 3, 4, P.white)
        L.rect(13, 10, 2, 2, P.ink); L.rect(19, 10, 2, 2, P.ink)
        L.rect(13, 15, 7, 1, P.ink); L.set(12, 14, P.ink); L.set(20, 14, P.ink)
      }, { shadow: g.dk })
      cv.sticker(L => {
        L.rect(1, 20, 30, 12, P.dblue)
        L.rect(1, 20, 30, 1, P.lblue)
        L.disc(7, 26.5, 3.2, P.night); L.ball(24.5, 26.5, 3.2, P.yellow, P.lyellow, P.dyellow)
        L.disc(16, 27, 3.2, P.night)
        L.rect(15, 26, 1, 2, P.white); L.rect(17, 26, 1, 2, P.white)
        L.rect(10, 20, 12, 1, P.ink)
      }, { shadow: g.dk })
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.cloud)
      cv.dither(0, 0, 64, 64, P.lstone, 0)
      for (let x = 4; x < 64; x += 12) cv.rect(x, 0, 1, 50, P.lstone)
      cv.rect(0, 50, 64, 14, P.brown); cv.rect(0, 50, 64, 2, P.sand); cv.dither(0, 56, 64, 8, P.dbrown, 0)
      cv.sticker(L => {
        L.poly([[5, 54], [11, 46], [13, 46], [9, 54]], P.navy)
        L.poly([[58, 54], [52, 46], [50, 46], [54, 54]], P.navy)
        L.rect(6, 14, 52, 36, P.blue)
        L.rect(6, 14, 52, 2, P.lblue); L.rect(54, 16, 4, 34, P.dblue)
        const grid = [
          'y.....',
          'r...y.',
          'yr.yr.',
          'ryyrr.',
        ]
        grid.forEach((row, j) => [...row].forEach((ch, i) => {
          const cx = 12.5 + i * 8, cy = 21.5 + j * 8
          if (ch === '.') L.disc(cx, cy, 2.8, P.navy)
          else if (ch === 'r') L.ball(cx, cy, 2.8, P.red, P.pink, P.dred)
          else L.ball(cx, cy, 2.8, P.yellow, P.lyellow, P.dyellow)
        }))
      }, { shadow: P.stone, sx: 2, sy: 1 })
      cv.sticker(L => L.ball(44.5, 6.5, 3.6, P.yellow, P.lyellow, P.dyellow), {})
      cv.rect(44, 0, 1, 1, P.gray); cv.rect(45, 1, 1, 0, P.gray)
      cv.rect(41, 0, 1, 2, P.stone); cv.rect(48, 0, 1, 2, P.stone)
      // winning diagonal highlight
      ;[[12.5, 45.5], [20.5, 37.5], [28.5, 29.5]].forEach(([x, y]) => cv.ring(x, y, 3.8, 1, P.white))
      return cv
    },
  },

  // ───────────────────────────── PONG ─────────────────────────────
  pong: {
    object() {
      const g = G.pong, cv = objectGround(g.bg, g.dk)
      for (let y = 1; y < 28; y += 4) cv.rect(24, y, 1, 2, g.lt)
      ;[[9, 20, 1.6], [12, 18, 2], [15, 16, 2.6]].forEach(([x, y, r]) => { const t = new Cv(32, 32); t.disc(x, y, r, 1); cv.draw(t, 0, 0, g.lt) })
      cv.dither(8, 14, 10, 8, g.bg, 1, g.lt)
      cv.sticker(L => {
        L.rrect(3, 7, 6, 18, P.cream, 2)
        L.rect(7, 8, 1, 16, P.sand); L.rect(4, 9, 1, 4, P.white)
      }, { shadow: g.dk })
      cv.sticker(L => L.ball(19.5, 13.5, 3.8, P.white, null, P.cloud), { shadow: g.dk })
      cv.sticker(L => { L.rrect(28, 16, 5, 14, P.coral, 2); L.rect(28, 17, 1, 11, P.lcoral) }, { shadow: g.dk })
      return cv
    },
    cast() {
      const g = G.pong, cv = castGround(g.bg, g.lt)
      ;[[3, 11, 7], [2, 16, 9], [4, 21, 6]].forEach(([x, y, w]) => cv.rect(x, y, w, 1, P.white))
      cv.sticker(L => {
        L.ball(16, 16, 8, P.white, null, P.cloud)
        L.rect(12, 12, 2, 3, P.ink); L.rect(18, 12, 2, 3, P.ink)
        L.set(11, 10, P.ink); L.set(12, 10, P.ink); L.set(19, 10, P.ink); L.set(20, 10, P.ink)
        L.rect(14, 18, 4, 3, P.ink); L.rect(15, 20, 2, 1, P.coral)
      }, { shadow: g.dk })
      cv.sticker(L => { L.rrect(26, 4, 5, 24, P.coral, 2); L.rect(26, 5, 1, 21, P.lcoral) }, { shadow: g.dk })
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.ink2)
      cv.dither(0, 0, 64, 64, P.ink, 0)
      cv.rect(0, 52, 64, 12, P.dbrown); cv.rect(0, 52, 64, 1, P.brown)
      // green glow
      const glow = new Cv(64, 64); glow.rrect(4, 5, 56, 46, 1, 6)
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (glow.get(x, y) && (x + y) % 2 && cv.get(x, y) === P.ink2) cv.set(x, y, P.ddgreen)
      cv.sticker(L => {
        L.line(22, 7, 16, 1, P.gray); L.line(40, 7, 47, 1, P.gray)
        L.rrect(8, 8, 48, 40, P.stone, 3)
        L.rect(8, 44, 48, 4, P.dstone)
        L.rrect(11, 11, 34, 30, P.night, 3)
        L.rect(48, 14, 5, 5, P.ink2); L.set(50, 16, P.gray)
        L.rect(48, 22, 5, 5, P.ink2); L.set(51, 24, P.gray)
        for (let y = 30; y < 41; y += 2) L.rect(48, y, 5, 1, P.dstone)
        L.rect(14, 48, 6, 3, P.ink2); L.rect(44, 48, 6, 3, P.ink2)
      }, { shadow: P.ink })
      // screen contents
      const phos = P.lime
      cv.rect(14, 18, 2, 8, phos); cv.rect(40, 25, 2, 8, phos)
      for (let y = 13; y < 40; y += 4) cv.rect(28, y, 1, 2, P.dgreen)
      cv.rect(33, 21, 2, 2, P.white)
      cv.set(31, 22, P.green); cv.set(29, 23, P.dgreen)
      text(cv, 20, 13, '3', phos); text(cv, 33, 13, '2', phos)
      for (let y = 12; y < 41; y += 2) for (let x = 12; x < 45; x++) {
        const c = cv.get(x, y)
        if (c === P.night) cv.set(x, y, P.scan)
      }
      cv.set(13, 12, P.slate); cv.set(14, 12, P.slate); cv.set(13, 13, P.slate)
      return cv
    },
  },

  // ───────────────────────────── SNAKE BATTLE ─────────────────────────────
  snake: {
    object() {
      const g = G.snake, cv = objectGround(g.bg, g.dk)
      cv.sticker(L => {
        L.ring(15.5, 19.5, 9.5, 5, P.lime)
        L.disc(15.5, 19.5, 9.5, P.green, (dx, dy) => dx * dx + dy * dy > 4.5 * 4.5 + 3 && dy > 2)
        for (let a = 0; a < 6.28; a += 0.7) L.set(Math.round(15.5 + Math.cos(a) * 7), Math.round(19.5 + Math.sin(a) * 7), P.dgreen)
        L.ellipse(20, 8.5, 6.5, 4.5, P.lime)
        L.ellipse(20, 10.5, 6, 2.2, P.green, (dx, dy) => dy > 0)
        L.rect(21, 6, 3, 3, P.white); L.rect(22, 6, 2, 2, P.ink)
        L.set(25, 9, P.dgreen)
        L.rect(27, 10, 3, 1, P.red); L.set(30, 9, P.red); L.set(30, 11, P.red)
      }, { shadow: g.dk })
      cv.sticker(L => { L.ball(5.5, 7.5, 3, P.red, P.pink, P.dred); L.set(6, 3, P.lime); L.set(7, 3, P.lime) }, { shadow: g.dk })
      return cv
    },
    cast() {
      const g = G.snake, cv = castGround(g.bg, g.lt)
      cv.sticker(L => {
        L.rect(11, 22, 10, 10, P.lime); L.rect(18, 22, 3, 10, P.green)
        for (let y = 24; y < 32; y += 3) { L.set(13, y, P.green); L.set(16, y + 1, P.green) }
        L.ellipse(16, 14.5, 10.5, 8, P.lime)
        L.ellipse(16, 18, 10, 4.5, P.green, (dx, dy) => dy > 1)
        ;[[9, 8], [22, 7], [16, 6]].forEach(([x, y]) => { L.set(x, y, P.green); L.set(x + 1, y, P.green) })
        L.disc(10.5, 12.5, 3.2, P.white); L.disc(21.5, 12.5, 3.2, P.white)
        L.rect(11, 12, 2, 3, P.ink); L.rect(22, 12, 2, 3, P.ink)
        L.set(11, 11, P.white); L.set(22, 11, P.white)
        L.set(14, 17, P.dgreen); L.set(18, 17, P.dgreen)
        L.rect(12, 19, 9, 1, P.dgreen); L.set(11, 18, P.dgreen); L.set(21, 18, P.dgreen)
        L.rect(16, 20, 1, 5, P.red); L.set(15, 25, P.red); L.set(17, 25, P.red)
      }, { shadow: g.dk })
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.dgreen)
      for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) if (((x + y) / 4) % 2) cv.rect(x, y, 4, 4, P.felt)
      cv.box(0, 0, 64, 64, P.ddgreen); cv.box(1, 1, 62, 62, P.ddgreen)
      const body = (pts, c, sh) => {
        for (let k = 0; k + 1 < pts.length; k++) {
          const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]
          const xa = Math.min(x0, x1), ya = Math.min(y0, y1)
          cv.rect(xa, ya, Math.abs(x1 - x0) + 4, Math.abs(y1 - y0) + 4, c)
        }
        for (let k = 0; k + 1 < pts.length; k++) {
          const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]
          const xa = Math.min(x0, x1), ya = Math.min(y0, y1)
          if (y0 === y1) cv.rect(xa, ya + 3, Math.abs(x1 - x0) + 4, 1, sh)
          else cv.rect(xa + 3, ya, 1, Math.abs(y1 - y0) + 4, sh)
        }
      }
      body([[4, 52], [28, 52], [28, 36], [16, 36], [16, 20], [36, 20]], P.lime, P.green)
      cv.sticker(L => { L.rrect(36, 19, 6, 6, P.lime, 1); L.set(39, 20, P.ink); L.set(39, 22, P.ink); L.rect(42, 21, 2, 1, P.red) }, {})
      body([[60, 8], [52, 8], [52, 44], [44, 44]], P.lpurple, P.purple)
      cv.sticker(L => { L.rrect(38, 43, 6, 6, P.lpurple, 1); L.set(40, 44, P.ink); L.set(40, 46, P.ink); L.rect(36, 45, 2, 1, P.red) }, {})
      cv.sticker(L => { L.ball(47.5, 26.5, 3.2, P.red, P.pink, P.dred); L.rect(48, 22, 2, 1, P.lime) }, { shadow: P.ddgreen })
      cv.sticker(L => { L.ball(10.5, 10.5, 2.5, P.red, P.pink, P.dred) }, { shadow: P.ddgreen })
      return cv
    },
  },

  // ───────────────────────────── PAC MAC ─────────────────────────────
  pacmac: {
    object() {
      const g = G.pacmac, cv = objectGround(g.bg, g.dk)
      cv.rect(22, 15, 2, 2, P.cream); cv.rect(27, 15, 2, 2, P.cream)
      cv.sticker(L => { pac(L, 13, 15.5, 10.5, 0.66, 1); L.rect(12, 7, 2, 2, P.ink) }, { shadow: g.dk })
      return cv
    },
    cast() {
      const g = G.pacmac, cv = castGround(g.bg, g.lt)
      cv.rect(3, 26, 26, 1, P.mazeblue)
      cv.sticker(L => ghost(L, 19, 10, P.blue, 'scared'), { shadow: g.dk })
      cv.sticker(L => { pac(L, 9, 16, 7.5, 0.7, 1); L.rect(8, 10, 2, 2, P.ink); L.set(7, 9, P.ink); L.set(9, 9, P.ink) }, { shadow: g.dk })
      cv.set(29, 9, P.white); cv.set(30, 8, P.white); cv.set(18, 7, P.sky); cv.set(18, 8, P.sky)
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.night)
      const wall = new Cv(64, 64)
      wall.box(0, 0, 64, 64, 1); wall.box(1, 1, 62, 62, 1); wall.box(2, 2, 60, 60, 1); wall.box(3, 3, 58, 58, 1)
      ;[[12, 12, 12, 8], [32, 12, 20, 8], [12, 28, 6, 16], [26, 28, 12, 8], [46, 28, 6, 16], [26, 44, 12, 0], [12, 52, 0, 0]].forEach(([x, y, w, h]) => wall.rrect(x, y, w, h, 1, 1))
      wall.rrect(26, 42, 12, 4, 1, 1)
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        if (!wall.get(x, y)) continue
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy
          return nx >= 0 && ny >= 0 && nx < 64 && ny < 64 && !wall.get(nx, ny)
        })
        cv.set(x, y, edge ? P.mazeblue : P.mazedark)
      }
      const dot = (x, y) => cv.rect(x, y, 2, 2, P.sand)
      for (let x = 8; x <= 56; x += 6) dot(x, 7)
      for (let y = 13; y <= 49; y += 6) { dot(7, y); dot(56, y) }
      for (let x = 20; x <= 42; x += 6) dot(x, 23)
      for (let y = 29; y <= 43; y += 7) { dot(21, y); dot(41, y) }
      cv.disc(56.5, 56.5, 2.2, P.cream)
      cv.sticker(L => { pac(L, 30, 55.5, 4.3, 0.7, -1) ; L.set(30, 53, P.ink) }, { outline: null })
      cv.sticker(L => ghost(L, 8, 51, P.red, 'look', 9), { outline: null })
      cv.sticker(L => ghost(L, 40, 51, P.pink, 'look', 9), { outline: null })
      for (let x = 20; x <= 26; x += 6) dot(x, 55)
      return cv
    },
  },

  // ───────────────────────────── SPACE DUEL ─────────────────────────────
  spaceduel: {
    object() {
      const g = G.spaceduel, cv = objectGround(g.bg, g.dk)
      stars(cv, 26, 3, [P.cloud, P.sky, P.white], g.bg)
      cv.sticker(L => {
        L.poly([[11, 17], [6, 25], [11, 24]], P.red); L.poly([[21, 17], [26, 25], [21, 24]], P.red)
        L.ellipse(16, 14, 5.2, 10.5, P.white)
        L.ellipse(16, 14, 5.2, 10.5, P.cloud, (dx) => dx > 2)
        L.ellipse(16, 14, 5.2, 10.5, P.red, (dx, dy) => dy < -6.5)
        L.ring(16, 12, 2.6, 1, P.slate); L.disc(16, 12, 1.7, P.sky); L.set(15, 11, P.white)
        L.rect(15, 18, 2, 7, P.red)
      }, { shadow: g.dk })
      cv.sticker(L => { L.poly([[13, 26], [19, 26], [16, 31]], P.orange); L.poly([[15, 26], [17, 26], [16, 29]], P.yellow) }, { outline: null })
      return cv
    },
    cast() {
      const g = G.spaceduel, cv = castGround(g.bg, g.lt)
      stars(cv, 14, 11, [P.white, P.sky], g.bg)
      cv.sticker(L => {
        L.rrect(5, 25, 22, 8, P.white, 3); L.rect(5, 28, 22, 2, P.red)
        L.ball(16, 14, 11, P.white, null, P.cloud)
        L.rect(15, 1, 2, 3, P.gray); L.rect(15, 0, 2, 1, P.red)
        L.ellipse(16, 14.5, 7.5, 5.5, P.night)
        L.seg(10, 12, 13, 9.5, 1.4, P.sky); L.set(20, 17, P.slate); L.set(21, 16, P.slate)
        L.rect(12, 14, 2, 2, P.cream); L.rect(18, 14, 2, 2, P.cream)
        L.rect(14, 18, 4, 1, P.cream)
      }, { shadow: g.dk })
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.night)
      cv.dither(0, 24, 64, 20, P.space, 0); cv.rect(0, 44, 64, 20, P.space); cv.dither(0, 52, 64, 12, P.navy, 1)
      stars(cv, 70, 42, [P.white, P.cloud, P.sky, P.lyellow], null)
      // ringed planet
      cv.disc(10, 54, 13, P.orange); cv.disc(10, 54, 13, P.dcoral, (dx, dy) => dx + dy > 6)
      cv.dither(0, 41, 26, 26, P.coral, 0, P.orange)
      cv.seg(-6, 50, 30, 43, 1.6, P.sand)
      // bolts
      ;[[22, 38], [30, 33], [38, 28]].forEach(([x, y]) => cv.seg(x, y, x + 4, y - 2, 1.5, P.lyellow))
      const shipR = ['..##.....', '..###....', '.#####...', '########.', '#########', '########.', '.#####...', '..###....', '..##.....']
      cv.sticker(L => {
        L.spr(8, 36, shipR, { '#': P.teal }); L.rect(12, 39, 2, 3, P.sky); L.spr(8, 36, ['..##', '..#.'], { '#': P.dteal })
        L.rect(6, 39, 2, 3, P.orange); L.set(5, 40, P.yellow)
      }, {})
      const shipL = shipR.map(r => [...r].reverse().join(''))
      cv.sticker(L => {
        L.spr(46, 18, shipL, { '#': P.coral }); L.rect(49, 21, 2, 3, P.lyellow)
        L.rect(55, 21, 2, 3, P.orange); L.set(57, 22, P.yellow)
      }, {})
      // hit spark
      cv.spr(42, 21, ['..#..', '.###.', '##.##', '.###.', '..#..'], { '#': P.yellow })
      cv.set(44, 23, P.white)
      return cv
    },
  },

  // ───────────────────────────── BATTLESHIP ─────────────────────────────
  battleship: {
    object() {
      const g = G.battleship, cv = new Cv(32, 32, g.bg)
      cv.rect(0, 24, 32, 8, g.dk)
      cv.sticker(L => {
        L.rect(16, 3, 1, 9, P.ink2); L.rect(17, 3, 3, 2, P.red)
        L.rect(13, 10, 7, 5, P.cloud); L.rect(14, 11, 5, 1, P.ink2); L.rect(18, 11, 2, 4, P.gray)
        L.rect(9, 14, 14, 4, P.lstone); L.rect(20, 14, 3, 4, P.gray)
        L.rrect(23, 16, 4, 3, P.gray, 1); L.rect(27, 16, 4, 1, P.ink2)
        L.rrect(4, 16, 4, 3, P.gray, 1); L.rect(1, 16, 3, 1, P.ink2)
        L.poly([[1, 18.5], [31, 18.5], [27.5, 26], [5, 26]], P.stone)
        L.poly([[18, 18.5], [31, 18.5], [27.5, 26], [18, 26]], P.dstone)
        L.rect(4, 24, 25, 2, P.red)
        for (let x = 7; x < 27; x += 3) L.set(x, 21, P.ink2)
      }, { shadow: g.dk })
      for (let x = 0; x < 32; x += 6) { cv.rect(x, 27, 3, 1, P.cream); cv.rect(x + 3, 30, 2, 1, P.lsea) }
      cv.rect(3, 26, 27, 1, P.white)
      cv.dither(0, 25, 32, 1, g.dk, 1, g.bg)
      return cv
    },
    cast() {
      const g = G.battleship, cv = castGround(g.bg, g.lt)
      cv.sticker(L => {
        L.seg(20, 12, 27, 8.5, 2, P.ink2)
        L.rrect(11, 9, 10, 8, P.cloud, 2); L.rect(13, 11, 6, 2, P.ink2); L.rect(19, 10, 2, 7, P.gray)
        L.poly([[2, 16.5], [30, 16.5], [26, 26.5], [6, 26.5]], P.stone)
        L.poly([[2, 16.5], [30, 16.5], [29.2, 18.5], [2.8, 18.5]], P.lstone)
        L.rect(11, 19, 3, 4, P.white); L.rect(19, 19, 3, 4, P.white)
        L.rect(12, 20, 2, 3, P.ink); L.rect(20, 20, 2, 3, P.ink)
        L.rect(14, 24, 5, 1, P.ink2)
        L.rect(6, 25, 20, 2, P.red)
      }, { shadow: g.dk })
      cv.sticker(L => { L.disc(28.5, 6.5, 2.6, P.white); L.disc(26, 4.5, 1.8, P.cloud); L.disc(30, 3, 1.3, P.cloud) }, { outline: null })
      for (let x = 2; x < 31; x += 5) cv.rect(x, 28, 3, 1, P.white)
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.sky)
      cv.dither(0, 12, 64, 12, P.haze, 0); cv.rect(0, 24, 64, 10, P.haze); cv.dither(0, 30, 64, 4, P.cream, 1)
      cv.rect(0, 34, 64, 30, P.sea); cv.dither(0, 34, 64, 3, P.sky, 0); cv.dither(0, 48, 64, 16, P.dsea, 0)
      for (let k = 0; k < 14; k++) { const x = (k * 23) % 60, y = 38 + ((k * 7) % 22); cv.rect(x, y, 3, 1, P.lsea) }
      // far enemy ship, hit
      cv.poly([[40, 31], [61, 31], [59, 35], [42, 35]], P.slate)
      cv.rect(47, 27, 6, 4, P.slate); cv.rect(49, 23, 1, 4, P.slate)
      cv.disc(52, 22, 5, P.gray); cv.disc(56, 17, 4, P.cloud); cv.disc(49, 18, 3.5, P.gray)
      cv.spr(47, 24, ['..#.#..', '.#####.', '###.###', '.#####.', '..#.#..'], { '#': P.orange })
      cv.set(50, 26, P.yellow); cv.set(49, 25, P.yellow); cv.set(51, 25, P.yellow)
      // splash
      cv.sticker(L => { L.rect(30, 26, 3, 9, P.white); L.rect(28, 30, 2, 5, P.cloud); L.rect(33, 29, 2, 6, P.cloud); L.set(31, 24, P.white) }, { outline: null })
      // near ship firing
      cv.sticker(L => {
        L.rect(15, 20, 1, 8, P.ink2); L.rect(16, 20, 4, 2, P.red)
        L.rect(10, 26, 11, 6, P.cloud); L.rect(12, 28, 7, 1, P.ink2); L.rect(18, 26, 3, 6, P.gray)
        L.rect(4, 31, 24, 4, P.lstone)
        L.rrect(22, 32, 5, 3, P.gray, 1); L.seg(27, 32.5, 34, 30, 1.2, P.ink2)
        L.poly([[-2, 34.5], [34, 34.5], [30, 44], [2, 44]], P.stone)
        L.poly([[20, 34.5], [34, 34.5], [30, 44], [20, 44]], P.dstone)
        L.rect(1, 42, 30, 2, P.red)
        for (let x = 5; x < 29; x += 4) L.set(x, 37, P.ink2)
      }, {})
      cv.spr(35, 27, ['.#.', '###', '.#.'], { '#': P.yellow }); cv.set(36, 28, P.white)
      for (let x = 0; x < 36; x += 3) cv.set(x, 45, P.white)
      cv.rect(0, 46, 34, 1, P.cream); cv.dither(0, 47, 30, 1, P.white, 0)
      return cv
    },
  },

  // ───────────────────────────── MINE RACE ─────────────────────────────
  minesweeper: {
    object() {
      const g = G.minesweeper, cv = new Cv(32, 32, g.lt)
      for (let k = 0; k < 32; k += 8) { cv.rect(k, 0, 1, 32, g.bg); cv.rect(0, k, 32, 1, g.bg) }
      text(cv, 3, 2, '1', P.blue); text(cv, 26, 2, '2', P.green); text(cv, 3, 26, '3', P.red)
      cv.sticker(L => spikedMine(L, 16, 16, 7.5), { shadow: g.bg })
      return cv
    },
    cast() {
      const g = G.minesweeper, cv = castGround(g.bg, g.lt)
      cv.sticker(L => {
        spikedMine(L, 16, 18, 7.5)
        L.rect(12, 16, 3, 3, P.white); L.rect(18, 16, 3, 3, P.white)
        L.rect(13, 17, 2, 2, P.ink); L.rect(18, 17, 2, 2, P.ink)
        L.seg(11, 14, 15, 15.5, 1, P.cream); L.seg(21, 14, 17, 15.5, 1, P.cream)
        L.rect(13, 21, 7, 2, P.white); L.set(15, 21, P.ink2); L.set(17, 21, P.ink2); L.set(15, 22, P.ink2); L.set(17, 22, P.ink2)
        L.rect(17, 3, 1, 8, P.ink); L.poly([[18, 3], [24, 5.5], [18, 8]], P.red)
      }, { shadow: g.dk })
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.dstone)
      // 7×7 board of 8px tiles with a 4px frame
      const T = 8, O = 4
      // Consistent minefield: numbers are computed from the mines, and the
      // open region is a real flood fill from a zero cell.
      const N = 7
      const mines = new Set(['3,0', '6,1', '0,3', '2,5', '5,5', '6,6', '0,6'])
      const count = (i, j) => { let n = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (mines.has(`${i + a},${j + b}`)) n++; return n }
      const open = new Set(), stack = [[3, 3]]
      while (stack.length) {
        const [i, j] = stack.pop(), k = `${i},${j}`
        if (i < 0 || j < 0 || i >= N || j >= N || open.has(k) || mines.has(k)) continue
        open.add(k)
        if (count(i, j) === 0) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) stack.push([i + a, j + b])
      }
      const flags = new Set(['3,0', '0,3', '5,5'])
      const board = Array.from({ length: N }, (_, j) => Array.from({ length: N }, (_, i) => {
        const k = `${i},${j}`
        if (k === '2,5') return '*'
        if (open.has(k)) return String(count(i, j) || '.')
        return flags.has(k) ? 'F' : '#'
      }).join(''))
      board.forEach((row, j) => [...row].forEach((ch, i) => {
        const x = O + i * T, y = O + j * T
        if (ch === '#' || ch === 'F') {
          cv.rect(x, y, T, T, P.tile); cv.rect(x, y, T, 1, P.white); cv.rect(x, y, 1, T, P.white)
          cv.rect(x, y + T - 1, T, 1, P.stone); cv.rect(x + T - 1, y, 1, T, P.stone)
          if (ch === 'F') cv.spr(x + 1, y + 1, ['..rr#', 'rrrr#', '..rr#', '....#', '..###', '.####'], { r: P.red, '#': P.ink })
        } else {
          cv.rect(x, y, T, T, ch === '*' ? P.red : P.tiledk); cv.rect(x, y, T, 1, P.dstone); cv.rect(x, y, 1, T, P.dstone)
          const c = { 1: P.blue, 2: P.dgreen, 3: P.dred }[ch]
          if (c) text(cv, x + 3, y + 2, ch, c)
          if (ch === '*') cv.spr(x + 1, y + 1, ['...#...', '.#####.', '.#w###.', '#######', '.#####.', '.#####.', '...#...'], { '#': P.ink, w: P.white })
        }
      }))
      // two racers' cursors
      const arrow = ['#....', '##...', '#.#..', '#..#.', '#.###', '##...']
      const fillA = ['.....', '.....', '.#...', '.##..', '.....', '.....']
      cv.spr(35, 23, arrow, { '#': P.ink }); cv.spr(35, 23, fillA, { '#': P.teal })
      cv.spr(48, 46, arrow, { '#': P.ink }); cv.spr(48, 46, fillA, { '#': P.purple })
      return cv
    },
  },

  // ───────────────────────────── HANGWOMAN ─────────────────────────────
  hangwoman: {
    object() {
      const g = G.hangwoman, cv = objectGround(g.bg, g.dk)
      cv.sticker(L => {
        L.rect(2, 26, 14, 3, P.brown); L.rect(2, 26, 14, 1, P.sand)
        L.rect(5, 3, 3, 23, P.brown); L.rect(7, 3, 1, 23, P.dbrown)
        L.rect(5, 3, 17, 3, P.brown); L.rect(5, 5, 17, 1, P.dbrown)
        L.seg(8, 10, 12, 6, 2, P.brown)
      }, { shadow: g.dk })
      cv.sticker(L => { L.rect(20, 6, 1, 5, P.sand); L.ring(20.5, 14, 3.2, 1.2, P.sand); L.set(20, 11, P.brown) }, { shadow: g.dk })
      cv.sticker(L => {
        L.rect(18, 20, 6, 7, P.white); L.rect(25, 20, 6, 7, P.white)
      }, { shadow: g.dk })
      text(cv, 19, 21, 'A', P.ink); text(cv, 26, 21, '_', P.ink)
      return cv
    },
    cast() {
      const g = G.hangwoman, cv = castGround(g.bg, g.lt)
      cv.sticker(L => {
        L.rect(0, 2, 32, 3, P.brown); L.rect(0, 4, 32, 1, P.dbrown)
        L.rect(26, 5, 1, 7, P.sand); L.ring(26.5, 14, 2.6, 1, P.sand)
      }, { shadow: g.dk })
      cv.sticker(L => {
        L.rrect(4, 26, 20, 6, P.coral, 2)
        L.disc(13.5, 7.5, 3, P.dbrown)
        L.ellipse(13.5, 16, 7.5, 8, P.dbrown)
        L.ellipse(13.5, 17.5, 5.8, 6.3, P.skin)
        L.rect(9, 13, 9, 2, P.dbrown)
        L.rect(10, 17, 2, 2, P.ink); L.rect(15, 17, 2, 2, P.ink)
        L.set(15, 16, P.white); L.set(10, 16, P.white)
        L.set(9, 15, P.ink); L.set(17, 15, P.ink)
        L.rect(12, 21, 3, 1, P.dcoral)
        L.set(8, 19, P.dskin); L.set(18, 19, P.dskin)
        L.rect(12, 24, 3, 2, P.skin)
      }, { shadow: g.dk })
      cv.sticker(L => { L.disc(21.5, 11.5, 1.2, P.sky); L.set(21, 9, P.sky) }, { outline: P.dsea })
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.dpurple)
      cv.dither(0, 12, 64, 8, P.purple, 0); cv.rect(0, 20, 64, 10, P.purple); cv.dither(0, 26, 64, 8, P.pink, 1)
      cv.rect(0, 34, 64, 30, P.pink); cv.dither(0, 38, 64, 6, P.orange, 0)
      stars(cv, 16, 5, [P.lpurple, P.white], P.dpurple)
      cv.disc(50, 11, 6, P.cream); cv.disc(52.5, 9.5, 5, P.dpurple)
      cv.ellipse(18, 64, 42, 20, P.dgreen); cv.ellipse(18, 64, 42, 20, P.ddgreen, (dx, dy) => dy > -12 && (dx + dy) % 2 === 0)
      cv.ellipse(56, 70, 22, 22, P.ddgreen)
      cv.sticker(L => {
        L.rect(12, 44, 18, 2, P.dbrown)
        L.rect(15, 14, 3, 31, P.dbrown)
        L.rect(15, 14, 21, 3, P.dbrown)
        L.seg(18, 22, 23, 17, 2, P.dbrown)
        L.rect(33, 17, 1, 4, P.sand)
        L.disc(33.5, 24, 3, P.cream); L.set(32, 23, P.ink); L.set(35, 23, P.ink); L.rect(33, 25, 2, 1, P.ink)
        L.rect(33, 27, 1, 7, P.cream)
      }, { outline: P.ink })
      ;[[17, 'G'], [26, 'A'], [35, '_'], [44, 'E']].forEach(([x, ch]) => {
        cv.sticker(L => L.rect(x, 51, 7, 9, P.white), { shadow: P.ddgreen })
        text(cv, x + 2, 53, ch, P.ink)
      })
      return cv
    },
  },

  // ───────────────────────────── SKETCH ─────────────────────────────
  sketch: {
    object() {
      const g = G.sketch, cv = objectGround(g.bg, g.dk)
      cv.spr(2, 15, ['.##...##.', '#..#.#..#', '#...#...#', '#.......#', '.#.....#.', '..#...#..', '...#.#...', '....#....'], { '#': P.ink })
      cv.line(7, 22, 11, 22, P.ink); cv.line(11, 22, 15, 19, P.ink)
      cv.sticker(L => pencil(L, 16, 18, 29, 3, 6.5), { shadow: g.dk })
      return cv
    },
    cast() {
      const g = G.sketch, cv = castGround(g.bg, g.lt)
      cv.seg(3, 29, 6, 26, 1.2, P.ink); cv.seg(6, 26, 9, 29, 1.2, P.ink)
      cv.sticker(L => {
        pencil(L, 8, 29, 22, 3, 10)
        L.rect(12, 12, 2, 3, P.ink); L.rect(18, 15, 2, 3, P.ink)
        L.set(12, 12, P.white); L.set(18, 15, P.white)
        L.seg(13, 19, 17, 21, 1, P.ink)
        L.set(11, 17, P.pink); L.set(19, 20, P.pink)
      }, { shadow: g.dk })
      cv.spr(24, 20, ['..#..', '.###.', '#####', '.###.', '.#.#.'], { '#': P.yellow })
      return cv
    },
    scene() {
      const cv = new Cv(64, 64, P.lpurple)
      cv.dither(0, 0, 64, 64, P.lilac, 0)
      cv.rect(0, 52, 64, 12, P.brown); cv.rect(0, 52, 64, 1, P.sand); cv.dither(0, 56, 64, 8, P.dbrown, 0)
      cv.sticker(L => {
        L.seg(12, 60, 20, 12, 2.2, P.brown); L.seg(44, 60, 36, 12, 2.2, P.brown); L.seg(28, 62, 28, 12, 2.2, P.dbrown)
        L.rect(8, 44, 40, 3, P.brown)
      }, {})
      cv.sticker(L => {
        L.rect(9, 14, 38, 30, P.white)
      }, { shadow: P.purple, sx: 2, sy: 1 })
      // the drawing: a cat
      cv.disc(27.5, 31, 7, P.white)
      cv.ring(27.5, 31, 7, 1, P.ink)
      cv.poly([[21, 27], [22, 20], [26, 25]], P.ink); cv.poly([[29, 25], [33, 20], [34, 27]], P.ink)
      cv.poly([[22.5, 25], [23, 22], [25, 24.5]], P.pink); cv.poly([[30.5, 24.5], [32.5, 22], [32.5, 25]], P.pink)
      cv.rect(24, 29, 2, 2, P.ink); cv.rect(30, 29, 2, 2, P.ink)
      cv.set(27, 33, P.pink); cv.set(28, 33, P.pink); cv.set(27, 34, P.ink); cv.set(28, 34, P.ink)
      cv.line(14, 32, 20, 33, P.ink); cv.line(14, 35, 20, 34, P.ink); cv.line(35, 33, 41, 32, P.ink); cv.line(35, 34, 41, 35, P.ink)
      // guess bubble
      cv.sticker(L => { L.rrect(38, 3, 24, 11, P.white, 2); L.poly([[42, 13], [46, 13], [41, 17]], P.white) }, { shadow: P.purple })
      text(cv, 41, 6, 'CAT?', P.ink)
      // pencil on the tray
      const L = new Cv(64, 64); pencil(L, 30, 42, 46, 42, 3); L.outline(P.ink); cv.draw(L)
      return cv
    },
  },
}
