import { describe, it, expect } from 'vitest'
import { ARENAS, ARENA_IDS, arenaById, arenaGeometry } from './bonkArenas'

describe('arenas', () => {
  it('has six uniquely named arenas', () => {
    expect(ARENAS).toHaveLength(6)
    expect(new Set(ARENA_IDS).size).toBe(6)
    expect(new Set(ARENAS.map((a) => a.name)).size).toBe(6)
  })

  it('falls back to the first arena for an unknown id', () => {
    expect(arenaById('nope').id).toBe(ARENA_IDS[0])
    expect(arenaGeometry('nope')).toBe(arenaGeometry(ARENA_IDS[0]))
  })

  it.each(ARENAS.map((a) => [a.id]))('%s: spawns sit on the surface inside the arena, mirrored', (id) => {
    const geo = arenaGeometry(id)
    expect(geo.spawns).toHaveLength(4)
    const [l, r] = geo.spawns
    expect(l).toBeLessThan(0)
    expect(r).toBeGreaterThan(0)
    expect(Math.abs(l + r)).toBeLessThan(1e-9)
    for (const x of geo.spawns) {
      expect(Math.abs(x)).toBeLessThan(geo.half)
      expect(Number.isFinite(geo.ground(x))).toBe(true)
      expect(geo.ground(x)).toBeGreaterThan(0.5)
    }
    // the same surface under both start marks: the arena is fair to both seats
    expect(Math.abs(geo.ground(l) - geo.ground(r))).toBeLessThan(1e-6)
  })

  it.each(ARENAS.map((a) => [a.id]))('%s: every outline is a usable closed polygon', (id) => {
    const geo = arenaGeometry(id)
    expect(geo.solids.length).toBeGreaterThan(0)
    for (const s of geo.solids) {
      expect(s.pts.length).toBeGreaterThanOrEqual(3)
      for (const [x, y] of s.pts) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
      }
    }
  })

  it('only the drum is closed, and only the seesaw has a plank', () => {
    expect(ARENAS.filter((a) => a.build().closed).map((a) => a.id)).toEqual(['drum'])
    expect(ARENAS.filter((a) => a.build().planks.length).map((a) => a.id)).toEqual(['seesaw'])
  })

  it('caches the built geometry', () => {
    expect(arenaGeometry('humps')).toBe(arenaGeometry('humps'))
  })
})
