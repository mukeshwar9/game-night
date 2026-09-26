import { describe, it, expect } from 'vitest'
import { SPYFAIR_LOCATIONS, SPY_LOCATION_COUNT } from './spyfair'

describe('SPYFAIR deck', () => {
  it('exports at least 50 locations (content v2 floor)', () => {
    expect(SPYFAIR_LOCATIONS.length).toBeGreaterThanOrEqual(50)
  })

  it('SPY_LOCATION_COUNT matches the array length', () => {
    expect(SPY_LOCATION_COUNT).toBe(SPYFAIR_LOCATIONS.length)
  })

  it('every location has a non-empty uppercase name', () => {
    for (const loc of SPYFAIR_LOCATIONS) {
      expect(typeof loc.name).toBe('string')
      expect(loc.name.length).toBeGreaterThan(0)
      expect(loc.name).toBe(loc.name.toUpperCase())
    }
  })

  it('location names are unique', () => {
    const names = SPYFAIR_LOCATIONS.map(l => l.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('location names are short plain A-Z words that fit the spy guess grid', () => {
    for (const loc of SPYFAIR_LOCATIONS) {
      expect(loc.name, loc.name).toMatch(/^[A-Z]+( [A-Z]+)*$/)
      expect(loc.name.length, loc.name).toBeLessThanOrEqual(16)
    }
  })

  it('roles are trimmed and short enough for the role card', () => {
    for (const loc of SPYFAIR_LOCATIONS) {
      for (const role of loc.roles) {
        expect(role, role).toBe(role.trim())
        expect(role.length, role).toBeLessThanOrEqual(24)
      }
    }
  })

  it('keeps the original locations at their original indexes (rounds store an index)', () => {
    expect(SPYFAIR_LOCATIONS[0].name).toBe('AIRPLANE')
    expect(SPYFAIR_LOCATIONS[3].name).toBe('CASINO')
    expect(SPYFAIR_LOCATIONS[23].name).toBe('UNIVERSITY')
  })

  it('every location has enough distinct roles for a full 7-player table', () => {
    for (const loc of SPYFAIR_LOCATIONS) {
      expect(Array.isArray(loc.roles)).toBe(true)
      // 7 players, one is the spy -> need at least 6 roles for the rest;
      // decks ship 7 so a future spy-counts tweak still has slack.
      expect(loc.roles.length).toBeGreaterThanOrEqual(6)
      expect(new Set(loc.roles).size).toBe(loc.roles.length)
      for (const role of loc.roles) {
        expect(typeof role).toBe('string')
        expect(role.length).toBeGreaterThan(0)
      }
    }
  })

  it('contains classic Spyfall locations', () => {
    const names = SPYFAIR_LOCATIONS.map(l => l.name)
    expect(names).toContain('CASINO')
    expect(names).toContain('SPACE STATION')
    expect(names).toContain('PIRATE SHIP')
  })
})
