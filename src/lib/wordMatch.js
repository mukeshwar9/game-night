// Loose word comparison for clue games: "is this the same word?" once case,
// accents, punctuation, plurals and common verb endings are ignored.
// Just One cancels near-identical clues with it; Code Words rejects clues
// that are (a form of) a word on the board.
//
// Deliberately small and conservative — a false "same" cancels a good clue
// or blocks a legal one, so only suffixes that almost never change meaning
// are stripped: plural -s/-es/-ies, -ing, -ed, a trailing silent -e, and the
// consonant doubling those leave behind ("running" → "run").
//
// Pure — no DOM/Firebase/React.

/** Lowercase, strip accents, keep only a–z. */
export function normalizeWord(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
}

/**
 * One word: letters only, optionally joined by single hyphens/apostrophes
 * ("t-rex", "o'clock"). No spaces, digits or other symbols.
 */
export function isSingleWord(raw) {
  const s = String(raw ?? '').trim()
  return /^[\p{L}]+(?:['’-][\p{L}]+)*$/u.test(s)
}

const undouble = (w) => (/([b-df-hj-np-tv-z])\1$/.test(w) ? w.slice(0, -1) : w)

/** Crude stem: see the header comment for exactly what is stripped. */
export function stemWord(raw) {
  let w = normalizeWord(raw)
  if (w.length <= 3) return w
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`
  else if (/(?:ss|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2)
  else if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1)
  if (w.endsWith('ing') && w.length >= 6) w = undouble(w.slice(0, -3))
  else if (w.endsWith('ed') && w.length >= 5) w = undouble(w.slice(0, -2))
  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1)
  return w
}

/** Same word once case, plurals and simple endings are ignored. */
export function sameFamily(a, b) {
  const sa = stemWord(a)
  const sb = stemWord(b)
  return sa.length > 0 && sa === sb
}

/**
 * Is one word built on the other — same family, or a compound where the
 * shorter word (4+ letters) is the start or end of the longer one ("fire" /
 * "firefly", "flower" / "sunflower")? Short words (≤ 3 letters) only match
 * exactly, so "ant" doesn't collide with "elephant".
 */
export function overlapsWord(a, b) {
  if (sameFamily(a, b)) return true
  const na = normalizeWord(a)
  const nb = normalizeWord(b)
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (short.length < 4) return false
  return long.startsWith(short) || long.endsWith(short)
}
