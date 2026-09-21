// Pure helpers for free-text room chat. No Firebase, no React — unit-tested
// in chat.test.js.
import { isStickerDataUrl } from './stickers'

// Firebase shape (under games/{gameId}/chatLog):
//   chatLog/{pushId}: { by: uid, name: string, text: string, ts: epoch-ms,
//     img?: sticker data: URL (see stickers.js) }
//
// Messages are appended via Firebase push ids (so ordering is preserved by
// key even when reading a sparse/object-shaped snapshot) and pruned client-
// side to CHAT_LOG_CAP so the log doesn't grow unbounded for the life of a
// room.

// Longest chat message allowed, in characters, after sanitizing.
export const CHAT_MAX_LENGTH = 80

// Maximum number of messages kept in a room's chat log at once.
export const CHAT_LOG_CAP = 30

// ---------------------------------------------------------------------------
// sanitizeChatText — trims, collapses internal whitespace runs (including
// tabs/newlines) to a single space, and clamps to CHAT_MAX_LENGTH. Any
// non-string input (null, undefined, number, object, ...) becomes ''.
// ---------------------------------------------------------------------------
export function sanitizeChatText(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/\s+/g, ' ').slice(0, CHAT_MAX_LENGTH)
}

// ---------------------------------------------------------------------------
// isValidChatMessage — shape guard for a single chat entry, used both when
// reading Firebase snapshots (normalizeChatLog) and by the database rules'
// client-side mirror of the same checks. `text` must be 0..CHAT_MAX_LENGTH
// characters (`''` is legal only beside a valid `img` sticker), `by` a
// nonempty string (the author's uid), `ts` a number, and `img` — when
// present — a sticker data: URL (see stickers.js).
// ---------------------------------------------------------------------------
export function isValidChatMessage(m) {
  if (!m || typeof m !== 'object') return false
  if (typeof m.text !== 'string') return false
  if (m.text.length < 0 || m.text.length > CHAT_MAX_LENGTH) return false
  if (typeof m.by !== 'string' || m.by.length === 0) return false
  if (typeof m.ts !== 'number') return false
  if (m.img !== undefined && !isStickerDataUrl(m.img)) return false
  if (m.text.length === 0 && m.img === undefined) return false
  return true
}

// ---------------------------------------------------------------------------
// normalizeChatLog — Firebase returns either undefined/null (no messages
// yet — empty objects are deleted, per firebase-rules.md), a real array, or
// (more commonly here, since keys are push ids) an object keyed by push id.
// Map by explicit key iteration (Object.entries), never Object.values —
// Object.values would silently drop the key needed for pruning/deletion.
// Invalid entries (failing isValidChatMessage) are dropped; the rest are
// sorted ascending by ts.
// ---------------------------------------------------------------------------
export function normalizeChatLog(raw) {
  if (!raw || typeof raw !== 'object') return []
  const entries = Object.entries(raw).filter(([, msg]) => isValidChatMessage(msg))
  entries.sort((a, b) => a[1].ts - b[1].ts)
  return entries
}

// ---------------------------------------------------------------------------
// chatKeysToPrune — given a ts-ascending [key, msg] list (the output of
// normalizeChatLog), return the keys of the oldest entries beyond `cap` so
// callers can delete them and keep the log bounded. [] when already within
// cap.
// ---------------------------------------------------------------------------
export function chatKeysToPrune(entries, cap = CHAT_LOG_CAP) {
  if (!Array.isArray(entries) || entries.length <= cap) return []
  const excess = entries.length - cap
  return entries.slice(0, excess).map(([key]) => key)
}
