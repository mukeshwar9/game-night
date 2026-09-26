// animalStackBot.js — ANIMAL STACK computer player. Pure — no DOM/Firebase/React.
//
// Monte-Carlo placement search: simulate candidate drops (x, rotation) on a
// copy of the tower and keep the one that disturbs it least. Difficulty is how
// many candidates it tries plus how shaky its hand is when it lets go.
import { runDrop, AIM_LIMIT_CM } from './animalStackLogic'

export const BOT_LEVELS = {
  easy: { label: 'EASY', tries: 8, noiseCm: 45, cap: 180, blurb: 'tries 8 spots, shaky aim' },
  normal: { label: 'NORMAL', tries: 22, noiseCm: 12, cap: 240, blurb: 'tries 22 spots, steady hand' },
  hard: { label: 'HARD', tries: 44, noiseCm: 0, cap: 300, blurb: 'tries 44 spots, no mistakes' },
}

// Flat-ish orientations first: 0°, 90°, 180°, 270°, then the 45° ones.
const ROTS = [0, 6, 12, 18, 3, 21, 9, 15]

/** Candidate drops for piece `k`; `rng` returns [0, 1). Always includes dead centre. */
export function botCandidates(level, k, rng = Math.random) {
  const L = BOT_LEVELS[level] ?? BOT_LEVELS.normal
  const out = [{ k, x: 0, r: 0 }]
  for (let i = 0; i < L.tries; i++) {
    const x = Math.round(rng() * 440 - 220)
    const r = ROTS[Math.floor(rng() * (i < L.tries / 2 ? 4 : ROTS.length))]
    out.push({ k, x, r })
  }
  return out
}

/** Higher is better; a candidate that topples the tower scores -1e6. */
export function scoreCandidate(state, drop, cap = 240) {
  const res = runDrop(state, drop, cap)
  if (res.fell) return -1e6
  let disturbed = 0
  for (let i = 0; i < state.length; i++) {
    const a = state[i], b = res.state[i]
    disturbed += Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.a - b.a) * 0.6
  }
  const me = res.state[res.state.length - 1]
  const tilt = Math.abs(Math.sin(me.a * 2)) // prefer resting flat
  return -disturbed * 10 - tilt * 0.6 - Math.abs(me.x) * 0.25 - me.y * 0.15
}

/** Add hand shake to the chosen x (cm), clamped to the aim range. */
export function jitter(level, drop, rng = Math.random) {
  const L = BOT_LEVELS[level] ?? BOT_LEVELS.normal
  const x = Math.round(drop.x + (rng() * 2 - 1) * L.noiseCm)
  return { ...drop, x: Math.max(-AIM_LIMIT_CM, Math.min(AIM_LIMIT_CM, x)) }
}

/** Synchronous pick (tests / workers). Pages spread scoring across frames. */
export function pickBotDrop(level, state, k, rng = Math.random) {
  const L = BOT_LEVELS[level] ?? BOT_LEVELS.normal
  let best = null, bestScore = -Infinity
  for (const c of botCandidates(level, k, rng)) {
    const s = scoreCandidate(state, c, L.cap)
    if (s > bestScore) { bestScore = s; best = c }
  }
  return jitter(level, best, rng)
}
