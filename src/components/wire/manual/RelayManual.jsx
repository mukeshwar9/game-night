// WIRE CROSSED Handbook page: RELAY. One rule block per stage, one rule per
// display word. The Tech sees the display and the key labels; the Handbook
// holds the rules. Neither screen shows the press log.
import { RELAY_WORDS, describeRelayRule } from '../../../lib/wire/modules/relay'
import Section from './Section'

export default function RelayManual({ module }) {
  const { manual, tier = 1 } = module
  const total = manual.stages.length
  const intro = [
    `The Tech has ${total} stages. Each stage shows a display word (HOLD, SEND, MUTE or OPEN) and a number from 1 to 4 above four keys. Find the block for the current stage, read the rule for the display word and tell the Tech which key to press. Positions count from the left; a label is the number printed on the key.`,
    tier >= 3
      ? ' A wrong press is a strike and sends the Tech back to stage 1 with new displays. Earlier presses no longer count, so start a fresh log.'
      : ' A wrong press is a strike; the Tech stays on the same stage.',
  ].join('')
  return (
    <Section title="RELAY" intro={intro}>
      <div className="space-y-3">
        {manual.stages.map((block, s) => (
          <div key={s} className="space-y-1">
            <h4 className="font-pixel text-[9px] text-retro-cta tracking-widest">STAGE {s + 1}</h4>
            <ul className="space-y-1 list-disc pl-4" aria-label={`Rules, stage ${s + 1}`}>
              {RELAY_WORDS.map(word => (
                <li key={word} className="font-mono text-[11px] leading-snug text-retro-text">
                  Display word <b className="text-retro-cta">{word}</b>: {describeRelayRule(block[word])}.
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-retro-dim">
        Keep a log. Later stages ask about what you pressed earlier, by position and by label.
        {tier >= 3 ? ' After a reset the log starts again from stage 1.' : ''}
      </p>
    </Section>
  )
}
