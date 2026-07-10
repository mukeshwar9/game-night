import { describe, it, expect } from 'vitest'
import { rankEntries } from './leaderboard'

describe('rankEntries', () => {
  it('sorts by wins desc', () => {
    const ranked = rankEntries([
      { uid: 'a', wins: 3, games: 5 },
      { uid: 'b', wins: 7, games: 10 },
      { uid: 'c', wins: 1, games: 2 },
    ])
    expect(ranked.map(e => e.uid)).toEqual(['b', 'a', 'c'])
    expect(ranked.map(e => e.rank)).toEqual([1, 2, 3])
  })

  it('tiebreaks equal wins by winrate desc', () => {
    const ranked = rankEntries([
      { uid: 'a', wins: 5, games: 20 }, // 25%
      { uid: 'b', wins: 5, games: 10 }, // 50%
    ])
    expect(ranked.map(e => e.uid)).toEqual(['b', 'a'])
  })

  it('tiebreaks equal wins+winrate by games desc', () => {
    const ranked = rankEntries([
      { uid: 'a', wins: 0, games: 0 },
      { uid: 'b', wins: 0, games: 5 },
    ])
    expect(ranked.map(e => e.uid)).toEqual(['b', 'a'])
  })

  it('treats zero games as zero winrate, not NaN or Infinity', () => {
    const ranked = rankEntries([{ uid: 'a', wins: 0, games: 0 }])
    expect(ranked[0].rank).toBe(1)
  })

  it('assigns shared ranks to exact ties, skipping the next rank (1,1,3)', () => {
    const ranked = rankEntries([
      { uid: 'a', wins: 4, games: 8 },
      { uid: 'b', wins: 4, games: 8 },
      { uid: 'c', wins: 2, games: 8 },
    ])
    expect(ranked.map(e => e.rank)).toEqual([1, 1, 3])
  })

  it('ranks friends with no stats (all zero) last, without dropping them', () => {
    const ranked = rankEntries([
      { uid: 'a', wins: 0, games: 0 },
      { uid: 'b', wins: 2, games: 3 },
    ])
    expect(ranked.map(e => e.uid)).toEqual(['b', 'a'])
    expect(ranked).toHaveLength(2)
  })

  it('handles empty input', () => {
    expect(rankEntries([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [{ uid: 'a', wins: 1, games: 1 }, { uid: 'b', wins: 2, games: 2 }]
    const copy = input.map(e => ({ ...e }))
    rankEntries(input)
    expect(input).toEqual(copy)
  })
})
