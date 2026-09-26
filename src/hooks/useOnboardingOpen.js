import { useEffect, useSyncExternalStore } from 'react'

// Whether the first-run Onboarding is on screen. App hides the bottom tab bar
// while it is: before a visitor has a name, every tab just routes back to the
// same flow. A count (not a boolean) so overlapping mounts can't clear it early.
let openCount = 0
const listeners = new Set()

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getSnapshot() {
  return openCount > 0
}

function emit() {
  listeners.forEach(fn => fn())
}

// Call from the onboarding component: marks it open for its mounted lifetime.
export function useMarkOnboardingOpen() {
  useEffect(() => {
    openCount += 1
    emit()
    return () => {
      openCount -= 1
      emit()
    }
  }, [])
}

export default function useOnboardingOpen() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
