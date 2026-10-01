import { useSyncExternalStore } from 'react'
import { getPremiumUi, subscribePremiumUi } from '../../lib/premiumUi'
import PaywallSheet from './PaywallSheet'
import PurchaseSheet from './PurchaseSheet'
import { monetizationEnabled } from '../../lib/monetizationState'

// Mounted once in App: renders whichever premium overlay the store asks for.
export default function PremiumHost() {
  const ui = useSyncExternalStore(subscribePremiumUi, getPremiumUi, getPremiumUi)
  if (!monetizationEnabled()) return null
  if (ui.purchase) return <PurchaseSheet product={ui.purchase} />
  if (ui.paywallItem) return <PaywallSheet item={ui.paywallItem} />
  return null
}
