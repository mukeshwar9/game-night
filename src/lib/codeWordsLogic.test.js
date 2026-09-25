import { describe, it, expect } from 'vitest'
import {
  CW_SIZE, CW_START_CARDS, CW_OTHER_CARDS, CW_NEUTRAL_CARDS, NEUTRAL, ASSASSIN,
  seatOrder, pickBoardWords, teamTargets, layoutFromSeed, deriveKey, verifyCard, verifySeed,
  normalizeRevealed, normalizePicks, normalizeRound, canStartBoard, buildBoard, nextBoardSetup,
  isSpymaster, spymasterIds, readyToDeal, keyHolders, spymastersNeedingSeal, applyDeal,
  validateClue, applyClue, isOnTurnGuesser, canGuess, applyGuess, canPass, endTurn,
  remainingCards, applyReveal, boardScores, tallyWins, normalizeWins, codeWordsPlacements, rosters, sealContext, randomSeed,
} from './codeWordsLogic'
import { CODE_WORDS } from './decks/codewords'
import { overlapsWord } from './wordMatch'
import { generateSealKeyPair, seal, sealKeyId } from './sealed'

const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length] }
const count = (arr, v) => arr.filter(x => x === v).length

const ORDER = ['a', 'b', 'c', 'd']
const TEAMS = { a: 'A', b: 'B', c: 'A', d: 'B' }
const SPY = { A: 'a', B: 'b' }
const WORDS = CODE_WORDS.slice(0, 25)

// A board in the guess phase for team A with a fixed, known layout.
function liveBoard(overrides = {}) {
  const base = buildBoard({ board: 1, nonce: 'n1', teams: TEAMS, spymasters: SPY, startTeam: 'A', words: WORDS })
  return { ...applyDeal(base, { commits: Array(25).fill('h'), sealed: {} }), ...overrides }
}
function withClue(round, number = 2) {
  return applyClue(round, { uid: 'a', word: 'zzyzx', number })
}

describe('seatOrder', () => {
  it('sorts by joinedAt then uid', () => {
    const players = {
      z: { playerId: 'z', joinedAt: 5 }, y: { playerId: 'y', joinedAt: 1 },
      x: { playerId: 'x', joinedAt: 5 }, junk: null,
    }
    expect(seatOrder(players)).toEqual(['y', 'x', 'z'])
  })
})

describe('pickBoardWords', () => {
  it('picks 25 distinct, non-overlapping deck words', () => {
    const { words, indices } = pickBoardWords({})
    expect(words).toHaveLength(CW_SIZE)
    expect(new Set(indices).size).toBe(CW_SIZE)
    words.forEach((w, i) => expect(w).toBe(CODE_WORDS[indices[i]]))
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) expect(overlapsWord(words[i], words[j]), `${words[i]}/${words[j]}`).toBe(false)
    }
  })

  it('avoids words the room has seen while fresh ones remain', () => {
    const seen = Object.fromEntries(CODE_WORDS.slice(0, 200).map((_, i) => [i, i + 1]))
    const { indices } = pickBoardWords(seen)
    expect(indices.every(i => i >= 200)).toBe(true)
  })

  it('still deals a full board when the deck is exhausted', () => {
    const seen = Object.fromEntries(CODE_WORDS.map((_, i) => [i, i + 1]))
    expect(pickBoardWords(seen).indices).toHaveLength(CW_SIZE)
  })

  it('is deterministic for a given rng', () => {
    expect(pickBoardWords({}, seq(0.3, 0.6, 0.1)).indices).toEqual(pickBoardWords({}, seq(0.3, 0.6, 0.1)).indices)
  })
})

describe('layout & key', () => {
  it('gives the starting team 9, the other 8, 7 neutral and 1 assassin', () => {
    for (const start of ['A', 'B']) {
      const layout = layoutFromSeed('f00dfeed', start)
      expect(layout).toHaveLength(CW_SIZE)
      expect(count(layout, start)).toBe(CW_START_CARDS)
      expect(count(layout, start === 'A' ? 'B' : 'A')).toBe(CW_OTHER_CARDS)
      expect(count(layout, NEUTRAL)).toBe(CW_NEUTRAL_CARDS)
      expect(count(layout, ASSASSIN)).toBe(1)
    }
    expect(teamTargets('B')).toEqual({ B: 9, A: 8 })
  })

  it('is deterministic per seed and varies across seeds', () => {
    expect(layoutFromSeed('abc', 'A')).toEqual(layoutFromSeed('abc', 'A'))
    const layouts = new Set(['s1', 's2', 's3', 's4', 's5'].map(s => layoutFromSeed(s, 'A').join('')))
    expect(layouts.size).toBeGreaterThan(1)
  })

  it('derives salted commitments that verify card by card', async () => {
    const { identities, salts, commits } = await deriveKey('0123456789abcdef0123456789abcdef', 'A')
    expect(new Set(commits).size).toBe(CW_SIZE) // salts make equal identities hash apart
    expect(salts.every(s => /^[0-9a-f]{32}$/.test(s))).toBe(true)
    expect(await verifyCard(commits[3], identities[3], salts[3])).toBe(true)
    const lie = identities[3] === ASSASSIN ? NEUTRAL : ASSASSIN
    expect(await verifyCard(commits[3], lie, salts[3])).toBe(false)
    expect(await verifyCard(commits[3], identities[3], salts[4])).toBe(false)
    expect(await verifyCard('', identities[3], salts[3])).toBe(false)
    expect(await verifyCard(commits[3], 'Q', salts[3])).toBe(false)
  })

  it('verifySeed accepts the dealt seed and rejects any other', async () => {
    const seed = 'aa'.repeat(16)
    const { commits } = await deriveKey(seed, 'B')
    expect(await verifySeed(seed, 'B', commits)).toBe(true)
    expect(await verifySeed('bb'.repeat(16), 'B', commits)).toBe(false)
    expect(await verifySeed(seed, 'A', commits)).toBe(false)
    expect(await verifySeed(seed, 'B', commits.slice(1))).toBe(false)
    expect(await verifySeed(null, 'B', commits)).toBe(false)
  })
})

describe('normalizers', () => {
  it('maps revealed cards by explicit index', () => {
    expect(normalizeRevealed({ 3: { t: 'A', s: 'x', by: 'c', team: 'A' }, 30: { t: 'A' }, 5: { t: 'Q' } }))
      .toEqual({ 3: { t: 'A', s: 'x', by: 'c', team: 'A' } })
    const sparse = []
    sparse[7] = { t: ASSASSIN, s: 'y' }
    expect(normalizeRevealed(sparse)[7].t).toBe(ASSASSIN)
    expect(normalizeRevealed(null)).toEqual({})
  })

  it('keeps only in-range picks', () => {
    expect(normalizePicks({ a: 3, b: 25, c: -1, d: '4' })).toEqual({ a: 3, d: 4 })
  })

  it('fills round defaults and fixed-length arrays', () => {
    const r = normalizeRound({ phase: 'clue', words: { 0: 'apple', 24: 'zebra' }, turn: 'B' })
    expect(r.words).toHaveLength(25)
    expect(r.words[0]).toBe('apple')
    expect(r.words[1]).toBe('')
    expect(r.commits).toHaveLength(25)
    expect(r.turn).toBe('B')
    expect(r.clueLog).toEqual([])
    expect(r.pending).toBeNull()
    expect(normalizeRound(null)).toBeNull()
  })
})

describe('board setup', () => {
  it('needs 4+ players and 2 per team', () => {
    expect(canStartBoard(TEAMS, ORDER)).toBe(true)
    expect(canStartBoard({ a: 'A', b: 'B', c: 'A' }, ['a', 'b', 'c'])).toBe(false)
    expect(canStartBoard({ a: 'A', b: 'A', c: 'A', d: 'B' }, ORDER)).toBe(false)
  })

  it('first board: balanced teams, first member spymaster, team A starts', () => {
    expect(nextBoardSetup({ order: ORDER, teams: {} })).toEqual({ teams: TEAMS, spymasters: SPY, startTeam: 'A' })
  })

  it('next board: rotates spymasters and the starting team', () => {
    const setup = nextBoardSetup({ order: ORDER, teams: TEAMS, spymasters: SPY, startTeam: 'A' })
    expect(setup.spymasters).toEqual({ A: 'c', B: 'd' })
    expect(setup.startTeam).toBe('B')
  })

  it('skips offline members when handing out the role', () => {
    const setup = nextBoardSetup({ order: ORDER, teams: TEAMS, spymasters: SPY, startTeam: 'A', isOnline: id => id !== 'c' })
    expect(setup.spymasters.A).toBe('a')
  })

  it('restart (rotate:false) keeps present spymasters', () => {
    expect(nextBoardSetup({ order: ORDER, teams: TEAMS, spymasters: SPY, rotate: false }).spymasters).toEqual(SPY)
  })

  it('builds a keying frame', () => {
    const b = buildBoard({ board: 2, nonce: 'n', teams: TEAMS, spymasters: SPY, startTeam: 'B', words: WORDS })
    expect(b.phase).toBe('keying')
    expect(b.words).toBe(WORDS)
    expect(isSpymaster(b, 'b')).toBe(true)
    expect(isSpymaster(b, 'c')).toBe(false)
    expect(spymasterIds(b)).toEqual(['a', 'b'])
  })
})

describe('keys & sealing', () => {
  const frame = buildBoard({ board: 1, nonce: 'n', teams: TEAMS, spymasters: SPY, startTeam: 'A', words: WORDS })

  it('deals once every online spymaster has a key', () => {
    expect(readyToDeal(frame, {})).toBe(false)
    expect(readyToDeal(frame, { a: 'k' })).toBe(false)
    expect(readyToDeal(frame, { a: 'k' }, id => id !== 'b')).toBe(true)
    expect(readyToDeal(frame, { a: 'k', b: 'k2', c: 'k3' })).toBe(true)
    expect(readyToDeal({ ...frame, spymasters: {} }, { a: 'k' })).toBe(false)
  })

  it('tracks who holds the key and who still needs a box', async () => {
    const ka = await generateSealKeyPair()
    const kb = await generateSealKeyPair()
    const { box: boxA } = await seal(ka.pub, 'seed', 'ctx')
    const keys = { a: ka.pub, b: kb.pub }
    const round = { ...frame, sealed: { a: boxA } }
    expect(keyHolders(round, keys)).toEqual(['a'])
    expect(spymastersNeedingSeal(round, keys)).toEqual(['b'])
    // A reopened tab publishes a new key: the old box no longer counts.
    const fresh = await generateSealKeyPair()
    const moved = { ...keys, a: fresh.pub }
    expect(keyHolders(round, moved)).toEqual([])
    expect(spymastersNeedingSeal(round, moved)).toEqual(['a', 'b'])
    expect(boxA.kid).toBe(sealKeyId(ka.pub))
  })

  it('binds boxes to room, board and recipient', () => {
    expect(sealContext('G1', { nonce: 'n9' }, 'u')).toBe('codewords|G1|n9|u')
  })

  it('draws a fresh 128-bit seed', () => {
    expect(randomSeed()).toMatch(/^[0-9a-f]{32}$/)
    expect(randomSeed()).not.toBe(randomSeed())
  })

  it('applyDeal moves keying → clue with the starting team on turn', () => {
    const dealt = applyDeal(frame, { commits: ['c'], sealed: { a: {} } })
    expect(dealt.phase).toBe('clue')
    expect(dealt.turn).toBe('A')
    expect(applyDeal(dealt, { commits: [], sealed: {} })).toBeNull()
  })
})

describe('clues', () => {
  it('validates one-word, off-board, clean clues with a number', () => {
    expect(validateClue('', 2, WORDS)).toBe('TYPE A CLUE')
    expect(validateClue('ice cream', 2, WORDS)).toBe('ONE WORD ONLY')
    expect(validateClue('a'.repeat(21), 2, WORDS)).toBe('TOO LONG')
    expect(validateClue('shit', 2, WORDS)).toBe('PICK ANOTHER WORD')
    expect(validateClue(WORDS[0].toUpperCase(), 2, WORDS)).toBe("THAT'S ON THE BOARD")
    expect(validateClue(`${WORDS[1]}s`, 2, WORDS)).toBe("THAT'S ON THE BOARD")
    expect(validateClue('zzyzx', 0, WORDS)).toMatch(/^PICK A NUMBER/)
    expect(validateClue('zzyzx', 10, WORDS)).toMatch(/^PICK A NUMBER/)
    expect(validateClue('zzyzx', 2.5, WORDS)).toMatch(/^PICK A NUMBER/)
    expect(validateClue('zzyzx', '3', WORDS)).toBeNull()
  })

  it('only the on-turn spymaster can clue, and it opens number + 1 guesses', () => {
    const r = liveBoard()
    expect(applyClue(r, { uid: 'b', word: 'zzyzx', number: 2 })).toBeNull()
    expect(applyClue(r, { uid: 'c', word: 'zzyzx', number: 2 })).toBeNull()
    expect(applyClue(r, { uid: 'a', word: WORDS[0], number: 2 })).toBeNull()
    const g = withClue(r, 2)
    expect(g.phase).toBe('guess')
    expect(g.clue).toEqual({ word: 'ZZYZX', number: 2, team: 'A', by: 'a' })
    expect(g.guessesLeft).toBe(3)
    expect(g.clueLog).toEqual([{ word: 'ZZYZX', number: 2, team: 'A' }])
    expect(applyClue(g, { uid: 'a', word: 'other', number: 1 })).toBeNull()
  })
})

describe('guessing', () => {
  it('only on-turn non-spymasters guess unrevealed cards', () => {
    const g = withClue(liveBoard())
    expect(isOnTurnGuesser(g, 'c')).toBe(true)
    expect(isOnTurnGuesser(g, 'a')).toBe(false)
    expect(isOnTurnGuesser(g, 'd')).toBe(false)
    expect(canGuess(g, 'c', 4)).toBe(true)
    expect(canGuess(g, 'c', 25)).toBe(false)
    expect(canGuess({ ...g, revealed: { 4: { t: 'A' } } }, 'c', 4)).toBe(false)
    expect(canGuess(liveBoard(), 'c', 4)).toBe(false) // clue phase
  })

  it('a locked guess waits as pending and blocks further guesses', () => {
    const g = withClue(liveBoard({ picks: { c: 4 } }))
    const p = applyGuess({ ...g, picks: { c: 4, x: 1 } }, { uid: 'c', index: 4 })
    expect(p.pending).toEqual({ index: 4, by: 'c', team: 'A' })
    expect(p.picks).toEqual({ x: 1 })
    expect(applyGuess(p, { uid: 'c', index: 5 })).toBeNull()
    expect(canPass(p, 'c')).toBe(false)
  })

  it('passing needs at least one guess this turn', () => {
    const g = withClue(liveBoard())
    expect(canPass(g, 'c')).toBe(false)
    expect(canPass({ ...g, guessesMade: 1 }, 'c')).toBe(true)
    expect(canPass({ ...g, guessesMade: 1 }, 'a')).toBe(false)
  })

  it('endTurn hands the clue to the other team', () => {
    const e = endTurn({ ...withClue(liveBoard()), guessesMade: 1, picks: { c: 1 } })
    expect(e).toMatchObject({ phase: 'clue', turn: 'B', clue: null, guessesLeft: 0, guessesMade: 0, picks: null, pending: null })
  })
})

describe('applyReveal', () => {
  const pendingOn = (round, index, uid = 'c') => applyGuess(round, { uid, index })

  it('ignores a reveal with no matching pending guess', () => {
    const g = withClue(liveBoard())
    expect(applyReveal(g, { index: 0, identity: 'A', salt: 's' })).toBeNull()
    expect(applyReveal(pendingOn(g, 0), { index: 1, identity: 'A', salt: 's' })).toBeNull()
    expect(applyReveal(pendingOn(g, 0), { index: 0, identity: 'Q', salt: 's' })).toBeNull()
  })

  it('own card: records it, uses a guess, keeps the turn', () => {
    const r = applyReveal(pendingOn(withClue(liveBoard(), 2), 0), { index: 0, identity: 'A', salt: 's0' })
    expect(r.outcome).toBe('hit')
    expect(r.round.revealed[0]).toEqual({ t: 'A', s: 's0', by: 'c', team: 'A' })
    expect(r.round).toMatchObject({ phase: 'guess', turn: 'A', guessesLeft: 2, guessesMade: 1, pending: null })
  })

  it('the last allowed guess on an own card ends the turn', () => {
    let round = withClue(liveBoard(), 1) // 2 guesses
    round = applyReveal(pendingOn(round, 0), { index: 0, identity: 'A', salt: 's' }).round
    const r = applyReveal(pendingOn(round, 1), { index: 1, identity: 'A', salt: 's' })
    expect(r.outcome).toBe('hit')
    expect(r.round).toMatchObject({ phase: 'clue', turn: 'B' })
  })

  it('neutral or rival card ends the turn', () => {
    for (const identity of [NEUTRAL, 'B']) {
      const r = applyReveal(pendingOn(withClue(liveBoard(), 3), 2), { index: 2, identity, salt: 's' })
      expect(r.outcome).toBe('miss')
      expect(r.round).toMatchObject({ phase: 'clue', turn: 'B', clue: null })
      expect(r.round.revealed[2].t).toBe(identity)
    }
  })

  it('the assassin loses the board for the guessing team', () => {
    const r = applyReveal(pendingOn(withClue(liveBoard()), 5), { index: 5, identity: ASSASSIN, salt: 's' })
    expect(r.outcome).toBe('assassin')
    expect(r.round).toMatchObject({ phase: 'over', winner: 'B', endReason: 'assassin' })
  })

  it('uncovering a team’s last card wins it the board — even on a rival guess', () => {
    const revealed = {}
    for (let i = 0; i < 7; i++) revealed[10 + i] = { t: 'B', s: 's', by: 'd', team: 'B' }
    const g = withClue(liveBoard({ revealed }))
    expect(remainingCards(g)).toEqual({ A: 9, B: 1 })
    const r = applyReveal(pendingOn(g, 20), { index: 20, identity: 'B', salt: 's' })
    expect(r.outcome).toBe('win')
    expect(r.round).toMatchObject({ phase: 'over', winner: 'B', endReason: 'cards' })
  })

  it('a team clearing all nine cards wins', () => {
    let round = withClue(liveBoard(), 9)
    let res
    for (let i = 0; i < 9; i++) {
      res = applyReveal(pendingOn(round, i), { index: i, identity: 'A', salt: `s${i}` })
      round = res.round
    }
    expect(res.outcome).toBe('win')
    expect(round).toMatchObject({ phase: 'over', winner: 'A', endReason: 'cards' })
    expect(remainingCards(round)).toEqual({ A: 0, B: 8 })
  })
})

describe('scoring & results', () => {
  const over = { teams: TEAMS, winner: 'A' }
  it('scores one board: winners 1, losers 0', () => {
    expect(boardScores(over)).toEqual({ a: 1, b: 0, c: 1, d: 0 })
    expect(boardScores({ teams: TEAMS, winner: null })).toEqual({})
  })

  it('tallies boards won across the match', () => {
    expect(tallyWins({ a: 2, b: 1 }, over)).toEqual({ a: 3, b: 1, c: 1 })
    expect(tallyWins({ a: 2 }, { teams: TEAMS, winner: null })).toEqual({ a: 2 })
    expect(normalizeWins({ a: 2, b: 0, c: 'x', d: '3' })).toEqual({ a: 2, d: 3 })
    expect(normalizeRound({ wins: { a: 1 } }).wins).toEqual({ a: 1 })
  })

  it('places the winners first for the night scoreboard', () => {
    expect(codeWordsPlacements(over)).toEqual([
      { id: 'a', place: 1 }, { id: 'b', place: 2 }, { id: 'c', place: 1 }, { id: 'd', place: 2 },
    ])
    expect(codeWordsPlacements({ teams: TEAMS })).toEqual([])
  })

  it('lists rosters in seat order', () => {
    expect(rosters({ teams: TEAMS }, ['d', 'c', 'b', 'a'])).toEqual({ A: ['c', 'a'], B: ['d', 'b'] })
  })
})
