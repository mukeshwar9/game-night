import { useCallback, useState } from 'react'
import { createFx, applyEvent } from '../lib/bonkFx'
import { isReducedMotion } from './useMotionPref'
import { sounds } from '../lib/sounds'

// Sound and particle reactions to BONK BUGGIES sim events, shared by the room
// page (host and guest) and the one-phone page. `fx` is the mutable state the
// arena paints; `apply(event, { me })` feeds it one event and plays the cues.
// `me` is the seat letter whose screen this is ('X' | 'O'), or null when both
// players share the screen: a point is then a cheer, never a groan.
function play(cue) {
  switch (cue.cue) {
    case 'clash': sounds.sumoClash(cue.power ?? 0.5); break
    case 'thud': sounds.stackLand(cue.power ?? 0.5); break
    case 'splash': sounds.splash(); break
    case 'hop': sounds.boing(); break
    case 'shield': sounds.crowPop(); break
    case 'bonk': sounds.drop(); break
    case 'sunk': sounds.splash(); break
    case 'tick': sounds.move('X'); break
    case 'go': sounds.go(); break
    case 'chose': sounds.hit(4); break
    default: break
  }
}

export default function useBonkFx() {
  const [fx] = useState(() => createFx(Math.random))
  const apply = useCallback((e, { me = null } = {}) => {
    for (const c of applyEvent(fx, e, { reduced: isReducedMotion() })) play(c)
    if (e.type === 'point' && e.by) {
      if (me && e.by !== me) sounds.lose()
      else sounds.pigBank()
    }
  }, [fx])
  return { fx, apply }
}
