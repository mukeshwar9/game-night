import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_LADDER_STEP, PASS_LADDER, ladderStep, perMonthNote, priceLine } from '../../lib/passLadder'

// One price screen: monthly, yearly (BEST VALUE) and forever, in rupees.
// Policy: docs/AD-AND-PRICE-POLICY.md. Exactly one close button; Back also leaves.
// The prices are placeholder examples (lib/passLadder.js), so Continue is off:
// nothing here touches checkout.
export default function PassPriceLadder() {
  const navigate = useNavigate()
  const [picked, setPicked] = useState(DEFAULT_LADDER_STEP)
  const step = ladderStep(picked)

  const close = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <section aria-labelledby="ladder-title" className="space-y-3 rounded border-2 border-retro-border bg-retro-card p-3">
      <div className="flex items-start justify-between gap-2">
        <h2 id="ladder-title" className="font-pixel text-[11px] tracking-wider text-retro-text pt-3">CHOOSE YOUR PASS</h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="shrink-0 w-11 h-11 -mt-1 -mr-1 flex items-center justify-center rounded press transition text-retro-text font-pixel text-sm"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div role="radiogroup" aria-label="Pass length" className="space-y-3">
        {PASS_LADDER.map((s) => {
          const on = s.id === picked
          const note = perMonthNote(s)
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(s.id)}
              className={`relative w-full min-h-16 px-3 py-2 rounded border-2 text-left press transition flex items-center gap-3 ${on ? 'border-retro-cta bg-retro-tint-cta' : 'border-retro-border bg-retro-bg'}`}
            >
              <span aria-hidden="true" className={`shrink-0 w-4 h-4 rounded-full border-2 ${on ? 'border-retro-cta bg-retro-cta' : 'border-retro-border'}`} />
              <span className="flex flex-col gap-1">
                <span className="font-pixel text-[10px] tracking-wider text-retro-text">{s.title}</span>
                <span className="font-mono text-[11px] text-retro-dim">{priceLine(s)}{note ? ` · ${note}` : ''}</span>
              </span>
              {s.bestValue && (
                <span className="absolute -top-2.5 right-2 px-1.5 py-0.5 rounded border-2 border-retro-win bg-retro-card font-pixel text-[8px] tracking-wider text-retro-win">BEST VALUE</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-retro-text">
        Cancel anytime. Monthly and yearly stop when you tell us to; forever is paid once and never charged again.
      </p>

      <button
        type="button"
        disabled
        className="w-full min-h-12 rounded border-2 border-retro-cta bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-wider disabled:opacity-50"
      >
        {`PREVIEW PRICES · ${step.title}`}
      </button>
      <p className="font-mono text-[10px] text-retro-dim">These prices are examples while the Pass is not on sale.</p>
    </section>
  )
}
