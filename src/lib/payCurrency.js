// The buyer's payment currency on this device: INR (Razorpay) or USD (Paddle).
// A tiny external store, so the "Pay in ₹ / Pay in $" switch in one sheet updates
// every price on screen. The choice rules are pure, in payRegionLogic.js.
import { PAY_CURRENCY_KEY, parseCurrencySetting, pickCurrency } from './payRegionLogic'

function readSetting() {
  try { return parseCurrencySetting(localStorage.getItem(PAY_CURRENCY_KEY)) } catch { return null }
}

function deviceSignals() {
  let timeZone = null
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { /* old engine */ }
  const locales = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean))
  return { timeZone, locales }
}

let current = pickCurrency({ setting: readSetting(), ...deviceSignals() })
const listeners = new Set()

/** { currency: 'INR' | 'USD', source: 'setting' | 'timezone' | 'locale' | 'default' } */
export const getPayCurrency = () => current

export function subscribePayCurrency(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** The manual switch: remembered on this device and used from then on. */
export function setPayCurrency(currency) {
  const chosen = parseCurrencySetting(currency)
  if (!chosen) return
  try { localStorage.setItem(PAY_CURRENCY_KEY, chosen) } catch { /* blocked storage: this session only */ }
  current = { currency: chosen, source: 'setting' }
  listeners.forEach(l => l())
}
