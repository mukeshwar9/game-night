import { describe, it, expect } from 'vitest'
import { titleForPath } from './routeTitle'

describe('titleForPath', () => {
  it('titles the main pages', () => {
    expect(titleForPath('/')).toMatch(/quick games with friends/)
    expect(titleForPath('/games')).toBe('All games — Game Night')
    expect(titleForPath('/online/')).toBe('Find an opponent — Game Night')
  })
  it('names the game on solo, local and play links', () => {
    expect(titleForPath('/solo/connectfour')).toBe('Connect four vs the CPU — Game Night')
    expect(titleForPath('/local/dotsandboxes')).toBe('Dots & boxes — pass and play — Game Night')
    expect(titleForPath('/play/battleship')).toBe('Battleship vs the CPU — Game Night')
  })
  it('calls a memory solo run a solo run, not a CPU game', () => {
    expect(titleForPath('/solo/numbermemory')).toBe('Number memory — solo run — Game Night')
    expect(titleForPath('/solo/simon')).toBe('Simon — solo run — Game Night')
    expect(titleForPath('/demo')).toBe('Play solo — Game Night')
    expect(titleForPath('/daily/memory')).toBe('Daily memory — Game Night')
  })
  it('falls back to the brand for rooms, unknown games and junk', () => {
    expect(titleForPath('/game/ABC123')).toBe('Game Night')
    expect(titleForPath('/solo/not-a-game')).toBe('Game Night')
    expect(titleForPath('/nowhere')).toBe('Game Night')
  })
})
