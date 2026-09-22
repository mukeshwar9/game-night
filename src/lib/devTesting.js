// F-51: impure wrapper over the pure dev-testing predicates. Runs once at
// module init (every tab executes its own copy, so each tab resolves its own
// slot). Gating order: import.meta.env.DEV + VITE_DEV_PLAYERS flag + loopback
// hostname → testing mode; ?devPlayer= URL parameter → stored slot. The URL
// slot is persisted to sessionStorage so navigation away from the parameter
// keeps the same player; the launcher always passes an explicit parameter, so
// sessionStorage copy-in on window.open can never hijack the slot.

import {
  DEV_PLAYER_PARAM, SLOT_STORAGE_KEY,
  testingModeEnabled, resolveDevSlot,
} from './devTestingLogic'

const devMode = import.meta.env.DEV
const flag = import.meta.env.VITE_DEV_PLAYERS === '1'

let hostname = ''
try { hostname = window.location.hostname } catch { /* non-browser */ }

export const isTestingMode = testingModeEnabled({ devMode, flag, hostname })

function resolveSlot() {
  if (!isTestingMode) return null
  let param = null
  let stored = null
  try { param = new URLSearchParams(window.location.search).get(DEV_PLAYER_PARAM) } catch { /* no URL */ }
  try { stored = sessionStorage.getItem(SLOT_STORAGE_KEY) } catch { /* private mode */ }
  const slot = resolveDevSlot({ param, stored })
  if (slot && slot !== stored) {
    try { sessionStorage.setItem(SLOT_STORAGE_KEY, slot) } catch { /* private mode */ }
  }
  return slot
}

// 'p1'..'p8' | 'spectator' | null (testing mode active, launcher page / no slot)
export const devSlot = resolveSlot()
