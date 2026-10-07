// @ts-check
// Arrows lessons — the short guided lesson that plays before the first level
// with a new arrow kind (and on demand from HOW TO PLAY or the level's "?").
// Pure data + step logic: no DOM, no Firebase, no React.
//
// Each lesson is a tiny hand-built board and three guided taps:
//   1. tap the new arrow while it is blocked (so the player sees what blocks it),
//   2. clear what blocks it,
//   3. send it.
// It is practice: taps never cost lives. arrowsLessonsLogic.test.js plays every
// script through the real rule check (applyArrowTap).

import { applyArrowTap } from './arrowsLogic.js'

/** @typedef {{ tap: number, say: string, after: string }} LessonStep */
/** @typedef {{ cols: number, rows: number, arrows: Array<Record<string, any>>, mirrors?: Array<{ x: number, y: number, m: string }>, crates?: Array<{ x: number, y: number, k: number }>, tunnels?: Array<{ x: number, y: number, dir: number }>, portals?: Array<{ a: [number, number], b: [number, number], c: number, oneway?: boolean, turn?: boolean }> }} LessonBoard */
/** @typedef {{ kind: string, level: number, name: string, rule: string, board: LessonBoard, steps: LessonStep[] }} Lesson */

/** @type {Lesson[]} In the order the campaign introduces them. */
export const ARROWS_LESSONS = [
  {
    kind: 'diag', level: 6, name: 'DIAGONAL ARROWS',
    rule: 'FLIES CORNER TO CORNER. ONLY CELLS ON ITS DIAGONAL BLOCK IT.',
    board: { cols: 4, rows: 4, arrows: [
      { cells: [[0, 3], [1, 2]], dir: 4 },
      { cells: [[2, 2], [2, 1]], dir: 0 },
      { cells: [[3, 3], [3, 2]], dir: 0 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE DIAGONAL ARROW', after: 'BLOCKED — AN ARROW SITS ON ITS DIAGONAL.' },
      { tap: 1, say: 'CLEAR THE ARROW IN THE WAY', after: 'THE DIAGONAL IS OPEN.' },
      { tap: 0, say: 'NOW SEND THE DIAGONAL', after: 'THE ARROW BESIDE ITS PATH NEVER MATTERED.' },
    ],
  },
  {
    kind: 'bend', level: 8, name: 'CURVY DIAGONALS',
    rule: 'THE BODY BENDS LIKE A SNAKE, BUT THE HEAD STILL FLIES STRAIGHT ALONG ITS DIAGONAL.',
    board: { cols: 5, rows: 5, arrows: [
      { cells: [[0, 4], [1, 4], [2, 3]], dir: 4 },
      { cells: [[3, 3], [3, 2]], dir: 0 },
      { cells: [[0, 1], [1, 1]], dir: 1 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE CURVY ARROW', after: 'ONLY THE LINE AHEAD OF ITS HEAD COUNTS.' },
      { tap: 1, say: 'CLEAR THE ARROW ON THAT LINE', after: 'PATH CLEAR.' },
      { tap: 0, say: 'SEND IT', after: 'THE BODY FOLLOWS THE HEAD OUT.' },
    ],
  },
  {
    kind: 'curve', level: 11, name: 'HOOKED ARROWS',
    rule: 'FLIES TO THE EDGE, TURNS ONCE THE WAY THE HOOK POINTS, THEN RUNS ALONG THE EDGE.',
    board: { cols: 4, rows: 5, arrows: [
      { cells: [[1, 4], [1, 3]], dir: 0, turn: 1 },
      { cells: [[3, 1], [3, 0]], dir: 0 },
      { cells: [[3, 4], [3, 3]], dir: 0 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE HOOKED ARROW', after: 'BLOCKED AFTER THE TURN — BOTH LEGS MUST BE CLEAR.' },
      { tap: 1, say: 'CLEAR THE ARROW ON THE EDGE', after: 'BOTH LEGS ARE OPEN.' },
      { tap: 0, say: 'SEND THE HOOK', after: 'UP, ROUND THE CORNER, OUT.' },
    ],
  },
  {
    kind: 'sleep', level: 21, name: 'SLEEPING ARROWS',
    rule: 'A HOLLOW ARROW IS ASLEEP. IT WAKES THE MOMENT ANY ARROW TOUCHING IT LEAVES.',
    board: { cols: 4, rows: 4, arrows: [
      { cells: [[1, 3], [1, 2]], dir: 0, sleep: true },
      { cells: [[2, 2], [3, 2]], dir: 1 },
      { cells: [[2, 0], [3, 0]], dir: 1 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE HOLLOW ARROW', after: 'ASLEEP — ITS PATH IS CLEAR, BUT NOTHING TOUCHING IT HAS LEFT.' },
      { tap: 1, say: 'SEND OFF THE ARROW TOUCHING IT', after: 'IT WAKES UP AND FILLS IN.' },
      { tap: 0, say: 'NOW SEND IT', after: 'HOLLOW MEANS WAIT FOR A NEIGHBOUR.' },
    ],
  },
  {
    kind: 'double', level: 31, name: 'DOUBLE ARROWS',
    rule: 'ONE CURVED BODY, TWO HEADS POINTING THE SAME WAY. IT SLIDES OUT AS ONE PIECE, SO EVERYTHING AHEAD OF IT MUST BE CLEAR.',
    board: { cols: 4, rows: 5, arrows: [
      { cells: [[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]], dir: 1, double: true },
      { cells: [[0, 0], [1, 0]], dir: 1 },
      { cells: [[3, 4], [3, 3]], dir: 0 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE DOUBLE ARROW', after: 'BLOCKED — AN ARROW SITS IN FRONT OF THE LOWER HEAD.' },
      { tap: 2, say: 'CLEAR THE ARROW IN FRONT OF THE LOWER HEAD', after: 'NOW EVERYTHING AHEAD OF IT IS CLEAR.' },
      { tap: 0, say: 'SEND IT', after: 'BOTH HEADS LEAD — THE WHOLE PIECE SLIDES OUT.' },
    ],
  },
  {
    kind: 'mirror', level: 41, name: 'MIRRORS',
    rule: 'A MIRROR TURNS ANY STRAIGHT ARROW A QUARTER TURN AS IT PASSES. MIRRORS NEVER MOVE.',
    board: { cols: 4, rows: 4, mirrors: [{ x: 2, y: 2, m: '/' }], arrows: [
      { cells: [[0, 2], [1, 2]], dir: 1 },
      { cells: [[1, 0], [2, 0]], dir: 1 },
      { cells: [[0, 3], [1, 3]], dir: 1 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE ARROW AIMED AT THE MIRROR', after: 'THE MIRROR SENT IT UP — INTO AN ARROW.' },
      { tap: 1, say: 'CLEAR THE ARROW ABOVE THE MIRROR', after: 'THE BOUNCE PATH IS CLEAR.' },
      { tap: 0, say: 'SEND IT THROUGH THE MIRROR', after: 'IN, TURN, OUT.' },
    ],
  },
  {
    kind: 'crate', level: 51, name: 'CRATES',
    rule: 'A CRATE BLOCKS UNTIL ITS NUMBER OF ARROWS HAVE LEFT. EVERY CLEAR COUNTS IT DOWN.',
    board: { cols: 4, rows: 4, crates: [{ x: 2, y: 1, k: 1 }], arrows: [
      { cells: [[0, 1], [1, 1]], dir: 1 },
      { cells: [[1, 3], [2, 3]], dir: 1 },
      { cells: [[0, 2], [0, 3]], dir: 2 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE ARROW AIMED AT THE CRATE', after: 'THE CRATE NEEDS 1 MORE CLEAR.' },
      { tap: 1, say: 'CLEAR ANY OTHER ARROW', after: 'COUNT HIT 0 — THE CRATE BREAKS.' },
      { tap: 0, say: 'NOW SEND THE FIRST ARROW', after: 'CRATES ONLY EVER OPEN.' },
    ],
  },
  {
    kind: 'portal', level: 61, name: 'PORTALS',
    rule: 'AN ARROW THAT ENTERS A PORTAL RING COMES OUT OF ITS PARTNER, STILL HEADING THE SAME WAY. EVERY CELL OF THE WHOLE ROUTE MUST BE CLEAR.',
    board: { cols: 5, rows: 4, portals: [{ a: [2, 1], b: [2, 3], c: 0 }], arrows: [
      { cells: [[0, 1], [1, 1]], dir: 1 },
      { cells: [[3, 3], [4, 3]], dir: 1 },
      { cells: [[3, 1], [4, 1]], dir: 1 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE ARROW AIMED AT THE RING', after: 'BLOCKED — IT CAME OUT OF THE OTHER RING, INTO AN ARROW.' },
      { tap: 1, say: 'CLEAR THE ARROW BEYOND THE OTHER RING', after: 'THE ROUTE THROUGH THE PORTAL IS OPEN.' },
      { tap: 0, say: 'NOW SEND IT', after: 'IN ONE RING, OUT THE OTHER. THE ARROW IN ITS STRAIGHT PATH NEVER MATTERED.' },
    ],
  },
  {
    kind: 'letters', level: 71, name: 'LETTER PAIRS',
    rule: 'A BOARD CAN HOLD SEVERAL PORTAL PAIRS. EACH RING CARRIES A LETTER AND ONLY CONNECTS TO THE OTHER RING WITH THE SAME LETTER.',
    board: { cols: 5, rows: 5, portals: [{ a: [2, 0], b: [2, 3], c: 0 }, { a: [2, 2], b: [1, 4], c: 1 }], arrows: [
      { cells: [[0, 0], [1, 0]], dir: 1 },
      { cells: [[3, 3], [4, 3]], dir: 1 },
      { cells: [[0, 2], [1, 2]], dir: 1 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE ARROW AIMED AT RING A', after: 'BLOCKED — IT CAME OUT OF THE OTHER A, NOT THE B.' },
      { tap: 1, say: 'CLEAR THE ARROW BESIDE THE OTHER A', after: 'THE A ROUTE IS OPEN.' },
      { tap: 0, say: 'SEND IT', after: 'A TO A. THE B PAIR NEVER CAME INTO IT.' },
    ],
  },
  {
    kind: 'oneway', level: 81, name: 'EXIT-ONLY RINGS',
    rule: 'A DASHED RING IS EXIT-ONLY: ARROWS COME OUT OF IT, BUT AN ARROW CROSSING IT JUST CARRIES ON STRAIGHT. ONLY THE SOLID RING SENDS.',
    board: { cols: 5, rows: 4, portals: [{ a: [2, 3], b: [2, 1], c: 0, oneway: true }], arrows: [
      { cells: [[0, 1], [1, 1]], dir: 1 },
      { cells: [[3, 1], [4, 1]], dir: 1 },
      { cells: [[0, 3], [1, 3]], dir: 1 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE ARROW HEADING FOR THE DASHED RING', after: 'BLOCKED — THE DASHED RING DID NOTHING, SO IT RAN STRAIGHT INTO AN ARROW.' },
      { tap: 1, say: 'CLEAR THE ARROW IN ITS PATH', after: 'THE STRAIGHT PATH IS OPEN.' },
      { tap: 0, say: 'SEND IT', after: 'PAST THE DASHED RING, OUT. ONLY THE SOLID RING SENDS.' },
    ],
  },
  {
    kind: 'tunnel', level: 86, name: 'TUNNEL FLOORS',
    rule: 'A TUNNEL FLOOR LETS A PIECE CROSS ONLY THE WAY ITS CHEVRONS POINT. FROM ANY OTHER SIDE IT IS A SOLID WALL THAT NEVER MOVES.',
    board: { cols: 5, rows: 4, tunnels: [{ x: 2, y: 1, dir: 1 }], arrows: [
      { cells: [[0, 1], [1, 1]], dir: 1 },
      { cells: [[3, 1], [4, 1]], dir: 1 },
      { cells: [[2, 3], [2, 2]], dir: 0 },
    ] },
    steps: [
      { tap: 2, say: 'TAP THE ARROW AIMED AT THE TUNNEL FROM THE SIDE', after: 'A WALL — THE TUNNEL ONLY OPENS ALONG ITS CHEVRONS. THIS ARROW CAN NEVER CROSS IT.' },
      { tap: 1, say: 'CLEAR THE ARROW BEYOND THE TUNNEL', after: 'THE LANE THROUGH THE TUNNEL IS OPEN.' },
      { tap: 0, say: 'SEND THE ARROW THROUGH THE TUNNEL', after: 'ALONG THE CHEVRONS, IT CROSSES. ROUTES ON A BOARD ALWAYS CROSS THE RIGHT WAY.' },
    ],
  },
  {
    kind: 'turning', level: 91, name: 'TURNING RINGS',
    rule: 'A RING WITH A HOOK TURNS THE ARROW A QUARTER TURN CLOCKWISE AS IT COMES OUT OF THE OTHER RING.',
    board: { cols: 5, rows: 5, portals: [{ a: [2, 0], b: [3, 2], c: 0, turn: true }], arrows: [
      { cells: [[0, 0], [1, 0]], dir: 1 },
      { cells: [[3, 3], [4, 3]], dir: 1 },
      { cells: [[3, 0], [4, 0]], dir: 1 },
    ] },
    steps: [
      { tap: 0, say: 'TAP THE ARROW AIMED AT THE HOOKED RING', after: 'BLOCKED — IT CAME OUT HEADING DOWN, NOT RIGHT.' },
      { tap: 1, say: 'CLEAR THE ARROW BELOW THE OTHER RING', after: 'THE TURNED ROUTE IS OPEN.' },
      { tap: 0, say: 'SEND IT', after: 'RIGHT INTO THE RING, DOWN OUT OF THE OTHER.' },
    ],
  },
]

/** @param {string | null | undefined} kind */
export function getLesson(kind) {
  return ARROWS_LESSONS.find((l) => l.kind === kind) ?? null
}

/** A fresh lesson board (the lesson data itself is never mutated). */
// Endless-only twists have no lesson (endless boards teach nothing); ARROW
// TYPES shows each on a one-arrow example with its route dotted in.
/** @type {Array<{ kind: string, name: string, board: LessonBoard }>} */
export const ARROWS_ENDLESS_EXAMPLES = [
  { kind: 'diagmods', name: 'DIAGONALS × PORTALS', board: { cols: 5, rows: 5, portals: [{ a: [2, 2], b: [3, 4], c: 0 }], arrows: [{ cells: [[0, 4], [1, 3]], dir: 4 }] } },
  { kind: 'flat', name: 'FLAT MIRRORS', board: { cols: 5, rows: 5, mirrors: [{ x: 3, y: 1, m: '-' }], arrows: [{ cells: [[0, 4], [1, 3]], dir: 4 }] } },
  { kind: 'bank', name: 'BANK SHOTS', board: { cols: 5, rows: 5, arrows: [{ cells: [[1, 4], [2, 3]], dir: 4, twist: 'bank' }] } },
  { kind: 'glide', name: 'GLIDERS', board: { cols: 5, rows: 5, arrows: [{ cells: [[0, 2], [1, 1]], dir: 4, twist: 'glide' }] } },
  { kind: 'elbow', name: 'ELBOWS', board: { cols: 5, rows: 5, arrows: [{ cells: [[0, 4], [0, 3]], dir: 0, turn: 1, twist: 'elbow', n: 1 }] } },
  { kind: 'swerve', name: 'SWERVES', board: { cols: 5, rows: 5, arrows: [{ cells: [[0, 4], [0, 3]], dir: 0, turn: 1, twist: 'swerve', n: 1 }] } },
]

export function lessonLevel(lesson) {
  return { seed: 0, tier: `lesson-${lesson.kind}`, ...structuredClone(lesson.board) }
}

// One tap during a lesson at step `step` (0-based). Off-target taps are
// ignored ('nudge'); the guided tap runs through the real rule check.
// Returns { outcome: 'nudge' } or { outcome: 'blocked' | 'cleared', gone,
// blocker, gap, asleep, crate, wall, next } where `next` is the following step index
// (steps.length once the lesson is done).
export function lessonTap(lesson, level, gone, step, index) {
  const want = lesson.steps[step]
  if (!want || index !== want.tap) return { outcome: 'nudge' }
  const r = applyArrowTap(level, gone, Infinity, index)
  if (!r) return { outcome: 'nudge' }
  return { outcome: r.result, gone: r.gone, blocker: r.blocker, gap: r.gap, asleep: r.asleep ?? false, crate: r.crate ?? null, wall: r.wall ?? null, next: step + 1 }
}
