// DUST KICK: the Wild West rules of SIDE KICK. Not a second engine: sideKickLogic.js
// runs both, and `createWorld({ dust: true })` switches these rules on (horses that
// buck, hay and spurs, a rope, Western hazards in place of traffic). This module holds
// the numbers and the pure builders for the roadside; it imports nothing, so
// sideKickLogic.js can use it.
//
// Every number is a starting value chosen without a playtest, like SIDE KICK's own.

// ── Kick ─────────────────────────────────────────────────────────────────
/** A kicked rider's speed is cut to this share (SIDE KICK: 0.82). */
export const DUST_KICK_SLOW = 0.75
/** ...and the horse is spooked: this long at SPOOK_TOP of its top speed. */
export const SPOOK_T = 0.8
export const SPOOK_TOP = 0.85
/** A landed kick fills the kicker's SPURS meter by this much. */
export const KICK_FILL = 0.2

// ── Hay and the spurs meter ──────────────────────────────────────────────
export const HAY_FILL = 1 / 3
export const HAY_SURGE_T = 0.5
export const HAY_SURGE_TOP = 1.05
export const HAY_GRAB_X = 0.2
export const COIL_GRAB_X = 0.2

// ── Lasso ────────────────────────────────────────────────────────────────
export const LASSO_WIND = 0.3
export const LASSO_RANGE_Z = 1400
export const LASSO_RANGE_X = 0.55
export const ROPED_T = 1.2
export const ROPED_TOP = 0.7
export const REEL_T = 1.2
export const REEL_TOP = 1.12
/** The coil on the post: how many per race, and how far in from the edge of the trail. */
export const COILS_PER_RACE = 2
export const COIL_X = 0.9

// ── Obstacles (no traffic) ───────────────────────────────────────────────
// Soft: a tumbleweed rolls across the trail and mud is SIDE KICK's oil. Medium: a rock in
// one lane and a cactus on the edge cost a horseshoe (a pip, never the last one) and a
// stumble. Hard: a log across two lanes throws the rider, signposted ahead.
export const WEED_HIT_X = 0.2
export const WEED_HIT_Z = 220
export const WEED_SLOW = 0.9
export const WEED_WOBBLE = 0.4
export const WEED_DRIFT = 1500
export const ROCK_HIT_X = 0.15
export const ROCK_SLOW = 0.7
export const CACTUS_HIT_X = 0.14
export const CACTUS_SLOW = 0.85
export const LOG_HIT_X = 0.36
/** The warning sign stands this many segments before a log (about 2 s at full speed). */
export const LOG_SIGN_SEGS = 110
export const HAZARD_HALF = { rock: ROCK_HIT_X, cactus: CACTUS_HIT_X, log: LOG_HIT_X }

/** The three roads of the cup: Canyon (lead look), Prairie, Town. Pieces are borrowed from SIDE KICK's roads. */
export const DUST_ORDER = ['canyon', 'prairie', 'town']
export const DUST_LOOKS = {
  canyon: { weeds: 9, hay: [70, 70], rocks: 6, logs: 3, cactus: 0.02, mud: [620, 260] },
  prairie: { weeds: 10, hay: [60, 70], rocks: 5, logs: 2, cactus: 0.012, mud: [560, 260] },
  town: { weeds: 8, hay: [60, 60], rocks: 5, logs: 3, cactus: 0.008, mud: [520, 240] },
}

/** A triangle wave between -1 and 1: where a tumbleweed rolling to and fro across the trail is at phase `u`. */
export function tri(u) {
  const p = (((u + 1) % 4) + 4) % 4
  return p < 2 ? p - 1 : 3 - p
}

/** Where tumbleweed `w` is at race time `t` (a pure function of time, so every phone agrees). */
export function weedAt(w, t) {
  return { z: w.z0 + WEED_DRIFT * t, x: tri(w.x0 + w.dir * w.spd * t) }
}

/** Western roadside for one seed, written into the segments' `spr` lists. */
function scenery(s, i, rnd, look, side) {
  const x = (a, b) => side * (a + rnd() * b)
  if (look === 'canyon') {
    if (rnd() < 0.28) s.spr.push({ k: 'mesa', x: x(1.7, 2.4), v: rnd() })
    if (rnd() < 0.3) s.spr.push({ k: 'saguaro', x: x(1.3, 2), v: rnd() })
    if (rnd() < 0.12) s.spr.push({ k: 'boulder', x: x(1.4, 1.8), v: rnd() })
  } else if (look === 'prairie') {
    if (rnd() < 0.05) s.spr.push({ k: 'saguaro', x: x(1.5, 2), v: rnd() })
    if (rnd() < 0.05) s.spr.push({ k: 'mesa', x: x(3.5, 2), v: rnd() })
    if (rnd() < 0.05) s.spr.push({ k: 'boulder', x: x(1.5, 1.5), v: rnd() })
    if (i % 16 === 0) s.spr.push({ k: 'pole', x: -1.32, v: (i / 16) % 2 })
    if (i >= 220 && i < 760 && i % 6 === 0) s.spr.push({ k: 'wagon', x: -3.3, v: (i / 6) % 3 })
  } else {
    if (rnd() < 0.32) s.spr.push({ k: 'shop', x: x(2.1, 0.7), v: rnd() })
    if (i % 260 === 130) s.spr.push({ k: 'tower', x: side * 3.1, v: 0 })
    if (rnd() < 0.04) s.spr.push({ k: 'saguaro', x: x(1.6, 1.6), v: rnd() })
    if (i % 14 === 0) s.spr.push({ k: 'pole', x: 1.32, v: (i / 14) % 2 })
  }
  if (rnd() < 0.2) s.spr.push({ k: 'tuft', x: -side * (1.14 + rnd() * 0.5), v: rnd() })
}

/**
 * Grow the Western road: roadside, mud, rocks, logs and their signs, edge cactus, hay, rope coils
 * and the tumbleweeds. Everything is seeded (`rnd`), so every phone grows the same trail.
 * @param {{ i: number, z: number, curve: number, spr: any[] }[]} segs
 * @param {{ SEG: number, LANEX: number[], finish: number, look: string, rnd: () => number }} o
 * @returns {{ weeds: any[], haz: { k: string, z: number, x: number, hw: number }[], hay: { id: number, z: number, x: number, k: string }[] }}
 */
export function buildDustFeatures(segs, { SEG, LANEX, finish, look, rnd }) {
  const def = DUST_LOOKS[look] || DUST_LOOKS.canyon
  const n = segs.length
  for (let i = 4; i < n; i++) {
    scenery(segs[i], i, rnd, look, rnd() < 0.5 ? -1 : 1)
    if (Math.abs(segs[i].curve) > 2.9 && i % 10 === 0) segs[i].spr.push({ k: 'chev', x: segs[i].curve > 0 ? -1.22 : 1.22, v: segs[i].curve > 0 ? 1 : -1 })
  }
  const haz = []
  const used = new Set()
  // The first segment from `i` on with a clear run (no bend over `max`) of 12 segments, or -1.
  const straight = (i, max = 0.4, reach = 180) => {
    for (let j = i; j < Math.min(n - 60, i + reach); j++) {
      let ok = true
      for (let k = 0; k <= 12 && ok; k++) ok = Math.abs(segs[Math.min(n - 1, j + k)].curve) < max
      if (ok) return j
    }
    return -1
  }
  const near = (i, gap = 5) => { for (let d = -gap; d <= gap; d++) if (used.has(i + d)) return true; return false }
  const mark = (i) => { used.add(i) }
  // Mud: SIDE KICK's oil, on its own spacing.
  for (let i = 130; i < n - 260; i += def.mud[0] + Math.floor(rnd() * def.mud[1])) {
    segs[i].spr.push({ k: 'oil', x: LANEX[Math.floor(rnd() * 4)] + (rnd() - 0.5) * 0.1 })
    mark(i)
  }
  const spread = (count, from, to) => Array.from({ length: count }, (_, q) => Math.floor(from + ((q + 0.15 + rnd() * 0.7) * (to - from)) / count))
  // Logs: across two lanes, never on a bend, with a sign 2 s up the road.
  for (const at of spread(def.logs, 260, n - 200)) {
    const i = straight(at)
    if (i < 0 || near(i, 8)) continue
    const x = [-0.5, 0, 0.5][Math.floor(rnd() * 3)]
    segs[i].spr.push({ k: 'log', x })
    segs[Math.max(5, i - LOG_SIGN_SEGS)].spr.push({ k: 'sign', x: rnd() < 0.5 ? -1.2 : 1.2, v: 0 })
    haz.push({ k: 'log', z: i * SEG + SEG / 2, x, hw: LOG_HIT_X })
    mark(i)
  }
  // Rocks: one lane each.
  for (const at of spread(def.rocks, 200, n - 200)) {
    const i = straight(at, 1.2)
    if (i < 0 || near(i, 6)) continue
    const x = LANEX[Math.floor(rnd() * 4)]
    segs[i].spr.push({ k: 'rock', x, v: rnd() })
    haz.push({ k: 'rock', z: i * SEG + SEG / 2, x, hw: ROCK_HIT_X })
    mark(i)
  }
  // Cactus lines the verges: edges only, so a hug of the rail costs a horseshoe.
  for (let i = 150; i < n - 100; i++) {
    if (rnd() < def.cactus && !near(i, 3)) {
      const side = rnd() < 0.5 ? -1 : 1
      const x = side * 0.95
      segs[i].spr.push({ k: 'cactus', x, v: rnd() })
      haz.push({ k: 'cactus', z: i * SEG + SEG / 2, x, hw: CACTUS_HIT_X })
    }
  }
  // Hay: rows of one to three bales across the lanes, off the bends and clear of hazards.
  const hay = []
  for (let i = 120; i < n - 120; i += def.hay[0] + Math.floor(rnd() * def.hay[1])) {
    const at = straight(i, 1.5, 40)
    if (at < 0 || near(at, 5)) continue
    const count = 1 + Math.floor(rnd() * 3)
    const l0 = Math.floor(rnd() * (5 - count))
    for (let k = 0; k < count; k++) {
      const x = LANEX[l0 + k]
      const id = at * 4 + (l0 + k)
      segs[at].spr.push({ k: 'hay', x, id })
      hay.push({ id, z: at * SEG + SEG / 2, x, k: 'hay' })
    }
  }
  // Rope coils: two a race, on posts by the trail.
  for (let q = 0; q < COILS_PER_RACE; q++) {
    const i = straight(Math.floor(((q + 0.5) / COILS_PER_RACE) * (n - 200)) + 100, 0.8)
    if (i < 0) continue
    const x = (rnd() < 0.5 ? -1 : 1) * COIL_X
    const id = 1e6 + i
    segs[i].spr.push({ k: 'coil', x, id })
    hay.push({ id, z: i * SEG + SEG / 2, x, k: 'coil' })
  }
  hay.sort((a, b) => a.z - b.z)
  haz.sort((a, b) => a.z - b.z)
  // Tumbleweeds: roll across the trail, a pure function of race time.
  const weeds = []
  const lo = 100 * SEG
  const hi = finish - 60 * SEG
  for (let q = 0; q < def.weeds; q++) {
    weeds.push({ z0: lo + ((q + 0.2 + rnd() * 0.6) * (hi - lo)) / def.weeds, z: 0, x: 0, x0: rnd() * 4 - 1, dir: rnd() < 0.5 ? -1 : 1, spd: 0.45 + rnd() * 0.25, spin: rnd() })
  }
  for (const w of weeds) { w.z = w.z0; w.x = tri(w.x0) }
  return { weeds, haz, hay }
}

/** The shared-state key for a lasso: `victimId|L` under the thrower's `k/{n}`. */
export const lassoKey = (victimId) => `${victimId}|L`
