// WIRE CROSSED Handbook page: GAUGE. The venting rule per zone, the burst rule,
// and at tier III the rotation of the right valve after each vent.
import { GAUGE_FILL_MS, describeGaugeCond } from '../../../lib/wireLogic'
import Section from './Section'

function Rule({ zone, rule, cls }) {
  return (
    <li className="font-mono text-[11px] leading-snug text-retro-text">
      <b className={cls}>{zone}:</b>{' '}
      {rule.cond
        ? `if ${describeGaugeCond(rule.cond)}, open VALVE ${rule.yes}. Otherwise open VALVE ${rule.no}.`
        : `open VALVE ${rule.yes}.`}
    </li>
  )
}

export default function GaugeManual({ module }) {
  const { manual, tier = 1 } = module
  const secs = GAUGE_FILL_MS[tier] / 1000
  const intro = `The gauge on the Tech's device fills from 10% to 100% in about ${secs} seconds (longer if the room has relaxed timers). It is never "solved": it keeps filling all bomb, so the Tech must vent it each time it climbs. Ask for the zone name under the needle.`
  return (
    <Section title="PRESSURE GAUGE" intro={intro}>
      <ul className="space-y-2" aria-label="Venting rules">
        <li className="font-mono text-[11px] leading-snug text-retro-text">
          <b className="text-retro-win">GREEN (0-49%):</b> do NOT vent. Any vent in GREEN is a strike.
        </li>
        <Rule zone="AMBER (50-79%)" rule={manual.amber} cls="text-retro-cta" />
        <Rule zone="RED (80-99%)" rule={manual.red} cls="text-retro-p1" />
      </ul>
      <p className="font-mono text-[11px] leading-relaxed text-retro-text">
        <b className="text-retro-cta">RIGHT VALVE:</b> the pressure drops back to 10%. <b className="text-retro-cta">WRONG VALVE:</b> a strike, and the pressure stays where it is.
      </p>
      {manual.rotates && (
        <p className="font-mono text-[11px] leading-relaxed text-retro-text">
          <b className="text-retro-cta">AFTER EACH VENT</b> the right valve for each zone moves one step: A becomes B, B becomes C, C becomes A. After two vents it has moved two steps, and so on. Count the vents.
        </p>
      )}
      <p className="font-mono text-[11px] leading-relaxed text-retro-text">
        <b className="text-retro-cta">BURST:</b> at 100% the gauge bursts. That is a strike, and the needle restarts at 40%.
      </p>
    </Section>
  )
}
