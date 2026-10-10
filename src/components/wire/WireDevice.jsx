// WIRE CROSSED: the Tech's device panels, one per module type (see panels/).
// Rendering and input only — every verdict comes from applyWireAction
// (src/lib/wireLogic.js) via the page's onAction. A module type is drawn once
// its panel is registered here.
import WiresPanel from './panels/WiresPanel'
import KeypadPanel from './panels/KeypadPanel'
import LeverPanel from './panels/LeverPanel'
import MazePanel from './panels/MazePanel'
import PatchPanel from './panels/PatchPanel'
import SwitchPanel from './panels/SwitchPanel'
import PulsePanel from './panels/PulsePanel'
import RelayPanel from './panels/RelayPanel'
import CallSignPanel from './panels/CallSignPanel'
import GaugePanel from './panels/GaugePanel'

const PANELS = {
  wires: WiresPanel, keypad: KeypadPanel, lever: LeverPanel, maze: MazePanel, patch: PatchPanel,
  switch: SwitchPanel, pulse: PulsePanel, relay: RelayPanel, callsign: CallSignPanel, gauge: GaugePanel,
}

export default function WireDevice({ module, ...props }) {
  const Panel = PANELS[module.type]
  return Panel ? <Panel module={module} {...props} /> : null
}
