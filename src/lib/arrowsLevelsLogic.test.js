import { describe, it, expect } from 'vitest'
import { applyArrowTap, arrowRoute, generateArrowsLevel, isBent, isCurved, isDiagonal, isDouble, isSleeper, levelStats, occupancy, portalRings, portalUses, solveArrows, voidSet, ARROWS_ENDLESS_SPECS } from './arrowsLogic'
import { ARROWS_BAKED_LEVELS } from './arrowsLevelsBaked'
import {
  ARROWS_CHAPTERS,
  ARROWS_GENERATED_LEVELS,
  ARROWS_LEVEL_COUNT,
  ARROWS_LEVEL_SEEDS,
  ARROWS_LEVEL_SPECS,
  ARROWS_TWIST_TIPS,
  blankProgress,
  endlessLevel,
  getArrowsLevel,
  isLevelUnlocked,
  levelKey,
  levelMeetsIntro,
  levelStars,
  mergeProgress,
  newTwist,
  nextLevel,
  normalizeProgress,
  recordEndlessClear,
  recordLevelResult,
  sameProgress,
  starsFor,
  totalStars,
  twistsIn,
} from './arrowsLevelsLogic'

const levels = Array.from({ length: ARROWS_LEVEL_COUNT }, (_, i) => getArrowsLevel(i + 1))
const stats = levels.map(levelStats)

describe('the 100-level campaign', () => {
  it('has 100 levels, one seed each, in chapters that cover them all', () => {
    expect(ARROWS_LEVEL_COUNT).toBe(100)
    expect(ARROWS_LEVEL_SEEDS).toHaveLength(100)
    expect(levels.every(Boolean)).toBe(true)
    expect(ARROWS_CHAPTERS[0].from).toBe(1)
    expect(ARROWS_CHAPTERS.at(-1).to).toBe(100)
    ARROWS_CHAPTERS.slice(1).forEach((c, i) => expect(c.from).toBe(ARROWS_CHAPTERS[i].to + 1))
    expect(ARROWS_CHAPTERS.slice(5).map((c) => [c.name, c.from, c.to])).toEqual([
      ['PORTALS', 61, 70], ['LETTER PAIRS', 71, 80], ['EXIT-ONLY', 81, 90], ['TURNING', 91, 100],
    ])
  })

  it('every level is solvable (independent greedy solver); 1–60 fit a phone without zooming, 61–100 stay within 16 × 22', () => {
    levels.forEach((level, i) => {
      expect(solveArrows(level).solvable, `level ${i + 1}`).toBe(true)
      expect(level.cols).toBeLessThanOrEqual(i < 60 ? 10 : 16)
      expect(level.rows).toBeLessThanOrEqual(i < 60 ? 13 : 22)
      expect(level.arrows.length).toBeGreaterThan(0)
    })
  })

  it('par: every level clears with one tap per arrow and no blocked tap, in the solver\'s order', () => {
    levels.forEach((level, i) => {
      let gone = Array(level.arrows.length).fill(false)
      let taps = 0
      for (const index of solveArrows(level).order) {
        const r = applyArrowTap(level, gone, 3, index)
        expect(r.result, `level ${i + 1} arrow ${index}`).toBe('cleared')
        gone = r.gone
        taps += 1
      }
      expect(taps, `level ${i + 1}`).toBe(level.arrows.length)
    })
  })

  it('levels 1–20 get steadily harder: difficulty strictly rises, arrows and depth never drop', () => {
    for (let i = 1; i < ARROWS_GENERATED_LEVELS; i += 1) {
      expect(stats[i].difficulty, `level ${i + 1}`).toBeGreaterThan(stats[i - 1].difficulty)
      expect(stats[i].arrows, `level ${i + 1}`).toBeGreaterThanOrEqual(stats[i - 1].arrows)
      expect(stats[i].layers, `level ${i + 1}`).toBeGreaterThanOrEqual(stats[i - 1].layers)
    }
    // Even level 1 needs one arrow moved before another.
    expect(stats[0].layers).toBeGreaterThanOrEqual(2)
    expect(stats[19].arrows).toBeGreaterThan(stats[0].arrows * 5)
    expect(stats[19].layers).toBeGreaterThan(stats[0].layers * 4)
  })

  it('introduces diagonals at level 6, curved diagonals at level 8 and hooks at level 11, never earlier', () => {
    levels.forEach((level, i) => {
      const n = i + 1
      const diag = level.arrows.filter(isDiagonal).length
      const curve = level.arrows.filter(isCurved).length
      const bent = level.arrows.filter(isBent).length
      if (n < 8) expect(bent, `level ${n}`).toBe(0)
      // From 8 on every board with diagonals has a bent one (the mirror lesson
      // board, level 41, has no diagonals at all).
      if (n >= 8 && ARROWS_LEVEL_SPECS[i].diag > 0) expect(bent, `level ${n}`).toBeGreaterThan(0)
      if (n < 6) expect(diag, `level ${n}`).toBe(0)
      if (n < 11) expect(curve, `level ${n}`).toBe(0)
    })
    expect(ARROWS_LEVEL_SPECS[5].intro).toBe('diag')
    expect(ARROWS_LEVEL_SPECS[7].intro).toBe('bend')
    expect(ARROWS_LEVEL_SPECS[10].intro).toBe('curve')
    expect(ARROWS_LEVEL_SPECS.filter((s) => s.intro).map((s) => s.intro)).toEqual(['diag', 'bend', 'curve', 'sleep', 'double', 'mirror', 'crate', 'portal', 'letters', 'oneway', 'turning'])
    expect(levels[7].arrows.filter(isBent).length).toBeGreaterThanOrEqual(2)
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[7], levels[7])).toBe(true)
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[7], levels[5])).toBe(false)
    expect(levels[5].arrows.filter(isDiagonal).length).toBeGreaterThanOrEqual(2)
    expect(levels[10].arrows.filter(isCurved).length).toBeGreaterThanOrEqual(2)
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[5], levels[5])).toBe(true)
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[5], levels[0])).toBe(false)
  })

  it('levels 21–100 rise as a sawtooth: each chapter opens lighter, then every level beats the last', () => {
    for (const chapter of ARROWS_CHAPTERS.slice(1)) {
      for (let n = chapter.from + 1; n <= chapter.to; n += 1) {
        expect(stats[n - 1].difficulty, `level ${n}`).toBeGreaterThan(stats[n - 2].difficulty)
        // Past level 60 a shaped board may be shallower than the rectangle
        // before it; its score (which counts depth) still has to rise.
        if (n <= 60) expect(stats[n - 1].layers, `level ${n}`).toBeGreaterThanOrEqual(stats[n - 2].layers)
      }
      // The lesson level is a breather; the chapter's last level beats the
      // previous chapter's last.
      expect(stats[chapter.from - 1].difficulty).toBeLessThan(stats[chapter.from - 2].difficulty)
      expect(stats[chapter.to - 1].difficulty).toBeGreaterThan(stats[chapter.from - 2].difficulty)
    }
    // Later chapters are deeper than the first twenty ever got.
    expect(stats[39].layers).toBeGreaterThan(stats[19].layers)
    expect(stats[59].layers).toBeGreaterThan(stats[39].layers)
    expect(stats[99].layers).toBeGreaterThan(stats[59].layers)
    // Each portal chapter's last level beats the one before it, and the finale tops them all.
    const bosses = [60, 70, 80, 90, 100].map((n) => stats[n - 1].difficulty)
    bosses.slice(1).forEach((d, i) => expect(d, `chapter boss ${i}`).toBeGreaterThan(bosses[i]))
    expect(stats[99].difficulty).toBe(Math.max(...stats.map((st) => st.difficulty)))
  })

  it('brings sleeping arrows at 21 and double arrows at 31, never earlier, and keeps them sparse', () => {
    levels.forEach((level, i) => {
      const n = i + 1
      const sleepers = level.arrows.filter(isSleeper).length
      const doubles = level.arrows.filter(isDouble).length
      if (n < 21) expect(sleepers, `level ${n}`).toBe(0)
      if (n < 31) expect(doubles, `level ${n}`).toBe(0)
      expect(sleepers, `level ${n}`).toBe(ARROWS_LEVEL_SPECS[i].sleepers ?? 0)
      expect(doubles, `level ${n}`).toBe(ARROWS_LEVEL_SPECS[i].doubles ?? 0)
      // Subtle on purpose: one special piece on a lesson board, a handful at most.
      expect(sleepers + doubles + (level.mirrors?.length ?? 0) + (level.crates?.length ?? 0), `level ${n}`).toBeLessThanOrEqual(5)
    })
    expect(levels[20].arrows.filter(isSleeper)).toHaveLength(1)
    expect(levels[30].arrows.filter(isDouble)).toHaveLength(1)
  })

  it('brings mirrors at 41 and crates at 51, never earlier, as many as each spec asks for', () => {
    levels.forEach((level, i) => {
      const n = i + 1
      const mirrors = level.mirrors?.length ?? 0
      const crates = level.crates?.length ?? 0
      if (n < 41) expect(mirrors, `level ${n}`).toBe(0)
      if (n < 51) expect(crates, `level ${n}`).toBe(0)
      expect(mirrors, `level ${n}`).toBe(ARROWS_LEVEL_SPECS[i].mirrors ?? 0)
      expect(crates, `level ${n}`).toBe(ARROWS_LEVEL_SPECS[i].crates ?? 0)
    })
    // Each lesson board carries exactly one special piece: its own.
    const specials = (level) => level.arrows.filter((a) => a.sleep || a.double).length + (level.mirrors?.length ?? 0) + (level.crates?.length ?? 0)
    for (const n of [21, 31, 41, 51]) expect(specials(levels[n - 1]), `level ${n}`).toBe(1)
    expect(specials(levels[59])).toBe(5)
    // The portal chapters mix in nothing but the mirrors and crates that already shipped.
    for (let n = 61; n <= 100; n += 1) {
      expect(levels[n - 1].arrows.some((a) => a.sleep || a.double), `level ${n}`).toBe(false)
      expect(specials(levels[n - 1]), `level ${n}`).toBeLessThanOrEqual(4)
    }
    for (const n of [61, 71, 81, 91]) expect(specials(levels[n - 1]), `level ${n}`).toBe(0)
    expect(twistsIn(levels[40])).toContain('mirror')
    expect(twistsIn(levels[50])).toContain('crate')
  })

  it('mirrors sit off the edge and, like crates, never under an arrow; no route is dead', () => {
    for (let n = 41; n <= ARROWS_LEVEL_COUNT; n += 1) {
      const level = levels[n - 1]
      const occ = occupancy(level, level.arrows.map(() => false))
      for (const m of level.mirrors ?? []) {
        expect(m.x > 0 && m.x < level.cols - 1 && m.y > 0 && m.y < level.rows - 1, `level ${n}`).toBe(true)
        expect(occ[m.y * level.cols + m.x], `level ${n}`).toBe(-1)
      }
      for (const c of level.crates ?? []) {
        expect(occ[c.y * level.cols + c.x], `level ${n}`).toBe(-1)
        expect(c.k > 0 && c.k < level.arrows.length, `level ${n}`).toBe(true)
      }
      for (const a of level.arrows) expect(arrowRoute(level, a).dead, `level ${n}`).toBe(false)
    }
  })

  it('levels 41–60 match the solver-verified plan: depth and score per level', () => {
    expect(stats.slice(40, 60).map((st) => st.layers)).toEqual([5, 8, 9, 10, 11, 13, 13, 13, 13, 14, 10, 10, 12, 13, 13, 16, 17, 17, 18, 18])
    expect(stats.slice(40, 60).map((st) => st.difficulty)).toEqual([80, 104, 123, 130, 149, 150, 163, 164, 176, 212, 119, 139, 155, 160, 174, 191, 199, 208, 212, 222])
  })

  it('levels 61–100 are the portal chapters: PORTALS, LETTER PAIRS, EXIT-ONLY, TURNING', () => {
    levels.forEach((level, i) => {
      const n = i + 1
      const portals = level.portals ?? []
      const spec = ARROWS_LEVEL_SPECS[i]
      // Portals arrive at 61, never earlier; pair counts and kinds are what each spec asks for.
      expect(portals.length, `level ${n}`).toBe(n < 61 ? 0 : spec.portals.length)
      expect(portals.map((p) => (p.oneway ? 'oneway' : p.turn ? 'turn' : 'pair')), `level ${n}`).toEqual(spec.portals ?? [])
      // Each variant stays out of the campaign until its chapter.
      if (n < 71) expect(portals.length, `level ${n}`).toBeLessThanOrEqual(1)
      if (n < 81) expect(portals.some((p) => p.oneway), `level ${n}`).toBe(false)
      if (n < 91) expect(portals.some((p) => p.turn), `level ${n}`).toBe(false)
      if (n >= 61) expect(portals.length, `level ${n}`).toBeGreaterThanOrEqual(1)
      if (n >= 71) expect(portals.length, `level ${n}`).toBeGreaterThanOrEqual(2)
      expect(portals.length, `level ${n}`).toBeLessThanOrEqual(n <= 90 ? 3 : 4)
      // Every pair is on some arrow's route; the intro level shows each one a few times.
      portalUses(level).forEach((uses) => expect(uses, `level ${n}`).toBeGreaterThanOrEqual(spec.intro ? 2 : 1))
    })
    expect(ARROWS_LEVEL_SPECS.slice(60).filter((s) => s.intro).map((s, k) => [s.intro, 61 + 10 * k])).toEqual([['portal', 61], ['letters', 71], ['oneway', 81], ['turning', 91]])
    // Chapter 10 carries a turning pair and every other variant by its last level.
    const last = levels[99].portals.map((p) => (p.oneway ? 'oneway' : p.turn ? 'turn' : 'pair'))
    expect(new Set(last)).toEqual(new Set(['pair', 'oneway', 'turn']))
  })

  it('portal rings never sit under an arrow, a mirror or a crate, and keep off the edge', () => {
    for (let n = 61; n <= ARROWS_LEVEL_COUNT; n += 1) {
      const level = levels[n - 1]
      const occ = occupancy(level, level.arrows.map(() => false))
      const rings = portalRings(level)
      expect(rings.size, `level ${n}`).toBe(level.portals.length * 2)
      for (const cell of rings) {
        const x = cell % level.cols
        const y = Math.floor(cell / level.cols)
        expect(x > 0 && x < level.cols - 1 && y > 0 && y < level.rows - 1, `level ${n}`).toBe(true)
        expect(occ[cell], `level ${n}`).toBe(-1)
        expect(voidSet(level)?.has(cell) ?? false, `level ${n}`).toBe(false)
        expect((level.mirrors ?? []).some((m) => m.y * level.cols + m.x === cell), `level ${n}`).toBe(false)
        expect((level.crates ?? []).some((c) => c.y * level.cols + c.x === cell), `level ${n}`).toBe(false)
      }
    }
  })

  it('boards grow in a sawtooth: each chapter opens on a small rectangle and ends bigger, up to 16 × 22', () => {
    const area = (n) => levels[n - 1].cols * levels[n - 1].rows
    const size = (n) => `${levels[n - 1].cols}×${levels[n - 1].rows}`
    expect([61, 71, 81, 91].map(size)).toEqual(['8×10', '9×12', '10×13', '11×15'])
    expect([70, 80, 90, 100].map(size)).toEqual(['11×15', '12×17', '14×19', '16×22'])
    for (const [lesson, boss, before] of [[61, 70, 60], [71, 80, 70], [81, 90, 80], [91, 100, 90]]) {
      expect(area(lesson), `level ${lesson}`).toBeLessThan(area(boss))
      expect(area(lesson), `level ${lesson}`).toBeLessThanOrEqual(area(before))
    }
    for (let n = 61; n <= 100; n += 1) expect(area(n), `level ${n}`).toBeLessThanOrEqual(16 * 22)
  })

  it('shaped boards come in the second half of a chapter, never on a lesson; the finale is a big shape', () => {
    const shaped = levels.map((level, i) => (level.mask ? i + 1 : 0)).filter(Boolean)
    expect(shaped.length).toBeGreaterThanOrEqual(8)
    for (const n of shaped) {
      expect(n, `level ${n}`).toBeGreaterThan(60)
      expect((n - 1) % 10, `level ${n}`).toBeGreaterThanOrEqual(5)
      const level = levels[n - 1]
      expect(level.mask).toHaveLength(level.rows)
      for (const row of level.mask) expect(row).toMatch(new RegExp(`^[#.]{${level.cols}}$`))
      // A void is an edge: no arrow cell is a void and no route enters one.
      const voids = voidSet(level)
      for (const a of level.arrows) {
        expect(a.cells.some(([x, y]) => voids.has(y * level.cols + x)), `level ${n}`).toBe(false)
        for (const c of arrowRoute(level, a).cells) expect(voids.has(c), `level ${n}`).toBe(false)
      }
    }
    for (const n of [61, 71, 81, 91]) expect(levels[n - 1].mask, `level ${n}`).toBeUndefined()
    // The chapters name their shapes: diamond and cross, donut and heart, lantern and arrow.
    expect(shaped.filter((n) => n <= 70)).toHaveLength(2)
    expect(shaped.filter((n) => n > 70 && n <= 80)).toHaveLength(2)
    expect(shaped.filter((n) => n > 80 && n <= 90)).toHaveLength(2)
    expect(shaped).toContain(100)
    expect(levels[99].cols * levels[99].rows).toBe(16 * 22)
  })

  it('serves baked boards for 21+, exactly what the generator builds from their seeds', () => {
    for (let n = ARROWS_GENERATED_LEVELS + 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
      const baked = ARROWS_BAKED_LEVELS[n]
      expect(getArrowsLevel(n).arrows).toBe(baked.arrows)
      // If this fails after a generator change, either keep the baked boards
      // (players keep the levels they starred) and accept the drift, or rerun
      // scripts/bake-arrows-levels.mjs on purpose.
      const fresh = generateArrowsLevel(ARROWS_LEVEL_SEEDS[n - 1], { ...ARROWS_LEVEL_SPECS[n - 1], name: `level-${n}` })
      expect(baked.arrows, `level ${n}`).toEqual(fresh.arrows)
      expect(baked.mirrors, `level ${n}`).toEqual(fresh.mirrors)
      expect(baked.crates, `level ${n}`).toEqual(fresh.crates)
      expect(baked.portals, `level ${n}`).toEqual(fresh.portals)
      expect(baked.mask, `level ${n}`).toEqual(fresh.mask)
      expect(getArrowsLevel(n).mirrors).toBe(baked.mirrors)
      expect(getArrowsLevel(n).crates).toBe(baked.crates)
      expect(getArrowsLevel(n).portals).toBe(baked.portals)
      expect(getArrowsLevel(n).mask).toBe(baked.mask)
    }
  })

  it('getArrowsLevel is stable and bounded', () => {
    expect(getArrowsLevel(3)).toBe(getArrowsLevel(3))
    expect(getArrowsLevel(3)).toEqual(generateArrowsLevel(ARROWS_LEVEL_SEEDS[2], { ...ARROWS_LEVEL_SPECS[2], name: 'level-3' }))
    expect(getArrowsLevel(0)).toBeNull()
    expect(getArrowsLevel(100)).not.toBeNull()
    expect(getArrowsLevel(101)).toBeNull()
    expect(getArrowsLevel(1.5)).toBeNull()
  })
})

describe('twist tutorials', () => {
  it('twistsIn / newTwist report the first twist not yet taught', () => {
    expect(twistsIn(levels[0])).toEqual([])
    expect(twistsIn(levels[5])).toEqual(['diag'])
    expect(twistsIn(levels[7])).toEqual(['diag', 'bend'])
    expect(twistsIn(levels[10])).toEqual(['diag', 'bend', 'curve'])
    expect(newTwist(levels[10], {})).toBe('diag')
    expect(newTwist(levels[10], { diag: true })).toBe('bend')
    expect(newTwist(levels[10], { diag: true, bend: true })).toBe('curve')
    expect(newTwist(levels[10], { diag: true, bend: true, curve: true })).toBeNull()
    expect(newTwist(levels[0], null)).toBeNull()
    expect(twistsIn(levels[20])).toContain('sleep')
    expect(twistsIn(levels[30])).toContain('double')
    expect(newTwist(levels[20], { diag: true, bend: true, curve: true })).toBe('sleep')
    expect(newTwist(levels[30], { diag: true, bend: true, curve: true, sleep: true })).toBe('double')
    expect(newTwist(levels[50], { diag: true, bend: true, curve: true, sleep: true, double: true, mirror: true })).toBe('crate')
    for (const t of ['diag', 'bend', 'curve', 'sleep', 'double', 'mirror', 'crate', 'portal', 'letters', 'oneway', 'turning', 'shape']) expect(ARROWS_TWIST_TIPS[t]).toMatch(/^NEW · /)
  })

  it('each portal variant is taught on the level that introduces it; shaped boards get a tip', () => {
    const taught = { diag: true, bend: true, curve: true, sleep: true, double: true, mirror: true, crate: true }
    expect(twistsIn(levels[60])).toEqual(expect.arrayContaining(['portal']))
    expect(twistsIn(levels[60])).not.toContain('letters')
    expect(newTwist(levels[60], taught)).toBe('portal')
    expect(newTwist(levels[70], { ...taught, portal: true })).toBe('letters')
    expect(twistsIn(levels[80])).toContain('oneway')
    expect(newTwist(levels[80], { ...taught, portal: true, letters: true })).toBe('oneway')
    expect(twistsIn(levels[90])).toContain('turning')
    expect(newTwist(levels[90], { ...taught, portal: true, letters: true, oneway: true })).toBe('turning')
    // The first shaped board (diamond, level 67) names its shape once the portal is known.
    expect(twistsIn(levels[66])).toContain('shape')
    expect(newTwist(levels[66], { ...taught, portal: true })).toBe('shape')
    expect(newTwist(levels[66], { ...taught, portal: true, shape: true })).toBeNull()
  })
})

describe('endless boards', () => {
  it('serve unlimited, distinct, solvable boards at each tier', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      const seen = new Set()
      for (let s = 1; s <= 40; s += 1) {
        const level = endlessLevel(s * 65537, tier)
        expect(level.cols).toBe(ARROWS_ENDLESS_SPECS[tier].cols)
        expect(solveArrows(level).solvable).toBe(true)
        seen.add(JSON.stringify(level.arrows))
      }
      expect(seen.size).toBe(40)
    }
  })

  it('carries every special piece its tier asks for', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      const spec = ARROWS_ENDLESS_SPECS[tier]
      for (let s = 1; s <= 12; s += 1) {
        const level = endlessLevel(s * 65537, tier)
        expect(level.arrows.filter(isSleeper).length, `${tier} sleepers`).toBeGreaterThanOrEqual(spec.sleepers ?? 0)
        expect(level.arrows.filter(isDouble).length, `${tier} doubles`).toBeGreaterThanOrEqual(spec.doubles ?? 0)
        expect(level.mirrors?.length ?? 0, `${tier} mirrors`).toBeGreaterThanOrEqual(spec.mirrors ?? 0)
        expect(level.crates?.length ?? 0, `${tier} crates`).toBeGreaterThanOrEqual(spec.crates ?? 0)
        expect(level.portals?.length ?? 0, `${tier} portals`).toBeGreaterThanOrEqual(spec.portals?.length ?? 0)
        portalUses(level).forEach((uses) => expect(uses, `${tier} portal use`).toBeGreaterThanOrEqual(1))
      }
    }
  })

  it('hard endless mixes in every mechanic', () => {
    for (let s = 1; s <= 8; s += 1) {
      const twists = twistsIn(endlessLevel(s * 65537, 'hard'))
      for (const t of ['diag', 'curve', 'sleep', 'double', 'mirror', 'crate', 'portal']) {
        expect(twists, `seed ${s}`).toContain(t)
      }
    }
  })

  it('falls back to easy for an unknown tier', () => {
    expect(endlessLevel(9, 'insane').cols).toBe(ARROWS_ENDLESS_SPECS.easy.cols)
  })
})

describe('stars', () => {
  it('3 for a clean clear, one fewer per mistake, hints cap at 2, out of lives = 0', () => {
    expect(starsFor({ mistakes: 0 })).toBe(3)
    expect(starsFor({ mistakes: 1 })).toBe(2)
    expect(starsFor({ mistakes: 2 })).toBe(1)
    expect(starsFor({ mistakes: 3 })).toBe(0)
    expect(starsFor({ mistakes: 0, hints: 1 })).toBe(2)
    expect(starsFor({ mistakes: 2, hints: 4 })).toBe(1)
    expect(starsFor()).toBe(3)
  })
})

describe('progress', () => {
  it('level 1 is open; each clear opens the next', () => {
    let p = blankProgress()
    expect(isLevelUnlocked(p, 1)).toBe(true)
    expect(isLevelUnlocked(p, 2)).toBe(false)
    expect(nextLevel(p)).toBe(1)
    p = recordLevelResult(p, 1, 2)
    expect(isLevelUnlocked(p, 2)).toBe(true)
    expect(isLevelUnlocked(p, 3)).toBe(false)
    expect(nextLevel(p)).toBe(2)
    expect(isLevelUnlocked(p, 0)).toBe(false)
    expect(isLevelUnlocked(p, 21)).toBe(false)
    expect(isLevelUnlocked(recordLevelResult(p, 60, 1), 61)).toBe(true)
    expect(isLevelUnlocked(recordLevelResult(p, 100, 1), 101)).toBe(false)
  })

  it('keeps the best stars and ignores failures and bad levels', () => {
    let p = recordLevelResult(blankProgress(), 4, 3)
    p = recordLevelResult(p, 4, 1)
    expect(levelStars(p, 4)).toBe(3)
    expect(recordLevelResult(p, 5, 0)).toEqual(p)
    expect(recordLevelResult(p, 101, 3)).toEqual(p)
    expect(levelStars(recordLevelResult(p, 100, 3), 100)).toBe(3)
    expect(levelStars(recordLevelResult(p, 33, 2), 33)).toBe(2)
    expect(levelStars(recordLevelResult(p, 6, 9), 6)).toBe(3)
  })

  it('counts endless clears per tier', () => {
    let p = recordEndlessClear(blankProgress(), 'hard')
    p = recordEndlessClear(p, 'hard')
    p = recordEndlessClear(p, 'nope')
    expect(p.endless).toEqual({ easy: 0, medium: 0, hard: 2 })
  })

  it('normalizeProgress sanitises junk from storage or Firebase', () => {
    expect(normalizeProgress(null)).toEqual(blankProgress())
    expect(normalizeProgress('x')).toEqual(blankProgress())
    expect(normalizeProgress({
      levels: { l1: '3', l2: 7, l3: 0, l101: 3, 4: 2, l5: 2.6, l60: 1, l100: 2 },
      endless: { easy: -4, medium: '2', hard: 'x', insane: 9 },
      junk: true,
    })).toEqual({ levels: { l1: 3, l2: 3, l5: 2, l60: 1, l100: 2 }, endless: { easy: 0, medium: 2, hard: 0 } })
  })

  it('merges device and account copies without losing either side', () => {
    const a = { levels: { l1: 3, l2: 1 }, endless: { easy: 5, medium: 0, hard: 0 } }
    const b = { levels: { l2: 2, l3: 1 }, endless: { easy: 2, medium: 1, hard: 0 } }
    const m = mergeProgress(a, b)
    expect(m).toEqual({ levels: { l1: 3, l2: 2, l3: 1 }, endless: { easy: 5, medium: 1, hard: 0 } })
    expect(mergeProgress(b, a)).toEqual(m)
    expect(mergeProgress(m, null)).toEqual(m)
    expect(sameProgress(m, { ...m, updatedAt: 5 })).toBe(true)
    expect(sameProgress(m, a)).toBe(false)
    expect(totalStars(m)).toBe(6)
  })

  it('nextLevel sticks at 100 once everything is cleared', () => {
    let p = blankProgress()
    for (let n = 1; n <= 20; n += 1) p = recordLevelResult(p, n, 1)
    expect(nextLevel(p)).toBe(21)
    for (let n = 21; n <= 40; n += 1) p = recordLevelResult(p, n, 1)
    expect(nextLevel(p)).toBe(41)
    for (let n = 41; n <= 60; n += 1) p = recordLevelResult(p, n, 1)
    expect(nextLevel(p)).toBe(61)
    for (let n = 61; n <= 100; n += 1) p = recordLevelResult(p, n, 1)
    expect(nextLevel(p)).toBe(100)
    expect(levelKey(7)).toBe('l7')
  })
})
