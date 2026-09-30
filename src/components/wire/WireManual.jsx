// WIRE CROSSED: the Handbook's manual — one page per module on this bomb,
// every table generated for this bomb (src/lib/wireLogic.js). The pages live in
// manual/; this file is the tab row plus the registry.
import { cn } from '@/lib/utils'
import { MODULE_NAMES, pageOrderOf } from '../../lib/wireLogic'
import WiresManual from './manual/WiresManual'
import KeypadManual from './manual/KeypadManual'
import LeverManual from './manual/LeverManual'
import MazeManual from './manual/MazeManual'
import PatchManual from './manual/PatchManual'
import SwitchManual from './manual/SwitchManual'
import PulseManual from './manual/PulseManual'
import RelayManual from './manual/RelayManual'
import CallSignManual from './manual/CallSignManual'
import GaugeManual from './manual/GaugeManual'

const MANUALS = {
  wires: WiresManual, keypad: KeypadManual, lever: LeverManual, maze: MazeManual, patch: PatchManual,
  switch: SwitchManual, pulse: PulseManual, relay: RelayManual, callsign: CallSignManual, gauge: GaugeManual,
}

/**
 * The Errata slip: a red note at the top of the affected page. The word ERRATA
 * and the struck-through old rule carry the meaning, not the colour.
 */
function ErrataSlip({ errata }) {
  return (
    <div role="note" aria-label="Errata" className="rounded border-2 border-retro-danger bg-retro-tint-danger p-2 space-y-1.5">
      <p className="font-pixel text-[9px] text-retro-danger tracking-widest">ERRATA — replaces {errata.where}</p>
      <p className="font-mono text-[11px] leading-snug text-retro-dim">
        <span className="sr-only">Old rule, no longer true: </span>
        <s>{errata.was}</s>
      </p>
      <p className="font-mono text-[11px] leading-snug text-retro-text">
        <span className="sr-only">New rule: </span>
        <b>{errata.now}</b>
      </p>
    </div>
  )
}

/**
 * Tabs follow `bomb.pageOrder` (Scrambled Pages), so the Handbook's tab order
 * can differ from the Tech's. `tab` and `onTab` are module indexes, and tabs
 * are keyed by index because a bomb may repeat a module type.
 * @param {{ bomb: any, tab: number, onTab: (i: number) => void, solved: (i: number) => boolean }} props
 */
export default function WireManual({ bomb, tab, onTab, solved }) {
  const active = bomb.modules[tab] ? tab : 0
  const module = bomb.modules[active]
  const Manual = MANUALS[module.type]
  const { errata } = bomb
  return (
    <div className="w-full space-y-3">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(3, bomb.modules.length)}, minmax(0, 1fr))` }} role="tablist" aria-label="Manual pages">
        {pageOrderOf(bomb).map(i => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => onTab(i)}
            className={cn(
              'min-h-11 rounded border-2 font-pixel text-[8px] tracking-wider flex items-center justify-center gap-1',
              active === i ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim',
            )}
          >
            {bomb.modules[i].type !== 'gauge' && solved(i) && <span className="text-retro-win" aria-label="done">✓</span>}
            {MODULE_NAMES[bomb.modules[i].type]}
          </button>
        ))}
      </div>
      <div className="rounded border-2 border-retro-border bg-retro-card p-3 space-y-3">
        {errata && errata.mod === active && <ErrataSlip errata={errata} />}
        {Manual && <Manual key={active} module={module} bomb={bomb} />}
      </div>
    </div>
  )
}
