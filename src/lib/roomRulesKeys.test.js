import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// games.js pulls in board components that touch `localStorage` at module load.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

// database.rules.json lets a room hold only known top-level keys (the `$other`
// pattern under games/$gameId). A game whose fresh state writes a key that is
// missing there would fail every start with permission_denied, so this walks the
// registry and fails first.
const rules = JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8')).rules
const room = rules.games.$gameId
const pattern = room.$other['.validate'].match(/^\$other\.matches\(\/(.*)\/\)$/)[1]
const allowed = key => Object.hasOwn(room, key) || new RegExp(pattern).test(key)

let GAME_TYPES, freshGameState
beforeAll(async () => { ;({ GAME_TYPES, freshGameState } = await import('./games')) })

describe('room keys accepted by the rules', () => {
  it('cover every key freshGameState writes, for every game', () => {
    const missing = new Set()
    for (const game of GAME_TYPES) {
      for (const key of Object.keys(freshGameState(game.type))) if (!allowed(key)) missing.add(`${game.type}:${key}`)
    }
    expect([...missing]).toEqual([])
  })

  it('cover the room-level keys the shell writes', () => {
    const shell = ['status', 'winner', 'winningLine', 'scores', 'players', 'presence', 'spectators', 'queue', 'chatLog', 'emote', 'proposal',
      'lastActivityAt', 'createdAt', 'visibility', 'hostUid', 'locked', 'partyRoom', 'night', 'kicked', 'timerScale', 'seen', 'sealKeys',
      'starter', 'goesFirst', 'currentTurn', 'board', 'boxes', 'round', 'signaling', 'hangwomanAnyWord', 'matchLength', 'lobby',
      'removed', 'partyCap']
    expect(shell.filter(key => !allowed(key))).toEqual([])
  })

  it('reject an unknown key', () => {
    expect(allowed('junk')).toBe(false)
    expect(allowed('__proto__')).toBe(false)
  })
})
