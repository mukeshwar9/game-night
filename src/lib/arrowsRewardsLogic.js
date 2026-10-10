// @ts-check
// The Arrows campaign reward ladder: avatar items earned by total campaign stars
// (`totalStars(progress)` in arrowsLevelsLogic.js, 170 levels x 3 = 510 at most).
// This file is the single source of truth for WHICH item unlocks at WHICH star
// count. The art lives in avatarKit (art.js / compose.js), where each item carries
// `earn: { game: 'arrows', stars }`; arrowsRewardsLogic.test.js checks the two agree.
//
// Pure: no DOM, no Firebase, no React, no import of the level generator.

/** @typedef {{ field: string, id: string }} RewardItem */
/** @typedef {{ stars: number, name: string, items: RewardItem[], badge?: string }} RewardStep */

/** Stars that finish the ladder. */
export const ARROWS_REWARD_GOAL = 400

/**
 * Ascending by stars. `name` is the headline of the step ("38 TO ARROW SNAKE").
 * Sets, for copy only: ARROW MASTER (tee, band, crown, gold arrows), PORTAL RUNNER
 * (goggles, rim, sky), HOOK & BAND (field, chase).
 * @type {RewardStep[]}
 */
export const ARROWS_REWARD_LADDER = [
  { stars: 25, name: 'ARROW FIELD', items: [{ field: 'bg', id: 'arrowfield' }] },
  { stars: 100, name: 'ARROW TEE', items: [{ field: 'outfit', id: 'arrowtee' }] },
  { stars: 150, name: 'SNAKE EGG', items: [{ field: 'pet', id: 'snakeegg' }] },
  { stars: 200, name: 'ARROW BAND', items: [{ field: 'hat', id: 'arrowband' }] },
  { stars: 250, name: 'ARROW SNAKE', items: [{ field: 'pet', id: 'arrowsnake' }] },
  { stars: 300, name: 'PORTAL GOGGLES', items: [{ field: 'glasses', id: 'portal' }, { field: 'frame', id: 'portalrim' }] },
  { stars: 325, name: 'PORTAL SKY', items: [{ field: 'bg', id: 'portalsky' }, { field: 'pet', id: 'portalpy' }] },
  { stars: 350, name: 'HOOKY', items: [{ field: 'pet', id: 'hooky' }, { field: 'frame', id: 'arrowchase' }] },
  {
    stars: ARROWS_REWARD_GOAL,
    name: 'ARROW CROWN',
    items: [{ field: 'hat', id: 'arrowcrown' }, { field: 'frame', id: 'goldarrow' }, { field: 'pet', id: 'goldsnake' }],
    badge: 'ARROWS 400★',
  },
]

const stepKey = (/** @type {string} */ field, /** @type {string} */ id) => `${field}:${id}`

/** @type {Map<string, RewardStep>} */
const BY_ITEM = new Map(ARROWS_REWARD_LADDER.flatMap((step) => step.items.map((it) => /** @type {[string, RewardStep]} */ ([stepKey(it.field, it.id), step]))))

/** The ladder step that unlocks a kit option, or null when it is not an Arrows reward. @param {string} field @param {string} id */
export function arrowsRewardFor(field, id) {
  return BY_ITEM.get(stepKey(field, id)) ?? null
}

/** Is the option usable with this many stars? Anything that is not an Arrows reward is always open. @param {string} field @param {string} id @param {number} stars */
export function isArrowsRewardEarned(field, id, stars) {
  const step = arrowsRewardFor(field, id)
  return !step || (Number(stars) || 0) >= step.stars
}

/** Every step reached with this many stars, in ladder order. @param {number} stars */
export function earnedArrowsSteps(stars) {
  const n = Number(stars) || 0
  return ARROWS_REWARD_LADDER.filter((s) => n >= s.stars)
}

/** The next step still ahead and how many stars it needs, or null once the ladder is done. @param {number} stars @returns {{ step: RewardStep, toGo: number } | null} */
export function nextArrowsStep(stars) {
  const n = Number(stars) || 0
  const step = ARROWS_REWARD_LADDER.find((s) => n < s.stars)
  return step ? { step, toGo: step.stars - n } : null
}

/** Steps reached by going from `before` to `after` stars (reaching a threshold exactly counts). Empty when stars did not rise. @param {number} before @param {number} after */
export function crossedArrowsSteps(before, after) {
  const a = Number(before) || 0
  const b = Number(after) || 0
  return ARROWS_REWARD_LADDER.filter((s) => a < s.stars && b >= s.stars)
}

/** Every reward item, flat, in ladder order. @returns {{ field: string, id: string, stars: number, step: RewardStep }[]} */
export function arrowsRewardItems() {
  return ARROWS_REWARD_LADDER.flatMap((step) => step.items.map((it) => ({ field: it.field, id: it.id, stars: step.stars, step })))
}

/** "EARN IT: 250★ IN ARROWS · YOU HAVE 212★" @param {number} need @param {number} have */
export function arrowsLockText(need, have) {
  return `EARN IT: ${need}★ IN ARROWS · YOU HAVE ${Math.max(0, Number(have) || 0)}★`
}

/**
 * Arrows reward items a look wears that these stars have not earned.
 * @param {Record<string, string>} look @param {number} stars
 * @returns {{ field: string, id: string, stars: number }[]}
 */
export function unearnedArrowsInLook(look, stars) {
  return arrowsRewardItems().filter((it) => look[it.field] === it.id && !isArrowsRewardEarned(it.field, it.id, stars))
}

/**
 * The save guard: unearned Arrows items in `next` that `saved` did not already wear.
 * Items already on the saved look stay (progress may simply not have synced yet).
 * @param {Record<string, string>} saved @param {Record<string, string>} next @param {number} stars
 */
export function newUnearnedArrows(saved, next, stars) {
  return unearnedArrowsInLook(next, stars).filter((it) => saved[it.field] !== it.id)
}

// ---------------------------------------------------------------------------
// Motivation UI: the reveal sheet, the hub meter and the STAR HUNT list.

/** localStorage key: the highest ladder step (in stars) already announced on this device. */
export const REWARD_SEEN_KEY = 'gn-arrows-reward-seen'

/** Parse the stored "highest step announced"; anything unusable reads as 0. @param {unknown} raw */
export function parseRewardSeen(raw) {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Steps to announce in one reveal sheet: every step above the highest one already
 * announced that these stars have reached, in ladder order. A result that crosses
 * a step and a player who opens the hub with unannounced steps both use this.
 * @param {number} seenStars @param {number} stars
 */
export function stepsToAnnounce(seenStars, stars) {
  const seen = Number(seenStars) || 0
  const n = Number(stars) || 0
  return ARROWS_REWARD_LADDER.filter((s) => s.stars > seen && s.stars <= n)
}

/** The items of several steps, newest step first, so the first row is the headline reward. @param {RewardStep[]} steps */
export function announcedItems(steps) {
  return [...steps].reverse().flatMap((s) => s.items.map((it) => ({ ...it, stars: s.stars, name: s.name })))
}

/** Where a step sits on the hub meter's track, 0..1. @param {number} stars */
export function meterPosition(stars) {
  return Math.max(0, Math.min(1, (Number(stars) || 0) / ARROWS_REWARD_GOAL))
}

/** Meter copy: "38★ TO ARROW SNAKE", or the finished line past the ladder. @param {number} stars */
export function meterLine(stars) {
  const next = nextArrowsStep(stars)
  return next ? `${next.toGo}★ TO ${next.step.name}` : 'ALL ARROWS REWARDS EARNED'
}

/**
 * What the result panel adds under the stars: "+3★ · 29★ TO PORTAL GOGGLES".
 * `gain` is the rise in total stars (new best stars only); the "+N★" part is
 * left out when there is none.
 * @param {number} before @param {number} after
 */
export function resultRewardLine(before, after) {
  const gain = Math.max(0, (Number(after) || 0) - (Number(before) || 0))
  return `${gain > 0 ? `+${gain}★ · ` : ''}${meterLine(after)}`
}

/** @typedef {{ levels?: Record<string, number> }} StarProgress */

/**
 * STAR HUNT: cleared levels still below three stars, smallest board first (ties by
 * level number), at most `limit`. `sizeOf(n)` is the arrow count and is only called
 * for the candidates, so a player with nothing to hunt costs nothing.
 * @param {StarProgress | null | undefined} progress @param {(n: number) => number} sizeOf @param {number} [limit]
 * @returns {{ n: number, stars: number, size: number }[]}
 */
export function starHuntLevels(progress, sizeOf, limit = 5) {
  const levels = progress?.levels ?? {}
  /** @type {{ n: number, stars: number, size: number }[]} */
  const out = []
  for (const [key, value] of Object.entries(levels)) {
    const n = Number(String(key).replace(/^\D+/, ''))
    const stars = Number(value)
    if (!Number.isInteger(n) || n < 1 || !(stars >= 1 && stars < 3)) continue
    out.push({ n, stars, size: sizeOf(n) })
  }
  out.sort((a, b) => a.size - b.size || a.n - b.n)
  return out.slice(0, Math.max(0, limit))
}
