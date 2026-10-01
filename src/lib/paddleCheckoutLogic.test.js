import { describe, expect, it } from 'vitest'
import { paddleSetup, returnPathFor, searchWithoutTransaction, transactionFromSearch } from './paddleCheckoutLogic'

describe('paddleCheckoutLogic', () => {
  it('reads a Paddle transaction id from ?_ptxn=', () => {
    expect(transactionFromSearch('?_ptxn=txn_01h8bxpvx398a7zbawb77y0kp5')).toBe('txn_01h8bxpvx398a7zbawb77y0kp5')
    expect(transactionFromSearch('?a=1&_ptxn=txn_01h8bxpvx398a7zbawb77y0kp5')).toBe('txn_01h8bxpvx398a7zbawb77y0kp5')
  })

  it('ignores a missing or malformed id', () => {
    expect(transactionFromSearch('')).toBe(null)
    expect(transactionFromSearch('?foo=1')).toBe(null)
    expect(transactionFromSearch('?_ptxn=')).toBe(null)
    expect(transactionFromSearch('?_ptxn=pri_01h8bxpvx398a7zbawb77y0kp5')).toBe(null)
    expect(transactionFromSearch('?_ptxn=txn_<script>')).toBe(null)
    expect(transactionFromSearch(undefined)).toBe(null)
  })

  it('drops only _ptxn from the query string', () => {
    expect(searchWithoutTransaction('?_ptxn=txn_abcdefghijk')).toBe('')
    expect(searchWithoutTransaction('?tab=emote&_ptxn=txn_abcdefghijk')).toBe('?tab=emote')
    expect(searchWithoutTransaction('')).toBe('')
  })

  it('runs in the sandbox unless production is chosen, and refuses a token from the other environment', () => {
    expect(paddleSetup({ token: 'test_abc' })).toEqual({ ok: true, environment: 'sandbox', token: 'test_abc' })
    expect(paddleSetup({ token: 'live_abc', env: 'production' })).toEqual({ ok: true, environment: 'production', token: 'live_abc' })
    expect(paddleSetup({ token: 'live_abc' })).toEqual({ ok: false, reason: 'token-env-mismatch' })
    expect(paddleSetup({ token: 'test_abc', env: 'production' })).toEqual({ ok: false, reason: 'token-env-mismatch' })
    expect(paddleSetup({ token: '' })).toEqual({ ok: false, reason: 'no-token' })
    expect(paddleSetup()).toEqual({ ok: false, reason: 'no-token' })
  })

  it('returns a Pass buyer to the Pass page and everyone else to the shop', () => {
    expect(returnPathFor('pass-monthly')).toBe('/pass')
    expect(returnPathFor('pack-emotes-pixel')).toBe('/shop')
    expect(returnPathFor(undefined)).toBe('/shop')
  })
})
