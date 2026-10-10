// Storage side of the save prompt (see savePromptLogic.js): the once-per-session
// flag lives in sessionStorage, NOT NOW snoozes in localStorage. All wrapped.
import { snoozeUntil } from './savePromptLogic'

const SESSION_KEY = 'gn-save-shown'
const SNOOZE_KEY = 'gn-save-snooze'

export function shownThisSession() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1' } catch { return false }
}

export function markShownThisSession() {
  try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* private mode */ }
}

function readSnoozes() {
  try {
    const o = JSON.parse(localStorage.getItem(SNOOZE_KEY))
    return o && typeof o === 'object' ? o : {}
  } catch { return {} }
}

export function snoozedUntilFor(surface) {
  const t = Number(readSnoozes()[surface])
  return Number.isFinite(t) ? t : 0
}

export function snoozeSurface(surface, now = Date.now()) {
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ ...readSnoozes(), [surface]: snoozeUntil(now) })) } catch { /* quota */ }
}
