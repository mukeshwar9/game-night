import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatarKit'

// The local player's name and avatar for a start screen, read the way NavBar
// and Home do: the localStorage mirror of users/{uid}, then the deterministic
// per-uid avatar for a guest who has not picked one yet. Read once per render
// (a synchronous localStorage read), so there is nothing to subscribe to.
export default function useOwnSeat() {
  let name = ''
  let avatar = ''
  try {
    name = localStorage.getItem('playerName') || ''
    avatar = localStorage.getItem('playerAvatar') || ''
  } catch {
    // storage blocked (private mode): fall through to the defaults
  }
  return { name, avatar: avatar || defaultAvatarForId(getPlayerId()) }
}
