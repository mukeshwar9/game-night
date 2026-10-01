import { describe, it, expect } from 'vitest'
import { legalHref, PRIVACY_PATH, TERMS_PATH, SUPPORT_PATH } from './legal'

describe('legalHref', () => {
  it('keeps the relative path on the web', () => {
    expect(legalHref(PRIVACY_PATH, { native: false, origin: 'https://example.test' })).toBe('/privacy.html')
  })

  it('points the native shell at the public https page', () => {
    expect(legalHref(TERMS_PATH, { native: true, origin: 'https://example.test' })).toBe('https://example.test/terms.html')
    expect(legalHref(SUPPORT_PATH, { native: true, origin: 'https://example.test' })).toBe('https://example.test/support.html')
  })
})
