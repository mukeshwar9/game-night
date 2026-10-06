import { startTransition, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Router, UNSAFE_createBrowserHistory as createBrowserHistory } from 'react-router-dom'
import { isReducedMotion } from '../hooks/useMotionPref'
import { motionPlatform } from '../lib/motion'
import { isInAppBack, routeTransitionKind } from '../lib/routeTransitionLogic'
import { TAB_BAR_ROUTES } from './NavBar'

// Longest a View Transition waits for a lazy route to replace its loading
// fallback before animating anyway (the old page stays frozen meanwhile).
const SETTLE_MS = 350

const ROUTE_TRANSITIONS = typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
// The CSS route fade (index.css) is the fallback for browsers without them.
if (ROUTE_TRANSITIONS) document.documentElement.dataset.vtRoutes = ''

// <BrowserRouter> with page transitions (MO-07). It is BrowserRouter's own
// implementation (history + <Router>) with one change: when a navigation
// changes the page, the state update runs inside document.startViewTransition,
// and html[data-route-vt] names the kind (routeTransitionLogic.js) so the CSS
// in index.css can play the platform's transition: an iOS push with parallax,
// Android's shared axis, a fade-through on the web. React Router's own
// `viewTransition` option needs a data router; this app uses the declarative
// one, so the router does it here, for every Link and navigate() at once.
//
// Without View Transitions (iOS before 18) nothing changes: the update runs
// as a React transition, exactly like BrowserRouter, and the CSS route fade
// plays when the new page mounts.
export default function MotionRouter({ children }) {
  const [history] = useState(() => createBrowserHistory({ window, v5Compat: true }))
  const backAt = useRef(null)
  const [state, setState] = useState(() => ({ action: history.action, location: history.location }))
  const current = useRef(null)

  // The app's own back steps (navigate(-1), the BACK chevron) come through
  // navigator.go; a POP without one is the browser's or the system's.
  const navigator = useMemo(() => ({
    createHref: history.createHref.bind(history),
    encodeLocation: history.encodeLocation?.bind(history),
    push: history.push.bind(history),
    replace: history.replace.bind(history),
    go: (n) => { if (n < 0) backAt.current = performance.now(); history.go(n) },
  }), [history])

  useLayoutEffect(() => {
    current.current = history.location
    return history.listen(locationListener(current, backAt, setState))
  }, [history])

  return (
    <Router location={state.location} navigationType={state.action} navigator={navigator}>
      {children}
    </Router>
  )
}

// The history listener: decides the transition kind and applies the new
// location, inside a View Transition when there is one to play.
function locationListener(current, backAt, setState) {
  return ({ action, location }) => {
    const from = current.current.pathname
    current.current = location
    const kind = ROUTE_TRANSITIONS
      ? routeTransitionKind({
          action, from, to: location.pathname, platform: motionPlatform(), reduced: isReducedMotion(),
          tabRoutes: TAB_BAR_ROUTES, inAppBack: isInAppBack(backAt.current, performance.now()),
        })
      : 'none'
    if (action === 'POP') backAt.current = null
    if (kind === 'none') {
      startTransition(() => setState({ action, location }))
      return
    }
    const root = document.documentElement
    root.dataset.routeVt = kind
    const vt = document.startViewTransition(async () => {
      flushSync(() => setState({ action, location }))
      await routeSettled()
    })
    const clear = () => { if (root.dataset.routeVt === kind) delete root.dataset.routeVt }
    vt.finished.then(clear, clear)
    // A skipped transition (hidden tab, a newer one) rejects ready; nothing to report.
    vt.ready.catch(() => {})
  }
}

// Resolves once no lazy route is showing its loading fallback, or after
// SETTLE_MS, whichever comes first. Polls on timers: rendering (and with it
// requestAnimationFrame) is paused while a View Transition's update runs.
function routeSettled() {
  return new Promise((resolve) => {
    const start = performance.now()
    const check = () => {
      if (!document.querySelector('[data-route-fallback]') || performance.now() - start > SETTLE_MS) resolve()
      else setTimeout(check, 16)
    }
    check()
  })
}
