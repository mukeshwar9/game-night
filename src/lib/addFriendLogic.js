// @ts-check
// "+ ADD AS FRIEND" on the result screen: whether to offer it for a co-player,
// and the small memory of requests this device already sent. Pure: no DOM,
// Firebase or React. Unit-tested in addFriendLogic.test.js.

/** How long a sent request is remembered (a request nobody answers is not retried sooner). */
export const SENT_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Entries kept in the sent memory (oldest dropped first). */
const MAX_SENT = 40

/**
 * @typedef {'offer' | 'sent' | 'hidden'} FriendOffer
 */

/**
 * What the result screen shows for a co-player.
 *  - 'offer'  the button
 *  - 'sent'   REQUEST SENT (this device sent one)
 *  - 'hidden' nothing: no co-player, yourself, already friends, they already
 *             asked you (the Friends page has ACCEPT), or you muted/blocked them
 * Friends / incoming lists are `null` until they have loaded, which also hides
 * the button so it never flashes for someone who is already a friend.
 * @param {{
 *   myUid?: string | null,
 *   otherUid?: string | null,
 *   friendUids: string[] | null,
 *   incomingUids: string[] | null,
 *   sentUids?: string[],
 *   muted?: boolean,
 * }} p
 * @returns {FriendOffer}
 */
export function friendOffer({ myUid, otherUid, friendUids, incomingUids, sentUids = [], muted = false }) {
  if (!myUid || !otherUid || myUid === otherUid) return 'hidden'
  if (!friendUids || !incomingUids) return 'hidden'
  if (muted) return 'hidden'
  if (friendUids.includes(otherUid) || incomingUids.includes(otherUid)) return 'hidden'
  return sentUids.includes(otherUid) ? 'sent' : 'offer'
}

/**
 * Parses the stored sent memory ({ uid: sentAtMs }) and drops expired or
 * malformed entries.
 * @param {string | null | undefined} raw
 * @param {number} now
 * @returns {Record<string, number>}
 */
export function parseSent(raw, now) {
  /** @type {Record<string, number>} */
  const out = {}
  if (!raw) return out
  let data
  try { data = JSON.parse(raw) } catch { return out }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out
  for (const [uid, at] of Object.entries(data)) {
    if (typeof at === 'number' && Number.isFinite(at) && now - at < SENT_TTL_MS && at <= now + 60_000) out[uid] = at
  }
  return out
}

/**
 * Records a sent request. Returns the new map; keeps the newest MAX_SENT.
 * @param {Record<string, number>} map
 * @param {string} uid
 * @param {number} now
 */
export function withSent(map, uid, now) {
  const next = { ...map, [uid]: now }
  const entries = Object.entries(next).sort((a, b) => b[1] - a[1]).slice(0, MAX_SENT)
  return Object.fromEntries(entries)
}

/**
 * The other seat's uid in a finished 2P room, or null when it is not a duel the
 * viewer sits in (spectator, solo vs a bot, a seat with no playerId).
 * @param {{ X?: { playerId?: string }, O?: { playerId?: string } } | null | undefined} players
 * @param {string | null | undefined} mySymbol
 * @returns {string | null}
 */
export function coPlayerUid(players, mySymbol) {
  if (mySymbol !== 'X' && mySymbol !== 'O') return null
  const uid = players?.[mySymbol === 'X' ? 'O' : 'X']?.playerId
  return typeof uid === 'string' && uid ? uid : null
}
