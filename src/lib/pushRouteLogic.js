// @ts-check
// Where a tapped push notification should open. Pure: the native listener in
// native/nativePush.js hands the notification's data payload here and passes
// the result to requestNavigate(). The payload comes from the network, so only
// an in-app game route is ever returned.

// Room ids are short tokens (generateGameId makes 6 upper-case alphanumerics);
// sendInvitePush caps them at 40 characters. The character set is the subset
// that is safe in a URL path segment and in an RTDB key.
const GAME_ID_RE = /^[A-Za-z0-9_-]{1,40}$/

/** @param {unknown} id */
export function isValidGameId(id) {
  return typeof id === 'string' && GAME_ID_RE.test(id)
}

// Screens a push may open besides a room (friend requests open /friends).
const SCREEN_PATHS = ['/friends']

/**
 * `/game/:gameId` for a notification's data (or one of SCREEN_PATHS), or null
 * when it carries nothing openable (a bare `/` link, a missing payload,
 * anything off-site). Reads `gameId` first, then the `url` the senders also
 * send (`/game/ABC123`, `/friends`).
 * @param {unknown} data
 * @returns {string | null}
 */
export function pathFromPushData(data) {
  if (!data || typeof data !== 'object') return null
  const d = /** @type {Record<string, unknown>} */ (data)
  if (isValidGameId(d.gameId)) return `/game/${d.gameId}`
  if (typeof d.url !== 'string') return null
  if (SCREEN_PATHS.includes(d.url)) return d.url
  const m = /^\/game\/([^/?#]+)\/?(?:[?#].*)?$/.exec(d.url)
  return m && isValidGameId(m[1]) ? `/game/${m[1]}` : null
}
