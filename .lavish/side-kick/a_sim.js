// SIDE KICK prototype: one rider against three bots on a seeded pseudo-3D road.
// Self-contained: no storage, no network. Sim is a fixed 60 Hz step, the
// renderer draws any rider's seat in any theme palette (used for the four-seat
// layout and the theme strip below).
(function () {
  'use strict'
  const W = 360, H = 470, HORIZ = 178, YS = 250
  const SEG = 200, ROAD = 2000, CAMH = 1000, DRAW = 150
  const CAMD = 1 / Math.tan((100 / 2) * Math.PI / 180)
  const PLAYERZ = CAMH * CAMD
  const MAXSPD = SEG * 60
  const LANEX = [-0.75, -0.25, 0.25, 0.75]
  const DT = 1 / 60
  // Combat numbers (all placeholders to tune in the build).
  const KICK_T = 0.3, KICK_HIT_AT = 0.09, KICK_CD = 0.7
  const REACH_X = 0.37, REACH_Z = 250
  const PIPS = 3, PIP_REGEN = 4, STAGGER = 0.5, DOWN_T = 1.9, SHIELD = 1.5
  // Catch-up remount: only for a rider who falls while someone is ahead of them. It ends the moment
  // the gap to that rider is back to what it was at the fall, so falling can never gain ground.
  // Kicking costs balance: each kick adds strain, strain fades when you stop, and a kick that
  // pushes strain past 1 throws you off your own bike. A whiff costs more than a hit.
  const STRAIN_HIT = 0.3, STRAIN_MISS = 0.4, STRAIN_HOLD = 0.4, STRAIN_DECAY = 0.25
  // Boost: hold to burn the tank, let go to refill it.
  const BOOST_TOP = 1.18, BOOST_BURN = 1 / 2, BOOST_FILL = 1 / 8, BOOST_MIN = 0.15, BOOST_DELAY = 0.5, BOOST_START = 0.5
  const DOWN_T_BEHIND = 1.2, CATCHUP_MAX = 6, CATCHUP_TOP = 1.14, CATCHUP_ACCEL = 2.2, REMOUNT_SPD = 0.28, REMOUNT_SPD_BEHIND = 0.55
  const NAMES = ['YOU', 'PLUM', 'RUBY', 'TEAL']
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const easeIn = (a, b, t) => a + (b - a) * t * t
  const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5)
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

  // ── Themes ───────────────────────────────────────────────────────────────
  // Token triplets copied from src/index.css. Every colour in the scene is one
  // of these tokens or a mix of two, so a new app theme needs no new art.
  const TOKENS = {
    glass: { label: 'GLASS', dark: false, sky: 'art4', ground: 'art1', leaf: 'p1', bg: [238, 240, 226], card: [252, 253, 246], border: [185, 195, 165], text: [45, 55, 35], dim: [72, 84, 58], p1: [70, 121, 47], p2: [129, 89, 180], p3: [175, 55, 115], p4: [25, 100, 150], cta: [130, 95, 14], win: [38, 123, 66], danger: [190, 30, 50], deep: [228, 232, 214], structure: [160, 170, 140], tintCta: [242, 232, 200], art1: [150, 196, 120], art4: [140, 196, 232] },
    'glass-night': { label: 'GLASS NIGHT', dark: true, bg: [8, 8, 16], card: [19, 19, 40], border: [56, 56, 106], text: [236, 238, 255], dim: [220, 222, 250], p1: [0, 229, 255], p2: [255, 64, 129], p3: [171, 102, 255], p4: [255, 158, 44], cta: [255, 230, 0], win: [77, 255, 195], danger: [255, 45, 45], deep: [12, 12, 32], structure: [74, 74, 138], tintCta: [26, 21, 0] },
    synthwave: { label: 'SYNTHWAVE', dark: true, bg: [13, 2, 33], card: [26, 6, 64], border: [45, 27, 94], text: [240, 230, 255], dim: [135, 118, 186], p1: [0, 240, 255], p2: [255, 41, 117], p3: [181, 102, 255], p4: [255, 214, 61], cta: [255, 159, 28], win: [182, 255, 0], danger: [255, 20, 20], deep: [16, 4, 44], structure: [61, 43, 110], tintCta: [56, 32, 0] },
    shoreline: { label: 'SHORELINE', dark: false, sky: 'structure', skyMix: 0.15, ground: 'deep', leaf: 'win', bg: [246, 236, 214], card: [255, 252, 244], border: [218, 198, 162], text: [33, 49, 61], dim: [92, 86, 74], p1: [0, 112, 134], p2: [184, 46, 106], p3: [112, 76, 160], p4: [146, 96, 18], cta: [190, 62, 42], win: [20, 112, 76], danger: [176, 28, 34], deep: [238, 225, 198], structure: [96, 160, 176], tintCta: [252, 226, 214] },
    cartridge: { label: 'CARTRIDGE', dark: false, sky: 'p2', skyMix: 0.5, ground: 'p3', groundMix: 0.5, leaf: 'win', bg: [239, 230, 210], card: [255, 250, 240], border: [205, 191, 160], text: [42, 29, 23], dim: [107, 88, 72], p1: [179, 32, 44], p2: [31, 78, 156], p3: [15, 112, 102], p4: [160, 82, 14], cta: [92, 67, 0], win: [29, 111, 60], danger: [184, 63, 15], deep: [229, 218, 194], structure: [179, 163, 126], tintCta: [229, 221, 202] },
    phosphor: { label: 'PHOSPHOR', dark: true, bg: [3, 15, 3], card: [8, 32, 8], border: [16, 58, 16], text: [184, 255, 184], dim: [82, 148, 82], p1: [57, 255, 20], p2: [255, 211, 122], p3: [102, 255, 218], p4: [200, 255, 102], cta: [204, 255, 51], win: [118, 255, 118], danger: [255, 60, 40], deep: [4, 22, 4], structure: [20, 82, 20], tintCta: [24, 38, 0] },
  }
  const mx = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
  const css = (a, al) => al == null ? 'rgb(' + Math.round(a[0]) + ',' + Math.round(a[1]) + ',' + Math.round(a[2]) + ')' : 'rgba(' + Math.round(a[0]) + ',' + Math.round(a[1]) + ',' + Math.round(a[2]) + ',' + al + ')'
  const BLACK = [0, 0, 0]
  function buildPalette(id) {
    const t = TOKENS[id], d = t.dark, ps = [t.p1, t.p2, t.p3, t.p4]
    const SKY = d ? null : mx(t[t.sky], t.card, t.skyMix || 0), GROUND = d ? null : mx(t[t.ground], t.card, t.groundMix || 0), LEAF = d ? t.p1 : t[t.leaf]
    const raw = d ? {
      sky0: t.bg, sky1: mx(t.bg, t.p2, 0.42), mount: mx(t.bg, t.p3, 0.26), hillFar: mx(t.bg, t.p3, 0.15), hillNear: mx(t.bg, t.p1, 0.13),
      grassA: t.deep, grassB: mx(t.deep, t.p1, 0.08), roadA: t.card, roadB: mx(t.card, t.text, 0.05), kerbA: t.p1, kerbB: mx(t.p1, t.bg, 0.68), lane: mx(t.text, t.bg, 0.25), center: t.cta, edge: mx(t.p1, t.text, 0.4),
      fog: mx(t.bg, t.p2, 0.3), leaf0: mx(t.bg, LEAF, 0.28), leaf1: mx(t.bg, LEAF, 0.42), leaf2: mx(t.bg, LEAF, 0.58), aut0: mx(t.bg, t.p3, 0.34), aut1: mx(t.bg, t.p3, 0.5), aut2: mx(t.bg, t.p3, 0.66),
      trunk: t.structure, metal: mx(t.structure, t.text, 0.35), tire: mx(t.bg, BLACK, 0.4), tread: t.structure, helmet: t.text, pants: mx(t.structure, t.bg, 0.25), sole: t.cta, lamp: t.danger, post: mx(t.structure, t.text, 0.25), win: mx(t.bg, t.p1, 0.3), sun0: t.cta, sun1: t.p2,
      house: mx(t.bg, t.structure, 0.6), roof: mx(t.bg, t.p3, 0.5), lit: t.cta, ink: t.bg, paper: t.text, pow: t.cta, cloud: t.text, flower: t.p2,
    } : {
      sky0: mx(SKY, t.text, 0.06), sky1: mx(SKY, t.card, 0.82), mount: mx(mx(SKY, t.text, 0.3), t.card, 0.2), hillFar: mx(mx(SKY, GROUND, 0.5), t.card, 0.2), hillNear: mx(GROUND, LEAF, 0.3),
      grassA: GROUND, grassB: mx(GROUND, t.text, 0.07), roadA: mx(t.text, t.bg, 0.24), roadB: mx(t.text, t.bg, 0.3), kerbA: t.card, kerbB: mx(t.danger, t.card, 0.18), lane: t.card, center: t.tintCta, edge: t.card,
      fog: mx(SKY, t.card, 0.82), leaf0: mx(LEAF, t.text, 0.28), leaf1: mx(LEAF, t.card, 0.05), leaf2: mx(LEAF, t.card, 0.3), aut0: mx(t.cta, t.card, 0.12), aut1: mx(t.cta, t.card, 0.34), aut2: mx(t.cta, t.card, 0.55),
      trunk: mx(t.cta, t.text, 0.55), metal: mx(t.text, t.card, 0.58), tire: mx(t.text, BLACK, 0.35), tread: mx(t.text, t.card, 0.25), helmet: t.card, pants: mx(t.text, t.card, 0.12), sole: mx(t.cta, t.card, 0.35), lamp: t.danger, post: mx(t.text, t.card, 0.45), win: mx(SKY, t.card, 0.55), sun0: mx(t.tintCta, t.card, 0.4), sun1: t.tintCta,
      house: t.card, roof: mx(t.danger, t.card, 0.3), lit: mx(SKY, t.card, 0.4), ink: t.text, paper: t.card, pow: mx(t.cta, t.card, 0.45), cloud: t.card, flower: mx(t.p3, t.card, 0.2),
    }
    const P = { id, dark: d, t, raw, rs: ps, sunC: d ? mx(t.cta, t.text, 0.5) : mx(t.card, t.tintCta, 0.5), dkC: d ? BLACK : mx(t.text, SKY, 0.25) }
    raw.dirt = d ? mx(t.deep, t.structure, 0.35) : mx(mx(t.cta, t.text, 0.3), GROUND, 0.55)
    for (const k in raw) P[k] = css(raw[k])
    P.seat = ps.map((p) => ({ main: css(p), dark: css(mx(p, d ? t.bg : t.text, d ? 0.5 : 0.36)), lite: css(mx(p, d ? t.text : t.card, 0.55)), beam: css(p, 0.07) }))
    P.rc = d ? [mx(t.p3, t.bg, 0.5), mx(t.p4, t.bg, 0.45), mx(t.p2, t.bg, 0.5), t.structure, mx(t.p1, t.bg, 0.55), t.border] : [t.structure, mx(t.cta, t.card, 0.45), mx(t.p4, t.card, 0.5), t.card, mx(t.p2, t.card, 0.5), mx(t.danger, t.card, 0.45)]
    P.cars = (d ? [mx(t.p3, t.bg, 0.5), mx(t.p4, t.bg, 0.45), mx(t.p2, t.bg, 0.5), t.structure, mx(t.p1, t.bg, 0.55), t.border] : [t.structure, mx(t.cta, t.card, 0.45), mx(t.p4, t.card, 0.5), t.card, mx(t.p2, t.card, 0.5), mx(t.danger, t.card, 0.45)]).map((c) => css(c))
    P.shade = d ? 'rgba(0,0,0,.3)' : css(t.text, 0.16); P.gloss = d ? css(t.text, 0.16) : 'rgba(255,255,255,.4)'; P.sheen = d ? css(t.text, 0.08) : 'rgba(255,255,255,.12)'; P.shadow = d ? 'rgba(0,0,0,.5)' : css(t.text, 0.26)
    // Haze is baked into the road colours (no overlay, so no seams).
    P.fogTab = {}
    for (const k of ['dirt', 'grassA', 'grassB', 'roadA', 'roadB', 'kerbA', 'kerbB', 'lane', 'center', 'edge']) { P.fogTab[k] = []; for (let q = 0; q <= 24; q++) P.fogTab[k].push(css(mx(raw[k], raw.fog, q / 24))) }
    return P
  }
  const PALS = {}; for (const id in TOKENS) PALS[id] = buildPalette(id)
  let P = PALS.glass

  // ── Track ────────────────────────────────────────────────────────────────
  let segs = [], FINISH = 0, cars = [], riders = [], raceT = 0, phase = 'attract', countT = 0, events = []
  // A track is data: a list of road pieces [enter, hold, leave, curve, hill] plus how busy and how
  // wooded it is. `twice` appends a mirrored copy. RANDOM builds a new list from the race seed.
  const mirror = (list) => list.concat(list.map((q) => [q[0], q[1], q[2], -q[3], -q[4]]))
  const TRACKS = {
    meadow: { name: 'MEADOW RUN', gap: [70, 90], oil: [95, 80], trees: 0.34, houses: 0.035, pieces: () => [[20, 50, 20, 0, 0], [40, 60, 40, 2.2, 0], [30, 50, 30, 0, 22], [40, 90, 40, -3.6, -22], [25, 60, 25, 0, 12], [30, 40, 30, 3, -12], [30, 40, 30, -3, 0], [40, 150, 40, 0, 0], [30, 60, 30, 5, 18], [30, 80, 30, -2, -30], [25, 40, 25, 0, 26], [25, 40, 25, 0, -26], [40, 100, 40, -4.6, 0], [30, 50, 30, 2.6, 14], [30, 50, 30, -2.6, -14], [40, 160, 40, 0, 0], [30, 70, 30, 4, 0], [40, 90, 40, 0, 0]] },
    pass: { name: 'SWITCHBACK PASS', gap: [120, 120], oil: [150, 90], trees: 0.55, houses: 0.01, pieces: () => [[20, 40, 20, 0, 0]].concat(mirror([[30, 50, 30, 4.6, 26], [30, 50, 30, -5.2, 20], [20, 30, 20, 0, -34], [30, 60, 30, 5.6, -16], [30, 40, 30, -4.2, 30], [25, 40, 25, 3.6, -30], [30, 70, 30, -5.6, 4]]), mirror([[30, 60, 30, 4.8, 22], [30, 50, 30, -4.4, -22], [20, 60, 20, 0, 0]]), [[40, 80, 40, 0, 0]]) },
    rush: { name: 'RUSH HOUR', gap: [30, 34], oil: [60, 50], trees: 0.14, houses: 0.14, pieces: () => [[20, 80, 20, 0, 0]].concat(mirror([[40, 120, 40, 1.2, 0], [40, 200, 40, 0, 0], [40, 100, 40, -1.6, 6], [40, 220, 40, 0, -6], [40, 100, 40, 1.4, 0]]), [[40, 120, 40, 0, 0]]) },
    random: { name: 'RANDOM ROAD', gap: [60, 90], oil: [90, 80], trees: 0.34, houses: 0.05, pieces: (rnd) => {
      const out = [[20, 50, 20, 0, 0]]; let total = 90, up = 0
      while (total < 2900) {
        const hill = Math.round((rnd() - 0.5 - up * 0.004) * 56); up += hill
        const q = rnd() < 0.4 ? [30, 60 + Math.floor(rnd() * 130), 30, 0, hill] : [30, 40 + Math.floor(rnd() * 60), 30, (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 4), hill]
        out.push(q); total += q[0] + q[1] + q[2]
      }
      out.push([40, 90, 40, 0, 0]); return out
    } },
  }
  let trackId = 'meadow', trackSeed = 20261010
  function buildTrack(seed, def) {
    const rnd = mulberry(seed)
    segs = []
    const lastY = () => segs.length ? segs[segs.length - 1].y2 : 0
    const add = (curve, y) => { const n = segs.length; segs.push({ i: n, z: n * SEG, y1: lastY(), y2: y, curve, spr: [] }) }
    const road = (enter, hold, leave, curve, hill) => {
      const sy = lastY(), ey = sy + hill * SEG, total = enter + hold + leave
      for (let n = 0; n < enter; n++) add(easeIn(0, curve, n / enter), easeInOut(sy, ey, n / total))
      for (let n = 0; n < hold; n++) add(curve, easeInOut(sy, ey, (enter + n) / total))
      for (let n = 0; n < leave; n++) add(easeInOut(curve, 0, n / leave), easeInOut(sy, ey, (enter + hold + n) / total))
    }
    for (const q of def.pieces(rnd)) road(q[0], q[1], q[2], q[3], q[4])
    FINISH = segs.length * SEG
    road(40, 140, 40, 0, 0)
    for (const s of segs) s.dark = Math.floor(s.i / 3) % 2 === 0
    // Scenery, seeded so every phone grows the same roadside.
    for (let i = 4; i < segs.length; i++) {
      const s = segs[i], side = rnd() < 0.5 ? -1 : 1
      if (rnd() < def.trees) s.spr.push({ k: rnd() < 0.5 ? 'pine' : (rnd() < 0.6 ? 'tree' : 'bush'), x: side * (1.4 + rnd() * 2.6), v: rnd() })
      if (rnd() < 0.22) s.spr.push({ k: 'tuft', x: -side * (1.14 + rnd() * 0.5), v: rnd() })
      if (rnd() < def.houses) s.spr.push({ k: 'house', x: side * (3.2 + rnd() * 2.2), v: rnd() })
      if (i % 24 === 0) { s.spr.push({ k: 'flag', x: -1.18, v: (i / 24) % 4 }); s.spr.push({ k: 'flag', x: 1.18, v: (i / 24 + 2) % 4 }) }
      if (i % 24 === 12) s.spr.push({ k: 'lamp', x: (i / 12) % 4 < 2 ? -1.2 : 1.2, v: (i / 12) % 4 < 2 ? 1 : -1 })
      if (i % 170 === 85) s.spr.push({ k: 'board', x: (i % 340 < 170 ? -1 : 1) * 1.75, v: (i / 85) % 4 })
      if (Math.abs(s.curve) > 2.9 && i % 10 === 0) s.spr.push({ k: 'chev', x: s.curve > 0 ? -1.22 : 1.22, v: s.curve > 0 ? 1 : -1 })
    }
    for (let i = 130; i < segs.length - 260; i += def.oil[0] + Math.floor(rnd() * def.oil[1])) segs[i].spr.push({ k: 'oil', x: LANEX[Math.floor(rnd() * 4)] + (rnd() - 0.5) * 0.1 })
    for (let i = 40; i < segs.length - 40; i += 23 + Math.floor(rnd() * 50)) segs[i].spr.push({ k: 'patch', x: (rnd() - 0.5) * 1.7, v: rnd() })
    segs[9].spr.push({ k: 'gate', x: 0, v: 0 })
    segs[FINISH / SEG].spr.push({ k: 'gate', x: 0, v: 1 })
    // Traffic: position is a pure function of race time (z0 + speed * t).
    cars = []
    for (let z = 90 * SEG; z < FINISH - 60 * SEG; z += (def.gap[0] + rnd() * def.gap[1]) * SEG) {
      cars.push({ z0: z, z, x: LANEX[Math.floor(rnd() * 4)], spd: MAXSPD * (0.3 + rnd() * 0.12), col: Math.floor(rnd() * 6), van: rnd() < 0.3 })
    }
  }
  const segAt = (z) => segs[clamp(Math.floor(z / SEG), 0, segs.length - 1)]
  const roadY = (z) => { const s = segAt(z); return lerp(s.y1, s.y2, clamp((z - s.z) / SEG, 0, 1)) }

  // ── Sim ──────────────────────────────────────────────────────────────────
  function resetRace(attract) {
    buildTrack(trackSeed, TRACKS[trackId])
    raceT = 0; events = []
    riders = NAMES.map((name, i) => ({
      i, name, bot: attract || i > 0, x: [-0.45, 0.45, -0.15, 0.15][i], z: 1500 + [0, 250, 500, 750][i],
      vx: 0, speed: 0, lean: 0, state: 'ride', t: 0, stag: 0, shield: 0, pips: PIPS, sinceHit: 0,
      kickT: 0, kickSide: 0, kicked: false, cd: 0, draft: 0, done: false, time: 0, hits: 0, offs: 0,
      base: [1, 0.905, 0.925, 0.945][i], aggr: [1, 0.8, 1.1, 1.3][i], tx: 0, think: 0, hunt: 0, flash: 0, grudge: -1, strain: 0, strainT: 0, boost: BOOST_START, boosting: false, boostT: 0, burn: false, cu: 0, cuTarget: -1, cuGap: 0, tMax: DOWN_T, rec: 0, recV: 0, sq: 0, susp: 0, suspV: 0, slope: 0, brk: false, look: 0,
    }))
    for (const r of riders) r.tx = r.x
    phase = attract ? 'attract' : 'count'; countT = attract ? 0 : 3.2
  }
  const input = { steer: 0, kick: 0, boost: false }
  function tryKick(r, side) {
    if (r.cd > 0 || r.state !== 'ride' || r.stag > 0 || r.done) return
    r.kickT = KICK_T; r.kickSide = side; r.kicked = false; r.cd = KICK_CD
    events.push({ t: 'swing', by: r.i })
  }
  function inReach(r, o, side) {
    if (o === r || o.state !== 'ride' || o.shield > 0 || o.done) return false
    const dx = (o.x - r.x) * side
    return Math.abs(o.z - r.z) < REACH_Z && dx > 0.03 && dx < REACH_X
  }
  function knockOff(r, why, by) {
    const lead = riders.filter((o) => o !== r && !o.done && o.z > r.z).sort((a, b) => a.z - b.z)[0]
    r.cuTarget = lead ? lead.i : -1; r.cuGap = lead ? lead.z - r.z : 0; r.cu = 0
    r.boosting = false; r.strain = 0
    r.state = 'down'; r.t = r.tMax = lead ? DOWN_T_BEHIND : DOWN_T; r.offs++; r.kickT = 0; r.stag = 0; r.draft = 0
    events.push({ t: 'down', to: r.i, why, by })
  }
  function botDrive(r) {
    r.think -= DT; r.hunt -= DT
    if (r.think <= 0) {
      r.think = 0.16 + Math.random() * 0.1
      const danger = (x) => cars.some((c) => { const dz = c.z - r.z; return dz > -250 && dz < 2400 && Math.abs(c.x - x) < 0.31 })
      if (danger(r.x) || danger(r.tx)) {
        const free = LANEX.filter((l) => !danger(l)).sort((a, b) => Math.abs(a - r.x) - Math.abs(b - r.x))
        if (free.length) r.tx = free[0]
      } else if (r.hunt <= 0) {
        const prey = riders.find((o) => o !== r && o.state === 'ride' && !o.done && Math.abs(o.z - r.z) < 800 && Math.abs(o.x - r.x) < 0.8)
        if (prey && Math.random() < 0.45 * r.aggr) { r.tx = clamp(prey.x + (Math.sign(r.x - prey.x) || 1) * 0.22, -0.85, 0.85); r.hunt = 1.1 }
        else if (Math.random() < 0.06) r.tx = LANEX[Math.floor(Math.random() * 4)]
      }
    }
    for (const side of [-1, 1]) {
      const o = riders.find((q) => inReach(r, q, side))
      if (o && r.strain < 0.55 && Math.random() < (o.bot ? 0.9 : 0.85) * r.aggr * DT) tryKick(r, side)
    }
    if (!r.burn && r.boost > 0.9 && Math.abs(segAt(r.z).curve) < 1.2 && riders.some((o) => o.z > r.z && o.z - r.z < 6000)) r.burn = true
    if (r.burn && r.boost < 0.15) r.burn = false
    return clamp((r.tx - r.x) * 7, -1, 1)
  }
  function stepRider(r) {
    const s = segAt(r.z), sp = r.speed / MAXSPD
    r.cd = Math.max(0, r.cd - DT); r.shield = Math.max(0, r.shield - DT); r.flash = Math.max(0, r.flash - DT)
    if (r.state === 'down') {
      r.t -= DT; r.speed *= Math.exp(-2.6 * DT); r.z += r.speed * DT; r.x += r.vx * DT; r.vx *= Math.exp(-4 * DT)
      if (r.t <= 0) { r.state = 'ride'; r.cu = r.cuTarget >= 0 ? CATCHUP_MAX : 0; r.speed = MAXSPD * (r.cu ? REMOUNT_SPD_BEHIND : REMOUNT_SPD); r.shield = SHIELD; r.pips = PIPS; r.strain = 0; r.x = clamp(r.x, -0.85, 0.85); r.vx = 0; events.push({ t: 'up', to: r.i }) }
      return
    }
    let steer = 0
    if (r.done) steer = clamp((r.tx - r.x) * 4, -1, 1)
    else if (r.bot) steer = botDrive(r)
    else { steer = input.steer; if (input.kick) { tryKick(r, input.kick) } }
    if (r.stag > 0) { r.stag -= DT; steer *= 0.35 }
    if (r.strainT > 0) r.strainT -= DT; else r.strain = Math.max(0, r.strain - STRAIN_DECAY * DT)
    steer *= 1 - 0.4 * Math.min(1, r.strain)
    const want = !r.done && (r.bot ? r.burn : input.boost), was = r.boosting
    r.boosting = want && r.stag <= 0 && (was ? r.boost > 0 : r.boost >= BOOST_MIN)
    if (r.boosting) { r.boost = Math.max(0, r.boost - BOOST_BURN * DT); r.boostT = BOOST_DELAY; if (!was) events.push({ t: 'boost', by: r.i }) }
    else if (r.boostT > 0) r.boostT -= DT; else r.boost = Math.min(1, r.boost + BOOST_FILL * DT)
    // Body springs: a hit rocks the rider and settles; crests and dips load the suspension.
    r.recV += (-r.rec * 170 - r.recV * 8) * DT; r.rec += r.recV * DT; r.sq *= Math.exp(-9 * DT)
    const slope = (s.y2 - s.y1) / SEG; r.suspV += (r.slope - slope) * sp * 2600; r.slope = slope
    r.suspV += (-r.susp * 130 - r.suspV * 11) * DT; r.susp = clamp(r.susp + r.suspV * DT, -7, 7)
    r.look = lerp(r.look, r.kickT > 0 ? r.kickSide : steer * 0.5, 1 - Math.exp(-12 * DT))
    r.lean = lerp(r.lean, steer, 1 - Math.exp(-10 * DT))
    // Slipstream: sit in another rider's wake to charge a boost.
    const lead = riders.find((o) => o !== r && o.state === 'ride' && o.z - r.z > 150 && o.z - r.z < 1500 && Math.abs(o.x - r.x) < 0.15)
    r.draft = clamp(r.draft + (lead ? DT : -2 * DT), 0, 1.2)
    let top = r.base
    if (r.bot && !r.done) top -= 0.1 * clamp((r.z - riders[0].z) / 5000, -1, 1)
    if (r.draft > 0.5) top *= 1.1
    if (r.boosting) top *= BOOST_TOP
    if (r.cu > 0) { const L = riders[r.cuTarget]; r.cu -= DT; if (!L || L.z - r.z <= r.cuGap || r.done) r.cu = 0; else top *= CATCHUP_TOP }
    if (Math.abs(r.x) > 1) top = Math.min(top, 0.42)
    if (r.done) top = 0.3
    const target = top * MAXSPD
    r.brk = r.speed > target + 40
    if (r.stag <= 0 && r.speed < target) r.speed = Math.min(target, r.speed + (MAXSPD / 5.5) * (r.cu > 0 ? CATCHUP_ACCEL : r.boosting ? 2 : 1) * DT)
    else if (r.speed > target) r.speed = Math.max(target, r.speed - (MAXSPD / 2.2) * DT)
    r.x += steer * 1.55 * DT * (0.35 + 0.65 * sp) + r.vx * DT - s.curve * sp * sp * 0.2 * DT
    r.vx *= Math.exp(-6 * DT)
    r.x = clamp(r.x, -1.55, 1.55)
    const zi = Math.floor(r.z / SEG)
    r.z += r.speed * DT
    // Oil: a wobble, never a pip.
    if (Math.floor(r.z / SEG) !== zi && r.shield <= 0) {
      for (const q of segAt(r.z).spr) if (q.k === 'oil' && Math.abs(q.x - r.x) < 0.15) { r.stag = 0.7; r.vx += (Math.random() < 0.5 ? -1 : 1) * 0.9; r.recV += (Math.random() - 0.5) * 12; events.push({ t: 'oil', to: r.i }) }
    }
    // Kick lands on one frame, in the attacker's own view of the road.
    if (r.kickT > 0) {
      r.kickT -= DT
      if (!r.kicked && KICK_T - r.kickT >= KICK_HIT_AT) {
        r.kicked = true
        const o = riders.filter((q) => inReach(r, q, r.kickSide)).sort((a, b) => Math.abs(a.z - r.z) - Math.abs(b.z - r.z))[0]
        if (o) {
          o.vx += r.kickSide * 1.35; o.speed *= 0.82; o.stag = STAGGER; o.pips--; o.sinceHit = 0; o.flash = 0.18; o.grudge = r.i; o.recV += r.kickSide * 7; o.sq = 1; r.strain += STRAIN_HIT; r.hits++
          events.push({ t: 'hit', by: r.i, to: o.i, side: r.kickSide })
          if (o.pips <= 0) knockOff(o, 'kick', r.i)
        } else { r.speed *= 0.97; r.strain += STRAIN_MISS; events.push({ t: 'miss', by: r.i }) }
        r.strainT = STRAIN_HOLD; r.recV -= r.kickSide * (2.5 + 7 * Math.min(1, r.strain)); r.vx -= r.kickSide * 0.3 * Math.min(1, r.strain)
        if (r.strain > 1) knockOff(r, 'over')
      }
    }
    r.sinceHit += DT
    if (r.pips < PIPS && r.sinceHit > PIP_REGEN) { r.pips++; r.sinceHit = 0 }
    // Traffic.
    if (r.shield <= 0 && r.state === 'ride') for (const c of cars) {
      if (Math.abs(c.z - r.z) < 300 && Math.abs(c.x - r.x) < 0.235) { r.vx = (Math.sign(r.x - c.x) || 1) * 0.7; knockOff(r, 'car'); break }
    }
    if (!r.done && r.z >= FINISH) { r.done = true; r.time = raceT; r.tx = LANEX[r.i]; events.push({ t: 'finish', to: r.i }) }
  }
  function step() {
    if (phase === 'count') { countT -= DT; if (countT <= 0) { phase = 'race'; events.push({ t: 'go' }) } return }
    if (phase === 'done') return
    raceT += DT
    for (const c of cars) c.z = c.z0 + c.spd * raceT
    for (const r of riders) stepRider(r)
    // Riders lean on each other instead of overlapping.
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const p = riders[a], q = riders[b]
      if (p.state !== 'ride' || q.state !== 'ride') continue
      const dx = q.x - p.x
      if (Math.abs(q.z - p.z) < 230 && Math.abs(dx) < 0.15) { const push = (0.15 - Math.abs(dx)) * (dx >= 0 ? 1 : -1) * 0.5; p.x -= push; q.x += push }
    }
    input.kick = 0
    if (phase === 'race' && (riders[0].done || raceT > 150)) { phase = 'finishing'; countT = 1.6 }
    if (phase === 'finishing') { countT -= DT; if (countT <= 0) { phase = 'done'; events.push({ t: 'results' }) } }
    if (phase === 'attract' && riders.every((r) => r.done)) resetRace(true)
  }
  function standings() {
    return riders.slice().sort((a, b) => (a.done && b.done) ? a.time - b.time : a.done ? -1 : b.done ? 1 : b.z - a.z)
  }
  const placeOf = (r) => standings().indexOf(r) + 1

