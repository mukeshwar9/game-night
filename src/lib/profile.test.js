import { describe, it, expect, beforeEach } from 'vitest'

// profile.js reads/writes localStorage directly and this suite runs outside a
// DOM environment (see gameSearch.test.js) — install a minimal stateful
// in-memory stub so recordMatch's read-modify-write round-trips are testable.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  }
}

const { getStats, recordMatch } = await import('./profile')

describe('recordMatch', () => {
  beforeEach(() => localStorage.clear())

  it('accumulates games/wins/losses/streak', () => {
    recordMatch({ gameType: 'tictactoe', won: true, opponentName: 'Alice' })
    recordMatch({ gameType: 'tictactoe', won: true, opponentName: 'Alice' })
    const s = recordMatch({ gameType: 'tictactoe', won: false, opponentName: 'Alice' })
    expect(s.games).toBe(3)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.streak).toBe(0)
    expect(s.bestStreak).toBe(2)
  })

  it('keys head-to-head by opponentUid and stores the display name as a label', () => {
    const s = recordMatch({ gameType: 'tictactoe', won: true, opponentName: 'Alice', opponentUid: 'uid-1' })
    expect(s.vs['uid-1']).toEqual({ w: 1, l: 0, name: 'Alice' })
    expect(s.vs.Alice).toBeUndefined()
  })

  it('falls back to name-keyed entries when opponentUid is absent (legacy call sites)', () => {
    const s = recordMatch({ gameType: 'tictactoe', won: false, opponentName: 'Bob' })
    expect(s.vs.Bob).toEqual({ w: 0, l: 1 })
  })

  it('accumulates wins/losses under the same uid across renames', () => {
    recordMatch({ gameType: 'tictactoe', won: true, opponentName: 'Alice', opponentUid: 'uid-1' })
    const s = recordMatch({ gameType: 'tictactoe', won: false, opponentName: 'Alicia', opponentUid: 'uid-1' })
    expect(s.vs['uid-1']).toEqual({ w: 1, l: 1, name: 'Alicia' })
  })

  it('persists to localStorage between calls', () => {
    recordMatch({ gameType: 'connectfour', won: true, opponentName: 'Alice', opponentUid: 'uid-1' })
    expect(getStats().games).toBe(1)
    expect(getStats().byGame.connectfour).toEqual({ w: 1, l: 0 })
  })
})
