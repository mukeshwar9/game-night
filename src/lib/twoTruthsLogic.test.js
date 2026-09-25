import { describe, it, expect } from 'vitest'
import { commit, verifyReveal } from './commit'
import {
  STATEMENT_COUNT, MIN_STATEMENT_LENGTH, MAX_STATEMENT_LENGTH, DEFAULT_MATCH_TARGET, WRITING_DEADLINE_MS,
  otherSymbol, normalizeStatements, cleanStatement, isValidLieIndex, findBannedWord,
  validateStatements, validateEntry, lieSecret, secretStorageKey, buildStoredSecret, parseStoredSecret,
  storytellerRoundWinner, getMatchWinner,
} from './twoTruthsLogic'

const GOOD = ['I have been to Peru', 'I can juggle five balls', 'I once met a famous chef']

describe('constants', () => {
  it('match the rules text', () => {
    expect(STATEMENT_COUNT).toBe(3)
    expect(MIN_STATEMENT_LENGTH).toBe(3)
    expect(MAX_STATEMENT_LENGTH).toBe(80)
    expect(DEFAULT_MATCH_TARGET).toBe(3)
    expect(WRITING_DEADLINE_MS).toBe(180_000)
  })
})

describe('otherSymbol', () => {
  it('flips seats', () => {
    expect(otherSymbol('X')).toBe('O')
    expect(otherSymbol('O')).toBe('X')
  })
})

describe('normalizeStatements', () => {
  it('pads missing input to three empty strings', () => {
    expect(normalizeStatements(null)).toEqual(['', '', ''])
    expect(normalizeStatements(undefined)).toEqual(['', '', ''])
  })

  it('maps a sparse numeric-keyed object by key, not by order', () => {
    expect(normalizeStatements({ 2: 'c', 0: 'a' })).toEqual(['a', '', 'c'])
  })

  it('keeps a full array and drops extra or non-string entries', () => {
    expect(normalizeStatements(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c'])
    expect(normalizeStatements(['a', 5, null])).toEqual(['a', '', ''])
  })
})

describe('cleanStatement', () => {
  it('trims and collapses whitespace including newlines', () => {
    expect(cleanStatement('  I   like\n\ncats  ')).toBe('I like cats')
    expect(cleanStatement(null)).toBe('')
  })
})

describe('isValidLieIndex', () => {
  it('accepts only 0, 1, 2', () => {
    expect([0, 1, 2].every(isValidLieIndex)).toBe(true)
    expect([-1, 3, 1.5, '1', null, undefined].some(isValidLieIndex)).toBe(false)
  })
})

describe('validateStatements', () => {
  it('accepts three distinct, clean statements and returns them cleaned', () => {
    const r = validateStatements(['  I have been to Peru ', 'I can juggle', 'I met a chef'])
    expect(r).toEqual({ ok: true, statements: ['I have been to Peru', 'I can juggle', 'I met a chef'] })
  })

  it('requires exactly three statements', () => {
    expect(validateStatements(['a b c', 'd e f']).ok).toBe(false)
    expect(validateStatements(null).ok).toBe(false)
    expect(validateStatements([...GOOD, 'extra']).ok).toBe(false)
  })

  it('rejects an empty or whitespace-only statement and names it', () => {
    const r = validateStatements(['I have been to Peru', '   ', 'I met a chef'])
    expect(r.ok).toBe(false)
    expect(r.index).toBe(1)
    expect(r.error).toMatch(/STATEMENT 2 IS EMPTY/)
  })

  it('rejects statements shorter than 3 characters after trimming', () => {
    const r = validateStatements(['  ab  ', 'I can juggle', 'I met a chef'])
    expect(r.ok).toBe(false)
    expect(r.index).toBe(0)
    expect(r.error).toMatch(/TOO SHORT/)
    expect(validateStatements(['abc', 'I can juggle', 'I met a chef']).ok).toBe(true)
  })

  it('rejects statements longer than 80 characters', () => {
    const long = 'x'.repeat(MAX_STATEMENT_LENGTH + 1)
    const r = validateStatements(['I have been to Peru', 'I can juggle', long])
    expect(r.ok).toBe(false)
    expect(r.index).toBe(2)
    expect(r.error).toMatch(/TOO LONG/)
    expect(validateStatements(['I have been to Peru', 'I can juggle', 'x'.repeat(80)]).ok).toBe(true)
  })

  it('rejects two statements that differ only by case, spacing or punctuation', () => {
    const r = validateStatements(['I can juggle', 'I have been to Peru', '  i CAN   juggle! '])
    expect(r.ok).toBe(false)
    expect(r.error).toBe('STATEMENTS 1 AND 3 ARE THE SAME')
    expect(r.index).toBe(2)
  })

  it('rejects a statement containing a banned word with a clear message', () => {
    const r = validateStatements(['I have been to Peru', 'I said fuck at school', 'I met a chef'])
    expect(r.ok).toBe(false)
    expect(r.index).toBe(1)
    expect(r.error).toMatch(/STATEMENT 2 HAS A WORD THAT ISN'T ALLOWED/)
  })

  it('does not reject innocent words that share letters with banned ones', () => {
    expect(validateStatements(['I love Dickens', 'I play bass', 'I own a spice rack']).ok).toBe(true)
  })
})

describe('findBannedWord', () => {
  it('finds a banned word regardless of case and punctuation', () => {
    expect(findBannedWord('What the FUCK!')).toBe('fuck')
    expect(findBannedWord('A totally normal sentence')).toBeNull()
  })
})

describe('validateEntry', () => {
  it('requires a marked lie', () => {
    const r = validateEntry(GOOD, null)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('MARK WHICH ONE IS THE LIE')
  })

  it('reports statement problems before a missing lie', () => {
    expect(validateEntry(['', 'b c d', 'e f g'], null).error).toMatch(/STATEMENT 1 IS EMPTY/)
  })

  it('returns cleaned statements and the lie index', () => {
    expect(validateEntry(GOOD, 2)).toEqual({ ok: true, statements: GOOD, lieIndex: 2 })
  })
})

describe('commitment payloads', () => {
  it('commits and reveals the lie index as a string', async () => {
    const { hash, salt } = await commit(lieSecret(1))
    expect(await verifyReveal(hash, lieSecret(1), salt)).toBe(true)
    expect(await verifyReveal(hash, lieSecret(2), salt)).toBe(false)
    expect(lieSecret(0)).toBe('0')
  })

  it('keys the stored secret by room', () => {
    expect(secretStorageKey('abc')).toBe('twotruths-abc')
  })

  it('round-trips a stored secret that opens the current commitment', () => {
    const stored = JSON.stringify(buildStoredSecret({ commitment: 'h1', lieIndex: 2, salt: 's' }))
    expect(parseStoredSecret(stored, 'h1')).toEqual({ lieIndex: 2, salt: 's' })
  })

  it('ignores a stale secret from a different commitment', () => {
    const stored = JSON.stringify(buildStoredSecret({ commitment: 'old', lieIndex: 0, salt: 's' }))
    expect(parseStoredSecret(stored, 'new')).toBeNull()
  })

  it('rejects malformed stored values', () => {
    expect(parseStoredSecret('not json', 'h')).toBeNull()
    expect(parseStoredSecret(null, 'h')).toBeNull()
    expect(parseStoredSecret(JSON.stringify({ lieIndex: 5, salt: 's' }))).toBeNull()
    expect(parseStoredSecret(JSON.stringify({ lieIndex: 1, salt: '' }))).toBeNull()
  })
})

describe('storytellerRoundWinner', () => {
  it('gives the round to the guesser when they find the lie', () => {
    expect(storytellerRoundWinner({ setter: 'X', guess: 1, lieIndex: 1 })).toBe('O')
  })

  it('gives the round to the storyteller when the guesser is fooled', () => {
    expect(storytellerRoundWinner({ setter: 'O', guess: 0, lieIndex: 2 })).toBe('O')
  })
})

describe('getMatchWinner', () => {
  it('is null below the target', () => {
    expect(getMatchWinner({ X: 2, O: 1 })).toBeNull()
    expect(getMatchWinner(null)).toBeNull()
  })

  it('declares whoever reaches the target with the lead', () => {
    expect(getMatchWinner({ X: 3, O: 1 })).toBe('X')
    expect(getMatchWinner({ X: 2, O: 3 })).toBe('O')
  })

  it('keeps playing on a tie at or above the target', () => {
    expect(getMatchWinner({ X: 3, O: 3 })).toBeNull()
    expect(getMatchWinner({ X: 4, O: 4 })).toBeNull()
    expect(getMatchWinner({ X: 5, O: 4 })).toBe('X')
  })

  it('honours a custom target', () => {
    expect(getMatchWinner({ X: 2, O: 0 }, 2)).toBe('X')
  })
})
