import { describe, expect, it } from 'vitest'
import { isIndianLocale, parseCurrencySetting, pickCurrency, processorFor } from './payRegionLogic'

describe('payRegionLogic', () => {
  it('the buyer’s own choice wins over every device signal', () => {
    expect(pickCurrency({ setting: 'USD', timeZone: 'Asia/Kolkata', locales: ['hi-IN'] })).toEqual({ currency: 'USD', source: 'setting' })
    expect(pickCurrency({ setting: 'INR', timeZone: 'Europe/London', locales: ['en-GB'] })).toEqual({ currency: 'INR', source: 'setting' })
  })

  it('then the Indian time zone, under either name', () => {
    expect(pickCurrency({ timeZone: 'Asia/Kolkata', locales: ['en-US'] })).toEqual({ currency: 'INR', source: 'timezone' })
    expect(pickCurrency({ timeZone: 'Asia/Calcutta' }).currency).toBe('INR')
  })

  it('then a browser language with the IN region', () => {
    expect(pickCurrency({ timeZone: 'America/New_York', locales: ['en-US', 'hi-IN'] })).toEqual({ currency: 'INR', source: 'locale' })
  })

  it('defaults to dollars (Paddle) everywhere else', () => {
    expect(pickCurrency({ timeZone: 'Europe/Berlin', locales: ['de-DE'] })).toEqual({ currency: 'USD', source: 'default' })
    expect(pickCurrency()).toEqual({ currency: 'USD', source: 'default' })
    expect(pickCurrency({ setting: 'EUR', locales: null })).toEqual({ currency: 'USD', source: 'default' })
  })

  it('reads region subtags only, not the Indonesian language code', () => {
    expect(isIndianLocale('en-IN')).toBe(true)
    expect(isIndianLocale('ta_IN')).toBe(true)
    expect(isIndianLocale('pa-Guru-IN')).toBe(true)
    expect(isIndianLocale('in')).toBe(false) // legacy code for Indonesian
    expect(isIndianLocale('id-ID')).toBe(false)
    expect(isIndianLocale(undefined)).toBe(false)
  })

  it('accepts only the two known settings and maps each currency to its processor', () => {
    expect(parseCurrencySetting('INR')).toBe('INR')
    expect(parseCurrencySetting('inr')).toBe(null)
    expect(processorFor('INR')).toBe('razorpay')
    expect(processorFor('USD')).toBe('paddle')
  })
})
