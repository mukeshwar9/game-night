// Tiny external store for the two premium overlays, so any picker can open the
// paywall with one call and a single <PremiumHost/> renders it.
//   openPaywall(item)      the "this is locked" sheet for a premium item
//   beginPurchase(product) the sign-in -> age -> checkout steps for a product id
let state = { paywallItem: null, purchase: null }
const listeners = new Set()

function set(next) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export const getPremiumUi = () => state
export function subscribePremiumUi(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export const openPaywall = (item) => set({ paywallItem: item, purchase: null })
export const closePaywall = () => set({ paywallItem: null })
export const beginPurchase = (product) => set({ paywallItem: null, purchase: product })
export const closePurchase = () => set({ purchase: null })
