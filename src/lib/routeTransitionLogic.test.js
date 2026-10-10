import { describe, expect, it } from 'vitest'
import { IN_APP_BACK_WINDOW_MS, isInAppBack, routeTransitionKind } from './routeTransitionLogic'

const TABS = ['/', '/games', '/friends', '/profile']
const nav = (over) => ({ action: 'PUSH', from: '/', to: '/game/ABC', platform: 'web', reduced: false, tabRoutes: TABS, ...over })

describe('routeTransitionKind', () => {
  it('same page (search or modal-marker changes) never animates', () => {
    expect(routeTransitionKind(nav({ to: '/' }))).toBe('none')
  })

  it('forward is push and back is pop on every platform', () => {
    for (const platform of ['web', 'android', 'ios']) {
      expect(routeTransitionKind(nav({ platform }))).toBe('push')
      expect(routeTransitionKind(nav({ platform, action: 'POP', from: '/game/ABC', to: '/', inAppBack: true }))).toBe('pop')
    }
  })

  it('iOS back that the app did not ask for is the native swipe: no second animation', () => {
    expect(routeTransitionKind(nav({ platform: 'ios', action: 'POP', from: '/solo/connectfour', to: '/' }))).toBe('none')
    // Android system back is not animated by the WebView, so it still pops.
    expect(routeTransitionKind(nav({ platform: 'android', action: 'POP', from: '/solo/connectfour', to: '/' }))).toBe('pop')
  })

  it('tab to tab: instant on iOS, its own transition elsewhere', () => {
    expect(routeTransitionKind(nav({ platform: 'ios', from: '/', to: '/games' }))).toBe('none')
    expect(routeTransitionKind(nav({ platform: 'android', from: '/', to: '/games' }))).toBe('tab')
    expect(routeTransitionKind(nav({ platform: 'web', from: '/games', to: '/profile', action: 'POP' }))).toBe('tab')
  })

  it('reduced motion crossfades instead of sliding', () => {
    expect(routeTransitionKind(nav({ reduced: true }))).toBe('fade')
    expect(routeTransitionKind(nav({ reduced: true, platform: 'ios', from: '/', to: '/games' }))).toBe('fade')
  })

  it('replace crossfades', () => {
    expect(routeTransitionKind(nav({ action: 'REPLACE' }))).toBe('fade')
  })
})

describe('isInAppBack', () => {
  it('counts a POP shortly after the app asked to go back', () => {
    expect(isInAppBack(1000, 1100)).toBe(true)
    expect(isInAppBack(1000, 1000 + IN_APP_BACK_WINDOW_MS + 1)).toBe(false)
    expect(isInAppBack(null, 5)).toBe(false)
  })
})
