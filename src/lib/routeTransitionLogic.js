// @ts-check
// Which page transition a navigation gets (MotionRouter, MO-07). Pure: the
// router passes in everything it knows. Kinds map to CSS in index.css
// (html[data-route-vt="…"] with View Transitions):
//   push / pop  forward and back: iOS push with parallax, Android shared axis
//               X, web fade-through
//   tab         between two tab-bar screens: Android fade-through, web fade;
//               iOS switches tabs instantly (none), like UITabBarController
//   fade        a calm 150 ms crossfade (reduced motion, replace)
//   none        no animation: same page, or iOS edge-swipe back, which WebKit
//               already animated with its own snapshot

/** @typedef {'push' | 'pop' | 'tab' | 'fade' | 'none'} RouteTransition */

/**
 * @param {{
 *   action: 'PUSH' | 'POP' | 'REPLACE',
 *   from: string, to: string,
 *   platform: 'ios' | 'android' | 'web',
 *   reduced: boolean,
 *   tabRoutes: readonly string[],
 *   inAppBack?: boolean,
 * }} nav `inAppBack`: the app itself asked for this back step (BACK button,
 *   navigate(-1)), as opposed to a browser or system gesture
 * @returns {RouteTransition}
 */
export function routeTransitionKind({ action, from, to, platform, reduced, tabRoutes, inAppBack = false }) {
  if (from === to) return 'none'
  // WebKit's back-forward swipe slides a snapshot of the previous page in by
  // itself; animating again after it would play the transition twice.
  if (action === 'POP' && platform === 'ios' && !inAppBack) return 'none'
  if (reduced) return 'fade'
  if (tabRoutes.includes(from) && tabRoutes.includes(to)) return platform === 'ios' ? 'none' : 'tab'
  if (action === 'POP') return 'pop'
  if (action === 'PUSH') return 'push'
  return 'fade'
}

/** How long after the app asked to go back a POP still counts as that request (ms). */
export const IN_APP_BACK_WINDOW_MS = 800

/**
 * @param {number | null} requestedAt performance.now() of the app's last go(-n), or null
 * @param {number} now
 */
export function isInAppBack(requestedAt, now) {
  return requestedAt != null && now - requestedAt >= 0 && now - requestedAt <= IN_APP_BACK_WINDOW_MS
}
