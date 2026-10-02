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
/** @typedef {{ cols: number, rows: number, arrows: Array<Record<string, any>> }} LessonBoard */
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
]

/** @param {string | null | undefined} kind */
export function getLesson(kind) {
  return ARROWS_LESSONS.find((l) => l.kind === kind) ?? null
}

/** A fresh lesson board (the lesson data itself is never mutated). */
export function lessonLevel(lesson) {
  return { seed: 0, tier: `lesson-${lesson.kind}`, ...structuredClone(lesson.board) }
}

// One tap during a lesson at step `step` (0-based). Off-target taps are
// ignored ('nudge'); the guided tap runs through the real rule check.
// Returns { outcome: 'nudge' } or { outcome: 'blocked' | 'cleared', gone,
// blocker, gap, asleep, next } where `next` is the following step index
// (steps.length once the lesson is done).
export function lessonTap(lesson, level, gone, step, index) {
  const want = lesson.steps[step]
  if (!want || index !== want.tap) return { outcome: 'nudge' }
  const r = applyArrowTap(level, gone, Infinity, index)
  if (!r) return { outcome: 'nudge' }
  return { outcome: r.result, gone: r.gone, blocker: r.blocker, gap: r.gap, asleep: r.asleep ?? false, next: step + 1 }
}
