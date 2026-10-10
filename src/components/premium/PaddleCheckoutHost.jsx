import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { closePaddleCheckout, openPaddleCheckout } from '../../lib/paddleCheckout'
import { returnPathFor, searchWithoutTransaction, transactionFromSearch } from '../../lib/paddleCheckoutLogic'

// The landing side of a Paddle checkout. createCheckout's link is the default
// payment link with ?_ptxn=<transaction id>; this opens Paddle's checkout for that
// transaction, and on success sends the buyer to the shop or Pass page, where the
// live entitlements subscription shows the purchase once the webhook lands.
// Mounted inside the router only when monetization is on (never in the native shell).
export default function PaddleCheckoutHost() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const handled = useRef(null)

  useEffect(() => {
    const txn = transactionFromSearch(search)
    if (!txn || handled.current === txn) return
    handled.current = txn
    // Drop _ptxn first, so a reload or back press does not reopen the checkout.
    navigate(`${pathname}${searchWithoutTransaction(search)}`, { replace: true })
    let done = false
    openPaddleCheckout(txn, {
      onEvent: (ev) => {
        if (ev?.name === 'checkout.completed' && !done) {
          done = true
          toast.success('Payment received. Unlocking in a moment.')
          // Let Paddle's own success screen show briefly, then go back.
          setTimeout(() => {
            closePaddleCheckout()
            navigate(returnPathFor(ev.data?.custom_data?.product), { replace: true })
          }, 1500)
        }
      },
    }).catch((e) => {
      const reason = String(e?.message || '')
      toast.error(reason === 'paddle-unavailable' ? "Couldn't load the checkout. Try again." : 'Checkout is not available right now.')
    })
  }, [pathname, search, navigate])

  return null
}
