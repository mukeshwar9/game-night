import { describe, it, expect } from 'vitest'
import { autoView } from './useBattleshipView'

describe('autoView', () => {
  it('shows your waters while deploying', () => {
    expect(autoView({ phase: 'placing', myTurn: false })).toBe('fleet')
  })
  it('follows whose shot it is during battle', () => {
    expect(autoView({ phase: 'battle', myTurn: true })).toBe('target')
    expect(autoView({ phase: 'battle', myTurn: false })).toBe('fleet')
  })
  it('shows the targeting grid for the reveal and the end', () => {
    expect(autoView({ phase: 'reveal', myTurn: false })).toBe('target')
    expect(autoView({ phase: 'done', myTurn: false })).toBe('target')
  })
})
