// @ts-check
// The solo ARTILLERY bot, pure and tested. NORMAL is the closed-form guess the
// demo has always used: aim from the gap alone, with a small fixed wobble, and
// no regard for wind. EASY wobbles much more. HARD tries a grid of shots on the
// real simulator (wind and terrain included) and fires the best one.

import { simulateShot } from './artilleryLogic'

/**
 * What each CPU level changes: the size of the wobble added to angle and power
 * (`wobble`, in degrees / power points) and whether the bot simulates its
 * candidate shots (`search`). NORMAL is the original bot.
 */
export const ARTILLERY_BOT_LEVELS = {
  easy:   { wobble: 24, search: false },
  normal: { wobble: 3,  search: false },
  hard:   { wobble: 6,  search: true },
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/**
 * The gap-only guess. `wobble` is the amplitude of the shot-index-seeded
 * noise (3 is the original).
 * @param {number} tankX
 * @param {number} targetX
 * @param {number} shotIndex
 * @param {number} wobble
 */
function closedFormAim(tankX, targetX, shotIndex, wobble) {
  const dx = targetX - tankX
  const base = Math.round(45 + Math.abs(dx) * 40)
  const power = clamp(Math.round(Math.abs(dx) * 130), 20, 100)
  const noise = (((shotIndex * 37) % 7) - 3) * (wobble / 3)
  return {
    angleDeg: clamp(Math.round(base + noise), 5, 90),
    power: clamp(Math.round(power + noise), 10, 100),
  }
}

/**
 * Try a grid of shots on the real simulator and keep the one that hurts the
 * target most (and itself least); a miss is ranked by how near it lands.
 * @param {any} state  tanks, terrain, seed, shotIndex as simulateShot reads them
 * @param {'X'|'O'} by
 * @param {number} wobble
 * @param {number} shotIndex
 */
function searchAim(state, by, wobble, shotIndex) {
  const target = by === 'X' ? 'O' : 'X'
  const targetX = state.tanks[target].x
  let best = { angleDeg: 45, power: 60 }
  let bestScore = -Infinity
  for (let angleDeg = 15; angleDeg <= 85; angleDeg += 5) {
    for (let power = 20; power <= 100; power += 5) {
      const { record } = simulateShot(state, { by, angleDeg, power })
      const score = record.damage[target] * 3 - record.damage[by] * 3 - Math.abs(record.impact.x - targetX)
      if (score > bestScore) { bestScore = score; best = { angleDeg, power } }
    }
  }
  const noise = (((shotIndex * 37) % 7) - 3) * (wobble / 3)
  return {
    angleDeg: clamp(Math.round(best.angleDeg + noise), 5, 90),
    power: clamp(Math.round(best.power + noise), 10, 100),
  }
}

/**
 * The shot the bot fires: { angleDeg, power }.
 * @param {any} state  { tanks, terrain, seed, shotIndex }
 * @param {'X'|'O'} [by]  the bot's side (the demo's bot is O)
 * @param {'easy'|'normal'|'hard'} [level]
 */
export function pickArtilleryShot(state, by = 'O', level = 'normal') {
  const tune = ARTILLERY_BOT_LEVELS[level] ?? ARTILLERY_BOT_LEVELS.normal
  const shotIndex = state.shotIndex ?? 0
  if (tune.search) return searchAim(state, by, tune.wobble, shotIndex)
  const target = by === 'X' ? 'O' : 'X'
  return closedFormAim(state.tanks[by].x, state.tanks[target].x, shotIndex, tune.wobble)
}
