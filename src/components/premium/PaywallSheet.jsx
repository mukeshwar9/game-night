import BottomSheet from '../BottomSheet'
import LockBadge from './LockBadge'
import usePayCurrency from '../../hooks/usePayCurrency'
import { PRODUCTS, formatPrice, getPack } from '../../lib/premiumCatalog'
import { beginPurchase, closePaywall } from '../../lib/premiumUi'
import { Link } from 'react-router-dom'

// "This one is locked": opens when a locked theme, avatar item or emote is
// tapped. Two ways in — the whole Pass, or just the item's pack.
export default function PaywallSheet({ item }) {
  const pack = getPack(item.pack ?? '')
  const currency = usePayCurrency()
  return (
    <BottomSheet onClose={closePaywall} ariaLabel={`${item.label} is a premium item`} className="bg-retro-card space-y-4">
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <LockBadge size={14} />
          <p className="font-pixel text-[10px] tracking-widest text-retro-cta">{item.label}</p>
        </div>
        <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
          A look-only item. It never changes who wins, and every game stays free.
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => beginPurchase('pass-monthly')}
          className="w-full min-h-12 px-3 flex items-center justify-between gap-2 rounded border-2 border-retro-cta bg-retro-tint-cta text-retro-cta font-pixel text-[10px] tracking-wider active:scale-95 transition"
        >
          <span>GET THE PASS</span>
          <span>{formatPrice(PRODUCTS['pass-monthly'], currency)}{currency === 'INR' ? '' : '/MO'}</span>
        </button>
        <p className="font-mono text-[10px] text-retro-dim text-center">
          Unlocks every premium item, plus host perks your guests enjoy. {currency === 'INR' ? '30 days, no auto-renewal.' : 'First week free.'}
        </p>
        {pack && (
          <button
            type="button"
            onClick={() => beginPurchase(`pack-${pack.id}`)}
            className="w-full min-h-11 px-3 flex items-center justify-between gap-2 rounded border border-retro-border bg-retro-surface text-retro-text font-pixel text-[10px] tracking-wider active:scale-95 transition"
          >
            <span>BUY {pack.label}</span>
            <span>{formatPrice(pack, currency)}</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Link to="/pass" onClick={closePaywall} className="font-pixel text-[9px] tracking-wider text-retro-dim underline decoration-dotted underline-offset-2">SEE THE PASS</Link>
        <button type="button" onClick={closePaywall} className="min-h-11 px-3 font-pixel text-[9px] tracking-wider text-retro-dim hover:text-retro-text">NOT NOW</button>
      </div>
    </BottomSheet>
  )
}
