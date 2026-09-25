// Card-face identity for Pairs: every face gets its own colour AND its own pixel
// silhouette (the creature glyph from avatarSprites.js), so two faces never look alike
// even to a colour-blind player — the silhouette is the primary cue, colour the fast one.
//
// Colours are a dedicated, theme-independent palette (`--c-pair-{face}` in
// src/index.css, one `:root` block outside the theme overrides) because physical-card
// faces should read the same on every theme; the card back, borders and owner marks
// stay on the theme tokens. The sprite is drawn in `--c-pair-ink` on top of the face
// colour, so every entry below must stay light enough for dark ink to read on it.

import { CREATURE_GLYPHS } from './avatarSprites'
import { PAIRS_FACES } from './pairsLogic'

// Spoken name per face, used in aria-labels and the match announcement.
export const PAIRS_FACE_NAMES = {
  heart: 'heart',
  mushroom: 'mushroom',
  robot: 'robot',
  crown: 'crown',
  star: 'star',
  bolt: 'lightning bolt',
  frog: 'frog',
  dino: 'dinosaur',
  fish: 'fish',
  moon: 'moon',
  ufo: 'flying saucer',
  alien: 'alien',
  wizard: 'wizard',
  invader: 'space invader',
  cat: 'cat',
  ninja: 'ninja',
  skull: 'skull',
  ghost: 'ghost',
}

// CSS colour expression for a face's card colour (opacity optional).
export function pairsFaceColor(face, alpha) {
  const v = `var(--c-pair-${PAIRS_FACES.includes(face) ? face : 'ghost'})`
  return alpha === undefined ? `rgb(${v})` : `rgb(${v} / ${alpha})`
}

export function pairsFaceName(face) {
  return PAIRS_FACE_NAMES[face] || 'card'
}

// The 8×8 silhouette rows ('#' ink, 'o' knock-out, '.' empty) for a face.
export function pairsFaceGlyph(face) {
  return CREATURE_GLYPHS[face] || CREATURE_GLYPHS.invader
}

// Row/column phrasing shared by every cell label ("row 2, column 5").
export function pairsCellPosition(index, size) {
  return `row ${Math.floor(index / size) + 1}, column ${(index % size) + 1}`
}
