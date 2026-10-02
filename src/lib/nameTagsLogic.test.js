import { describe, it, expect } from 'vitest'
import { dealNameTags, tagMatches, tagCount, NAME_POOL } from './nameTagsLogic'
import { isFamilySafe } from './wordDenylist'
import { mulberry32 } from './detMath'

describe('name tags', () => {
  it('uses family-safe, unique names', () => {
    expect(new Set(NAME_POOL).size).toBe(NAME_POOL.length)
    expect(NAME_POOL.every(n => isFamilySafe(n.toLowerCase()))).toBe(true)
  })
  it('deals faces with names and moves them for recall', () => {
    for (let seed = 1; seed < 40; seed++) {
      const level = 1 + (seed % 7)
      const d = dealNameTags(level, mulberry32(seed))
      expect(d.people).toHaveLength(tagCount(level))
      expect(new Set(d.people.map(p => p.avatar)).size).toBe(d.people.length)
      expect(d.recallOrder).not.toEqual(d.studyOrder)
      expect([...d.names].sort()).toEqual(d.people.map(p => p.name).sort())
      const p = d.people[0]
      expect(tagMatches(d, p.id, p.name)).toBe(true)
      expect(tagMatches(d, p.id, d.people[1].name)).toBe(false)
    }
  })
})
