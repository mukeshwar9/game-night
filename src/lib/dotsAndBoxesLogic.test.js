import { describe, it, expect } from 'vitest'
import {
  hEdgeIndex,
  vEdgeIndex,
  edgesOfBox,
  boxesOfEdge,
  applyEdgeMove,
  getDotsAndBoxesWinner,
  DB_EDGE_COUNT,
  DB_BOX_COUNT,
  DB_SIZE,
  DB_H_EDGE_COUNT,
  DB_CLINCH,
  dbConfig,
} from './dotsAndBoxesLogic'

describe('hEdgeIndex', () => {
  it('computes correct indices', () => {
    expect(hEdgeIndex(0, 0)).toBe(0)
    expect(hEdgeIndex(2, 1)).toBe(2 * DB_SIZE + 1)
    expect(hEdgeIndex(DB_SIZE, DB_SIZE - 1)).toBe(DB_H_EDGE_COUNT - 1)
  })
})

describe('vEdgeIndex', () => {
  it('computes correct indices', () => {
    expect(vEdgeIndex(0, 0)).toBe(DB_H_EDGE_COUNT)
    expect(vEdgeIndex(DB_SIZE - 1, DB_SIZE)).toBe(DB_EDGE_COUNT - 1)
  })
})

describe('edgesOfBox', () => {
  it('returns correct edges for box 0', () => {
    expect(edgesOfBox(0)).toEqual([
      hEdgeIndex(0, 0),
      hEdgeIndex(1, 0),
      vEdgeIndex(0, 0),
      vEdgeIndex(0, 1),
    ])
  })

  it('returns correct edges for the bottom-right box', () => {
    const last = DB_BOX_COUNT - 1
    const r = DB_SIZE - 1
    const c = DB_SIZE - 1
    expect(edgesOfBox(last)).toEqual([
      hEdgeIndex(r, c),
      hEdgeIndex(r + 1, c),
      vEdgeIndex(r, c),
      vEdgeIndex(r, c + 1),
    ])
  })
})

describe('boxesOfEdge', () => {
  it('border horizontal top edge → 1 box below', () => {
    expect(boxesOfEdge(hEdgeIndex(0, 0))).toEqual([0])
  })

  it('border horizontal bottom edge → 1 box above', () => {
    expect(boxesOfEdge(hEdgeIndex(DB_SIZE, DB_SIZE - 1))).toEqual([DB_BOX_COUNT - 1])
  })

  it('interior horizontal edge → 2 boxes', () => {
    expect(boxesOfEdge(hEdgeIndex(1, 1))).toEqual([1, DB_SIZE + 1])
  })

  it('border vertical left edge → 1 box', () => {
    expect(boxesOfEdge(vEdgeIndex(0, 0))).toEqual([0])
  })

  it('interior vertical edge → 2 boxes', () => {
    expect(boxesOfEdge(vEdgeIndex(1, 1))).toEqual([DB_SIZE, DB_SIZE + 1])
  })

  it('returns empty for out-of-range', () => {
    expect(boxesOfEdge(-1)).toEqual([])
    expect(boxesOfEdge(DB_EDGE_COUNT)).toEqual([])
  })
})

describe('boxesOfEdge adjacency property', () => {
  it('every box appears in boxesOfEdge for each of its 4 edges', () => {
    let incidences = 0
    for (let b = 0; b < DB_BOX_COUNT; b++) {
      const edges = edgesOfBox(b)
      for (const e of edges) {
        const adjacentBoxes = boxesOfEdge(e)
        expect(adjacentBoxes).toContain(b)
        incidences++
      }
    }
    expect(incidences).toBe(DB_BOX_COUNT * 4)
  })
})

describe('applyEdgeMove', () => {
  const emptyEdges = Array(DB_EDGE_COUNT).fill('')
  const emptyBoxes = Array(DB_BOX_COUNT).fill('')

  it('places symbol on the edge', () => {
    const result = applyEdgeMove(emptyEdges, emptyBoxes, 0, 'X')
    expect(result).not.toBeNull()
    expect(result.edges[0]).toBe('X')
  })

  it('does not mutate input arrays', () => {
    const edgesCopy = [...emptyEdges]
    const boxesCopy = [...emptyBoxes]
    applyEdgeMove(edgesCopy, boxesCopy, 5, 'X')
    expect(edgesCopy).toEqual(emptyEdges)
    expect(boxesCopy).toEqual(emptyBoxes)
  })

  it('returns null on occupied edge', () => {
    const edges = [...emptyEdges]
    edges[0] = 'X'
    expect(applyEdgeMove(edges, emptyBoxes, 0, 'O')).toBeNull()
  })

  it('returns null for index -1', () => {
    expect(applyEdgeMove(emptyEdges, emptyBoxes, -1, 'X')).toBeNull()
  })

  it('returns null for index past the last edge', () => {
    expect(applyEdgeMove(emptyEdges, emptyBoxes, DB_EDGE_COUNT, 'X')).toBeNull()
  })

  it('no box completion → completedBoxes is empty', () => {
    const result = applyEdgeMove(emptyEdges, emptyBoxes, 0, 'X')
    expect(result.completedBoxes).toEqual([])
  })

  it('4th edge completes the box for mover', () => {
    const [top, bottom, left, right] = edgesOfBox(0)
    const edges = [...emptyEdges]
    edges[top] = 'X'
    edges[bottom] = 'X'
    edges[left] = 'X'
    const result = applyEdgeMove(edges, emptyBoxes, right, 'O')
    expect(result).not.toBeNull()
    expect(result.completedBoxes).toContain(0)
    expect(result.boxes[0]).toBe('O')
  })

  it('last edge wins ownership (3 by X, 4th by O → O owns)', () => {
    const [top, bottom, left, right] = edgesOfBox(0)
    const edges = [...emptyEdges]
    edges[top] = 'X'
    edges[bottom] = 'X'
    edges[left] = 'X'
    const result = applyEdgeMove(edges, emptyBoxes, right, 'O')
    expect(result.boxes[0]).toBe('O')
  })

  it('double completion: interior edge completing 2 boxes → both to mover', () => {
    const shared = vEdgeIndex(0, 1)
    const box0 = edgesOfBox(0)
    const box1 = edgesOfBox(1)
    const edges = [...emptyEdges]
    for (const e of box0) if (e !== shared) edges[e] = 'X'
    for (const e of box1) if (e !== shared) edges[e] = 'X'
    const result = applyEdgeMove(edges, emptyBoxes, shared, 'X')
    expect(result.completedBoxes).toHaveLength(2)
    expect(result.completedBoxes).toContain(0)
    expect(result.completedBoxes).toContain(1)
    expect(result.boxes[0]).toBe('X')
    expect(result.boxes[1]).toBe('X')
  })

  it('pre-claimed box is not re-claimed', () => {
    const [top, bottom, left, right] = edgesOfBox(0)
    const edges = [...emptyEdges]
    edges[top] = 'X'
    edges[bottom] = 'X'
    edges[left] = 'X'
    const boxes = [...emptyBoxes]
    boxes[0] = 'X'
    const result = applyEdgeMove(edges, boxes, right, 'O')
    expect(result.boxes[0]).toBe('X')
    expect(result.completedBoxes).not.toContain(0)
  })
})

describe('getDotsAndBoxesWinner', () => {
  const emptyBoxes = Array(DB_BOX_COUNT).fill('')

  it('returns null on empty board', () => {
    expect(getDotsAndBoxesWinner(emptyBoxes)).toBeNull()
  })

  it('returns null on partial board below clinch', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    const shy = DB_CLINCH - 1
    for (let i = 0; i < shy; i++) boxes[i] = 'X'
    for (let i = shy; i < shy + shy - 1; i++) boxes[i] = 'O'
    expect(getDotsAndBoxesWinner(boxes)).toBeNull()
  })

  it('clinches at majority for X', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    for (let i = 0; i < DB_CLINCH; i++) boxes[i] = 'X'
    const result = getDotsAndBoxesWinner(boxes)
    expect(result).toEqual({ winner: 'X' })
  })

  it('clinches at majority for O', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    for (let i = 0; i < DB_CLINCH; i++) boxes[i] = 'O'
    const result = getDotsAndBoxesWinner(boxes)
    expect(result).toEqual({ winner: 'O' })
  })

  it('even split on a full board → draw', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    const half = DB_BOX_COUNT / 2
    for (let i = 0; i < half; i++) boxes[i] = 'X'
    for (let i = half; i < DB_BOX_COUNT; i++) boxes[i] = 'O'
    const result = getDotsAndBoxesWinner(boxes)
    expect(result).toEqual({ winner: 'draw' })
  })

  it('result has no line property', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    for (let i = 0; i < DB_CLINCH; i++) boxes[i] = 'X'
    const result = getDotsAndBoxesWinner(boxes)
    expect(result).not.toHaveProperty('line')
  })
})

describe('full-game simulation with extra-turn rule', () => {
  it('all boxes are claimed, counts sum to the board, winner matches', () => {
    let edges = Array(DB_EDGE_COUNT).fill('')
    let boxes = Array(DB_BOX_COUNT).fill('')
    let currentTurn = 'X'
    let winner = null

    // Play edges in index order until the round ends
    for (let e = 0; e < DB_EDGE_COUNT; e++) {
      const result = applyEdgeMove(edges, boxes, e, currentTurn)
      expect(result).not.toBeNull()
      edges = result.edges
      boxes = result.boxes

      const gameResult = getDotsAndBoxesWinner(boxes)
      if (gameResult) {
        winner = gameResult.winner
        break
      }

      // extra turn if completed any box; otherwise flip
      if (result.completedBoxes.length === 0) {
        currentTurn = currentTurn === 'X' ? 'O' : 'X'
      }
    }

    const xCount = boxes.filter(b => b === 'X').length
    const oCount = boxes.filter(b => b === 'O').length
    expect(xCount + oCount).toBe(DB_BOX_COUNT)

    if (winner === 'X') expect(xCount).toBeGreaterThanOrEqual(DB_CLINCH)
    else if (winner === 'O') expect(oCount).toBeGreaterThanOrEqual(DB_CLINCH)
    else expect(winner).toBe('draw')
  })
})

describe('classic 4×4 size', () => {
  const size = 4

  it('last vertical edge is 39', () => {
    expect(vEdgeIndex(3, 4, size)).toBe(39)
    expect(dbConfig(size).edgeCount).toBe(40)
    expect(dbConfig(size).boxCount).toBe(16)
    expect(dbConfig(size).clinch).toBe(9)
  })

  it('clinches at 9 on a 4×4 board', () => {
    const boxes = Array(16).fill('')
    for (let i = 0; i < 9; i++) boxes[i] = 'X'
    expect(getDotsAndBoxesWinner(boxes, size)).toEqual({ winner: 'X' })
  })

  it('applyEdgeMove rejects out of range on 4×4', () => {
    expect(applyEdgeMove(Array(40).fill(''), Array(16).fill(''), 40, 'X', size)).toBeNull()
  })
})
