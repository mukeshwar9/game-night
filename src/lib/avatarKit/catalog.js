// @ts-check
// The avatar wire format and its catalogs.
//
// One short string per player, stored exactly where the old avatar string lived
// (users/{uid}.avatar, profiles/{uid}.avatar, room seats, invites):
//
//   'K1' + one base-36 character per field, in FIELDS order        e.g. 'K1c4a1...'
//
// Each character is the field's index in its append-only catalog (a part id list or
// a colour list). Catalogs are APPEND-ONLY - reordering or deleting an entry changes
// what every saved avatar looks like (catalog.test.js pins the head of each list).
// A string is 25 characters, under every length cap (32 on the leaderboard copy,
// 200 in the rules). Legacy strings ('ghost.p2', 'kid.cta-p2-...')
// have no 'K1' prefix and keep parsing through migrate.js.
//
// Decoding is total: a short string, an unknown prefix version, or an out-of-range
// index falls back per field to DEFAULTS and never throws.

import { SKIN, CLOTH, NATURAL_HAIR, FANTASY_HAIR, EYE_RAMPS, PREMIUM_RAMPS } from './palette.js'
import { PART_CATALOGS } from './character.js'

export const PREFIX = 'K1'

const HAIR_COLOURS = [...NATURAL_HAIR, ...FANTASY_HAIR, ...PREMIUM_RAMPS]
const CLOTH_COLOURS = [...CLOTH, ...PREMIUM_RAMPS]

/** @type {Record<string, string[]>} */
const COLOUR_LISTS = {
  skin: SKIN, hairColor: HAIR_COLOURS, eyeColor: EYE_RAMPS, hatColor: CLOTH_COLOURS, hatAccent: CLOTH_COLOURS,
  topColor: CLOTH_COLOURS, bottomColor: CLOTH_COLOURS, shoeColor: CLOTH_COLOURS, bgColor: CLOTH,
}

/**
 * Field order is wire order. `kind` says whether the character indexes a part
 * catalog or a colour list. APPEND new fields at the end.
 */
export const FIELDS = [
  { key: 'skin', kind: 'colour' },
  { key: 'hair', kind: 'part' },
  { key: 'hairColor', kind: 'colour' },
  { key: 'eyes', kind: 'part' },
  { key: 'eyeColor', kind: 'colour' },
  { key: 'brows', kind: 'part' },
  { key: 'nose', kind: 'part' },
  { key: 'mouth', kind: 'part' },
  { key: 'marks', kind: 'part' },
  { key: 'beard', kind: 'part' },
  { key: 'hat', kind: 'part' },
  { key: 'hatColor', kind: 'colour' },
  { key: 'hatAccent', kind: 'colour' },
  { key: 'glasses', kind: 'part' },
  { key: 'extra', kind: 'part' },
  { key: 'outfit', kind: 'part' },
  { key: 'topColor', kind: 'colour' },
  { key: 'bottomColor', kind: 'colour' },
  { key: 'shoeColor', kind: 'colour' },
  { key: 'pet', kind: 'part' },
  { key: 'bg', kind: 'part' },
  { key: 'bgColor', kind: 'colour' },
  { key: 'frame', kind: 'part' },
]

export const PREMIUM_PACKS = {
  dragon: 'DRAGON PACK',
  royal: 'ROYAL PACK',
  party: 'PARTY PACK',
}

/** Ids of one field, in wire order. @param {string} key @returns {string[]} */
export function optionsFor(key) {
  return COLOUR_LISTS[key] || Object.keys(PART_CATALOGS[key] || {})
}

export const DEFAULTS = Object.freeze({
  skin: 's5', hair: 'crop', hairColor: 'hdark', eyes: 'bright', eyeColor: 'hbrown', brows: 'soft', nose: 'none',
  mouth: 'smile', marks: 'none', beard: 'none', hat: 'none', hatColor: 'red', hatAccent: 'white', glasses: 'none',
  extra: 'none', outfit: 'hoodie', topColor: 'blue', bottomColor: 'grey', shoeColor: 'white', pet: 'none',
  bg: 'solid', bgColor: 'sky', frame: 'none',
})

/** @typedef {Record<string, string>} Look */

/** @param {unknown} s */
export function isKitAvatar(s) {
  return typeof s === 'string' && s.startsWith(PREFIX)
}

/** Total decoder: any string starting with the prefix becomes a full look. @param {string} s @returns {Look} */
export function decodeAvatar(s) {
  const look = /** @type {Look} */ ({ ...DEFAULTS })
  const body = String(s).slice(PREFIX.length)
  FIELDS.forEach((f, i) => {
    const ch = body[i]
    if (ch === undefined) return
    const idx = parseInt(ch, 36)
    const id = Number.isNaN(idx) ? undefined : optionsFor(f.key)[idx]
    if (id !== undefined) look[f.key] = id
  })
  return look
}

/** @param {Look} look */
export function encodeAvatar(look) {
  return PREFIX + FIELDS.map((f) => {
    const idx = optionsFor(f.key).indexOf(look[f.key])
    return (idx < 0 ? Math.max(0, optionsFor(f.key).indexOf(DEFAULTS[/** @type {keyof typeof DEFAULTS} */ (f.key)])) : idx).toString(36)
  }).join('')
}

/** Strict check used by validators/tests: prefix, exact length, every index in range. @param {unknown} s */
export function isValidKitAvatar(s) {
  if (typeof s !== 'string' || !s.startsWith(PREFIX) || s.length !== PREFIX.length + FIELDS.length) return false
  return FIELDS.every((f, i) => {
    const idx = parseInt(s[PREFIX.length + i], 36)
    return !Number.isNaN(idx) && idx < optionsFor(f.key).length
  })
}

export const canonicalKit = (/** @type {string} */ s) => encodeAvatar(decodeAvatar(s))

// ── Premium flags ──────────────────────────────────────────────────────────
// Tiers: 'free' | 'earn' (unlocked by play, never sold) | 'pass' | 'pack'. Nothing is
// gated yet; these flags are what a later entitlement check and the editor badges read.

export const TIER_LABEL = { free: 'FREE', earn: 'EARNED', pass: 'PASS', pack: 'PACK' }

/** Tier info of one option: { tier, pack?, note?, label }. @param {string} key @param {string} id */
export function optionInfo(key, id) {
  if (COLOUR_LISTS[key]) {
    const premium = PREMIUM_RAMPS.includes(id)
    return { tier: premium ? 'pass' : 'free', label: id }
  }
  const p = PART_CATALOGS[key]?.[id]
  return { tier: p?.tier || 'free', pack: p?.pack, note: p?.note, label: p?.label || id }
}

export const isPremiumTier = (/** @type {string} */ tier) => tier === 'pass' || tier === 'pack'

/** Every non-free item a look wears. @param {Look} look */
export function premiumItems(look) {
  return FIELDS.flatMap((f) => {
    const info = optionInfo(f.key, look[f.key])
    return info.tier === 'free' ? [] : [{ field: f.key, id: look[f.key], ...info }]
  })
}

// ── Randomising ────────────────────────────────────────────────────────────

/** Items a SHUFFLE may roll: free and earned always, paid only when asked. @param {string} key @param {boolean} premium */
function rollable(key, premium) {
  return optionsFor(key).filter((id) => {
    const t = optionInfo(key, id).tier
    return premium || !isPremiumTier(t)
  })
}

/** @param {() => number} rand @param {{ premium?: boolean }} [opts] @returns {Look} */
export function randomLook(rand = Math.random, { premium = false } = {}) {
  const pick = (/** @type {string[]} */ a) => a[Math.floor(rand() * a.length)]
  const ids = (/** @type {string} */ k) => rollable(k, premium)
  const natural = NATURAL_HAIR
  const cloth = CLOTH.filter((c) => c !== 'black')
  const look = /** @type {Look} */ ({
    skin: pick(SKIN),
    hair: pick(ids('hair')),
    hairColor: rand() < 0.72 ? pick(natural) : pick(premium && rand() < 0.4 ? PREMIUM_RAMPS : FANTASY_HAIR),
    eyes: pick(['bright', 'bright', 'dots', 'calm', 'happy', 'lashes', ...ids('eyes')]),
    eyeColor: pick(EYE_RAMPS.slice(0, 8)),
    brows: pick(['soft', 'soft', 'thick', ...ids('brows')]),
    nose: pick(['none', 'dot', 'button']),
    mouth: pick(['smile', 'smile', 'grin', ...ids('mouth')]),
    marks: rand() < 0.5 ? 'none' : pick(ids('marks')),
    beard: rand() < 0.8 ? 'none' : pick(ids('beard')),
    hat: rand() < 0.55 ? 'none' : pick(ids('hat')),
    hatColor: pick(cloth),
    hatAccent: pick(cloth),
    glasses: rand() < 0.72 ? 'none' : pick(ids('glasses')),
    extra: rand() < 0.75 ? 'none' : pick(ids('extra')),
    outfit: pick(ids('outfit')),
    topColor: pick(cloth),
    bottomColor: pick(['blue', 'black', 'brown', 'grey', 'sky', 'green', 'purple']),
    shoeColor: pick(['white', 'black', 'red', 'brown', 'yellow']),
    pet: rand() < 0.75 ? 'none' : pick(ids('pet')),
    bg: pick(premium ? ids('bg') : ['solid', 'solid', 'dots', 'stripes', 'checker']),
    bgColor: pick(cloth),
    frame: premium && rand() < 0.5 ? pick(ids('frame')) : 'none',
  })
  return look
}

/** A SHUFFLE result that always differs from `avoid`. @param {() => number} rand @param {string | null} avoid @param {{ premium?: boolean }} [opts] */
export function shuffleAvatar(rand = Math.random, avoid = null, opts = {}) {
  for (let i = 0; i < 4; i++) {
    const s = encodeAvatar(randomLook(rand, opts))
    if (s !== avoid) return s
  }
  return encodeAvatar({ ...randomLook(rand, opts), skin: SKIN[Math.floor(rand() * SKIN.length)] })
}

/** Stable look for a uid, so new guests don't all match. @param {string} id */
export function defaultKitAvatar(id) {
  let h = 2166136261
  const s = String(id || '')
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  const rand = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    return h / 4294967296
  }
  return encodeAvatar(randomLook(rand))
}
