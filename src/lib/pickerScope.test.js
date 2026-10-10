import { describe, it, expect, beforeAll } from 'vitest'

// games.js pulls in modules that touch `localStorage` at load (see
// gameSearch.test.js) — stub it before the dynamic import.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let makePickerScope, searchGames, GAME_TYPES
beforeAll(async () => {
  ;({ makePickerScope } = await import('./pickerScope'))
  ;({ searchGames } = await import('./gameSearch'))
  ;({ GAME_TYPES } = await import('./games'))
})

const gridTypes = (scope) => GAME_TYPES.filter(t => !scope.isHidden(t)).map(t => t.type)
const searchTypes = (scope, query) => searchGames(query, { excludePredicate: scope.isOffLimits }).map(t => t.type)

describe('makePickerScope — solo allow-list', () => {
  const SOLO = ['tictactoe', 'ultimatettt', 'tictactoe4', 'connectfour', 'simon', 'pong']

  it('lists only allowed base games in the grid', () => {
    const scope = makePickerScope({ allowTypes: SOLO })
    expect(gridTypes(scope).sort()).toEqual(['connectfour', 'pong', 'simon', 'tictactoe'])
  })

  it('offers only allowed variants under MODES', () => {
    const scope = makePickerScope({ allowTypes: SOLO })
    expect(scope.variantsFor('tictactoe').map(t => t.type).sort()).toEqual(['tictactoe4', 'ultimatettt'])
    // connectfour has variants (five, pop out), none allowed here.
    expect(scope.variantsFor('connectfour')).toEqual([])
  })

  it('search finds allowed games and variants by name, nothing else', () => {
    const scope = makePickerScope({ allowTypes: SOLO })
    expect(searchTypes(scope, 'ultimate')).toEqual(['ultimatettt'])
    expect(searchTypes(scope, 'connect')).toEqual(['connectfour'])
    // Word Duel exists in the registry but is not in the allow-list.
    expect(searchGames('word duel').length).toBeGreaterThan(0)
    expect(searchTypes(scope, 'word duel')).toEqual([])
  })

  it('ignores the seat-family rule — solo lists 2P and party-family games alike', () => {
    const party = GAME_TYPES.find(t => t.nPlayer && !t.variantOf)
    const scope = makePickerScope({ allowTypes: ['tictactoe', party.type] })
    expect(gridTypes(scope).sort()).toEqual(['tictactoe', party.type].sort())
  })
})

describe('makePickerScope — room switching (unchanged)', () => {
  it('hides the current game and the other seat family', () => {
    const scope = makePickerScope({ excludeType: 'tictactoe' })
    const types = gridTypes(scope)
    expect(types).not.toContain('tictactoe')
    expect(types).toContain('connectfour')
    expect(GAME_TYPES.filter(t => types.includes(t.type)).every(t => !t.nPlayer)).toBe(true)
    expect(types.some(t => GAME_TYPES.find(g => g.type === t).variantOf)).toBe(false)
  })

  it('crossFamily (game night) lists both families', () => {
    const scope = makePickerScope({ excludeType: 'tictactoe', crossFamily: true })
    const types = gridTypes(scope)
    expect(GAME_TYPES.some(t => t.nPlayer && types.includes(t.type))).toBe(true)
  })

  it('search skips the current game', () => {
    const scope = makePickerScope({ excludeType: 'ultimatettt' })
    expect(searchTypes(scope, 'ultimate')).toEqual([])
    expect(searchTypes(scope, 'tic tac')).toContain('tictactoe')
  })

  it('no options shows every base game', () => {
    const scope = makePickerScope()
    expect(gridTypes(scope).length).toBe(GAME_TYPES.filter(t => !t.variantOf).length)
  })
})
