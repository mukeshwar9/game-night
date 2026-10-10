// @ts-check
// Cup Shuffle: a ball is shown under one cup, the cups swap places, and you tap
// the cup with the ball. Pure; the board animates the swaps.

// Starting values (posture B): 3 cups to level 3, 4 to level 7, then 5; one more
// swap per level; quicker swaps as levels rise, never under 240 ms.
export function cupsForLevel(level) { return level <= 3 ? 3 : level <= 7 ? 4 : 5 }
export function swapsForLevel(level) { return Math.min(20, 2 + level) }
export function swapMsForLevel(level) { return Math.max(240, 620 - level * 30) }

/** @returns {{ cups: number, ball: number, swaps: Array<[number, number]> }} slots are positions 0…cups-1 */
export function dealCups(level, rand = Math.random) {
  const cups = cupsForLevel(level)
  const ball = Math.floor(rand() * cups)
  /** @type {Array<[number, number]>} */
  const swaps = []
  for (let i = 0; i < swapsForLevel(level); i++) {
    const a = Math.floor(rand() * cups)
    let b = Math.floor(rand() * (cups - 1))
    if (b >= a) b += 1
    swaps.push([a, b])
  }
  return { cups, ball, swaps }
}

/** The slot the ball ends in after every swap (the cups at slots a and b trade places). */
export function ballSlotAfter(deal) {
  let slot = deal.ball
  for (const [a, b] of deal.swaps) {
    if (slot === a) slot = b
    else if (slot === b) slot = a
  }
  return slot
}

/** Slot of each cup (by cup id) after the first `k` swaps, for drawing. */
export function cupSlotsAfter(deal, k) {
  const slots = Array.from({ length: deal.cups }, (_, i) => i) // cup id → slot
  for (const [a, b] of deal.swaps.slice(0, k)) {
    const ca = slots.indexOf(a), cb = slots.indexOf(b)
    slots[ca] = b
    slots[cb] = a
  }
  return slots
}

/** Smoothstep: eases a swap in and out so the cups have weight. */
export function easeSwap(/** @type {number} */ p) {
  const x = Math.min(1, Math.max(0, p))
  return x * x * (3 - 2 * x)
}

/**
 * Where one cup is `elapsedMs` into the shuffle, for the 3D board. `slot` is
 * fractional while the cup is mid-swap. `depth` runs -1 (back) to 1 (front):
 * in a swap the cup moving right swings out toward the player and the one
 * moving left swings behind, so the two never pass through each other and the
 * eye can follow either. `hop` (0…1) is how far the cup is off the table.
 * Cups not in the current swap stay put with depth 0 and hop 0.
 * @param {{ cups: number, swaps: Array<[number, number]> }} deal
 * @param {number} cup cup id
 * @param {number} elapsedMs time since the first swap began
 * @param {number} swapMs duration of one swap
 * @returns {{ slot: number, depth: number, hop: number }}
 */
export function cupPose(deal, cup, elapsedMs, swapMs) {
  const total = deal.swaps.length
  const t = Math.max(0, elapsedMs) / swapMs
  const k = Math.min(total, Math.floor(t))
  const from = cupSlotsAfter(deal, k)[cup]
  if (k >= total) return { slot: from, depth: 0, hop: 0 }
  const to = cupSlotsAfter(deal, k + 1)[cup]
  if (to === from) return { slot: from, depth: 0, hop: 0 }
  const e = easeSwap(t - k)
  const arc = Math.sin(Math.PI * e)
  return { slot: from + (to - from) * e, depth: (to > from ? arc : -arc) + 0, hop: arc } // + 0 turns -0 into 0
}
