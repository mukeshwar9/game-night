// WIRE CROSSED Handbook page: CALL SIGN. The valid call signs for this length
// as a compact grid; tier III adds the shift rule and an A-Z strip.
import { callsignWords } from '../../../lib/wire/callsignWords'
import Section from './Section'

const ALPHABET = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ')

export default function CallSignManual({ module }) {
  const { length, shift = 0 } = module.manual
  const words = callsignWords(length)
  const intro = [
    `The Tech has ${length} letter wheels. Exactly one call sign from the list can be spelled with one letter from each wheel. Tell them to transmit it. A wrong word is a strike.`,
    shift ? ` The wheels are shifted forward by the last digit of the serial. Shift each wheel letter back by that many places (wrapping past A) before you check the list. Tell the Tech to transmit the word the wheels show, not the list word.` : '',
  ].join('')
  return (
    <Section title="CALL SIGN" intro={intro}>
      <div>
        <h4 className="font-pixel text-[9px] text-retro-cta tracking-widest mb-1">VALID CALL SIGNS ({words.length})</h4>
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-1 font-mono text-[11px] text-retro-text" aria-label="Valid call signs">
          {words.map(word => <li key={word}>{word}</li>)}
        </ul>
      </div>
      {shift > 0 && (
        <div>
          <h4 className="font-pixel text-[9px] text-retro-cta tracking-widest mb-1">TIER III SHIFT</h4>
          <p className="font-mono text-[11px] text-retro-text mb-2">
            Shift back by the serial's last digit. Example with digit 2: C is 2 places after A, so C means A.
          </p>
          <ol className="flex flex-wrap gap-1 font-pixel text-[9px] text-retro-dim" aria-label="Alphabet strip, A to Z">
            {ALPHABET.map((ch, i) => (
              <li key={ch} className="w-6 text-center border border-retro-border rounded bg-retro-deep">
                <span className="block text-retro-text">{ch}</span>
                <span className="block text-[7px]">{i + 1}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  )
}
