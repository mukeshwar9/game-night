import { describe, expect, it } from 'vitest'
import { columnsFromTops, nextRadioIndex, tabStopIndex } from './rovingRadioLogic'

describe('nextRadioIndex', () => {
  it('moves left and right with wraparound', () => {
    expect(nextRadioIndex('ArrowRight', 0, 5)).toBe(1)
    expect(nextRadioIndex('ArrowRight', 4, 5)).toBe(0)
    expect(nextRadioIndex('ArrowLeft', 0, 5)).toBe(4)
  })

  it('treats up and down as previous and next in a single row', () => {
    expect(nextRadioIndex('ArrowDown', 4, 5, 1)).toBe(0)
    expect(nextRadioIndex('ArrowUp', 0, 5, 1)).toBe(4)
  })

  it('moves by a row in a grid and stops at the edges', () => {
    expect(nextRadioIndex('ArrowDown', 1, 10, 4)).toBe(5)
    expect(nextRadioIndex('ArrowDown', 7, 10, 4)).toBe(9)
    expect(nextRadioIndex('ArrowDown', 9, 10, 4)).toBe(9)
    expect(nextRadioIndex('ArrowUp', 5, 10, 4)).toBe(1)
    expect(nextRadioIndex('ArrowUp', 2, 10, 4)).toBe(0)
  })

  it('jumps with Home and End', () => {
    expect(nextRadioIndex('Home', 3, 5)).toBe(0)
    expect(nextRadioIndex('End', 0, 5)).toBe(4)
  })

  it('ignores other keys and empty groups', () => {
    expect(nextRadioIndex('Enter', 0, 5)).toBeNull()
    expect(nextRadioIndex('ArrowRight', 0, 0)).toBeNull()
  })

  it('starts from the first option when focus is outside the group', () => {
    expect(nextRadioIndex('ArrowRight', -1, 5)).toBe(1)
  })
})

describe('columnsFromTops', () => {
  it('counts the options on the first row', () => {
    expect(columnsFromTops([0, 0, 0, 0, 60, 60])).toBe(4)
    expect(columnsFromTops([0, 0.5, 1, 40])).toBe(3)
    expect(columnsFromTops([10])).toBe(1)
    expect(columnsFromTops([])).toBe(1)
  })
})

describe('tabStopIndex', () => {
  it('is the checked option, or the first when none is checked', () => {
    expect(tabStopIndex([false, true, false])).toBe(1)
    expect(tabStopIndex([false, false])).toBe(0)
  })
})
