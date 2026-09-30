import { describe, it, expect } from 'vitest'
import { detectNativePlatform, normalizeOrigin, resolveShareOrigin, isNative, shareCurrentUrl, canvasPixelRatio, isLowEndDevice } from './platform'

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

describe('isLowEndDevice', () => {
  it('flags little memory or few cores', () => {
    expect(isLowEndDevice({ deviceMemory: 4, hardwareConcurrency: 8 })).toBe(true)
    expect(isLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe(true)
    expect(isLowEndDevice({ deviceMemory: 2 })).toBe(true)
  })
  it('passes capable hardware', () => {
    expect(isLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false)
    expect(isLowEndDevice({ hardwareConcurrency: 8 })).toBe(false)
    expect(isLowEndDevice({ deviceMemory: 6 })).toBe(false)
  })
  it('treats unknown as low-end', () => {
    expect(isLowEndDevice({})).toBe(true)
    expect(isLowEndDevice(null)).toBe(true)
    expect(isLowEndDevice({ deviceMemory: 0, hardwareConcurrency: 0 })).toBe(true)
  })
})

describe('canvasPixelRatio', () => {
  const strong = { deviceMemory: 8, hardwareConcurrency: 8 }
  const weak = { deviceMemory: 2, hardwareConcurrency: 4 }
  it('returns the raw ratio on the web and iOS', () => {
    expect(canvasPixelRatio(3, { platform: null, nav: weak })).toBe(3)
    expect(canvasPixelRatio(3, { platform: 'ios', nav: weak })).toBe(3)
    expect(canvasPixelRatio(undefined, { platform: null })).toBe(undefined)
  })
  it('caps Android at 2 when low-end, 3 otherwise', () => {
    expect(canvasPixelRatio(3.5, { platform: 'android', nav: weak })).toBe(2)
    expect(canvasPixelRatio(3.5, { platform: 'android', nav: {} })).toBe(2)
    expect(canvasPixelRatio(3.5, { platform: 'android', nav: strong })).toBe(3)
  })
  it('never raises a lower ratio', () => {
    expect(canvasPixelRatio(1.5, { platform: 'android', nav: weak })).toBe(1.5)
    expect(canvasPixelRatio(2, { platform: 'android', nav: strong })).toBe(2)
  })
  it('leaves an unusable ratio alone', () => {
    expect(canvasPixelRatio(0, { platform: 'android', nav: weak })).toBe(0)
    expect(canvasPixelRatio(undefined, { platform: 'android', nav: weak })).toBe(undefined)
  })
})
