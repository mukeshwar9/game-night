import { describe, it, expect } from 'vitest'
import {
  generateBotRoster,
  pickBotClue,
  pickBotGuess,
  pickBotGuessFromClue,
  pickBotLie,
  pickBotVote,
  pickSpyfairLocation,
  assignSpyfairRoles,
  generateBotStatement,
  generateQuestionPrompt,
  pickBotSpyVote,
  renderSpyReply,
  tallySpyfairVotes,
  normalizeIdList,
  pickSpyFromRotation,
  pickFreshLocation,
  pushRecentLocation,
  recordSpy,
  SPYFAIR_RECENT_LOCATIONS,
} from './partyBots'
import { isValidAvatar, HUMANOIDS, SHAPES } from './avatars'
import { SPYFAIR_LOCATIONS } from './decks/spyfair'
import { SPY_REPLY_STYLES } from './decks/spyfairChat'

// Tiny deterministic PRNG (mulberry32) so statistical assertions are reproducible.
// Kept local to the test file — partyBots.js itself stays rng-agnostic (callers
// inject `Math.random` by default).
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const N = 500

// ---------------------------------------------------------------------------
// generateBotRoster
// ---------------------------------------------------------------------------
describe('generateBotRoster', () => {
  it('returns botCount bots for 2..7', () => {
    for (let n = 2; n <= 7; n++) {
      expect(generateBotRoster(n, `size-${n}`)).toHaveLength(n)
    }
  })

  it('ids, names, and avatars are all distinct within a roster', () => {
    const roster = generateBotRoster(7, 'distinctness')
    expect(new Set(roster.map(b => b.id)).size).toBe(7)
    expect(new Set(roster.map(b => b.name)).size).toBe(7)
    expect(new Set(roster.map(b => b.avatar)).size).toBe(7)
  })

  it('every avatar is valid and uses a creature (non-humanoid) shape', () => {
    const roster = generateBotRoster(7, 'creature-shapes')
    for (const bot of roster) {
      expect(isValidAvatar(bot.avatar)).toBe(true)
      const shape = bot.avatar.split('.')[0]
      expect(SHAPES).toContain(shape)
      expect(HUMANOIDS).not.toContain(shape)
    }
  })

  it('personas are within 0..1', () => {
    const roster = generateBotRoster(6, 'persona-range')
    for (const bot of roster) {
      for (const stat of [bot.persona.skill, bot.persona.acuity, bot.persona.boldness]) {
        expect(stat).toBeGreaterThanOrEqual(0)
        expect(stat).toBeLessThanOrEqual(1)
      }
    }
  })

  it('identical seed yields an identical roster', () => {
    expect(generateBotRoster(5, 'fixed-seed')).toEqual(generateBotRoster(5, 'fixed-seed'))
  })

  it('different seeds yield different rosters, at least sometimes', () => {
    let differed = false
    for (let i = 0; i < 10; i++) {
      const a = generateBotRoster(5, `seed-${i}`)
      const b = generateBotRoster(5, `seed-${i}-alt`)
      if (JSON.stringify(a) !== JSON.stringify(b)) differed = true
    }
    expect(differed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// WAVELENGTH
// ---------------------------------------------------------------------------
describe('pickBotClue', () => {
  const pair = {
    left: 'COLD', right: 'HOT',
    clueBank: [{ word: 'ICE', pos: 5 }, { word: 'FIRE', pos: 95 }, { word: 'MILD', pos: 50 }],
  }
  const persona = { skill: 0.5, acuity: 0.5, boldness: 0.5 }

  it('returns a word from the clueBank', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 20; i++) {
      const { word } = pickBotClue(pair, new Set(), persona, rng)
      expect(pair.clueBank.map(e => e.word)).toContain(word)
    }
  })

  it('clamps target to an integer within 0..100', () => {
    const rng = mulberry32(2)
    for (let i = 0; i < 50; i++) {
      const { target } = pickBotClue(pair, new Set(), persona, rng)
      expect(Number.isInteger(target)).toBe(true)
      expect(target).toBeGreaterThanOrEqual(0)
      expect(target).toBeLessThanOrEqual(100)
    }
  })

  it('prefers a clueBank word not already used', () => {
    const rng = mulberry32(3)
    const used = new Set(['ICE', 'FIRE'])
    for (let i = 0; i < 20; i++) {
      expect(pickBotClue(pair, used, persona, rng).word).toBe('MILD')
    }
  })

  it('falls back to reuse once every word is used', () => {
    const rng = mulberry32(4)
    const used = new Set(['ICE', 'FIRE', 'MILD'])
    const { word } = pickBotClue(pair, used, persona, rng)
    expect(pair.clueBank.map(e => e.word)).toContain(word)
  })
})

describe('pickBotGuess', () => {
  const persona = (skill) => ({ skill, acuity: 0.5, boldness: 0.5 })

  it('always returns an integer within 0..100', () => {
    const rng = mulberry32(10)
    for (let i = 0; i < N; i++) {
      const g = pickBotGuess(50, persona(0.5), rng)
      expect(Number.isInteger(g)).toBe(true)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(100)
    }
  })

  it('has a strictly smaller mean absolute error at high skill than at low skill', () => {
    const target = 50
    const rngLow = mulberry32(11)
    const rngHigh = mulberry32(12)
    let sumLow = 0
    let sumHigh = 0
    for (let i = 0; i < N; i++) {
      sumLow += Math.abs(pickBotGuess(target, persona(0.1), rngLow) - target)
      sumHigh += Math.abs(pickBotGuess(target, persona(0.9), rngHigh) - target)
    }
    expect(sumHigh / N).toBeLessThan(sumLow / N)
  })
})

// ---------------------------------------------------------------------------
// FIBBAGE
// ---------------------------------------------------------------------------
describe('pickBotGuessFromClue', () => {
  const pair = { left: 'COLD', right: 'HOT', clueBank: [{ word: 'ICEBERG', pos: 4 }, { word: 'SAUNA', pos: 88 }] }
  const sharp = { skill: 1, acuity: 0.5, boldness: 0.5 }

  it('regression: aims at the clue word\'s position, not the hidden target', () => {
    // Target far from the clue's meaning — a bot that reads the target would
    // land near 20; a bot reading "SAUNA" lands near 88.
    const rng = mulberry32(7)
    const guesses = Array.from({ length: 200 }, () => pickBotGuessFromClue(pair, 'sauna', sharp, rng))
    const mean = guesses.reduce((a, b) => a + b, 0) / guesses.length
    expect(Math.abs(mean - 88)).toBeLessThan(4)
  })

  it('matches the clue loosely (case, punctuation)', () => {
    const rng = mulberry32(3)
    const g = pickBotGuessFromClue(pair, ' Iceberg! ', sharp, rng)
    expect(g).toBeLessThan(20)
  })

  it('guesses widely around the middle for a word it does not know', () => {
    const rng = mulberry32(11)
    const guesses = Array.from({ length: 300 }, () => pickBotGuessFromClue(pair, 'volcano', sharp, rng))
    const mean = guesses.reduce((a, b) => a + b, 0) / guesses.length
    expect(Math.abs(mean - 50)).toBeLessThan(8)
    expect(Math.max(...guesses) - Math.min(...guesses)).toBeGreaterThan(40)
  })

  it('always returns an in-range integer', () => {
    const rng = mulberry32(5)
    for (let i = 0; i < 200; i++) {
      const g = pickBotGuessFromClue(pair, i % 2 ? 'sauna' : 'zzz', { skill: 0 }, rng)
      expect(Number.isInteger(g)).toBe(true)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(100)
    }
  })
})

describe('pickBotLie', () => {
  const persona = { skill: 0.5, acuity: 0.5, boldness: 0.5 }

  it('returns a value from fact.decoys', () => {
    const fact = { prompt: 'x ___ y', answer: 'truth', decoys: ['alpha', 'beta', 'gamma'] }
    const rng = mulberry32(20)
    for (let i = 0; i < 20; i++) {
      expect(fact.decoys).toContain(pickBotLie(fact, new Set(), persona, rng))
    }
  })

  it('never returns the answer case-insensitively, even when a decoy differs from it only by case', () => {
    const fact = { prompt: 'x ___ y', answer: 'Truth', decoys: ['TRUTH', 'other'] }
    const rng = mulberry32(21)
    for (let i = 0; i < 20; i++) {
      const lie = pickBotLie(fact, new Set(), persona, rng)
      expect(lie.toLowerCase()).not.toBe('truth')
      expect(lie).toBe('other')
    }
  })

  it('prefers decoys not already used', () => {
    const fact = { prompt: 'x ___ y', answer: 'truth', decoys: ['alpha', 'beta', 'gamma'] }
    const used = new Set(['alpha', 'beta'])
    const rng = mulberry32(22)
    for (let i = 0; i < 20; i++) {
      expect(pickBotLie(fact, used, persona, rng)).toBe('gamma')
    }
  })

  it('falls back to a non-empty reuse once every decoy is used', () => {
    const fact = { prompt: 'x ___ y', answer: 'truth', decoys: ['alpha', 'beta'] }
    const used = new Set(['alpha', 'beta'])
    const rng = mulberry32(23)
    const lie = pickBotLie(fact, used, persona, rng)
    expect(lie.length).toBeGreaterThan(0)
    expect(fact.decoys).toContain(lie)
  })
})

describe('pickBotVote', () => {
  const options = [
    { id: 'opt-0', text: 'TRUTH' },
    { id: 'opt-1', text: 'mine' },
    { id: 'opt-2', text: 'other-a' },
    { id: 'opt-3', text: 'other-b' },
  ]

  it('never returns the option matching myLieText, case-insensitively', () => {
    const rng = mulberry32(30)
    for (let i = 0; i < N; i++) {
      expect(pickBotVote(options, 'TRUTH', 'MINE', { skill: 0.5 }, rng)).not.toBe('opt-1')
    }
  })

  it('truth-pick rate approximates lerp(0.3, 0.6, skill) over many samples', () => {
    const truthRate = (skill, seed) => {
      const rng = mulberry32(seed)
      let hits = 0
      for (let i = 0; i < N; i++) {
        if (pickBotVote(options, 'TRUTH', 'nope', { skill }, rng) === 'opt-0') hits++
      }
      return hits / N
    }
    expect(truthRate(0, 40)).toBeGreaterThan(0.3 - 0.07)
    expect(truthRate(0, 40)).toBeLessThan(0.3 + 0.07)
    expect(truthRate(1, 41)).toBeGreaterThan(0.6 - 0.07)
    expect(truthRate(1, 41)).toBeLessThan(0.6 + 0.07)
  })
})

// ---------------------------------------------------------------------------
// SPYFAIR
// ---------------------------------------------------------------------------
describe('pickSpyfairLocation', () => {
  it('never equals prevIndex and always stays in range', () => {
    const rng = mulberry32(50)
    let prev = 0
    for (let i = 0; i < N; i++) {
      const idx = pickSpyfairLocation(prev, rng)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(SPYFAIR_LOCATIONS.length)
      expect(idx).not.toBe(prev)
      prev = idx
    }
  })
})

describe('assignSpyfairRoles', () => {
  it('assigns exactly one null-role spy and distinct in-deck roles to everyone else, for every location', () => {
    const rng = mulberry32(60)
    const rosterIds = Array.from({ length: 8 }, (_, j) => `p${j}`)
    for (let i = 0; i < SPYFAIR_LOCATIONS.length; i++) {
      const { spyId, roles } = assignSpyfairRoles(rosterIds, i, rng)
      expect(rosterIds).toContain(spyId)
      expect(roles[spyId]).toBeNull()
      const nonSpyRoles = rosterIds.filter(id => id !== spyId).map(id => roles[id])
      expect(nonSpyRoles).toHaveLength(7)
      expect(new Set(nonSpyRoles).size).toBe(7)
      for (const r of nonSpyRoles) expect(SPYFAIR_LOCATIONS[i].roles).toContain(r)
    }
  })
})

describe('generateBotStatement', () => {
  const rng = mulberry32(70)

  it('non-spy output contains the role and leaks no location name beyond the role text itself', () => {
    // Some deck roles legitimately embed their own location word (e.g. BEACH's
    // "Beach Cop") — that's a property of src/lib/decks/spyfair.js, not a leak
    // introduced by our templates. Strip the substituted role out before checking
    // so this test targets the template boilerplate, which is what must stay
    // location-agnostic (see spyfairChat.test.js for the direct template check).
    for (const loc of SPYFAIR_LOCATIONS) {
      for (const role of loc.roles) {
        const line = generateBotStatement({ id: 'bot-1' }, { role, isSpy: false }, rng)
        expect(line).toContain(role)
        const withoutRole = line.split(role).join('')
        for (const other of SPYFAIR_LOCATIONS) {
          expect(withoutRole.toLowerCase()).not.toContain(other.name.toLowerCase())
        }
      }
    }
  })

  it('spy output contains no role from that location and no location name', () => {
    for (const loc of SPYFAIR_LOCATIONS) {
      const line = generateBotStatement({ id: 'bot-1' }, { role: null, isSpy: true }, rng)
      for (const role of loc.roles) expect(line.toLowerCase()).not.toContain(role.toLowerCase())
      expect(line.toLowerCase()).not.toContain(loc.name.toLowerCase())
    }
  })
})

describe('generateQuestionPrompt', () => {
  it('contains toName and leaves no {name} residue', () => {
    const rng = mulberry32(80)
    for (let i = 0; i < 30; i++) {
      const line = generateQuestionPrompt({ id: 'bot-1' }, 'RUBY', rng)
      expect(line).toContain('RUBY')
      expect(line).not.toContain('{name}')
    }
  })
})

describe('pickBotSpyVote', () => {
  const rosterIds = ['bot-1', 'bot-2', 'bot-3', 'bot-4']

  it('never accuses itself', () => {
    const rng = mulberry32(90)
    for (let i = 0; i < N; i++) {
      expect(pickBotSpyVote('bot-1', rosterIds, 'bot-3', { acuity: 0.5 }, rng)).not.toBe('bot-1')
    }
  })

  it('when the bot itself is the spy, it votes uniformly among the others', () => {
    const rng = mulberry32(91)
    for (let i = 0; i < N; i++) {
      const accused = pickBotSpyVote('bot-1', rosterIds, 'bot-1', { acuity: 0.5 }, rng)
      expect(rosterIds).toContain(accused)
      expect(accused).not.toBe('bot-1')
    }
  })

  it('accuses the real spy roughly at the acuity-scaled rate', () => {
    const spyHitRate = (acuity, seed) => {
      const rng = mulberry32(seed)
      let hits = 0
      for (let i = 0; i < N; i++) {
        if (pickBotSpyVote('bot-1', rosterIds, 'bot-3', { acuity }, rng) === 'bot-3') hits++
      }
      return hits / N
    }
    expect(spyHitRate(0, 92)).toBeGreaterThan(0.25 - 0.08)
    expect(spyHitRate(0, 92)).toBeLessThan(0.25 + 0.08)
    expect(spyHitRate(1, 93)).toBeGreaterThan(0.75 - 0.08)
    expect(spyHitRate(1, 93)).toBeLessThan(0.75 + 0.08)
  })
})

describe('renderSpyReply', () => {
  const ctx = { askerName: 'RUBY', roleWord: 'Pilot' }

  it('every style id returns non-empty text with no {} residue', () => {
    for (const style of SPY_REPLY_STYLES) {
      const line = renderSpyReply(style.id, ctx)
      expect(typeof line).toBe('string')
      expect(line.length).toBeGreaterThan(0)
      expect(line).not.toContain('{')
    }
  })

  it('deflect includes the asker name', () => {
    expect(renderSpyReply('deflect', ctx)).toContain('RUBY')
  })

  it('gamble still returns a non-empty line with no residue when roleWord is empty', () => {
    const line = renderSpyReply('gamble', { askerName: 'RUBY', roleWord: '' })
    expect(line.length).toBeGreaterThan(0)
    expect(line).not.toContain('{')
  })
})

describe('tallySpyfairVotes', () => {
  it('finds a clear majority', () => {
    expect(tallySpyfairVotes({ a: 'x', b: 'x', c: 'y' })).toEqual({ top: 'x', topCount: 2, tied: false })
  })

  it('flags a tie between two accused', () => {
    expect(tallySpyfairVotes({ a: 'x', b: 'y' }).tied).toBe(true)
  })

  it('flags a tie for all-different single votes', () => {
    expect(tallySpyfairVotes({ a: 'x', b: 'y', c: 'z' }).tied).toBe(true)
  })

  it('handles empty votes', () => {
    expect(tallySpyfairVotes({})).toEqual({ top: null, topCount: 0, tied: false })
  })
})

// ---------------------------------------------------------------------------
// Spyfair rotation bag + recent-location window
// ---------------------------------------------------------------------------
describe('normalizeIdList', () => {
  it('reads arrays, numeric-keyed objects (in index order) and empties', () => {
    expect(normalizeIdList(['a', 'b'])).toEqual(['a', 'b'])
    expect(normalizeIdList({ 1: 'b', 0: 'a', 10: 'c' })).toEqual(['a', 'b', 'c'])
    expect(normalizeIdList(null)).toEqual([])
    expect(normalizeIdList(undefined)).toEqual([])
  })
})

describe('pickSpyFromRotation', () => {
  const seats = ['p1', 'p2', 'p3', 'p4', 'p5']

  it('regression: everyone is spy once before anyone repeats', () => {
    // Random picks left someone never spy across 5 rounds 96% of the time at 5 players.
    const rng = mulberry32(21)
    let spied = []
    let last = null
    const picks = []
    for (let round = 0; round < seats.length; round++) {
      const res = pickSpyFromRotation(seats, spied, last, rng)
      picks.push(res.spyId)
      spied = res.spied
      last = res.spyId
    }
    expect([...picks].sort()).toEqual([...seats].sort())
  })

  it('starts a new cycle after everyone has been spy, never repeating the last spy back-to-back', () => {
    for (let seed = 0; seed < 50; seed++) {
      const res = pickSpyFromRotation(seats, seats, 'p3', mulberry32(seed))
      expect(res.spyId).not.toBe('p3')
      expect(res.spied).toEqual([res.spyId])
    }
  })

  it('lets a newcomer in and ignores players who left', () => {
    const res = pickSpyFromRotation(['p1', 'p2', 'new'], ['p1', 'p2', 'gone'], 'p2', mulberry32(1))
    expect(res.spyId).toBe('new')
    expect(res.spied).toEqual(['p1', 'p2', 'new'])
  })

  it('reads a Firebase-shaped (object) bag', () => {
    const res = pickSpyFromRotation(['a', 'b'], { 0: 'a' }, 'a', mulberry32(2))
    expect(res.spyId).toBe('b')
  })

  it('handles a single seat and an empty table', () => {
    expect(pickSpyFromRotation(['solo'], ['solo'], 'solo', mulberry32(3)).spyId).toBe('solo')
    expect(pickSpyFromRotation([], [], null, mulberry32(3))).toEqual({ spyId: null, spied: [] })
  })
})

describe('pickFreshLocation / pushRecentLocation', () => {
  it('regression: never deals a location used in the last 5 rounds', () => {
    const recent = [3, 7, 11, 2, 9]
    for (let seed = 0; seed < 200; seed++) {
      expect(recent).not.toContain(pickFreshLocation(recent, mulberry32(seed)))
    }
  })

  it('only looks at the last SPYFAIR_RECENT_LOCATIONS entries', () => {
    const recent = [0, 1, 2, 3, 4, 5, 6]
    const seen = new Set()
    for (let seed = 0; seed < 400; seed++) seen.add(pickFreshLocation(recent, mulberry32(seed)))
    expect(seen.has(0)).toBe(true) // dropped out of the window
    for (const i of recent.slice(-SPYFAIR_RECENT_LOCATIONS)) expect(seen.has(i)).toBe(false)
  })

  it('falls back to anything but the latest when the deck is smaller than the window', () => {
    for (let seed = 0; seed < 50; seed++) {
      const idx = pickFreshLocation([0, 1, 2], mulberry32(seed), 3)
      expect(idx).not.toBe(2)
    }
  })

  it('stays in range', () => {
    for (let seed = 0; seed < 100; seed++) {
      const idx = pickFreshLocation([], mulberry32(seed))
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(SPYFAIR_LOCATIONS.length)
    }
  })

  it('pushRecentLocation keeps only the window', () => {
    expect(pushRecentLocation([1, 2, 3, 4, 5], 6)).toEqual([2, 3, 4, 5, 6])
    expect(pushRecentLocation(null, 4)).toEqual([4])
    expect(pushRecentLocation({ 0: 8 }, 4)).toEqual([8, 4])
  })
})

describe('assignSpyfairRoles with a chosen spy', () => {
  it('uses the spy it is given', () => {
    const { spyId, roles } = assignSpyfairRoles(['a', 'b', 'c'], 0, mulberry32(4), 'c')
    expect(spyId).toBe('c')
    expect(roles.c).toBeNull()
    expect(roles.a).toBeTruthy()
  })

  it('falls back to a random spy for an unknown id', () => {
    const { spyId } = assignSpyfairRoles(['a', 'b'], 0, mulberry32(4), 'ghost')
    expect(['a', 'b']).toContain(spyId)
  })
})

describe('recordSpy (multiplayer: bag updated only once the spy is public)', () => {
  const seats = ['a', 'b', 'c']

  it('adds the spy to this cycle', () => {
    expect(recordSpy(['a'], seats, 'b')).toEqual(['a', 'b'])
  })

  it('starts a new cycle when the bag was already full', () => {
    expect(recordSpy(['a', 'b', 'c'], seats, 'a')).toEqual(['a'])
  })

  it('drops players who left and reads Firebase-shaped lists', () => {
    expect(recordSpy({ 0: 'gone', 1: 'a' }, seats, 'c')).toEqual(['a', 'c'])
  })

  it('agrees with pickSpyFromRotation over many rounds (everyone once per cycle)', () => {
    const rng = mulberry32(99)
    let spied = []
    const picks = []
    for (let round = 0; round < 9; round++) {
      const list = normalizeIdList(spied)
      const { spyId } = pickSpyFromRotation(seats, spied, list[list.length - 1] ?? null, rng)
      picks.push(spyId)
      spied = recordSpy(spied, seats, spyId)
    }
    for (let cycle = 0; cycle < 3; cycle++) {
      expect(picks.slice(cycle * 3, cycle * 3 + 3).sort()).toEqual(seats)
    }
  })
})
