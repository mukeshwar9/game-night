import { getUid } from './auth'

// Player identity is the Firebase Auth uid (anonymous guest or, after upgrade, a
// permanent Google account). The app boots behind authReady() (see AuthContext),
// so a uid is available before any page that calls this renders. The localStorage
// branch is only a fallback for when Firebase Auth is unavailable (e.g. missing
// config), preserving the old offline behaviour.
export function getPlayerId() {
  const uid = getUid()
  if (uid) return uid

  let id = localStorage.getItem('playerId')
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
    localStorage.setItem('playerId', id)
  }
  return id
}
