// Per-game `round` rules (codewords/justone/party-a handoffs). Each rule is
// gated on the room's gameType, so another game that reuses a key name
// (`clues`, `order`, `guess`…) keeps its own shape.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, partyNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const room = (gameType, round, extra = {}) => ({ ...partyNode({ uids: ['alice', 'bob', 'carol'], gameType, status: 'playing' }), round, ...extra })
const put = (value) => seed(T.env, 'games/g1', value)
const H64 = 'a'.repeat(64)
const H32 = 'b'.repeat(32)
const box = { epk: 'E'.repeat(88), iv: 'I'.repeat(16), ct: 'C'.repeat(200), kid: 'K'.repeat(16) }

describe('Code Words', () => {
  const board = (over = {}) => ({
    phase: 'guess', board: 1, nonce: 'abcdef012345', turn: 'A', startTeam: 'A',
    teams: { alice: 'A', bob: 'A', carol: 'B' }, spymasters: { A: 'alice', B: 'carol' },
    commits: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i, H64])),
    words: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i, 'word'])),
    sealed: { alice: box, carol: box },
    clue: { word: 'OCEAN', number: 2, team: 'A', by: 'alice' },
    guessesLeft: 3, guessesMade: 0,
    ...over,
  })

  it('lets a guesser point with their own pick only', async () => {
    await put(room('codewords', board({ picks: { carol: 4 } })))
    await assertSucceeds(as('bob').ref('games/g1/round/picks').update({ bob: 7 }))
    await assertFails(as('bob').ref('games/g1/round/picks').update({ carol: 8 }))
    await assertFails(as('bob').ref('games/g1/round/picks').update({ bob: 25 }))
  })

  it('lets a guess be locked in only by its guesser', async () => {
    await put(room('codewords', board()))
    await assertFails(as('alice').ref('games/g1/round/pending').set({ index: 3, by: 'bob', team: 'A' }))
    await assertSucceeds(as('bob').ref('games/g1/round/pending').set({ index: 3, by: 'bob', team: 'A' }))
  })

  it('never lets a revealed card or a card commitment change', async () => {
    await put(room('codewords', board({ revealed: { 3: { t: 'A', s: H32, by: 'bob', team: 'A' } } })))
    await assertFails(as('alice').ref('games/g1/round/revealed/3/t').set('X'))
    await assertFails(as('alice').ref('games/g1/round/commits/5').set('c'.repeat(64)))
    await assertSucceeds(as('alice').ref('games/g1/round/revealed/4').set({ t: 'N', s: H32, by: 'bob', team: 'A' }))
    await assertFails(as('alice').ref('games/g1/round/revealed/25').set({ t: 'N', s: H32 }))
  })

  it('lets a whole-room write (next board) replace the round wholesale', async () => {
    const r = room('codewords', board({ revealed: { 3: { t: 'A', s: H32, by: 'bob', team: 'A' } }, picks: { bob: 2 } }))
    await put(r)
    await assertSucceeds(as('carol').ref('games/g1').set({ ...r, round: { ...board({ board: 2 }), commits: null, phase: 'keying' } }))
  })

  it('checks words and sealed boxes', async () => {
    await put(room('codewords', board()))
    await assertFails(as('alice').ref('games/g1/round/words/0').set('NOT LOWER'))
    await assertFails(as('alice').ref('games/g1/round/sealed/bob').set({ ...box, extra: 1 }))
  })
})

describe('Just One', () => {
  const card = (over = {}) => ({
    phase: 'clues', nonce: 'abcdef012345', card: 1, played: 0, score: 0, guesser: 'alice',
    order: { 0: 'alice', 1: 'bob', 2: 'carol' }, wordCommit: H64, sealed: { bob: box, carol: box },
    ...over,
  })

  it('lets each clue-giver commit their own clue once', async () => {
    await put(room('justone', card({ clues: { carol: { h: H64 } } })))
    await assertSucceeds(as('bob').ref('games/g1/round/clues/bob').set({ h: H64 }))
    await assertFails(as('bob').ref('games/g1/round/clues/carol').set({ h: 'c'.repeat(64) }))
    await assertFails(as('carol').ref('games/g1/round/clues/carol').set({ h: 'c'.repeat(64) }))
  })

  it('lets each clue-giver publish only their own encrypted clue', async () => {
    await put(room('justone', card({ phase: 'compare', clues: { bob: { h: H64 } } })))
    await assertSucceeds(as('bob').ref('games/g1/round/enc/bob').set({ iv: 'I'.repeat(16), ct: 'C'.repeat(120) }))
    await assertFails(as('bob').ref('games/g1/round/enc/carol').set({ iv: 'I'.repeat(16), ct: 'C'.repeat(120) }))
  })

  it('lets only the guesser make the guess', async () => {
    await put(room('justone', card({ phase: 'guess' })))
    await assertFails(as('bob').ref('games/g1/round').update({ guess: { text: 'ocean' }, phase: 'judging' }))
    await assertSucceeds(as('alice').ref('games/g1/round').update({ guess: { text: 'ocean' }, phase: 'judging' }))
  })

  it('keeps the word commitment fixed within a card', async () => {
    await put(room('justone', card()))
    await assertFails(as('bob').ref('games/g1/round/wordCommit').set('c'.repeat(64)))
    await assertSucceeds(as('bob').ref('games/g1/round').update({ card: 2, wordCommit: 'c'.repeat(64) }))
  })
})

describe('Herd Mind', () => {
  const r = (over = {}) => ({ phase: 'answering', deckSeed: 12, promptIndex: 0, startedAt: 1, endsAt: 2, ...over })

  it('lets each player write only their own answer commitment and reveal', async () => {
    await put(room('herd', r({ answers: { carol: { commit: H64 } } })))
    await assertSucceeds(as('bob').ref('games/g1/round/answers').update({ bob: { commit: H64 } }))
    await assertFails(as('bob').ref('games/g1/round/answers').update({ carol: { commit: 'c'.repeat(64) } }))
    await assertSucceeds(as('bob').ref('games/g1/round/reveals').update({ bob: { text: 'pizza', salt: H32 } }))
    await assertFails(as('bob').ref('games/g1/round/reveals').update({ carol: { text: 'pizza', salt: H32 } }))
  })

  it('lets the coordinator score the round in one transaction', async () => {
    const before = room('herd', r({ phase: 'reveal', answers: { alice: { commit: H64 }, bob: { commit: H64 } }, reveals: { alice: { text: 'pizza', salt: H32 }, bob: { text: 'pie', salt: H32 } } }))
    await put(before)
    await assertSucceeds(as('carol').ref('games/g1').set({
      ...before, scores: { alice: 1 },
      round: { ...before.round, scored: true, tally: { alice: 'pizza', bob: 'pie' }, cheats: null, cowTo: 'bob', cowMoved: true },
    }))
  })
})

describe('Spyfair and Chameleon', () => {
  const r = (over = {}) => ({ id: 'r1', phase: 'vote', participants: { 0: 'alice', 1: 'bob', 2: 'carol' }, sealed: { alice: box, bob: box, carol: box }, ...over })

  it('lets each player vote once, as themselves', async () => {
    await put(room('spyfair', r({ votes: { carol: 'alice' } })))
    await assertSucceeds(as('bob').ref('games/g1/round/votes/bob').set('carol'))
    await assertFails(as('bob').ref('games/g1/round/votes/bob').set('alice'))
    await assertFails(as('bob').ref('games/g1/round/votes/carol').set('bob'))
  })

  it('lets the spy lock one location guess, only as themselves, never changed', async () => {
    await put(room('spyfair', r({ phase: 'questioning' })))
    await assertFails(as('bob').ref('games/g1/round/spyGuess').set({ by: 'carol', index: 3 }))
    await assertFails(as('bob').ref('games/g1/round/spyGuess').set({ by: 'bob', index: 'x' }))
    await assertSucceeds(as('bob').ref('games/g1/round/spyGuess').set({ by: 'bob', index: 3 }))
    await assertFails(as('bob').ref('games/g1/round/spyGuess').set({ by: 'bob', index: 4 }))
    await assertSucceeds(as('carol').ref('games/g1/round/phase').set('tally'))
  })

  it('publishes each reveal key once (player or dealer), never swapped', async () => {
    await put(room('chameleon', r({ phase: 'reveal', openKeys: { bob: 'K'.repeat(44) } })))
    await assertSucceeds(as('alice').ref('games/g1/round/openKeys/carol').set('K'.repeat(44)))
    await assertSucceeds(as('bob').ref('games/g1/round/openKeys/bob').set('K'.repeat(44)))
    await assertFails(as('alice').ref('games/g1/round/openKeys/bob').set('Z'.repeat(44)))
  })
})

describe('Trivia and Fibbage', () => {
  it('keeps Trivia order, streaks and deltas numeric', async () => {
    await put(room('trivia', { phase: 'question', qNum: 0, order: { 0: 4, 1: 9 } }))
    await assertSucceeds(as('alice').ref('games/g1/round').update({ streaks: { alice: 2 }, deltas: { alice: 900 } }))
    await assertFails(as('alice').ref('games/g1/round/order/2').set('x'))
  })

  it('keeps Fibbage timing and deltas numeric', async () => {
    await put(room('fibbage', { phase: 'lying', num: 0, deckSeed: 5, order: { 0: 3 } }))
    await assertSucceeds(as('alice').ref('games/g1/round').update({ lieStartedAt: 5, voteStartedAt: 6, deltas: { bob: 1000 } }))
    await assertFails(as('alice').ref('games/g1/round/num').set('two'))
  })
})

describe('gating', () => {
  it('leaves other games’ same-named round keys alone', async () => {
    // Chameleon keys clues by uid with text; Just One's hash rule must not apply.
    await put(room('chameleon', { phase: 'clues', order: { 0: 'alice' } }))
    await assertSucceeds(as('alice').ref('games/g1/round/clues/bob').set({ text: 'salty' }))
    await assertSucceeds(as('alice').ref('games/g1/round/guess').set(3))
  })

  it('still keeps strangers out of every round', async () => {
    await put(room('chameleon', { phase: 'clues' }))
    await assertFails(as('mallory').ref('games/g1/round/clues/mallory').set({ text: 'x' }))
  })
})
