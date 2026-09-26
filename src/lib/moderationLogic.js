// Pure moderation helpers for text other players will see: chat messages,
// display names, and the local mute list. No DOM, Firebase or React —
// unit-tested in moderationLogic.test.js. The storage-backed mute list lives
// in mute.js; the word list itself is moderationDenylist.js.
//
// Matching reuses moderationDenylist's whole-word policy (see isDenied): a word is
// masked only when it IS a denied term, never because it contains one, so
// "Scunthorpe", "cocktail" and "therapist" pass. On top of that, a run of
// single characters spelled out with spaces or dots ("f u c k", "f.u.c.k")
// is joined and checked as one word.

import { DENYLIST, isDenied } from './moderationDenylist'

export const MASK = '•••'
export const DISPLAY_NAME_MAX = 20
// Oldest mutes are dropped past this so localStorage can't grow unbounded.
export const MUTED_CAP = 200

// A "word" is a run of letters, digits and the look-alike symbols moderationDenylist
// decodes (sh1t, b!tch, a$$hole); anything else separates words.
const WORD_RE = /[\p{L}\p{N}@$!|]+/gu
// Separators allowed between the letters of a spelled-out word.
const SPELL_GAP = /^[ .\-_*]$/
const MIN_SPELLED = 3
// No window longer than the longest denied word can match, which keeps the
// spelled-run scan linear in the run length.
const MAX_SPELLED = Math.max(...[...DENYLIST].map(w => w.length))

function wordTokens(text) {
  return [...text.matchAll(WORD_RE)].map(m => ({ start: m.index, end: m.index + m[0].length, value: m[0] }))
}

// Ranges [start, end) of text to mask: each denied word, plus any window of a
// spelled-out run whose joined letters form a denied word.
function deniedRanges(text, tokens) {
  const ranges = []
  for (const t of tokens) if (isDenied(t.value)) ranges.push([t.start, t.end])

  let i = 0
  while (i < tokens.length) {
    let j = i
    while (
      j + 1 < tokens.length
      && [...tokens[j].value].length === 1
      && [...tokens[j + 1].value].length === 1
      && SPELL_GAP.test(text.slice(tokens[j].end, tokens[j + 1].start))
    ) j++
    const run = tokens.slice(i, j + 1)
    if (run.length >= MIN_SPELLED) {
      // Longest denied window from each start; skip past it once found.
      for (let a = 0; a <= run.length - MIN_SPELLED; a++) {
        for (let b = Math.min(run.length, a + MAX_SPELLED); b - a >= MIN_SPELLED; b--) {
          const joined = run.slice(a, b).map(t => t.value).join('')
          if (isDenied(joined)) {
            ranges.push([run[a].start, run[b - 1].end])
            a = b - 1
            break
          }
        }
      }
    }
    i = j + 1
  }
  return ranges.sort((x, y) => x[0] - y[0])
}

// ---------------------------------------------------------------------------
// moderateText — masks every denied word with MASK, keeping everything else
// (spacing, punctuation, casing) as typed. `flagged` is true when anything was
// masked. Non-strings become ''.
// ---------------------------------------------------------------------------
export function moderateText(text) {
  if (typeof text !== 'string' || !text) return { text: '', flagged: false }
  const ranges = deniedRanges(text, wordTokens(text))
  if (ranges.length === 0) return { text, flagged: false }
  let out = ''
  let pos = 0
  for (const [start, end] of ranges) {
    if (start < pos) continue // overlapping range already masked
    out += text.slice(pos, start) + MASK
    pos = end
  }
  out += text.slice(pos)
  return { text: out, flagged: true }
}

// Invisible and control characters that would let a name look blank or
// impersonate another ("Bob" + U+200B): C0/C1 controls, zero-width and
// directional marks, word joiners and the BOM.
function isInvisible(ch) {
  const c = ch.codePointAt(0)
  return c < 0x20 || (c >= 0x7f && c <= 0x9f)
    // 0x200D (zero-width joiner) is kept: emoji sequences need it.
    || (c >= 0x200b && c <= 0x200c) || (c >= 0x200e && c <= 0x200f) || (c >= 0x2028 && c <= 0x202f)
    || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff
}

export const NAME_REJECT_MESSAGES = {
  empty: "NAME CAN'T BE EMPTY.",
  denied: 'PICK A FRIENDLIER NAME — THAT ONE ISN’T ALLOWED.',
}

// ---------------------------------------------------------------------------
// sanitizeDisplayName — trims, strips invisible characters, collapses
// whitespace and caps at DISPLAY_NAME_MAX. Returns { name, reason }: `name`
// is the cleaned string, or null with `reason` 'empty' | 'denied' when it
// can't be used. A name is denied when any word in it is, or when its letters
// run together spell a denied word ("F.U.C.K", "Fuck Face").
// ---------------------------------------------------------------------------
export function sanitizeDisplayName(raw) {
  if (typeof raw !== 'string') return { name: null, reason: 'empty' }
  const cleaned = [...raw].filter(ch => !isInvisible(ch)).join('')
    .trim().replace(/\s+/g, ' ')
  const capped = [...cleaned].slice(0, DISPLAY_NAME_MAX).join('').trim()
  if (!capped.replace(/\u200d/g, '').trim()) return { name: null, reason: 'empty' }
  if (moderateText(capped).flagged || isDenied(capped)) return { name: null, reason: 'denied' }
  return { name: capped, reason: null }
}

// ---------------------------------------------------------------------------
// Local mute list — a plain { [uid]: { name, at } } map, persisted by mute.js.
// ---------------------------------------------------------------------------

// Tolerant read of the stored JSON: anything malformed becomes {}, and
// entries without a usable uid key are dropped.
export function parseMutedMap(raw) {
  let value = raw
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw) } catch { return {} }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [uid, entry] of Object.entries(value)) {
    if (!uid) continue
    out[uid] = {
      name: typeof entry?.name === 'string' ? entry.name.slice(0, 40) : '',
      at: typeof entry?.at === 'number' ? entry.at : 0,
    }
  }
  return out
}

// Returns a new map with `uid` muted (if it wasn't) or unmuted (if it was),
// trimmed to MUTED_CAP by dropping the oldest mutes.
export function toggleMutedMap(map, uid, name = '', now = Date.now()) {
  const next = { ...(map || {}) }
  if (!uid) return next
  if (next[uid]) {
    delete next[uid]
    return next
  }
  next[uid] = { name: String(name || '').slice(0, 40), at: now }
  const uids = Object.keys(next)
  if (uids.length > MUTED_CAP) {
    uids.sort((a, b) => next[a].at - next[b].at)
    for (const old of uids.slice(0, uids.length - MUTED_CAP)) delete next[old]
  }
  return next
}

// Muted players, most recently muted first.
export function mutedList(map) {
  return Object.entries(map || {})
    .map(([uid, entry]) => ({ uid, name: entry?.name || '', at: entry?.at || 0 }))
    .sort((a, b) => b.at - a.at)
}
