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

/**
 * Indian prices in paise, charged in INR through Razorpay (docs/MONETIZATION.md).
 * Set for Indian purchasing power, not converted from USD; GST-inclusive, as
 * Indian consumer prices always are.
 */
export const PRICES_INR = {
  passMonthly: 9900,
  passYearly: 69900,
  supporter: 29900,
  packTheme: 9900,
  packAvatar: 4900,
  packEmote: 4900,
}

/** @typedef {'USD' | 'INR'} Currency */

/**
 * How long a Pass bought through Razorpay lasts. It is a one-time prepaid
 * period that does not renew (Razorpay orders, not subscriptions).
 */
export const PREPAID_PASS_DAYS = { month: 30, year: 365 }

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
 * @property {number} paise
 */

/** @type {Pack[]} */
export const PACKS = [
  { id: 'themes-seasonal', kind: 'theme', label: 'SEASONAL THEMES', blurb: 'Pastel, candy and frost screens for your own device.', cents: PRICES.packTheme, paise: PRICES_INR.packTheme },
  { id: 'themes-arcade', kind: 'theme', label: 'ARCADE PRO', blurb: 'High-contrast CRT and console looks.', cents: PRICES.packTheme, paise: PRICES_INR.packTheme },
  // One per avatar-kit pack id ('royal', 'party', 'dragon' in avatarKit/catalog.js): `avatars-${kitPack}`.
  { id: 'avatars-royal', kind: 'avatar', label: 'ROYAL PACK', blurb: 'Crowns, capes and gold finishes everyone in the room sees.', cents: PRICES.packAvatar, paise: PRICES_INR.packAvatar },
  { id: 'avatars-party', kind: 'avatar', label: 'PARTY PACK', blurb: 'Confetti and candy looks and buddies for the room.', cents: PRICES.packAvatar, paise: PRICES_INR.packAvatar },
  { id: 'avatars-dragon', kind: 'avatar', label: 'DRAGON PACK', blurb: 'A dragon buddy and scaly gear.', cents: PRICES.packAvatar, paise: PRICES_INR.packAvatar },
  { id: 'emotes-pixel', kind: 'emote', label: 'PIXEL EMOTES', blurb: 'A row of party reactions for the room chat.', cents: PRICES.packEmote, paise: PRICES_INR.packEmote },
]

/**
 * @typedef {object} Product
 * @property {string} id
 * @property {'pass' | 'supporter' | 'pack'} type
 * @property {string} label
 * @property {number} cents
 * @property {number} paise
 * @property {'month' | 'year'=} interval
 * @property {string=} packId
 */

/** Everything the checkout can sell. Product ids are what the webhook maps back from. */
/** @type {Record<string, Product>} */
export const PRODUCTS = {
  'pass-monthly': { id: 'pass-monthly', type: 'pass', label: 'GAME NIGHT PASS · MONTHLY', cents: PRICES.passMonthly, paise: PRICES_INR.passMonthly, interval: 'month' },
  'pass-yearly': { id: 'pass-yearly', type: 'pass', label: 'GAME NIGHT PASS · YEARLY', cents: PRICES.passYearly, paise: PRICES_INR.passYearly, interval: 'year' },
  supporter: { id: 'supporter', type: 'supporter', label: 'SUPPORTER', cents: PRICES.supporter, paise: PRICES_INR.supporter },
  ...Object.fromEntries(PACKS.map(p => [`pack-${p.id}`, { id: `pack-${p.id}`, type: 'pack', label: p.label, cents: p.cents, paise: p.paise, packId: p.id }])),
}

/** 1999 -> "$19.99" */
export function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

/** 9900 -> "₹99", 69950 -> "₹699.50" */
export function formatPaise(paise) {
  const rupees = paise / 100
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`
}

/**
 * A product's price in the buyer's currency, in minor units (cents or paise).
 * @param {Product | Pack} item
 * @param {Currency} [currency]
 */
export function amountFor(item, currency = 'USD') {
  return currency === 'INR' ? item.paise : item.cents
}

/**
 * The display string for a product or pack in the buyer's currency.
 * @param {Product | Pack} item
 * @param {Currency} [currency]
 */
export function formatPrice(item, currency = 'USD') {
  return currency === 'INR' ? formatPaise(item.paise) : formatCents(item.cents)
}

/**
 * Percent saved by paying yearly instead of twelve monthly payments.
 * @param {Currency} [currency]
 */
export function yearlySavingsPercent(currency = 'USD') {
  const table = currency === 'INR' ? PRICES_INR : PRICES
  return Math.round((1 - table.passYearly / (table.passMonthly * 12)) * 100)
}

/** @param {string} id */
export function getPack(id) {
  return PACKS.find(p => p.id === id) ?? null
}
