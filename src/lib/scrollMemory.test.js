import { describe, it, expect } from 'vitest'
import { createScrollMemory, scrollTargetFor } from './scrollMemory'

describe('scrollTargetFor', () => {
  it('returns to the saved offset only when going back or forward', () => {
    expect(scrollTargetFor('POP', 840)).toBe(840)
    expect(scrollTargetFor('PUSH', 840)).toBe(0)
    expect(scrollTargetFor('REPLACE', 840)).toBe(0)
    expect(scrollTargetFor('POP', undefined)).toBe(0)
  })
})

describe('createScrollMemory', () => {
  it('keeps the latest offset per history entry', () => {
    const m = createScrollMemory()
    m.save('a', 120.6)
    m.save('a', 300)
    m.save('b', -5)
    expect(m.get('a')).toBe(300)
    expect(m.get('b')).toBe(0)
    expect(m.get('missing')).toBeUndefined()
  })

  it('forgets the oldest entries past its limit', () => {
    const m = createScrollMemory(2)
    m.save('a', 1); m.save('b', 2); m.save('c', 3)
    expect(m.size()).toBe(2)
    expect(m.get('a')).toBeUndefined()
    expect(m.get('c')).toBe(3)
  })
})
