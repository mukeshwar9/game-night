// @ts-check
// Which processor a web buyer pays through. Indian buyers pay in rupees through
// Razorpay (UPI, Indian cards, netbanking); everyone else pays in dollars through
// Paddle, the merchant of record (docs/MONETIZATION.md). Firebase Hosting gives no
// geo-IP, so the choice is made on the device, in this order:
//
//  1. the buyer's own choice from the "Pay in ₹ / Pay in $" switch, remembered
//     on the device;
//  2. the device time zone (Asia/Kolkata, or its old name Asia/Calcutta);
//  3. a browser language with the IN region (en-IN, hi-IN, ta-IN, …).
//
// It only picks the default. Anyone can switch, and the server charges whatever
// the chosen processor's price is, so a wrong guess costs nothing.

/** @typedef {'INR' | 'USD'} Currency */

export const PAY_CURRENCY_KEY = 'gn-pay-currency'

const INDIA_TIME_ZONES = new Set(['Asia/Kolkata', 'Asia/Calcutta'])

/** @param {unknown} value @returns {Currency | null} */
export function parseCurrencySetting(value) {
  return value === 'INR' || value === 'USD' ? value : null
}

/** True for a BCP 47 tag whose region is India ("en-IN", "hi_IN", "ta-Taml-IN"). */
export function isIndianLocale(tag) {
  if (typeof tag !== 'string') return false
  const parts = tag.replace(/_/g, '-').split('-')
  return parts.slice(1).some(p => p.toUpperCase() === 'IN')
}

/**
 * @param {{ setting?: unknown, timeZone?: string | null, locales?: readonly string[] | null }} signals
 * @returns {{ currency: Currency, source: 'setting' | 'timezone' | 'locale' | 'default' }}
 */
export function pickCurrency({ setting = null, timeZone = null, locales = [] } = {}) {
  const chosen = parseCurrencySetting(setting)
  if (chosen) return { currency: chosen, source: 'setting' }
  if (timeZone && INDIA_TIME_ZONES.has(timeZone)) return { currency: 'INR', source: 'timezone' }
  if ((locales || []).some(isIndianLocale)) return { currency: 'INR', source: 'locale' }
  return { currency: 'USD', source: 'default' }
}

/** @param {Currency} currency */
export function processorFor(currency) {
  return currency === 'INR' ? 'razorpay' : 'paddle'
}
