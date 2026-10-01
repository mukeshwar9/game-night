// @ts-check
// The one place Game Night's prices, products and packs are defined. Pure data:
// the shop UI, the paywall sheet, the checkout function and the webhook all read
// it (functions/src/core.mjs bundles it), so a price changes in exactly one spot.
//
// Rules the catalogue encodes (docs/MONETIZATION.md):
//  - every game that is free stays free; only cosmetics and host perks are sold
//  - nothing sold changes who wins; there is no random paid reward
//
// How a registry item becomes premium (the contract the theme, avatar and emote
// registries plug into): give its entry `premium: true` and `pack: '<PACKS id>'`.
// Its item key is `${kind}:${id}` (see itemKey in premium.js). A pack unlocks every
// registry entry carrying its id; the Pass unlocks all of them.

export const CURRENCY = 'USD'

/** Prices in cents. */
export const PRICES = {
  passMonthly: 299,
  passYearly: 1999,
  supporter: 499,
  packTheme: 299,
  packAvatar: 199,
  packEmote: 199,
}

/** Free days on a new web subscription. */
export const PASS_TRIAL_DAYS = 7

/** @typedef {'theme' | 'avatar' | 'emote'} ItemKind */

/**
 * @typedef {object} Pack
 * @property {string} id
 * @property {ItemKind} kind
 * @property {string} label
 * @property {string} blurb
 * @property {number} cents
 */

/** @type {Pack[]} */
export const PACKS = [
  { id: 'themes-seasonal', kind: 'theme', label: 'SEASONAL THEMES', blurb: 'Pastel, candy and frost screens for your own device.', cents: PRICES.packTheme },
  { id: 'themes-arcade', kind: 'theme', label: 'ARCADE PRO', blurb: 'High-contrast CRT and console looks.', cents: PRICES.packTheme },
  // One per avatar-kit pack id ('royal', 'party', 'dragon' in avatarKit/catalog.js): `avatars-${kitPack}`.
  { id: 'avatars-royal', kind: 'avatar', label: 'ROYAL PACK', blurb: 'Crowns, capes and gold finishes everyone in the room sees.', cents: PRICES.packAvatar },
  { id: 'avatars-party', kind: 'avatar', label: 'PARTY PACK', blurb: 'Confetti and candy looks and buddies for the room.', cents: PRICES.packAvatar },
  { id: 'avatars-dragon', kind: 'avatar', label: 'DRAGON PACK', blurb: 'A dragon buddy and scaly gear.', cents: PRICES.packAvatar },
  { id: 'emotes-pixel', kind: 'emote', label: 'PIXEL EMOTES', blurb: 'A row of party reactions for the room chat.', cents: PRICES.packEmote },
]

/**
 * @typedef {object} Product
 * @property {string} id
 * @property {'pass' | 'supporter' | 'pack'} type
 * @property {string} label
 * @property {number} cents
 * @property {'month' | 'year'=} interval
 * @property {string=} packId
 */

/** Everything the checkout can sell. Product ids are what the webhook maps back from. */
/** @type {Record<string, Product>} */
export const PRODUCTS = {
  'pass-monthly': { id: 'pass-monthly', type: 'pass', label: 'GAME NIGHT PASS · MONTHLY', cents: PRICES.passMonthly, interval: 'month' },
  'pass-yearly': { id: 'pass-yearly', type: 'pass', label: 'GAME NIGHT PASS · YEARLY', cents: PRICES.passYearly, interval: 'year' },
  supporter: { id: 'supporter', type: 'supporter', label: 'SUPPORTER', cents: PRICES.supporter },
  ...Object.fromEntries(PACKS.map(p => [`pack-${p.id}`, { id: `pack-${p.id}`, type: 'pack', label: p.label, cents: p.cents, packId: p.id }])),
}

/** 1999 -> "$19.99" */
export function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

/** Percent saved by paying yearly instead of twelve monthly payments. */
export function yearlySavingsPercent() {
  return Math.round((1 - PRICES.passYearly / (PRICES.passMonthly * 12)) * 100)
}

/** @param {string} id */
export function getPack(id) {
  return PACKS.find(p => p.id === id) ?? null
}
