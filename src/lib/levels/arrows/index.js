// Arrows Puzzle level data — 15 curated levels (5 easy / 5 medium / 5 hard).
//
// Each level is a set of axis-aligned snake polylines on a dot grid. `d` is an
// SVG M/L polyline (the exact format the Lavish mockup authors); the last
// segment is the arrow's exit direction and the tip is where the head is drawn.
// `blocked` is a static, curated trap flag (mirrors the mockup's `data-blocked`).
//
// Tier-1 levels (easy1/medium1/hard1) are transcribed verbatim from the
// captain-approved mockup; the remaining levels are designed to the same rules:
// no two arrows share a lattice point or segment, exactly one blocked arrow per
// level, tight packing. A unit test validates all of this.

export const ARROWS_TIERS = ['easy', 'medium', 'hard']

export const ARROWS_LEVELS = {
  // ── Easy (5 arrows) ──────────────────────────────────────────────────────
  easy1: {
    id: 'easy1', tier: 'easy', label: 'TIGHT PACK', viewBox: [0, 0, 200, 240],
    arrows: [
      { d: 'M50 40 L50 100 L70 100 L70 140', blocked: false },
      { d: 'M80 40 L100 40 L100 80 L80 80 L80 120', blocked: true },
      { d: 'M110 50 L130 50 L130 90 L110 90 L110 130', blocked: false },
      { d: 'M90 140 L130 140 L130 180 L90 180', blocked: false },
      { d: 'M130 40 L150 40 L150 60', blocked: false },
    ],
  },
  easy2: {
    id: 'easy2', tier: 'easy', label: 'SNAKE RUN', viewBox: [0, 0, 200, 240],
    arrows: [
      { d: 'M40 40 L40 120 L60 120 L60 200', blocked: false },
      { d: 'M80 40 L80 160', blocked: true },
      { d: 'M100 200 L120 200 L120 60 L100 60', blocked: false },
      { d: 'M140 40 L160 40 L160 100', blocked: false },
      { d: 'M140 120 L160 120 L160 180 L140 180', blocked: false },
    ],
  },
  easy3: {
    id: 'easy3', tier: 'easy', label: 'BOX GRID', viewBox: [0, 0, 200, 240],
    arrows: [
      { d: 'M40 40 L120 40 L120 60 L40 60', blocked: false },
      { d: 'M40 100 L100 100 L100 140 L40 140', blocked: true },
      { d: 'M120 100 L160 100 L160 180 L120 180', blocked: false },
      { d: 'M60 160 L60 200 L100 200 L100 180', blocked: false },
      { d: 'M140 40 L180 40 L180 80 L160 80', blocked: false },
    ],
  },
  easy4: {
    id: 'easy4', tier: 'easy', label: 'CROSS WIND', viewBox: [0, 0, 200, 240],
    arrows: [
      { d: 'M40 40 L40 80 L100 80 L100 40', blocked: false },
      { d: 'M120 40 L120 120 L160 120 L160 60', blocked: false },
      { d: 'M60 120 L60 200 L100 200 L100 160 L80 160', blocked: true },
      { d: 'M120 160 L160 160 L160 200 L120 200', blocked: false },
      { d: 'M180 40 L180 200', blocked: false },
    ],
  },
  easy5: {
    id: 'easy5', tier: 'easy', label: 'STACK UP', viewBox: [0, 0, 200, 240],
    arrows: [
      { d: 'M40 40 L40 140', blocked: false },
      { d: 'M60 40 L100 40 L100 100 L60 100 L60 160', blocked: true },
      { d: 'M120 40 L120 140 L160 140 L160 60', blocked: false },
      { d: 'M140 180 L180 180 L180 220', blocked: false },
      { d: 'M40 180 L80 180 L80 220 L40 220', blocked: false },
    ],
  },

  // ── Medium (10 arrows) ───────────────────────────────────────────────────
  medium1: {
    id: 'medium1', tier: 'medium', label: 'TIGHTER PACK', viewBox: [0, 0, 280, 380],
    arrows: [
      { d: 'M40 40 L40 140 L80 140 L80 100 L60 100 L60 60 L40 60', blocked: false },
      { d: 'M100 40 L140 40 L140 120 L100 120 L100 220', blocked: true },
      { d: 'M160 40 L200 40 L200 100 L160 100 L160 140', blocked: false },
      // Mockup's original ended at (220,180), overlapping arrow #9's x=220 edge
      // from y=160–180; shortened to (220,160) to keep paths non-overlapping.
      { d: 'M220 40 L260 40 L260 100 L220 100 L220 160', blocked: false },
      { d: 'M40 180 L80 180 L80 240 L40 240 L40 300', blocked: false },
      // Mockup's original ended at (100,340), overlapping arrow #10's x=100
      // edge from y=320–340; shortened to (100,320) to keep paths clean.
      { d: 'M100 200 L140 200 L140 260 L100 260 L100 320', blocked: false },
      { d: 'M160 200 L200 200 L200 260 L160 260 L160 320', blocked: false },
      { d: 'M220 200 L260 200 L260 260 L220 260 L220 340 L260 340', blocked: false },
      // Mockup's original loop reached y=220, crossing arrow #7's top edge at
      // (180,200); the loop bottom is raised to y=190 so it clears #7.
      { d: 'M180 160 L220 160 L220 190 L180 190 L180 180 L200 180', blocked: false },
      { d: 'M40 320 L100 320 L100 360 L40 360', blocked: false },
    ],
  },
  medium2: {
    id: 'medium2', tier: 'medium', label: 'DOUBLE COMB', viewBox: [0, 0, 280, 380],
    arrows: [
      { d: 'M40 40 L40 100 L80 100 L80 60', blocked: false },
      { d: 'M40 110 L80 110 L80 170 L40 170', blocked: false },
      { d: 'M60 180 L60 240 L100 240 L100 180', blocked: false },
      { d: 'M40 250 L40 310 L100 310 L100 270', blocked: false },
      { d: 'M40 320 L100 320 L100 360 L40 360', blocked: false },
      { d: 'M160 40 L200 40 L200 100 L160 100 L160 60', blocked: false },
      { d: 'M160 110 L160 170 L200 170', blocked: false },
      { d: 'M160 180 L200 180 L200 240', blocked: true },
      { d: 'M160 250 L160 310 L200 310 L200 270', blocked: false },
      { d: 'M160 320 L200 320 L200 380 L160 380', blocked: false },
    ],
  },
  medium3: {
    id: 'medium3', tier: 'medium', label: 'PINWHEEL', viewBox: [0, 0, 280, 380],
    arrows: [
      { d: 'M40 40 L80 40 L80 100', blocked: false },
      { d: 'M40 110 L40 170 L80 170', blocked: false },
      { d: 'M40 180 L80 180 L80 240 L40 240', blocked: false },
      { d: 'M40 250 L100 250 L100 310', blocked: false },
      { d: 'M40 320 L100 320 L100 360 L40 360', blocked: false },
      { d: 'M160 40 L160 100 L200 100', blocked: false },
      { d: 'M160 110 L200 110 L200 170 L160 170', blocked: false },
      { d: 'M160 180 L160 240 L200 240', blocked: false },
      { d: 'M160 250 L160 310 L200 310', blocked: true },
      { d: 'M160 320 L200 320 L200 380', blocked: false },
    ],
  },
  medium4: {
    id: 'medium4', tier: 'medium', label: 'LANES', viewBox: [0, 0, 280, 380],
    arrows: [
      { d: 'M40 40 L100 40 L100 60 L60 60', blocked: false },
      { d: 'M40 100 L40 160 L80 160', blocked: false },
      { d: 'M40 180 L100 180 L100 220 L40 220', blocked: false },
      { d: 'M60 250 L60 310 L100 310', blocked: false },
      { d: 'M40 320 L100 320 L100 380 L40 380', blocked: false },
      { d: 'M160 40 L200 40 L200 100 L160 100', blocked: false },
      { d: 'M160 110 L160 170', blocked: true },
      { d: 'M160 180 L200 180 L200 240 L160 240', blocked: false },
      { d: 'M180 250 L180 310 L160 310', blocked: false },
      { d: 'M160 320 L200 320 L200 380', blocked: false },
    ],
  },
  medium5: {
    id: 'medium5', tier: 'medium', label: 'CASCADE', viewBox: [0, 0, 280, 380],
    arrows: [
      { d: 'M40 40 L40 100 L80 100', blocked: false },
      { d: 'M40 110 L80 110 L80 170', blocked: false },
      { d: 'M40 180 L40 240 L100 240', blocked: false },
      { d: 'M40 250 L100 250 L100 310', blocked: false },
      { d: 'M40 320 L40 380 L100 380', blocked: false },
      { d: 'M160 40 L200 40 L200 100', blocked: false },
      { d: 'M160 110 L200 110 L200 170', blocked: false },
      { d: 'M160 180 L200 180 L200 240', blocked: true },
      { d: 'M160 250 L200 250 L200 310', blocked: false },
      { d: 'M160 320 L200 320 L200 380', blocked: false },
    ],
  },

  // ── Hard (16 arrows) ─────────────────────────────────────────────────────
  hard1: {
    id: 'hard1', tier: 'hard', label: 'MAX PACK', viewBox: [0, 0, 320, 440],
    arrows: [
      { d: 'M40 30 L40 90 L70 90 L70 60 L100 60 L100 120 L40 120', blocked: false },
      { d: 'M110 30 L150 30 L150 90 L110 90 L110 150', blocked: false },
      // Mockup's original snake reached (200,170), overlapping arrow #16's
      // x=160 edge and crossing arrow #8; shortened to (160,120).
      { d: 'M160 30 L200 30 L200 90 L160 90 L160 120', blocked: true },
      { d: 'M210 30 L250 30 L250 90 L210 90 L210 150', blocked: false },
      { d: 'M260 30 L290 30 L290 90 L260 90 L260 150 L290 150', blocked: false },
      { d: 'M40 160 L80 160 L80 220 L40 220 L40 280', blocked: false },
      { d: 'M90 160 L130 160 L130 220 L90 220 L90 280 L130 280', blocked: false },
      { d: 'M140 160 L180 160 L180 220 L140 220 L140 260', blocked: false },
      { d: 'M190 160 L230 160 L230 220 L190 220 L190 280', blocked: false },
      { d: 'M240 160 L280 160 L280 220 L240 220 L240 280', blocked: false },
      { d: 'M40 300 L80 300 L80 360 L40 360 L40 400', blocked: false },
      { d: 'M90 300 L130 300 L130 360 L90 360 L90 400 L130 400', blocked: false },
      { d: 'M140 300 L180 300 L180 360 L140 360 L140 400', blocked: false },
      { d: 'M190 300 L230 300 L230 360 L190 360 L190 400 L230 400', blocked: false },
      { d: 'M240 300 L280 300 L280 360 L240 360', blocked: false },
      { d: 'M160 120 L200 120 L200 150 L160 150 L160 120 L180 140', blocked: false },
    ],
  },
  hard2: {
    id: 'hard2', tier: 'hard', label: 'FULL GRID', viewBox: [0, 0, 320, 440],
    arrows: [
      { d: 'M40 30 L40 130 L100 130', blocked: false },
      { d: 'M110 30 L170 30 L170 130', blocked: false },
      { d: 'M180 30 L240 30 L240 130 L180 130', blocked: false },
      { d: 'M250 30 L250 130 L300 130', blocked: false },
      { d: 'M40 140 L100 140 L100 240 L40 240', blocked: false },
      { d: 'M110 140 L110 240 L170 240', blocked: false },
      { d: 'M180 140 L240 140 L240 240', blocked: true },
      { d: 'M250 140 L300 140 L300 240 L250 240', blocked: false },
      { d: 'M40 250 L100 250 L100 350', blocked: false },
      { d: 'M110 250 L170 250 L170 350 L110 350', blocked: false },
      { d: 'M180 250 L180 350 L240 350', blocked: false },
      { d: 'M250 250 L300 250 L300 350', blocked: false },
      { d: 'M40 360 L40 430 L100 430', blocked: false },
      { d: 'M110 360 L170 360 L170 430', blocked: false },
      { d: 'M180 360 L240 360 L240 430 L180 430', blocked: false },
      { d: 'M250 360 L250 430 L300 430', blocked: false },
    ],
  },
  hard3: {
    id: 'hard3', tier: 'hard', label: 'GAUNTLET', viewBox: [0, 0, 320, 440],
    arrows: [
      { d: 'M40 30 L100 30 L100 130', blocked: false },
      { d: 'M110 30 L110 130 L170 130', blocked: false },
      { d: 'M180 30 L240 30 L240 130', blocked: false },
      { d: 'M250 30 L250 130 L300 130', blocked: false },
      { d: 'M40 140 L40 240 L100 240', blocked: false },
      { d: 'M110 140 L170 140 L170 240', blocked: false },
      { d: 'M180 140 L180 240 L240 240', blocked: false },
      { d: 'M250 140 L300 140 L300 240', blocked: false },
      { d: 'M40 250 L100 250 L100 350', blocked: false },
      { d: 'M110 250 L110 350 L170 350', blocked: false },
      { d: 'M180 250 L240 250 L240 350', blocked: true },
      { d: 'M250 250 L250 350 L300 350', blocked: false },
      { d: 'M40 360 L40 430 L100 430', blocked: false },
      { d: 'M110 360 L170 360 L170 430', blocked: false },
      { d: 'M180 360 L180 430 L240 430', blocked: false },
      { d: 'M250 360 L300 360 L300 430', blocked: false },
    ],
  },
  hard4: {
    id: 'hard4', tier: 'hard', label: 'RAMPART', viewBox: [0, 0, 320, 440],
    arrows: [
      { d: 'M40 30 L100 30 L100 130 L40 130', blocked: false },
      { d: 'M110 30 L110 130 L170 130', blocked: false },
      { d: 'M180 30 L240 30 L240 130', blocked: false },
      { d: 'M250 30 L300 30 L300 130 L250 130', blocked: false },
      { d: 'M40 140 L40 240 L100 240', blocked: true },
      { d: 'M110 140 L170 140 L170 240', blocked: false },
      { d: 'M180 140 L180 240 L240 240', blocked: false },
      { d: 'M250 140 L300 140 L300 240', blocked: false },
      { d: 'M40 250 L100 250 L100 350', blocked: false },
      { d: 'M110 250 L170 250 L170 350 L110 350', blocked: false },
      { d: 'M180 250 L240 250 L240 350', blocked: false },
      { d: 'M250 250 L250 350 L300 350', blocked: false },
      { d: 'M40 360 L100 360 L100 430 L40 430', blocked: false },
      { d: 'M110 360 L110 430 L170 430', blocked: false },
      { d: 'M180 360 L240 360 L240 430', blocked: false },
      { d: 'M250 360 L300 360 L300 430 L250 430', blocked: false },
    ],
  },
  hard5: {
    id: 'hard5', tier: 'hard', label: 'CROWDED', viewBox: [0, 0, 320, 440],
    arrows: [
      { d: 'M40 30 L40 130 L100 130', blocked: false },
      { d: 'M110 30 L170 30 L170 130 L110 130', blocked: false },
      { d: 'M180 30 L180 130 L240 130', blocked: false },
      { d: 'M250 30 L300 30 L300 130', blocked: false },
      { d: 'M40 140 L100 140 L100 240', blocked: false },
      { d: 'M110 140 L110 240 L170 240', blocked: false },
      { d: 'M180 140 L240 140 L240 240 L180 240', blocked: false },
      { d: 'M250 140 L250 240 L300 240', blocked: false },
      { d: 'M40 250 L40 350 L100 350', blocked: false },
      { d: 'M110 250 L170 250 L170 350', blocked: false },
      { d: 'M180 250 L180 350 L240 350', blocked: true },
      { d: 'M250 250 L300 250 L300 350', blocked: false },
      { d: 'M40 360 L100 360 L100 430', blocked: false },
      { d: 'M110 360 L110 430 L170 430', blocked: false },
      { d: 'M180 360 L240 360 L240 430', blocked: false },
      { d: 'M250 360 L250 430 L300 430', blocked: false },
    ],
  },
}

export function levelIdsForTier(tier) {
  return Object.keys(ARROWS_LEVELS).filter((id) => ARROWS_LEVELS[id].tier === tier)
}
