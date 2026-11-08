// Pure layout and stage helpers for SKETCH's "stage" screen: the drawing is the
// stage, a strip of faces replaces the score table, the word sits above the
// canvas with a timer ring, guesses float over the bottom of the drawing, and
// the match ends on a gallery of every drawing it saw. No DOM, Firebase or
// React; unit-tested.

// ---- Timer ring -------------------------------------------------------------
export const RING_RADIUS = 15
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
export const RING_URGENT_S = 10

/**
 * The ring's state for a deadline. `endsAt` null means timers are off: a full,
 * calm ring with no number. `dash` is the stroke-dashoffset (0 = full ring).
 */
export function ringState(endsAt, totalMs, now) {
  if (endsAt == null) return { fraction: 1, seconds: null, urgent: false, dash: 0 }
  const remaining = Math.max(0, endsAt - now)
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 0
  const seconds = Math.ceil(remaining / 1000)
  return {
    fraction,
    seconds,
    urgent: seconds <= RING_URGENT_S,
    dash: RING_CIRCUMFERENCE * (1 - fraction),
  }
}

// ---- Canvas size ------------------------------------------------------------
// The canvas is square. It should fill the column but leave room for the word,
// the dock (artist) or the guess box (guesser) so the whole stage fits one
// screen, also with the keyboard up.
export const MIN_CANVAS_SIDE = 200
// Heights the stage needs besides the canvas: faces, word line, dock or guess
// box, gaps. Measured on the phone checks; the stage is allowed to scroll a
// little past them rather than shrink the drawing below MIN_CANVAS_SIDE.
export const STAGE_RESERVED_PX = { artist: 232, guesser: 196, watcher: 150 }

/**
 * @param {object} p
 * @param {number} p.availW   width of the column the canvas lives in
 * @param {number} p.viewportH  visual viewport height (shrinks with the keyboard)
 * @param {number} p.stageTop  distance from the top of the screen to the stage, ignored when the keyboard is up
 * @param {boolean} p.keyboardUp
 * @param {'artist'|'guesser'|'watcher'} p.role
 * @returns {number} the canvas side in whole px
 */
export function canvasSide({ availW, viewportH, stageTop = 0, keyboardUp = false, role = 'guesser' }) {
  const w = Math.max(0, Math.floor(availW || 0))
  if (!(viewportH > 0)) return w
  const reserved = STAGE_RESERVED_PX[role] ?? STAGE_RESERVED_PX.guesser
  const room = Math.floor(viewportH - (keyboardUp ? 0 : Math.max(0, stageTop)) - reserved)
  return Math.max(Math.min(w, MIN_CANVAS_SIDE), Math.min(w, room))
}

/** True when the on-screen keyboard has taken a big bite out of the viewport. */
export function isKeyboardUp(layoutH, visualH) {
  return layoutH > 0 && visualH > 0 && layoutH - visualH > 120
}

// ---- Faces ------------------------------------------------------------------
/**
 * One tile per seated player for the strip across the top, in drawing order.
 * `role` is 'artist' | 'solved' | 'guessing'; a face with `offline` is dimmed;
 * `isNew` marks a player outside the round's order (joined mid-match).
 */
export function faceTiles({ players, order, scores, round }) {
  const seats = (order && order.length ? order : Object.keys(players || {}))
  return seats.filter(id => players?.[id]).map(id => {
    const isArtist = round?.artist === id
    const solved = !isArtist && !!round?.correct?.[id]
    return {
      id,
      name: players[id]?.name || '???',
      avatar: players[id]?.avatar,
      score: scores?.[id] || 0,
      role: isArtist ? 'artist' : solved ? 'solved' : 'guessing',
      offline: players[id]?.online === false,
      // seated after the match's drawing order was set: joined mid-match (S10)
      isNew: Array.isArray(round?.order) && round.order.length > 0 && !round.order.includes(id),
    }
  })
}

/** "1 OF 3 GOT IT" for the artist's header. */
export function gotItLabel(correctCount, guesserCount) {
  return `${correctCount} OF ${guesserCount} GOT IT`
}

// ---- Guess bubbles ----------------------------------------------------------
export const MAX_BUBBLES = 4

/**
 * The last few wrong guesses for the bubbles over the drawing, oldest first.
 * `age` is 0 for the newest and grows for older bubbles so the CSS can fade
 * them. Entries are [key, { uid, text }] as the chat feed holds them.
 */
export function recentBubbles(chatEntries, max = MAX_BUBBLES) {
  const tail = (chatEntries || []).slice(-max)
  return tail.map(([key, c], i) => ({ key, uid: c?.uid, text: String(c?.text ?? ''), age: tail.length - 1 - i }))
}

// ---- Gallery ----------------------------------------------------------------
export const GALLERY_CAP = 24

const byKey = ([a], [b]) => (a < b ? -1 : 1)

/** A drawing's strokes and fills as plain arrays, in draw order, ready to store. */
export function compactDrawing(strokes, fills) {
  const s = Object.entries(strokes || {}).sort(byKey)
    .map(([, v]) => ({ c: v?.c ?? 0, w: v?.w ?? 2, p: Array.isArray(v?.p) ? v.p : [] }))
    .filter(v => v.p.length >= 2)
  const f = Object.entries(fills || {}).sort(byKey)
    .map(([, v]) => ({ c: v?.c ?? 0, p: Array.isArray(v?.p) ? v.p : [] }))
    .filter(v => v.p.length >= 2)
  return { strokes: s, fills: f }
}

/** Gallery record for a finished round, or null when nothing was drawn or the word is unknown. */
export function galleryEntry({ round, word, tier, artistName, strokes, fills }) {
  if (!round || !word) return null
  const drawing = compactDrawing(strokes, fills)
  if (drawing.strokes.length === 0 && drawing.fills.length === 0) return null
  return {
    id: `${round.cycle}:${round.artist}`,
    word,
    tier: tier ?? 1,
    artist: round.artist,
    artistName: artistName || '???',
    ...drawing,
  }
}

/** Add (or replace, by id) an entry, keeping only the newest `cap`. */
export function addToGallery(list, entry, cap = GALLERY_CAP) {
  if (!entry) return list || []
  const rest = (list || []).filter(e => e.id !== entry.id)
  return [...rest, entry].slice(-cap)
}

/** Stored gallery for a match: `{ seed, entries }`, or [] for another match's. */
export function galleryFor(stored, matchSeed) {
  if (!stored || stored.seed !== matchSeed || !Array.isArray(stored.entries)) return []
  return stored.entries.filter(e => e && Array.isArray(e.strokes) && Array.isArray(e.fills))
}

// ---- Podium -----------------------------------------------------------------
/**
 * Everyone ranked by score, ties sharing a rank (1, 1, 3), as
 * [{ id, score, rank }]. `order` fixes the order among equal scores.
 */
export function podium(order, scores) {
  const rows = (order || []).map((id, seat) => ({ id, seat, score: scores?.[id] || 0 }))
    .sort((a, b) => (b.score - a.score) || (a.seat - b.seat))
  let rank = 0
  return rows.map((r, i) => {
    if (i === 0 || r.score !== rows[i - 1].score) rank = i + 1
    return { id: r.id, score: r.score, rank }
  })
}
