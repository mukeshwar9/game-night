// WIRE CROSSED Handbook page: PULSE. The codebook (pattern letters to MHz),
// sorted by frequency. Tier III adds the long-flash rule.
import { COLOR_LETTERS, COLOR_NAMES } from '../../../lib/wireLogic'
import { PULSE_COLORS } from '../../../lib/wire/modules/pulse'
import { wireColor } from '../colors'
import Section from './Section'

export default function PulseManual({ module }) {
  const { manual, tier = 1 } = module
  const entries = [...manual.entries].sort((a, b) => Number(a.freq) - Number(b.freq))
  const intro = [
    'The Tech sees a lamp that flashes a colour pattern, pauses, and repeats. Start reading after the pause: the first flash after the pause is the first letter. Find the pattern in the table and tell the Tech its frequency. The wrong frequency is a strike.',
    tier >= 2 ? ' Patterns can look alike, and the same loop read from the wrong flash gives another entry in the table. Read the whole pattern from the pause.' : '',
    tier >= 3 ? ' A long flash counts as two of that colour: R— B G is R R B G. The table lists every pattern with long flashes already expanded.' : '',
  ].join('')
  return (
    <Section title="PULSE" intro={intro}>
      <p className="flex flex-wrap gap-x-3 gap-y-1 font-pixel text-[8px] text-retro-dim" aria-label="Letters">
        {PULSE_COLORS.map(color => (
          <span key={color} className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm border border-retro-border" style={{ background: wireColor(color) }} aria-hidden="true" />
            {COLOR_LETTERS[color]} = {COLOR_NAMES[color]}
          </span>
        ))}
      </p>
      <table className="w-full max-w-[18rem] border-collapse font-mono text-[11px] text-retro-text">
        <caption className="sr-only">Pulse codebook, pattern to frequency</caption>
        <thead>
          <tr className="font-pixel text-[8px] text-retro-dim text-left">
            <th scope="col" className="py-1 pr-3 font-normal">PATTERN</th>
            <th scope="col" className="py-1 font-normal">MHz</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ pattern, freq }) => (
            <tr key={freq} className="border-t border-retro-border">
              <td className="py-1 pr-3 tracking-[0.3em]">{pattern}</td>
              <td className="py-1 font-bold text-retro-cta">{freq}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}
