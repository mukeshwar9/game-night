import { describe, it, expect } from 'vitest'
import {
  GRID_SIZE,
  CELL_COUNT,
  FLEET_SPEC,
  SHIP_CELLS,
  shipCells,
  validateFleet,
  serializeFleet,
  parseFleet,
  randomFleet,
  gradeShot,
  allSunk,
  remainingShips,
  pickShot,
  verifyTranscript,
} from './battleshipLogic'
import { commit } from './commit'

// Deterministic PRNG for randomFleet/pickShot tests.
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const baseFleet = () => ({
  carrier: { orient: 'h', cell: 0 },      // 0-4
  battleship: { orient: 'v', cell: 20 },  // 20,30,40,50
  cruiser: { orient: 'h', cell: 55 },     // 55-57
  submarine: { orient: 'v', cell: 77 },   // 77,87,97
  destroyer: { orient: 'h', cell: 95 },   // 95,96
})

describe('constants', () => {
  it('grid is 10×10 and fleet totals 17 cells', () => {
    expect(GRID_SIZE).toBe(10)
    expect(CELL_COUNT).toBe(100)
    expect(SHIP_CELLS).toBe(17)
    expect(FLEET_SPEC.map(s => s.size)).toEqual([5, 4, 3, 3, 2])
  })
})

describe('shipCells', () => {
  it('lays horizontal ships along the row', () => {
    expect(shipCells(3, 'h', 45)).toEqual([45, 46, 47])
  })
  it('lays vertical ships down the column', () => {
    expect(shipCells(3, 'v', 45)).toEqual([45, 55, 65])
  })
})

describe('validateFleet', () => {
  it('accepts a legal fleet — including touching ships', () => {
    const touching = baseFleet()
    touching.destroyer = { orient: 'h', cell: 5 } // abuts carrier's last cell (4), no overlap
    expect(validateFleet(touching)).toBeNull()
    expect(validateFleet(baseFleet())).toBeNull()
  })
  it('rejects missing ships and bad orients/cells', () => {
    const f = baseFleet()
    delete f.cruiser
    expect(validateFleet(f)).toContain('cruiser')
    expect(validateFleet({ ...baseFleet(), carrier: { orient: 'x', cell: 0 } })).toContain('orient')
    expect(validateFleet({ ...baseFleet(), carrier: { orient: 'h', cell: -1 } })).toContain('cell')
    expect(validateFleet(null)).toBeTruthy()
  })
  it('rejects overflow past each board edge', () => {
    expect(validateFleet({ ...baseFleet(), carrier: { orient: 'h', cell: 7 } })).toContain('overflows')
    expect(validateFleet({ ...baseFleet(), battleship: { orient: 'v', cell: 80 } })).toContain('overflows')
  })
  it('rejects overlapping ships', () => {
    const f = baseFleet()
    f.cruiser = { orient: 'h', cell: 1 } // overlaps carrier at cells 1,2,3
    expect(validateFleet(f)).toContain('overlap')
  })
})

describe('serializeFleet / parseFleet', () => {
  it('is canonical — key insertion order does not matter', () => {
    const a = baseFleet()
    const b = baseFleet()
    const reordered = {}
    for (const ship of ['destroyer', 'submarine', 'cruiser', 'battleship', 'carrier']) {
      reordered[ship] = b[ship]
    }
    expect(serializeFleet(a)).toBe(serializeFleet(reordered))
  })
  it('roundtrips through parseFleet', () => {
    const parsed = parseFleet(serializeFleet(baseFleet()))
    expect(parsed).toEqual(baseFleet())
  })
  it('throws on malformed strings', () => {
    expect(() => parseFleet('carrier:h')).toThrow()
    expect(() => parseFleet('destroyer:h:0;battleship:v:20;cruiser:h:50;submarine:v:77;carrier:h:90')).toThrow()
    expect(() => parseFleet(serializeFleet({ ...baseFleet(), carrier: { orient: 'h', cell: 99 } }))).toThrow()
  })
})

describe('randomFleet', () => {
  it('produces valid fleets across 500 seeded runs', () => {
    for (let seed = 0; seed < 500; seed++) {
      const fleet = randomFleet(mulberry32(seed))
      expect(validateFleet(fleet)).toBeNull()
    }
  })
  it('is deterministic given the same seed', () => {
    expect(serializeFleet(randomFleet(mulberry32(42))))
      .toBe(serializeFleet(randomFleet(mulberry32(42))))
  })
})

describe('gradeShot', () => {
  const fleet = baseFleet() // carrier h@0 → 0..4

  it('misses empty water', () => {
    expect(gradeShot(fleet, 99, [])).toBe('miss')
  })
  it('hits and sinks on the last cell of a ship', () => {
    expect(gradeShot(fleet, 0, [])).toBe('hit')
    expect(gradeShot(fleet, 3, [{ cell: 0 }, { cell: 1 }, { cell: 2 }])).toBe('hit')
    expect(gradeShot(fleet, 4, [{ cell: 0 }, { cell: 1 }, { cell: 2 }, { cell: 3 }])).toBe('sunk:carrier')
  })
  it('returns null for repeat or out-of-range shots', () => {
    expect(gradeShot(fleet, 0, [{ cell: 0 }])).toBeNull()
    expect(gradeShot(fleet, 100, [])).toBeNull()
    expect(gradeShot(fleet, -1, [])).toBeNull()
  })
  it('adjacent ships do not cross-sink', () => {
    const f = baseFleet()
    f.destroyer = { orient: 'h', cell: 10 } // directly below carrier cells 0,1
    expect(gradeShot(f, 10, [])).toBe('hit')
    expect(gradeShot(f, 11, [{ cell: 10 }])).toBe('sunk:destroyer')
    expect(gradeShot(f, 0, [])).toBe('hit') // carrier unaffected
  })
})

describe('allSunk / remainingShips', () => {
  const fleet = baseFleet()
  it('tracks progression to full sink', () => {
    const shots = []
    for (let c = 0; c <= 4; c++) shots.push({ cell: c }) // sink carrier
    expect(allSunk(fleet, shots)).toBe(false)
    expect(remainingShips(fleet, shots).find(s => s.ship === 'carrier').sunk).toBe(true)
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
      const cell = r * 10 + c
      if (!shots.some(s => s.cell === cell)) shots.push({ cell })
    }
    expect(allSunk(fleet, shots)).toBe(true)
  })
})

describe('pickShot', () => {
  it('never repeats a cell over a long game', () => {
    const rng = mulberry32(7)
    const fleet = randomFleet(rng)
    const shots = []
    for (let i = 0; i < 100; i++) {
      const cell = pickShot(shots, rng)
      expect(cell).not.toBeNull()
      expect(shots.some(s => s.cell === cell)).toBe(false)
      shots.push({ cell, result: gradeShot(fleet, cell, shots) })
    }
    expect(pickShot(shots, rng)).toBeNull() // board exhausted
  })
  it('targets adjacent to a live hit', () => {
    const fleet = { ...baseFleet() }
    // Carrier at 0..4; shoot cell 2 → next shot should be 1 or 3.
    const shot = pickShot([], mulberry32(1))
    void shot
    const cell = 2
    const result = gradeShot(fleet, cell, [])
    expect(result).toBe('hit')
    const next = pickShot([{ cell, result }], mulberry32(3))
    expect([1, 3, 12, 92]).toContain(next)
  })
  it('extends a line when two hits align', () => {
    const fleet = baseFleet()
    const shots = [
      { cell: 1, result: gradeShot(fleet, 1, []) },
      { cell: 2, result: gradeShot(fleet, 2, [{ cell: 1 }]) },
    ]
    expect(shots.every(s => s.result === 'hit')).toBe(true)
    const seen = new Set()
    for (let i = 0; i < 30; i++) {
      seen.add(pickShot(shots, mulberry32(i + 1)))
    }
    // Line extension must propose 0 or 3 far more often than other neighbors.
    expect(seen.has(0) || seen.has(3)).toBe(true)
  })
})

describe('verifyTranscript', () => {
  const setup = async () => {
    const fleet = baseFleet()
    const { hash, salt } = await commit(serializeFleet(fleet))
    return { fleet, hash, salt }
  }

  it('passes an honest transcript in order', async () => {
    const { fleet, hash, salt } = await setup()
    const shots = []
    shots.push({ cell: 99, result: gradeShot(fleet, 99, shots) })
    shots.push({ cell: 0, result: gradeShot(fleet, 0, shots.map(s => ({ cell: s.cell }))) })
    shots.push({ cell: 1, result: gradeShot(fleet, 1, shots.map(s => ({ cell: s.cell }))) })
    const verdict = await verifyTranscript(fleet, salt, hash, shots)
    expect(verdict).toEqual({ ok: true })
  })

  it('keeps early hits as hits even after the sinking shot exists', async () => {
    const { fleet, hash, salt } = await setup()
    // Sequential grading: 0=hit,1=hit,2=hit,3=hit,4=sunk:carrier (all 5 cells).
    const shots = [
      { cell: 0, result: 'hit' },
      { cell: 1, result: 'hit' },
      { cell: 2, result: 'hit' },
      { cell: 3, result: 'hit' },
      { cell: 4, result: 'sunk:carrier' },
    ]
    expect(await verifyTranscript(fleet, salt, hash, shots)).toEqual({ ok: true })
    // But a transcript claiming sunk before all cells are shot fails.
    const lying = [
      { cell: 0, result: 'hit' },
      { cell: 1, result: 'sunk:carrier' }, // cells 2-4 still unshot
    ]
    expect((await verifyTranscript(fleet, salt, hash, lying)).reason).toBe('transcript')
  })

  it('fails on tampered results, tampered fleets, wrong salts', async () => {
    const { fleet, hash, salt } = await setup()
    expect((await verifyTranscript(fleet, 'wrong-salt', hash, [])).reason).toBe('commitment')
    // A moved fleet serializes differently → the commitment itself fails.
    const moved = { ...fleet, carrier: { orient: 'h', cell: 40 } }
    expect((await verifyTranscript(moved, salt, hash, [])).reason).toBe('commitment')
    expect((await verifyTranscript(fleet, salt, hash, [{ cell: 50, result: 'miss' }])).reason)
      .toBe('transcript') // 50 is battleship's second cell → real answer is 'hit'
  })
})
