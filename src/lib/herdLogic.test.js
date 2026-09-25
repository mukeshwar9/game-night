import { describe, it, expect } from 'vitest'
import {
  HERD_TARGET,
  ANSWER_MS,
  normalizeAnswer,
  displaySpelling,
  groupAnswers,
  scoreGroups,
  nextCow,
  getMatchWinner,
  getMatchWinners,
  seatOrder,
  allAnswered,
  allCommitted,
  allRevealed,
  collectRevealedTexts,
  submitOrderOf,
  isBannedAnswer,
  resolveHerdRound,
  REVEAL_GRACE_MS,
  REVEAL_ADVANCE_MS,
  pickHerdBotAnswer,
  HERD_BOT_FALLBACK,
  seededShuffle,
} from './herdLogic'
import { commit, verifyReveal } from './commit'
import { HERD_PROMPTS, HERD_ANSWER_BANKS } from './decks/herd'
import { isFamilySafe } from './wordDenylist'

describe('normalizeAnswer', () => {
  it('ignores case, surrounding and repeated whitespace', () => {
    expect(normalizeAnswer('  Pepperoni   Pizza ')).toBe(normalizeAnswer('pepperoni pizza'))
  })
  it('ignores punctuation', () => {
    expect(normalizeAnswer('Pepperoni!')).toBe(normalizeAnswer('pepperoni'))
    expect(normalizeAnswer("kid's")).toBe(normalizeAnswer('kids'))
  })
  it('folds regular plurals, including short stems (cats == cat, dogs == dog)', () => {
    expect(normalizeAnswer('tacos')).toBe(normalizeAnswer('taco'))
    expect(normalizeAnswer('cats')).toBe(normalizeAnswer('cat'))
    expect(normalizeAnswer('dogs')).toBe(normalizeAnswer('dog'))
    expect(normalizeAnswer('cows')).toBe(normalizeAnswer('cow'))
    expect(normalizeAnswer('keys')).toBe(normalizeAnswer('key'))
    expect(normalizeAnswer('pies')).toBe(normalizeAnswer('pie'))
  })
  it('folds -ies, -oes and -es plurals', () => {
    expect(normalizeAnswer('cherries')).toBe(normalizeAnswer('cherry'))
    expect(normalizeAnswer('Strawberries')).toBe(normalizeAnswer('strawberry'))
    expect(normalizeAnswer('tomatoes')).toBe(normalizeAnswer('tomato'))
    expect(normalizeAnswer('potatoes')).toBe(normalizeAnswer('potato'))
    expect(normalizeAnswer('glasses')).toBe(normalizeAnswer('glass'))
    expect(normalizeAnswer('boxes')).toBe(normalizeAnswer('box'))
    expect(normalizeAnswer('sandwiches')).toBe(normalizeAnswer('sandwich'))
  })
  it('does not strip the s from singular words ending in s', () => {
    expect(normalizeAnswer('chess')).not.toBe(normalizeAnswer('ches'))
    expect(normalizeAnswer('bus')).toBe('bus')
    expect(normalizeAnswer('lens')).toBe('lens')
    expect(normalizeAnswer('class')).toBe('class')
  })
  it('folds a leading article, & vs and, spaces and hyphens', () => {
    expect(normalizeAnswer('a dog')).toBe(normalizeAnswer('dog'))
    expect(normalizeAnswer('The Beach')).toBe(normalizeAnswer('beach'))
    expect(normalizeAnswer('mac & cheese')).toBe(normalizeAnswer('mac and cheese'))
    expect(normalizeAnswer('hot dog')).toBe(normalizeAnswer('hotdog'))
    expect(normalizeAnswer('ice-cream')).toBe(normalizeAnswer('ice cream'))
  })
  it('folds accents', () => {
    expect(normalizeAnswer('Jalapeño')).toBe(normalizeAnswer('jalapeno'))
    expect(normalizeAnswer('café')).toBe(normalizeAnswer('cafe'))
  })
  it('keeps genuinely different answers apart', () => {
    expect(normalizeAnswer('cat')).not.toBe(normalizeAnswer('car'))
    expect(normalizeAnswer('apple')).not.toBe(normalizeAnswer('cherry'))
  })
  it('handles null/undefined/blank', () => {
    expect(normalizeAnswer(null)).toBe('')
    expect(normalizeAnswer(undefined)).toBe('')
    expect(normalizeAnswer('   ')).toBe('')
  })
})

describe('displaySpelling', () => {
  it('picks the most common raw spelling, case-insensitively', () => {
    expect(displaySpelling(['cherry', 'Cherries', 'cherries'])).toBe('Cherries')
  })
  it('breaks a tie by submission order', () => {
    expect(displaySpelling(['Strawberry', 'strawberries'])).toBe('Strawberry')
    expect(displaySpelling(['strawberries', 'Strawberry'])).toBe('strawberries')
  })
  it('trims and collapses whitespace in what it shows', () => {
    expect(displaySpelling(['  ice   cream '])).toBe('ice cream')
  })
})

describe('groupAnswers', () => {
  const g = (answers) => groupAnswers(answers)

  it('groups exact matches on the normalized form', () => {
    const groups = g({ a: 'Pepperoni!', b: 'pepperoni', c: 'Mushroom' })
    expect(groups).toHaveLength(2)
    expect(groups[0].norm).toBe(normalizeAnswer('pepperoni'))
    expect(groups[0].members).toEqual(['a', 'b'])
    expect(groups[1].members).toEqual(['c'])
  })
  it('sorts biggest-first; equal sizes break ties alphabetically by norm', () => {
    const groups = g({
      a: 'zzz', b: 'zzz',
      c: 'aaa', d: 'aaa',
      e: 'mmm',
    })
    expect(groups.map(x => x.norm)).toEqual(['aaa', 'zzz', 'mmm'])
  })
  it('sorts members lexicographically for determinism', () => {
    const groups = g({ z: 'x', a: 'x' })
    expect(groups[0].members).toEqual(['a', 'z'])
  })
  it('excludes blank/non-answers from grouping', () => {
    const groups = g({ a: 'pizza', b: '   ', c: '' })
    expect(groups).toHaveLength(1)
    expect(groups[0].members).toEqual(['a'])
  })
  it('handles null/undefined input', () => {
    expect(g(null)).toEqual([])
    expect(g(undefined)).toEqual([])
  })

  it('regression: plural/singular answers group and the majority scores', () => {
    // Previously five singletons and 0 points although four players agreed.
    const answers = { p1: 'Strawberry', p2: 'strawberries', p3: 'Cherries', p4: 'cherry', p5: 'apple' }
    const groups = g(answers, ['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(groups.map(x => x.members.length)).toEqual([2, 2, 1])
    expect(scoreGroups(groups).pointUids.sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(nextCow(groups, null, Object.keys(answers))).toEqual({ cow: 'p5', transferred: true })
  })

  it('regression: the reveal shows a raw spelling, never the normalized key', () => {
    const groups = g(
      { p1: 'Strawberry', p2: 'strawberries', p3: 'Cherries', p4: 'cherry', p5: 'Mac & Cheese', p6: 'mac and cheese', p7: 'mac & cheese' },
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
    )
    const byMember = Object.fromEntries(groups.map(x => [x.members[0], x.display]))
    expect(byMember.p1).toBe('Strawberry') // tie → first submitted
    expect(byMember.p3).toBe('Cherries')
    expect(byMember.p5).toBe('Mac & Cheese') // "mac & cheese" ×2 beats "mac and cheese" ×1
    for (const x of groups) expect(x.display).not.toBe(x.norm)
  })

  it('without a submit order, display ties fall back to key order', () => {
    const groups = g({ a: 'Dogs', b: 'dog' })
    expect(groups).toHaveLength(1)
    expect(groups[0].display).toBe('Dogs')
  })
})

describe('scoreGroups', () => {
  it('every member of the largest group scores', () => {
    const groups = [
      { norm: 'a', members: ['u1', 'u2', 'u3'] },
      { norm: 'b', members: ['u4'] },
    ]
    expect(scoreGroups(groups).pointUids.sort()).toEqual(['u1', 'u2', 'u3'])
  })
  it('ties at the top → all tied groups score', () => {
    const groups = [
      { norm: 'a', members: ['u1', 'u2'] },
      { norm: 'b', members: ['u3', 'u4'] },
      { norm: 'c', members: ['u5'] },
    ]
    expect(scoreGroups(groups).pointUids.sort()).toEqual(['u1', 'u2', 'u3', 'u4'])
  })
  it('all-unique round scores nobody', () => {
    const groups = [
      { norm: 'a', members: ['u1'] },
      { norm: 'b', members: ['u2'] },
    ]
    expect(scoreGroups(groups).pointUids).toEqual([])
  })
  it('empty input scores nobody', () => {
    expect(scoreGroups([]).pointUids).toEqual([])
    expect(scoreGroups(null).pointUids).toEqual([])
  })
})

describe('nextCow — the Pink Cow matrix', () => {
  const oneSingleton = [{ norm: 'a', members: ['u1', 'u2'] }, { norm: 'b', members: ['solo'] }]

  it('sole singleton takes the Cow when others grouped', () => {
    expect(nextCow(oneSingleton, null, ['u1', 'u2', 'solo'])).toEqual({ cow: 'solo', transferred: true })
  })
  it('already-cow singleton keeps it without a transfer event', () => {
    expect(nextCow(oneSingleton, 'solo', ['u1', 'u2', 'solo']).transferred).toBe(false)
    expect(nextCow(oneSingleton, 'solo', ['u1', 'u2', 'solo']).cow).toBe('solo')
  })
  it('two singletons → no transfer', () => {
    const groups = [
      { norm: 'a', members: ['u1', 'u2'] },
      { norm: 'b', members: ['s1'] },
      { norm: 'c', members: ['s2'] },
    ]
    expect(nextCow(groups, 'old', ['u1', 'u2', 's1', 's2'])).toEqual({ cow: 'old', transferred: false })
  })
  it('everyone matched → Cow stays', () => {
    const groups = [{ norm: 'a', members: ['u1', 'u2'] }]
    expect(nextCow(groups, 'holder', ['u1', 'u2'])).toEqual({ cow: 'holder', transferred: false })
  })
  it('all answers unique (no real group) → Cow stays', () => {
    const groups = [
      { norm: 'a', members: ['u1'] },
      { norm: 'b', members: ['u2'] },
    ]
    expect(nextCow(groups, 'holder', ['u1', 'u2'])).toEqual({ cow: 'holder', transferred: false })
  })
  it('non-answers can never take the Cow', () => {
    // 'ghost' submitted nothing → absent from answeredUids AND from groups
    const groups = [{ norm: 'a', members: ['u1', 'u2'] }, { norm: 'b', members: ['ghost'] }]
    expect(nextCow(groups, null, ['u1', 'u2'])).toEqual({ cow: null, transferred: false })
  })
  it('empty round keeps the current holder', () => {
    expect(nextCow([], 'holder', [])).toEqual({ cow: 'holder', transferred: false })
    expect(nextCow(null, null, [])).toEqual({ cow: null, transferred: false })
  })
})

describe('getMatchWinner', () => {
  it('a player at the target wins', () => {
    expect(getMatchWinner({ a: 8, b: 5 })).toBe('a')
    expect(getMatchWinner({ a: 7, b: 8 })).toBe('b')
  })
  it('below target → no winner', () => {
    expect(getMatchWinner({ a: 7, b: 7 })).toBeNull()
    expect(getMatchWinner({}, null)).toBeNull()
  })
  it('the Cow holder cannot win even at/above target', () => {
    expect(getMatchWinner({ a: 10, b: 8 }, 'a')).toBe('b')
    expect(getMatchWinner({ a: 10 }, 'a')).toBeNull()
  })
  it('target is overridable', () => {
    expect(getMatchWinner({ a: 3 }, null, 3)).toBe('a')
  })
  it('default target constant is 8', () => {
    expect(HERD_TARGET).toBe(8)
  })
})

describe('getMatchWinners — ties at the target', () => {
  it('regression: the highest score wins, not the first seat', () => {
    // Seat order (object key order) used to decide: 'a' won with 8 over 'b' with 9.
    expect(getMatchWinners({ a: 8, b: 9, c: 3 })).toEqual(['b'])
  })
  it('exact ties at the top are co-winners', () => {
    expect(getMatchWinners({ z: 9, a: 9, m: 8 })).toEqual(['a', 'z'])
  })
  it('the Cow holder is skipped even with the top score', () => {
    expect(getMatchWinners({ a: 10, b: 8, c: 8 }, 'a')).toEqual(['b', 'c'])
    expect(getMatchWinners({ a: 10, b: 7 }, 'a')).toEqual([])
  })
  it('nobody at the target → no winners', () => {
    expect(getMatchWinners({ a: 7, b: 7 })).toEqual([])
    expect(getMatchWinners(null)).toEqual([])
  })
})

describe('seatOrder', () => {
  it('orders by joinedAt then playerId', () => {
    const players = {
      b: { joinedAt: 2, playerId: 'b' },
      a: { joinedAt: 1, playerId: 'a' },
      d: { joinedAt: 3, playerId: 'd' },
      c: { joinedAt: 3, playerId: 'c' },
    }
    expect(seatOrder(players)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('drops empty seats and handles null input', () => {
    expect(seatOrder({ a: null })).toEqual([])
    expect(seatOrder(null)).toEqual([])
  })
})

describe('allAnswered', () => {
  it('true only when every eligible seat submitted non-blank text', () => {
    expect(allAnswered(['a', 'b'], { a: 'x', b: 'y' })).toBe(true)
    expect(allAnswered(['a', 'b'], { a: 'x', b: '  ' })).toBe(false)
    expect(allAnswered(['a', 'b'], { a: 'x' })).toBe(false)
  })
  it('no eligible seats → false (never auto-advance an empty room)', () => {
    expect(allAnswered([], {})).toBe(false)
  })
})

describe('seededShuffle', () => {
  it('is deterministic per seed', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(seededShuffle(arr, 42)).toEqual(seededShuffle(arr, 42))
    expect(seededShuffle(arr, 42)).not.toEqual(seededShuffle(arr, 43))
  })
  it('returns a permutation (no loss, no dupes)', () => {
    const arr = Array.from({ length: 50 }, (_, i) => i)
    const out = seededShuffle(arr, 7)
    expect([...out].sort((a, b) => a - b)).toEqual(arr)
  })
  it('does not mutate the source array', () => {
    const arr = [1, 2, 3]
    seededShuffle(arr, 9)
    expect(arr).toEqual([1, 2, 3])
  })
})

describe('deck + constants sanity', () => {
  it('deck ships 150+ prompts, all non-empty strings', () => {
    expect(HERD_PROMPTS.length).toBeGreaterThanOrEqual(150)
    expect(HERD_PROMPTS.every(p => typeof p === 'string' && p.trim().length > 5)).toBe(true)
  })
  it('answering window is 45s', () => {
    expect(ANSWER_MS).toBe(45000)
  })
})

describe('commit-reveal round flow', () => {
  it('commitments hide answers until reveal, and only verified reveals count', async () => {
    const a = await commit('Pepperoni')
    const b = await commit('pepperonis')
    const answers = { a: { commit: a.hash, at: 2 }, b: { commit: b.hash, at: 1 } }
    expect(JSON.stringify(answers)).not.toMatch(/pepperoni/i)
    expect(allCommitted(['a', 'b'], answers)).toBe(true)
    expect(allCommitted(['a', 'b', 'c'], answers)).toBe(false)

    const reveals = {
      a: { text: 'Pepperoni', salt: a.salt },
      b: { text: 'mushroom', salt: b.salt }, // tampered: not what b committed
    }
    expect(allRevealed(['a', 'b'], reveals)).toBe(true)
    expect(allRevealed(['a', 'b', 'c'], reveals)).toBe(false)
    const verified = []
    for (const [uid, rev] of Object.entries(reveals)) {
      if (await verifyReveal(answers[uid].commit, rev.text, rev.salt)) verified.push(uid)
    }
    expect(collectRevealedTexts(reveals, verified)).toEqual({ a: 'Pepperoni' })
  })

  it('submitOrderOf sorts by lock-in time, then uid', () => {
    expect(submitOrderOf({ c: { at: 5 }, a: { at: 9 }, b: { at: 5 }, d: 'legacy' })).toEqual(['b', 'c', 'a', 'd'])
    expect(submitOrderOf(null)).toEqual([])
  })

  it('timers are exported starting values', () => {
    expect(REVEAL_GRACE_MS).toBeGreaterThan(0)
    expect(REVEAL_ADVANCE_MS).toBe(10000)
  })
})

describe('isBannedAnswer', () => {
  it('refuses slurs and vulgarity, per word and spaced out', () => {
    expect(isBannedAnswer('shit')).toBe(true)
    expect(isBannedAnswer('holy shit')).toBe(true)
    expect(isBannedAnswer('f u c k')).toBe(true)
  })
  it('allows ordinary answers', () => {
    expect(isBannedAnswer('pepperoni')).toBe(false)
    expect(isBannedAnswer('mac & cheese')).toBe(false)
    expect(isBannedAnswer('spicy wings')).toBe(false)
    expect(isBannedAnswer('')).toBe(false)
  })
})

describe('resolveHerdRound', () => {
  const seats = ['p1', 'p2', 'p3', 'p4', 'p5']

  it('scores the majority, moves the Cow and reports no winner mid-match', () => {
    const res = resolveHerdRound({
      texts: { p1: 'Strawberry', p2: 'strawberries', p3: 'Cherries', p4: 'cherry', p5: 'apple' },
      submitOrder: seats,
      scores: { p1: 2 },
      cow: null,
      seatIds: seats,
    })
    expect(res.pointUids.sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(res.scores).toEqual({ p1: 3, p2: 1, p3: 1, p4: 1 })
    expect(res.cow).toBe('p5')
    expect(res.transferred).toBe(true)
    expect(res.winners).toEqual([])
  })

  it('simultaneous crossings at the target → highest score, else co-winners', () => {
    const texts = { p1: 'dog', p2: 'dogs', p3: 'a dog', p4: 'cat', p5: 'bird' }
    const tie = resolveHerdRound({ texts, scores: { p1: 7, p2: 7, p3: 5 }, seatIds: seats })
    expect(tie.winners).toEqual(['p1', 'p2'])
    const lead = resolveHerdRound({ texts, scores: { p1: 7, p2: 8, p3: 5 }, seatIds: seats })
    expect(lead.winners).toEqual(['p2'])
  })

  it('banned answers are non-answers; unseated uids never score', () => {
    const res = resolveHerdRound({
      texts: { p1: 'shit', p2: 'shit', p3: 'pizza', ghost: 'pizza' },
      seatIds: ['p1', 'p2', 'p3'],
    })
    expect(res.groups.map(g => g.norm)).toEqual(['pizza'])
    expect(res.scores).toEqual({ p3: 1 })
  })
})

describe('solo bots — per-prompt answer banks', () => {
  it('every prompt has a bank of 4–8 distinct answers', () => {
    for (const prompt of HERD_PROMPTS) {
      const bank = HERD_ANSWER_BANKS[prompt]
      expect(Array.isArray(bank), prompt).toBe(true)
      expect(bank.length, prompt).toBeGreaterThanOrEqual(4)
      expect(bank.length, prompt).toBeLessThanOrEqual(8)
      const keys = bank.map(normalizeAnswer)
      expect(new Set(keys).size, prompt).toBe(keys.length)
      expect(keys.every(Boolean), prompt).toBe(true)
    }
    expect(Object.keys(HERD_ANSWER_BANKS).every(p => HERD_PROMPTS.includes(p))).toBe(true)
  })

  it('every bank answer is family-safe', () => {
    for (const bank of Object.values(HERD_ANSWER_BANKS)) {
      for (const answer of bank) {
        const words = answer.toLowerCase().split(/[^a-z]+/).filter(Boolean)
        expect(words.every(isFamilySafe), answer).toBe(true)
        expect(isBannedAnswer(answer), answer).toBe(false)
      }
    }
  })

  it('bots answer from the prompt\'s bank, weighted toward the obvious answer', () => {
    const bank = HERD_ANSWER_BANKS['Name a pizza topping.']
    expect(pickHerdBotAnswer(bank, () => 0)).toBe(bank[0])
    expect(pickHerdBotAnswer(bank, () => 0.9999)).toBe(bank[bank.length - 1])
    let seed = 1
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    const counts = {}
    for (let i = 0; i < 2000; i++) {
      const a = pickHerdBotAnswer(bank, rng)
      expect(bank).toContain(a)
      counts[a] = (counts[a] || 0) + 1
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    expect(top).toBe(bank[0])
    expect(Object.keys(counts).length).toBe(bank.length) // the tail still shows up
  })

  it('falls back to a generic pool when a bank is missing', () => {
    expect(HERD_BOT_FALLBACK).toContain(pickHerdBotAnswer(undefined, () => 0.5))
  })
})
