// bonkArenas.js — BONK BUGGIES arena geometry. Pure data builders: no DOM, no
// Firebase, no React, no physics engine. The sim (bonkLogic.js) turns a built
// arena into planck bodies and the renderer (bonkDraw.js) paints the same
// outline, so the picture and the collision shape cannot drift apart.
//
// World units are metres, +y is up. A buggy is about 1.9 m long; every arena
// is roughly 18 m across, so the start marks sit about ten buggy lengths apart.
//
// build() returns
//   solids  [{ pts, cave?, post? }]  closed outlines; `pts.top` = how many
//                                    leading points make the grass-topped surface
//   planks  [{ x, y, len, th, limit, px?, py? }]  loose boards on a hinge
//   ground  (x) => y                 height of the driving surface (spawn + bots)
//   spawns  [x0, x1, x2, x3]         start marks: seat 0, seat 1, then spares
//   half    half-width of the playable arena
//   closed  true for the drum (nothing to fall off)

/** What the camera shows at zoom 1, in metres. */
export const VIEW = { x0: -7, x1: 7, y0: -0.6, y1: 8.4, w: 14 }

function sample(fn, a, b, n) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const x = a + (b - a) * i / n
    pts.push([x, fn(x)])
  }
  return pts
}

// An island: a top profile closed with a rounded belly underneath.
function island(top, depth) {
  const l = top[0]
  const r = top[top.length - 1]
  const pts = top.slice()
  const n = 14
  const base = Math.min(...top.map((p) => p[1]))
  for (let k = 1; k < n; k++) {
    const t = k / n
    const w = Math.pow(Math.sin(Math.PI * t), 0.6)
    pts.push([r[0] + (l[0] - r[0]) * t, (t < 0.5 ? r[1] : l[1]) * (1 - w) + (base - 0.35 - depth) * w])
  }
  pts.top = top.length
  return pts
}

function slab(x0, x1, yTop, th) {
  const pts = []
  const n = 6
  for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, yTop])
  pts.push([x1 - 0.18, yTop - th])
  pts.push([x0 + 0.18, yTop - th])
  return pts
}

export const ARENAS = [
  {
    id: 'halfpipe', name: 'HALFPIPE', blurb: 'Roll in from the shoulders and meet in the bowl.',
    build() {
      const f = (x) => {
        const a = Math.abs(x)
        return a > 6.3 ? 4.7 : 2.0 + 2.7 * Math.pow(a / 6.3, 2.2) + 0.35 * Math.exp(-Math.pow(x / 0.9, 2))
      }
      return { solids: [{ pts: island(sample(f, -8.8, 8.8, 64), 1.5) }], planks: [], ground: f, spawns: [-7.5, 7.5, -3.2, 3.2], half: 8.8, closed: false }
    },
  },
  {
    id: 'humps', name: 'THREE HUMPS', blurb: 'Crests to launch from, dips that flood first.',
    build() {
      const f = (x) => 2.85 - 0.6 * Math.cos(2 * Math.PI * x / 5.8) + 0.6 * Math.pow(Math.abs(x) / 9, 8)
      return { solids: [{ pts: island(sample(f, -9, 9, 72), 1.4) }], planks: [], ground: f, spawns: [-5.8, 5.8, -2.9, 2.9], half: 9, closed: false }
    },
  },
  {
    id: 'kicker', name: 'KICKER', blurb: 'One big ramp, two small ones. Whoever times it lands on top.',
    build() {
      const f = (x) => 2.3 + 1.5 * Math.exp(-Math.pow(x / 1.7, 2)) + 0.55 * Math.exp(-Math.pow((Math.abs(x) - 5) / 0.9, 2)) + 1.5 * Math.pow(Math.abs(x) / 9, 8)
      return { solids: [{ pts: island(sample(f, -9, 9, 72), 1.3) }], planks: [], ground: f, spawns: [-7.4, 7.4, -3.2, 3.2], half: 9, closed: false }
    },
  },
  {
    id: 'seesaw', name: 'SEESAW', blurb: 'A loose plank bridges the pit. Your weight is their launch pad.',
    build() {
      const step = (a) => {
        const t = Math.max(0, Math.min(1, (a - 3.3) / 0.9))
        return t * t * (3 - 2 * t)
      }
      const f = (x) => 2.4 + 0.62 * step(Math.abs(x)) + 1.5 * Math.pow(Math.abs(x) / 9.4, 8)
      return {
        solids: [{ pts: island(sample(f, -9.4, 9.4, 72), 1.3) }, { pts: [[-0.5, 2.38], [0, 2.95], [0.5, 2.38]], post: true }],
        // a plank bridges the pit between two plateaus and tips under whoever drives onto it
        planks: [{ x: 0, y: 3.08, len: 7.4, th: 0.2, limit: 0.17, px: 0, py: 3.08 }],
        ground: f, spawns: [-7.4, 7.4, -5.2, 5.2], half: 9.4, closed: false,
      }
    },
  },
  {
    id: 'decks', name: 'SPLIT DECKS', blurb: 'Two decks and a sunken stepping stone. Mind the gaps.',
    build() {
      const g = (x) => (Math.abs(x) < 2.1 ? 2.95 : 3.45)
      return {
        solids: [{ pts: slab(-9.4, -2.45, 3.45, 0.6) }, { pts: slab(2.45, 9.4, 3.45, 0.6) }, { pts: slab(-2.1, 2.1, 2.95, 0.55) }],
        planks: [], ground: g, spawns: [-7.6, 7.6, -4.6, 4.6], half: 9.4, closed: false,
      }
    },
  },
  {
    id: 'drum', name: 'THE DRUM', blurb: 'A closed drum: enough speed takes you up the wall and over.',
    build() {
      const pts = []
      const n = 84
      const cy = 4.5
      const a = 9.4
      const b = 3.6
      const bump = (x) => 0.34 * Math.exp(-Math.pow(x / 0.9, 2)) + 0.3 * Math.exp(-Math.pow((Math.abs(x) - 4.6) / 0.8, 2))
      for (let i = 0; i < n; i++) {
        const th = -Math.PI / 2 + 2 * Math.PI * i / n
        const c = Math.cos(th)
        const s = Math.sin(th)
        const e = 2 / 3.4
        const x = a * Math.sign(c) * Math.pow(Math.abs(c), e)
        let y = cy + b * Math.sign(s) * Math.pow(Math.abs(s), e)
        if (s < -0.6) y += bump(x)
        pts.push([x, y])
      }
      const f = (x) => 0.95 + bump(x) + 0.5 * Math.pow(Math.abs(x) / 9.4, 5)
      return { solids: [{ pts, cave: true }], planks: [], ground: f, spawns: [-6.6, 6.6, -2.4, 2.4], half: 9.4, closed: true }
    },
  },
]

export const ARENA_IDS = ARENAS.map((a) => a.id)

export function arenaById(id) {
  return ARENAS.find((a) => a.id === id) || ARENAS[0]
}

const builtCache = new Map()
/** Built geometry for an arena id, cached: the renderer asks every frame. */
export function arenaGeometry(id) {
  const a = arenaById(id)
  let geo = builtCache.get(a.id)
  if (!geo) { geo = a.build(); builtCache.set(a.id, geo) }
  return geo
}
