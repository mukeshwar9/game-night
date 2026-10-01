// @ts-check
// Legacy avatar strings -> kit looks. Pure and total: every old string either maps
// to a look (the four humanoid builders, ~1:1) or is a creature that keeps drawing
// through the frozen classic renderer (returns null).

import { parseAvatar, isHumanoid } from '../avatars.js'
import { DEFAULTS, encodeAvatar } from './catalog.js'

/** Old tone key -> palette ramp (by the picker's names: p1 BLUE, p2 PINK, ...). */
export const TONE_TO_RAMP = /** @type {Record<string, string>} */ ({
  p1: 'blue', p2: 'pink', cta: 'yellow', win: 'green', text: 'white', dim: 'grey', av1: 'orange', av2: 'purple', av3: 'teal', av4: 'brown',
})
const SKIN_MAP = /** @type {Record<string, string>} */ ({ s1: 's2', s2: 's3', s3: 's5', s4: 's7', s5: 's9' })
const HAIR_MAP = /** @type {Record<string, string>} */ ({ none: 'bald', short: 'crop', spiky: 'spiky', long: 'long', bob: 'bob', curly: 'curly' })
const HAIR_COLOUR_MAP = /** @type {Record<string, string>} */ ({
  p1: 'sky', p2: 'pink', cta: 'hblonde', win: 'lime', text: 'hplat', dim: 'hgrey', av1: 'hginger', av2: 'purple', av3: 'teal', av4: 'hbrown',
})
const BACKDROPS = ['sky', 'lime', 'yellow', 'pink', 'teal', 'orange', 'purple']

/** @param {string} s */
function hashOf(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/**
 * Look equivalent to a legacy humanoid id, or null for creatures / unknown ids.
 * @param {string} id
 * @returns {Record<string, string> | null}
 */
export function legacyToLook(id) {
  const { shape, parts } = parseAvatar(id)
  if (!parts || !isHumanoid(shape)) return null
  const hat = parts.acc === 'crown' ? 'crown' : parts.acc === 'headphones' ? 'headphones' : parts.cap !== 'none' ? 'cap' : 'none'
  return {
    ...DEFAULTS,
    skin: SKIN_MAP[parts.skin] || DEFAULTS.skin,
    hair: HAIR_MAP[parts.hair] || 'bald',
    hairColor: HAIR_COLOUR_MAP[parts.hairColor] || DEFAULTS.hairColor,
    hat,
    hatColor: TONE_TO_RAMP[parts.cap] || 'red',
    hatAccent: 'white',
    glasses: parts.acc === 'glasses' ? 'round' : 'none',
    outfit: parts.acc === 'cape' ? 'cape' : shape === 'girl' ? 'dress' : 'casual',
    topColor: TONE_TO_RAMP[parts.shirt] || 'blue',
    bottomColor: TONE_TO_RAMP[parts.pants] || 'grey',
    shoeColor: TONE_TO_RAMP[parts.shoes] || 'white',
    bgColor: BACKDROPS[hashOf(String(id)) % BACKDROPS.length],
  }
}

/** Kit string for a legacy id, or null when it stays a classic creature. @param {string} id */
export function migrateLegacyAvatar(id) {
  const look = legacyToLook(id)
  return look ? encodeAvatar(look) : null
}
