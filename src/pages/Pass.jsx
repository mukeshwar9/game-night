import { toast } from 'sonner'
import PassStatus from '../components/premium/PassStatus'
import PayCurrencySwitch from '../components/premium/PayCurrencySwitch'
import LegalLinks from '../components/LegalLinks'
import useAccess from '../hooks/useAccess'
import useBusy from '../hooks/useBusy'
import usePayCurrency from '../hooks/usePayCurrency'
import { PASS_TRIAL_DAYS, PREPAID_PASS_DAYS, PRODUCTS, formatPrice, yearlySavingsPercent } from '../lib/premiumCatalog'
import { beginPurchase } from '../lib/premiumUi'
import { createPortalUrl } from '../lib/entitlements'

const PERKS = [
  ['Every premium theme, avatar item and emote pack', true],
  ['A new drop of looks each month', true],
  ['A ★ badge on your profile and player card', true],
  ['Room banner and room theme your guests see (coming for hosts)', false],
  ['Saved game playlists and tournament nights (coming for hosts)', false],
]

function Plan({ id, title, price, note, featured }) {
  return (
    <button
      type="button"
      onClick={() => beginPurchase(id)}
      className={`w-full min-h-16 px-3 py-2 rounded border-2 text-left press transition ${featured ? 'border-retro-cta bg-retro-tint-cta' : 'border-retro-border bg-retro-card'}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-pixel text-[10px] tracking-wider text-retro-text">{title}</span>
        <span className="font-pixel text-[11px] text-retro-cta">{price}</span>
      </span>
      <span className="block font-mono text-[10px] text-retro-dim pt-1">{note}</span>
    </button>
  )
}

export default function Pass() {
  const access = useAccess()
  const currency = usePayCurrency()
  const inr = currency === 'INR'
  const yearly = formatPrice(PRODUCTS['pass-yearly'], currency)
  const monthly = formatPrice(PRODUCTS['pass-monthly'], currency)
  const [portalBusy, runPortal] = useBusy()
  const openPortal = () => runPortal(async () => {
    window.location.assign(await createPortalUrl())
  }, () => toast.error("Couldn't open your subscription. Try again."))

  return (
    <main className="min-h-screen bg-retro-bg px-4 pt-4 pb-10">
      <div className="max-w-sm mx-auto space-y-4">
        <header className="space-y-1">
          <h1 className="font-pixel text-sm tracking-widest text-retro-cta text-glow-cta">GAME NIGHT PASS</h1>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            The host buys it; everyone in the room enjoys it. Every game stays free whether or not you have the Pass.
          </p>
        </header>

        <PassStatus />

        <ul className="space-y-1.5" aria-label="What the Pass includes">
          {PERKS.map(([text, live]) => (
            <li key={text} className="flex gap-2 font-mono text-[11px] leading-relaxed text-retro-text">
              <span aria-hidden="true" className={live ? 'text-retro-win' : 'text-retro-dim'}>{live ? '+' : '·'}</span>
              <span className={live ? '' : 'text-retro-dim'}>{text}</span>
            </li>
          ))}
        </ul>

        {access.pass && !access.admin && !access.bypass && access.provider !== 'razorpay' ? (
          <button type="button" onClick={openPortal} disabled={portalBusy} className="w-full min-h-12 rounded border-2 border-retro-border bg-retro-card text-retro-text font-pixel text-[10px] tracking-wider press transition disabled:opacity-50">
            {portalBusy ? 'OPENING…' : 'MANAGE OR CANCEL SUBSCRIPTION'}
          </button>
        ) : (
          <div className="space-y-2">
            {access.pass && <p className="font-pixel text-[9px] tracking-wider text-retro-dim">ADD MORE TIME</p>}
            <PayCurrencySwitch />
            {inr ? (
              <>
                <Plan id="pass-yearly" featured title={`${PREPAID_PASS_DAYS.year} DAYS`} price={yearly} note={`Save ${yearlySavingsPercent('INR')}% against monthly. One payment, no auto-renewal.`} />
                <Plan id="pass-monthly" title={`${PREPAID_PASS_DAYS.month} DAYS`} price={monthly} note="One payment, no auto-renewal. UPI, cards or netbanking." />
              </>
            ) : (
              <>
                <Plan id="pass-yearly" featured title="YEARLY" price={`${yearly}/YR`} note={`Save ${yearlySavingsPercent()}% against monthly. ${PASS_TRIAL_DAYS}-day free trial.`} />
                <Plan id="pass-monthly" title="MONTHLY" price={`${monthly}/MO`} note={`${PASS_TRIAL_DAYS}-day free trial. Cancel any time.`} />
              </>
            )}
          </div>
        )}

        <div className="space-y-2 font-mono text-[10px] leading-relaxed text-retro-dim">
          {inr ? (
            <p>
              Paid in rupees, the Pass is one payment for a fixed number of days. It never renews by itself and nothing is charged again; buying again adds the days to the time you have left. Payments are processed by Razorpay (UPI, cards, netbanking). Refunds follow our Terms; write to us from the Support page.
            </p>
          ) : (
            <p>
              The Pass renews automatically at the price shown until you cancel, after any free trial. Cancel from this page; you keep the Pass until the period you paid for ends. Payments are handled by Paddle, our reseller, which also issues receipts and handles refunds under our Terms. Deleting your account cancels the subscription.
            </p>
          )}
        </div>
        <LegalLinks contact />
      </div>
    </main>
  )
}
