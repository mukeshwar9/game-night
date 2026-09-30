import { describe, it, expect } from 'vitest'
import { inAppBrowserName, isInAppBrowser, isAndroidUa, isIosUa, openInBrowserUrl } from './uaLogic'

const IG_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 Instagram 340.0.0.24.108 (iPhone14,5; iOS 17_4; en_US; en-US; scale=3.00; 1170x2532; 606438716)'
const FB_ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.38.108;]'
const TIKTOK = 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6'
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const CHROME = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'

describe('inAppBrowserName', () => {
  it('names the embedding app', () => {
    expect(inAppBrowserName(IG_IOS)).toBe('Instagram')
    expect(inAppBrowserName(FB_ANDROID)).toBe('Facebook')
    expect(inAppBrowserName(TIKTOK)).toBe('TikTok')
    expect(inAppBrowserName('Mozilla/5.0 (Linux; Android 12) Line/13.1.0')).toBe('LINE')
  })
  it('is null for regular browsers and junk input', () => {
    expect(inAppBrowserName(SAFARI)).toBeNull()
    expect(inAppBrowserName(CHROME)).toBeNull()
    expect(inAppBrowserName('')).toBeNull()
    expect(inAppBrowserName(undefined)).toBeNull()
    expect(inAppBrowserName(null)).toBeNull()
  })
  it('does not match "Line" as a word inside another token', () => {
    expect(isInAppBrowser('Mozilla/5.0 Baseline/1.0 Chrome/120')).toBe(false)
  })
})

describe('platform sniffing', () => {
  it('tells Android from iOS', () => {
    expect(isAndroidUa(CHROME)).toBe(true)
    expect(isAndroidUa(SAFARI)).toBe(false)
    expect(isIosUa(SAFARI)).toBe(true)
    expect(isIosUa(CHROME)).toBe(false)
  })
})

describe('openInBrowserUrl', () => {
  it('builds a Chrome intent link on Android', () => {
    expect(openInBrowserUrl('https://game-night-91464.web.app/solo/connectfour?utm_source=ig', FB_ANDROID))
      .toBe('intent://game-night-91464.web.app/solo/connectfour?utm_source=ig#Intent;scheme=https;package=com.android.chrome;end')
  })
  it('has no deep link on iOS or for odd URLs', () => {
    expect(openInBrowserUrl('https://example.com/', IG_IOS)).toBeNull()
    expect(openInBrowserUrl('not a url', FB_ANDROID)).toBeNull()
    expect(openInBrowserUrl('javascript:alert(1)', FB_ANDROID)).toBeNull()
  })
})
