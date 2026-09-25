import { describe, it, expect } from 'vitest'
import {
  TEAM_IDS, normalizeTeams, teamSizes, teamMembers, otherTeam, balanceTeams,
  shuffleTeams, moveToTeam, teamsReady, nextInRotation, pickRoleHolders,
} from './teams'

// Deterministic rng: cycles through the given values.
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length] }

describe('normalizeTeams', () => {
  it('keeps only valid team ids', () => {
    expect(normalizeTeams({ a: 'A', b: 'B', c: 'Z', d: null })).toEqual({ a: 'A', b: 'B' })
    expect(normalizeTeams(null)).toEqual({})
    expect(normalizeTeams('junk')).toEqual({})
  })
})

describe('teamSizes / teamMembers / otherTeam', () => {
  const teams = { u1: 'A', u2: 'B', u3: 'A' }
  it('counts members per team', () => {
    expect(teamSizes(teams)).toEqual({ A: 2, B: 1 })
    expect(teamSizes({})).toEqual({ A: 0, B: 0 })
  })
  it('lists members in seat order', () => {
    expect(teamMembers(teams, 'A', ['u3', 'u2', 'u1'])).toEqual(['u3', 'u1'])
    expect(teamMembers(teams, 'B', ['u1', 'u2', 'u3'])).toEqual(['u2'])
  })
  it('flips between the two teams', () => {
    expect(otherTeam('A')).toBe('B')
    expect(otherTeam('B')).toBe('A')
    expect(TEAM_IDS).toEqual(['A', 'B'])
  })
})

describe('balanceTeams', () => {
  it('alternates a fresh room by seat order', () => {
    expect(balanceTeams(['a', 'b', 'c', 'd'])).toEqual({ a: 'A', b: 'B', c: 'A', d: 'B' })
    expect(balanceTeams(['a', 'b', 'c', 'd', 'e'])).toEqual({ a: 'A', b: 'B', c: 'A', d: 'B', e: 'A' })
  })

  it('keeps an existing split and seats newcomers on the smaller team', () => {
    const existing = { a: 'B', b: 'B', c: 'A' }
    expect(balanceTeams(['a', 'b', 'c', 'd'], existing)).toEqual({ a: 'B', b: 'B', c: 'A', d: 'A' })
  })

  it('drops departed seats and rebalances by moving the latest seat', () => {
    const existing = { a: 'A', b: 'A', c: 'A', d: 'B', gone: 'B' }
    const out = balanceTeams(['a', 'b', 'c', 'd'], existing)
    expect(out).toEqual({ a: 'A', b: 'A', c: 'B', d: 'B' })
    expect(out.gone).toBeUndefined()
  })

  it('never leaves teams more than one apart', () => {
    const existing = { a: 'A', b: 'A', c: 'A', d: 'A', e: 'A', f: 'A' }
    const out = balanceTeams(['a', 'b', 'c', 'd', 'e', 'f', 'g'], existing)
    const sizes = teamSizes(out)
    expect(Math.abs(sizes.A - sizes.B)).toBeLessThanOrEqual(1)
    expect(Object.keys(out)).toHaveLength(7)
  })

  it('handles empty rooms', () => {
    expect(balanceTeams([])).toEqual({})
    expect(balanceTeams(null)).toEqual({})
  })
})

describe('shuffleTeams', () => {
  it('produces a balanced split of every seat', () => {
    for (let n = 1; n <= 8; n++) {
      const order = Array.from({ length: n }, (_, i) => `p${i}`)
      const out = shuffleTeams(order)
      const sizes = teamSizes(out)
      expect(Object.keys(out).sort()).toEqual([...order].sort())
      expect(Math.abs(sizes.A - sizes.B)).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for a given rng', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(shuffleTeams(order, TEAM_IDS, seq(0.1, 0.7, 0.3, 0.9)))
      .toEqual(shuffleTeams(order, TEAM_IDS, seq(0.1, 0.7, 0.3, 0.9)))
  })

  it('actually varies across rngs', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f']
    const seen = new Set()
    for (const r of [0.05, 0.25, 0.45, 0.65, 0.85, 0.99]) {
      seen.add(JSON.stringify(shuffleTeams(order, TEAM_IDS, seq(r, 1 - r, r / 2))))
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('moveToTeam / teamsReady', () => {
  it('moves one seat without mutating the input', () => {
    const teams = { a: 'A', b: 'B' }
    expect(moveToTeam(teams, 'a', 'B')).toEqual({ a: 'B', b: 'B' })
    expect(teams.a).toBe('A')
  })

  it('requires the minimum on every team', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(teamsReady({ a: 'A', b: 'B', c: 'A', d: 'B' }, order, 2)).toBe(true)
    expect(teamsReady({ a: 'A', b: 'A', c: 'A', d: 'B' }, order, 2)).toBe(false)
    expect(teamsReady({ a: 'A', b: 'B', c: 'A', d: 'B' }, ['a', 'b', 'c'], 2)).toBe(false)
  })
})

describe('nextInRotation', () => {
  const order = ['a', 'b', 'c', 'd']
  it('advances and wraps', () => {
    expect(nextInRotation(order, 'a')).toBe('b')
    expect(nextInRotation(order, 'd')).toBe('a')
  })
  it('starts from the top for an unknown current', () => {
    expect(nextInRotation(order, null)).toBe('a')
    expect(nextInRotation(order, 'zz')).toBe('a')
  })
  it('skips ineligible ids', () => {
    const online = new Set(['a', 'c'])
    expect(nextInRotation(order, 'a', id => online.has(id))).toBe('c')
    expect(nextInRotation(order, 'c', id => online.has(id))).toBe('a')
  })
  it('returns current only when it is the sole eligible id, null when none', () => {
    expect(nextInRotation(order, 'b', id => id === 'b')).toBe('b')
    expect(nextInRotation(order, 'b', () => false)).toBeNull()
    expect(nextInRotation([], 'a')).toBeNull()
  })
})

describe('pickRoleHolders', () => {
  const order = ['a', 'b', 'c', 'd', 'e', 'f']
  const teams = { a: 'A', b: 'B', c: 'A', d: 'B', e: 'A', f: 'B' }

  it('starts with the first member of each team', () => {
    expect(pickRoleHolders(teams, order)).toEqual({ A: 'a', B: 'b' })
  })

  it('rotates to the next member of each team', () => {
    expect(pickRoleHolders(teams, order, { previous: { A: 'a', B: 'f' }, rotate: true }))
      .toEqual({ A: 'c', B: 'b' })
  })

  it('keeps a present holder unless rotating', () => {
    expect(pickRoleHolders(teams, order, { previous: { A: 'e', B: 'd' } })).toEqual({ A: 'e', B: 'd' })
  })

  it('replaces an ineligible or departed holder', () => {
    const online = id => id !== 'e'
    expect(pickRoleHolders(teams, order, { previous: { A: 'e', B: 'zz' }, isEligible: online }))
      .toEqual({ A: 'a', B: 'b' })
  })

  it('falls back to any member when nobody is eligible, null for an empty team', () => {
    expect(pickRoleHolders({ a: 'A' }, ['a'], { isEligible: () => false })).toEqual({ A: 'a', B: null })
  })
})
