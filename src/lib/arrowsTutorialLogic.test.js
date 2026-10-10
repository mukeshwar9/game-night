import { describe, it, expect } from 'vitest'
import { firstUndoneKind, markTutorialDone, nextTutorialKind, parseTutorialDone, tutorialKinds } from './arrowsTutorialLogic'

describe('arrows tutorial track', () => {
  it('runs through all 19 lessons in campaign order', () => {
    const kinds = tutorialKinds()
    expect(kinds).toHaveLength(19)
    expect(kinds[0]).toBe('basics')
    expect(kinds.at(-1)).toBe('swerve')
    expect(nextTutorialKind('basics')).toBe('diag')
    expect(nextTutorialKind('swerve')).toBeNull()
    expect(nextTutorialKind('nope')).toBeNull()
  })

  it('parses stored done lists defensively', () => {
    expect(parseTutorialDone(null)).toEqual([])
    expect(parseTutorialDone('not json')).toEqual([])
    expect(parseTutorialDone('{"a":1}')).toEqual([])
    expect(parseTutorialDone('["bend","ghost","basics"]')).toEqual(['basics', 'bend'])
  })

  it('marks done once, in order, ignoring unknown kinds', () => {
    let done = markTutorialDone([], 'diag')
    done = markTutorialDone(done, 'basics')
    expect(done).toEqual(['basics', 'diag'])
    expect(markTutorialDone(done, 'basics')).toBe(done)
    expect(markTutorialDone(done, 'ghost')).toBe(done)
  })

  it('finds the first lesson left', () => {
    expect(firstUndoneKind([])).toBe('basics')
    expect(firstUndoneKind(['basics', 'bend'])).toBe('diag')
    expect(firstUndoneKind(tutorialKinds())).toBeNull()
  })
})
