// Room presence, per connection. Pure — no DOM/Firebase/React.
//
// A seat's presence node (2P: `games/{id}/presence/{X|O}`; party:
// `games/{id}/players/{uid}`) carries:
//   conns:     { [pushId]: connectedAt }  one entry per open connection, each
//                                          removed by its own onDisconnect
//   online:    boolean                    legacy flag, still written for old
//                                          clients; derived from `conns`
//   leftAt:    number                     set by LEAVE mid-match (2P only);
//                                          cleared when the seat reconnects
//   offlineAt: number                     party seats: server time the last
//                                          connection dropped
//
// A second tab closing, or a late onDisconnect from a dead socket, flips the
// legacy `online` to false while another connection is still open — so the
// truth is "any connection exists", with the legacy flag only as a fallback
// for seats written by clients that predate `conns`.

// Offline party seats keep counting toward the room cap for this long, so a
// player whose phone locked or who reloaded isn't bumped by a latecomer.
export const GHOST_GRACE_MS = 60_000

export function hasLiveConn(node) {
  const conns = node?.conns
  return !!conns && typeof conns === 'object' && Object.keys(conns).length > 0
}

// Missing presence counts as online — the codebase-wide `online !== false`
// convention (a seat that never published presence isn't claimable).
export function isSeatOnline(node) {
  if (!node || typeof node !== 'object') return true
  if (hasLiveConn(node)) return true
  if (typeof node.leftAt === 'number') return false
  return node.online !== false
}

// The seat's player tapped LEAVE mid-match and hasn't come back.
export function seatLeft(node) {
  return !!node && typeof node.leftAt === 'number' && !hasLiveConn(node)
}

// What this connection should do after reading its own seat node:
//   'online'   its conn is registered but another connection's onDisconnect
//              (a closed second tab, a late disconnect) wrote the legacy
//              `online: false` — put the flag back for old clients
//   'register' its conn was wiped (an old client's whole-node write) — add a
//              fresh conn with its own onDisconnect
//   null       healthy, or the seat LEFT the match (never undone from here)
export function presenceHeal(node, myConnKey) {
  if (!myConnKey || !node || typeof node !== 'object' || typeof node.leftAt === 'number') return null
  if (!node.conns?.[myConnKey]) return 'register'
  return node.online === false ? 'online' : null
}

// Party seats: an offline seat past the grace window no longer holds a place
// toward `maxPlayers`. A seat without `offlineAt` (old client) is past it.
export function isGhost(player, now = Date.now(), graceMs = GHOST_GRACE_MS) {
  if (!player || typeof player !== 'object') return false
  if (isSeatOnline(player)) return false
  if (typeof player.offlineAt !== 'number') return true
  return now - player.offlineAt >= graceMs
}
