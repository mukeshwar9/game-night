import { describe, it, expect } from 'vitest'
import { mergeStats } from './statsSync'

describe('mergeStats', () => {
  it('uploads local when remote is absent', () => {
    const local = { games: 3 }
    expect(mergeStats(local, null)).toEqual({ stats: local, action: 'upload' })
  })

  it('is a no-op when both sides are absent', () => {
    expect(mergeStats(null, null)).toEqual({ stats: null, action: 'none' })
  })

  it('pulls remote when local is absent', () => {
    const remote = { games: 5 }
    expect(mergeStats(null, remote)).toEqual({ stats: remote, action: 'pull' })
  })

  it('pulls remote when remote has strictly more games', () => {
    const local = { games: 2 }
    const remote = { games: 7 }
    expect(mergeStats(local, remote)).toEqual({ stats: remote, action: 'pull' })
  })

  it('uploads local when local has strictly more games', () => {
    const local = { games: 9 }
    const remote = { games: 4 }
    expect(mergeStats(local, remote)).toEqual({ stats: local, action: 'upload' })
  })

  it('is a no-op when game counts are equal (never decreases either side)', () => {
    const local = { games: 4 }
    const remote = { games: 4 }
    expect(mergeStats(local, remote)).toEqual({ stats: local, action: 'none' })
  })
})
