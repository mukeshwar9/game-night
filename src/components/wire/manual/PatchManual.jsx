// WIRE CROSSED Handbook page: PATCH BAY. A routing table (colour chip, letter,
// socket) per column; tier II+ has two columns picked by an indicator, tier III
// adds the tangle rules.
import { COLOR_LETTERS, COLUMN_NAMES } from '../../../lib/wireLogic'
import { ColorTag } from '../ColorTag'
import Section from './Section'

function Routing({ title, column, plugs }) {
  return (
    <div className="space-y-1">
      {title && <h4 className="font-pixel text-[9px] text-retro-cta tracking-widest">{title}</h4>}
      <ul className="space-y-1" aria-label={title ? `Routing, ${title}` : 'Routing'}>
        {column.map((socket, plug) => (
          <li key={plug} className="flex items-center gap-2 font-mono text-[11px] text-retro-text">
            <ColorTag color={plugs[plug]} />
            <span className="font-pixel text-[9px] text-retro-dim">{COLOR_LETTERS[plugs[plug]]}</span>
            <span aria-hidden="true">to</span>
            <span className="sr-only">goes to socket</span>
            <b className="text-retro-cta">{socket + 1}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PatchManual({ module }) {
  const { manual, device, tier = 1 } = module
  const { columns, rule } = manual
  const intro = [
    'The Tech has coloured plugs on the left and numbered sockets on the right. Tell them which socket each plug goes in. A plug in the wrong socket is a strike and the cable springs out.',
    rule ? ` Use column ${COLUMN_NAMES[0]} if the ${rule.label} indicator is lit, else column ${COLUMN_NAMES[1]}.` : '',
    tier >= 3
      ? ' The bay starts tangled: 3 cables are already in the wrong sockets. Two cables cross when their plugs and sockets are in opposite order; the one patched later lies on top. A cable with another cable on top of it will not come out, and trying is a strike. Have the Tech unplug the top cable first. Every plug ends in its socket from the table; cables may cross in the final layout.'
      : '',
  ].join('')
  return (
    <Section title="PATCH BAY" intro={intro}>
      <div className="grid grid-cols-2 gap-4">
        {columns.map((column, k) => (
          <Routing key={k} title={rule ? `COLUMN ${COLUMN_NAMES[k]}` : null} column={column} plugs={device.plugs} />
        ))}
      </div>
    </Section>
  )
}
