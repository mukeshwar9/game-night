// @ts-check
// Editor structure for the kit: which tabs exist, which catalog each shows, and which
// colour rows sit under it. Pure data + helpers so the layout is unit-tested.

import { optionsFor, optionInfo, isPremiumTier, TIER_LABEL, PREMIUM_PACKS } from './catalog.js'
import { RAMP_LABEL, colourAt, PREMIUM_RAMPS } from './palette.js'

/**
 * @typedef {{ key: string, label: string }} ColourRow
 * @typedef {{ id: string, label: string, field?: string, colours: ColourRow[], thumb: 'bust' | 'hero' }} Category
 */

/** Tabs in display order. `field` is the part catalog (absent for colour-only tabs). @type {Category[]} */
export const CATEGORIES = [
  { id: 'skin', label: 'SKIN', colours: [{ key: 'skin', label: 'SKIN TONE' }], thumb: 'bust' },
  { id: 'hair', label: 'HAIR', field: 'hair', colours: [{ key: 'hairColor', label: 'HAIR COLOUR' }], thumb: 'bust' },
  { id: 'eyes', label: 'EYES', field: 'eyes', colours: [{ key: 'eyeColor', label: 'IRIS' }], thumb: 'bust' },
  { id: 'brows', label: 'BROWS', field: 'brows', colours: [], thumb: 'bust' },
  { id: 'mouth', label: 'MOUTH', field: 'mouth', colours: [], thumb: 'bust' },
  { id: 'nose', label: 'NOSE', field: 'nose', colours: [], thumb: 'bust' },
  { id: 'marks', label: 'CHEEKS', field: 'marks', colours: [], thumb: 'bust' },
  { id: 'beard', label: 'BEARD', field: 'beard', colours: [], thumb: 'bust' },
  { id: 'hat', label: 'HEADWEAR', field: 'hat', colours: [{ key: 'hatColor', label: 'MAIN' }, { key: 'hatAccent', label: 'TRIM' }], thumb: 'bust' },
  { id: 'glasses', label: 'GLASSES', field: 'glasses', colours: [], thumb: 'bust' },
  { id: 'extra', label: 'EARRINGS', field: 'extra', colours: [], thumb: 'bust' },
  {
    id: 'outfit', label: 'OUTFIT', field: 'outfit', thumb: 'hero',
    colours: [{ key: 'topColor', label: 'TOP' }, { key: 'bottomColor', label: 'BOTTOM' }, { key: 'shoeColor', label: 'SHOES' }],
  },
  { id: 'pet', label: 'PET', field: 'pet', colours: [], thumb: 'hero' },
  { id: 'bg', label: 'BACKDROP', field: 'bg', colours: [{ key: 'bgColor', label: 'COLOUR' }], thumb: 'bust' },
  { id: 'frame', label: 'FRAME', field: 'frame', colours: [], thumb: 'bust' },
]

/** One option of a tab, with its premium flag. @param {Category} cat */
export function categoryOptions(cat) {
  if (!cat.field) return []
  return optionsFor(cat.field).map((id) => ({ id, ...optionInfo(/** @type {string} */ (cat.field), id) }))
}

/** Colour choices of a row, with premium flag and a display label. @param {string} key */
export function colourOptions(key) {
  return optionsFor(key).map((id) => ({ id, label: RAMP_LABEL[/** @type {keyof typeof RAMP_LABEL} */ (id)] || id.toUpperCase(), premium: PREMIUM_RAMPS.includes(id) }))
}

/** Badge glyph + spoken label for an option's tier ('' for free items). @param {{ tier: string, pack?: string, note?: string }} info */
export function tierBadge(info) {
  if (info.tier === 'pass') return { text: 'PASS ITEM' }
  if (info.tier === 'pack') return { text: PREMIUM_PACKS[/** @type {keyof typeof PREMIUM_PACKS} */ (info.pack || '')] || 'PACK ITEM' }
  if (info.tier === 'earn') return { text: info.note ? `EARNED: ${info.note}` : 'EARNED ITEM' }
  return null
}

export { isPremiumTier, TIER_LABEL }

/**
 * CSS background for a colour swatch: the ramp's base shade, or a gradient sampled
 * across a premium ramp. @param {string} ramp
 */
export function swatchBackground(ramp) {
  if (PREMIUM_RAMPS.includes(ramp)) {
    const stops = [0, 1, 2, 3, 4].map((i) => colourAt(ramp, 2 + (i % 2), i * 5, i * 2, 0))
    return `linear-gradient(135deg, ${stops.map((c) => `rgb(${c.join(' ')})`).join(', ')})`
  }
  const c = colourAt(ramp, 2, 0, 0, 0)
  return `rgb(${c.join(' ')})`
}
