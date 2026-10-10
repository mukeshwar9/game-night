// @ts-check
// Connects the avatar kit's tiers to the entitlement gate (premium.js).
//   tier 'free'  open for good
//   tier 'earn'  unlocked by play, never sold: not an entitlement, left open here
//   tier 'pass'  premium, Pass only
//   tier 'pack'  premium, sold as the kit pack `avatars-${pack}` (premiumCatalog.js)
// Arrows rewards are the exception, gated by campaign stars (arrowsLock below).
// A gated part or colour ramp becomes the registry-style item
// { kind: 'avatar', id: '<field>:<option>', label, premium: true, pack? }.
import {
  FIELDS, DEFAULTS, optionsFor, optionInfo, isPremiumTier, encodeAvatar,
} from './avatarKit/catalog.js'
import { RAMP_LABEL } from './avatarKit/palette.js'
import { CATEGORIES } from './avatarKit/categories.js'
import { arrowsRewardFor, isArrowsRewardEarned } from './arrowsRewardsLogic.js'

/** @typedef {{ kind: 'avatar', id: string, field: string, option: string, label: string, premium: true, pack?: string, view: 'bust' | 'hero', preview: string }} AvatarItem */

const THUMB = Object.fromEntries(CATEGORIES.flatMap(c => [c.field, ...c.colours.map(r => r.key)].filter(Boolean).map(k => [k, c.thumb])))

/**
 * The gate item for one option of one kit field, or null when it is free or earned.
 * @param {string} field @param {string} option @returns {AvatarItem | null}
 */
export function avatarItem(field, option) {
  const info = optionInfo(field, option)
  if (!isPremiumTier(info.tier)) return null
  const label = RAMP_LABEL[/** @type {keyof typeof RAMP_LABEL} */ (option)] || info.label || option
  /** @type {AvatarItem} */
  const item = {
    kind: 'avatar', id: `${field}:${option}`, field, option, label: String(label).toUpperCase(), premium: true,
    view: THUMB[field] === 'hero' ? 'hero' : 'bust',
    preview: encodeAvatar({ ...DEFAULTS, [field]: option }),
  }
  if (info.tier === 'pack' && info.pack) item.pack = `avatars-${info.pack}`
  return item
}

/**
 * Every gated avatar item for the shop: all premium parts, plus each premium colour
 * ramp once (shown through the hair colour). Colours are gated per field by avatarItem.
 * @returns {AvatarItem[]}
 */
export function avatarShopItems() {
  /** @type {AvatarItem[]} */
  const items = []
  for (const f of FIELDS.filter(x => x.kind === 'part')) {
    for (const option of optionsFor(f.key)) {
      const item = avatarItem(f.key, option)
      if (item) items.push(item)
    }
  }
  for (const option of optionsFor('hairColor')) {
    const item = avatarItem('hairColor', option)
    if (item) items.push({ ...item, id: `ramp:${option}`, label: `${item.label} COLOUR` })
  }
  return items
}

/**
 * Gated items a look wears that the viewer has not unlocked.
 * @param {Record<string, string>} look
 * @param {(item: AvatarItem) => boolean} unlocked
 */
export function lockedInLook(look, unlocked) {
  return FIELDS.flatMap(f => {
    const item = avatarItem(f.key, look[f.key])
    return item && !unlocked(item) ? [item] : []
  })
}

// ── Arrows campaign rewards ────────────────────────────────────────────────
// Earned items stay open to everyone EXCEPT the Arrows rewards, which unlock by
// campaign stars (arrowsRewardsLogic.js). A locked one is a different kind of lock
// from the paywall: it is earned in play, never bought.

/** @typedef {{ kind: 'arrows', field: string, option: string, label: string, stars: number }} ArrowsLock */

/**
 * The Arrows lock for one option, or null when it is not an Arrows reward or the
 * stars already cover it. @param {string} field @param {string} option @param {number} stars @returns {ArrowsLock | null}
 */
export function arrowsLock(field, option, stars) {
  const step = arrowsRewardFor(field, option)
  if (!step || isArrowsRewardEarned(field, option, stars)) return null
  return { kind: 'arrows', field, option, label: String(optionInfo(field, option).label).toUpperCase(), stars: step.stars }
}
