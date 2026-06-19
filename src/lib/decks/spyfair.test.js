import { describe, it, expect } from 'vitest'
import { SPYFAIR_LOCATIONS, SPY_LOCATION_COUNT } from './spyfair'

describe('SPYFAIR deck', () => {
  it('exports at least 20 locations', () => {
    expect(SPYFAIR_LOCATIONS.length).toBeGreaterThanOrEqual(20)
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
