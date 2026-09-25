// Shared free-text matching for word and party games — pure, no DOM/React.
//
// Players type answers on phone keyboards under a timer, so "dogs" vs "dog",
// "ice-cream" vs "ice cream", "Mac & Cheese" vs "mac and cheese" or a leading
// "a"/"the" must not decide a round. `matchKey` folds all of those into one
// comparison key; `isCloseMatch` adds one-typo tolerance for longer words.
// Herd Mind groups answers by it, Sketch and Password accept guesses by it,
// and Fibbage rejects lies that are really the truth by it.

const ARTICLES = new Set(['a', 'an', 'the'])

// Words ending in "s" that are not plurals of a shorter word we should fold to.
const S_EXCEPTIONS = new Set([
  'news', 'lens', 'series', 'species', 'physics', 'mathematics', 'maths',
  'politics', 'economics', 'athletics', 'gymnastics', 'measles', 'mumps',
  'pants', 'jeans', 'shorts', 'scissors', 'tongs', 'pliers', 'trousers',
  'always', 'perhaps', 'yes', 'this', 'his', 'hers', 'its', 'ours', 'yours',
  'theirs', 'thus', 'plus', 'minus', 'bonus', 'focus', 'virus', 'cactus',
  'octopus', 'status', 'campus', 'census', 'bus', 'gas', 'chaos', 'canvas',
  'atlas', 'alias', 'bias', 'iris', 'tennis', 'basis', 'crisis', 'oasis',
  'analysis', 'axis', 'chess', 'dress', 'glass', 'grass', 'class', 'boss',
  'kiss', 'moss', 'mess', 'less', 'loss', 'cross', 'press', 'stress',
  'princess', 'business', 'mattress', 'fitness', 'wilderness', 'darkness',
  'christmas', 'texas', 'paris', 'mars', 'venus', 'uranus', 'jesus',
  'swiss', 'dais', 'pus', 'us', 'is', 'as', 'was', 'does', 'goes',
  'lotus', 'walrus', 'hippopotamus', 'rhinoceros', 'asparagus', 'hummus',
  'couscous', 'citrus', 'circus', 'platypus', 'thesis', 'emphasis',
])

// "-oes" plurals that fold to "-o" (tomatoes → tomato). Others ("shoes",
// "toes", "canoes") drop only the "s".
const OES_TO_O = new Set([
  'tomatoes', 'potatoes', 'heroes', 'echoes', 'mangoes', 'mosquitoes',
  'volcanoes', 'torpedoes', 'vetoes', 'buffaloes', 'dominoes', 'tornadoes',
])

const IRREGULAR = new Map([
  ['children', 'child'], ['people', 'person'], ['men', 'man'], ['women', 'woman'],
  ['mice', 'mouse'], ['geese', 'goose'], ['feet', 'foot'], ['teeth', 'tooth'],
  ['knives', 'knife'], ['wives', 'wife'], ['leaves', 'leaf'], ['wolves', 'wolf'],
  ['halves', 'half'], ['shelves', 'shelf'], ['loaves', 'loaf'], ['calves', 'calf'],
  ['lives', 'life'], ['thieves', 'thief'], ['elves', 'elf'], ['oxen', 'ox'],
  ['cacti', 'cactus'], ['fungi', 'fungus'], ['dice', 'die'],
])

/** Lowercase, strip accents/punctuation, "&" → "and", collapse whitespace. */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Singular form of one lowercase word (best-effort English rules). */
export function singularize(word) {
  const w = String(word ?? '')
  if (IRREGULAR.has(w)) return IRREGULAR.get(w)
  if (w.length < 3 || !w.endsWith('s') || S_EXCEPTIONS.has(w)) return w
  // "-ss"/"-is" words are singular (glass, basis); so are "-us" words of 5+
  // letters (genius, radius) — short ones are plurals (emus, gnus).
  if (w.endsWith('ss') || w.endsWith('is') || (w.endsWith('us') && w.length >= 5)) return w
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (OES_TO_O.has(w)) return w.slice(0, -2)
  if (/(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2)
  if (w.length >= 4) return w.slice(0, -1)
  // 3-letter "-s" words: fold only clear plurals of 2-letter stems we never
  // want to compare ("ox" etc. handled above) — keep as typed.
  return w
}

/** Comparison key: normalized, leading article dropped, each word
 * singularized, spaces/hyphens removed ("The Hot-Dogs" → "hotdog"). */
export function matchKey(text) {
  const words = normalizeText(text).split(' ').filter(Boolean)
  while (words.length > 1 && ARTICLES.has(words[0])) words.shift()
  return words.map(singularize).join('')
}

/** Levenshtein distance, stopping early once it exceeds `max`. */
export function editDistance(a, b, max = Infinity) {
  const s = String(a ?? '')
  const t = String(b ?? '')
  if (Math.abs(s.length - t.length) > max) return max + 1
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i)
  for (let i = 1; i <= s.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[t.length]
}

/** True when two answers mean the same thing under `matchKey`. */
export function isSameAnswer(a, b) {
  const ka = matchKey(a)
  return ka.length > 0 && ka === matchKey(b)
}

/**
 * Lenient guess check: same `matchKey`, or — when the answer key is at least
 * `typoMinLength` letters — within one edit (a single typo). Short words stay
 * exact so "cat" never accepts "car".
 */
export function isCloseMatch(guess, answer, { typoMinLength = 6 } = {}) {
  const g = matchKey(guess)
  const a = matchKey(answer)
  if (!g || !a) return false
  if (g === a) return true
  if (a.length < typoMinLength) return false
  return editDistance(g, a, 1) <= 1
}
