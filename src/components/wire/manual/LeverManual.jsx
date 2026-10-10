// WIRE CROSSED Handbook page: LEVER. Tier II adds a third tap line; tier III
// says the strip changes after 2 seconds of holding and only the second counts.
import { STRIP_COLORS, STRIP_SWITCH_MS, describeLeverRule } from '../../../lib/wireLogic'
import { ColorTag } from '../ColorTag'
import Section from './Section'

export default function LeverManual({ module }) {
  const { manual, tier = 1 } = module
  const many = manual.tapRules.length > 2
  return (
    <Section title="LEVER" intro={`Tap it and let go at once if ${many ? 'any' : 'either'} line is true:`}>
      <ol className="space-y-2">
        {manual.tapRules.map((rule, i) => (
          <li key={i} className="flex gap-2 font-mono text-[11px] leading-snug text-retro-text">
            <span className="font-pixel text-[9px] text-retro-dim pt-0.5">{i + 1}.</span>
            <span>{describeLeverRule(rule, i)}.</span>
          </li>
        ))}
      </ol>
      <p className="font-mono text-[11px] leading-relaxed text-retro-text">
        Otherwise <b className="text-retro-cta">hold it down</b>. A strip lights up.{' '}
        {tier >= 3 && (
          <>
            <b>After {STRIP_SWITCH_MS / 1000} seconds the strip CHANGES to a second colour and its label changes.
            Only the SECOND strip counts.</b> Letting go before it changes is a strike.{' '}
          </>
        )}
        Let go when the <b>last digit</b> of the clock (the ones digit of the seconds) shows the number for that strip:
      </p>
      <ul className="grid grid-cols-1 gap-1.5">
        {STRIP_COLORS.map(color => (
          <li key={color} className="flex items-center justify-between rounded border border-retro-border bg-retro-deep px-2 py-1.5">
            <ColorTag color={color} className="text-retro-text" />
            <span className="font-pixel text-[12px] text-retro-cta">{manual.stripDigits[color]}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
