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
