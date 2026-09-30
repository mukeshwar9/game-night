// Pure logic for the Typing Race game — no DOM/Firebase/React.
import { pickFresh } from './seenHistory'

// Legacy passages remain append-only for rooms whose live round already points
// at an index in this deck. New rounds use the versioned quote deck below.
export const PASSAGES = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. A wizard's job is to vex chumps quickly in fog.",
  "To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment. Never stop being who you are.",
  "Success is not final, failure is not fatal. It is the courage to continue that counts. Keep moving forward and never give up on your dreams.",
  "The only way to do great work is to love what you do. If you have not found it yet, keep looking. Do not settle for less than what makes you happy.",
  "In the middle of every difficulty lies opportunity. Those who dare to fail greatly can achieve greatly. Believe in yourself and your abilities.",
  "Typing fast requires practice, focus, and the right technique. Keep your fingers on the home row, stay relaxed, and let your muscle memory do the work.",
  "The best time to plant a tree was twenty years ago. The second best time is now. Start today and your future self will thank you for the effort.",
  "We are what we repeatedly do. Excellence, then, is not an act but a habit. Small daily improvements over time lead to remarkable results.",
  "All great things are simple, and many can be expressed in single words such as freedom, justice, honor, duty, mercy, and hope. These words guide us.",
  "Life is what happens when you are busy making other plans. Enjoy the little things, for one day you may look back and realize they were the big things.",
  "It does not matter how slowly you go as long as you do not stop. Perseverance and patience are the keys to mastering any skill worth having.",
  "The secret of getting ahead is getting started. Break your tasks into small steps and tackle one at a time. Progress, not perfection, is the goal.",
]

export const TYPING_CONFIG_VERSION = 1
export const TYPING_CONTENT_REVISION = 1
export const TYPING_LENGTHS = Object.freeze(['short', 'medium', 'long'])
export const DEFAULT_TYPING_CONFIG = Object.freeze({
  version: TYPING_CONFIG_VERSION,
  length: 'medium',
  punctuation: false,
  numbers: false,
})

// Original Game Night copy. Keep this indexed deck append-only: room history
// stores quote indexes by revision. The prose is authored for this game.
export const TYPING_QUOTES = Object.freeze([
  { length: 'short', text: 'A patient gardener gives one seed time to become a strong tree.' },
  { length: 'short', text: 'A curious team can turn one bright idea into a useful project.' },
  { length: 'short', text: 'Small steps and kind words can make a busy day feel lighter.' },
  { length: 'medium', text: 'A curious team can turn one careful idea into a bright new project, then share it with the whole neighborhood.' },
  { length: 'medium', text: 'When a friendly plan needs two tries, take a calm breath, learn what changed, and make the next attempt even better.' },
  { length: 'medium', text: 'A clear map, a warm snack, and one good question can help new friends find their way through a long afternoon.' },
  { length: 'long', text: 'When a small team starts with one clear goal, each person can add a useful idea, test it, and help the next person improve it. By the end, simple steps can become a shared result that makes everyone proud.' },
  { length: 'long', text: 'A little practice each day can turn a tricky skill into a comfortable habit. Try one new approach, notice what works, and invite a friend to solve the next puzzle together.' },
  { length: 'long', text: 'On a sunny morning, a group of neighbors planned a garden with three bright paths. They shared tools, listened to each idea, and made room for every visitor to help.' },
])

// Base DNF cutoff for a live quote race (scaled by the room's timer setting).
export const TYPING_RACE_MS = 150_000

// Floor on elapsed time used for WPM math. This avoids extreme values caused
// by same-millisecond finishes or clock skew.
export const MIN_ELAPSED_MS = 1000

const roundOneDecimal = (value) => Math.round(value * 10) / 10
const validInt = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0

export function normalizeTypingConfig(raw) {
  return {
    version: TYPING_CONFIG_VERSION,
    length: TYPING_LENGTHS.includes(raw?.length) ? raw.length : DEFAULT_TYPING_CONFIG.length,
    punctuation: raw?.punctuation === true,
    numbers: raw?.numbers === true,
  }
}

export function isValidTypingConfig(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && raw.version === TYPING_CONFIG_VERSION
    && TYPING_LENGTHS.includes(raw.length)
    && typeof raw.punctuation === 'boolean'
    && typeof raw.numbers === 'boolean'
    && Object.keys(raw).every(key => ['version', 'length', 'punctuation', 'numbers'].includes(key))
}

/** Build the exact versioned passage selected for one round. */
export function generateTypingContent(seed, rawConfig, seen = {}) {
  const config = normalizeTypingConfig(rawConfig)
  const candidates = TYPING_QUOTES
    .map((quote, index) => ({ ...quote, index }))
    .filter(quote => quote.length === config.length)
  const localSeen = {}
  candidates.forEach((quote, index) => {
    if (seen?.[quote.index] != null) localSeen[index] = seen[quote.index]
  })
  const fraction = ((Number(seed) >>> 0) % 1_000_003) / 1_000_003
  const localIndex = pickFresh(candidates.length, localSeen, () => fraction) ?? 0
  const selected = candidates[localIndex] ?? candidates[0]
  let passage = selected.text
  if (!config.punctuation) passage = passage.replace(/[.,!?;:'"“”]/g, '').replace(/\s+/g, ' ').trim()
  if (config.numbers) {
    passage = passage.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, word => {
      const digits = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' }
      return digits[word.toLowerCase()]
    })
  }
  return { passage, quoteIndex: selected.index, config, contentRevision: TYPING_CONTENT_REVISION }
}

/** Count final position-by-position matches; retained for legacy/demo callers. */
export function countCorrectChars(typed, passage) {
  let matches = 0
  const len = Math.min(typed.length, passage.length)
  for (let i = 0; i < len; i++) if (typed[i] === passage[i]) matches++
  return matches
}

/** Legacy integer WPM helper. New race results use attempt-based metrics below. */
export function computeWpm(correctChars, elapsedMs) {
  const minutes = Math.max(elapsedMs, MIN_ELAPSED_MS) / 60_000
  return Math.max(1, Math.round((correctChars / 5) / minutes))
}

/** Legacy final-text accuracy helper. */
export function computeAccuracy(correctChars, passageLength) {
  if (!passageLength) return 100
  return Math.round((correctChars / passageLength) * 100)
}

/** Accuracy-weighted WPM retained only to read results from older rounds. */
export function computeEffWpm(wpm, acc) {
  if (wpm == null || acc == null) return null
  return Math.round((wpm * acc) / 100)
}

export function createTypingProgress() {
  return { typed: '', attempts: 0, correctAttempts: 0, wrongAttempts: 0 }
}

/** Record one printable key. Backspace is deliberately handled separately. */
export function recordTypingAttempt(progress, char, passage) {
  const current = progress ?? createTypingProgress()
  if (typeof char !== 'string' || char.length !== 1 || current.typed.length >= passage.length) return current
  const correct = char === passage[current.typed.length]
  return {
    ...current,
    typed: current.typed + char,
    attempts: validInt(current.attempts) + 1,
    correctAttempts: validInt(current.correctAttempts) + (correct ? 1 : 0),
    wrongAttempts: validInt(current.wrongAttempts) + (correct ? 0 : 1),
  }
}

/** Remove visible text without erasing the attempt history. */
export function eraseTypingText(progress, nextTyped) {
  return { ...(progress ?? createTypingProgress()), typed: String(nextTyped ?? '') }
}

/**
 * Reconcile a whole field value from a real (OS) text input into attempt
 * history. Handles insertion, deletion and replacement (autocorrect or a
 * selection edit) while refusing to grow past the passage. Mobile keyboards
 * report characters through `input` events rather than keydown, so the live
 * race reads the field value and diffs it here instead of counting keystrokes.
 */
export function applyTypingValue(progress, rawValue, passage) {
  const current = progress ?? createTypingProgress()
  let next = typeof rawValue === 'string' ? rawValue : ''
  if (next.length > passage.length) next = next.slice(0, passage.length)
  if (next === current.typed) return current
  // Keep the unchanged head and tail out of the attempt count: only the middle
  // that actually changed was typed again.
  let prefix = 0
  while (prefix < current.typed.length && prefix < next.length && current.typed[prefix] === next[prefix]) prefix++
  let suffix = 0
  while (
    suffix < current.typed.length - prefix && suffix < next.length - prefix
    && current.typed[current.typed.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix++
  let result = eraseTypingText(current, next.slice(0, prefix))
  for (let i = prefix; i < next.length - suffix; i++) result = recordTypingAttempt(result, next[i], passage)
  return suffix ? { ...result, typed: result.typed + next.slice(next.length - suffix) } : result
}

export function typingWpm(charCount, elapsedMs) {
  if (!charCount) return 0
  const minutes = Math.max(validInt(elapsedMs), MIN_ELAPSED_MS) / 60_000
  return roundOneDecimal((charCount / 5) / minutes)
}

/** Attempt-based score. Correct retries count as work; earlier errors remain. */
export function typingMetrics(progress, elapsedMs, passageLength) {
  const attempts = validInt(progress?.attempts)
  const correctAttempts = validInt(progress?.correctAttempts)
  const wrongAttempts = validInt(progress?.wrongAttempts)
  const entered = typeof progress?.typed === 'string' ? progress.typed.length : validInt(progress?.progress)
  return {
    attempts,
    correctAttempts,
    wrongAttempts,
    missed: Math.max(0, passageLength - Math.min(passageLength, entered)),
    rawWpm: typingWpm(attempts, elapsedMs),
    netWpm: typingWpm(correctAttempts, elapsedMs),
    accuracy: attempts ? Math.round((correctAttempts / attempts) * 100) : 0,
    elapsedMs: Math.max(0, validInt(elapsedMs)),
  }
}

/** A passage is complete only when every character matches exactly. */
export function isTypingComplete(typed, passage) {
  return typeof typed === 'string' && typed === passage
}

/** Old passage picker retained for in-progress legacy clients and the demo. */
export function pickPassageIndex(seen, rng = Math.random) {
  return pickFresh(PASSAGES.length, seen, rng) ?? 0
}

// ── N-player race hooks (see raceLogic.js) ────────────────────────────────

export function isTypingDone(stats) {
  return !!stats?.done && (stats?.netWpm != null || stats?.wpm != null)
}

/** Rank by net WPM, then accuracy, then finish time. Exact metric ties tie. */
export function typingRaceEntry(stats) {
  if (!isTypingDone(stats)) return { sortKey: null, score: null }
  if (stats.netWpm != null) {
    return {
      sortKey: [-Number(stats.netWpm), -Number(stats.acc ?? 0), Number(stats.doneAt) || 0],
      score: Number(stats.netWpm),
    }
  }
  // Legacy rounds used EFF-WPM. Preserve their ordering when reading old data.
  const eff = computeEffWpm(Number(stats.wpm), Number(stats.acc ?? 100))
  return { sortKey: [-eff], score: eff }
}

export function typingLiveKey(stats) {
  if (isTypingDone(stats)) return typingRaceEntry(stats).sortKey.map((n, i) => i === 0 ? 0 : n)
  return stats ? [1, -(Number(stats.progress) || 0)] : null
}

export function typingRow(stats, passageLength) {
  const progress = Math.max(0, Number(stats?.progress) || 0)
  const pct = passageLength > 0 ? Math.min(1, progress / passageLength) : 0
  if (isTypingDone(stats)) {
    const wpm = Number(stats.netWpm ?? stats.wpm)
    const raw = Number(stats.rawWpm ?? stats.wpm)
    const acc = Number(stats.acc ?? 100)
    return {
      primary: `${wpm} WPM`,
      secondary: `RAW ${raw} · ${acc}% ACC`,
      progress: 1,
      status: 'done',
      detail: `${stats.wrongAttempts ?? 0} ERR · ${stats.missed ?? 0} MISSED`,
    }
  }
  const liveNet = Number(stats?.netWpm)
  const liveRaw = Number(stats?.rawWpm)
  const secondary = Number.isFinite(liveNet) && Number.isFinite(liveRaw)
    ? `RAW ${liveRaw} · ${stats.acc ?? 0}% ACC`
    : ''
  return {
    primary: secondary ? `${liveNet} WPM` : `${Math.round(pct * 100)}%`,
    secondary,
    progress: pct,
    status: progress > 0 ? 'racing' : 'idle',
    detail: `${Math.round(pct * 100)}%`,
  }
}

/** Build final-round detail without retaining the player's raw typed text. */
export function typingResultBreakdown(stats, passageLength, elapsedMs) {
  if (stats?.attempts != null) {
    const entered = Math.max(0, Number(stats.progress) || 0)
    const finalStats = {
      attempts: stats.attempts,
      correctAttempts: stats.correctAttempts,
      wrongAttempts: stats.wrongAttempts,
      progress: entered,
    }
    return {
      ...typingMetrics(finalStats, stats.done ? (stats.elapsedMs ?? elapsedMs) : elapsedMs, passageLength),
      completed: isTypingDone(stats),
      legacy: false,
    }
  }
  const oldWpm = Number(stats?.wpm) || 0
  return {
    attempts: null,
    correctAttempts: null,
    wrongAttempts: null,
    missed: Math.max(0, passageLength - Math.min(passageLength, Number(stats?.progress) || 0)),
    rawWpm: oldWpm,
    netWpm: oldWpm,
    accuracy: Number(stats?.acc) || 0,
    elapsedMs: Math.max(0, elapsedMs),
    completed: isTypingDone(stats),
    legacy: true,
  }
}
