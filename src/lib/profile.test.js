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

const { getStats, recordMatch, getHeadToHead, formatHeadToHeadLabel, getMatches } = await import('./profile')

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

describe('getHeadToHead', () => {
  beforeEach(() => localStorage.clear())

  it('returns null without opponent uid', () => {
    expect(getHeadToHead(null)).toBeNull()
    expect(getHeadToHead('')).toBeNull()
  })

  it('returns null when no prior matches vs that uid', () => {
    expect(getHeadToHead('uid-1')).toBeNull()
  })

  it('returns win counts after recorded matches', () => {
    recordMatch({ gameType: 'tictactoe', won: true, opponentName: 'Alice', opponentUid: 'uid-1' })
    recordMatch({ gameType: 'tictactoe', won: false, opponentName: 'Alice', opponentUid: 'uid-1' })
    expect(getHeadToHead('uid-1')).toEqual({ myWins: 1, theirWins: 1 })
  })
})

describe('match history (getMatches / recordMatch)', () => {
  beforeEach(() => localStorage.clear())

  it('appends newest match first', () => {
    recordMatch({ gameType: 'tictactoe', won: true, opponentName: 'Alice', opponentUid: 'uid-1', opponentAvatar: 'invader-1' })
    recordMatch({ gameType: 'connectfour', won: false, opponentName: 'Bob', opponentUid: 'uid-2', opponentAvatar: 'robot-2' })
    const matches = getMatches()
    expect(matches).toHaveLength(2)
    expect(matches[0].gameType).toBe('connectfour')
    expect(matches[1].gameType).toBe('tictactoe')
  })

  it('records the full entry shape', () => {
    recordMatch({ gameType: 'sos', won: true, opponentName: 'Alice', opponentUid: 'uid-1', opponentAvatar: 'invader-1' })
    const [m] = getMatches()
    expect(m).toMatchObject({
      gameType: 'sos',
      won: true,
      opponentName: 'Alice',
      opponentUid: 'uid-1',
      opponentAvatar: 'invader-1',
    })
    expect(typeof m.ts).toBe('number')
  })

  it('defaults opponentAvatar to null when omitted (legacy call sites)', () => {
    recordMatch({ gameType: 'tictactoe', won: false, opponentName: 'Bob' })
    expect(getMatches()[0].opponentAvatar).toBeNull()
  })

  it('caps history at 50 entries, dropping the oldest', () => {
    for (let i = 0; i < 55; i++) {
      recordMatch({ gameType: 'tictactoe', won: true, opponentName: `P${i}`, opponentUid: `uid-${i}` })
    }
    const matches = getMatches()
    expect(matches).toHaveLength(50)
    expect(matches[0].opponentUid).toBe('uid-54')
    expect(matches[49].opponentUid).toBe('uid-5')
  })

  it('getMatches returns [] when nothing recorded or storage is corrupt', () => {
    expect(getMatches()).toEqual([])
    localStorage.setItem('gn-matches', 'not json')
    expect(getMatches()).toEqual([])
  })
})

describe('formatHeadToHeadLabel', () => {
  it('formats lead, behind, and tied copy', () => {
    expect(formatHeadToHeadLabel(7, 4)).toBe('YOU LEAD 7–4')
    expect(formatHeadToHeadLabel(3, 5)).toBe('THEY LEAD 5–3')
    expect(formatHeadToHeadLabel(2, 2)).toBe('SERIES TIED 2–2')
  })
})
