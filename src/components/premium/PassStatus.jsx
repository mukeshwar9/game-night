import { Link } from 'react-router-dom'
import useAccess from '../../hooks/useAccess'
import { PRICES, formatCents } from '../../lib/premiumCatalog'
import { PassStar } from './LockBadge'

const date = (ms) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

// One-line state of the viewer's Pass, used at the top of the shop and the Pass
// page. Dev and admin bypass are labelled so nobody mistakes them for a purchase.
export default function PassStatus({ linkToPass = false }) {
  const access = useAccess()
  let body
  if (access.admin) body = { title: 'ADMIN ACCESS', line: 'Every premium item is unlocked for this account.' }
  else if (access.bypass) body = { title: 'DEV MODE', line: 'Every premium item is unlocked while developing.' }
  else if (access.pass) {
    body = {
      title: 'PASS ACTIVE',
      line: access.cancelling
        ? `Ends ${date(access.renewsAt)}. You keep every perk until then.`
        : `${access.plan === 'yearly' ? 'Yearly' : 'Monthly'} plan, renews ${date(access.renewsAt)}.`,
    }
  } else body = { title: 'GAME NIGHT PASS', line: `Every premium item and host perks, from ${formatCents(PRICES.passMonthly)} a month.` }
  const active = access.pass || access.admin || access.bypass
  return (
    <div className={`rounded border-2 p-3 space-y-1 ${active ? 'border-retro-win bg-retro-tint-cta' : 'border-retro-cta bg-retro-card'}`}>
      <p className="font-pixel text-[10px] tracking-widest text-retro-cta flex items-center gap-2">
        {active && <PassStar />} {body.title}
      </p>
      <p className="font-mono text-[11px] text-retro-text leading-relaxed">{body.line}</p>
      {linkToPass && (
        <Link to="/pass" className="inline-block min-h-11 pt-2 font-pixel text-[9px] tracking-wider text-retro-cta underline decoration-dotted underline-offset-2">
          {active ? 'MANAGE' : 'SEE THE PASS'}
        </Link>
      )}
    </div>
  )
}
