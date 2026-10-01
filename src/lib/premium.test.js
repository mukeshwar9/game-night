import { describe, expect, it } from 'vitest'
import { PACKS, PRICES, PRODUCTS, formatCents, yearlySavingsPercent } from './premiumCatalog'
import { accessFor, hasActivePass, isUnlocked, itemKey, missingPacks, unlockReason } from './premium'

const NOW = 1_800_000_000_000
const free = { kind: 'theme', id: 'matcha' }
const themed = { kind: 'theme', id: 'campfire', premium: true, pack: 'themes-seasonal' }
const passOk = { pass: { status: 'active', plan: 'monthly', currentPeriodEnd: NOW + 1000 } }

describe('premium catalogue', () => {
  it('uses the recommended prices', () => {
    expect(PRICES.passMonthly).toBe(299)
    expect(PRICES.passYearly).toBe(1999)
    expect(PRICES.supporter).toBe(499)
    expect(formatCents(1999)).toBe('$19.99')
    expect(yearlySavingsPercent()).toBe(44)
  })

  it('keeps every pack between $0.99 and $2.99 and gives each a product', () => {
    for (const pack of PACKS) {
      expect(pack.cents).toBeGreaterThanOrEqual(99)
      expect(pack.cents).toBeLessThanOrEqual(299)
      expect(PRODUCTS[`pack-${pack.id}`].packId).toBe(pack.id)
    }
  })
})

describe('isUnlocked', () => {
  it('never locks a free item', () => {
    expect(isUnlocked(free, {})).toBe(true)
    expect(isUnlocked({ kind: 'theme', id: 'x' }, { ent: null })).toBe(true)
  })

  it('locks a premium item for a viewer with nothing', () => {
    expect(isUnlocked(themed, { ent: null, now: NOW })).toBe(false)
    expect(isUnlocked(themed, { ent: {}, now: NOW })).toBe(false)
  })

  it('opens on the bypass flag, the admin flag, an active pass, or the pack', () => {
    expect(isUnlocked(themed, { bypass: true })).toBe(true)
    expect(isUnlocked(themed, { ent: { admin: true } })).toBe(true)
    expect(isUnlocked(themed, { ent: passOk, now: NOW })).toBe(true)
    expect(isUnlocked(themed, { ent: { packs: { 'themes-seasonal': true } } })).toBe(true)
  })

  it('does not open for a different pack or supporter alone', () => {
    expect(isUnlocked(themed, { ent: { packs: { 'themes-arcade': true } } })).toBe(false)
    expect(isUnlocked(themed, { ent: { supporter: true } })).toBe(false)
  })

  it('an item without a pack opens only via pass, admin or bypass', () => {
    const loose = { kind: 'avatar', id: 'x', premium: true }
    expect(isUnlocked(loose, { ent: { packs: { '': true } } })).toBe(false)
    expect(isUnlocked(loose, { ent: passOk, now: NOW })).toBe(true)
  })
})

describe('hasActivePass', () => {
  it('needs a future period end', () => {
    expect(hasActivePass(passOk, NOW)).toBe(true)
    expect(hasActivePass({ pass: { status: 'active', currentPeriodEnd: NOW - 1 } }, NOW)).toBe(false)
    expect(hasActivePass({ pass: { status: 'active' } }, NOW)).toBe(false)
  })

  it('keeps a cancelled pass until the paid period ends', () => {
    expect(hasActivePass({ pass: { status: 'canceled', currentPeriodEnd: NOW + 5 } }, NOW)).toBe(true)
    expect(hasActivePass({ pass: { status: 'canceled', currentPeriodEnd: NOW - 5 } }, NOW)).toBe(false)
  })

  it('treats expired and paused as off whatever the date', () => {
    expect(hasActivePass({ pass: { status: 'expired', currentPeriodEnd: NOW + 5 } }, NOW)).toBe(false)
    expect(hasActivePass({ pass: { status: 'paused', currentPeriodEnd: NOW + 5 } }, NOW)).toBe(false)
  })
})

describe('helpers', () => {
  it('itemKey joins kind and id', () => {
    expect(itemKey('theme', 'campfire')).toBe('theme:campfire')
  })

  it('unlockReason says why', () => {
    expect(unlockReason(free)).toBe('free')
    expect(unlockReason(themed, { bypass: true })).toBe('dev')
    expect(unlockReason(themed, { ent: { admin: true } })).toBe('admin')
    expect(unlockReason(themed, { ent: passOk, now: NOW })).toBe('pass')
    expect(unlockReason(themed, { ent: { packs: { 'themes-seasonal': true } } })).toBe('pack')
    expect(unlockReason(themed, { ent: null })).toBe('locked')
  })

  it('accessFor summarises one record', () => {
    const a = accessFor({ ...passOk, supporter: true }, { now: NOW })
    expect(a).toMatchObject({ pass: true, supporter: true, admin: false, plan: 'monthly', cancelling: false })
    expect(a.isUnlocked(themed)).toBe(true)
    expect(accessFor(null, { now: NOW }).isUnlocked(themed)).toBe(false)
  })

  it('missingPacks lists each unowned pack once', () => {
    const items = [themed, { ...themed, id: 'b' }, { kind: 'avatar', id: 'h', premium: true, pack: 'avatars-hats' }, free]
    expect(missingPacks(items, { packs: { 'avatars-hats': true } })).toEqual(['themes-seasonal'])
    expect(missingPacks(items, null).sort()).toEqual(['avatars-hats', 'themes-seasonal'])
  })
})
