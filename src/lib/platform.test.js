import { describe, it, expect } from 'vitest'
import { detectNativePlatform, normalizeOrigin, resolveShareOrigin, isNative, shareCurrentUrl } from './platform'

describe('detectNativePlatform', () => {
  it('is null in a browser', () => {
    expect(detectNativePlatform({})).toBe(null)
    expect(detectNativePlatform({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } })).toBe(null)
  })
  it('reads the injected bridge', () => {
    expect(detectNativePlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } })).toBe('ios')
    expect(detectNativePlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } })).toBe('android')
  })
  it('never throws', () => {
    expect(detectNativePlatform({ Capacitor: { isNativePlatform: () => { throw new Error('x') } } })).toBe(null)
    expect(detectNativePlatform(null)).toBe(null)
  })
  it('is off under test', () => {
    expect(isNative).toBe(false)
  })
})

describe('normalizeOrigin', () => {
  it('keeps only http(s) origins', () => {
    expect(normalizeOrigin('https://play.example.com/some/path')).toBe('https://play.example.com')
    expect(normalizeOrigin('capacitor://localhost')).toBe('')
    expect(normalizeOrigin('')).toBe('')
    expect(normalizeOrigin('nope')).toBe('')
    expect(normalizeOrigin(undefined)).toBe('')
  })
})

describe('resolveShareOrigin', () => {
  const publicOrigin = 'https://game-night.example'
  it('keeps the page origin on the web', () => {
    expect(resolveShareOrigin({ native: false, locationOrigin: 'http://localhost:5173', publicOrigin })).toBe('http://localhost:5173')
  })
  it('uses the public origin in the shell', () => {
    expect(resolveShareOrigin({ native: true, locationOrigin: 'https://localhost', publicOrigin })).toBe(publicOrigin)
  })
  it('never shares a non-web origin', () => {
    expect(resolveShareOrigin({ native: false, locationOrigin: 'capacitor://localhost', publicOrigin })).toBe(publicOrigin)
    expect(resolveShareOrigin({ native: false, locationOrigin: '', publicOrigin })).toBe(publicOrigin)
  })
})

describe('shareCurrentUrl', () => {
  it('rebuilds the page URL on the share origin', () => {
    expect(shareCurrentUrl({ pathname: '/game/abc', search: '?x=1', hash: '#h' })).toMatch(/\/game\/abc\?x=1#h$/)
  })
})
