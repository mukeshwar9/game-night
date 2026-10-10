// WIRE CROSSED Handbook page: SWITCHBOARD. Three target rules (first match
// wins, the last is "otherwise"), then the short circuits and the lock.
import { describeCond, describeLock, describeShort } from '../../../lib/wireLogic'
import Section from './Section'

function Board({ target, count }) {
  return (
    <span className="inline-flex gap-1 font-mono text-[11px] text-retro-cta" aria-label={`target: ${Array.from({ length: count }, (_, k) => `switch ${k + 1} ${target >> k & 1 ? 'up' : 'down'}`).join(', ')}`}>
      {Array.from({ length: count }, (_, k) => (
        <span key={k} className="inline-flex flex-col items-center leading-none" aria-hidden="true">
          <span className="text-[8px] text-retro-dim">{k + 1}</span>
          <b>{target >> k & 1 ? '▲' : '▼'}</b>
        </span>
      ))}
    </span>
  )
}

export default function SwitchManual({ module }) {
  const { manual, device } = module
  const count = device.lights.length
  const { rules, shorts, lock } = manual
  const intro = 'The Tech has a row of switches, each with a light (R, Y, G, B or dark). Read the lights, take the FIRST rule that matches and tell the Tech which switches to put ▲ and which ▼. Do it without ever showing a short circuit, even for a moment: that is a strike and the flip is undone.'
  return (
    <Section title="SWITCHBOARD" intro={intro}>
      <ol className="space-y-2" aria-label="Target rules">
        {rules.map((rule, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 font-mono text-[11px] leading-snug text-retro-text">
            <span className="font-pixel text-[9px] text-retro-dim">{i + 1}.</span>
            <span>{rule.cond ? `If ${describeCond(rule.cond)}:` : 'Otherwise:'}</span>
            <Board target={rule.target} count={count} />
          </li>
        ))}
      </ol>
      {shorts.length > 0 && (
        <div className="space-y-1">
          <h4 className="font-pixel text-[9px] text-retro-cta tracking-widest">SHORT CIRCUITS</h4>
          <ul className="space-y-1 list-disc pl-4" aria-label="Short circuits">
            {shorts.map((short, i) => (
              <li key={i} className="font-mono text-[11px] text-retro-text">{describeShort(short)}</li>
            ))}
          </ul>
        </div>
      )}
      {lock && (
        <p className="font-mono text-[11px] leading-relaxed text-retro-text">
          <b className="text-retro-cta">LOCK:</b> {describeLock(lock)}. A locked switch will not move, and trying is not a strike.
        </p>
      )}
    </Section>
  )
}
