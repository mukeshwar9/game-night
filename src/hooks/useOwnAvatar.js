import { useAuth } from '../lib/AuthContext'
import { getPlayerId } from '../lib/playerId'
import { canonicalAvatarId, decodeAvatar, defaultAvatarForId, encodeAvatar, isKitAvatar } from '../lib/avatarKit'

// The player's own saved avatar (profile first, then the synchronous mirror), as a
// canonical kit string when they wear a kit look. Critters stay critters.
export default function useOwnAvatar() {
  const { profile } = useAuth()
  let local = ''
  try { local = localStorage.getItem('playerAvatar') || '' } catch { /* storage blocked */ }
  return canonicalAvatarId(profile?.avatar || local || defaultAvatarForId(getPlayerId()))
}

/** The look an item would give: the player's kit look with one field swapped. Critters borrow the default kit look. @param {string} avatar @param {string} field @param {string} id */
export function lookWith(avatar, field, id) {
  const base = isKitAvatar(avatar) ? avatar : defaultAvatarForId(getPlayerId())
  return encodeAvatar({ ...decodeAvatar(base), [field]: id })
}
