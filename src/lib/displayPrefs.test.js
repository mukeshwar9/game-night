import { describe, it, expect } from 'vitest'
import { defaultTextSize, textSizeForZoom, textSizeOptions, TEXT_SIZES } from './displayPrefs'

describe('textSizeForZoom', () => {
  it('maps the phone’s text-size setting onto the tested sizes', () => {
    expect(textSizeForZoom(0.85)).toBe('s')
    expect(textSizeForZoom(1)).toBe('m')
    expect(textSizeForZoom(1.15)).toBe('l')
    expect(textSizeForZoom(1.3)).toBe('xl')
    // Android's 200 % and iOS's largest accessibility sizes stop at XL.
    expect(textSizeForZoom(2)).toBe('xl')
  })

  it('falls back to M for an unreadable value', () => {
    expect(textSizeForZoom(NaN)).toBe('m')
    expect(textSizeForZoom(0)).toBe('m')
  })
})

describe('textSizeOptions / defaultTextSize', () => {
  it('offers AUTO, and defaults to it, only in the apps', () => {
    expect(textSizeOptions(true).map(o => o.id)).toEqual(['auto', ...TEXT_SIZES.map(t => t.id)])
    expect(textSizeOptions(false).map(o => o.id)).toEqual(['s', 'm', 'l', 'xl'])
    expect(defaultTextSize(true)).toBe('auto')
    expect(defaultTextSize(false)).toBe('m')
  })
})
