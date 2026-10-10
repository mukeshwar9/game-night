// Quick-start view of a game's rules for the HOW TO PLAY sheet. Long rule
// sets (Wire Crossed is ~735 words, about 1,300px of scrolling on a phone)
// open on three one-sentence bullets, with the full text a tap away; short
// ones keep showing everything.

export const LONG_RULES_WORDS = 200
const QUICK_STEPS = 3
const MAX_BULLET_CHARS = 150

export function wordCount(rules) {
  const text = [rules?.objective, ...(rules?.howToPlay ?? []), rules?.win].filter(Boolean).join(' ')
  return text.split(/\s+/).filter(Boolean).length
}

/** First sentence of a step, trimmed to a bullet-sized length. */
export function firstSentence(step) {
  const text = String(step ?? '').trim()
  const match = text.match(/^.*?[.!?](?=\s|$)/)
  const sentence = match ? match[0] : text
  if (sentence.length <= MAX_BULLET_CHARS) return sentence
  const cut = sentence.slice(0, MAX_BULLET_CHARS - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : cut.length)}…`
}

/**
 * `{ long, bullets }`: `long` when the full text should sit behind a
 * disclosure; `bullets` are the first sentences of the first three steps.
 */
export function quickStart(rules) {
  const steps = rules?.howToPlay ?? []
  return {
    long: wordCount(rules) > LONG_RULES_WORDS,
    bullets: steps.slice(0, QUICK_STEPS).map(firstSentence),
  }
}
