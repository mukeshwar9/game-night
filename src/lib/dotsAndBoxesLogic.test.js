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
} from './dotsAndBoxesLogic'

describe('hEdgeIndex', () => {
  it('computes correct indices', () => {
    expect(hEdgeIndex(0, 0)).toBe(0)
    expect(hEdgeIndex(4, 3)).toBe(19)
    expect(hEdgeIndex(2, 1)).toBe(9)
  })
})

describe('vEdgeIndex', () => {
  it('computes correct indices', () => {
    expect(vEdgeIndex(0, 0)).toBe(20)
    expect(vEdgeIndex(3, 4)).toBe(39)
    expect(vEdgeIndex(1, 2)).toBe(27)
  })
})

describe('edgesOfBox', () => {
  it('returns correct edges for box 0', () => {
    expect(edgesOfBox(0)).toEqual([0, 4, 20, 21])
  })

  it('returns correct edges for box 15 (bottom-right)', () => {
    expect(edgesOfBox(15)).toEqual([15, 19, 38, 39])
  })

  it('returns correct edges for box 5 (middle)', () => {
    // row=1, col=1: top=hEdge(1,1)=5, bottom=hEdge(2,1)=9, left=vEdge(1,1)=26, right=vEdge(1,2)=27
    expect(edgesOfBox(5)).toEqual([5, 9, 26, 27])
  })
})

describe('boxesOfEdge', () => {
  it('border horizontal top edge → 1 box below', () => {
    // edge 0 = hEdge(0,0): row=0, no box above, box 0 below
    expect(boxesOfEdge(0)).toEqual([0])
  })

  it('border horizontal bottom edge → 1 box above', () => {
    // edge 19 = hEdge(4,3): row=4, box above = 3*4+3=15, no box below
    expect(boxesOfEdge(19)).toEqual([15])
  })

  it('interior horizontal edge → 2 boxes', () => {
    // edge 5 = hEdge(1,1): row=1, col=1 → box above = 0*4+1=1, box below = 1*4+1=5
    expect(boxesOfEdge(5)).toEqual([1, 5])
  })

  it('border vertical left edge → 1 box', () => {
    // edge 20 = vEdge(0,0): col=0, no box left, box right = 0*4+0=0
    expect(boxesOfEdge(20)).toEqual([0])
  })

  it('interior vertical edge → 2 boxes', () => {
    // edge 26 = vEdge(1,1): row=1, col=1 → box left = 1*4+0=4, box right = 1*4+1=5
    expect(boxesOfEdge(26)).toEqual([4, 5])
  })

  it('returns empty for out-of-range', () => {
    expect(boxesOfEdge(-1)).toEqual([])
    expect(boxesOfEdge(40)).toEqual([])
  })
})

describe('boxesOfEdge adjacency property', () => {
  it('every box appears in boxesOfEdge for each of its 4 edges — total 64 incidences', () => {
    let incidences = 0
    for (let b = 0; b < DB_BOX_COUNT; b++) {
      const edges = edgesOfBox(b)
      for (const e of edges) {
        const adjacentBoxes = boxesOfEdge(e)
        expect(adjacentBoxes).toContain(b)
        incidences++
      }
    }
    expect(incidences).toBe(64)
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

  it('returns null for index 40', () => {
    expect(applyEdgeMove(emptyEdges, emptyBoxes, 40, 'X')).toBeNull()
  })

  it('no box completion → completedBoxes is empty', () => {
    const result = applyEdgeMove(emptyEdges, emptyBoxes, 0, 'X')
    expect(result.completedBoxes).toEqual([])
  })

  it('4th edge completes the box for mover', () => {
    // Box 0: edges [0, 4, 20, 21]. Fill first 3 with X, last with O.
    const edges = [...emptyEdges]
    edges[0] = 'X'  // top
    edges[4] = 'X'  // bottom
    edges[20] = 'X' // left
    // edge 21 = right — O draws last edge
    const result = applyEdgeMove(edges, emptyBoxes, 21, 'O')
    expect(result).not.toBeNull()
    expect(result.completedBoxes).toContain(0)
    expect(result.boxes[0]).toBe('O') // last edge wins ownership
  })

  it('last edge wins ownership (3 by X, 4th by O → O owns)', () => {
    const edges = [...emptyEdges]
    edges[0] = 'X'
    edges[4] = 'X'
    edges[20] = 'X'
    const result = applyEdgeMove(edges, emptyBoxes, 21, 'O')
    expect(result.boxes[0]).toBe('O')
  })

  it('double completion: interior edge completing 2 boxes → both to mover', () => {
    // edge 21 = vEdge(0,1): adjacent to box 0 and box 1
    // Box 0: edges [0,4,20,21]. Fill 0,4,20.
    // Box 1: edges [1,5,21,22]. Fill 1,5,22.
    const edges = [...emptyEdges]
    edges[0] = 'X'  // box0 top
    edges[4] = 'X'  // box0 bottom
    edges[20] = 'X' // box0 left
    edges[1] = 'X'  // box1 top
    edges[5] = 'X'  // box1 bottom
    edges[22] = 'X' // box1 right
    // edge 21 (shared) completes both
    const result = applyEdgeMove(edges, emptyBoxes, 21, 'X')
    expect(result.completedBoxes).toHaveLength(2)
    expect(result.completedBoxes).toContain(0)
    expect(result.completedBoxes).toContain(1)
    expect(result.boxes[0]).toBe('X')
    expect(result.boxes[1]).toBe('X')
  })

  it('pre-claimed box is not re-claimed', () => {
    // Box 0 already owned by X; fill other 3 edges and draw last with O
    const edges = [...emptyEdges]
    edges[0] = 'X'
    edges[4] = 'X'
    edges[20] = 'X'
    const boxes = [...emptyBoxes]
    boxes[0] = 'X' // pre-claimed
    const result = applyEdgeMove(edges, boxes, 21, 'O')
    expect(result.boxes[0]).toBe('X')   // unchanged
    expect(result.completedBoxes).not.toContain(0)
  })
})

describe('getDotsAndBoxesWinner', () => {
  const emptyBoxes = Array(DB_BOX_COUNT).fill('')

  it('returns null on empty board', () => {
    expect(getDotsAndBoxesWinner(emptyBoxes)).toBeNull()
  })

  it('returns null on partial board (8-7 no winner)', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    for (let i = 0; i < 8; i++) boxes[i] = 'X'
    for (let i = 8; i < 15; i++) boxes[i] = 'O'
    expect(getDotsAndBoxesWinner(boxes)).toBeNull()
  })

  it('clinches at 9 for X', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    for (let i = 0; i < 9; i++) boxes[i] = 'X'
    const result = getDotsAndBoxesWinner(boxes)
    expect(result).toEqual({ winner: 'X' })
  })

  it('clinches at 9 for O', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    for (let i = 0; i < 9; i++) boxes[i] = 'O'
    const result = getDotsAndBoxesWinner(boxes)
    expect(result).toEqual({ winner: 'O' })
  })

  it('8-8 full board → draw', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    for (let i = 0; i < 8; i++) boxes[i] = 'X'
    for (let i = 8; i < 16; i++) boxes[i] = 'O'
    const result = getDotsAndBoxesWinner(boxes)
    expect(result).toEqual({ winner: 'draw' })
  })

  it('result has no line property', () => {
    const boxes = Array(DB_BOX_COUNT).fill('')
    for (let i = 0; i < 9; i++) boxes[i] = 'X'
    const result = getDotsAndBoxesWinner(boxes)
    expect(result).not.toHaveProperty('line')
  })
})

describe('full-game simulation with extra-turn rule', () => {
  it('all boxes are claimed, counts sum to 16, winner matches', () => {
    let edges = Array(DB_EDGE_COUNT).fill('')
    let boxes = Array(DB_BOX_COUNT).fill('')
    let currentTurn = 'X'
    let winner = null

    // Play edges in order 0..39
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

    if (winner === 'X') expect(xCount).toBeGreaterThanOrEqual(9)
    else if (winner === 'O') expect(oCount).toBeGreaterThanOrEqual(9)
    else expect(winner).toBe('draw')
  })
})
