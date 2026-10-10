import { describe, it, expect } from 'vitest'
import { PLAY_URL, appStoreUrl, parseAppStoreId, playLiveFrom, smartBannerContent, storeBadgeFor } from './storeLinks'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'

describe('parseAppStoreId', () => {
  it('accepts only a numeric id', () => {
    expect(parseAppStoreId('6741234567')).toBe('6741234567')
    expect(parseAppStoreId(' 6741234567 ')).toBe('6741234567')
    expect(parseAppStoreId('APPSTORE_ID_PLACEHOLDER')).toBeNull()
    expect(parseAppStoreId('')).toBeNull()
    expect(parseAppStoreId(undefined)).toBeNull()
  })

  it('builds the listing URL', () => {
    expect(appStoreUrl('6741234567')).toBe('https://apps.apple.com/app/id6741234567')
    expect(appStoreUrl(null)).toBeNull()
  })
})

describe('storeBadgeFor', () => {
  const live = { appStoreId: '6741234567', playLive: true }

  it('points phones at their own store once the listing exists', () => {
    expect(storeBadgeFor({ ua: IPHONE, ...live })).toEqual({ store: 'ios', url: 'https://apps.apple.com/app/id6741234567' })
    expect(storeBadgeFor({ ua: ANDROID, ...live })).toEqual({ store: 'android', url: PLAY_URL })
  })

  it('shows nothing before launch, on a desktop, in the apps or in an installed PWA', () => {
    expect(storeBadgeFor({ ua: IPHONE })).toBeNull()
    expect(storeBadgeFor({ ua: ANDROID, appStoreId: '6741234567' })).toBeNull()
    expect(storeBadgeFor({ ua: DESKTOP, ...live })).toBeNull()
    expect(storeBadgeFor({ ua: IPHONE, ...live, native: true })).toBeNull()
    expect(storeBadgeFor({ ua: ANDROID, ...live, standalone: true })).toBeNull()
  })
})

describe('playLiveFrom / smartBannerContent', () => {
  it('reads the Play switch', () => {
    expect(playLiveFrom('1')).toBe(true)
    expect(playLiveFrom(undefined)).toBe(false)
  })

  it('passes the invite link to the app through app-argument', () => {
    expect(smartBannerContent('6741234567', 'https://x.app/game/AB12CD')).toBe('app-id=6741234567, app-argument=https://x.app/game/AB12CD')
    expect(smartBannerContent('6741234567')).toBe('app-id=6741234567')
    expect(smartBannerContent(null, 'https://x.app')).toBeNull()
  })
})
