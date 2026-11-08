// SIDE KICK / DUST KICK thumb cockpit: pure helpers, no DOM, no Firebase, no React.
// Two things live here: which way the one self-aiming KICK button swings, and
// which controls the thumb zones hold. The rules themselves (reach, cooldown,
// strain, the wire) stay in sideKickLogic.js and are not touched.
import { REACH_Z, kickTarget } from './sideKickLogic'

/** Button sizes in px. All above Apple's 44 pt minimum. Starting values from the design board. */
export const COCKPIT = Object.freeze({ kick: 96, kickPair: 60, boost: 64, steerH: 64, steerW: 60, minTouch: 44 })

/**
 * The rider a kick would land on, and which side it is on. With a rider in reach on both sides the one
 * laterally closer wins, then the one closer along the road, then the right. `{ side: 0, target: null }`
 * when nobody is in reach.
 */
export function aimKick(world, rider) {
  if (!world || !rider) return { side: 0, target: null }
  const cands = [-1, 1]
    .map((side) => ({ side, target: kickTarget(world, rider, side) }))
    .filter((c) => c.target)
  if (!cands.length) return { side: 0, target: null }
  cands.sort((a, b) => (
    Math.abs(a.target.x - rider.x) - Math.abs(b.target.x - rider.x)
    || Math.abs(a.target.z - rider.z) - Math.abs(b.target.z - rider.z)
    || b.side - a.side
  ))
  return cands[0]
}

/**
 * The side one tap on KICK swings. A rider in reach decides it. With nobody in reach it swings the way
 * you are steering (and the sim counts the miss as it does today); with no steer, toward the nearest
 * rider close by along the road, else toward the middle of the road.
 */
export function kickSideFor(world, rider, steer = 0) {
  const aim = aimKick(world, rider)
  if (aim.side) return aim.side
  if (steer < -0.05) return -1
  if (steer > 0.05) return 1
  const near = (world?.riders || [])
    .filter((o) => o !== rider && o.state === 'ride' && !o.done && Math.abs(o.z - rider.z) < REACH_Z * 2 && Math.abs(o.x - rider.x) > 0.02)
    .sort((a, b) => Math.abs(a.x - rider.x) - Math.abs(b.x - rider.x))[0]
  if (near) return near.x > rider.x ? 1 : -1
  return rider.x > 0.05 ? -1 : rider.x < -0.05 ? 1 : 1
}

/**
 * What each thumb zone holds. The left thumb steers (the tilt gauge when tilt is live, two halves
 * otherwise). The right thumb has KICK (one button, or KICK L and KICK R as a pair) with BOOST above
 * it, and in DUST KICK a LASSO above that only while a coil is in hand.
 */
export function cockpitZones({ kickMode = 'auto', tiltOn = false, dust = false, rope = false } = {}) {
  const kick = kickMode === 'two' ? ['kickL', 'kickR'] : ['kick']
  const right = [...(dust && rope ? ['lasso'] : []), 'boost', ...kick]
  return { left: tiltOn ? ['tilt'] : ['steerL', 'steerR'], right }
}

/** The label of the kick button: BUCK in DUST KICK, with a pointer to the target's side when there is one. */
export function kickLabel({ dust = false, side = 0 } = {}) {
  const word = dust ? 'BUCK' : 'KICK'
  return side < 0 ? `◀ ${word}` : side > 0 ? `${word} ▶` : word
}
