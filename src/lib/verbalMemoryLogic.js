// @ts-check
// Verbal Memory (SEEN or NEW): words come one at a time; say whether this word has
// already come up in this run. Pure; the board owns timing and input.
import { COMMON_WORDS } from './commonWords'
import { isFamilySafe } from './wordDenylist'

export const VB_LIVES = 3

/** @type {string[] | null} */
let poolCache = null
/** Everyday 4–7 letter words, family-safe (the stream never shows anything else). */
export function verbalPool() {
  if (!poolCache) poolCache = COMMON_WORDS.filter(w => w.length >= 4 && w.length <= 7 && isFamilySafe(w))
  return poolCache
}

// Chance the next word is a repeat: none for the first three, then rising slowly
// (starting value, posture B: tune so a median run lasts about 2 minutes).
export function repeatChance(seenCount) {
  return seenCount < 3 ? 0 : Math.min(0.55, 0.3 + seenCount * 0.005)
}

function draw(state, rand) {
  const seen = state.seen
  if (rand() < repeatChance(seen.length)) {
    const options = seen.filter(w => w !== state.current)
    if (options.length) return { current: options[Math.floor(rand() * options.length)], isRepeat: true }
  }
  const pool = verbalPool()
  const seenSet = new Set(seen)
  for (let i = 0; i < 50; i++) {
    const w = pool[Math.floor(rand() * pool.length)]
    if (!seenSet.has(w) && w !== state.current) return { current: w, isRepeat: false }
  }
  const fresh = pool.find(w => !seenSet.has(w))
  return { current: fresh ?? pool[0], isRepeat: false }
}

export function startVerbal(rand = Math.random) {
  const base = { seen: [], current: null, score: 0, lives: VB_LIVES, over: false, last: null }
  return { ...base, ...draw(base, rand) }
}

/** @param {'seen'|'new'} said */
export function answerVerbal(state, said, rand = Math.random) {
  if (state.over) return state
  const correct = (said === 'seen') === state.isRepeat
  const seen = state.isRepeat ? state.seen : [...state.seen, state.current]
  const lives = correct ? state.lives : state.lives - 1
  const next = { ...state, seen, score: state.score + (correct ? 1 : 0), lives, over: lives <= 0, last: { word: state.current, correct, wasRepeat: state.isRepeat } }
  return next.over ? next : { ...next, ...draw(next, rand) }
}
