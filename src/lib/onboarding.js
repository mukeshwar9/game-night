// First-run onboarding gate. The pure predicate is unit-tested; the impure
// wrapper reads localStorage + local rooms so Home can call it in a state
// initializer without touching async code.
import { getRooms } from './profile'

// Pure predicate — show the onboarding iff the visitor is genuinely new.
// Returns false as soon as any "been here before" signal is present.
export function shouldShowOnboarding({ onboarded, playerName, roomsCount }) {
  if (onboarded) return false
  if (playerName) return false
  if (roomsCount > 0) return false
  return true
}

// Impure: reads localStorage and the local rooms list.
export function checkShouldOnboard() {
  try {
    const onboarded = localStorage.getItem('onboarded')
    const playerName = localStorage.getItem('playerName')
    const roomsCount = getRooms().length
    return shouldShowOnboarding({ onboarded, playerName, roomsCount })
  } catch {
    return false
  }
}

export function markOnboarded() {
  try { localStorage.setItem('onboarded', '1') } catch { /* quota */ }
}
