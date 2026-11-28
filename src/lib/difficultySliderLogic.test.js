import { describe, expect, it } from 'vitest'
import { BOT_LEVEL_IDS } from './botLevels'
import {
  FACE_SIZE, MOOD_COUNT, MOOD_TOKENS, faceCells, levelCopy, moodFor, stopIndex, stopPercent,
} from './difficultySliderLogic'

describe('stopIndex', () => {
  it('finds each level on its own stop', () => {
    BOT_LEVEL_IDS.forEach((level, i) => expect(stopIndex(BOT_LEVEL_IDS, level)).toBe(i))
  })
  it('reads an unknown or missing value as NORMAL', () => {
    expect(stopIndex(BOT_LEVEL_IDS, 'brutal')).toBe(1)
    expect(stopIndex(BOT_LEVEL_IDS, null)).toBe(1)
  })
  it('falls back to the first stop when there is no NORMAL', () => {
    expect(stopIndex(['a', 'b'], 'zzz')).toBe(0)
  })
})

describe('stopPercent', () => {
  it('spreads stops evenly from 0 to 100', () => {
    expect([0, 1, 2].map(i => stopPercent(i, 3))).toEqual([0, 50, 100])
    expect([0, 1, 2, 3].map(i => Math.round(stopPercent(i, 4)))).toEqual([0, 33, 67, 100])
  })
  it('stays on the bar for a bad index or a single stop', () => {
    expect(stopPercent(-1, 3)).toBe(0)
    expect(stopPercent(9, 3)).toBe(100)
    expect(stopPercent(0, 1)).toBe(0)
  })
})

describe('moodFor', () => {
  it('goes from friendliest to grumpiest and never backwards', () => {
    for (const count of [2, 3, 4]) {
      const moods = Array.from({ length: count }, (_, i) => moodFor(i, count))
      expect(moods[0]).toBe(0)
      expect(moods[count - 1]).toBe(MOOD_COUNT - 1)
      expect([...moods].sort((a, b) => a - b)).toEqual(moods)
    }
  })
  it('gives EASY, NORMAL and HARD three different faces', () => {
    expect(new Set(BOT_LEVEL_IDS.map((_, i) => moodFor(i, 3))).size).toBe(3)
  })
  it('has a colour for every mood', () => {
    expect(MOOD_TOKENS).toHaveLength(MOOD_COUNT)
  })
})

describe('levelCopy', () => {
  it('words every level in the shared list', () => {
    for (const level of BOT_LEVEL_IDS) {
      const { label, blurb } = levelCopy(level)
      expect(label).toBe(level.toUpperCase())
      expect(blurb).not.toBe('')
    }
  })
  it('reads an unknown id as itself', () => {
    expect(levelCopy('tricky')).toEqual({ label: 'TRICKY', blurb: '' })
  })
})

describe('faceCells', () => {
  const key = ({ x, y }) => `${x},${y}`
  it('keeps every cell inside the grid, with no cell both ink and fill', () => {
    for (let mood = 0; mood < MOOD_COUNT; mood += 1) {
      const { ink, fill } = faceCells(mood)
      const seen = new Set()
      for (const cell of [...ink, ...fill]) {
        expect(cell.x).toBeGreaterThanOrEqual(0)
        expect(cell.x).toBeLessThan(FACE_SIZE)
        expect(cell.y).toBeGreaterThanOrEqual(0)
        expect(cell.y).toBeLessThan(FACE_SIZE)
        expect(seen.has(key(cell))).toBe(false)
        seen.add(key(cell))
      }
      expect(fill.length).toBeGreaterThan(30)
    }
  })
  it('draws a different face for every mood', () => {
    const drawn = Array.from({ length: MOOD_COUNT }, (_, m) => faceCells(m).ink.map(key).sort().join('|'))
    expect(new Set(drawn).size).toBe(MOOD_COUNT)
  })
  it('draws the flat face for an unknown mood', () => {
    expect(faceCells(99)).toEqual(faceCells(1))
  })
})
