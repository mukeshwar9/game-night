// @ts-check
// The three-step price ladder on the Pass page (docs/AD-AND-PRICE-POLICY.md):
// a monthly, a yearly marked BEST VALUE and a forever price, in rupees, on one screen.
//
// The prices below are PLACEHOLDER EXAMPLES taken from the design board. They are
// not in premiumCatalog.js and nothing can be bought at them: the ladder shows them
// and its Continue button stays off until real products exist for every step.
// Real prices and checkout live in premiumCatalog.js / entitlements.js, untouched.

/**
 * @typedef {object} LadderStep
 * @property {'monthly' | 'yearly' | 'forever'} id
 * @property {string} title
 * @property {number} rupees
 * @property {string} unit  what the price covers, e.g. "a month"
 * @property {boolean} [bestValue]
 */

/** @type {LadderStep[]} */
export const PASS_LADDER = [
  { id: 'monthly', title: 'MONTHLY', rupees: 99, unit: 'a month' },
  { id: 'yearly', title: 'YEARLY', rupees: 299, unit: 'a year', bestValue: true },
  { id: 'forever', title: 'FOREVER', rupees: 499, unit: 'once' },
]

/** The step that starts selected: the one marked best value. */
export const DEFAULT_LADDER_STEP = 'yearly'

/** Months the yearly step covers, for its per-month line. */
const MONTHS_IN_YEAR = 12

/** @param {number} rupees */
export function formatRupees(rupees) {
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`
}

/**
 * The plain-words price line for a step: "₹99 a month", "₹499 once".
 * @param {LadderStep} step
 */
export function priceLine(step) {
  return `${formatRupees(step.rupees)} ${step.unit}`
}

/**
 * "about ₹25 a month" for the yearly step, so it can be compared with the monthly one.
 * Null for steps that do not repeat (monthly already says it, forever never repeats).
 * @param {LadderStep} step
 */
export function perMonthNote(step) {
  if (step.id !== 'yearly') return null
  return `about ${formatRupees(step.rupees / MONTHS_IN_YEAR)} a month`
}

/**
 * @param {string} id
 * @returns {LadderStep}
 */
export function ladderStep(id) {
  return PASS_LADDER.find((s) => s.id === id) ?? PASS_LADDER.find((s) => s.id === DEFAULT_LADDER_STEP)
}

/**
 * Whether the ladder replaces the current plan buttons on the Pass page.
 * Off until the placeholder prices are replaced with real products. A dev build
 * can preview it with ?ladder=1; a production build ignores the query.
 * @param {string} search  location.search
 * @param {boolean} dev    import.meta.env.DEV
 */
export function ladderEnabled(search, dev) {
  return dev && new URLSearchParams(search).get('ladder') === '1'
}
