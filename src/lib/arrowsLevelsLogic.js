// @ts-check
// Arrows solo — the 170-level campaign, endless boards and progress. Pure
// logic: no DOM, no Firebase, no React (storage lives in arrowsProgress.js).
//
// Every level is a generator spec plus a seed picked by
// scripts/pick-arrows-levels.mjs. The specs are built from the chapter table
// below, and the finished boards are baked into arrowsLevelsBaked.js so a
// later generator change can never reshape a level players have already
// starred. The generator guarantees solvability by construction and
// arrowsLevelsLogic.test.js re-checks every level with the solver.
//
// The campaign is 17 chapters of ten. Each chapter teaches one new piece, in
// order: diagonals (BASICS, diagonal arrows at level 6, curved diagonals at 8),
// hooks, sleeping and double arrows, mirrors, crates, portals, letter pairs,
// exit-only and turning rings, tunnels, then the late twists (diagonal mods,
// flat mirrors, bank shots, gliders, elbows, swerves). A chapter's first
// level is a lighter lesson board with only the new piece; levels 2–10 carry
// every piece taught so far, one to three of each, and grow over the ten
// levels before the next chapter resets the size (a sawtooth). Boards past
// 10 × 13 play with drag and zoom, up to 20 × 28. Most boards sit on an
// outline (`mask`, see arrowsShapes.js): empty space is an edge.
// `samples` is the generator's look-ahead — more means fewer arrows free at
// the start; `deep` biases it toward long chains of arrows waiting on each
// other. `portals` lists one kind per pair — 'pair', 'oneway' or 'turn' — and
// stays at three pairs or fewer: portals are told apart by colour alone and
// only three hues pass the colour-blind check.

import { ARROWS_ENDLESS_SPECS, ARROWS_LIVES, ARROWS_TIERS, ARROWS_TWISTS, arrowRoute, generateArrowsLevel, isBent, isCurved, isDiagonal, isDouble, isSleeper, portalUses, seededRng, solveArrows, tunnelUses } from './arrowsLogic.js'
import { ARROWS_BAKED_LEVELS as BAKED } from './arrowsLevelsBaked.js'
import { ARROWS_SHAPE_ORDER, maskCells, maskConnected, shapeFrame, shapeMask } from './arrowsShapes.js'

// [chapter name, the piece it teaches, columns of its last (biggest) board].
/** @type {Array<[string, string, number]>} */
const CHAPTER_TABLE = [
  ['BASICS', 'diag', 7],
  ['HOOKS', 'curve', 9],
  ['SLEEPING ARROWS', 'sleep', 10],
  ['DOUBLE ARROWS', 'double', 10],
  ['MIRRORS', 'mirror', 11],
  ['CRATES', 'crate', 12],
  ['PORTALS', 'portal', 13],
  ['LETTER PAIRS', 'letters', 13],
  ['ONE-WAY RINGS', 'oneway', 14],
  ['TURNING RINGS', 'turning', 14],
  ['TUNNELS', 'tunnel', 15],
  ['DIAGONAL MODS', 'diagmods', 16],
  ['FLAT MIRRORS', 'flat', 16],
  ['BANK SHOTS', 'bank', 17],
  ['GLIDERS', 'glide', 18],
  ['ELBOWS', 'elbow', 19],
  ['SWERVES', 'swerve', 20],
]
// Player-facing name of what each chapter's lesson board introduces.
export const ARROWS_PIECE_NAMES = {
  diag: 'DIAGONALS', curve: 'HOOKED ARROWS', sleep: 'SLEEPING ARROWS', double: 'DOUBLE ARROWS',
  mirror: 'MIRRORS', crate: 'CRATES', portal: 'PORTALS', letters: 'LETTER PAIRS',
  oneway: 'EXIT-ONLY RINGS', turning: 'TURNING RINGS', tunnel: 'TUNNELS', diagmods: 'DIAGONAL MODS',
  flat: 'FLAT MIRRORS', bank: 'BANK SHOTS', glide: 'GLIDERS', elbow: 'ELBOWS', swerve: 'SWERVES',
}
const PIECES = CHAPTER_TABLE.map((c) => c[1])
const PER_CHAPTER = 10
const lerp = (a, b, t) => Math.round(a + (b - a) * t)

// Level (1-based) that introduces each piece. Curved diagonals ('bend') have
// no chapter of their own: they arrive at level 8, inside BASICS.
export const ARROWS_PIECE_LEVEL = {
  diag: 6,
  bend: 8,
  ...Object.fromEntries(CHAPTER_TABLE.map(([, key], ci) => [key, ci === 0 ? 6 : ci * PER_CHAPTER + 1])),
}

// Frame of chapter `ci`'s ten boards: [cols, rows] growing from a lesson size
// (at most 10 × 13 so it never needs the camera) to the chapter's peak.
function chapterDims(ci) {
  const endC = CHAPTER_TABLE[ci][2]
  const endR = ci === 0 ? 10 : Math.round(endC * 1.4)
  const startC = ci === 0 ? 5 : Math.min(10, Math.max(6, Math.round(endC * 0.62)))
  const startR = ci === 0 ? 6 : Math.min(13, Math.max(8, Math.round(endR * 0.62)))
  return Array.from({ length: PER_CHAPTER }, (_, k) => [lerp(startC, endC, k / 9), lerp(startR, endR, k / 9)])
}

// Which outline each level sits on: the first two levels are rectangles, then
// every level is shaped except level 5 of each later chapter (one plain
// rectangle per chapter for contrast). Lesson boards use gentle outlines. The
// pool widens chapter by chapter.
const GENTLE = ['octagon', 'hexagon', 'diamond', 'octagon', 'hexagon']
function shapeFor(ci, k) {
  if (ci === 0 && k < 2) return null
  if (ci > 0 && k === 4) return null
  if (k === 0) return GENTLE[ci % GENTLE.length]
  const pool = ARROWS_SHAPE_ORDER.slice(0, Math.min(ARROWS_SHAPE_ORDER.length, 4 + ci))
  return pool[(ci * 7 + k * 3) % pool.length]
}

// Never more than three portal pairs a board; a plain pair makes way first.
function capPortals(portals) {
  const out = [...portals]
  while (out.length > 3) {
    const i = out.indexOf('pair')
    out.splice(i >= 0 ? i : out.length - 1, 1)
  }
  return out
}

// Spec for chapter ci (0-based), level k (0-based).
function levelSpec(ci, k) {
  const [cols, rows] = chapterDims(ci)[k]
  const have = new Set(PIECES.slice(0, ci + 1))
  const fresh = PIECES[ci]
  const lesson = k === 0
  const t = k / 9
  // On a lesson board only the new piece's furniture; arrow kinds stay.
  const old = (key) => have.has(key) && (!lesson || fresh === key)
  const n = (key, lo, hi) => (fresh === key ? lerp(lesson ? 1 : 2, hi + 1, t) : old(key) ? lerp(lo, hi, t) : 0)
  const scale = cols * rows >= 200 ? 1 : 0 // a second copy of older pieces only on big boards
  const spec = {
    cols, rows,
    maxLen: Math.min(9, 3 + Math.floor((cols + rows) / 5)),
    fill: Math.min(0.93, 0.62 + 0.012 * ci + 0.2 * t + (ci > 0 ? 0.08 : 0)),
    samples: Math.min(14, 2 + ci + Math.round(6 * t)),
    deep: ci >= 2 ? Math.min(1, 0.3 + 0.7 * t) : 0,
  }
  // Arrow kinds (never removed once taught).
  if (ci === 0) {
    if (k >= 5) spec.diag = k === 5 ? 0.3 : 0.18
    if (k >= 7) spec.bend = k === 7 ? 1 : 0.8
  } else { spec.diag = 0.14; spec.bend = 0.9 }
  if (have.has('curve')) spec.curve = fresh === 'curve' ? (lesson ? 0.3 : 0.18) : 0.12
  for (const [key, field] of [['sleep', 'sleepers'], ['double', 'doubles'], ['mirror', 'mirrors'], ['crate', 'crates'], ['tunnel', 'tunnels'], ['flat', 'flatMirrors']]) {
    const count = n(key, 1, 1 + scale)
    if (count) spec[field] = count
  }
  // Portals: one entry per pair.
  const portals = []
  if (old('portal')) portals.push('pair')
  if (old('letters')) portals.push('pair')
  if (old('oneway')) portals.push('oneway')
  if (old('turning')) portals.push('turn')
  if (fresh === 'letters' && (lesson || k >= 5)) portals.push('pair')
  if (fresh === 'letters' && lesson) portals.push('pair')
  // A diagonal needs a mirror and a ring to show what it does with them.
  if (fresh === 'diagmods' && lesson) { portals.push('pair'); spec.mirrors = 1 }
  if (portals.length) spec.portals = capPortals(portals)
  if (have.has('diagmods') && (!lesson || fresh === 'diagmods')) { spec.diagMods = true; spec.diagTunnels = true }
  for (const tw of ARROWS_TWISTS) {
    if (have.has(tw)) spec[tw] = fresh === tw ? (lesson ? 0.12 : 0.08) : 0.04
  }
  if (ci >= 9) spec.owe = true
  // Intros: diagonals at level 6, curved diagonals at 8, then each chapter's
  // lesson board introduces the chapter's piece.
  if (ci === 0) {
    if (k === 5) spec.intro = 'diag'
    if (k === 7) spec.intro = 'bend'
  } else if (lesson) spec.intro = fresh
  // Shapes: the frame grows until the outline holds as many cells as the
  // rectangle would, so the size ramp is in playable cells. An outline that
  // cannot hold ~90% of the cells inside the frame cap (a thin arrow or zigzag
  // on the biggest boards) gives way to the next outline in the library, so the
  // ramp never shrinks.
  const first = shapeFor(ci, k)
  if (first) {
    const at = ARROWS_SHAPE_ORDER.indexOf(first)
    for (const shape of [first, ...ARROWS_SHAPE_ORDER.slice(at + 1), ...ARROWS_SHAPE_ORDER]) {
      const f = shapeFrame(shape, cols * rows, rows / cols, lesson ? 10 : 20, lesson ? 13 : 28)
      if (f && (lesson || maskCells(f.mask) >= 0.9 * cols * rows)) return { ...spec, cols: f.cols, rows: f.rows, mask: f.mask, shape }
    }
  }
  return spec
}

export const ARROWS_LEVEL_SPECS = CHAPTER_TABLE.flatMap((_, ci) => Array.from({ length: PER_CHAPTER }, (__, k) => levelSpec(ci, k)))

// Chapters in the level list (level select headers); `piece` is what the
// chapter's lesson board introduces.
export const ARROWS_CHAPTERS = CHAPTER_TABLE.map(([name, piece], ci) => ({ name, from: ci * PER_CHAPTER + 1, to: (ci + 1) * PER_CHAPTER, piece }))

// Picked by scripts/pick-arrows-levels.mjs — rerun it after changing a spec,
// then bake with scripts/bake-arrows-levels.mjs.
export const ARROWS_LEVEL_SEEDS = [
  87, 119, 54, 198, 97, 29, 84, 4, 154, 3,
  76, 262, 51, 135, 285, 79, 159, 81, 91, 202,
  226, 121, 65, 25, 21, 56, 256, 38, 84, 73,
  201, 46, 26, 122, 31, 132, 210, 78, 42, 232,
  55, 202, 52, 115, 35, 243, 64, 217, 10, 183,
  146, 144, 178, 109, 76, 182, 208, 203, 38, 136,
  92, 267, 123, 154, 15, 23, 194, 209, 282, 49,
  267, 186, 34, 207, 109, 49, 28, 29, 83, 133,
  5, 190, 153, 226, 139, 8, 181, 105, 296, 249,
  105, 165, 98, 5, 37, 141, 233, 280, 67, 174,
  40, 207, 148, 69, 86, 101, 261, 230, 154, 156,
  25, 114, 129, 272, 207, 218, 153, 229, 177, 81,
  290, 45, 46, 197, 167, 145, 3, 136, 264, 238,
  90, 52, 164, 222, 239, 107, 131, 51, 74, 24,
  216, 263, 299, 143, 177, 68, 116, 71, 213, 127,
  267, 142, 276, 218, 166, 99, 19, 116, 241, 252,
  53, 39, 263, 69, 37, 235, 128, 300, 137, 151,
]

// Every level reads its finished board from BAKED.
export const ARROWS_GENERATED_LEVELS = 0

export const ARROWS_LEVEL_COUNT = ARROWS_LEVEL_SPECS.length

// One-line tutorials, shown the first time a player meets each twist.
export const ARROWS_TWIST_TIPS = {
  diag: 'NEW · DIAGONAL ARROWS FLY CORNER TO CORNER — ONLY CELLS ON THEIR DIAGONAL BLOCK THEM.',
  bend: 'NEW · CURVED DIAGONALS BEND LIKE A SNAKE, BUT THE HEAD STILL FLIES STRAIGHT ALONG ITS DIAGONAL.',
  curve: 'NEW · HOOKED ARROWS FLY TO THE EDGE, TURN ONCE THE WAY THE HOOK POINTS, THEN RUN ALONG IT.',
  sleep: 'NEW · HOLLOW ARROWS ARE ASLEEP — ONE WAKES WHEN AN ARROW TOUCHING IT LEAVES.',
  double: 'NEW · DOUBLE ARROWS SLIDE OUT AS ONE PIECE — CLEAR THE WAY FOR BOTH HEADS AND INSIDE THE CURVE.',
  mirror: 'NEW · MIRRORS TURN A STRAIGHT ARROW A QUARTER TURN AS IT PASSES. A PLAIN DIAGONAL CANNOT CROSS ONE.',
  crate: 'NEW · A CRATE BLOCKS UNTIL ITS NUMBER OF ARROWS HAVE LEFT THE BOARD. EVERY CLEAR COUNTS IT DOWN.',
  portal: 'NEW · AN ARROW THAT ENTERS A PORTAL RING COMES OUT OF ITS PARTNER, KEEPING ITS HEADING. THE WHOLE ROUTE MUST BE CLEAR.',
  letters: 'NEW · SEVERAL PORTAL PAIRS — EACH RING CARRIES A LETTER, AND A RING ONLY CONNECTS TO ITS OWN LETTER.',
  oneway: 'NEW · A DASHED RING ONLY LETS ARROWS OUT. ENTER ITS SOLID PARTNER; CROSSING THE DASHED ONE DOES NOTHING.',
  turning: 'NEW · A HOOKED RING TURNS THE ARROW A QUARTER TURN CLOCKWISE AS IT COMES OUT THE OTHER SIDE.',
  tunnel: 'NEW · A TUNNEL FLOOR LETS A PIECE CROSS ONLY THE WAY ITS CHEVRONS POINT. ANY OTHER WAY IT IS A SOLID WALL.',
  shape: 'NEW · NOT EVERY BOARD IS A RECTANGLE. EMPTY SPACE IS AN EDGE — AN ARROW THAT REACHES IT LEAVES THE BOARD.',
  // Late pieces: the last six campaign chapters, and endless boards.
  diagmods: 'DIAGONALS GO THROUGH PORTALS KEEPING THEIR SLANT, SLIDE ALONG A MIRROR BAR THAT RUNS THEIR WAY, AND CROSS A SLANTED TUNNEL ITS WAY ONLY.',
  flat: 'A FLAT MIRROR BOUNCES A DIAGONAL LIKE A BALL OFF A WALL. A STRAIGHT ARROW ONLY RUNS ALONG IT.',
  bank: 'A ZIG-ZAG DIAGONAL BOUNCES OFF THE FIRST WALL IT HITS, THEN FLIES OUT. A CORNER SHOT LEAVES STRAIGHT AWAY.',
  glide: 'A RAILED DIAGONAL FLIES TO A WALL, THEN SLIDES ALONG THAT WALL AND OUT.',
  elbow: 'AN ELBOW FLIES AS MANY CELLS AS ITS DOTS, TURNS THE WAY ITS HOOK CURLS, THEN FLIES OUT.',
  swerve: 'A SWERVE FLIES AS MANY CELLS AS ITS DOTS, JOGS ONE LANE THE WAY ITS KINK POINTS, THEN CARRIES ON.',
}

// Does some diagonal's route actually use a mirror, a portal or a tunnel?
export function diagonalUsesMods(level) {
  if (!level.mirrors?.length && !level.portals?.length && !level.tunnels?.length) return false
  const fixed = new Set([
    ...(level.mirrors ?? []).map((m) => m.y * level.cols + m.x),
    ...(level.tunnels ?? []).map((t) => t.y * level.cols + t.x),
    ...(level.portals ?? []).flatMap((p) => [p.a[1] * level.cols + p.a[0], p.b[1] * level.cols + p.b[0]]),
  ])
  return level.arrows.some((a) => isDiagonal(a) && arrowRoute(level, a).cells.some((c) => fixed.has(c)))
}

// Does a board carry the tunnel floors its spec asked for, each one actually
// crossed by some arrow's route (an intro level shows each on two routes)?
function tunnelsMeet(spec, level, uses) {
  if (!spec.tunnels) return true
  if ((level.tunnels?.length ?? 0) < spec.tunnels) return false
  return tunnelUses(level).every((u) => u >= uses)
}

// Does a board carry the portal pairs its spec asked for, each one actually
// on some arrow's route? An intro level shows every pair on `introUses`
// routes, so the player sees what a ring does a few times.
function portalsMeet(spec, level, uses) {
  if (!spec.portals?.length) return true
  if ((level.portals?.length ?? 0) < spec.portals.length) return false
  return portalUses(level).every((u) => u >= uses)
}

// Arrows whose route runs over a flat mirror.
function flatMirrorUses(level) {
  const flats = new Set((level.mirrors ?? []).filter((m) => m.m === '-' || m.m === '|').map((m) => m.y * level.cols + m.x))
  if (!flats.size) return 0
  return level.arrows.filter((a) => arrowRoute(level, a).cells.some((c) => flats.has(c))).length
}

// Diagonals whose route crosses a mirror, a portal or a tunnel.
function diagonalModUses(level) {
  const fixed = new Set([
    ...(level.mirrors ?? []).map((m) => m.y * level.cols + m.x),
    ...(level.tunnels ?? []).map((t) => t.y * level.cols + t.x),
    ...(level.portals ?? []).flatMap((p) => [p.a[1] * level.cols + p.a[0], p.b[1] * level.cols + p.b[0]]),
  ])
  if (!fixed.size) return 0
  return level.arrows.filter((a) => isDiagonal(a) && arrowRoute(level, a).cells.some((c) => fixed.has(c))).length
}

// An intro level must actually show its twist a few times.
// Levels past the curved-diagonal intro keep showing at least one.
export function levelMeetsIntro(spec, level) {
  if (spec.bend > 0 && spec.diag > 0 && !level.arrows.some(isBent)) return false
  if (spec.intro === 'diag') return level.arrows.filter(isDiagonal).length >= 2
  if (spec.intro === 'bend') return level.arrows.filter(isBent).length >= 2
  if (spec.intro === 'curve') return level.arrows.filter(isCurved).length >= 2
  if (spec.intro === 'diagmods' && diagonalModUses(level) < 2) return false
  if (spec.intro === 'flat' && flatMirrorUses(level) < 2) return false
  if (ARROWS_TWISTS.includes(spec.intro) && level.arrows.filter((a) => a.twist === spec.intro).length < 2) return false
  if (spec.sleepers && level.arrows.filter(isSleeper).length < spec.sleepers) return false
  if (spec.doubles && level.arrows.filter(isDouble).length < spec.doubles) return false
  if (spec.mirrors && (level.mirrors?.length ?? 0) < spec.mirrors) return false
  if (spec.crates && (level.crates?.length ?? 0) < spec.crates) return false
  if (!portalsMeet(spec, level, spec.intro ? 2 : 1)) return false
  if (!tunnelsMeet(spec, level, spec.intro ? 2 : 1)) return false
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
  if (level.tunnels?.length) out.push('tunnel')
  if (level.mask) out.push('shape')
  // Endless-only pieces, after every campaign kind.
  if (diagonalUsesMods(level)) out.push('diagmods')
  if (level.mirrors?.some((m) => m.m === '-' || m.m === '|')) out.push('flat')
  for (const t of ARROWS_TWISTS) if (level.arrows.some((a) => a.twist === t)) out.push(t)
  return out
}

// The first twist on this board the player has not been taught yet.
export function newTwist(level, seen) {
  return twistsIn(level).find((t) => !seen?.[t]) ?? null
}

// Shaped endless boards (see arrowsShapes.js). Each tier draws a shaped board
// with chance `odds` (otherwise the plain ARROWS_ENDLESS_SPECS rectangle),
// picks the outline from `pool` and grows it until it has `cells` playable
// cells — so the arrow count climbs with the tier the way the campaign's
// shaped boards do. Easy shapes stay small (about 80 cells); medium and hard
// outgrow the 10 × 13 no-camera size (hard up to the 20 × 28 endless maximum)
// and play with drag and zoom, like levels 101+.
export const ARROWS_ENDLESS_SHAPES = {
  easy: { odds: 0.2, pool: ['diamond', 'cross', 'arrow'], cells: 80, maxLen: 6 },
  medium: { odds: 0.55, pool: ['diamond', 'cross', 'heart', 'arrow', 'donut'], cells: 240, maxLen: 7 },
  hard: { odds: 0.7, pool: ['diamond', 'cross', 'donut', 'heart', 'lantern', 'arrow'], cells: 400, maxLen: 8 },
}

export const ARROWS_ENDLESS_MAX_COLS = 20
export const ARROWS_ENDLESS_MAX_ROWS = 28

// The smallest portrait grid (about 5 : 7) whose `shape` outline holds at
// least `cells` playable cells, capped at the 20 × 28 endless maximum.
export function endlessShapeDims(shape, cells) {
  for (let cols = 6; cols < ARROWS_ENDLESS_MAX_COLS; cols += 1) {
    const rows = Math.min(ARROWS_ENDLESS_MAX_ROWS, Math.round(cols * 1.4))
    if (maskCells(shapeMask(shape, cols, rows)) >= cells) return { cols, rows }
  }
  return { cols: ARROWS_ENDLESS_MAX_COLS, rows: ARROWS_ENDLESS_MAX_ROWS }
}

// The pieces a player has met: every piece whose introducing level has a star.
export function learnedPieces(progress) {
  return Object.keys(ARROWS_PIECE_LEVEL).filter((key) => levelStars(progress, ARROWS_PIECE_LEVEL[key]) >= 1)
}

// An endless spec reduced to the pieces in `learned` (an array of piece keys):
// everything else is left off the board. Outlines are always fair game.
function learnedSpec(spec, learned) {
  const has = (key) => learned.includes(key)
  const out = { ...spec }
  if (!has('diag')) { out.diag = 0; out.bend = 0 } else if (!has('bend')) out.bend = 0
  if (!has('curve')) out.curve = 0
  if (!has('sleep')) out.sleepers = 0
  if (!has('double')) out.doubles = 0
  if (!has('mirror')) out.mirrors = 0
  if (!has('flat')) out.flatMirrors = 0
  if (!has('crate')) out.crates = 0
  if (!has('tunnel')) out.tunnels = 0
  if (!has('diagmods')) { out.diagMods = false; out.diagTunnels = false }
  for (const t of ARROWS_TWISTS) if (!has(t)) out[t] = 0
  if (spec.portals) {
    let pairs = 0
    out.portals = spec.portals.filter((kind) => {
      if (kind === 'oneway') return has('oneway')
      if (kind === 'turn') return has('turning')
      pairs += 1
      return pairs === 1 ? has('portal') : has('letters')
    })
  }
  return out
}

// Endless tiers carry the late mechanics races leave out. Unknown tiers fall
// back to easy; the spec keeps its tier name for the board's title. The seed
// picks rectangle or outline from its own random stream, so the board the
// generator draws for it is untouched by that choice. With `learned` the spec
// is cut down to the pieces the player has met.
function endlessSpec(tier, seed, learned) {
  const name = ARROWS_ENDLESS_SPECS[tier] ? tier : 'easy'
  let spec = { ...ARROWS_ENDLESS_SPECS[name], name }
  if (Array.isArray(learned)) spec = learnedSpec(spec, learned)
  const shapes = ARROWS_ENDLESS_SHAPES[name]
  if (seed === undefined || !shapes) return spec
  const rng = seededRng(seed ^ 0x2545f491)
  if (rng() >= shapes.odds) return spec
  const shape = shapes.pool[Math.floor(rng() * shapes.pool.length)]
  const { cols, rows } = endlessShapeDims(shape, shapes.cells)
  return { ...spec, cols, rows, maxLen: shapes.maxLen, mask: shapeMask(shape, cols, rows), shape }
}

// Share of the playable cells that an arrow covers.
function arrowCoverage(level) {
  const playable = level.mask ? maskCells(level.mask) : level.cols * level.rows
  return level.arrows.reduce((sum, a) => sum + a.cells.length, 0) / playable
}

// Endless boards must cover at least this share of their cells (see
// endlessMeets) so none ships mostly empty. Hard's floor is lower, and
// its 20 × 28 rectangles are exempt: they top out near 0.6, so a floor there
// would drop rectangles from hard altogether.
export const ARROWS_ENDLESS_COVERAGE = { easy: 0.7, medium: 0.7, hard: 0.64 }

// Does a board actually carry the special pieces its spec asked for? The
// generator places sleepers/doubles/mirrors/crates/portals best-effort, so a bare
// solvable check could serve a board missing the tier's whole point.
function endlessMeets(level, spec) {
  // A shaped board must be one piece, or part of it could never be reached.
  if (spec.mask && !maskConnected(spec.mask)) return false
  if ((spec.mask || spec.name !== 'hard') && arrowCoverage(level) < ARROWS_ENDLESS_COVERAGE[spec.name]) return false
  // A tier that sets a twist chance must show the twist: a portal board has
  // fewer live routes, so a hooked arrow can fail to place.
  if (spec.diag && !level.arrows.some(isDiagonal)) return false
  if (spec.curve && !level.arrows.some(isCurved)) return false
  if (spec.sleepers && level.arrows.filter(isSleeper).length < spec.sleepers) return false
  if (spec.doubles && level.arrows.filter(isDouble).length < spec.doubles) return false
  if (spec.mirrors && (level.mirrors?.length ?? 0) < spec.mirrors) return false
  if (spec.crates && (level.crates?.length ?? 0) < spec.crates) return false
  if (!portalsMeet(spec, level, 1)) return false
  // Endless pieces: the tunnels and flat mirrors asked for, at least one arrow
  // of every twist with a chance, and a diagonal that really meets a mod.
  // Every tunnel is placed; at least one is on a live route (a tile can land
  // where no route can reach it the way it points, and then just sits there).
  if (spec.tunnels && ((level.tunnels?.length ?? 0) < spec.tunnels || !tunnelUses(level).some((u) => u >= 1))) return false
  const flats = (level.mirrors ?? []).filter((m) => m.m === '-' || m.m === '|').length
  if (spec.flatMirrors && flats < spec.flatMirrors) return false
  for (const t of ARROWS_TWISTS) if (spec[t] && !level.arrows.some((a) => a.twist === t)) return false
  if (spec.diagMods && !diagonalUsesMods(level)) return false
  return true
}

// Endless boards: any seed at an endless tier. The generator is solvable by
// construction; the solver re-checks and steps to the next seed if a board
// ever failed, so endless play can never serve a dead board — or one missing
// the mechanics its tier promises. `learned` (see learnedPieces) leaves out
// every piece the player has not met; races and the demo pass nothing and get
// the full tier.
export function endlessLevel(seed, tier, learned) {
  for (let s = seed; ; s += 1) {
    const spec = endlessSpec(tier, s, learned)
    const level = generateArrowsLevel(s, spec)
    if (solveArrows(level).solvable && endlessMeets(level, spec)) {
      if (spec.shape) level.shape = spec.shape
      return level
    }
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
// { levels: { l1: stars, … }, endless: { easy, medium, hard }, replayed: { l1: true, … } }.
// Level keys carry an `l` prefix so Firebase never turns the map into a sparse
// array. `replayed` marks a level among the first REPLAY_LEVELS cleared on its
// current board: stars earned before the 170-level rebuild keep their level
// number, and those levels show a NEW BOARD tag until they are replayed.
const REPLAY_LEVELS = 100

export const levelKey = (n) => `l${n}`

export function blankProgress() {
  return { levels: {}, endless: { easy: 0, medium: 0, hard: 0 }, replayed: {} }
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
  const replayed = raw.replayed && typeof raw.replayed === 'object' ? raw.replayed : {}
  for (let n = 1; n <= REPLAY_LEVELS; n += 1) {
    if (replayed[levelKey(n)] === true) out.replayed[levelKey(n)] = true
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

// A starred level among the first 100 whose current board has not been
// cleared yet: its stars come from the board it had before the rebuild.
export function isNewBoard(progress, n) {
  return n >= 1 && n <= REPLAY_LEVELS && levelStars(progress, n) >= 1 && !progress?.replayed?.[levelKey(n)]
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
  if (n <= REPLAY_LEVELS) p.replayed[key] = true
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
    if (x.replayed[key] || y.replayed[key]) out.replayed[key] = true
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

// Stars one chapter can hold (3 per level).
export function chapterStars(progress, chapter) {
  let n = 0
  for (let l = chapter.from; l <= chapter.to; l += 1) n += levelStars(progress, l)
  return n
}

// A chapter turns gold at 24 of its 30 stars. A target only: it never locks
// or unlocks anything (isLevelUnlocked ignores it).
export const ARROWS_CHAPTER_GOLD = 24
const goldTarget = (max) => (max === 30 ? ARROWS_CHAPTER_GOLD : Math.round(0.8 * max))

export function chapterGoal(progress, chapter) {
  const got = chapterStars(progress, chapter)
  const max = (chapter.to - chapter.from + 1) * 3
  const gold = goldTarget(max)
  return { got, max, gold, isGold: got >= gold, toGold: Math.max(0, gold - got) }
}

export function chapterGold(progress, chapter) {
  return chapterGoal(progress, chapter).isGold
}

// Where CONTINUE goes: the first unlocked level not yet cleared, else the
// last level.
export function nextLevel(progress) {
  for (let n = 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
    if (isLevelUnlocked(progress, n) && levelStars(progress, n) === 0) return n
  }
  return ARROWS_LEVEL_COUNT
}
