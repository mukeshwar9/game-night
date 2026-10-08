import { describe, it, expect } from 'vitest'
import { applyArrowTap, arrowRoute, generateArrowsLevel, isDouble, isSleeper, levelStats, occupancy, portalRings, portalUses, solveArrows, tunnelUses, voidSet, ARROWS_ENDLESS_SPECS, ARROWS_TIERS } from './arrowsLogic'
import { ARROWS_BAKED_LEVELS } from './arrowsLevelsBaked'
import { needsCamera } from './arrowsCameraLogic'
import { ARROWS_SHAPES, ARROWS_SHAPE_ORDER, maskCells, maskConnected, shapeMask } from './arrowsShapes'
import {
  ARROWS_CHAPTERS,
  ARROWS_CHAPTER_GOLD,
  chapterGold,
  chapterGoal,
  chapterStars,
  ARROWS_ENDLESS_COVERAGE,
  ARROWS_PIECE_LEVEL,
  ARROWS_GENERATED_LEVELS,
  ARROWS_LEVEL_COUNT,
  ARROWS_LEVEL_SEEDS,
  ARROWS_LEVEL_SPECS,
  ARROWS_TWIST_TIPS,
  blankProgress,
  endlessLevel,
  endlessShapeDims,
  ARROWS_ENDLESS_MAX_COLS,
  ARROWS_ENDLESS_MAX_ROWS,
  getArrowsLevel,
  isLevelUnlocked,
  isNewBoard,
  learnedPieces,
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
  diagonalUsesMods,
} from './arrowsLevelsLogic'

const levels = Array.from({ length: ARROWS_LEVEL_COUNT }, (_, i) => getArrowsLevel(i + 1))
const stats = levels.map(levelStats)

const PIECES = ARROWS_CHAPTERS.map((c) => c.piece)
const portalKinds = (level) => (level.portals ?? []).map((p) => (p.oneway ? 'oneway' : p.turn ? 'turn' : 'pair'))
const coverage = (level) => level.arrows.reduce((n, a) => n + a.cells.length, 0) / (level.mask ? maskCells(level.mask) : level.cols * level.rows)

// Levels the picker could not make rise or cover 75% within its seed budget
// (scripts/pick-arrows-levels.mjs prints both lists). Keep these short.
const NOT_RISING = [19, 59]
const LOW_COVERAGE = [1, 3, 4, 130, 140, 148, 149, 159, 167, 169, 170]

describe('the 170-level campaign', { timeout: 180000 }, () => {
  it('has 170 levels, one seed each, in 17 chapters of ten', () => {
    expect(ARROWS_LEVEL_COUNT).toBe(170)
    expect(ARROWS_LEVEL_SEEDS).toHaveLength(170)
    expect(ARROWS_LEVEL_SPECS).toHaveLength(170)
    expect(ARROWS_GENERATED_LEVELS).toBe(0)
    expect(levels.every(Boolean)).toBe(true)
    expect(ARROWS_CHAPTERS).toHaveLength(17)
    ARROWS_CHAPTERS.forEach((c, i) => {
      expect([c.from, c.to], c.name).toEqual([i * 10 + 1, i * 10 + 10])
    })
    expect(ARROWS_CHAPTERS.map((c) => c.name)).toEqual([
      'BASICS', 'HOOKS', 'SLEEPING ARROWS', 'DOUBLE ARROWS', 'MIRRORS', 'CRATES', 'PORTALS', 'LETTER PAIRS', 'ONE-WAY RINGS',
      'TURNING RINGS', 'TUNNELS', 'DIAGONAL MODS', 'FLAT MIRRORS', 'BANK SHOTS', 'GLIDERS', 'ELBOWS', 'SWERVES',
    ])
    expect(PIECES).toEqual(['diag', 'curve', 'sleep', 'double', 'mirror', 'crate', 'portal', 'letters', 'oneway', 'turning', 'tunnel', 'diagmods', 'flat', 'bank', 'glide', 'elbow', 'swerve'])
    expect(ARROWS_CHAPTERS[10]).toMatchObject({ from: 101, to: 110 })
    expect(ARROWS_CHAPTERS[16]).toMatchObject({ from: 161, to: 170 })
  })

  it('every level is solvable (independent greedy solver) and fits the 20 × 28 camera; lesson boards fit 10 × 13', () => {
    levels.forEach((level, i) => {
      expect(solveArrows(level).solvable, `level ${i + 1}`).toBe(true)
      expect(level.cols).toBeLessThanOrEqual(20)
      expect(level.rows).toBeLessThanOrEqual(28)
      expect(level.arrows.length).toBeGreaterThan(0)
      if (i % 10 === 0) {
        expect(level.cols, `lesson ${i + 1}`).toBeLessThanOrEqual(10)
        expect(level.rows, `lesson ${i + 1}`).toBeLessThanOrEqual(13)
      }
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

  it('introduces diagonals at level 6, curved diagonals at 8 and hooks at 11, and each chapter piece at its lesson, never earlier', () => {
    expect(ARROWS_LEVEL_SPECS[0].intro).toBeUndefined()
    expect(ARROWS_LEVEL_SPECS.map((s, i) => [s.intro, i + 1]).filter(([intro]) => intro)).toEqual([
      ['diag', 6], ['bend', 8], ['curve', 11], ['sleep', 21], ['double', 31], ['mirror', 41], ['crate', 51], ['portal', 61],
      ['letters', 71], ['oneway', 81], ['turning', 91], ['tunnel', 101], ['diagmods', 111], ['flat', 121], ['bank', 131],
      ['glide', 141], ['elbow', 151], ['swerve', 161],
    ])
    expect(ARROWS_LEVEL_SPECS.filter((s) => s.intro).map((s) => s.intro).slice(2)).toEqual(PIECES.slice(1))
    for (const [piece, n] of Object.entries(ARROWS_PIECE_LEVEL)) {
      levels.forEach((level, i) => {
        if (i + 1 < n) expect(twistsIn(level), `level ${i + 1} must not show ${piece}`).not.toContain(piece)
      })
    }
    levels.forEach((level, i) => {
      expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[i], level), `level ${i + 1}`).toBe(true)
    })
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[7], levels[5])).toBe(false)
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[5], levels[0])).toBe(false)
  })

  it('lesson boards show only the new piece; levels 2–10 of every chapter show every piece taught so far', () => {
    ARROWS_CHAPTERS.forEach((chapter, ci) => {
      const lesson = twistsIn(levels[chapter.from - 1])
      if (ci > 0) expect(lesson, `lesson ${chapter.from}`).toContain(chapter.piece)
      for (let n = chapter.from + 1; n <= chapter.to; n += 1) {
        const shown = twistsIn(levels[n - 1])
        // BASICS spreads its pieces over the chapter: diagonals from level 6.
        const need = ci === 0 ? (n >= 6 ? ['diag'] : []) : PIECES.slice(0, ci + 1)
        for (const piece of need) expect(shown, `level ${n} shows ${piece}`).toContain(piece)
      }
    })
    // A lesson board carries no piece of an older chapter (arrow kinds stay).
    const lessonPieces = (n) => twistsIn(levels[n - 1]).filter((t) => !['diag', 'bend', 'curve', 'shape'].includes(t))
    expect(lessonPieces(21)).toEqual(['sleep'])
    expect(lessonPieces(41)).toEqual(['mirror'])
    expect(lessonPieces(51)).toEqual(['crate'])
    expect(lessonPieces(101)).toEqual(expect.arrayContaining(['tunnel']))
    for (const n of [31, 61, 71, 81, 91, 121, 131]) expect(lessonPieces(n).length, `lesson ${n}`).toBeLessThanOrEqual(2)
  })

  it('never more than three portal pairs (colour alone tells them apart); variants arrive in their chapter', () => {
    levels.forEach((level, i) => {
      const n = i + 1
      const kinds = portalKinds(level)
      expect(kinds.length, `level ${n}`).toBeLessThanOrEqual(3)
      expect(kinds, `level ${n}`).toEqual(ARROWS_LEVEL_SPECS[i].portals ?? [])
      if (n < 61) expect(kinds, `level ${n}`).toEqual([])
      if (n < 71) expect(kinds.length, `level ${n}`).toBeLessThanOrEqual(1)
      if (n < 81) expect(kinds, `level ${n}`).not.toContain('oneway')
      if (n < 91) expect(kinds, `level ${n}`).not.toContain('turn')
      // Every pair is on some arrow's route; a lesson shows each a few times.
      portalUses(level).forEach((uses) => expect(uses, `level ${n}`).toBeGreaterThanOrEqual(ARROWS_LEVEL_SPECS[i].intro ? 2 : 1))
    })
    // The turning chapter would carry four pairs (pair, pair, oneway, turn): a plain pair makes way.
    expect(ARROWS_LEVEL_SPECS[99].portals).toEqual(['pair', 'oneway', 'turn'])
    expect(new Set(portalKinds(levels[99]))).toEqual(new Set(['pair', 'oneway', 'turn']))
  })

  it('tunnels arrive at 101; mirrors, crates, rings and tunnels never sit under an arrow or on a void', () => {
    levels.forEach((level, i) => {
      const n = i + 1
      const spec = ARROWS_LEVEL_SPECS[i]
      expect(level.tunnels?.length ?? 0, `level ${n}`).toBe(spec.tunnels ?? 0)
      if (n < 101) expect(level.tunnels, `level ${n}`).toBeUndefined()
      expect(level.mirrors?.length ?? 0, `level ${n}`).toBeGreaterThanOrEqual(spec.mirrors ?? 0)
      expect(level.crates?.length ?? 0, `level ${n}`).toBe(spec.crates ?? 0)
      if (n < 41) expect(level.mirrors, `level ${n}`).toBeUndefined()
      if (n < 51) expect(level.crates, `level ${n}`).toBeUndefined()
      const occ = occupancy(level, level.arrows.map(() => false))
      const voids = voidSet(level)
      const rings = portalRings(level)
      expect(rings.size, `level ${n}`).toBe((level.portals?.length ?? 0) * 2)
      const fixed = [
        ...(level.mirrors ?? []).map((m) => m.y * level.cols + m.x),
        ...(level.crates ?? []).map((c) => c.y * level.cols + c.x),
        ...(level.tunnels ?? []).map((t) => t.y * level.cols + t.x),
        ...rings,
      ]
      expect(new Set(fixed).size, `level ${n}`).toBe(fixed.length)
      for (const cell of fixed) {
        expect(occ[cell], `level ${n}`).toBe(-1)
        expect(voids?.has(cell) ?? false, `level ${n}`).toBe(false)
      }
      for (const a of level.arrows) expect(arrowRoute(level, a).dead, `level ${n}`).toBe(false)
      for (const c of level.crates ?? []) expect(c.k > 0 && c.k < level.arrows.length, `level ${n}`).toBe(true)
      tunnelUses(level).forEach((uses) => expect(uses, `level ${n}`).toBeGreaterThanOrEqual(spec.intro === 'tunnel' ? 2 : 1))
    })
  })

  it('sizes grow in a sawtooth: each chapter opens small and ends bigger, capped at 20 × 28', () => {
    const cells = (n) => (levels[n - 1].mask ? maskCells(levels[n - 1].mask) : levels[n - 1].cols * levels[n - 1].rows)
    ARROWS_CHAPTERS.forEach((c) => {
      expect(cells(c.from), c.name).toBeLessThan(cells(c.to))
      if (c.from > 1) expect(cells(c.from), c.name).toBeLessThan(cells(c.from - 1))
    })
    expect(levels[169].cols).toBeLessThanOrEqual(20)
    expect(levels[169].rows).toBeLessThanOrEqual(28)
    expect(Math.max(...levels.map((l) => l.cols))).toBeGreaterThan(16)
  })

  it('151 levels sit on an outline: rectangles are levels 1–2, level 5 of every later chapter and the finale (no outline holds its cells in 20 × 28)', () => {
    const rects = levels.map((level, i) => (level.mask ? 0 : i + 1)).filter(Boolean)
    expect(rects).toEqual([1, 2, ...Array.from({ length: 16 }, (_, c) => (c + 1) * 10 + 5), 170])
    const used = new Set(levels.filter((l) => l.mask).map((l) => ARROWS_LEVEL_SPECS[levels.indexOf(l)].shape))
    // The pool widens until every outline in the library is used.
    expect([...used].sort()).toEqual([...ARROWS_SHAPE_ORDER].sort())
    levels.forEach((level, i) => {
      if (!level.mask) return
      const n = i + 1
      expect(level.mask, `level ${n}`).toHaveLength(level.rows)
      for (const row of level.mask) expect(row).toMatch(new RegExp(`^[#.]{${level.cols}}$`))
      expect(maskConnected(level.mask), `level ${n}`).toBe(true)
      const voids = voidSet(level)
      for (const a of level.arrows) {
        expect(a.cells.some(([x, y]) => voids.has(y * level.cols + x)), `level ${n}`).toBe(false)
        for (const c of arrowRoute(level, a).cells) expect(voids.has(c), `level ${n}`).toBe(false)
      }
    })
  })

  it('difficulty rises through each chapter (known exceptions listed), and no lesson is harder than its chapter\'s last level', () => {
    const slips = []
    for (const chapter of ARROWS_CHAPTERS) {
      for (let n = chapter.from + 1; n <= chapter.to; n += 1) {
        if (stats[n - 1].difficulty <= stats[n - 2].difficulty) slips.push(n)
      }
      expect(stats[chapter.from - 1].difficulty, chapter.name).toBeLessThan(stats[chapter.to - 1].difficulty)
    }
    expect(slips).toEqual(NOT_RISING)
  })

  it('arrow cells cover at least 75% of the playable cells (known exceptions listed)', () => {
    const low = levels.map((level, i) => (coverage(level) < 0.75 ? i + 1 : 0)).filter(Boolean)
    expect(low).toEqual(LOW_COVERAGE)
    levels.forEach((level, i) => expect(coverage(level), `level ${i + 1}`).toBeGreaterThan(0.6))
  })

  it('serves baked boards, exactly what the generator builds from their seeds', () => {
    for (let n = 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
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
      expect(baked.tunnels, `level ${n}`).toEqual(fresh.tunnels)
      expect(baked.mask, `level ${n}`).toEqual(fresh.mask)
      expect(getArrowsLevel(n).mirrors).toBe(baked.mirrors)
      expect(getArrowsLevel(n).crates).toBe(baked.crates)
      expect(getArrowsLevel(n).portals).toBe(baked.portals)
      expect(getArrowsLevel(n).tunnels).toBe(baked.tunnels)
      expect(getArrowsLevel(n).mask).toBe(baked.mask)
    }
  })

  it('getArrowsLevel is stable and bounded', () => {
    expect(getArrowsLevel(3)).toBe(getArrowsLevel(3))
    expect(getArrowsLevel(3)).toEqual(generateArrowsLevel(ARROWS_LEVEL_SEEDS[2], { ...ARROWS_LEVEL_SPECS[2], name: 'level-3' }))
    expect(getArrowsLevel(0)).toBeNull()
    expect(getArrowsLevel(170)).not.toBeNull()
    expect(getArrowsLevel(171)).toBeNull()
    expect(getArrowsLevel(1.5)).toBeNull()
  })
})

describe('twist tutorials', () => {
  const plain = (level) => twistsIn(level).filter((t) => t !== 'shape')

  it('twistsIn / newTwist report the first twist not yet taught', () => {
    expect(twistsIn(levels[0])).toEqual([])
    expect(plain(levels[5])).toEqual(['diag'])
    expect(plain(levels[7])).toEqual(['diag', 'bend'])
    expect(plain(levels[10])).toEqual(['diag', 'bend', 'curve'])
    const known = { shape: true }
    expect(newTwist(levels[10], known)).toBe('diag')
    expect(newTwist(levels[10], { ...known, diag: true })).toBe('bend')
    expect(newTwist(levels[10], { ...known, diag: true, bend: true })).toBe('curve')
    expect(newTwist(levels[10], { ...known, diag: true, bend: true, curve: true })).toBeNull()
    expect(newTwist(levels[0], null)).toBeNull()
    expect(newTwist(levels[20], { ...known, diag: true, bend: true, curve: true })).toBe('sleep')
  })

  it('every chapter lesson board teaches its own piece once the older ones are known', () => {
    ARROWS_CHAPTERS.forEach((chapter, ci) => {
      if (ci === 0) return
      const taught = { diag: true, bend: true, shape: true }
      if (ci > 1) taught.curve = true
      for (const piece of PIECES.slice(0, ci)) taught[piece] = true
      expect(newTwist(levels[chapter.from - 1], taught), chapter.name).toBe(chapter.piece)
    })
  })

  it('has a one-line tip for every piece, the new ones starting NEW · ', () => {
    for (const t of ['diag', 'bend', 'curve', 'sleep', 'double', 'mirror', 'crate', 'portal', 'letters', 'oneway', 'turning', 'tunnel', 'shape']) expect(ARROWS_TWIST_TIPS[t]).toMatch(/^NEW · /)
    for (const t of PIECES) expect(ARROWS_TWIST_TIPS[t], t).toEqual(expect.any(String))
    // Plain diagonals cannot cross a mirror; the tip must not promise more.
    expect(ARROWS_TWIST_TIPS.mirror).toMatch(/PLAIN DIAGONAL/)
  })

  it('shaped boards name their shape once the other pieces are known', () => {
    const level = levels.find((l, i) => i > 10 && l.mask && twistsIn(l).length === 4)
    expect(twistsIn(level)).toContain('shape')
    const taught = { diag: true, bend: true, curve: true }
    expect(newTwist(level, taught)).toBe('shape')
    expect(newTwist(level, { ...taught, shape: true })).toBeNull()
  })
})

describe('endless boards', { timeout: 120000 }, () => {
  it('serve unlimited, distinct, solvable boards at each tier', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      const seen = new Set()
      for (let s = 1; s <= 40; s += 1) {
        const level = endlessLevel(s * 65537, tier)
        if (!level.mask) expect(level.cols).toBe(ARROWS_ENDLESS_SPECS[tier].cols)
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
        expect(level.portals?.length ?? 0, `${tier} portal cap`).toBeLessThanOrEqual(3)
        if (level.mask || tier !== 'hard') expect(coverage(level), `${tier} coverage`).toBeGreaterThanOrEqual(ARROWS_ENDLESS_COVERAGE[tier])
        expect(level.tunnels?.length ?? 0, `${tier} tunnels`).toBeGreaterThanOrEqual(spec.tunnels ?? 0)
        if (spec.tunnels) expect(tunnelUses(level).some((u) => u >= 1), `${tier} tunnel use`).toBe(true)
        expect((level.mirrors ?? []).filter((m) => m.m === '-' || m.m === '|').length, `${tier} flat mirrors`).toBeGreaterThanOrEqual(spec.flatMirrors ?? 0)
        for (const t of ['bank', 'glide', 'elbow', 'swerve']) expect(level.arrows.some((a) => a.twist === t), `${tier} ${t}`).toBe(true)
        expect(diagonalUsesMods(level), `${tier} diagonal meets a mod`).toBe(true)
      }
    }
  })

  it('a solver sweep: 50 seeds per tier, up to 20 × 28, all solvable, every tap in the solver order clears, fast to build', () => {
    const budget = { easy: 120, medium: 200, hard: 500 }
    for (const tier of ['easy', 'medium', 'hard']) {
      let ms = 0
      for (let s = 1; s <= 50; s += 1) {
        const t0 = performance.now()
        const level = endlessLevel(s * 7919, tier)
        ms += performance.now() - t0
        const st = solveArrows(level)
        expect(st.solvable, `${tier} seed ${level.seed}`).toBe(true)
        let gone = Array(level.arrows.length).fill(false)
        for (const i of st.order) {
          const r = applyArrowTap(level, gone, 3, i)
          expect(r.result, `${tier} seed ${level.seed} arrow ${i}`).toBe('cleared')
          gone = r.gone
        }
        expect(level.cols <= ARROWS_ENDLESS_MAX_COLS && level.rows <= ARROWS_ENDLESS_MAX_ROWS).toBe(true)
      }
      // Average build time per board (generous: CI machines are slow).
      expect(ms / 50, `${tier} ms per board`).toBeLessThan(budget[tier])
    }
    expect(ARROWS_ENDLESS_SPECS.hard).toMatchObject({ cols: 20, rows: 28 })
  })

  it('hard endless mixes in every mechanic', () => {
    for (let s = 1; s <= 8; s += 1) {
      const twists = twistsIn(endlessLevel(s * 65537, 'hard'))
      for (const t of ['diag', 'curve', 'sleep', 'double', 'mirror', 'crate', 'portal', 'tunnel', 'diagmods', 'flat', 'bank', 'glide', 'elbow', 'swerve']) {
        expect(twists, `seed ${s}`).toContain(t)
      }
    }
  })

  it('falls back to easy for an unknown tier', () => {
    const level = endlessLevel(9, 'insane')
    expect(level.tier).toBe('easy')
    if (!level.mask) expect(level.cols).toBe(ARROWS_ENDLESS_SPECS.easy.cols)
  })
})

describe('endless tiers', { timeout: 120000 }, () => {
  const all = Object.keys(ARROWS_PIECE_LEVEL)
  const starred = (...ns) => ns.reduce((p, n) => recordLevelResult(p, n, 1), blankProgress())

  it('all three tiers are open for a fresh player', () => {
    const fresh = learnedPieces(blankProgress())
    expect(ARROWS_TIERS).toEqual(['easy', 'medium', 'hard'])
    for (const tier of ARROWS_TIERS) {
      const level = endlessLevel(7, tier, fresh)
      expect(level.tier).toBe(tier)
      expect(solveArrows(level).solvable).toBe(true)
    }
  })

  it('learnedPieces lists the pieces whose lesson level has a star', () => {
    expect(learnedPieces(blankProgress())).toEqual([])
    expect(learnedPieces(starred(1, 2, 3))).toEqual([])
    expect(learnedPieces(starred(6))).toEqual(['diag'])
    expect(learnedPieces(starred(6, 8, 11, 21))).toEqual(['diag', 'bend', 'curve', 'sleep'])
    expect(learnedPieces(starred(171 - 10))).toEqual(['swerve'])
    let p = blankProgress()
    for (let n = 1; n <= 170; n += 1) p = recordLevelResult(p, n, 1)
    expect(learnedPieces(p).sort()).toEqual([...all].sort())
    // Every campaign piece is in the list, with 'bend' as its own entry.
    expect(all).toEqual(expect.arrayContaining([...PIECES, 'bend']))
  })

  it('learned = [] serves plain boards: no twists, sleepers, doubles, mirrors, crates, portals or tunnels', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      for (let s = 1; s <= 6; s += 1) {
        const level = endlessLevel(s * 65537, tier, [])
        expect(solveArrows(level).solvable).toBe(true)
        expect(twistsIn(level).filter((t) => t !== 'shape'), `${tier} seed ${s}`).toEqual([])
        expect(level.mirrors ?? []).toHaveLength(0)
        expect(level.portals ?? []).toHaveLength(0)
        expect(level.tunnels ?? []).toHaveLength(0)
        expect(level.crates ?? []).toHaveLength(0)
        if (level.mask || tier !== 'hard') expect(coverage(level), `${tier} seed ${s}`).toBeGreaterThanOrEqual(ARROWS_ENDLESS_COVERAGE[tier])
      }
    }
  })

  it('a partial set only brings the pieces learned', () => {
    const level = endlessLevel(65537, 'hard', ['diag', 'bend', 'sleep', 'portal'])
    const shown = twistsIn(level).filter((t) => t !== 'shape')
    expect(shown).toEqual(expect.arrayContaining(['diag', 'sleep', 'portal']))
    for (const t of ['curve', 'double', 'mirror', 'crate', 'letters', 'oneway', 'turning', 'tunnel', 'diagmods', 'flat', 'bank', 'glide', 'elbow', 'swerve']) expect(shown).not.toContain(t)
    expect(level.portals).toHaveLength(1)
  })

  it('everything learned matches the full tier; races and the demo (no learned list) keep the full tier', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      for (let s = 1; s <= 3; s += 1) {
        const full = endlessLevel(s * 40503, tier)
        expect(endlessLevel(s * 40503, tier, all)).toEqual(full)
      }
    }
    expect(ARROWS_ENDLESS_SPECS.hard.portals).toEqual(['oneway', 'turn', 'pair'])
    for (const tier of ['easy', 'medium', 'hard']) expect(ARROWS_ENDLESS_SPECS[tier].portals.length).toBeLessThanOrEqual(3)
  })

  it('easy is a friendly board: about 8 × 11, a light sprinkle of pieces, few arrows', () => {
    expect(ARROWS_ENDLESS_SPECS.easy).toMatchObject({ cols: 8, rows: 11, maxLen: 6 })
    let arrows = 0
    for (let s = 1; s <= 20; s += 1) {
      const level = endlessLevel(s * 40503, 'easy')
      arrows += level.arrows.length
      expect(level.arrows.length).toBeLessThanOrEqual(34)
      expect(coverage(level)).toBeGreaterThanOrEqual(0.7)
    }
    expect(arrows / 20).toBeLessThan(26)
  })
})

describe('shaped endless boards', { timeout: 60000 }, () => {
  const SEEDS = 40
  const memo = {}
  const boards = (tier) => (memo[tier] ??= Array.from({ length: SEEDS }, (_, i) => endlessLevel((i + 1) * 40503, tier)))

  it('shape choice is deterministic per seed and mixes rectangles with outlines', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      const a = boards(tier)
      expect(boards(tier).map((l) => l.shape ?? null)).toEqual(a.map((l) => l.shape ?? null))
      const shaped = a.filter((l) => l.mask).length
      expect(shaped, `${tier} shaped`).toBeGreaterThan(0)
      expect(shaped, `${tier} rectangles`).toBeLessThan(SEEDS)
    }
  })

  it('every board across the tiers is solvable and fully cleared by the greedy solver', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      for (const level of boards(tier)) {
        const st = solveArrows(level)
        expect(st.solvable, `${tier} seed ${level.seed}`).toBe(true)
        // Replay the solver's order with real taps: none may be blocked.
        let gone = Array(level.arrows.length).fill(false)
        let lives = 3
        for (const i of st.order) {
          const r = applyArrowTap(level, gone, lives, i)
          expect(r.result, `${tier} seed ${level.seed} arrow ${i}`).toBe('cleared')
          gone = r.gone
          lives = r.lives
        }
        expect(gone.every(Boolean)).toBe(true)
      }
    }
  })

  it('a shaped board is one connected outline with no arrow, ring or fixture on a void', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      for (const level of boards(tier).filter((l) => l.mask)) {
        expect(maskConnected(level.mask)).toBe(true)
        expect(level.mask).toHaveLength(level.rows)
        const voids = voidSet(level)
        const onVoid = (x, y) => voids.has(y * level.cols + x)
        for (const a of level.arrows) for (const [x, y] of a.cells) expect(onVoid(x, y)).toBe(false)
        for (const m of level.mirrors ?? []) expect(onVoid(m.x, m.y)).toBe(false)
        for (const c of level.crates ?? []) expect(onVoid(c.x, c.y)).toBe(false)
        for (const p of level.portals ?? []) { expect(onVoid(...p.a)).toBe(false); expect(onVoid(...p.b)).toBe(false) }
        expect(ARROWS_SHAPES).toContain(level.shape)
      }
    }
  })

  it('shaped boards keep every special piece their tier asks for', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      const spec = ARROWS_ENDLESS_SPECS[tier]
      for (const level of boards(tier).filter((l) => l.mask)) {
        expect(level.arrows.filter(isSleeper).length).toBeGreaterThanOrEqual(spec.sleepers ?? 0)
        expect(level.arrows.filter(isDouble).length).toBeGreaterThanOrEqual(spec.doubles ?? 0)
        expect(level.mirrors?.length ?? 0).toBeGreaterThanOrEqual(spec.mirrors ?? 0)
        expect(level.crates?.length ?? 0).toBeGreaterThanOrEqual(spec.crates ?? 0)
        expect(level.portals?.length ?? 0).toBeGreaterThanOrEqual(spec.portals?.length ?? 0)
      }
    }
  })

  it('bigger boards carry more arrows, and every tier climbs', () => {
    const avg = (list) => list.reduce((n, l) => n + l.arrows.length, 0) / list.length
    expect(avg(boards('medium'))).toBeGreaterThan(avg(boards('easy')))
    expect(avg(boards('hard'))).toBeGreaterThan(avg(boards('medium')))
    // Hard boards (up to 20 × 28) carry far more than the 10 × 13 campaign boards.
    expect(avg(boards('hard'))).toBeGreaterThanOrEqual(55)
  })

  it('only easy rectangles fit without a camera; everything else drags and zooms, up to 20 × 28', () => {
    expect(boards('easy').filter((l) => !l.mask).every((l) => !needsCamera(l))).toBe(true)
    expect(boards('easy').filter((l) => l.mask).every(needsCamera)).toBe(true)
    for (const tier of ['medium', 'hard']) expect(boards(tier).every(needsCamera)).toBe(true)
    for (const tier of ['easy', 'medium', 'hard']) {
      for (const level of boards(tier)) expect(level.cols <= ARROWS_ENDLESS_MAX_COLS && level.rows <= ARROWS_ENDLESS_MAX_ROWS).toBe(true)
    }
    expect(boards('hard').some((l) => l.cols === 20 && l.rows === 28)).toBe(true)
  })

  it('endlessShapeDims finds a grid with enough playable cells for every shape', () => {
    for (const shape of ARROWS_SHAPES) {
      for (const cells of [120, 240, 400]) {
        const { cols, rows } = endlessShapeDims(shape, cells)
        const mask = shapeMask(shape, cols, rows)
        expect(maskConnected(mask), `${shape} ${cols}x${rows}`).toBe(true)
        if (cols < ARROWS_ENDLESS_MAX_COLS) expect(maskCells(mask), `${shape} ${cells}`).toBeGreaterThanOrEqual(cells)
      }
    }
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

describe('chapter gold target', () => {
  const ch = ARROWS_CHAPTERS[0]
  // Spread `total` stars over the chapter's levels, 3 at a time.
  const withStars = (total) => {
    let p = blankProgress()
    let left = total
    for (let l = ch.from; l <= ch.to && left > 0; l += 1) {
      const s = Math.min(3, left)
      p = recordLevelResult(p, l, s)
      left -= s
    }
    return p
  }

  it('empty progress is 0/30 and not gold', () => {
    expect(chapterGoal(blankProgress(), ch)).toEqual({ got: 0, max: 30, gold: 24, isGold: false, toGold: 24 })
    expect(chapterStars(blankProgress(), ch)).toBe(0)
    expect(ARROWS_CHAPTER_GOLD).toBe(24)
  })

  it('23 is not gold, 24 and 30 are', () => {
    expect(chapterGold(withStars(23), ch)).toBe(false)
    expect(chapterGold(withStars(24), ch)).toBe(true)
    expect(chapterGold(withStars(30), ch)).toBe(true)
  })

  it('toGold counts down and stops at 0', () => {
    expect(chapterGoal(withStars(20), ch).toGold).toBe(4)
    expect(chapterGoal(withStars(23), ch).toGold).toBe(1)
    expect(chapterGoal(withStars(30), ch).toGold).toBe(0)
  })

  it('scales to a chapter with a different level count', () => {
    expect(chapterGoal(blankProgress(), { from: 1, to: 5 })).toMatchObject({ max: 15, gold: 12 })
  })

  it('never affects unlocking', () => {
    // Gold (24 stars) with the last level uncleared: the next chapter stays shut.
    const goldButOpenEnded = withStars(24)
    expect(chapterGold(goldButOpenEnded, ch)).toBe(true)
    expect(isLevelUnlocked(goldButOpenEnded, ch.to + 1)).toBe(false)
    // Below gold (23) with every level cleared: the next chapter opens.
    let p = blankProgress()
    for (let l = ch.from; l <= ch.to; l += 1) p = recordLevelResult(p, l, l - ch.from < 3 ? 3 : 2)
    expect(chapterGoal(p, ch).got).toBe(23)
    expect(chapterGold(p, ch)).toBe(false)
    expect(isLevelUnlocked(p, ch.to + 1)).toBe(true)
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
    expect(isLevelUnlocked(recordLevelResult(p, 100, 1), 101)).toBe(true)
    expect(isLevelUnlocked(recordLevelResult(p, 170, 1), 171)).toBe(false)
  })

  it('keeps the best stars and ignores failures and bad levels', () => {
    let p = recordLevelResult(blankProgress(), 4, 3)
    p = recordLevelResult(p, 4, 1)
    expect(levelStars(p, 4)).toBe(3)
    expect(recordLevelResult(p, 5, 0)).toEqual(p)
    expect(recordLevelResult(p, 171, 3)).toEqual(p)
    expect(levelStars(recordLevelResult(p, 170, 3), 170)).toBe(3)
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
      levels: { l1: '3', l2: 7, l3: 0, l101: 3, l171: 3, 4: 2, l5: 2.6, l60: 1, l100: 2, l170: 1 },
      endless: { easy: -4, medium: '2', hard: 'x', insane: 9 },
      replayed: { l1: true, l2: false, l3: 1, l100: true, l101: true, l0: true },
      junk: true,
    })).toEqual({ levels: { l1: 3, l2: 3, l5: 2, l60: 1, l100: 2, l101: 3, l170: 1 }, endless: { easy: 0, medium: 2, hard: 0 }, replayed: { l1: true, l100: true } })
  })

  it('merges device and account copies without losing either side', () => {
    const a = { levels: { l1: 3, l2: 1 }, endless: { easy: 5, medium: 0, hard: 0 } }
    const b = { levels: { l2: 2, l3: 1 }, endless: { easy: 2, medium: 1, hard: 0 } }
    const m = mergeProgress(a, b)
    expect(m).toEqual({ levels: { l1: 3, l2: 2, l3: 1 }, endless: { easy: 5, medium: 1, hard: 0 }, replayed: {} })
    expect(mergeProgress(b, a)).toEqual(m)
    expect(mergeProgress(m, null)).toEqual(m)
    expect(sameProgress(m, { ...m, updatedAt: 5 })).toBe(true)
    expect(sameProgress(m, a)).toBe(false)
    expect(totalStars(m)).toBe(6)
  })

  it('tags starred levels 1–100 as NEW BOARD until they are cleared again; 101+ never show it', () => {
    // Stars from before the rebuild: starred, not replayed.
    const old = normalizeProgress({ levels: { l5: 2, l100: 1, l101: 3 }, endless: {} })
    expect(isNewBoard(old, 5)).toBe(true)
    expect(isNewBoard(old, 100)).toBe(true)
    expect(isNewBoard(old, 6)).toBe(false)
    expect(isNewBoard(old, 101)).toBe(false)
    expect(isNewBoard(blankProgress(), 5)).toBe(false)
    const again = recordLevelResult(old, 5, 1)
    expect(again.replayed).toEqual({ l5: true })
    expect(isNewBoard(again, 5)).toBe(false)
    expect(isNewBoard(again, 100)).toBe(true)
    // A replay never lowers the stars it keeps by level number.
    expect(levelStars(again, 5)).toBe(2)
    expect(recordLevelResult(old, 5, 0).replayed).toEqual({})
    expect(recordLevelResult(old, 140, 2).replayed).toEqual({})
    expect(recordLevelResult(blankProgress(), 100, 3).replayed).toEqual({ l100: true })
  })

  it('merges and compares the replayed tags', () => {
    const a = { levels: { l5: 1 }, replayed: { l5: true } }
    const b = { levels: { l5: 3, l6: 1 }, replayed: { l6: true } }
    const m = mergeProgress(a, b)
    expect(m.replayed).toEqual({ l5: true, l6: true })
    expect(m.levels).toEqual({ l5: 3, l6: 1 })
    expect(mergeProgress(b, a)).toEqual(m)
    expect(mergeProgress({ levels: { l5: 1 } }, { levels: { l5: 2 }, replayed: { l5: true } }).replayed).toEqual({ l5: true })
    expect(sameProgress(a, { ...a, replayed: {} })).toBe(false)
    expect(sameProgress(a, { ...a, updatedAt: 3 })).toBe(true)
  })

  it('nextLevel sticks at 170 once everything is cleared', () => {
    let p = blankProgress()
    for (let n = 1; n <= 20; n += 1) p = recordLevelResult(p, n, 1)
    expect(nextLevel(p)).toBe(21)
    for (let n = 21; n <= 40; n += 1) p = recordLevelResult(p, n, 1)
    expect(nextLevel(p)).toBe(41)
    for (let n = 41; n <= 60; n += 1) p = recordLevelResult(p, n, 1)
    expect(nextLevel(p)).toBe(61)
    for (let n = 61; n <= 170; n += 1) p = recordLevelResult(p, n, 1)
    expect(nextLevel(p)).toBe(170)
    expect(levelKey(7)).toBe('l7')
  })
})
