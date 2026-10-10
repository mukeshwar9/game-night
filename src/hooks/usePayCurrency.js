import { useSyncExternalStore } from 'react'
import { getPayCurrency, subscribePayCurrency } from '../lib/payCurrency'

// 'INR' (Razorpay) or 'USD' (Paddle) for this buyer; see payRegionLogic.js.
export default function usePayCurrency() {
  return useSyncExternalStore(subscribePayCurrency, getPayCurrency, getPayCurrency).currency
}
