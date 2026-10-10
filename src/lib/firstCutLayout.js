// firstCutLayout.js — where each seat's pad and katana sit on the First Cut
// table. Plain data, shared by the table, the pages and the play hook.
//
// Pads sit on the screen edges: two players get one end each; three put two on
// the bottom edge and one on the top; four get half an edge each. `a` is the
// angle the whole katana is turned about the plate (its grip sits beside the
// plate and the blade rests raised); `top` pads are drawn rotated 180 degrees
// so the score faces its owner.

const POS = {
  bottom: { left: '3%', right: '3%', bottom: '2.5%', height: '19%' },
  top: { left: '3%', right: '3%', top: '2.5%', height: '19%' },
  bl: { left: '3%', width: '46%', bottom: '2.5%', height: '19%' },
  br: { right: '3%', width: '46%', bottom: '2.5%', height: '19%' },
  tl: { left: '3%', width: '46%', top: '2.5%', height: '19%' },
  tr: { right: '3%', width: '46%', top: '2.5%', height: '19%' },
}

/** Pad placement and katana angle per seat, by how many seats share the phone. */
export const SEAT_LAYOUTS = {
  1: [{ pos: POS.bottom, a: 90, top: false }],
  2: [{ pos: POS.bottom, a: 90, top: false }, { pos: POS.top, a: 270, top: true }],
  3: [{ pos: POS.bl, a: 125, top: false }, { pos: POS.br, a: 55, top: false }, { pos: POS.top, a: 270, top: true }],
  4: [{ pos: POS.bl, a: 125, top: false }, { pos: POS.br, a: 55, top: false }, { pos: POS.tl, a: 235, top: true }, { pos: POS.tr, a: 305, top: true }],
}

/** Keyboard keys per seat on one phone (also shown on the pad). */
export const SEAT_KEYS = ['a', 'l', 'q', 'p']

/** The katana angle of each seat for a table of `n`. */
export const anglesFor = (n) => (SEAT_LAYOUTS[n] ?? SEAT_LAYOUTS[2]).map(g => g.a)
