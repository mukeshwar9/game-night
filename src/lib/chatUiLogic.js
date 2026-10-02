// @ts-check
// Pure helpers for the room's chat and reactions UI — no DOM, Firebase or
// React. Unit-tested in chatUiLogic.test.js.

// Reactions are a short append-only list under games/{id}/emotes/{pushId}
// (one write per reaction, so two players reacting at once never overwrite
// each other the way the old single `emote` slot did). Senders prune it back
// to this many entries; the chat Cloud Function prunes it too.
export const EMOTES_CAP = 12

// Minimum gaps the database rules enforce through the chatLast/emoteLast
// server-time stamps (database.rules.json). The client waits a little longer
// (CHAT_CLIENT_GAP_MS / EMOTE_CLIENT_GAP_MS) so a normal tap never trips them.
export const CHAT_RULE_GAP_MS = 1500
export const EMOTE_RULE_GAP_MS = 400
export const CHAT_CLIENT_GAP_MS = 2000
export const EMOTE_CLIENT_GAP_MS = 600

// How long a floated chat line stays up: long enough to read. A fixed 2s cut
// a 60-character line off mid-read.
export const FLOAT_BASE_MS = 2000
export const FLOAT_PER_CHAR_MS = 60
export const FLOAT_MAX_MS = 6500

/** Milliseconds a float stays visible: reactions get the base time, chat
 * lines add per-character reading time, capped. */
export function floatDurationMs(text) {
  const n = typeof text === 'string' ? [...text].length : 0
  return Math.min(FLOAT_MAX_MS, FLOAT_BASE_MS + n * FLOAT_PER_CHAR_MS)
}

/**
 * @typedef {{ by: string, glyph: string, ts: number, name?: string, spectator?: boolean }} Emote
 */

/** Shape guard for one reaction entry (the same checks the rules make). */
export function isValidEmote(e) {
  return !!e && typeof e === 'object'
    && typeof e.by === 'string' && e.by.length > 0 && e.by.length <= 128
    && typeof e.glyph === 'string' && e.glyph.length > 0 && e.glyph.length <= 32
    && typeof e.ts === 'number' && Number.isFinite(e.ts)
}

/**
 * Firebase hands back the reactions list as an object keyed by push id (or
 * nothing). Returns `[key, emote]` pairs, invalid ones dropped, sorted by key
 * — push ids sort in creation order, so this survives senders with skewed
 * clocks. Never Object.values: the key is needed for pruning.
 * @returns {Array<[string, Emote]>}
 */
export function normalizeEmotes(raw) {
  if (!raw || typeof raw !== 'object') return []
  return /** @type {Array<[string, Emote]>} */ (Object.entries(raw).filter(([, e]) => isValidEmote(e)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Keys of the oldest entries to delete so at most `keep` remain. */
export function emoteKeysToPrune(entries, keep = EMOTES_CAP) {
  if (!Array.isArray(entries) || entries.length <= keep) return []
  return entries.slice(0, entries.length - keep).map(([k]) => k)
}

/**
 * Entries that arrived after the ones this client has already floated:
 * everything whose key is not in `seen`. Used by the reaction listener, which
 * latches the list present on join and floats only what comes after.
 */
export function newEmoteEntries(entries, seen) {
  return entries.filter(([k]) => !seen.has(k))
}

/**
 * Unread count for the chat button: messages from other players, newer than
 * the last time this player looked at the chat, not hidden by moderation, and
 * not from someone they blocked. `entries` is normalizeChatLog's output.
 */
export function unreadCount(entries, { lastSeenTs = 0, myUid = '', muted = {} } = {}) {
  let n = 0
  for (const [, m] of entries || []) {
    if (!m || m.by === myUid || m.hidden || muted[m.by]) continue
    if (typeof m.ts === 'number' && m.ts > lastSeenTs) n++
  }
  return n
}

/** Badge text: nothing at 0, the count up to 9, then "9+". */
export function unreadBadge(n) {
  if (!n || n < 1) return ''
  return n > 9 ? '9+' : String(n)
}

// Height of a reaction float (56px emoji + name label), for keeping it on screen.
export const EMOTE_FLOAT_HEIGHT = 72

/**
 * Where a float pops from (viewport px, for a `position: fixed` element).
 * `rect` is the sender's player card (getBoundingClientRect) or null when the
 * page has no card for them (party rooms, real-time arenas). A reaction sits
 * over the card, a chat bubble just below it, both horizontally on the
 * card and kept inside the screen. Without a visible card, floats fall back to
 * a band near the top of the screen on the sender's side, never over the
 * middle of the board.
 * @param {{ top: number, bottom: number, left: number, right: number } | null} rect
 * @param {{ width: number, height: number }} viewport
 * @param {{ kind: 'emote' | 'chat', side: 'left' | 'right' | 'center' }} opts
 * `onCard` says the float sits on the sender's card, so it needs no name label.
 * @returns {{ left: number, top: number, align: 'left' | 'right' | 'center', onCard: boolean }}
 */
export function floatAnchor(rect, viewport, { kind, side }) {
  const w = Math.max(0, viewport.width)
  const h = Math.max(0, viewport.height)
  const gutter = 12
  const visible = !!rect && rect.bottom > 0 && rect.top < h && rect.right > 0 && rect.left < w
  if (visible && rect) {
    const cx = (rect.left + rect.right) / 2
    const left = Math.min(Math.max(cx, gutter), w - gutter)
    const align = cx < w / 3 ? 'left' : cx > (2 * w) / 3 ? 'right' : 'center'
    // `top` is where a reaction's bottom edge sits (it is translated up by its
    // own height): low on the card, so the emoji covers the card rather than
    // the header above it, and never so high it leaves the screen.
    if (kind === 'chat') return { left, top: Math.max(gutter, rect.bottom + 6), align, onCard: true }
    const bottom = rect.top + (rect.bottom - rect.top) * 0.8
    return { left, top: Math.max(gutter + EMOTE_FLOAT_HEIGHT, bottom), align, onCard: true }
  }
  const band = Math.round(h * 0.12)
  const left = side === 'left' ? w * 0.2 : side === 'right' ? w * 0.8 : w / 2
  return { left, top: kind === 'chat' ? band + 56 : Math.max(gutter + EMOTE_FLOAT_HEIGHT, band + 48), align: side, onCard: false }
}
