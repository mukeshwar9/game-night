// @ts-check
// Arrows solo — the 100-level campaign, endless boards and progress. Pure
// logic: no DOM, no Firebase, no React (storage lives in arrowsProgress.js).
//
// Every level is a generator spec (hand-set shape and twists) plus a seed
// picked by scripts/pick-arrows-levels.mjs. Levels 1–20 climb steadily and
// are generated from their seed on demand. Levels 21–100 come in eight
// chapters that each open on a lighter lesson board and then climb past the
// previous chapter's last level (a sawtooth); their finished boards are baked
// into arrowsLevelsBaked.js so a later generator change can never reshape a
// level players have already starred. The generator guarantees solvability
// by construction and arrowsLevelsLogic.test.js re-checks every level with
// the solver.

import { ARROWS_ENDLESS_SPECS, ARROWS_LIVES, ARROWS_TIERS, generateArrowsLevel, isBent, isCurved, isDiagonal, isDouble, isSleeper, portalUses, solveArrows } from './arrowsLogic.js'
import { ARROWS_BAKED_LEVELS as BAKED } from './arrowsLevelsBaked.js'
import { shapeMask } from './arrowsShapes.js'

// Shape of each level. Levels 1–5 teach the core rule on small boards;
// straight diagonal arrows arrive at level 6, their curved-body cousins at
// level 8 and hooked arrows at level 11;
// from there boards grow toward the full 10 × 13 hard size and get denser.
// `samples` is the generator's look-ahead — more means fewer arrows free at
// the start. `bend` is the share of diagonals that get a curved body. `intro`
// marks the level that introduces a twist.
// From level 21 the boards stay at most 10 × 13 and get harder through depth
// instead: `deep` biases the generator toward long chains of arrows waiting
// on each other, and a few special pieces arrive one chapter at a time —
// sleeping arrows (21–30), double arrows (31–40), mirrors (41–50), then
// crates with a light mix of everything (51–60).
// Levels 61–100 add PORTALS in four chapters of ten, one variant each:
// a classic pair (61), letter pairs (71), exit-only rings (81) and turning
// rings (91). `portals` lists one kind per pair — 'pair', 'oneway' or 'turn'.
// Boards grow again, sawtooth, past the old 10 × 13 (zoom and drag in
// ArrowsBoard make that playable) up to 16 × 22 at level 100, and from the
// second half of each chapter some boards are shaped (`mask`, see
// arrowsShapes.js): empty space is an edge. Lesson boards stay rectangular.
// Special pieces stay sparse on purpose: one on a lesson board, a handful on a
// chapter's last.
// A spec on a shaped board: the mask is drawn from the shape at the board's size.
const shaped = (shape, cols, rows, spec) => ({ cols, rows, ...spec, mask: shapeMask(shape, cols, rows) })

export const ARROWS_LEVEL_SPECS = [
  { cols: 5, rows: 6, maxLen: 3, fill: 0.62, samples: 2 },
  { cols: 5, rows: 7, maxLen: 3, fill: 0.7, samples: 3 },
  { cols: 6, rows: 7, maxLen: 4, fill: 0.74, samples: 4 },
  { cols: 6, rows: 8, maxLen: 4, fill: 0.78, samples: 5 },
  { cols: 6, rows: 8, maxLen: 5, fill: 0.82, samples: 6 },
  { cols: 6, rows: 8, maxLen: 4, fill: 0.8, samples: 6, diag: 0.3, intro: 'diag' },
  { cols: 7, rows: 8, maxLen: 5, fill: 0.82, samples: 6, diag: 0.16 },
  { cols: 7, rows: 9, maxLen: 5, fill: 0.84, samples: 7, diag: 0.28, bend: 1, intro: 'bend' },
  { cols: 7, rows: 9, maxLen: 5, fill: 0.86, samples: 8, diag: 0.2, bend: 0.8 },
  { cols: 7, rows: 10, maxLen: 6, fill: 0.86, samples: 8, diag: 0.2, bend: 0.8 },
  { cols: 7, rows: 10, maxLen: 5, fill: 0.84, samples: 8, diag: 0.08, curve: 0.3, bend: 0.8, intro: 'curve' },
  { cols: 8, rows: 10, maxLen: 6, fill: 0.86, samples: 8, diag: 0.12, curve: 0.15, bend: 0.9 },
  { cols: 8, rows: 11, maxLen: 6, fill: 0.87, samples: 9, diag: 0.12, curve: 0.15, bend: 0.9 },
  { cols: 8, rows: 11, maxLen: 7, fill: 0.88, samples: 9, diag: 0.14, curve: 0.15, bend: 0.9 },
  { cols: 8, rows: 12, maxLen: 7, fill: 0.88, samples: 10, diag: 0.14, curve: 0.16, bend: 0.9 },
  { cols: 9, rows: 12, maxLen: 7, fill: 0.89, samples: 10, diag: 0.15, curve: 0.16, bend: 0.9 },
  { cols: 9, rows: 12, maxLen: 8, fill: 0.9, samples: 11, diag: 0.15, curve: 0.18, bend: 0.9 },
  { cols: 9, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9 },
  { cols: 10, rows: 13, maxLen: 9, fill: 0.92, samples: 14, diag: 0.18, curve: 0.2, bend: 0.9 },
  // Chapter 3 · sleeping arrows
  { cols: 8, rows: 10, maxLen: 6, fill: 0.86, samples: 9, diag: 0.12, curve: 0.12, bend: 0.9, deep: 0.3, sleepers: 1, intro: 'sleep' },
  { cols: 8, rows: 11, maxLen: 6, fill: 0.87, samples: 9, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.3, sleepers: 1 },
  { cols: 8, rows: 11, maxLen: 7, fill: 0.88, samples: 10, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.4, sleepers: 1 },
  { cols: 9, rows: 11, maxLen: 7, fill: 0.88, samples: 10, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.4, sleepers: 2 },
  { cols: 9, rows: 12, maxLen: 7, fill: 0.9, samples: 11, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.5, sleepers: 2 },
  { cols: 9, rows: 12, maxLen: 8, fill: 0.9, samples: 11, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.5, sleepers: 2 },
  { cols: 9, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.6, sleepers: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.6, sleepers: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.91, samples: 13, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.7, sleepers: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.91, samples: 14, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.8, sleepers: 3 },
  // Chapter 4 · double arrows
  { cols: 8, rows: 10, maxLen: 6, fill: 0.86, samples: 9, diag: 0.12, curve: 0.1, bend: 0.9, deep: 0.3, doubles: 1, intro: 'double' },
  { cols: 8, rows: 11, maxLen: 6, fill: 0.87, samples: 10, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.3, doubles: 1 },
  { cols: 9, rows: 11, maxLen: 7, fill: 0.88, samples: 10, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.4, doubles: 1 },
  { cols: 9, rows: 12, maxLen: 7, fill: 0.9, samples: 11, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.4, sleepers: 1, doubles: 1 },
  { cols: 9, rows: 12, maxLen: 8, fill: 0.9, samples: 11, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.5, doubles: 2 },
  { cols: 9, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.6, sleepers: 1, doubles: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.6, sleepers: 1, doubles: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 13, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.7, sleepers: 1, doubles: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.91, samples: 13, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.8, sleepers: 1, doubles: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.91, samples: 14, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.9, sleepers: 2, doubles: 2 },
  // Chapter 5 · mirrors
  { cols: 7, rows: 9, maxLen: 5, fill: 0.84, samples: 8, diag: 0, curve: 0, bend: 0.9, mirrors: 1, intro: 'mirror' },
  { cols: 8, rows: 10, maxLen: 6, fill: 0.86, samples: 9, diag: 0.08, curve: 0, bend: 0.9, deep: 0.3, mirrors: 1 },
  { cols: 8, rows: 11, maxLen: 6, fill: 0.87, samples: 10, diag: 0.1, curve: 0.08, bend: 0.9, deep: 0.4, mirrors: 2 },
  { cols: 9, rows: 11, maxLen: 7, fill: 0.88, samples: 10, diag: 0.1, curve: 0.1, bend: 0.9, deep: 0.4, mirrors: 2 },
  { cols: 9, rows: 12, maxLen: 7, fill: 0.9, samples: 11, diag: 0.12, curve: 0.12, bend: 0.9, deep: 0.5, sleepers: 1, mirrors: 2 },
  { cols: 9, rows: 12, maxLen: 8, fill: 0.9, samples: 11, diag: 0.12, curve: 0.12, bend: 0.9, deep: 0.5, doubles: 1, mirrors: 2 },
  { cols: 10, rows: 12, maxLen: 8, fill: 0.9, samples: 12, diag: 0.12, curve: 0.14, bend: 0.9, deep: 0.6, sleepers: 1, mirrors: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.12, curve: 0.14, bend: 0.9, deep: 0.6, doubles: 1, mirrors: 3 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 13, diag: 0.12, curve: 0.15, bend: 0.9, deep: 0.7, sleepers: 1, mirrors: 3 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.91, samples: 14, diag: 0.12, curve: 0.15, bend: 0.9, deep: 0.8, sleepers: 1, doubles: 1, mirrors: 3 },
  // Chapter 6 · crates, then a light mix of every piece
  { cols: 8, rows: 10, maxLen: 6, fill: 0.84, samples: 9, diag: 0.12, curve: 0.1, bend: 0.9, deep: 0.3, crates: 1, intro: 'crate' },
  { cols: 8, rows: 11, maxLen: 6, fill: 0.86, samples: 10, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.4, crates: 1 },
  { cols: 9, rows: 11, maxLen: 7, fill: 0.86, samples: 10, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.5, sleepers: 1, crates: 1 },
  { cols: 9, rows: 12, maxLen: 7, fill: 0.87, samples: 11, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.5, doubles: 1, crates: 1 },
  { cols: 9, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.6, sleepers: 1, mirrors: 1, crates: 1 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.7, doubles: 1, crates: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 13, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.8, sleepers: 1, mirrors: 1, crates: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 13, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.9, sleepers: 1, doubles: 1, crates: 2 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.91, samples: 14, diag: 0.16, curve: 0.18, bend: 0.9, deep: 1, doubles: 1, mirrors: 1, crates: 2 },
  { cols: 10, rows: 13, maxLen: 9, fill: 0.92, samples: 14, diag: 0.16, curve: 0.18, bend: 0.9, deep: 1, sleepers: 1, doubles: 1, mirrors: 1, crates: 2 },
  // Chapter 7 · portals (a classic pair), mirrors late, two shapes
  { cols: 8, rows: 10, maxLen: 6, fill: 0.84, samples: 9, diag: 0.08, curve: 0.1, bend: 0.9, deep: 0.3, portals: ['pair'], intro: 'portal' },
  { cols: 8, rows: 11, maxLen: 6, fill: 0.86, samples: 10, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.4, portals: ['pair'] },
  { cols: 9, rows: 11, maxLen: 7, fill: 0.87, samples: 10, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, portals: ['pair'] },
  { cols: 9, rows: 12, maxLen: 7, fill: 0.88, samples: 11, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, portals: ['pair'] },
  { cols: 10, rows: 12, maxLen: 8, fill: 0.9, samples: 12, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.6, portals: ['pair'] },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.7, portals: ['pair'] },
  shaped('diamond', 13, 17, { maxLen: 8, fill: 0.9, samples: 12, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.7, portals: ['pair'] }),
  { cols: 10, rows: 14, maxLen: 8, fill: 0.91, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.8, mirrors: 1, portals: ['pair'] },
  shaped('cross', 13, 16, { maxLen: 8, fill: 0.91, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.9, mirrors: 1, crates: 1, portals: ['pair'] }),
  { cols: 11, rows: 15, maxLen: 9, fill: 0.93, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 1, mirrors: 1, crates: 2, portals: ['pair'] },
  // Chapter 8 · letter pairs (two, then three), crates late, donut and heart
  { cols: 9, rows: 12, maxLen: 7, fill: 0.86, samples: 10, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.3, portals: ['pair', 'pair'], intro: 'letters' },
  { cols: 9, rows: 13, maxLen: 7, fill: 0.88, samples: 11, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.4, portals: ['pair', 'pair'] },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.89, samples: 11, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, portals: ['pair', 'pair'] },
  { cols: 10, rows: 14, maxLen: 8, fill: 0.9, samples: 12, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, portals: ['pair', 'pair'] },
  { cols: 11, rows: 14, maxLen: 8, fill: 0.9, samples: 12, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.6, portals: ['pair', 'pair', 'pair'] },
  { cols: 11, rows: 15, maxLen: 8, fill: 0.91, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.7, portals: ['pair', 'pair', 'pair'] },
  shaped('donut', 13, 17, { maxLen: 8, fill: 0.91, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.7, portals: ['pair', 'pair', 'pair'] }),
  { cols: 11, rows: 16, maxLen: 8, fill: 0.92, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.8, crates: 1, portals: ['pair', 'pair', 'pair'] },
  shaped('heart', 13, 17, { maxLen: 8, fill: 0.92, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.9, crates: 1, portals: ['pair', 'pair', 'pair'] }),
  { cols: 12, rows: 17, maxLen: 9, fill: 0.93, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 1, crates: 2, portals: ['pair', 'pair', 'pair'] },
  // Chapter 9 · exit-only rings, letter pairs and mirrors late, lantern and arrow
  { cols: 10, rows: 13, maxLen: 8, fill: 0.88, samples: 10, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.3, portals: ['pair', 'oneway'], intro: 'oneway' },
  { cols: 10, rows: 14, maxLen: 8, fill: 0.9, samples: 11, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.4, portals: ['pair', 'oneway'] },
  { cols: 11, rows: 14, maxLen: 8, fill: 0.9, samples: 12, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, portals: ['oneway', 'pair'] },
  { cols: 11, rows: 15, maxLen: 8, fill: 0.91, samples: 12, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, portals: ['oneway', 'pair', 'pair'] },
  { cols: 12, rows: 15, maxLen: 8, fill: 0.91, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.6, portals: ['oneway', 'pair', 'pair'] },
  { cols: 12, rows: 16, maxLen: 8, fill: 0.92, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.7, portals: ['oneway', 'oneway', 'pair'] },
  shaped('lantern', 14, 18, { maxLen: 8, fill: 0.92, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.7, portals: ['oneway', 'pair', 'pair'] }),
  { cols: 13, rows: 17, maxLen: 9, fill: 0.92, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.8, mirrors: 1, portals: ['oneway', 'oneway', 'pair'] },
  shaped('arrow', 15, 20, { maxLen: 9, fill: 0.93, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.9, mirrors: 1, portals: ['oneway', 'pair', 'pair'] }),
  { cols: 14, rows: 19, maxLen: 9, fill: 0.93, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 1, mirrors: 2, portals: ['oneway', 'oneway', 'pair'] },
  // Chapter 10 · turning rings, every variant late, up to the 16 × 22 finale
  { cols: 11, rows: 15, maxLen: 8, fill: 0.88, samples: 10, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.3, portals: ['turn', 'pair'], intro: 'turning' },
  { cols: 11, rows: 16, maxLen: 8, fill: 0.9, samples: 11, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.4, portals: ['turn', 'pair'] },
  { cols: 12, rows: 16, maxLen: 8, fill: 0.9, samples: 12, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, portals: ['turn', 'turn', 'pair'] },
  { cols: 13, rows: 18, maxLen: 8, fill: 0.91, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, portals: ['turn', 'pair', 'pair'] },
  { cols: 14, rows: 19, maxLen: 8, fill: 0.91, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.6, portals: ['turn', 'pair', 'oneway'] },
  shaped('heart', 15, 20, { maxLen: 9, fill: 0.92, samples: 13, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.7, portals: ['turn', 'pair', 'oneway'] }),
  { cols: 14, rows: 19, maxLen: 9, fill: 0.92, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.8, mirrors: 1, portals: ['turn', 'pair', 'oneway', 'pair'] },
  shaped('diamond', 16, 22, { maxLen: 9, fill: 0.93, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.9, mirrors: 1, crates: 1, portals: ['turn', 'turn', 'pair', 'oneway'] }),
  { cols: 15, rows: 21, maxLen: 9, fill: 0.93, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 1, mirrors: 2, crates: 1, portals: ['turn', 'pair', 'oneway', 'pair'] },
  shaped('lantern', 16, 22, { maxLen: 9, fill: 0.94, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 1, mirrors: 2, crates: 2, portals: ['turn', 'turn', 'pair', 'oneway'] }),
]

// Chapters in the level list (level select headers). `steady` chapters climb
// level by level; the others open on a lesson board and climb from there.
export const ARROWS_CHAPTERS = [
  { name: 'BASICS', from: 1, to: 20 },
  { name: 'SLEEPING ARROWS', from: 21, to: 30 },
  { name: 'DOUBLE ARROWS', from: 31, to: 40 },
  { name: 'MIRRORS', from: 41, to: 50 },
  { name: 'CRATES', from: 51, to: 60 },
  { name: 'PORTALS', from: 61, to: 70 },
  { name: 'LETTER PAIRS', from: 71, to: 80 },
  { name: 'EXIT-ONLY', from: 81, to: 90 },
  { name: 'TURNING', from: 91, to: 100 },
]

// Picked by scripts/pick-arrows-levels.mjs — rerun it after changing a spec.
export const ARROWS_LEVEL_SEEDS = [
  63, 296, 825, 472, 9, 71, 46, 59, 5, 515,
  92, 1066, 126, 733, 966, 740, 2141, 360, 316, 2221,
  1, 31, 2, 47, 4, 59, 19, 83, 84, 135,
  47, 2, 7, 54, 79, 28, 21, 153, 136, 129,
  5, 65, 78, 41, 9, 9, 266, 66, 296, 74,
  1, 65, 4, 2, 132, 30, 51, 92, 268, 93,
  58, 1, 77, 52, 30, 117, 11, 47, 149, 217,
  78, 71, 62, 40, 232, 1, 183, 29, 65, 157,
  112, 42, 140, 55, 76, 239, 60, 36, 46, 69,
  6, 24, 93, 47, 155, 86, 45, 101, 13, 38,
]

// Levels generated live from their seed; the rest come from BAKED.
export const ARROWS_GENERATED_LEVELS = 20

export const ARROWS_LEVEL_COUNT = ARROWS_LEVEL_SPECS.length

// One-line tutorials, shown the first time a player meets each twist.
export const ARROWS_TWIST_TIPS = {
  diag: 'NEW · DIAGONAL ARROWS FLY CORNER TO CORNER — ONLY CELLS ON THEIR DIAGONAL BLOCK THEM.',
  bend: 'NEW · CURVED DIAGONALS BEND LIKE A SNAKE, BUT THE HEAD STILL FLIES STRAIGHT ALONG ITS DIAGONAL.',
  curve: 'NEW · HOOKED ARROWS FLY TO THE EDGE, TURN ONCE THE WAY THE HOOK POINTS, THEN RUN ALONG IT.',
  sleep: 'NEW · HOLLOW ARROWS ARE ASLEEP — ONE WAKES WHEN AN ARROW TOUCHING IT LEAVES.',
  double: 'NEW · DOUBLE ARROWS SLIDE OUT AS ONE PIECE — CLEAR THE WAY FOR BOTH HEADS AND INSIDE THE CURVE.',
  mirror: 'NEW · MIRRORS TURN A STRAIGHT ARROW A QUARTER TURN AS IT PASSES. DIAGONALS CANNOT CROSS THEM.',
  crate: 'NEW · A CRATE BLOCKS UNTIL ITS NUMBER OF ARROWS HAVE LEFT THE BOARD. EVERY CLEAR COUNTS IT DOWN.',
  portal: 'NEW · AN ARROW THAT ENTERS A PORTAL RING COMES OUT OF ITS PARTNER, KEEPING ITS HEADING. THE WHOLE ROUTE MUST BE CLEAR.',
  letters: 'NEW · SEVERAL PORTAL PAIRS — EACH RING CARRIES A LETTER, AND A RING ONLY CONNECTS TO ITS OWN LETTER.',
  oneway: 'NEW · A DASHED RING ONLY LETS ARROWS OUT. ENTER ITS SOLID PARTNER; CROSSING THE DASHED ONE DOES NOTHING.',
  turning: 'NEW · A HOOKED RING TURNS THE ARROW A QUARTER TURN CLOCKWISE AS IT COMES OUT THE OTHER SIDE.',
  shape: 'NEW · NOT EVERY BOARD IS A RECTANGLE. EMPTY SPACE IS AN EDGE — AN ARROW THAT REACHES IT LEAVES THE BOARD.',
}

// Does a board carry the portal pairs its spec asked for, each one actually
// on some arrow's route? An intro level shows every pair on `introUses`
// routes, so the player sees what a ring does a few times.
function portalsMeet(spec, level, uses) {
  if (!spec.portals?.length) return true
  if ((level.portals?.length ?? 0) < spec.portals.length) return false
  return portalUses(level).every((u) => u >= uses)
}

// An intro level must actually show its twist a few times.
// Levels past the curved-diagonal intro keep showing at least one.
export function levelMeetsIntro(spec, level) {
  if (spec.bend > 0 && spec.diag > 0 && !level.arrows.some(isBent)) return false
  if (spec.intro === 'diag') return level.arrows.filter(isDiagonal).length >= 2
  if (spec.intro === 'bend') return level.arrows.filter(isBent).length >= 2
  if (spec.intro === 'curve') return level.arrows.filter(isCurved).length >= 2
  if (spec.sleepers && level.arrows.filter(isSleeper).length < spec.sleepers) return false
  if (spec.doubles && level.arrows.filter(isDouble).length < spec.doubles) return false
  if (spec.mirrors && (level.mirrors?.length ?? 0) < spec.mirrors) return false
  if (spec.crates && (level.crates?.length ?? 0) < spec.crates) return false
  if (!portalsMeet(spec, level, spec.intro ? 2 : 1)) return false
  return true
}

const levelCache = new Map()

// The board for level n (1-based); null outside 1..ARROWS_LEVEL_COUNT.
export function getArrowsLevel(n) {
  if (!Number.isInteger(n) || n < 1 || n > ARROWS_LEVEL_COUNT) return null
  if (!levelCache.has(n)) {
    const name = `level-${n}`
    const baked = BAKED[n]
    levelCache.set(n, n > ARROWS_GENERATED_LEVELS && baked
      ? { seed: ARROWS_LEVEL_SEEDS[n - 1], tier: name, ...baked }
      : generateArrowsLevel(ARROWS_LEVEL_SEEDS[n - 1], { ...ARROWS_LEVEL_SPECS[n - 1], name }))
  }
  return levelCache.get(n)
}

// Twist kinds present on a board, in the order they are introduced.
export function twistsIn(level) {
  const out = []
  if (level.arrows.some(isDiagonal)) out.push('diag')
  if (level.arrows.some(isBent)) out.push('bend')
  if (level.arrows.some(isCurved)) out.push('curve')
  if (level.arrows.some(isSleeper)) out.push('sleep')
  if (level.arrows.some(isDouble)) out.push('double')
  if (level.mirrors?.length) out.push('mirror')
  if (level.crates?.length) out.push('crate')
  const portals = level.portals ?? []
  if (portals.length) out.push('portal')
  if (portals.length >= 2) out.push('letters')
  if (portals.some((p) => p.oneway)) out.push('oneway')
  if (portals.some((p) => p.turn)) out.push('turning')
  if (level.mask) out.push('shape')
  return out
}

// The first twist on this board the player has not been taught yet.
export function newTwist(level, seen) {
  return twistsIn(level).find((t) => !seen?.[t]) ?? null
}

// Endless tiers carry the late mechanics races leave out. Unknown tiers fall
// back to easy; the spec keeps its tier name for the board's title.
function endlessSpec(tier) {
  const name = ARROWS_ENDLESS_SPECS[tier] ? tier : 'easy'
  return { ...ARROWS_ENDLESS_SPECS[name], name }
}

// Does a board actually carry the special pieces its spec asked for? The
// generator places sleepers/doubles/mirrors/crates/portals best-effort, so a bare
// solvable check could serve a board missing the tier's whole point.
function endlessMeets(level, spec) {
  if (spec.sleepers && level.arrows.filter(isSleeper).length < spec.sleepers) return false
  if (spec.doubles && level.arrows.filter(isDouble).length < spec.doubles) return false
  if (spec.mirrors && (level.mirrors?.length ?? 0) < spec.mirrors) return false
  if (spec.crates && (level.crates?.length ?? 0) < spec.crates) return false
  if (!portalsMeet(spec, level, 1)) return false
  return true
}

// Endless boards: any seed at an endless tier. The generator is solvable by
// construction; the solver re-checks and steps to the next seed if a board
// ever failed, so endless play can never serve a dead board — or one missing
// the mechanics its tier promises.
export function endlessLevel(seed, tier) {
  const spec = endlessSpec(tier)
  for (let s = seed; ; s += 1) {
    const level = generateArrowsLevel(s, spec)
    if (solveArrows(level).solvable && endlessMeets(level, spec)) return level
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────

// Stars for a cleared board: 3 for no blocked taps, one fewer per mistake;
// taking a hint caps it at 2. 0 = not cleared (out of lives).
export function starsFor({ mistakes = 0, hints = 0 } = {}) {
  if (mistakes >= ARROWS_LIVES) return 0
  return Math.max(1, Math.min(3 - mistakes, hints > 0 ? 2 : 3))
}

// ── Progress ──────────────────────────────────────────────────────────────
// { levels: { l1: stars, … }, endless: { easy, medium, hard } }. Level keys
// carry an `l` prefix so Firebase never turns the map into a sparse array.

export const levelKey = (n) => `l${n}`

export function blankProgress() {
  return { levels: {}, endless: { easy: 0, medium: 0, hard: 0 } }
}

// Sanitise anything read from storage or Firebase into a valid progress
// object: unknown keys dropped, stars clamped to 1..3, counts to integers ≥ 0.
export function normalizeProgress(raw) {
  const out = blankProgress()
  if (!raw || typeof raw !== 'object') return out
  const levels = raw.levels && typeof raw.levels === 'object' ? raw.levels : {}
  for (let n = 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
    const v = Number(levels[levelKey(n)])
    if (v >= 1) out.levels[levelKey(n)] = Math.min(3, Math.floor(v))
  }
  const endless = raw.endless && typeof raw.endless === 'object' ? raw.endless : {}
  for (const tier of ARROWS_TIERS) {
    const v = Math.floor(Number(endless[tier]))
    out.endless[tier] = Number.isFinite(v) && v > 0 ? v : 0
  }
  return out
}

export function levelStars(progress, n) {
  return progress?.levels?.[levelKey(n)] ?? 0
}

// Level 1 is always open; every other level opens once the one before it is
// cleared.
export function isLevelUnlocked(progress, n) {
  if (n < 1 || n > ARROWS_LEVEL_COUNT) return false
  return n === 1 || levelStars(progress, n - 1) >= 1
}

// Keep the best result: a replay never lowers a level's stars.
export function recordLevelResult(progress, n, stars) {
  const p = normalizeProgress(progress)
  if (n < 1 || n > ARROWS_LEVEL_COUNT || stars < 1) return p
  const key = levelKey(n)
  p.levels[key] = Math.max(p.levels[key] ?? 0, Math.min(3, stars))
  return p
}

export function recordEndlessClear(progress, tier) {
  const p = normalizeProgress(progress)
  if (ARROWS_TIERS.includes(tier)) p.endless[tier] += 1
  return p
}

// Union of two progress snapshots (device + account): best stars per level,
// highest endless count per tier. Never loses progress from either side.
export function mergeProgress(a, b) {
  const x = normalizeProgress(a)
  const y = normalizeProgress(b)
  const out = blankProgress()
  for (let n = 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
    const key = levelKey(n)
    const best = Math.max(x.levels[key] ?? 0, y.levels[key] ?? 0)
    if (best) out.levels[key] = best
  }
  for (const tier of ARROWS_TIERS) out.endless[tier] = Math.max(x.endless[tier], y.endless[tier])
  return out
}

export function sameProgress(a, b) {
  return JSON.stringify(normalizeProgress(a)) === JSON.stringify(normalizeProgress(b))
}

export function totalStars(progress) {
  let n = 0
  for (const v of Object.values(normalizeProgress(progress).levels)) n += v
  return n
}

// Where CONTINUE goes: the first unlocked level not yet cleared, else the
// last level.
export function nextLevel(progress) {
  for (let n = 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
    if (isLevelUnlocked(progress, n) && levelStars(progress, n) === 0) return n
  }
  return ARROWS_LEVEL_COUNT
}
