// @ts-check
// Public surface of the avatar kit. Components import from here.

import { isKitAvatar, decodeAvatar, canonicalKit, defaultKitAvatar, encodeAvatar, DEFAULTS } from './catalog.js'
import { legacyToLook } from './migrate.js'

export * from './catalog.js'
export { renderPixels, composeLayer, isAnimated, VIEWS } from './character.js'
export { migrateLegacyAvatar, legacyToLook, TONE_TO_RAMP } from './migrate.js'
export { RAMPS, RAMP_LABEL, colourAt, SKIN, CLOTH, NATURAL_HAIR, FANTASY_HAIR, PREMIUM_RAMPS, EYE_RAMPS } from './palette.js'
export { W, H } from './compose.js'

/** In-app sizes are integer multiples of the 24px tile. */
export const SIZE_LADDER = [24, 48, 72, 96]

/** Snap a requested pixel size onto the ladder: 16-28 -> 24, 29-47 -> 48, ... @param {number} size */
export function snapSize(size) {
  if (!(size > 0)) return 24
  if (size <= 28) return 24
  if (size <= 56) return 48
  if (size <= 84) return 72
  return 96
}

/**
 * What an avatar string draws as: a kit look (new strings and migrated humanoids)
 * or a classic creature (the 27 legacy critters, frozen). Total - never throws.
 * @param {unknown} id
 * @returns {{ kind: 'kit', look: Record<string, string> } | { kind: 'classic', id: string }}
 */
export function resolveAvatar(id) {
  const key = typeof id === 'string' ? id : ''
  if (isKitAvatar(key)) return { kind: 'kit', look: decodeAvatar(key) }
  const look = key ? legacyToLook(key) : null
  if (look) return { kind: 'kit', look }
  if (!key) return { kind: 'kit', look: { ...DEFAULTS } }
  return { kind: 'classic', id: key }
}

/** Canonical stored form: kit strings re-encoded, migrated humanoids upgraded, creatures untouched. @param {string} id */
export function canonicalAvatarId(id) {
  const r = resolveAvatar(id)
  if (r.kind === 'kit') return encodeAvatar(r.look)
  return id
}

export { canonicalKit, defaultKitAvatar as defaultAvatarForId }
