import { describe, it, expect } from 'vitest'
import { rollFaces } from './diceLogic'
import {
  BOXES, DICE, ROLLS_PER_TURN, UPPER_BONUS, UPPER_BONUS_AT, FULL_HOUSE_PTS, SHORT_RUN_PTS, LONG_RUN_PTS, YACHT_PTS,
  scoreBox, sheetTotals, sheetFull, bestBox, normalizeSheet, normalizeRound, createRound, turnOwner,
  pendingRoll, canRoll, resolveRoll, lastRollMatches, toggleHold, scoreTurn, skipTurn, winnerOf,
  botHolds, botBox, BOT_LEVELS,
} from './yachtLogic'

const SEED = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const fresh = (seats = ['a', 'b']) => createRound(seats, SEED)
// Ask for a roll at server time `at` and resolve it.
const roll = (round, at = 1000) => resolveRoll({ ...round, yReq: { i: round.yRollIndex, by: turnOwner(round), at } })
const fullSheet = (v = 1) => Object.fromEntries(BOXES.map((b) => [b.id, v]))

describe('scoreBox', () => {
  it('scores the number boxes as the sum of that face', () => {
    expect(scoreBox('fours', [4, 4, 2, 4, 6])).toBe(12)
    expect(scoreBox('ones', [4, 4, 2, 4, 6])).toBe(0)
    expect(scoreBox('sixes', [6, 6, 6, 6, 6])).toBe(30)
  })

  it('scores of-a-kind as the sum of all five dice', () => {
    expect(scoreBox('k3', [4, 4, 2, 4, 6])).toBe(20)
    expect(scoreBox('k3', [4, 4, 2, 3, 6])).toBe(0)
    expect(scoreBox('k4', [5, 5, 5, 5, 2])).toBe(22)
    expect(scoreBox('k4', [5, 5, 5, 3, 2])).toBe(0)
    // Five of a kind still counts as three and four of a kind.
    expect(scoreBox('k4', [2, 2, 2, 2, 2])).toBe(10)
  })

  it('scores the fixed boxes', () => {
    expect(scoreBox('fh', [3, 3, 5, 5, 5])).toBe(FULL_HOUSE_PTS)
    expect(scoreBox('fh', [3, 3, 3, 3, 5])).toBe(0)
    // Five of a kind is not a full house.
    expect(scoreBox('fh', [5, 5, 5, 5, 5])).toBe(0)
    expect(scoreBox('sr', [1, 2, 3, 4, 6])).toBe(SHORT_RUN_PTS)
    expect(scoreBox('sr', [3, 4, 5, 6, 6])).toBe(SHORT_RUN_PTS)
    expect(scoreBox('sr', [1, 2, 3, 5, 6])).toBe(0)
    expect(scoreBox('lr', [2, 3, 4, 5, 6])).toBe(LONG_RUN_PTS)
    expect(scoreBox('lr', [1, 2, 3, 4, 6])).toBe(0)
    expect(scoreBox('y', [6, 6, 6, 6, 6])).toBe(YACHT_PTS)
    expect(scoreBox('y', [6, 6, 6, 6, 5])).toBe(0)
    expect(scoreBox('ch', [1, 2, 3, 4, 6])).toBe(16)
  })

  it('scores nothing for dice that have not been rolled or an unknown box', () => {
    expect(scoreBox('ch', [0, 0, 0, 0, 0])).toBe(0)
    expect(scoreBox('ch', [1, 2, 3])).toBe(0)
    expect(scoreBox('nope', [1, 2, 3, 4, 5])).toBe(0)
  })
})

describe('sheets', () => {
  it('adds the bonus once the number boxes reach the threshold', () => {
    const at = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }
    expect(sheetTotals(at)).toMatchObject({ upper: UPPER_BONUS_AT, bonus: UPPER_BONUS, total: UPPER_BONUS_AT + UPPER_BONUS })
    expect(sheetTotals({ ...at, ones: 2 })).toMatchObject({ upper: 62, bonus: 0, total: 62 })
    expect(sheetTotals({ ...at, ch: 20 }).total).toBe(UPPER_BONUS_AT + UPPER_BONUS + 20)
  })

  it('treats a missing or junk sheet as empty', () => {
    expect(normalizeSheet(undefined)).toEqual({})
    expect(normalizeSheet({ ones: 3, bogus: 9, twos: 'x' })).toEqual({ ones: 3 })
    expect(sheetTotals(null)).toEqual({ upper: 0, bonus: 0, total: 0, filled: 0 })
    expect(sheetFull(fullSheet())).toBe(true)
    expect(sheetFull({ ones: 1 })).toBe(false)
  })

  it('finds the best open box, and none when everything open scores 0', () => {
    expect(bestBox({}, [6, 6, 6, 6, 6])).toBe('y')
    expect(bestBox({ y: 0 }, [6, 6, 6, 6, 6])).toBe('sixes')
    const rest = Object.fromEntries(BOXES.filter((b) => b.id !== 'ones').map((b) => [b.id, 0]))
    expect(bestBox(rest, [6, 6, 6, 6, 6])).toBe(null)
  })
})

describe('normalizeRound', () => {
  it('rebuilds fixed-length arrays from the sparse object Firebase returns', () => {
    const r = normalizeRound({ ySeats: { 0: 'a', 1: 'b' }, yDice: { 3: 5 }, yHeld: { 1: 1 }, yTurn: 1 })
    expect(r.seats).toEqual(['a', 'b'])
    expect(r.dice).toEqual([0, 0, 0, 5, 0])
    expect(r.held).toEqual([0, 1, 0, 0, 0])
    expect(r.turn).toBe(1)
    expect(r.rollsLeft).toBe(ROLLS_PER_TURN)
    expect(r.sheets).toEqual({ a: {}, b: {} })
  })

  it('returns null for a room with no Yacht round', () => {
    expect(normalizeRound(null)).toBe(null)
    expect(normalizeRound({ stats: {} })).toBe(null)
  })
})

describe('rolling', () => {
  it('only the player to move may roll, and not while a roll is pending', () => {
    const r = fresh()
    expect(canRoll(r, 'a')).toBe(true)
    expect(canRoll(r, 'b')).toBe(false)
    const asked = { ...r, yReq: { i: 0, by: 'a', at: 1000 } }
    expect(pendingRoll(asked)).toMatchObject({ i: 0, at: 1000 })
    expect(canRoll(asked, 'a')).toBe(false)
  })

  it('ignores a request that does not fit the round', () => {
    const r = fresh()
    expect(pendingRoll({ ...r, yReq: { i: 3, by: 'a', at: 1000 } })).toBe(null)
    expect(pendingRoll({ ...r, yReq: { i: 0, by: 'b', at: 1000 } })).toBe(null)
    // The server has not stamped the time yet.
    expect(pendingRoll({ ...r, yReq: { i: 0, by: 'a', at: { '.sv': 'timestamp' } } })).toBe(null)
    expect(resolveRoll(r)).toBe(null)
  })

  it('takes every face from the seed, the roll number and the server time', () => {
    const r = roll(fresh(), 4242)
    expect(r.yDice).toEqual(rollFaces(SEED, 0, 4242, DICE))
    expect(r.yRollsLeft).toBe(ROLLS_PER_TURN - 1)
    expect(r.yRollIndex).toBe(1)
    expect(r.yReq).toBe(null)
    expect(roll(fresh(), 4243).yDice).not.toEqual(r.yDice)
  })

  it('keeps held dice and rerolls the rest', () => {
    let r = roll(fresh(), 1000)
    const first = r.yDice.slice()
    r = toggleHold(r, 'a', 0)
    r = toggleHold(r, 'a', 3)
    const next = roll(r, 2000)
    const faces = rollFaces(SEED, 1, 2000, DICE)
    expect(next.yDice).toEqual([first[0], faces[1], faces[2], first[3], faces[4]])
    expect(next.yHeld).toEqual([1, 0, 0, 1, 0])
  })

  it('allows three rolls a turn and no more', () => {
    let r = fresh()
    for (let i = 0; i < ROLLS_PER_TURN; i++) { expect(canRoll(r, 'a')).toBe(true); r = roll(r, 1000 + i) }
    expect(r.yRollsLeft).toBe(0)
    expect(canRoll(r, 'a')).toBe(false)
    expect(resolveRoll({ ...r, yReq: { i: r.yRollIndex, by: 'a', at: 9 } })).toBe(null)
  })

  it('has nothing to roll when every die is held', () => {
    let r = roll(fresh(), 1000)
    for (let k = 0; k < DICE; k++) r = toggleHold(r, 'a', k)
    expect(canRoll(r, 'a')).toBe(false)
  })

  it('verifies a fair roll and catches dice that were swapped', () => {
    const before = toggleHold(roll(fresh(), 1000), 'a', 2)
    const after = roll(before, 2000)
    expect(lastRollMatches(after, before)).toBe(true)
    const cheat = { ...after, yDice: [6, 6, 6, 6, 6] }
    expect(lastRollMatches(cheat, before)).toBe(false)
    // A held die must be the one that was on the table.
    const swapped = { ...after, yDice: after.yDice.map((v, k) => (k === 2 ? (v % 6) + 1 : v)) }
    expect(lastRollMatches(swapped, before)).toBe(false)
    expect(lastRollMatches(before, before)).toBe(null)
  })
})

describe('holding', () => {
  it('only works between rolls, for the player to move', () => {
    const r = fresh()
    expect(toggleHold(r, 'a', 0)).toBe(null)            // nothing rolled yet
    const rolled = roll(r)
    expect(toggleHold(rolled, 'b', 0)).toBe(null)       // not their turn
    expect(toggleHold(rolled, 'a', 9)).toBe(null)
    const held = toggleHold(rolled, 'a', 1)
    expect(held.yHeld).toEqual([0, 1, 0, 0, 0])
    expect(toggleHold(held, 'a', 1).yHeld).toEqual([0, 0, 0, 0, 0])
    let last = rolled
    last = roll(roll(last, 2), 3)
    expect(toggleHold(last, 'a', 0)).toBe(null)         // no rolls left
  })
})

describe('scoring a box', () => {
  it('banks the dice, resets the table and passes the turn', () => {
    const rolled = roll(fresh(), 1000)
    const res = scoreTurn(rolled, 'a', 'ch')
    const sum = rolled.yDice.reduce((s, v) => s + v, 0)
    expect(res.result).toBe(null)
    expect(res.round.ySheets.a).toEqual({ ch: sum })
    expect(res.round.yLast).toEqual({ by: 'a', box: 'ch', pts: sum })
    expect(res.round.yDice).toEqual([0, 0, 0, 0, 0])
    expect(res.round.yRollsLeft).toBe(ROLLS_PER_TURN)
    expect(turnOwner(res.round)).toBe('b')
  })

  it('refuses a box before the first roll, a used box, and the wrong player', () => {
    const r = fresh()
    expect(scoreTurn(r, 'a', 'ch')).toBe(null)
    const rolled = roll(r)
    expect(scoreTurn(rolled, 'b', 'ch')).toBe(null)
    expect(scoreTurn(rolled, 'a', 'nope')).toBe(null)
    const used = { ...rolled, ySheets: { a: { ch: 9 } } }
    expect(scoreTurn(used, 'a', 'ch')).toBe(null)
  })

  it('lets a player take a 0 in a box that does not fit', () => {
    const rolled = { ...roll(fresh()), yDice: [1, 2, 3, 4, 6] }
    expect(scoreTurn(rolled, 'a', 'y').round.ySheets.a).toEqual({ y: 0 })
  })

  it('cycles through three and four players', () => {
    let r = fresh(['a', 'b', 'c', 'd'])
    for (const uid of ['a', 'b', 'c', 'd', 'a']) {
      expect(turnOwner(r)).toBe(uid)
      r = scoreTurn(roll(r), uid, BOXES.find((b) => r.ySheets?.[uid]?.[b.id] == null).id).round
    }
  })

  it('ends when every sheet is full and names the highest total', () => {
    const last = Object.fromEntries(BOXES.slice(0, -1).map((b) => [b.id, 1]))
    const r = { ...roll(fresh()), ySheets: { a: last, b: fullSheet(1) }, yDice: [6, 6, 6, 6, 6] }
    const res = scoreTurn(r, 'a', 'ch')
    expect(res.result).toEqual({ winner: 'a' })
    expect(sheetTotals(res.round.ySheets.a).total).toBe(12 + 30)
  })

  it('calls a shared top score a draw', () => {
    expect(winnerOf(['a', 'b'], { a: { ch: 20 }, b: { ch: 20 } })).toBe('draw')
    expect(winnerOf(['a', 'b', 'c'], { a: { ch: 20 }, b: { ch: 21 }, c: {} })).toBe('b')
  })

  it('plays a whole two-player match to a result', () => {
    let r = fresh()
    let result = null
    let at = 1
    for (let turn = 0; turn < BOXES.length * 2; turn++) {
      const uid = turnOwner(r)
      r = roll(r, at++)
      const open = BOXES.find((b) => r.ySheets?.[uid]?.[b.id] == null).id
      const res = scoreTurn(r, uid, open)
      r = res.round
      result = res.result
    }
    expect(result).not.toBe(null)
    expect(sheetFull(r.ySheets.a) && sheetFull(r.ySheets.b)).toBe(true)
  })
})

describe('skipTurn', () => {
  it('fills the away player\'s first open box with 0 and moves on', () => {
    const res = skipTurn(fresh(), 'a')
    expect(res.round.ySheets.a).toEqual({ ones: 0 })
    expect(res.round.yLast).toMatchObject({ by: 'a', box: 'ones', pts: 0, away: true })
    expect(turnOwner(res.round)).toBe('b')
    expect(skipTurn(fresh(), 'b')).toBe(null)
  })

  it('still ends the match when the last box is skipped', () => {
    const last = Object.fromEntries(BOXES.slice(0, -1).map((b) => [b.id, 1]))
    const res = skipTurn({ ...fresh(), ySheets: { a: last, b: fullSheet(2) } }, 'a')
    expect(res.result).toEqual({ winner: 'b' })
  })
})

describe('bot', () => {
  it('always banks an open box', () => {
    const sheet = Object.fromEntries(BOXES.slice(0, 12).map((b) => [b.id, 0]))
    for (const level of BOT_LEVELS) expect(botBox([1, 1, 1, 1, 1], sheet, level)).toBe('ch')
  })

  it('keeps its most common face on NORMAL and nothing on EASY', () => {
    expect(botHolds([4, 4, 2, 4, 6], {}, 'easy')).toEqual([0, 0, 0, 0, 0])
    expect(botHolds([4, 4, 2, 4, 6], {}, 'normal')).toEqual([1, 1, 0, 1, 0])
    expect(botHolds([1, 2, 3, 5, 6], {}, 'normal')).toEqual([0, 0, 0, 0, 0])
  })

  it('chases a run on HARD while a run box is open', () => {
    expect(botHolds([2, 3, 4, 5, 5], {}, 'hard')).toEqual([1, 1, 1, 1, 0])
    expect(botHolds([2, 3, 4, 5, 5], { sr: 30, lr: 0 }, 'hard')).toEqual([0, 0, 0, 1, 1])
  })

  it('does not burn a high box on a poor roll on HARD', () => {
    expect(botBox([6, 6, 6, 1, 2], {}, 'hard')).toBe('sixes')
    expect(botBox([1, 1, 2, 3, 5], {}, 'normal')).toBe('ch')
    expect(botBox([1, 1, 2, 3, 5], {}, 'hard')).not.toBe('ch')
  })
})
