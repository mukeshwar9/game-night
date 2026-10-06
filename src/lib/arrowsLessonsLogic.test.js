import { describe, it, expect } from 'vitest'
import { ARROWS_LESSONS, getLesson, lessonLevel, lessonTap } from './arrowsLessonsLogic'
import { ARROWS_LEVEL_SPECS, ARROWS_TWIST_TIPS } from './arrowsLevelsLogic'
import { exitCheck, isDouble, isSleeper, solveArrows } from './arrowsLogic'

describe('arrow lessons', () => {
  it('covers every kind the campaign introduces, at the level that introduces it', () => {
    const intros = ARROWS_LEVEL_SPECS.map((s, i) => s.intro && [s.intro, i + 1]).filter(Boolean)
    expect(ARROWS_LESSONS.map((l) => [l.kind, l.level])).toEqual(intros)
    for (const l of ARROWS_LESSONS) {
      expect(ARROWS_TWIST_TIPS[l.kind]).toBeTruthy()
      expect(l.steps).toHaveLength(3)
      expect(l.board.cols).toBeLessThanOrEqual(5)
    }
    expect(getLesson('sleep').name).toBe('SLEEPING ARROWS')
    expect(getLesson('nope')).toBeNull()
    expect(getLesson(null)).toBeNull()
  })

  it('each script plays through the real rule check: blocked, cleared, cleared', () => {
    for (const lesson of ARROWS_LESSONS) {
      const level = lessonLevel(lesson)
      expect(solveArrows(level).solvable, lesson.kind).toBe(true)
      let gone = Array(level.arrows.length).fill(false)
      const outcomes = lesson.steps.map((s, step) => {
        const r = lessonTap(lesson, level, gone, step, s.tap)
        if (r.gone) gone = r.gone
        return r.outcome
      })
      expect(outcomes, lesson.kind).toEqual(['blocked', 'cleared', 'cleared'])
      // The arrow the lesson is about leaves on the last tap.
      expect(gone[lesson.steps[2].tap], lesson.kind).toBe(true)
    }
  })

  it('shows the kind it teaches', () => {
    expect(lessonLevel(getLesson('sleep')).arrows.some(isSleeper)).toBe(true)
    expect(lessonLevel(getLesson('double')).arrows.some(isDouble)).toBe(true)
    expect(lessonLevel(getLesson('mirror')).mirrors).toHaveLength(1)
    expect(lessonLevel(getLesson('crate')).crates).toHaveLength(1)
    const pairs = (kind) => lessonLevel(getLesson(kind)).portals
    expect(pairs('portal')).toHaveLength(1)
    expect(pairs('letters')).toHaveLength(2)
    expect(pairs('oneway')[0].oneway).toBe(true)
    expect(pairs('turning')[0].turn).toBe(true)
  })

  it('the portal lessons are held by what is beyond the other ring, not what is straight ahead', () => {
    const blockedBy = (kind) => {
      const lesson = getLesson(kind)
      return lessonTap(lesson, lessonLevel(lesson), Array(lesson.board.arrows.length).fill(false), 0, 0)
    }
    expect(blockedBy('portal')).toMatchObject({ outcome: 'blocked', blocker: 1 })
    expect(blockedBy('letters')).toMatchObject({ outcome: 'blocked', blocker: 1 })
    expect(blockedBy('turning')).toMatchObject({ outcome: 'blocked', blocker: 1 })
    // Exit-only: the dashed ring does nothing, so the straight path is what blocks.
    expect(blockedBy('oneway')).toMatchObject({ outcome: 'blocked', blocker: 1 })
    // The arrow standing straight ahead of the entrance ring never blocks the hop.
    const portal = getLesson('portal')
    expect(exitCheck(lessonLevel(portal), Array(3).fill(false), 0).blocker).toBe(1)
    expect(exitCheck(lessonLevel(portal), [false, true, false], 0).free).toBe(true)
  })

  it('the mirror lesson bounces into an arrow; the crate lesson is held by the crate itself', () => {
    const mirror = getLesson('mirror')
    const ml = lessonLevel(mirror)
    // Arrow 0 turns up at the mirror into arrow 1 above it.
    expect(lessonTap(mirror, ml, Array(3).fill(false), 0, 0)).toMatchObject({ outcome: 'blocked', blocker: 1 })
    const crate = getLesson('crate')
    const cl = lessonLevel(crate)
    expect(lessonTap(crate, cl, Array(3).fill(false), 0, 0)).toMatchObject({ outcome: 'blocked', blocker: -1, crate: 6 })
  })

  it('ignores off-target taps and never costs lives', () => {
    const lesson = getLesson('sleep')
    const level = lessonLevel(lesson)
    const gone = Array(level.arrows.length).fill(false)
    expect(lessonTap(lesson, level, gone, 0, 2)).toEqual({ outcome: 'nudge' })
    expect(lessonTap(lesson, level, gone, 5, 0)).toEqual({ outcome: 'nudge' })
    const r = lessonTap(lesson, level, gone, 0, 0)
    expect(r).toMatchObject({ outcome: 'blocked', asleep: true, next: 1 })
    // A fresh lesson board never shares state with the lesson data.
    expect(lessonLevel(lesson).arrows).not.toBe(lesson.board.arrows)
  })
})
