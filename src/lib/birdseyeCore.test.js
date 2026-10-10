import { describe, it, expect } from 'vitest'
import {
  FORTS, BIRDS, BIRD_IDS, MATS, quantShot, normalizeShot, starsFor, fortScore, BIRD_BONUS,
  duelBird, duelShots, duelWinner, nextFortIndex, freshDuel, fortById, ANGLE_MIN, ANGLE_MAX,
} from './birdseyeCore'

describe('forts', () => {
  it('ships five World 1 forts with unique ids, known birds and materials', () => {
    expect(FORTS.map(f => f.id)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5'])
    for (const f of FORTS) {
      expect(f.birds.length, f.id).toBe(3)
      for (const b of f.birds) expect(BIRD_IDS, f.id).toContain(b)
      for (const [mat, , , w, h, zw] of f.blocks) {
        expect(MATS[mat], `${f.id} ${mat}`).toBeTruthy()
        expect(w > 0 && h > 0 && zw > 0, f.id).toBe(true)
      }
      expect(f.crows.length, f.id).toBeGreaterThan(0)
      expect(f.stars[0], f.id).toBeLessThan(f.stars[1])
    }
  })

  it('introduces DART after the PIP-only forts', () => {
    expect(FORTS.slice(0, 2).every(f => f.birds.every(b => b === 'pip'))).toBe(true)
    expect(FORTS[2].birds).toContain('dart')
  })

  it('looks forts up by id', () => {
    expect(fortById('1-3').name).toBe('GLASSHOUSE')
    expect(fortById('9-9')).toBeNull()
  })
})

describe('quantShot / normalizeShot', () => {
  it('quantises to integers and clamps angle and power', () => {
    const s = quantShot('pip', Math.PI / 4, 0.75)
    expect(s).toEqual({ b: 'pip', a: 512, p: 750, k: -1 })
    expect(quantShot('pip', 5, 2).p).toBe(1000)
    expect(quantShot('pip', 5, 2).a).toBe(Math.round(ANGLE_MAX / (2 * Math.PI) * 4096))
    expect(quantShot('pip', -5, -1)).toMatchObject({ a: Math.round(ANGLE_MIN / (2 * Math.PI) * 4096), p: 0 })
    expect(quantShot('dart', 0.3, 0.5, 45).k).toBe(45)
    expect(quantShot('dart', 0.3, 0.5, 2.5).k).toBe(-1)
  })

  it('round-trips a stored shot and rejects bad records', () => {
    const s = quantShot('dart', 0.4, 0.9, 30)
    expect(normalizeShot({ ...s, by: 'X' })).toEqual(s)
    expect(normalizeShot({ b: 'eagle', a: 10, p: 500, k: -1 })).toBeNull()
    expect(normalizeShot({ b: 'pip', a: 10.5, p: 500, k: -1 })).toBeNull()
    expect(normalizeShot({ b: 'pip', a: 3000, p: 500, k: -1 })).toBeNull()
    expect(normalizeShot({ b: 'pip', a: 10, p: 1001, k: -1 })).toBeNull()
    expect(normalizeShot({ b: 'pip', a: 10, p: 500, k: 9999 })).toBeNull()
    expect(normalizeShot(null)).toBeNull()
    expect(normalizeShot({ b: 'pip', a: 10, p: 500 })).toEqual({ b: 'pip', a: 10, p: 500, k: -1 })
  })
})

describe('scoring', () => {
  it('adds the bird bonus only on a clear', () => {
    expect(fortScore(1150, true, 2)).toBe(1150 + 2 * BIRD_BONUS)
    expect(fortScore(1150, false, 2)).toBe(1150)
  })

  it('gives 0 stars without a clear and 1-3 by threshold', () => {
    const f = FORTS[0]
    expect(starsFor(f, 9999, false)).toBe(0)
    expect(starsFor(f, f.stars[0] - 1, true)).toBe(1)
    expect(starsFor(f, f.stars[0], true)).toBe(2)
    expect(starsFor(f, f.stars[1], true)).toBe(3)
  })
})

describe('duel rules', () => {
  it('hands each seat the fort flock in order', () => {
    const f = FORTS[2]
    expect([0, 1, 2, 3].map(n => duelBird(f, n))).toEqual(['pip', 'dart', 'pip', 'pip'])
  })

  it('sorts shots by push key and drops bad records', () => {
    const raw = {
      b: { by: 'O', b: 'pip', a: 100, p: 800, k: -1 },
      a: { by: 'X', b: 'pip', a: 120, p: 700, k: -1 },
      c: { by: 'Z', b: 'pip', a: 120, p: 700, k: -1 },
      d: { by: 'X', b: 'owl', a: 120, p: 700, k: -1 },
    }
    expect(duelShots(raw).map(s => s.key)).toEqual(['a', 'b'])
    expect(duelShots(null)).toEqual([])
  })

  it('decides on pops, then points, else a draw', () => {
    expect(duelWinner({ X: 2, O: 1 }, { X: 0, O: 900 })).toBe('X')
    expect(duelWinner({ X: 1, O: 1 }, { X: 50, O: 900 })).toBe('O')
    expect(duelWinner({ X: 1, O: 1 }, { X: 900, O: 900 })).toBe('draw')
  })

  it('walks PLAY AGAIN through the five forts', () => {
    expect(nextFortIndex(undefined)).toBe(0)
    expect(nextFortIndex(0)).toBe(1)
    expect(nextFortIndex(4)).toBe(0)
    expect(freshDuel(3)).toEqual({ bsFort: 3, bsShots: null })
    expect(freshDuel(99)).toEqual({ bsFort: 0, bsShots: null })
  })

  it('keeps the flock definitions in the shape the sim expects', () => {
    for (const id of BIRD_IDS) {
      expect(BIRDS[id].r).toBeGreaterThan(0)
      expect(['FLAP', 'DIVE', 'SPLIT']).toContain(BIRDS[id].ability)
    }
  })
})

describe('solo progress', async () => {
  const { normalizeProgress, recordFort, fortUnlocked } = await import('./birdseyeCore')

  it('keeps only known forts with clamped values', () => {
    expect(normalizeProgress({ '1-1': { stars: 7, best: 4100.6 }, '9-9': { stars: 3 }, '1-2': 'x' })).toEqual({ '1-1': { stars: 3, best: 4100 } })
    expect(normalizeProgress(null)).toEqual({})
  })

  it('only ever records upward', () => {
    let p = recordFort({}, '1-1', 2, 3000)
    p = recordFort(p, '1-1', 1, 4100)
    expect(p['1-1']).toEqual({ stars: 2, best: 4100 })
    expect(recordFort(p, 'nope', 3, 1)).toEqual(p)
  })

  it('unlocks a fort once the one before it is cleared', () => {
    expect(fortUnlocked({}, 0)).toBe(true)
    expect(fortUnlocked({}, 1)).toBe(false)
    expect(fortUnlocked({ '1-1': { stars: 1, best: 1000 } }, 1)).toBe(true)
    expect(fortUnlocked({ '1-1': { stars: 1, best: 1000 } }, 2)).toBe(false)
  })
})
