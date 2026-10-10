import { useSyncExternalStore } from 'react'
import { getPremiumUi, subscribePremiumUi } from '../../lib/premiumUi'
import PaywallSheet from './PaywallSheet'
import PurchaseSheet from './PurchaseSheet'
import useAccess from '../../hooks/useAccess'

// Mounted once in App: renders whichever premium overlay the store asks for.
export default function PremiumHost() {
  const ui = useSyncExternalStore(subscribePremiumUi, getPremiumUi, getPremiumUi)
  const access = useAccess()
  if (!access.shop) return null
  if (ui.purchase) return <PurchaseSheet product={ui.purchase} />
  if (ui.paywallItem) return <PaywallSheet item={ui.paywallItem} />
  return null
}
