import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import BottomSheet from '../BottomSheet'
import useBusy from '../../hooks/useBusy'
import { useAuth } from '../../lib/AuthContext'
import { PASS_TRIAL_DAYS, PRODUCTS, formatCents } from '../../lib/premiumCatalog'
import { birthYearOptions, purchaseGate } from '../../lib/premium'
import { createCheckoutUrl, getBirthYear, saveBirthYear } from '../../lib/entitlements'
import { closePurchase } from '../../lib/premiumUi'
import { isInAppBrowser } from '../../lib/uaLogic'
import { TERMS_URL, PRIVACY_URL } from '../../lib/legal'

const BTN = 'w-full min-h-12 rounded border-2 border-retro-cta bg-retro-tint-cta text-retro-cta font-pixel text-[10px] tracking-wider active:scale-95 transition-all disabled:opacity-50'

// The steps before a payment: guests sign in with Google (so the purchase follows
// the account), a neutral birth-year question (13+ only), then hand-off to the
// merchant of record's hosted checkout. Each button follows the useBusy pattern.
export default function PurchaseSheet({ product }) {
  const item = PRODUCTS[product]
  const { isAnonymous, upgrade } = useAuth()
  const [birthYear, setBirthYear] = useState(undefined) // undefined = still loading
  const [pick, setPick] = useState('')
  const [signInBusy, runSignIn] = useBusy()
  const [ageBusy, runAge] = useBusy()
  const [payBusy, runPay] = useBusy()

  useEffect(() => {
    let live = true
    getBirthYear().then(y => { if (live) setBirthYear(y) }, () => { if (live) setBirthYear(null) })
    return () => { live = false }
  }, [])

  if (!item) return null
  const gate = birthYear === undefined ? 'loading' : purchaseGate({ isAnonymous, birthYear })
  const isPass = item.type === 'pass'
  const price = `${formatCents(item.cents)}${item.interval ? `/${item.interval === 'year' ? 'YR' : 'MO'}` : ''}`

  const signIn = () => runSignIn(async () => { await upgrade() }, () => toast.error("Couldn't sign in. Try again."))
  const saveAge = () => runAge(async () => {
    const year = Number(pick)
    await saveBirthYear(year)
    setBirthYear(year)
  }, () => toast.error("Couldn't save that. Try again."))
  const pay = () => runPay(async () => {
    window.location.assign(await createCheckoutUrl(product))
  }, (e) => {
    const code = String(e?.code || e?.message || '')
    if (code.includes('age-required')) setBirthYear(null)
    else if (code.includes('under-age')) setBirthYear(new Date().getUTCFullYear())
    else if (code.includes('sign-in-required')) toast.error('Sign in with Google first.')
    else toast.error('Checkout is not available right now.')
  })

  return (
    <BottomSheet onClose={closePurchase} ariaLabel={`Buy ${item.label}`} className="bg-retro-card space-y-4">
      <div className="text-center space-y-1">
        <p className="font-pixel text-[10px] tracking-widest text-retro-cta">{item.label}</p>
        <p className="font-pixel text-[12px] text-retro-text">{price}</p>
      </div>

      {gate === 'loading' && <p className="font-mono text-[11px] text-retro-dim text-center">One moment…</p>}

      {gate === 'sign-in' && (
        <div className="space-y-3">
          <p className="font-mono text-[11px] text-retro-text leading-relaxed text-center">
            Sign in with Google first, so your purchase follows you to every device and survives a cleared browser.
          </p>
          {isInAppBrowser() && <p className="font-mono text-[10px] text-retro-p2 text-center">Google sign-in needs your normal browser. Open Game Night there.</p>}
          <button type="button" onClick={signIn} disabled={signInBusy} className={BTN}>{signInBusy ? 'SIGNING IN…' : 'SIGN IN WITH GOOGLE'}</button>
        </div>
      )}

      {gate === 'age' && (
        <div className="space-y-3">
          <label htmlFor="birth-year" className="block font-mono text-[11px] text-retro-text leading-relaxed text-center">
            What year were you born?
          </label>
          <select
            id="birth-year"
            value={pick}
            onChange={e => setPick(e.target.value)}
            className="w-full min-h-11 rounded border-2 border-retro-border bg-retro-surface px-3 font-mono text-sm text-retro-text focus:outline-none focus:border-retro-cta"
          >
            <option value="">Choose a year</option>
            {birthYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" onClick={saveAge} disabled={!pick || ageBusy} className={BTN}>{ageBusy ? 'SAVING…' : 'CONTINUE'}</button>
        </div>
      )}

      {gate === 'under-age' && (
        <p className="font-mono text-[11px] text-retro-text leading-relaxed text-center">
          Purchases are for players 13 and older. Every game is still free to play.
        </p>
      )}

      {gate === 'ok' && (
        <div className="space-y-3">
          {isPass ? (
            <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
              {PASS_TRIAL_DAYS}-day free trial, then {formatCents(item.cents)} per {item.interval}. Renews automatically until you cancel. Cancel any time from the Pass page; you keep the Pass until the period you paid for ends. Refunds follow our Terms.
            </p>
          ) : (
            <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
              One payment of {formatCents(item.cents)}. Yours for good, on every device you sign in on.
            </p>
          )}
          <button type="button" onClick={pay} disabled={payBusy} className={BTN}>{payBusy ? 'OPENING CHECKOUT…' : 'CONTINUE TO CHECKOUT'}</button>
          <p className="font-mono text-[10px] text-retro-dim text-center">
            Paid through Paddle, our reseller. By buying you accept the{' '}
            <a href={TERMS_URL} target="_blank" rel="noopener" className="underline decoration-dotted">Terms</a> and{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener" className="underline decoration-dotted">Privacy</a>.
          </p>
        </div>
      )}

      <button type="button" onClick={closePurchase} className="w-full min-h-11 font-pixel text-[9px] tracking-wider text-retro-dim hover:text-retro-text">CANCEL</button>
    </BottomSheet>
  )
}
