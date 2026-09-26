import { describe, it, expect } from 'vitest'
import {
  SOLO_LIVES,
  startSimonSolo, applySimonSoloPress,
  startVmSolo, applyVmSoloTap, vmSoloScore,
  startChimpSolo, applyChimpSoloTap, chimpSoloScore,
  startNumberSolo, submitNumberSolo, numberSoloScore,
} from './memorySoloLogic'
import { VM_START_LEVEL } from './visualMemoryLogic'
import { CHIMP_START_LEVEL, CHIMP_GRID } from './chimpLogic'

// Deterministic generators: pattern/layout = the first `n` cells.
const firstN = n => Array.from({ length: n }, (_, i) => i)
const zeroRand = () => 0 // Simon always adds pad 0

describe('Simon solo', () => {
  it('starts with one pad to repeat', () => {
    const s = startSimonSolo(zeroRand)
    expect(s).toMatchObject({ seq: [0], progress: 0, score: 0, over: false })
  })

  it('repeating the whole sequence scores it and adds a pad', () => {
    let s = { seq: [2, 1], progress: 0, score: 1, over: false, miss: null }
    s = applySimonSoloPress(s, 2, zeroRand)
    expect(s.progress).toBe(1)
    s = applySimonSoloPress(s, 1, zeroRand)
    expect(s).toMatchObject({ seq: [2, 1, 0], progress: 0, score: 2 })
  })

  it('a wrong pad ends the run and records the press', () => {
    const s = applySimonSoloPress({ seq: [2, 1], progress: 1, score: 1, over: false, miss: null }, 3)
    expect(s).toMatchObject({ over: true, miss: 3, score: 1, progress: 1 })
  })

  it('ignores presses once over or out of range', () => {
    const over = { seq: [1], progress: 0, score: 0, over: true, miss: 2 }
    expect(applySimonSoloPress(over, 1)).toBe(over)
    const live = startSimonSolo(zeroRand)
    expect(applySimonSoloPress(live, 9)).toBe(live)
  })
})

describe('Visual Memory solo', () => {
  const gen = level => firstN(level)

  it('clearing a level moves up one with a new pattern', () => {
    let s = startVmSolo(gen)
    for (const c of s.pattern) s = applyVmSoloTap(s, c, gen)
    expect(s.level).toBe(VM_START_LEVEL + 1)
    expect(s.pattern).toHaveLength(VM_START_LEVEL + 1)
    expect(s.clicked).toEqual([])
    expect(vmSoloScore(s)).toBe(1)
  })

  it('a wrong tile costs a life and replays the same level', () => {
    const s = applyVmSoloTap(startVmSolo(gen), 15, gen)
    expect(s).toMatchObject({ level: VM_START_LEVEL, lives: SOLO_LIVES - 1, clicked: [], over: false, lostLife: true })
  })

  it('the last life lost ends the run and keeps the wrong tile', () => {
    const s = applyVmSoloTap({ ...startVmSolo(gen), lives: 1 }, 15, gen)
    expect(s).toMatchObject({ over: true, lives: 0, miss: 15 })
  })

  it('ignores repeat taps and taps outside the grid', () => {
    const s = applyVmSoloTap(startVmSolo(gen), 0, gen)
    expect(applyVmSoloTap(s, 0, gen)).toBe(s)
    expect(applyVmSoloTap(s, 99, gen)).toBe(s)
  })
})

describe('Chimp solo', () => {
  const gen = level => firstN(Math.min(level, CHIMP_GRID))

  it('tapping the numbers in order clears the level', () => {
    let s = startChimpSolo(gen)
    for (let i = 0; i < CHIMP_START_LEVEL; i++) s = applyChimpSoloTap(s, i, gen)
    expect(s).toMatchObject({ level: CHIMP_START_LEVEL + 1, progress: 0 })
    expect(chimpSoloScore(s)).toBe(CHIMP_START_LEVEL)
  })

  it('an out-of-order tap costs a life and deals a new layout', () => {
    const s = applyChimpSoloTap(startChimpSolo(gen), 2, gen)
    expect(s).toMatchObject({ lives: SOLO_LIVES - 1, progress: 0, over: false, lostLife: true })
  })

  it('the last life lost ends the run', () => {
    const s = applyChimpSoloTap({ ...startChimpSolo(gen), lives: 1, progress: 1 }, 3, gen)
    expect(s).toMatchObject({ over: true, miss: 3, progress: 1 })
  })

  it('stops growing at a full grid', () => {
    let s = { ...startChimpSolo(gen), level: CHIMP_GRID, layout: gen(CHIMP_GRID) }
    for (let i = 0; i < CHIMP_GRID; i++) s = applyChimpSoloTap(s, i, gen)
    expect(s.level).toBe(CHIMP_GRID)
  })
})

describe('Number Memory solo', () => {
  const gen = level => '7'.repeat(level)

  it('a correct answer adds a digit', () => {
    const s = submitNumberSolo({ ...startNumberSolo(gen), phase: 'recall' }, '7', gen)
    expect(s).toMatchObject({ level: 2, number: '77', phase: 'showing', over: false })
    expect(numberSoloScore(s)).toBe(1)
  })

  it('a wrong answer ends the run and keeps the guess', () => {
    const s = submitNumberSolo({ level: 3, number: '777', phase: 'recall', answer: null, over: false }, '778', gen)
    expect(s).toMatchObject({ over: true, phase: 'over', answer: '778' })
    expect(numberSoloScore(s)).toBe(2)
  })

  it('answers only count during recall', () => {
    const s = startNumberSolo(gen)
    expect(submitNumberSolo(s, '7', gen)).toBe(s)
  })
})
