// @ts-check
// minigolfCourses.js — hole data for Minigolf (pure data, no DOM).
//
// Course space is 360×600 units, portrait: every hole is authored to fit a
// phone held in one hand, and the renderer scales it to the play area.
// Each hole teaches one idea; the front nine combines them.
//
// Shapes:
//   bounds   closed polygons the ball plays inside (walls are their edges)
//   blocks   closed polygons inside the bounds (solid islands)
//   zones    { t: 'sand' | 'water' | 'slope', r: [x, y, w, h], ax?, ay? }
//   bumpers  [x, y, radius] — elastic plus a kick
//   movers   { t: 'mill', x, y, len, n, w } rotating blades (w rad/s)
//            { t: 'slide', y, x0, x1, w, h, period, ph } block sliding x0↔x1
//   portals  { a: [x, y], b: [x, y] } one-way warp a → b, speed kept
//
// docs: the design page (data/games-minigolf-design-s1) sketches each hole.

export const COURSE_W = 360
export const COURSE_H = 600

/** @param {number} x @param {number} y @param {number} w @param {number} h */
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

export const HOLES = [
  {
    id: 'straight', name: 'STRAIGHT SHOT', par: 2, idea: 'Learn the pull. Nothing in the way.',
    tee: [180, 510], cup: [180, 110],
    bounds: [rect(110, 40, 140, 520)],
  },
  {
    id: 'dogleg', name: 'DOGLEG', par: 3, idea: 'Bank off the 45° corner.',
    tee: [95, 515], cup: [272, 112],
    bounds: [[[40, 560], [150, 560], [150, 170], [320, 170], [320, 60], [95, 60], [40, 115]]],
  },
  {
    id: 'bumpers', name: 'BUMPER ALLEY', par: 3, idea: 'Pinball bumpers kick the ball.',
    tee: [180, 520], cup: [180, 90],
    bounds: [rect(60, 40, 240, 520)],
    bumpers: [[130, 210, 16], [230, 210, 16], [180, 300, 18], [118, 400, 14], [242, 400, 14]],
  },
  {
    id: 'ramp', name: 'THE RAMP', par: 3, idea: 'Uphill slope. Too soft rolls back.',
    tee: [180, 520], cup: [180, 100],
    bounds: [rect(90, 40, 180, 520)],
    zones: [{ t: 'slope', r: [90, 220, 180, 150], ax: 0, ay: 240 }],
  },
  {
    id: 'windmill', name: 'WINDMILL', par: 3, idea: 'Time the blades through the gap.',
    tee: [180, 520], cup: [180, 100],
    bounds: [rect(70, 40, 220, 520)],
    blocks: [rect(70, 292, 76, 16), rect(214, 292, 76, 16)],
    movers: [{ t: 'mill', x: 180, y: 300, len: 40, n: 4, w: 1.5 }],
  },
  {
    id: 'sand', name: 'SAND TRAP', par: 3, idea: 'Thread the lane, avoid the sand.',
    tee: [180, 520], cup: [180, 105],
    bounds: [rect(50, 40, 260, 520)],
    blocks: [rect(150, 330, 60, 40)],
    zones: [
      { t: 'sand', r: [50, 170, 110, 130] },
      { t: 'sand', r: [200, 170, 110, 130] },
      { t: 'sand', r: [130, 55, 100, 22] },
    ],
  },
  {
    id: 'moat', name: 'MOAT', par: 3, idea: 'Cross the bridge or splash (+1).',
    tee: [90, 515], cup: [270, 100],
    bounds: [rect(40, 40, 280, 520)],
    zones: [{ t: 'water', r: [40, 250, 110, 80] }, { t: 'water', r: [210, 250, 110, 80] }],
  },
  {
    id: 'sliders', name: 'SLIDERS', par: 3, idea: 'Two moving blocks. Read the rhythm.',
    tee: [180, 520], cup: [180, 100],
    bounds: [rect(70, 40, 220, 520)],
    movers: [
      { t: 'slide', y: 210, x0: 72, x1: 218, w: 70, h: 16, period: 3.2, ph: 0 },
      { t: 'slide', y: 360, x0: 72, x1: 218, w: 70, h: 16, period: 2.6, ph: 0.5 },
    ],
  },
  {
    id: 'portals', name: 'PORTALS', par: 3, idea: 'Warp to the upper chamber, keep speed.',
    tee: [120, 515], cup: [240, 95],
    bounds: [rect(60, 330, 240, 230), rect(60, 40, 240, 230)],
    bumpers: [[170, 150, 14]],
    portals: [{ a: [240, 390], b: [100, 225] }],
  },
]

// Courses are lists of HOLES indices. QUICK plays the intro, the windmill and
// the finale.
export const COURSES = {
  front9: { id: 'front9', label: 'FRONT 9', holes: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
  quick3: { id: 'quick3', label: 'QUICK 3', holes: [0, 4, 8] },
}
export const DEFAULT_COURSE = 'front9'

/** @param {string | null | undefined} id */
export function getCourse(id) {
  return COURSES[/** @type {'front9'|'quick3'} */ (id)] ?? COURSES[DEFAULT_COURSE]
}

/** Total par of a course. @param {string | null | undefined} id */
export function coursePar(id) {
  return getCourse(id).holes.reduce((sum, i) => sum + HOLES[i].par, 0)
}
