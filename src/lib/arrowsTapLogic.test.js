import { describe, it, expect } from 'vitest'
import { applyArrowTap, cellCenter, freeArrows, generateArrowsLevel, occupancy } from './arrowsLogic'
import { getArrowsLevel } from './arrowsLevelsLogic'
import { pickArrowAt, resolveTap, snapToFree } from './arrowsTapLogic'

const CELL = 10
const boards = () => [getArrowsLevel(160), getArrowsLevel(40), generateArrowsLevel(7, 'hard')]

// First (blocked cell, free cell) pair of orthogonal neighbours on a board.
function blockedBesideFree(level) {
  const gone = Array(level.arrows.length).fill(false)
  const occ = occupancy(level, gone)
  const free = new Set(freeArrows(level, gone))
  for (let y = 0; y < level.rows; y += 1) {
    for (let x = 0; x < level.cols; x += 1) {
      const a = occ[y * level.cols + x]
      if (a < 0 || free.has(a)) continue
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= level.cols || ny >= level.rows) continue
        const f = occ[ny * level.cols + nx]
        if (f >= 0 && free.has(f)) return { gone, blocked: a, free: f, bc: [x, y], fc: [nx, ny] }
      }
    }
  }
  return null
}

describe('pickArrowAt', () => {
  it('returns the owner of the cell under the point', () => {
    for (const level of boards()) {
      const gone = Array(level.arrows.length).fill(false)
      level.arrows.forEach((a, i) => {
        const [mx, my] = cellCenter(a.cells[0], CELL)
        expect(pickArrowAt(level, gone, mx, my, CELL)).toBe(i)
      })
    }
  })

  it('returns -1 on empty space far from any arrow', () => {
    const level = getArrowsLevel(160)
    const gone = Array(level.arrows.length).fill(true)
    expect(pickArrowAt(level, gone, 55, 55, CELL)).toBe(-1)
    expect(pickArrowAt(level, gone, -500, -500, CELL)).toBe(-1)
  })

  it('takes the nearest cell centre within reach of an empty cell', () => {
    const level = getArrowsLevel(160)
    const gone = Array(level.arrows.length).fill(false)
    const occ = occupancy(level, gone)
    let found = false
    for (let y = 0; y < level.rows && !found; y += 1) {
      for (let x = 0; x + 1 < level.cols && !found; x += 1) {
        if (occ[y * level.cols + x] !== -1 || occ[y * level.cols + x + 1] < 0) continue
        // Just inside the empty cell, 0.55 cell from the neighbour's centre.
        const [mx, my] = cellCenter([x + 1, y], CELL)
        expect(pickArrowAt(level, gone, mx - 0.55 * CELL, my, CELL)).toBe(occ[y * level.cols + x + 1])
        expect(pickArrowAt(level, gone, mx - 0.95 * CELL, my, CELL, 0.8)).not.toBe(occ[y * level.cols + x + 1])
        found = true
      }
    }
    expect(found).toBe(true)
  })
})

describe('snapToFree', () => {
  it('leaves a free hit and a miss unchanged', () => {
    for (const level of boards()) {
      const gone = Array(level.arrows.length).fill(false)
      const f = freeArrows(level, gone)[0]
      const [mx, my] = cellCenter(level.arrows[f].cells[0], CELL)
      expect(snapToFree(level, gone, mx, my, f, CELL)).toBe(f)
      expect(snapToFree(level, gone, 0, 0, -1, CELL)).toBe(-1)
    }
  })

  it('snaps a blocked hit to a free arrow in reach', () => {
    let tested = 0
    for (const level of boards()) {
      const pair = blockedBesideFree(level)
      if (!pair) continue
      const [bx, by] = cellCenter(pair.bc, CELL)
      const [fx, fy] = cellCenter(pair.fc, CELL)
      // Inside the blocked cell, 0.6 cell from the free neighbour's centre.
      const x = bx + (fx - bx) * 0.4
      const y = by + (fy - by) * 0.4
      expect(pickArrowAt(level, pair.gone, x, y, CELL)).toBe(pair.blocked)
      expect(snapToFree(level, pair.gone, x, y, pair.blocked, CELL)).toBe(pair.free)
      expect(resolveTap(level, pair.gone, x, y, CELL)).toBe(pair.free)
      tested += 1
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('keeps a blocked hit with no free arrow in reach, and it still costs a life', () => {
    let tested = 0
    for (const level of boards()) {
      const gone = Array(level.arrows.length).fill(false)
      const free = freeArrows(level, gone)
      const near = (x, y) => free.some((i) => level.arrows[i].cells.some((c) => {
        const [mx, my] = cellCenter(c, CELL)
        return Math.hypot(mx - x, my - y) < 0.8 * CELL
      }))
      const blocked = level.arrows.findIndex((_, i) => !free.includes(i) && level.arrows[i].cells.some((c) => {
        const [mx, my] = cellCenter(c, CELL)
        return !near(mx, my)
      }))
      if (blocked < 0) continue
      const c = level.arrows[blocked].cells.find((cc) => !near(...cellCenter(cc, CELL)))
      const [x, y] = cellCenter(c, CELL)
      const tap = resolveTap(level, gone, x, y, CELL)
      expect(tap).toBe(blocked)
      expect(applyArrowTap(level, gone, 3, tap).lives).toBe(2)
      tested += 1
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('never returns a gone arrow', () => {
    for (const level of boards()) {
      const gone = Array(level.arrows.length).fill(false)
      freeArrows(level, gone).forEach((i) => { gone[i] = true })
      for (let y = 0; y < level.rows * CELL; y += 3) {
        for (let x = 0; x < level.cols * CELL; x += 3) {
          const r = resolveTap(level, gone, x, y, CELL)
          if (r >= 0) expect(gone[r]).toBe(false)
        }
      }
    }
  })
})
