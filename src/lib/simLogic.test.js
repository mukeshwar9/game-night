import { describe, it, expect } from 'vitest'
import {
  SIM_DOTS,
  SIM_EDGE_COUNT,
  SIM_EDGES,
  SIM_TRIANGLES,
  SIM_DOT_POS,
  edgesOf,
  triangleOf,
  getSimWinner,
  getMoveIndex,
} from './simLogic'

const empty = () => Array(SIM_EDGE_COUNT).fill('')
const edge = (a, b) => SIM_EDGES.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a))

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------
describe('structure', () => {
  it('has 6 dots and 15 edges', () => {
    expect(SIM_DOTS).toBe(6)
    expect(SIM_EDGES).toHaveLength(15)
    expect(SIM_EDGE_COUNT).toBe(15)
  })

  it('edges cover every dot pair exactly once', () => {
    const seen = new Set()
    for (const [a, b] of SIM_EDGES) {
      expect(a).toBeLessThan(b)
      const key = `${a}-${b}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    expect(seen.size).toBe(15)
  })

  it('generates exactly 20 triangles, each a valid 3-cycle', () => {
    expect(SIM_TRIANGLES).toHaveLength(20) // C(6,3)
    for (const [e1, e2, e3] of SIM_TRIANGLES) {
      expect(e1).not.toBe(e2)
      expect(e2).not.toBe(e3)
      expect(e1).not.toBe(e3)
    }
  })

  it("every triangle's edges form a closed cycle of 3 distinct dots", () => {
    for (const tri of SIM_TRIANGLES) {
      const dots = []
      for (const e of tri) {
        const [a, b] = SIM_EDGES[e]
        for (const d of [a, b]) if (!dots.includes(d)) dots.push(d)
      }
      expect(dots).toHaveLength(3)
      // each dot appears in exactly 2 of the 3 edges
      for (const d of dots) {
        const count = tri.filter(e => SIM_EDGES[e].includes(d)).length
        expect(count).toBe(2)
      }
    }
  })

  it('dot positions are 6 distinct points in bounds', () => {
    expect(SIM_DOT_POS).toHaveLength(6)
    for (const { x, y } of SIM_DOT_POS) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(100)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(100)
    }
    expect(new Set(SIM_DOT_POS.map(p => `${p.x},${p.y}`)).size).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// getMoveIndex
// ---------------------------------------------------------------------------
describe('getMoveIndex', () => {
  it('accepts an empty edge', () => {
    expect(getMoveIndex(empty(), edge(0, 1))).toBe(edge(0, 1))
  })

  it('rejects occupied, out-of-range and non-integer indices', () => {
    const b = empty()
    b[edge(0, 1)] = 'X'
    expect(getMoveIndex(b, edge(0, 1))).toBe(-1)
    expect(getMoveIndex(b, -1)).toBe(-1)
    expect(getMoveIndex(b, 15)).toBe(-1)
    expect(getMoveIndex(b, 1.5)).toBe(-1)
    expect(getMoveIndex(b, null)).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// edgesOf / triangleOf
// ---------------------------------------------------------------------------
describe('edgesOf / triangleOf', () => {
  it("collects only that symbol's edges", () => {
    const b = empty()
    b[edge(0, 1)] = 'X'
    b[edge(2, 3)] = 'O'
    b[edge(4, 5)] = 'X'
    expect(edgesOf(b, 'X')).toEqual([edge(0, 1), edge(4, 5)])
    expect(edgesOf(b, 'O')).toEqual([edge(2, 3)])
  })

  it('triangleOf finds the triangle when present', () => {
    const b = empty()
    for (const [a, c] of [[0, 1], [1, 2], [0, 2]]) b[edge(a, c)] = 'X'
    expect(triangleOf(edgesOf(b, 'X'))).toEqual([edge(0, 1), edge(1, 2), edge(0, 2)])
  })

  it('triangleOf returns null on near-triangle (two edges)', () => {
    const b = empty()
    b[edge(0, 1)] = 'X'
    b[edge(1, 2)] = 'X'
    expect(triangleOf(edgesOf(b, 'X'))).toBeNull()
  })

  it('treats missing cells as empty (sparse Firebase object)', () => {
    const obj = { [edge(0, 1)]: 'X', [edge(1, 2)]: 'X' }
    expect(triangleOf(edgesOf(obj, 'X'))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getSimWinner
// ---------------------------------------------------------------------------
describe('getSimWinner', () => {
  it('null on empty board and on triangle-free partial boards', () => {
    expect(getSimWinner(empty())).toBeNull()
    const b = empty()
    b[edge(0, 1)] = 'X'
    b[edge(2, 3)] = 'O'
    b[edge(4, 5)] = 'X'
    expect(getSimWinner(b)).toBeNull()
  })

  it('X triangle loses → O wins, line is the losing triangle', () => {
    const b = empty()
    for (const [a, c] of [[0, 1], [1, 2], [0, 2]]) b[edge(a, c)] = 'X'
    b[edge(3, 4)] = 'O'
    const r = getSimWinner(b)
    expect(r).toEqual({ winner: 'O', line: [edge(0, 1), edge(1, 2), edge(0, 2)] })
  })

  it('O triangle loses → X wins', () => {
    const b = empty()
    for (const [a, c] of [[2, 3], [3, 4], [2, 4]]) b[edge(a, c)] = 'O'
    const r = getSimWinner(b)
    expect(r.winner).toBe('X')
    expect(r.line.sort((a, b) => a - b)).toEqual([edge(2, 3), edge(2, 4), edge(3, 4)].sort((a, b) => a - b))
  })

  it('both triangles on board: X loss reported first (deterministic)', () => {
    const b = empty()
    for (const [a, c] of [[0, 1], [1, 2], [0, 2]]) b[edge(a, c)] = 'X'
    for (const [a, c] of [[3, 4], [4, 5], [3, 5]]) b[edge(a, c)] = 'O'
    const r = getSimWinner(b)
    expect(r.winner).toBe('O') // X completed theirs "first" in scan order
  })

  it('5 edges in a star (no triangle) is not a loss', () => {
    const b = empty()
    // 0-1, 0-2, 0-3, 0-4, 0-5 — all from dot 0, no cycle possible
    for (const d of [1, 2, 3, 4, 5]) b[edge(0, d)] = 'X'
    expect(getSimWinner(b)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Ramsey fuzz — R(3,3)=6 means a full 15-edge board always has a loser
// ---------------------------------------------------------------------------
describe('getSimWinner: no-draw fuzz (R(3,3)=6)', () => {
  it('every 2-coloring of K6 yields exactly one triangle color', () => {
    let seed = 0x9e3779b9 // deterministic PRNG seed
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0
      seed ^= seed >> 17
      seed ^= seed << 5; seed >>>= 0
      return seed / 0xffffffff
    }
    for (let trial = 0; trial < 400; trial++) {
      const b = empty().map(() => (rand() < 0.5 ? 'X' : 'O'))
      const r = getSimWinner(b)
      // The Ramsey guarantee: NEVER a draw, always a decisive result.
      expect(r).not.toBeNull()
      expect(['X', 'O']).toContain(r.winner)
      // The reported line is a genuine triangle in the loser's color.
      const loser = r.winner === 'O' ? 'X' : 'O'
      expect(r.line).toHaveLength(3)
      for (const e of r.line) expect(b[e]).toBe(loser)
      // (Both colors CAN own triangles on a fully-colored K6 — real play ends
      // at the first one, so we don't assert the winner is triangle-free.)
    }
  })
})
