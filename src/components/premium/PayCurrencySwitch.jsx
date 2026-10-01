import usePayCurrency from '../../hooks/usePayCurrency'
import { setPayCurrency } from '../../lib/payCurrency'

const OPTIONS = [['INR', 'PAY IN ₹'], ['USD', 'PAY IN $']]

// The manual "Pay in ₹ / Pay in $" choice: rupees go through Razorpay, dollars
// through Paddle (payRegionLogic.js). Remembered on this device.
export default function PayCurrencySwitch({ disabled = false }) {
  const currency = usePayCurrency()
  return (
    <div role="radiogroup" aria-label="Pay in" className="grid grid-cols-2 gap-2">
      {OPTIONS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={currency === id}
          onClick={() => setPayCurrency(id)}
          disabled={disabled}
          className={`min-h-11 rounded border-2 font-pixel text-[9px] tracking-wider transition-all disabled:opacity-50 ${currency === id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border bg-retro-surface text-retro-dim'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
