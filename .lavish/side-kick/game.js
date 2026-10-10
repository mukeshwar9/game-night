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

  // ── Drawing helpers ──────────────────────────────────────────────────────
  // One light: the sun sits up and to the right, so every object is lit on
  // its right side, shaded on its left, and drops a soft shadow to the left.
  function rr(c, x, y, w, h, r, fill) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill() }
  function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill() }
  function circ(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = fill; c.fill() }
  function limb(c, pts, w, col) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col; c.stroke() }
  function lg(c, x0, y0, x1, y1) { const g = c.createLinearGradient(x0, y0, x1, y1); for (let i = 5; i < arguments.length; i += 2) g.addColorStop(arguments[i], arguments[i + 1]); return g }
  function rg(c, x, y, r0, r1) { const g = c.createRadialGradient(x, y, r0, x, y, r1); for (let i = 5; i < arguments.length; i += 2) g.addColorStop(arguments[i], arguments[i + 1]); return g }
  const li = (a, k) => css(mx(a, P.sunC, k)), da = (a, k) => css(mx(a, P.dkC, k))
  const sideLit = (c, x0, x1, a, k) => lg(c, x0, 0, x1, 0, 0, da(a, k), 0.55, css(a), 1, li(a, k))
  const ease = { outBack: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2), inOut: (t) => t * t * (3 - 2 * t), out: (t) => 1 - Math.pow(1 - t, 3) }
  function softShadow(c, x, w, h, k) {
    const col = P.dark ? BLACK : P.dkC
    c.save(); c.translate(x, 1.5); c.scale(1, h / w); c.fillStyle = rg(c, 0, 0, w * 0.25, w, 0, css(col, (P.dark ? 0.6 : 0.42) * (k || 1)), 1, css(col, 0)); c.beginPath(); c.arc(0, 0, w, 0, 7); c.fill(); c.restore()
  }
  // Static objects are painted once per theme into a sprite, then drawn as images.
  const SS = 2, sprCache = new Map()
  function sprite(key, x0, y0, x1, y1, draw) {
    const k = P.id + '|' + key; let s = sprCache.get(k)
    if (!s) { const cv = document.createElement('canvas'); cv.width = (x1 - x0) * SS; cv.height = (y1 - y0) * SS; const g = cv.getContext('2d'); g.scale(SS, SS); g.translate(-x0, -y0); draw(g); s = { cv, x0, y0, w: x1 - x0, h: y1 - y0 }; sprCache.set(k, s) }
    return s
  }
  const put = (c, s) => c.drawImage(s.cv, s.x0, s.y0, s.w, s.h)
  const dot = (raw) => sprite('dot' + raw.map(Math.round).join('_'), -16, -16, 16, 16, (g) => { g.fillStyle = rg(g, 0, 0, 0, 16, 0, css(raw, 1), 0.45, css(raw, 0.55), 1, css(raw, 0)); g.fillRect(-16, -16, 32, 32) })

  // ── Player avatars: real avatar-kit sprites (gen_sprites.mjs), stood up with a darker side for
  // thickness. The same standee technique as the Bamboozle board. The kit draws fronts only, so
  // avatars appear wherever the camera sees a face: mirrors, name tags, a fallen rider, results,
  // and as a patch on the back of the jacket.
  const AV = [{"code":"K15a474115006880025a00270","pal":["46,18,6","58,15,46","232,132,58","122,54,16","255,133,192","192,90,28","255,217,94","176,124,255","53,163,90","138,94,51","178,130,79","255,255,255","27,20,38","51,32,15","10,42,46","20,107,107","238,240,246","94,216,200","34,168,160","192,138,90","92,51,32","36,18,12","143,90,54","58,13,30","138,28,46","201,160,107"],"frames":{"idle":"................................................................0000000000000000............................010102020202020202030100......................0104040506060507070504040300..................01040408060608070708040408050300................00020808050808090808030808050300................000205050303090a0a09030305050300................000205030b0b0a0a0a0a0b0b03050300................000203090b0c0a0a0a0a0c0b09020300................0003030a0b0b0a0a0a0a0b0b0a030300..................00090a0a0a0a090a0a0a0a0a0900......................0d090a0a0a0d0d0a0a0a090d..........................0d090a0d0a0a0d0a090d..............................0d0909090909090d..............................0e0e0f100909100f0e0e..........................0e111112110f101112110f0e......................0e0f0f1212120f101112120f0f0e....................0d090f0f0f0f0f100f0f0f0f090d......................0d0e13131314141313140e0d..........................15131614151513161415............................17141414151514141417..........................171818181817171818181817..........................17171717....17171717..............................................................","cheer0":"................................................................0000000000000000............................010102020202020202030100......................0104040506060507070504040300..................01040408060608070708040408050300................00020808050808090808030808050300..............0d0d0205050303090a0a0903030505030d0d..........0d09090205030b0b0a0a0a0a0b0b03050309090d........0e110f0203090b0c0a0a0a0a0c0b090203110f0e........0e0f0f03030a0b0b0a0a0a0a0b0b0a0303110f0e..........0e110f090a0a0a0a090a0a0a0a0a09120f0e............0e0f0f0e090a0a0a0d0d0a0a0a090e110f0e..............0e110f0d090a0d0a0a0d0a090d110f0e................0e0f0f0e0d0909090909090d0e110f0e..................0e110f0e0f100909100f0e110f0e....................0e0f0f1112110f10111211110f0e......................0e0f1212120f101112120f0e........................0e0f0f0f0f0f100f0f0f0f0e..........................0e13131314141313140e............................15131614151513161415............................17141414151514141417..........................171818181817171818181817..........................17171717....17171717..............................................................","cheer1":"................0000000000000000............................010102020202020202030100......................0104040506060507070504040300..................01040408060608070708040408050300..............0d0d02080805080809080803080805030d0d..........0d09090205050303090a0a09030305050309090d........0e110f0205030b0b0a0a0a0a0b0b030503110f0e........0e0f0f0203090b0c0a0a0a0a0c0b090203110f0e..........0e1103030a0b0b0a0a0a0a0b0b0a03030f0e............0e0f0f090a0a0a0a090a0a0a0a0a09120f0e..............0e110f090a0a0a0d0d0a0a0a09110f0e................0e0f0f0e090a0d0a0a0d0a090e110f0e..................0e110f0d0909090909090d110f0e....................0e110f0e0f100909100f0e110f0e....................0e0f0f1112110f10111211110f0e......................0e0f1212120f101112120f0e........................0e0f0f0f0f0f100f0f0f0f0e..........................0e13131314141313140e............................15131614151513161415............................17141414151514141417..........................171818181817171818181817..........................17171717....17171717..............................................................................................................","bust":"................................................................................................................0000000000000000............................010102020202020202030100......................0104040506060507070504040300..................01040408060608070708040408050300................00020808050808090808030808050300................000205050303090a0a09030305050300................000205030b0b0a0a0a0a0b0b03050300................000203090b0c0a0a0a0a0c0b09020300................0003030a0b0b0a0a0a0a0b0b0a030300..................00090a0a0a0a090a0a0a0a0a0900......................0d090a0a0a0d0d0a0a0a090d..........................0d090a0d0a0a0d0a090d..............................0d0909090909090d..................................0d191919090d..............................0e0e0e0e090a0a090e0e0e0e....................0e0e1111110f100909101111110f0e0e..............0e1111121212120f13141112121212110f0e..........0e111212121212120f1314111212121212120f0e......0e11121212121212120f131411121212121212120f0e....0e11121212121212120f131411121212121212120f0e..0e1112121212121212120f13141112121212121212120f0e0e0f0f0f0f0f0f0f0f0f0f14140f0f0f0f0f0f0f0f0f0f0e","back":"................................................................................................................0000000000000000............................000103020202020202020101......................0003040405070705060605040401..................00030508040408070708060608040401................00030508080308080308080508080200................00030505030303050503030305050200................00030503030505050505050303050200................00030203050505050505050503030200................00030305050505050505050505030300..................0003050505050505050505050300......................000303030303030303030300..........................00090a0a0a0a0a0a0900..............................0d0909090909090d..................................0d091919190d..............................0e0e0e0e090a0a090e0e0e0e....................0e0e0f111111100909100f1111110e0e..............0e0f11121212121114130f1212121211110e..........0e0f1212121212121114130f121212121212110e......0e0f121212121212121114130f12121212121212110e....0e0f121212121212121114130f12121212121212110e..0e0f12121212121212121114130f1212121212121212110e0e0f0f0f0f0f0f0f0f0f0f14140f0f0f0f0f0f0f0f0f0f0e"},"n":576,"top":[34,168,160],"skin":[178,130,79]},{"code":"K12210200000079300c4a0210","pal":["20,11,8","107,67,40","46,26,16","74,44,26","196,132,102","70,38,25","21,18,30","245,201,168","255,255,255","229,173,137","20,20,32","58,59,78","145,148,170","98,100,122","111,208,122","29,107,63","14,42,31","53,163,90","36,18,12","92,51,32"],"frames":{"idle":"..................................................................000000000000................................00000101010101020000..........................000101030303030303010200......................0001030303020303030303030200....................0001020202020202020202020200....................0002040404040404040404040200....................0502060606060606060606060205..................05070406080606090906080606040405................05040909060609090909060609090405..................0504090909090909090909090405......................050409090509090509090405..........................05040909050509090405..............................0504040404040405..............................0a0a0b040404040b0a0a..........................0a0c0c0d0c0c0c0c0d0c0b0a......................0a0b0b0d0d0d0d0d0d0d0d0b0b0a....................05040b0b0b0b0b0b0b0b0b0b0405......................050a0e0e0e0f0f0e0e0f0a05..........................100e110f10100e110f10............................120f0f0f10100f0f0f12..........................121313131312121313131312..........................12121212....12121212..............................................................","cheer0":"..................................................................000000000000................................00000101010101020000..........................000101030303030303010200......................0001030303020303030303030200....................0001020202020202020202020200................050500020404040404040404040402000505..........0504040502060606060606060606060205040405........0a0c0b07040608060609090608060604040c0b0a........0a0b0b04090906060909090906060909040c0b0a..........0a0c0b0409090909090909090909040c0b0a............0a0b0b0a040909050909050909040a0c0b0a..............0a0c0b050409090505090904050c0b0a................0a0b0b0a05040404040404050a0c0b0a..................0a0c0b0a0b040404040b0a0c0b0a....................0a0b0b0c0d0c0c0c0c0d0c0c0b0a......................0a0b0d0d0d0d0d0d0d0d0b0a........................0a0b0b0b0b0b0b0b0b0b0b0a..........................0a0e0e0e0f0f0e0e0f0a............................100e110f10100e110f10............................120f0f0f10100f0f0f12..........................121313131312121313131312..........................12121212....12121212..............................................................","cheer1":"..................000000000000................................00000101010101020000..........................000101030303030303010200......................0001030303020303030303030200................050500010202020202020202020202000505..........0504040502040404040404040404040200040405........0a0c0b05020606060606060606060602050c0b0a........0a0b0b07040608060609090608060604040c0b0a..........0a0c04090906060909090906060909040b0a............0a0b0b0409090909090909090909040c0b0a..............0a0c0b040909050909050909040c0b0a................0a0b0b0a04090905050909040a0c0b0a..................0a0c0b05040404040404050c0b0a....................0a0c0b0a0b040404040b0a0c0b0a....................0a0b0b0c0d0c0c0c0c0d0c0c0b0a......................0a0b0d0d0d0d0d0d0d0d0b0a........................0a0b0b0b0b0b0b0b0b0b0b0a..........................0a0e0e0e0f0f0e0e0f0a............................100e110f10100e110f10............................120f0f0f10100f0f0f12..........................121313131312121313131312..........................12121212....12121212..............................................................................................................","bust":"..................................................................................................................000000000000................................00000101010101020000..........................000101030303030303010200......................0001030303020303030303030200....................0001020202020202020202020200....................0002040404040404040404040200....................0502060606060606060606060205..................05070406080606090906080606040405................05040909060609090909060609090405..................0504090909090909090909090405......................050409090509090509090405..........................05040909050509090405..............................0504040404040405..................................050707070405..............................0a0a0a0a040909040a0a0a0a....................0a0a0c0c0c0b0f04040f0c0c0c0b0a0a..............0a0c0c0d0d0d0b0f0f0f0f0c0d0d0d0c0b0a..........0a0c0d0d0d0d0d0d0c0c0c0c0d0d0d0d0d0d0b0a......0a0c0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0b0a....0a0c0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0b0a..0a0c0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0b0a0a0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0a","back":"..................................................................................................................000000000000................................00000201010101010000..........................000201030303030303010100......................0002030303030303020303030100....................0002020202020202020202020100....................0002020202020202020202020200....................0002030303030303030303030200..................00020203030303030303030303020100................00020303030303030303030303030200..................0002030303030303030303030200......................000202020202020202020200..........................00040909090909090400..............................0504040404040405..................................050407070705..............................0a0a0a0a040909040a0a0a0a....................0a0a0b0c0c0c0f04040f0b0c0c0c0a0a..............0a0b0c0d0d0d0c0f0f0f0f0b0d0d0d0c0c0a..........0a0b0d0d0d0d0d0d0c0c0c0c0d0d0d0d0d0d0c0a......0a0b0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0c0a....0a0b0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0c0a..0a0b0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0c0a0a0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0a"},"n":576,"top":[98,100,122],"skin":[229,173,137]},{"code":"K1614253100002700784b04a0","pal":["46,24,14","154,89,46","122,61,26","142,75,35","122,69,38","122,54,16","166,101,58","194,132,83","27,20,38","34,168,160","58,13,30","31,15,58","77,37,144","244,122,90","138,28,46","176,124,255","124,69,208","111,208,122","29,107,63","14,42,31","53,163,90","42,40,56","138,138,160","46,18,6","172,89,35","154,70,21","192,90,28","232,132,58"],"frames":{"idle":"................................................................................................................0000000000000000..............................00010101010101010200..........................000103030303030303030200......................0001030404040404040404030200....................0001050606060606060606050200....................0006060505060606060505060400..................00070606000006060606000006060400................00040606080906060606080906060400..................0004060606060406060606060400......................000406060006060006060400..........................00040606000006060400..............................0004040404040400..........................0a0a0b0b0c040404040c0b0b0a0a..................0a0d0e0f0f100f0f0f0f100f0c0e0e0a..............0a0d0e0c0c10101010101010100c0c0d0e0a............0a0d0e040c0c0c0c0c0c0c0c0c0c040d0e0a............0a0d0e000b11111112121111120b000e0e0a............0a0e0a..13111412131311141213..0a0e0a..............0a....15121212131312121215....0a....................151616161615151616161615..........................15151515....15151515..............................................................","cheer0":"................................................................................................................0000000000000000..............................00010101010101010200..........................000103030303030303030200......................0001030404040404040404030200................000000010506060606060606060502000000..........0004040006060505060606060505060400040400........0b0f0c07060600000606060600000606040f0c0b........0b0c0c04060608090606060608090606040f0c0b..........0b0f0c0406060606040606060606040f0c0b............0b0c0c0b040606000606000606040b0f0c0b..............0b0f0c000406060000060604000f0c0b................0b0c0c0b00040404040404000b0f0c0b..................0a0f0c0b0c040404040c0b0f0c0a..................0a0d0c0c0f100f0f0f0f100f0f0c0e0a..............0a0d0e0b0c10101010101010100c0b0d0e0a............0a0d0e0a0c0c0c0c0c0c0c0c0c0c0b0d0e0a............0a0d0e0a0b11111112121111120b0a0e0e0a............0a0e0a..13111412131311141213..0a0e0a..............0a....15121212131312121215....0a....................151616161615151616161615..........................15151515....15151515..............................................................","cheer1":"................................................................0000000000000000..............................00010101010101010200..........................000103030303030303030200..................000000010304040404040404040302000000..........0004040001050606060606060606050200040400........0b0f0c00060605050606060605050604000f0c0b........0b0c0c07060600000606060600000606040f0c0b..........0b0f04060608090606060608090606040c0b............0b0c0c0406060606040606060606040f0c0b..............0b0f0c040606000606000606040f0c0b................0b0c0c0b04060600000606040b0f0c0b..................0b0f0c00040404040404000f0c0b....................0a0f0c0b0c040404040c0b0f0c0a..................0a0d0c0c0f100f0f0f0f100f0f0c0e0a..............0a0d0e0b0c10101010101010100c0b0d0e0a............0a0d0e0a0c0c0c0c0c0c0c0c0c0c0b0d0e0a............0a0d0e0a0b11111112121111120b0a0e0e0a............0a0e0a..13111412131311141213..0a0e0a..............0a....15121212131312121215....0a....................151616161615151616161615..........................15151515....15151515..............................................................................................................","bust":"................................................................................................................................................................0000000000000000..............................00010101010101010200..........................000103030303030303030200......................0001030404040404040404030200....................0001050606060606060606050200....................0006060505060606060505060400..................00070606000006060606000006060400................00040606080906060606080906060400..................0004060606060406060606060400......................000406060006060006060400..........................00040606000006060400..............................0004040404040400..................................000707070400..........................0a0a0b0b0b0b040606040b0b0b0b0a0a..............0a0d0e0f0f0f0c0e04040e0f0f0f0c0e0e0a..........0a0d0e0f101010100c0e0e0f101010100c0e0e0a......0a0d0e0f1010101010100f0f1010101010100c0e0e0a..0a0d0e0f101010101010101010101010101010100c0d0e0a0a0d0e0f101010101010101010101010101010100c0e0e0a0d0e0f1010101010101010101010101010101010100c0d0e0e0e0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0e0e","back":"................................................................................................................................................................1717171717171717..............................17051818181818181817..........................170519191919191919191817......................1705190505050505050505191817....................1705051a1a1a1a1a1a1a1a051817....................17051a1a1a1a1a1a1a1a1a1a1a17..................17051a1a1a1a1a1a1a1a1a1a1a1a1b17................17051a1a1a1a1a1a1a1a1a1a1a1a0517..................17051a1a1a1a1a1a1a1a1a1a0517......................170505050505050505050517..........................17040606060606060417..............................0004040404040400..................................000407070700..........................0a0a0b0b0b0b040606040b0b0b0b0a0a..............0a0e0e0c0f0f0f0e04040e0c0f0f0f0e0d0a..........0a0e0e0c101010100f0e0e0c101010100f0e0d0a......0a0e0e0c1010101010100f0f1010101010100f0e0d0a..0a0e0d0c101010101010101010101010101010100f0e0d0a0a0e0e0c101010101010101010101010101010100f0e0d0a0e0d0c1010101010101010101010101010101010100f0e0d0e0e0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0e0e"},"n":576,"top":[124,69,208],"skin":[166,101,58]},{"code":"K1744421103200a0045d00170","pal":["46,18,6","232,132,58","122,54,16","192,90,28","94,51,25","138,81,48","38,19,11","27,20,38","162,69,71","187,87,84","10,42,46","21,21,31","94,216,200","20,107,107","61,61,86","10,10,18","38,38,58","58,13,30","138,28,46","34,168,160"],"frames":{"idle":"................................................................00000000000000..............................0000010101010101020000........................00010103030303030303010200....................000103030303030303030302030200..................00010303030303030202020402030200................00010303020202020404020204010200................00010302040404040505050505020200................00020204050505050505050505040406................06040405070705050505070705050406..................0608040902020202020209040806......................060402050605050605020406..........................06040505060605050406..............................0604040404040406..............................0a0a0b040404040b0a0a..........................0a0c0c0c0c0c0c0c0c0c0d0a......................0a0d0d0d0d0d0d0d0d0d0d0d0d0a....................06040b0e0e0e0e0e0e0e0e0b0406......................060f0e10100b0b10100b0f06..........................0f0e100b0f0f0e100b0f............................110b0b0b0f0f0b0b0b11..........................111212121211111212121211..........................11111111....11111111..............................................................","cheer0":"................................................................00000000000000..............................0000010101010101020000........................00010103030303030303010200....................000103030303030303030302030200..................00010303030303030202020402030200..............060601030302020202040402020401020606..........0604040103020404040405050505050202040406........0a0c0d02020405050505050505050504040c0d0a........0a0d0d04040507070505050507070505040c0d0a..........0a0c0d0804090202020202020904080c0d0a............0a0d0d0a040205060505060502040a0c0d0a..............0a0c0d060405050606050504060c0d0a................0a0d0d0a06040404040404060a0c0d0a..................0a0c0d0a0b040404040b0a0c0d0a....................0a0d0d0c0c0c0c0c0c0c0c0c0d0a......................0a0d0d0d0d0d0d0d0d0d0d0a........................0f0b0e0e0e0e0e0e0e0e0b0f..........................0f0e10100b0b10100b0f............................0f0e100b0f0f0e100b0f............................110b0b0b0f0f0b0b0b11..........................111212121211111212121211..........................11111111....11111111..............................................................","cheer1":"................00000000000000..............................0000010101010101020000........................00010103030303030303010200....................000103030303030303030302030200................060601030303030303020202040203020606..........0604040103030202020204040202040102040406........0a0c0d01030204040404050505050502020c0d0a........0a0d0d02020405050505050505050504040c0d0a..........0a0c04040507070505050507070505040d0a............0a0d0d0804090202020202020904080c0d0a..............0a0c0d040205060505060502040c0d0a................0a0d0d0a04050506060505040a0c0d0a..................0a0c0d06040404040404060c0d0a....................0a0c0d0a0b040404040b0a0c0d0a....................0a0d0d0c0c0c0c0c0c0c0c0c0d0a......................0a0d0d0d0d0d0d0d0d0d0d0a........................0f0b0e0e0e0e0e0e0e0e0b0f..........................0f0e10100b0b10100b0f............................0f0e100b0f0f0e100b0f............................110b0b0b0f0f0b0b0b11..........................111212121211111212121211..........................11111111....11111111..............................................................................................................","bust":"................................................................................................................00000000000000..............................0000010101010101020000........................00010103030303030303010200....................000103030303030303030302030200..................00010303030303030202020402030200................00010303020202020404020204010200................00010302040404040505050505020200................00020204050505050505050505040406................06040405070705050505070705050406..................0608040902020202020209040806......................060402050605050605020406..........................06040505060605050406..............................0604040404040406..................................060c0c0c0d06..............................0a0a0a0a0c13130d0a0a0a0a....................0a0a0c0c0c0c131313130c0c0c0d0a0a..............0a0c0c1313131313131313131313130c0d0a..........0f0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0f......0f0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0f....0f0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0f..0f0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0f0a0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0a","back":"..................................................................................................................00000000000000..............................0000020101010101010000........................00020103030303030303010100....................000203020303030303030303030100................00020302020202020303030303030100................00020102030202020202020203030100................00020203030303030202020202030100................00020203030303030303030302020200................00020303030303030303030303020200..................0002030303030303030303030200......................000202020202020202020200..........................00040505050505050400..............................0604040404040406..................................060d0c0c0c06..............................0a0a0a0a0d13130c0a0a0a0a....................0a0a0d0c0c0c131313130c0c0c0c0a0a..............0a0d0c1313131313131313131313130c0c0a..........0f0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0f......0f0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0f....0f0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0f..0f0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0f0a0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0a"},"n":576,"top":[20,107,107],"skin":[94,51,25]}]
  let avatarsOn = true
  const AVS = AV.map((a) => {
    const fr = {}
    for (const name in a.frames) {
      const mk = (shade) => {
        const cv = document.createElement('canvas'); cv.width = 24; cv.height = 24
        const x = cv.getContext('2d'), img = x.createImageData(24, 24), f = a.frames[name]
        for (let i = 0; i < 576; i++) { const h = f.substr(i * 2, 2); if (h === '..') continue; const col = a.pal[parseInt(h, 16)].split(','); img.data[i * 4] = col[0] * shade; img.data[i * 4 + 1] = col[1] * shade; img.data[i * 4 + 2] = col[2] * shade; img.data[i * 4 + 3] = 255 }
        x.putImageData(img, 0, 0); return cv
      }
      fr[name] = { lit: mk(1), side: mk(0.55) }
    }
    return fr
  })
  const AVC = AV.map((a) => ({ top: a.top || [120, 120, 120], skin: a.skin || [200, 160, 130] }))
  const hasAv = (i) => avatarsOn && !!AVS[i]
  function standee(c, i, frame, x, yBase, hgt) {
    const f = AVS[i][frame], k = hgt / 22
    c.save(); c.translate(x, yBase); c.imageSmoothingEnabled = false
    for (const d of [1.5, 1, 0.5]) c.drawImage(f.side, -12 * k - d * k * 0.7, -23 * k + d * k * 0.3, 24 * k, 24 * k)
    c.drawImage(f.lit, -12 * k, -23 * k, 24 * k, 24 * k)
    c.imageSmoothingEnabled = true; c.restore()
  }

  // ── Rider and bike (live: leans, kicks, rocks on its springs) ────────────
  function kickPose(r) {
    if (r.kickT <= 0) return { ext: 0, tuck: 0 }
    const t = clamp((KICK_T - r.kickT) / KICK_T, 0, 1)
    if (t < 0.18) return { ext: 0, tuck: ease.out(t / 0.18) }
    if (t < 0.42) return { ext: ease.outBack((t - 0.18) / 0.24), tuck: 1 - (t - 0.18) / 0.24 }
    if (t < 0.6) return { ext: 1, tuck: 0 }
    return { ext: 1 - ease.inOut((t - 0.6) / 0.4), tuck: 0 }
  }
  function drawBike(c, r, time) {
    const col = P.seat[r.i], C = P.rs[r.i], R = P.raw, spark = css(P.sunC, 1), sp = r.speed / MAXSPD
    if (r.state === 'down') return drawDown(c, r, time, col, C, R)
    softShadow(c, -12 - r.lean * 6, 40, 9)
    if (P.dark) { c.globalCompositeOperation = 'lighter'; poly(c, [-13, -34, 13, -34, 58, -270, -58, -270], lg(c, 0, -34, 0, -270, 0, css(C, 0.22), 1, css(C, 0))); c.globalCompositeOperation = 'source-over' }
    const kp = kickPose(r), k = kp.ext, ks = r.kickSide
    const vib = Math.sin(time * 61 + r.i) * 0.35 * (0.3 + sp), bob = Math.sin(time * 5.3 + r.i * 2) * 0.7
    c.rotate(r.lean * 0.3 + r.rec * 0.5 + Math.sin(time * 15 + r.i) * 0.07 * Math.min(1, r.strain))
    c.scale(1 + r.sq * 0.1, 1 - r.sq * 0.08)
    // Tyre: a rubber cylinder with rolling tread.
    rr(c, -9.5, -38, 19, 38, 7.5, lg(c, -9.5, 0, 9.5, 0, 0, css(mx(R.tire, BLACK, 0.5)), 0.35, css(R.tire), 0.72, css(mx(R.tire, R.metal, 0.35)), 1, css(R.tire)))
    const roll = (r.z / 46) % 1
    for (let i = 0; i < 5; i++) { const ty = -36 + ((i + roll) % 5) * 7; if (ty < -3) { limb(c, [-6, ty + 1.5, 0, ty, 6, ty + 1.5], 1.3, css(mx(R.tire, BLACK, 0.6))) } }
    c.save(); c.translate(vib, -r.susp + bob * 0.4)
    // Chain side and swingarm, rear shocks, twin pipes in brushed metal.
    rr(c, -13, -28, 4, 16, 2, css(mx(R.metal, BLACK, 0.45)))
    for (const s of [-1, 1]) { for (let i = 0; i < 4; i++) limb(c, [s * 12 - 2.5, -40 - i * 3.4, s * 12 + 2.5, -41.6 - i * 3.4], 1.2, css(R.metal)); }
    for (const s of [-1, 1]) {
      rr(c, s * 19 - 4, -38, 8, 20, 3.5, lg(c, s * 19 - 4, 0, s * 19 + 4, 0, 0, da(R.metal, 0.5), 0.45, li(R.metal, 0.6), 0.7, css(R.metal), 1, da(R.metal, 0.4)))
      c.beginPath(); c.ellipse(s * 19, -18.5, 3.2, 1.8, 0, 0, 7); c.fillStyle = css(mx(R.tire, BLACK, 0.6)); c.fill()
    }
    if (r.boosting) { c.globalCompositeOperation = 'lighter'; for (const s of [-1, 1]) { const len = 16 + Math.random() * 12; poly(c, [s * 19 - 3.4, -19, s * 19 + 3.4, -19, s * 19 + (Math.random() - 0.5) * 3, -19 + len], lg(c, 0, -19, 0, -19 + len, 0, css(P.sunC, 0.95), 0.4, css(P.t.cta, 0.8), 1, css(P.t.danger, 0))); circ(c, s * 19, -17, 7, rg(c, s * 19, -17, 1, 7, 0, css(P.sunC, 0.7), 1, css(P.t.cta, 0))) } c.globalCompositeOperation = 'source-over' }
    // Tail unit in the seat colour, mudguard, lamp and plate.
    c.beginPath(); c.moveTo(-17, -35); c.lineTo(17, -35); c.quadraticCurveTo(15, -56, 9, -60); c.lineTo(-9, -60); c.quadraticCurveTo(-15, -56, -17, -35); c.closePath(); c.fillStyle = sideLit(c, -17, 17, mx(C, P.dkC, 0.25), 0.4); c.fill()
    rr(c, -10, -35, 20, 4, 1.5, css(mx(R.tire, R.metal, 0.2)))
    const lampOn = r.brk ? 1 : 0.55
    if (P.dark || r.brk) { c.globalCompositeOperation = 'lighter'; circ(c, 0, -47, 15, rg(c, 0, -47, 1, 15, 0, css(P.t.danger, 0.55 * lampOn), 1, css(P.t.danger, 0))); c.globalCompositeOperation = 'source-over' }
    rr(c, -8.5, -51, 17, 7, 3, lg(c, 0, -51, 0, -44, 0, li(P.t.danger, 0.35 * lampOn + 0.1), 1, da(P.t.danger, 0.35)))
    rr(c, -6, -50, 5, 2, 1, 'rgba(255,255,255,.6)'); rr(c, -6.5, -42, 13, 5.5, 1, css(R.paper)); rr(c, -4.5, -40.4, 9, 1.4, 0.6, css(R.ink, 0.5))
    // Legs: the one that is not kicking stays on its peg.
    for (const s of [-1, 1]) {
      if (kp.ext + kp.tuck > 0 && s === ks) continue
      limb(c, [s * 9, -61, s * 20.5, -48, s * 20.5, -36], 10, s > 0 ? li(R.pants, 0.12) : da(R.pants, 0.3))
      circ(c, s * 20.5, -48, 5.6, rg(c, s * 20.5 + 1.5, -49.5, 0.5, 6, 0, li(R.metal, 0.5), 1, da(R.metal, 0.35)))
      rr(c, s * 20.5 - 6.5, -39, 13, 10, 3, sideLit(c, s * 20.5 - 6.5, s * 20.5 + 6.5, R.tire, 0.3)); rr(c, s * 20.5 - 6.5, -31, 13, 2.3, 1, css(R.sole))
    }
    // Upper body shifts away from a kick and settles with the springs.
    c.save(); c.translate(-ks * (4.5 * k + 2 * kp.tuck), bob * 0.6 - r.susp * 0.35 + (r.boosting ? 4 : 0))
    limb(c, [-32, -75, 32, -75], 4, css(mx(R.tire, R.metal, 0.25)))
    for (const s of [-1, 1]) { rr(c, s * 31.5 - 4.5, -79, 9, 8, 3, sideLit(c, s * 31.5 - 4.5, s * 31.5 + 4.5, R.metal, 0.5)) }
    // With avatars on, the rider is the player's avatar seen from behind: their own top colour, their own hair or hat, no helmet.
    const av = hasAv(r.i), J = av ? AVC[r.i].top : C
    limb(c, [-15, -89, -24.5, -81, -28.5, -76], 9, da(J, 0.34)); limb(c, [15, -89, 24.5, -81, 28.5, -76], 9, li(J, 0.14))
    circ(c, -28.5, -76, 4.8, css(mx(R.tire, BLACK, 0.3))); circ(c, 28.5, -76, 4.8, css(R.tire))
    // Jacket: lit from the right, with a hem that flutters at speed.
    const fl = Math.sin(time * 23 + r.i) * 1.6 * sp
    c.beginPath(); c.moveTo(-15, -97); c.quadraticCurveTo(0, -101, 15, -97); c.quadraticCurveTo(19, -80, 17 + fl * 0.4, -58); c.quadraticCurveTo(8, -54 + fl, 0, -56 - fl * 0.5); c.quadraticCurveTo(-8, -54 - fl, -17 + fl * 0.4, -58); c.quadraticCurveTo(-19, -80, -15, -97); c.closePath()
    c.fillStyle = lg(c, -18, 0, 18, 0, 0, da(J, 0.42), 0.5, css(J), 0.86, li(J, 0.3), 1, li(J, 0.12)); c.fill()
    c.fillStyle = lg(c, 0, -100, 0, -56, 0, css(P.sunC, 0.16), 0.5, css(P.sunC, 0), 1, css(P.dkC, 0.22)); c.fill()
    circ(c, -15.5, -90, 7, rg(c, -14, -92, 1, 7, 0, css(J), 1, da(J, 0.4))); circ(c, 15.5, -90, 7, rg(c, 17.5, -92.5, 1, 7, 0, li(J, 0.5), 1, css(J)))
    rr(c, -5.5, -96, 11, 30, 5, lg(c, -5.5, 0, 5.5, 0, 0, css(P.dkC, 0.2), 0.6, css(P.sunC, 0.1), 1, css(P.sunC, 0.22)))
    rr(c, -9.5, -86, 19, 17, 3.5, av ? css(C) : css(R.paper)); c.fillStyle = av ? css(R.paper) : da(C, 0.3); c.font = '12px "Press Start 2P",monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(r.i + 1), 0.5, -76.5)

    rr(c, -16.5, -64, 33, 6, 2.5, da(J, 0.5)); rr(c, -3, -64.5, 6, 7, 1.5, li(R.metal, 0.4))
    // Helmet: a lit sphere that turns toward the kick.
    const hx = r.look * 2.6
    if (av) {
      rr(c, -5, -97, 10, 7, 2.5, css(AVC[r.i].skin))
      const f = AVS[r.i].back, k = 2.15, x0 = hx - 12 * k, y0 = -93 - 16 * k
      c.imageSmoothingEnabled = false
      for (const d of [1.6, 1.1, 0.6]) c.drawImage(f.side, 0, 0, 24, 16, x0 - d * 1.3, y0 + d * 0.5, 24 * k, 16 * k)
      c.drawImage(f.lit, 0, 0, 24, 16, x0, y0, 24 * k, 16 * k); c.imageSmoothingEnabled = true
    } else {
    rr(c, -5.5, -99, 11, 6, 2.5, da(R.pants, 0.2))
    circ(c, hx, -107, 14, rg(c, hx + 5, -112.5, 1.5, 17, 0, li(R.helmet, 0.5), 0.5, css(R.helmet), 1, da(R.helmet, 0.5)))
    c.save(); c.beginPath(); c.arc(hx, -107, 14, 0, 7); c.clip()
    rr(c, hx - 14, -111.5, 28, 6, 0, sideLit(c, hx - 14, hx + 14, C, 0.4)); rr(c, hx - 2.8 + r.look * 4, -122, 5.6, 14, 2, sideLit(c, hx - 3, hx + 3, C, 0.3)); rr(c, hx - 14, -96.5, 28, 5, 0, css(P.dkC, 0.3))
    c.restore()
    c.beginPath(); c.ellipse(hx + 6, -113.5, 3.4, 2, -0.6, 0, 7); c.fillStyle = 'rgba(255,255,255,.75)'; c.fill()
    }
    c.restore()
    if (kp.ext + kp.tuck > 0) {
      const fx = ks * (21 + 37 * k - 5 * kp.tuck), fy = -45 - 7 * k - 8 * kp.tuck, kx = ks * (17 + 13 * k + 3 * kp.tuck), ky = -51 - 5 * k - 9 * kp.tuck
      limb(c, [ks * 9, -61, kx, ky, fx, fy], 14, css(R.ink, 0.55)); limb(c, [ks * 9, -61, kx, ky, fx, fy], 11, li(R.pants, 0.3))
      circ(c, kx, ky, 5.8, rg(c, kx + 1.5, ky - 1.5, 0.5, 6, 0, li(R.metal, 0.5), 1, da(R.metal, 0.35)))
      c.save(); c.translate(fx, fy); c.rotate(ks * (0.25 - 0.5 * k)); rr(c, -9.5, -8, 19, 16, 4.5, sideLit(c, -9.5, 9.5, R.tire, 0.3)); rr(c, ks > 0 ? 5 : -9.5, -8, 4.5, 16, 2, css(R.sole)); c.restore()
      if (k > 0.2) {
        c.globalAlpha *= Math.min(1, k) * 0.85
        c.beginPath(); c.arc(ks * 12, -49, 46 * k + 6, ks > 0 ? -0.55 : Math.PI - 0.45, ks > 0 ? 0.45 : Math.PI + 0.55); c.lineWidth = 4 - 2 * k; c.strokeStyle = spark; c.stroke()
        for (let i = -1; i <= 1; i++) limb(c, [fx + ks * 13, fy + i * 7, fx + ks * (19 + 8 * k), fy + i * 11], 1.8, spark)
        c.globalAlpha = 1
      }
    }
    c.restore()
    if (r.flash > 0) { const f = 1 - r.flash / 0.18; c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - f; c.beginPath(); c.arc(0, -62, 26 + f * 46, 0, 7); c.lineWidth = 7 * (1 - f) + 1; c.strokeStyle = spark; c.stroke(); circ(c, 0, -62, 30 * (1 - f), css(P.sunC, 0.5)); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over' }
  }
  // Off the bike: the bike slides on its side, the rider tumbles, sits, then gets back up.
  function drawDown(c, r, time, col, C, R) {
    const p = 1 - r.t / (r.tMax || DOWN_T), up = clamp((p - 0.74) / 0.26, 0, 1), fall = clamp(p / 0.2, 0, 1)
    softShadow(c, -10, 48, 8)
    c.save(); c.translate(-18 * (1 - up), -4); c.rotate(lerp(ease.out(fall) * 1.42, 0, ease.inOut(up)))
    rr(c, -9.5, -38, 19, 38, 7.5, lg(c, -9.5, 0, 9.5, 0, 0, css(mx(R.tire, BLACK, 0.5)), 0.6, css(R.tire), 1, css(mx(R.tire, R.metal, 0.3))))
    poly(c, [-17, -35, 17, -35, 10, -60, -10, -60], sideLit(c, -17, 17, mx(C, P.dkC, 0.25), 0.4)); rr(c, -8.5, -51, 17, 7, 3, css(P.t.danger))
    for (const s of [-1, 1]) rr(c, s * 19 - 4, -38, 8, 20, 3.5, sideLit(c, s * 19 - 4, s * 19 + 4, R.metal, 0.5))
    limb(c, [-32, -75, 32, -75], 4, css(R.tire)); c.restore()
    if (hasAv(r.i) && p >= 0.55) { c.save(); c.translate(lerp(40, 24, ease.inOut(up)), 0); c.rotate(Math.sin(time * 9) * 0.09 * (1 - up)); standee(c, r.i, 'idle', 0, 0, 64); c.restore(); if (up < 0.5) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; circ(c, 40 + Math.cos(a) * 20, -70 + Math.sin(a) * 6, 3, css(P.sunC)) } return }
    const hop = Math.abs(Math.sin(p * 10)) * 30 * Math.pow(1 - clamp(p / 0.6, 0, 1), 2)
    c.save(); c.translate(lerp(24 + p * 14, 2, ease.inOut(up)), lerp(-12 - hop, -58, ease.inOut(up))); c.rotate(lerp(p < 0.55 ? p * 17 : 1.5, 0, ease.inOut(up)))
    const flail = p < 0.55 ? time * 22 : 0
    limb(c, [-8, 14, -14 + Math.sin(flail) * 6, 30], 9, da(R.pants, 0.2)); limb(c, [8, 14, 15 + Math.cos(flail) * 6, 28], 9, css(R.pants))
    limb(c, [-13, -12, -24 + Math.cos(flail * 1.3) * 6, 2], 8, da(C, 0.3)); limb(c, [13, -12, 24 + Math.sin(flail * 1.3) * 6, 0], 8, li(C, 0.1))
    { const J = hasAv(r.i) ? AVC[r.i].top : C; rr(c, -15, -19, 30, 35, 10, lg(c, -15, 0, 15, 0, 0, da(J, 0.42), 0.5, css(J), 1, li(J, 0.3))) }
    if (hasAv(r.i)) { c.imageSmoothingEnabled = false; c.drawImage(AVS[r.i].back.lit, 0, 0, 24, 16, -21, -52, 42, 28); c.imageSmoothingEnabled = true }
    else { circ(c, 0, -28, 13, rg(c, 4.5, -33, 1.5, 16, 0, li(R.helmet, 0.5), 0.5, css(R.helmet), 1, da(R.helmet, 0.5))); rr(c, -13, -32, 26, 5.5, 2, css(C)) }
    c.restore()
    if (up < 0.5) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; c.save(); c.translate(26 + Math.cos(a) * 21, -58 + Math.sin(a) * 6); c.rotate(a * 2); poly(c, [0, -5, 1.5, -1.5, 5, 0, 1.5, 1.5, 0, 5, -1.5, 1.5, -5, 0, -1.5, -1.5], css(P.sunC)); c.restore() }
  }

  // ── Traffic and scenery (painted once per theme) ─────────────────────────
  function paintCar(g, B, van) {
    const R = P.raw
    softShadow(g, -10, 78, 12, 1.2)
    for (const s of [-1, 1]) { rr(g, s * 45 - 11, -16, 22, 17, 5, lg(g, 0, -16, 0, 1, 0, css(R.tire), 1, css(mx(R.tire, BLACK, 0.7)))); for (let i = -1; i <= 1; i++) rr(g, s * 45 + i * 6 - 1, -15, 2, 15, 1, css(mx(R.tire, BLACK, 0.55))) }
    rr(g, -52, -20, 104, 10, 3, css(mx(R.tire, BLACK, 0.4)))
    for (const x of [-30, -22]) { circ(g, x, -9, 3.4, li(R.metal, 0.4)); circ(g, x, -9, 2, css(mx(R.tire, BLACK, 0.7))) }
    const paint = (x, y, w, h, r) => { rr(g, x, y, w, h, r, lg(g, 0, y, 0, y + h, 0, li(B, 0.5), 0.14, css(B), 0.62, css(B), 1, da(B, 0.5))); rr(g, x, y, w, h, r, lg(g, x, 0, x + w, 0, 0, css(P.dkC, 0.34), 0.5, css(P.dkC, 0), 1, css(P.sunC, 0.14))) }
    const glass = (pts, y0, y1) => { poly(g, pts, lg(g, 0, y0, 0, y1, 0, css(mx(R.sky0, P.dkC, 0.45)), 0.55, css(mx(R.sky1, P.dkC, 0.2)), 1, css(mx(R.grassA, P.dkC, 0.45)))) }
    if (van) {
      paint(-57, -118, 114, 108, 11)
      rr(g, -50, -124, 6, 8, 2, li(R.metal, 0.3)); rr(g, 44, -124, 6, 8, 2, li(R.metal, 0.3)); rr(g, -54, -126, 108, 3.5, 1.5, lg(g, 0, -126, 0, -122, 0, li(R.metal, 0.6), 1, da(R.metal, 0.3)))
      glass([-47, -106, -4, -106, -4, -68, -47, -68], -106, -68); glass([4, -106, 47, -106, 47, -68, 4, -68], -106, -68)
      poly(g, [-44, -104, -30, -104, -40, -70, -45, -70], 'rgba(255,255,255,.2)'); poly(g, [8, -104, 16, -104, 9, -70, 6, -70], 'rgba(255,255,255,.16)')
      rr(g, -0.8, -112, 1.6, 100, 0.8, css(P.dkC, 0.45)); rr(g, -10, -62, 6, 10, 2, lg(g, -10, 0, -4, 0, 0, da(R.metal, 0.3), 1, li(R.metal, 0.6))); rr(g, 4, -62, 6, 10, 2, lg(g, 4, 0, 10, 0, 0, da(R.metal, 0.3), 1, li(R.metal, 0.6)))
      rr(g, -57, -34, 114, 2, 1, css(P.dkC, 0.3))
    } else {
      poly(g, [-46, -60, -36, -92, 36, -92, 46, -60], lg(g, 0, -92, 0, -60, 0, li(B, 0.5), 0.2, css(B), 1, da(B, 0.25)))
      glass([-39, -62, -31, -86, 31, -86, 39, -62], -86, -62)
      rr(g, -22, -76, 13, 12, 3, css(P.dkC, 0.4)); rr(g, 9, -76, 13, 12, 3, css(P.dkC, 0.4))
      poly(g, [-36, -64, -30, -84, -14, -84, -22, -64], 'rgba(255,255,255,.22)'); poly(g, [14, -64, 19, -84, 24, -84, 20, -64], 'rgba(255,255,255,.14)')
      rr(g, -9, -85, 18, 2.6, 1.3, css(P.t.danger))
      paint(-59, -66, 118, 58, 14)
      limb(g, [-44, -53, 44, -53], 1, css(P.dkC, 0.4)); limb(g, [-38, -64, 38, -64], 1.2, 'rgba(255,255,255,.35)')
      circ(g, 0, -46, 3, lg(g, -3, 0, 3, 0, 0, da(R.metal, 0.3), 1, li(R.metal, 0.7)))
    }
    for (const s of [-1, 1]) { rr(g, s * 44 - 11, -51, 22, 13, 4.5, lg(g, 0, -51, 0, -38, 0, li(P.t.danger, 0.3), 1, da(P.t.danger, 0.45))); rr(g, s * 44 - 9, -49, 8, 3, 1.5, 'rgba(255,255,255,.6)'); rr(g, s * 44 + (s > 0 ? -9 : 3), -43, 6, 3.5, 1.5, css(mx(P.t.cta, P.sunC, 0.4))) }
    rr(g, -15, -37, 30, 13, 2, css(R.paper)); rr(g, -15, -37, 30, 13, 2, lg(g, 0, -37, 0, -24, 0, 'rgba(255,255,255,.3)', 1, css(P.dkC, 0.15))); g.fillStyle = css(R.ink); g.font = '6px "Press Start 2P",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GN42', 0.5, -30)
    rr(g, -61, -23, 122, 12, 5, lg(g, 0, -23, 0, -11, 0, li(R.metal, 0.55), 0.35, css(R.metal), 1, da(R.metal, 0.5))); rr(g, -56, -21.5, 112, 2, 1, 'rgba(255,255,255,.5)')
    rr(g, -58, -18, 8, 4, 1.5, css(P.t.danger)); rr(g, 50, -18, 8, 4, 1.5, css(P.t.danger))
  }
  function blob(g, x, y, r, a) { circ(g, x, y, r, rg(g, x + r * 0.34, y - r * 0.36, r * 0.08, r * 1.05, 0, li(a, 0.42), 0.55, css(a), 1, da(a, 0.42))) }
  const PAINT = {
    pine(g, v) {
      const R = P.raw, t = v ? [R.aut0, R.aut1, R.aut2] : [R.leaf0, R.leaf1, R.leaf2]
      softShadow(g, -16, 50, 9); rr(g, -5, -38, 10, 38, 2, sideLit(g, -5, 5, R.trunk, 0.4))
      const tiers = [[-28, -92, 42], [-60, -124, 34], [-94, -150, 25], [-124, -168, 15]]
      tiers.forEach((q, i) => {
        const base = q[0], top = q[1], hw = q[2]
        g.beginPath(); g.moveTo(0, top); const n = 7
        for (let j = n; j >= -n; j--) g.lineTo((j / n) * hw, base + (j & 1 ? 0 : 7) - Math.abs(j / n) * 3)
        g.closePath(); g.fillStyle = lg(g, -hw, 0, hw, 0, 0, da(t[0], 0.45), 0.5, css(t[Math.min(2, i ? 1 : 0)]), 1, li(t[2], 0.4)); g.fill()
        g.fillStyle = lg(g, 0, top, 0, base + 6, 0, css(P.sunC, 0.18), 0.5, css(P.sunC, 0), 1, css(P.dkC, 0.38)); g.fill()
      })
    },
    tree(g, v) {
      const R = P.raw, t = v ? [R.aut0, R.aut1, R.aut2] : [R.leaf0, R.leaf1, R.leaf2]
      softShadow(g, -18, 58, 10)
      limb(g, [0, 0, 0, -56], 11, sideLit(g, -6, 6, R.trunk, 0.4)); limb(g, [0, -44, -16, -66], 6, da(R.trunk, 0.3)); limb(g, [0, -40, 15, -64], 6, li(R.trunk, 0.15))
      for (const q of [[-26, -72, 26, 0], [24, -76, 25, 0], [-4, -66, 24, 0], [-14, -100, 28, 1], [16, -98, 26, 1], [0, -118, 24, 1], [18, -112, 15, 2], [-22, -86, 14, 1], [6, -82, 17, 2]]) blob(g, q[0], q[1], q[2], t[q[3]])
      const rn = mulberry(v ? 5 : 3); for (let i = 0; i < 22; i++) { const a = rn() * 6.28, d = rn() * 34; circ(g, 2 + Math.cos(a) * d * 1.1, -94 + Math.sin(a) * d, 1.6 + rn() * 1.6, li(t[2], 0.3 + rn() * 0.3)) }
    },
    bush(g) { const R = P.raw; softShadow(g, -8, 40, 7); blob(g, -17, -14, 18, R.leaf0); blob(g, 15, -15, 20, R.leaf1); blob(g, -2, -27, 18, R.leaf2); for (const q of [[-10, -32], [12, -24], [2, -14], [-20, -18]]) { circ(g, q[0], q[1], 3.2, css(R.flower)); circ(g, q[0] + 0.8, q[1] - 0.8, 1.2, 'rgba(255,255,255,.7)') } },
    chev(g, d) { const R = P.raw; softShadow(g, -8, 30, 5); rr(g, -3, -62, 6, 62, 2, sideLit(g, -3, 3, R.post, 0.4)); rr(g, -37, -116, 74, 62, 9, css(R.ink)); rr(g, -33, -112, 66, 54, 6, lg(g, 0, -112, 0, -58, 0, li(R.pow, 0.4), 1, da(R.pow, 0.2))); limb(g, [-d * 12, -99, d * 8, -85, -d * 12, -71], 9, css(R.ink)); rr(g, -33, -112, 66, 10, 5, 'rgba(255,255,255,.22)') },
    lamp(g, d) { const R = P.raw; softShadow(g, -6, 24, 4); rr(g, -5, -8, 10, 8, 2, da(R.post, 0.3)); rr(g, -3, -192, 6, 192, 3, sideLit(g, -3, 3, R.post, 0.45)); limb(g, [0, -190, d * 30, -202, d * 54, -198], 5, css(R.post)); rr(g, d * 54 - 13, -201, 26, 9, 4, lg(g, 0, -201, 0, -192, 0, li(R.metal, 0.5), 1, da(R.metal, 0.4))); rr(g, d * 54 - 9, -193.5, 18, 4, 2, css(P.dark ? P.t.cta : R.lit)) },
    board(g, v) {
      const R = P.raw
      softShadow(g, -16, 70, 8)
      for (const x of [-44, 37]) rr(g, x, -72, 7, 72, 2, sideLit(g, x, x + 7, R.post, 0.4)); limb(g, [-40, -8, 40, -60], 2, css(R.post)); limb(g, [40, -8, -40, -60], 2, css(R.post))
      rr(g, -68, -154, 136, 90, 8, lg(g, -68, 0, 68, 0, 0, da(R.ink, 0), 1, css(mx(R.ink, R.metal, 0.3)))); rr(g, -62, -148, 124, 78, 5, lg(g, 0, -148, 0, -70, 0, li(R.paper, 0.4), 1, da(R.paper, 0.18)))
      for (let i = 0; i < 4; i++) { const a = P.rs[(i + v) % 4]; rr(g, -56 + i * 28.5, -142, 26, 15, 3, lg(g, 0, -142, 0, -127, 0, li(a, 0.3), 1, da(a, 0.2))) }
      g.fillStyle = css(R.ink); g.font = '15px "Press Start 2P",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GAME', 0, -109); g.fillText('NIGHT', 0, -88)
      poly(g, [-62, -148, -20, -148, -52, -70, -62, -70], 'rgba(255,255,255,.12)')
      for (const x of [-40, 0, 40]) { rr(g, x - 5, -162, 10, 5, 2, css(R.metal)); if (P.dark) circ(g, x, -154, 9, css(P.t.cta, 0.35)) }
    },
    house(g, v) {
      const R = P.raw
      if (P.dark) {
        const h = 170 + v * 60; softShadow(g, -14, 60, 8)
        rr(g, -42, -h, 84, h, 3, sideLit(g, -42, 42, R.house, 0.35))
        for (let y = 14; y < h - 16; y += 19) for (let x = -32; x < 28; x += 17) { const on = ((x * 7 + y * 13 + v * 31) % 5 + 5) % 5; if (on > 1) rr(g, x, -h + y, 10, 11, 1, css(on > 3 ? P.t.p1 : P.t.cta, 0.55 + on * 0.1)) ; else rr(g, x, -h + y, 10, 11, 1, css(BLACK, 0.4)) }
        rr(g, -46, -h - 5, 92, 7, 2, da(R.house, 0.4)); rr(g, -1.5, -h - 34, 3, 30, 1, css(R.post))
      } else {
        softShadow(g, -22, 80, 10)
        const wall = v ? mx(R.house, P.t.tintCta, 0.6) : R.house
        rr(g, -46, -64, 92, 64, 2, sideLit(g, -46, 46, wall, 0.3)); rr(g, -46, -64, 92, 12, 0, css(P.dkC, 0.28))
        rr(g, 15, -122, 12, 28, 1, sideLit(g, 15, 27, mx(R.roof, P.dkC, 0.3), 0.3)); rr(g, 13, -125, 16, 5, 1, da(R.roof, 0.5))
        poly(g, [-58, -62, 58, -62, 32, -106, -32, -106], lg(g, -58, 0, 58, 0, 0, da(R.roof, 0.45), 0.55, css(R.roof), 1, li(R.roof, 0.35)))
        for (let y = -98; y < -62; y += 7) limb(g, [-32 - (y + 106) * 0.59, y, 32 + (y + 106) * 0.59, y], 0.8, css(P.dkC, 0.3))
        rr(g, -10, -34, 20, 34, 2, sideLit(g, -10, 10, R.trunk, 0.35)); circ(g, 6, -17, 1.6, li(R.metal, 0.6)); rr(g, -13, -2, 26, 3, 1, da(wall, 0.4))
        for (const x of [-37, 19]) { rr(g, x - 2, -52, 22, 22, 1.5, css(R.paper)); rr(g, x, -50, 18, 18, 1, lg(g, 0, -50, 0, -32, 0, css(mx(R.sky0, P.dkC, 0.4)), 1, css(R.sky1))); rr(g, x + 8.3, -50, 1.4, 18, 0, css(R.paper)); rr(g, x, -41.7, 18, 1.4, 0, css(R.paper)); poly(g, [x + 1, -49, x + 7, -49, x + 2, -34, x + 1, -34], 'rgba(255,255,255,.35)'); rr(g, x - 3, -31, 24, 4, 1, css(R.roof)) }
        for (let x = -66; x <= 66; x += 9) if (Math.abs(x) > 50) rr(g, x - 2, -20, 4, 20, 1, sideLit(g, x - 2, x + 2, R.paper, 0.3))
      }
    },
  }
  const BOX = { pine: [-56, -172, 46, 12], tree: [-80, -146, 56, 14], bush: [-52, -50, 40, 10], chev: [-42, -120, 40, 8], lamp: [-72, -206, 72, 8], board: [-90, -168, 72, 12], house: [-110, -260, 70, 14], car: [-92, -130, 70, 16] }
  const UNITS = { bike: 5.4, car: 6.5, pine: 13, tree: 12, bush: 9, tuft: 6, flag: 6.5, chev: 8, lamp: 9, board: 11, house: 14 }
  function staticSprite(kind, v) { const b = BOX[kind]; return sprite(kind + v, b[0], b[1], b[2], b[3], (g) => PAINT[kind](g, v)) }
  function carSprite(car) { const b = BOX.car; return sprite('car' + car.col + (car.van ? 'v' : 's'), b[0], b[1], b[2], b[3], (g) => paintCar(g, P.rc[car.col], car.van)) }
  // Things that move on their own: cloth, grass.
  function drawFlag(c, q, time) {
    const R = P.raw, a = P.rs[q.v | 0]
    softShadow(c, -4, 16, 3); rr(c, -2, -152, 4, 152, 2, sideLit(c, -2, 2, R.post, 0.45)); circ(c, 0, -154, 4.5, li(R.pow, 0.3))
    for (let i = 0; i < 9; i++) {
      const u0 = i / 9, u1 = (i + 1) / 9, w0 = Math.sin(time * 7.5 - i * 0.8 + q.x * 9) * 4 * u0, w1 = Math.sin(time * 7.5 - (i + 1) * 0.8 + q.x * 9) * 4 * u1
      poly(c, [2 + u0 * 46, -148 + w0 + u0 * 8, 2 + u1 * 46 + 0.6, -148 + w1 + u1 * 8, 2 + u1 * 46 + 0.6, -118 + w1 - u1 * 8, 2 + u0 * 46, -118 + w0 - u0 * 8], w1 - w0 > 0 ? da(a, 0.28) : li(a, 0.22))
    }
  }
  function drawTuft(c, q, time) {
    const R = P.raw, sw = Math.sin(time * 2.4 + q.v * 40) * 3
    for (let i = -3; i <= 3; i++) limb(c, [i * 4, 0, i * 5 + sw * 0.5, -8, i * 7 + sw, -14 - (i & 1) * 6], 2.2, i & 1 ? li(R.leaf1, 0.2) : da(R.leaf0, 0.1))
    if (q.v < 0.5) { circ(c, -10 + sw, -20, 4, css(R.flower)); circ(c, 9 + sw, -24, 4.2, css(R.paper)); circ(c, 9 + sw, -24, 1.7, css(R.pow)) }
  }

  // ── World-space effects: they stay on the road and recede like everything else ─
  const wps = [], skids = []
  function puff(kind, z, x, h, o) { if (wps.length > 170) wps.shift(); wps.push(Object.assign({ kind, z, x, h, vz: 0, vx: 0, vh: 0, life: 0.6, max: 0.6, size: 60, grow: 2 }, o)) }
  function stepEffects(dt) {
    for (let i = wps.length - 1; i >= 0; i--) { const p = wps[i]; p.life -= dt; if (p.life <= 0) { wps.splice(i, 1); continue } p.z += p.vz * dt; p.x += p.vx * dt; p.h += p.vh * dt; if (p.kind === 'spark' || p.kind === 'chip') { p.vh -= 2600 * dt; if (p.h < 0) { p.h = 0; p.vh *= -0.4 } } else p.vz *= Math.exp(-2.5 * dt) }
    if (phase === 'count' || phase === 'done') return
    for (const r of riders) {
      const sp = r.speed / MAXSPD
      if (r.state === 'down') {
        if (r.speed > 1500) { if (Math.random() < 0.8) puff('spark', r.z + 40, r.x - 0.012, 20, { vz: r.speed * (0.7 + Math.random() * 0.3), vx: (Math.random() - 0.5) * 0.5, vh: 300 + Math.random() * 600, life: 0.35, max: 0.35, size: 14 }); if (Math.random() < 0.5) puff('dust', r.z, r.x, 30, { vz: r.speed * 0.5, vh: 160, size: 120, grow: 2.5, life: 0.9, max: 0.9 }); skids.push({ z: r.z, x: r.x - 0.012, i: r.i, w: 0.9 }) }
        continue
      }
      if (!r.brk && sp < 0.97 && Math.random() < 0.3 + (1 - sp) * 0.5) for (const s of [-1, 1]) puff('smoke', r.z - 30, r.x + s * 0.05, 100, { vz: r.speed * 0.72, vx: s * 0.05, vh: 110, size: 34, grow: 3.2, life: 0.5, max: 0.5 })
      if (Math.abs(r.x) > 1.02 && Math.random() < 0.7) { puff('dust', r.z - 20, r.x + (Math.random() - 0.5) * 0.06, 40, { vz: r.speed * 0.6, vh: 220, size: 90, grow: 3, life: 0.7, max: 0.7 }); if (Math.random() < 0.4) puff('chip', r.z, r.x, 30, { vz: r.speed * 0.8, vx: (Math.random() - 0.5) * 0.4, vh: 500 + Math.random() * 500, size: 12, life: 0.5, max: 0.5 }) }
      if (r.cu > 0 || r.boosting) for (const s of [-1, 1]) puff('spark', r.z - 20, r.x + s * 0.05, 95, { vz: r.speed * 0.8, vx: s * 0.1, vh: 40 + Math.random() * 120, life: 0.22, max: 0.22, size: 16 })
      if (r.stag > 0) { if (Math.random() < 0.6) puff('smoke', r.z - 20, r.x, 20, { vz: r.speed * 0.7, vh: 150, size: 70, grow: 2.6, life: 0.6, max: 0.6 }); skids.push({ z: r.z, x: r.x, i: r.i, w: 0.5 }) }
      else if (skids.length && skids[skids.length - 1].i === r.i && !skids[skids.length - 1].end) skids[skids.length - 1].end = true
    }
    if (skids.length > 260) skids.splice(0, skids.length - 260)
  }

  // ── Render one rider's seat ──────────────────────────────────────────────
  let frame = 0, skyOff = 0, camSm = 0
  const parts = [], tags = []
  const peaks = (() => { const r = mulberry(7), a = []; for (let i = 0; i < 24; i++) a.push(16 + r() * 50); return a })()
  const stars = (() => { const r = mulberry(11), a = []; for (let i = 0; i < 46; i++) a.push([r() * W, r() * (HORIZ - 30), 0.6 + r() * 1.1, r() * 6]); return a })()
  function cloudSprite(v) {
    return sprite('cloud' + v, -70, -40, 70, 26, (g) => {
      const R = P.raw, rn = mulberry(31 + v * 7), lit = mx(R.cloud, P.sunC, 0.3), under = mx(mx(R.sky0, R.cloud, 0.55), P.dkC, 0.1)
      const bl = []; for (let i = 0; i < 7; i++) bl.push([-44 + i * 15 + rn() * 6, -4 - rn() * 14 - (i > 1 && i < 5 ? 8 : 0), 13 + rn() * 9])
      for (const b of bl) circ(g, b[0], b[1] + 9, b[2], css(under))
      for (const b of bl) circ(g, b[0] + 2, b[1], b[2], rg(g, b[0] + b[2] * 0.4, b[1] - b[2] * 0.4, b[2] * 0.1, b[2], 0, css(lit), 0.7, css(R.cloud), 1, css(mx(R.cloud, under, 0.6))))
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = lg(g, 0, 8, 0, 26, 0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,1)'); g.fillRect(-70, 8, 140, 18)
    })
  }
  function ridge(c, base, scale, off, front, back, snow) {
    const mo = ((off % 720) + 720) % 720, m0 = Math.floor(mo / 30), pk = (i) => peaks[(((i + m0) % 24) + 24) % 24] * scale, X = (i) => i * 30 - (mo % 30)
    c.beginPath(); c.moveTo(-30, base + 2); for (let i = -1; i <= 14; i++) c.lineTo(X(i), base - pk(i)); c.lineTo(W + 30, base + 2); c.closePath(); c.fillStyle = back; c.fill()
    for (let i = 0; i <= 13; i++) { const h = pk(i); if (h > pk(i - 1) && h > pk(i + 1)) { poly(c, [X(i), base - h, X(i + 1), base - pk(i + 1), X(i) + 9, base + 2, X(i) - 3, base - h * 0.4], front); if (snow && h > 46 * scale) { poly(c, [X(i), base - h, X(i) - 7, base - h + 11, X(i) - 2, base - h + 8, X(i) + 2, base - h + 13, X(i) + 8, base - h + 9], css(P.t.card, 0.95)); poly(c, [X(i), base - h, X(i) - 7, base - h + 11, X(i) - 2, base - h + 8, X(i), base - h + 4], css(P.dkC, 0.18)) } } }
  }
  function hills(c, base, amp, a, off, f) {
    c.beginPath(); c.moveTo(0, HORIZ + 2)
    for (let x = 0; x <= W; x += 6) { const u = (x + off) * f; c.lineTo(x, base - amp * (0.5 + 0.34 * Math.sin(u) + 0.16 * Math.sin(u * 2.7 + 1.3))) }
    c.lineTo(W, HORIZ + 2); c.closePath(); c.fillStyle = lg(c, 0, base - amp, 0, HORIZ, 0, P.dark ? css(a) : li(a, 0.3), 1, da(a, 0.12)); c.fill()
  }
  function backdrop(c, time) {
    const R = P.raw
    c.fillStyle = P.dark ? lg(c, 0, 0, 0, HORIZ, 0, P.sky0, 0.6, css(mx(R.sky0, R.sky1, 0.35)), 1, P.sky1) : lg(c, 0, 0, 0, HORIZ, 0, da(R.sky0, 0.22), 0.4, P.sky0, 0.8, P.sky1, 1, css(mx(R.sky1, P.sunC, 0.45)))
    c.fillRect(0, 0, W, HORIZ + 2)
    const sx = 262 - ((skyOff * 0.05) % 40 + 40) % 40
    if (P.dark) {
      for (const s of stars) { c.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(time * 1.3 + s[3])); circ(c, s[0], s[1], s[2], P.paper) } c.globalAlpha = 1
      c.globalCompositeOperation = 'lighter'; c.fillStyle = rg(c, sx, HORIZ - 66, 20, 150, 0, css(P.t.p2, 0.5), 1, css(P.t.p2, 0)); c.fillRect(0, 0, W, HORIZ + 2); c.globalCompositeOperation = 'source-over'
      circ(c, sx, HORIZ - 66, 52, lg(c, 0, HORIZ - 118, 0, HORIZ - 14, 0, P.sun0, 1, P.sun1))
      for (let i = 0; i < 6; i++) { c.fillStyle = css(mx(R.sky0, R.sky1, 0.45 + i * 0.09)); c.fillRect(sx - 56, HORIZ - 72 + i * 11, 112, 1.5 + i * 1.1) }
    } else {
      c.globalCompositeOperation = 'lighter'; c.fillStyle = rg(c, sx, 60, 8, 170, 0, css(P.sunC, 0.6), 0.25, css(P.sunC, 0.18), 1, css(P.sunC, 0)); c.fillRect(0, 0, W, HORIZ + 2); c.globalCompositeOperation = 'source-over'
      circ(c, sx, 60, 22, rg(c, sx, 60, 4, 22, 0, '#fff', 0.7, css(mx(P.sunC, [255, 255, 255], 0.5)), 1, css(P.sunC, 0.9)))
    }
    for (let i = 0; i < 6; i++) {
      const far = i % 2, cx = ((i * 97 + 30 - skyOff * (far ? 0.07 : 0.14) + time * (far ? 1.5 : 3.5)) % (W + 220) + W + 220) % (W + 220) - 110, cy = (far ? 96 : 34) + (i * 29) % 46, s = far ? 0.45 : 0.75 + (i % 3) * 0.2
      c.save(); c.translate(cx, cy); c.scale(s, s); c.globalAlpha = P.dark ? 0.16 : far ? 0.75 : 0.96; put(c, cloudSprite(i % 3)); c.restore()
    }
    if (!P.dark) for (let i = 0; i < 3; i++) { const bx = ((time * 14 + i * 13 + 40 - skyOff * 0.1) % (W + 80) + W + 80) % (W + 80) - 40, by = 84 + i * 7 + Math.sin(time * 0.7 + i) * 6, f = Math.sin(time * 9 + i * 1.7) * 3; limb(c, [bx - 5, by + f, bx, by, bx + 5, by + f], 1.2, css(P.dkC, 0.55)) }
    ridge(c, HORIZ, 1.15, skyOff * 0.1, P.dark ? css(mx(R.mount, P.t.p3, 0.12)) : css(mx(R.mount, P.sunC, 0.42)), css(mx(R.mount, R.sky1, P.dark ? 0.2 : 0.5)), !P.dark)
    if (P.dark) { c.lineWidth = 1; c.strokeStyle = css(P.t.p3, 0.35); c.stroke() }
    c.fillStyle = lg(c, 0, HORIZ - 60, 0, HORIZ + 2, 0, css(R.fog, 0), 1, css(R.fog, P.dark ? 0.45 : 0.5)); c.fillRect(0, HORIZ - 60, W, 62)
    hills(c, HORIZ, 44, R.hillFar, skyOff * 0.25, 0.021)
    hills(c, HORIZ + 2, 25, R.hillNear, skyOff * 0.55 + 90, 0.034)
    c.fillStyle = lg(c, 0, HORIZ - 16, 0, HORIZ + 3, 0, css(R.fog, 0), 1, css(R.fog, 0.55)); c.fillRect(0, HORIZ - 16, W, 19)
    c.fillStyle = P.grassA; c.fillRect(0, HORIZ, W, H - HORIZ)
  }
  function render(c, view, time, main) {
    frame++; tags.length = 0
    const cam = riders[view], camZ = cam.z - PLAYERZ, camX = (main ? camSm : cam.x) * ROAD, camY = CAMH + roadY(cam.z) + (main ? cam.susp * 5 : 0), sp = cam.speed / MAXSPD, R = P.raw
    backdrop(c, time)
    const bi = Math.max(0, Math.floor(camZ / SEG)), bp = camZ > 0 ? (camZ - bi * SEG) / SEG : 0, F = P.fogTab
    let x = 0, dx = -(segs[bi].curve * bp), maxy = H, vanX = W / 2
    for (let n = 0; n < DRAW; n++) {
      const s = segs[bi + n]; if (!s) break
      const cz1 = s.z - camZ, cz2 = cz1 + SEG, X1 = x, X2 = x + dx
      x += dx; dx += s.curve
      if (cz1 <= 30) { s._f = 0; continue }
      const sc1 = CAMD / cz1, sc2 = CAMD / cz2
      let x1 = W / 2 + sc1 * (X1 - camX) * W / 2, y1 = HORIZ + sc1 * (camY - s.y1) * YS, w1 = sc1 * ROAD * W / 2
      const x2 = W / 2 + sc2 * (X2 - camX) * W / 2, y2 = HORIZ + sc2 * (camY - s.y2) * YS, w2 = sc2 * ROAD * W / 2
      s._f = frame; s._sc1 = sc1; s._sc2 = sc2; s._x1 = x1; s._y1 = y1; s._x2 = x2; s._y2 = y2; s._clip = maxy
      if (n === 90) vanX = x2
      if (y2 >= maxy || y2 >= y1) continue
      if (y1 > maxy) { const t = (maxy - y2) / (y1 - y2); x1 = lerp(x2, x1, t); w1 = lerp(w2, w1, t); y1 = maxy }
      const q = Math.round((1 - Math.exp(-Math.pow(n / DRAW, 2) * 3.2)) * 24), yb = y1, yt = y2 - 1
      const strip = (l0, l1, col) => poly(c, [x1 + w1 * l0, yb, x1 + w1 * l1, yb, x2 + w2 * l1, yt, x2 + w2 * l0, yt], col)
      c.fillStyle = F[s.dark ? 'grassB' : 'grassA'][q]; c.fillRect(0, yt, W, yb - yt)
      strip(-1.3, 1.3, F.dirt[q])
      strip(-1.09, 1.09, F[s.dark ? 'kerbA' : 'kerbB'][q])
      strip(-1, 1, F[s.dark ? 'roadA' : 'roadB'][q])
      if (n < 60) { const wear = css(P.dark ? BLACK : P.dkC, 0.1 * (1 - n / 60)); for (const l of LANEX) for (const o of [-0.09, 0.09]) poly(c, [x1 + w1 * (l + o - 0.04), yb, x1 + w1 * (l + o + 0.04), yb, x2 + w2 * (l + o + 0.04), y2, x2 + w2 * (l + o - 0.04), y2], wear) }
      strip(-0.967, -0.943, F.edge[q]); strip(0.943, 0.967, F.edge[q])
      if (s.dark) { strip(-0.514, -0.486, F.lane[q]); strip(0.486, 0.514, F.lane[q]); strip(-0.014, 0.014, F.center[q]) }
      maxy = y2
    }
    // The low sun (or the neon horizon) glances off the tarmac.
    c.globalCompositeOperation = 'lighter'
    const gc = P.dark ? P.t.p2 : P.sunC
    c.fillStyle = rg(c, vanX, HORIZ + 4, 4, 190, 0, css(gc, P.dark ? 0.3 : 0.2), 0.5, css(gc, 0.05), 1, css(gc, 0)); c.fillRect(0, HORIZ, W, 200)
    c.globalCompositeOperation = 'source-over'
    const pt = (z, xn) => {
      const s = segAt(z); if (s._f !== frame) return null
      const cz = z - camZ; if (cz < 120) return null
      const sc = CAMD / cz, t = (sc - s._sc1) / (s._sc2 - s._sc1), cx = lerp(s._x1, s._x2, t)
      return { cx, x: cx + sc * xn * ROAD * W / 2, y: lerp(s._y1, s._y2, t), u: sc * W / 2, sc, clip: s._clip, cz }
    }
    // Skid marks lie on the road.
    c.lineCap = 'round'
    for (let i = 1; i < skids.length; i++) {
      const a = skids[i - 1], b = skids[i]; if (a.i !== b.i || a.end || b.z - a.z > 600 || b.z < a.z) continue
      const p = pt(a.z, a.x), q = pt(b.z, b.x); if (!p || !q || p.y > p.clip || q.y > q.clip) continue
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.lineWidth = Math.max(0.6, p.u * 70 * b.w); c.strokeStyle = css(P.dark ? BLACK : P.dkC, 0.4); c.stroke()
    }
    // Everything standing on the road, far to near.
    const list = []
    for (let n = Math.min(DRAW, segs.length - bi) - 1; n >= 0; n--) { const s = segs[bi + n]; for (const q of s.spr) list.push({ z: s.z + SEG / 2, x: q.x, q }) }
    for (const car of cars) if (car.z > camZ && car.z < camZ + DRAW * SEG) list.push({ z: car.z, x: car.x, car })
    for (const r of riders) list.push({ z: r.z, x: r.x, r })
    for (const w of wps) list.push({ z: w.z, x: w.x, w })
    list.sort((a, b) => b.z - a.z)
    for (const o of list) {
      const p = pt(o.z, o.x); if (!p) continue
      const cx = p.cx, sy = p.y, unit = p.u, px = p.x, sc = p.sc
      if (px < -220 || px > W + 220) continue
      const far = clamp((p.cz / (DRAW * SEG) - 0.45) * 2.2, 0, 0.8)
      c.save()
      if (sy > p.clip + 1) { c.beginPath(); c.rect(0, 0, W, p.clip); c.clip() }
      if (o.w) {
        const w = o.w, a = w.life / w.max, size = unit * w.size * (1 + w.grow * (1 - a)), y = sy - unit * w.h
        if (w.kind === 'spark') { c.globalCompositeOperation = 'lighter'; limb(c, [px, y, px + (Math.random() - 0.5) * size * 2, y + size * 1.2], Math.max(1, size * 0.3), css(mx(P.sunC, P.t.cta, 0.4), a)) }
        else if (w.kind === 'chip') { c.globalAlpha = a; rr(c, px - size / 2, y - size / 2, size, size, size * 0.2, F.dirt[0]) }
        else { c.globalAlpha = a * (w.kind === 'smoke' ? 0.34 : 0.5); const d = dot(w.kind === 'smoke' ? mx(R.metal, R.paper, 0.5) : mx(R.dirt, R.paper, 0.35)); c.drawImage(d.cv, px - size, y - size, size * 2, size * 2) }
      } else if (o.q && (o.q.k === 'oil' || o.q.k === 'patch')) {
        if (o.q.k === 'patch') { c.beginPath(); c.ellipse(px, sy, unit * (180 + o.q.v * 260), unit * (26 + o.q.v * 22), 0, 0, 7); c.fillStyle = css(P.dark ? BLACK : P.dkC, 0.14 + o.q.v * 0.1); c.fill() }
        else {
          const rx = unit * 330, ry = rx * 0.2
          c.beginPath(); c.ellipse(px, sy, rx, ry, 0, 0, 7); c.fillStyle = css(P.dark ? BLACK : mx(P.t.text, BLACK, 0.4), 0.82); c.fill()
          c.save(); c.translate(px, sy); c.scale(1, 0.2); c.globalCompositeOperation = 'lighter'
          c.fillStyle = rg(c, -rx * 0.25, -rx * 0.5, rx * 0.05, rx * 0.8, 0, css(P.t.p4, 0.5), 0.35, css(P.t.p2, 0.3), 0.7, css(P.t.p1, 0.18), 1, css(P.t.p1, 0)); c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore()
          c.beginPath(); c.ellipse(px + rx * 0.3, sy - ry * 0.35, rx * 0.25, ry * 0.18, 0, 0, 7); c.fillStyle = css(P.sunC, 0.4); c.fill()
        }
      } else if (o.q && o.q.k === 'gate') {
        const w = sc * ROAD * W / 2 * 1.16, top = sy - unit * 1750, band = unit * 380, pw = unit * 130
        for (const s of [-1, 1]) { softShadow2(c, cx + s * w - pw, sy, pw * 2.4, pw * 0.5); rr(c, cx + s * w - pw / 2, top, pw, sy - top, pw * 0.25, lg(c, cx + s * w - pw / 2, 0, cx + s * w + pw / 2, 0, 0, da(R.paper, 0.4), 0.6, css(R.paper), 1, li(R.paper, 0.3))) }
        const face = o.q.v ? R.ink : P.rs[0]
        rr(c, cx - w - pw / 2, top, 2 * w + pw, band, unit * 50, lg(c, 0, top, 0, top + band, 0, li(face, 0.3), 0.3, css(face), 1, da(face, 0.35)))
        if (o.q.v) { const n = 14, cw = (2 * w) / n; for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) { c.fillStyle = P.paper; c.fillRect(cx - w + i * cw, top + band * 0.14 + j * band * 0.36, cw, band * 0.36) } }
        else if (band > 9) { c.fillStyle = P.dark ? P.ink : P.paper; c.font = Math.floor(band * 0.5) + 'px "Press Start 2P",monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('START', cx, top + band * 0.55) }
        for (let i = 0; i < 9; i++) { const bx = cx - w * 0.88 + i * w * 0.22, sw = Math.sin(time * 6 + i * 1.3) * band * 0.08; poly(c, [bx - band * 0.24, top + band, bx + band * 0.24, top + band, bx + sw, top + band * 1.65], P.seat[i % 4].main) }
        c.fillStyle = css(P.dkC, 0.22); c.fillRect(cx - w, top + band, 2 * w, band * 0.18)
      } else {
        const kind = o.r ? 'bike' : o.car ? 'car' : o.q.k, k = unit * UNITS[kind]
        c.translate(px, sy); c.scale(k, k)
        if (o.r) {
          if (o.r.shield > 0 && Math.floor(time * 14) % 2 === 0) c.globalAlpha = 0.4
          drawBike(c, o.r, time); c.globalAlpha = 1
          if (main) { o.r._sx = px; o.r._sy = sy; o.r._k = k }
        } else if (o.car) {
          c.translate(0, Math.sin(time * 5 + o.car.z0) * 0.5); put(c, carSprite(o.car))
          if (P.dark) { c.globalCompositeOperation = 'lighter'; for (const s of [-1, 1]) circ(c, s * 44, -45, 20, rg(c, s * 44, -45, 2, 20, 0, css(P.t.danger, 0.55), 1, css(P.t.danger, 0))) }
        } else {
          if (far > 0) c.globalAlpha = 1 - far
          if (kind === 'flag') drawFlag(c, o.q, time)
          else if (kind === 'tuft') drawTuft(c, o.q, time)
          else {
            const v = kind === 'pine' ? (o.q.v < 0.5 ? 0 : 1) : kind === 'tree' ? (o.q.v < 0.6 ? 0 : 1) : kind === 'house' ? (P.dark ? Math.floor(o.q.v * 3) : o.q.v < 0.5 ? 0 : 1) : kind === 'board' ? (o.q.v | 0) : kind === 'bush' ? 0 : o.q.v
            if (kind === 'pine' || kind === 'tree' || kind === 'bush') c.transform(1, 0, Math.sin(time * 1.3 + o.q.x * 7 + o.z * 0.001) * (kind === 'bush' ? 0.02 : 0.035), 1, 0, 0)
            put(c, staticSprite(kind, v))
            if (kind === 'lamp' && P.dark) { const d = o.q.v, fl = 0.85 + 0.15 * Math.sin(time * 17 + o.z); c.globalCompositeOperation = 'lighter'; circ(c, d * 54, -190, 40, rg(c, d * 54, -190, 2, 40, 0, css(P.t.cta, 0.6 * fl), 1, css(P.t.cta, 0))); c.save(); c.scale(1, 0.22); circ(c, d * 70, 0, 110, rg(c, d * 70, 0, 6, 110, 0, css(P.t.cta, 0.3 * fl), 1, css(P.t.cta, 0))); c.restore() }
            if (kind === 'house' && P.dark && Math.sin(time * 3 + o.z) > 0) { c.globalCompositeOperation = 'lighter'; circ(c, 0, -(170 + v * 60) - 36, 7, css(P.t.danger, 0.9)) }
          }
        }
      }
      c.restore()
      if (o.r && o.r.i !== view && p.cz < 9000) tags.push({ x: px, y: sy - 136 * unit * UNITS.bike - 6, r: o.r })
    }
    // Lens: a little light leak from the sun side, and a vignette that tightens with speed.
    if (!P.dark) { c.globalCompositeOperation = 'lighter'; c.fillStyle = lg(c, W, 0, W * 0.3, H * 0.6, 0, css(P.sunC, 0.16), 1, css(P.sunC, 0)); c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over' }
    const vc = P.dark ? BLACK : P.dkC, va = 0.2 + (main ? Math.max(0, sp - 0.8) * 1.2 : 0)
    c.fillStyle = rg(c, W / 2, HORIZ + 70, 150, 340, 0, css(vc, 0), 1, css(vc, va)); c.fillRect(0, 0, W, H)
  }
  function softShadow2(c, x, y, w, h) { const col = P.dark ? BLACK : P.dkC; c.save(); c.translate(x, y); c.scale(1, h / w); c.fillStyle = rg(c, 0, 0, w * 0.2, w, 0, css(col, 0.4), 1, css(col, 0)); c.beginPath(); c.arc(0, 0, w, 0, 7); c.fill(); c.restore() }
  // Two small bar-end mirrors: a simplified view of the road behind, so an attacker or a
  // slipstreamer is seen before they arrive. Cheap on purpose: no second render of the world.
  const MIRROR_RANGE = 7000
  function drawMirrors(c, time) {
    const me = riders[0], R = P.raw, w = 82, h = 46, y0 = 80
    const behind = riders.filter((o) => o !== me && me.z - o.z > 40 && me.z - o.z < MIRROR_RANGE).sort((a, b) => a.z - b.z)
    const close = behind.length ? behind[behind.length - 1] : null
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 10 : W - 10 - w, hy = y0 + h * 0.4, bot = y0 + h, vx = x0 + w / 2 - side * w * 0.16
      limb(c, [x0 + (side < 0 ? w * 0.7 : w * 0.3), bot + 2, x0 + (side < 0 ? w * 0.95 : w * 0.05), bot + 15], 4, css(mx(R.tire, R.metal, 0.3)))
      rr(c, x0 - 3.5, y0 - 3.5, w + 7, h + 7, 13, lg(c, 0, y0 - 4, 0, bot + 4, 0, css(mx(R.tire, R.metal, 0.45)), 1, css(mx(R.tire, BLACK, 0.4))))
      c.save(); c.beginPath(); c.roundRect(x0, y0, w, h, 10); c.clip()
      c.fillStyle = lg(c, 0, y0, 0, hy, 0, P.sky0, 1, P.sky1); c.fillRect(x0, y0, w, hy - y0)
      c.fillStyle = P.hillNear; c.beginPath(); c.moveTo(x0, hy); for (let i = 0; i <= 8; i++) c.lineTo(x0 + i * w / 8, hy - 3 - 3 * Math.sin(i * 1.7 + side)); c.lineTo(x0 + w, hy); c.fill()
      c.fillStyle = lg(c, 0, hy, 0, bot, 0, css(mx(R.grassA, R.fog, 0.5)), 1, P.grassB); c.fillRect(x0, hy, w, bot - hy)
      const half = (d) => w * 0.8 * d, cx = (d) => vx - me.x * half(d), yy = (d) => hy + (bot - hy) * d
      poly(c, [cx(1) - half(1), bot, cx(1) + half(1), bot, cx(0.04) + half(0.04), yy(0.04), cx(0.04) - half(0.04), yy(0.04)], lg(c, 0, hy, 0, bot, 0, css(mx(R.roadA, R.fog, 0.55)), 1, P.roadB))
      for (const e of [-1, 1]) poly(c, [cx(1) + e * half(1), bot, cx(1) + e * half(1) * 1.09, bot, cx(0.04) + e * half(0.04) * 1.09, yy(0.04), cx(0.04) + e * half(0.04), yy(0.04)], P.kerbB)
      const flow = (me.z / 700) % 1
      for (let k = 0; k < 5; k++) { const d1 = 1 / (1 + (k + flow) * 0.9), d2 = 1 / (1 + (k + flow + 0.4) * 0.9); poly(c, [cx(d1) - half(d1) * 0.02, yy(d1), cx(d1) + half(d1) * 0.02, yy(d1), cx(d2) + half(d2) * 0.02, yy(d2), cx(d2) - half(d2) * 0.02, yy(d2)], P.center) }
      for (const o of behind) {
        const dz = me.z - o.z, d = 1 / (1 + dz / 900), px = vx + (o.x - me.x) * half(d), py = yy(d), s = 0.16 + d * 0.62, C = P.rs[o.i]
        if (px < x0 - 12 || px > x0 + w + 12) continue
        c.save(); c.translate(px, py); c.scale(s, s)
        c.beginPath(); c.ellipse(-2, 1, 16, 3.5, 0, 0, 7); c.fillStyle = css(P.dark ? BLACK : P.dkC, 0.4); c.fill()
        if (o.state === 'down') { rr(c, -14, -8, 28, 8, 3, css(C)); circ(c, 12, -9, 6, css(R.helmet)) }
        else {
          c.rotate(-o.lean * 0.25)
          rr(c, -4, -18, 8, 18, 3.5, css(R.tire)); rr(c, -9, -30, 18, 16, 5, sideLit(c, -9, 9, mx(C, P.dkC, 0.2), 0.35)); limb(c, [-15, -34, 15, -34], 2.5, css(R.tire))
          c.globalCompositeOperation = 'lighter'; circ(c, 0, -26, 9, rg(c, 0, -26, 1, 9, 0, css(P.sunC, 0.9), 1, css(P.sunC, 0))); c.globalCompositeOperation = 'source-over'; circ(c, 0, -26, 3.2, '#fff')
          if (hasAv(o.i)) { standee(c, o.i, 'idle', 0, -24, 44); rr(c, -8, -30, 16, 9, 4, sideLit(c, -8, 8, mx(C, P.dkC, 0.2), 0.35)); limb(c, [-15, -34, 15, -34], 2.5, css(R.tire)); circ(c, 0, -27, 3, '#fff') }
          else {
          rr(c, -10, -52, 20, 22, 7, sideLit(c, -10, 10, C, 0.35)); limb(c, [-9, -46, -14, -36], 5, da(C, 0.3)); limb(c, [9, -46, 14, -36], 5, li(C, 0.1))
          circ(c, 0, -58, 8.5, rg(c, 3, -61, 1, 10, 0, li(R.helmet, 0.5), 1, da(R.helmet, 0.4))); rr(c, -6.5, -61, 13, 5.5, 2.5, css(mx(R.ink, R.sky0, 0.25))); rr(c, -5, -60, 5, 1.6, 0.8, 'rgba(255,255,255,.6)')
          }
          if (o.boosting) { c.globalCompositeOperation = 'lighter'; circ(c, 0, -14, 14, rg(c, 0, -14, 1, 14, 0, css(P.t.cta, 0.7), 1, css(P.t.cta, 0))) }
        }
        c.restore()
      }
      c.fillStyle = css(P.dkC, P.dark ? 0.1 : 0.08); c.fillRect(x0, y0, w, h)
      poly(c, [x0 + w * 0.08, y0, x0 + w * 0.34, y0, x0 + w * 0.12, bot, x0 - w * 0.14, bot], 'rgba(255,255,255,.14)'); poly(c, [x0 + w * 0.42, y0, x0 + w * 0.5, y0, x0 + w * 0.28, bot, x0 + w * 0.2, bot], 'rgba(255,255,255,.08)')
      c.restore()
      c.beginPath(); c.roundRect(x0, y0, w, h, 10); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.35)'; c.stroke()
      // A rider close behind on this mirror's side lights its rim in their colour.
      if (close && me.z - close.z < 1100 && (close.x - me.x) * side > -0.12) { c.beginPath(); c.roundRect(x0 - 1.5, y0 - 1.5, w + 3, h + 3, 11); c.lineWidth = 3; c.strokeStyle = css(P.rs[close.i], 0.72 + 0.28 * Math.sin(time * 14)); c.stroke() }
    }
  }
  // Drawn at full resolution on top, so labels stay crisp in the pixel style.
  function overlay(c, view) {
    for (const g of tags) {
      c.font = '7px "Press Start 2P",monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'
      const av = hasAv(g.r.i), tw = c.measureText(g.r.name).width + 10 + (av ? 15 : 0)
      rr(c, g.x - tw / 2, g.y - (av ? 9 : 7), tw, av ? 18 : 14, 5, P.seat[g.r.i].main); poly(c, [g.x - 4, g.y + 8.5, g.x + 4, g.y + 8.5, g.x, g.y + 13], P.seat[g.r.i].main)
      if (av) { rr(c, g.x - tw / 2 + 2, g.y - 7, 14, 14, 3, css(P.t.card, 0.9)); c.imageSmoothingEnabled = false; c.drawImage(AVS[g.r.i].bust.lit, g.x - tw / 2 + 2, g.y - 7, 14, 14); c.imageSmoothingEnabled = true }
      c.fillStyle = P.dark ? P.ink : '#fff'; c.fillText(g.r.name, g.x + (av ? 7.5 : 0), g.y + 1)
    }
    if (view !== 0) return
    drawMirrors(c, performance.now() / 1000)
    const cam = riders[0], sp = cam.speed / MAXSPD
    const fast = sp > 0.86 ? (sp - 0.86) * 6 : 0, wind = cam.draft > 0.5 ? 1 : 0
    if (Math.random() < fast + wind * 0.8) { const a = Math.random() * 6.28, d = 150 + Math.random() * 60; parts.push({ k: 'line', x: W / 2 + Math.cos(a) * d, y: HORIZ + 60 + Math.sin(a) * d * 0.9, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.22, max: 0.22, warm: wind }) }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= DT; if (p.life <= 0) { parts.splice(i, 1); continue }
      p.x += p.vx * DT; p.y += p.vy * DT; const a = p.life / p.max
      if (p.k === 'line') { c.globalAlpha = a * 0.45; limb(c, [p.x, p.y, p.x - p.vx * 0.06, p.y - p.vy * 0.06], 1.6, p.warm ? P.pow : P.paper) }
      else if (p.k === 'star') { p.vy += 620 * DT; c.globalAlpha = a; c.save(); c.translate(p.x, p.y); c.rotate(p.life * 9); rr(c, -3, -3, 6, 6, 1, p.alt ? P.paper : P.pow); c.restore() }
      else if (p.k === 'pow') {
        const s = ease.outBack(Math.min(1, (1 - a) * 4)) * (1 + (1 - a) * 0.25); c.globalAlpha = Math.min(1, a * 2.5); c.save(); c.translate(p.x, p.y - (1 - a) * 18); c.rotate(p.rot); c.scale(s, s)
        c.beginPath(); for (let j = 0; j < 16; j++) { const rad = j % 2 ? 15 : 27, an = j / 16 * 6.283; c.lineTo(Math.cos(an) * rad, Math.sin(an) * rad) } c.closePath(); c.fillStyle = rg(c, 4, -5, 2, 28, 0, li(P.raw.pow, 0.6), 1, css(P.raw.pow)); c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink; c.stroke()
        c.fillStyle = P.ink; c.font = '8px "Press Start 2P",monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(p.txt, 0, 1); c.restore()
      }
      c.globalAlpha = 1
    }
  }

  // ── Sound, haptics ───────────────────────────────────────────────────────
  let AC = null, eng = null, engGain = null, muted = false
  function audioOn() {
    if (AC) { AC.resume && AC.resume(); return }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)()
      eng = AC.createOscillator(); eng.type = 'sawtooth'; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420
      engGain = AC.createGain(); engGain.gain.value = 0; eng.connect(f); f.connect(engGain); engGain.connect(AC.destination); eng.start()
    } catch (e) { AC = null }
  }
  function tone(freq, dur, type, vol, to) {
    if (!AC || muted) return
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
    g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02)
  }
  function noise(dur, vol, freq) {
    if (!AC || muted) return
    const n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol
    src.connect(f); f.connect(g); g.connect(AC.destination); src.start()
  }
  const buzz = (p) => { try { if (!muted && navigator.vibrate) navigator.vibrate(p) } catch (e) { /* no haptics here */ } }

  // ── Page wiring ──────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id)
  const cv = $('sk-canvas'), ctx = cv.getContext('2d')
  const el = { place: $('sk-place'), speed: $('sk-speed'), pips: $('sk-pips'), toast: $('sk-toast'), count: $('sk-count'), start: $('sk-start'), results: $('sk-results'), rail: $('sk-rail'), draft: $('sk-draft'), time: $('sk-time'), kl: $('sk-kl'), kr: $('sk-kr'), bo: $('sk-bo'), phone: $('sk-phone') }
  const ORD = ['1ST', '2ND', '3RD', '4TH']
  let shake = 0, hitStop = 0, toastT = 0, lastCount = 9, pixel = false, punch = 0, zoom = 1
  function setTheme(id) {
    P = PALS[id]; const t = P.t, v = (a) => a.map(Math.round).join(' '), st = el.phone.style
    for (const k of ['bg', 'card', 'text', 'dim', 'border', 'p1', 'cta', 'win', 'danger', 'deep']) st.setProperty('--' + k, v(t[k]))
    st.setProperty('--tint', P.dark ? v(mx(t.card, t.bg, 0.3)) : '255 255 255'); st.setProperty('--rim', P.dark ? v(mx(t.border, t.text, 0.4)) : '255 255 255'); st.setProperty('--rim-a', P.dark ? '.45' : '.9')
    st.setProperty('--on-accent', P.dark ? v(t.bg) : '255 255 255'); st.setProperty('--cta-deep', v(mx(t.cta, BLACK, 0.4))); st.setProperty('--bezel', P.dark ? v(mx(t.bg, t.border, 0.5)) : '31 38 25')
    for (let i = 0; i < 4; i++) el.rail.children[i + 1].style.background = P.seat[i].main
    for (const b of document.querySelectorAll('[data-theme-pick]')) b.setAttribute('aria-pressed', String(b.dataset.themePick === id))
    if (!el.results.hidden) showResults()
  }
  function toast(text, tone_) { el.toast.textContent = text; el.toast.dataset.tone = tone_ || ''; el.toast.classList.remove('show'); void el.toast.offsetWidth; el.toast.classList.add('show'); toastT = 1.3 }
  function burst(r, txt) {
    if (r._sx == null) return
    const x = r._sx, y = r._sy - 70 * (r._k || 1)
    parts.push({ k: 'pow', x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, txt, rot: (Math.random() - 0.5) * 0.5 })
    for (let i = 0; i < 9; i++) parts.push({ k: 'star', x, y, vx: (Math.random() - 0.5) * 320, vy: -80 - Math.random() * 220, life: 0.55, max: 0.55, alt: i % 2 })
  }
  function handle(ev) {
    const me = riders[0], live = phase !== 'attract'
    if (ev.t === 'go') { tone(880, 0.35, 'square', 0.07); buzz(40); el.count.textContent = 'GO!'; el.count.className = 'sk-count pop' }
    if (ev.t === 'swing' && ev.by === 0 && live) noise(0.12, 0.12, 1800)
    if (ev.t === 'hit') {
      burst(riders[ev.to], riders[ev.to].pips <= 0 ? 'OFF!' : 'POW')
      if (!live) return
      if (ev.by === 0) { hitStop = 0.07; shake = 5; punch = 0.035; tone(150, 0.14, 'square', 0.1, 60); noise(0.09, 0.16, 500); buzz(25); if (riders[ev.to].pips > 0) toast('KICKED ' + riders[ev.to].name) }
      else if (ev.to === 0) { shake = 9; punch = -0.03; tone(110, 0.2, 'sawtooth', 0.1, 50); buzz([40, 30, 40]); if (me.pips > 0) toast(riders[ev.by].name + ' KICKED YOU', 'bad') }
      else noise(0.06, 0.05, 600)
    }
    if (ev.t === 'miss' && ev.by === 0 && live) toast('WHIFF', 'dim')
    if (ev.t === 'boost' && ev.by === 0 && live) { noise(0.35, 0.14, 700); tone(180, 0.4, 'sawtooth', 0.06, 520); buzz(30) }
    if (ev.t === 'down' && live) {
      if (ev.to === 0) { shake = 14; noise(0.5, 0.22, 240); tone(220, 0.5, 'sawtooth', 0.08, 40); buzz([80, 40, 120]); toast(ev.why === 'car' ? 'WIPEOUT' : ev.why === 'over' ? 'TOO MANY KICKS · YOU FELL' : 'KNOCKED OFF BY ' + riders[ev.by].name, 'bad') }
      else if (ev.by === 0) { tone(523, 0.1, 'square', 0.07); setTimeout(() => tone(784, 0.16, 'square', 0.07), 90); toast(riders[ev.to].name + ' IS OFF THE BIKE', 'good') }
    }
    if (ev.t === 'oil' && ev.to === 0 && live) { noise(0.3, 0.1, 900); toast('OIL', 'dim'); buzz(20) }
    if (ev.t === 'up' && ev.to === 0 && live) { tone(330, 0.12, 'triangle', 0.07, 660); if (me.cu > 0) { toast('BACK ON · CATCH-UP', 'good'); setTimeout(() => tone(660, 0.14, 'square', 0.06, 990), 110) } }
    if (ev.t === 'finish' && ev.to === 0 && live) { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.07), i * 110)); buzz([30, 40, 30, 40, 90]) }
    if (ev.t === 'results' && live) showResults()
  }
  function fmt(t) { return Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0') }
  function showResults() {
    const order = standings()
    const rows = order.map((r, i) => '<li class="' + (r.i === 0 ? 'me' : '') + '"><b>' + ORD[i] + '</b>' + (hasAv(r.i) ? '<img alt="" style="background:' + P.seat[r.i].main + '" src="' + AVS[r.i].bust.lit.toDataURL() + '">' : '<i style="background:' + P.seat[r.i].main + '"></i>') + '<span>' + r.name + '</span><em>' + (r.done ? fmt(r.time) : 'STILL RIDING') + '</em><u>' + r.hits + ' KICKS · ' + r.offs + ' FALLS · +' + (3 - i) + ' PTS</u></li>').join('')
    const mine = order.indexOf(riders[0])
    el.results.innerHTML = '<div class="sk-sheet"><h4>' + (mine === 0 ? 'YOU WON THE ROAD' : 'YOU FINISHED ' + ORD[mine]) + '</h4><ol>' + rows + '</ol><button type="button" id="sk-again" class="sk-cta">RACE AGAIN</button></div>'
    el.results.hidden = false
    $('sk-again').addEventListener('click', startRace)
  }
  function startRace() { audioOn(); resetRace(false); parts.length = 0; wps.length = 0; skids.length = 0; el.start.hidden = true; el.results.hidden = true; lastCount = 9; el.count.className = 'sk-count' }
  $('sk-go').addEventListener('click', startRace)
  $('sk-mute').addEventListener('click', (e) => { muted = !muted; e.currentTarget.textContent = muted ? 'SOUND OFF' : 'SOUND ON'; e.currentTarget.setAttribute('aria-pressed', String(!muted)) })
  for (const b of document.querySelectorAll('[data-theme-pick]')) b.addEventListener('click', () => setTheme(b.dataset.themePick))
  function setTrack(id) {
    trackId = id; trackSeed = id === 'random' ? Math.floor(Math.random() * 1e9) : 20261010
    for (const o of document.querySelectorAll('[data-track-pick]')) o.setAttribute('aria-pressed', String(o.dataset.trackPick === id))
    const lab = $('sk-track'); if (lab) lab.textContent = TRACKS[id].name
    parts.length = 0; wps.length = 0; skids.length = 0
    if (phase === 'attract') resetRace(true); else startRace()
  }
  for (const b of document.querySelectorAll('[data-track-pick]')) b.addEventListener('click', () => setTrack(b.dataset.trackPick))
  for (const b of document.querySelectorAll('[data-av-pick]')) b.addEventListener('click', () => { avatarsOn = b.dataset.avPick === 'on'; for (const o of document.querySelectorAll('[data-av-pick]')) o.setAttribute('aria-pressed', String(o === b)); if (!el.results.hidden) showResults() })
  for (const b of document.querySelectorAll('[data-style-pick]')) b.addEventListener('click', () => { pixel = b.dataset.stylePick === 'pixel'; for (const o of document.querySelectorAll('[data-style-pick]')) o.setAttribute('aria-pressed', String(o === b)) })
  // Left thumb steers, right thumb kicks.
  const held = { l: false, r: false }
  const setSteer = () => { input.steer = (held.r ? 1 : 0) - (held.l ? 1 : 0) }
  function hold(id, key) {
    const b = $(id)
    const on = (e) => { e.preventDefault(); held[key] = true; setSteer(); b.classList.add('down') }
    const off = () => { held[key] = false; setSteer(); b.classList.remove('down') }
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off)
    b.addEventListener('contextmenu', (e) => e.preventDefault())
  }
  hold('sk-sl', 'l'); hold('sk-sr', 'r')
  { const b = el.bo, on = (e) => { e.preventDefault(); input.boost = true; b.classList.add('down') }, off = () => { input.boost = false; b.classList.remove('down') }
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); b.addEventListener('contextmenu', (e) => e.preventDefault()) }
  function kickBtn(b, side) { b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (phase === 'race') input.kick = side; b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 120) }); b.addEventListener('contextmenu', (e) => e.preventDefault()) }
  kickBtn(el.kl, -1); kickBtn(el.kr, 1)
  window.addEventListener('keydown', (e) => {
    if (phase === 'attract' || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return
    if (e.key === 'ArrowLeft') { held.l = true; setSteer(); e.preventDefault() }
    else if (e.key === 'ArrowRight') { held.r = true; setSteer(); e.preventDefault() }
    else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { input.boost = true; e.preventDefault() }
    else if (!e.repeat && (e.key === 'a' || e.key === 'A' || e.key === 'z' || e.key === 'Z')) input.kick = -1
    else if (!e.repeat && (e.key === 'd' || e.key === 'D' || e.key === 'x' || e.key === 'X')) input.kick = 1
  })
  window.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.boost = false; if (e.key === 'ArrowLeft') { held.l = false; setSteer() } if (e.key === 'ArrowRight') { held.r = false; setSteer() } })

  // Small live views: the four seats, and the same race in each theme.
  const off = document.createElement('canvas'); off.width = W; off.height = H; const octx = off.getContext('2d')
  const lo = document.createElement('canvas'); lo.width = W / 2; lo.height = H / 2; const lctx = lo.getContext('2d')
  const minis = []
  for (let i = 0; i < 4; i++) { const c = $('sk-seat-' + i); if (c) minis.push({ c, view: i, pal: null }) }
  for (const c of document.querySelectorAll('[data-theme-thumb]')) minis.push({ c, view: 0, pal: c.dataset.themeThumb })
  let miniTurn = 0
  function drawMini(m, time) {
    const box = m.c.getBoundingClientRect(); if (box.bottom < -200 || box.top > (window.innerHeight || 800) + 200) return false
    const keep = P; if (m.pal) P = PALS[m.pal]
    render(octx, m.view, time, false); overlay(octx, -1)
    const c = m.c.getContext('2d'); c.drawImage(off, 0, 0, m.c.width, m.c.height)
    const r = riders[m.view]
    c.font = '9px "Press Start 2P",monospace'; c.textBaseline = 'middle'; c.textAlign = 'left'
    if (!m.pal) { rr(c, 6, 6, 56, 22, 8, css(P.dark ? P.t.card : [255, 255, 255], 0.85)); c.fillStyle = P.seat[r.i].main; c.fillText(ORD[placeOf(r) - 1], 12, 18) }
    P = keep
    return true
  }

  let acc = 0, last = performance.now(), clock = 0, frozen = false
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt
    if (frozen || document.hidden) acc = 0; else if (hitStop > 0) hitStop -= dt; else acc += dt
    let n = 0
    while (acc >= DT && n++ < 5) { step(); acc -= DT; for (const ev of events) handle(ev); events.length = 0 }
    if (n >= 5) acc = 0
    const me = riders[0], sp = me.speed / MAXSPD
    skyOff += segAt(me.z).curve * sp * dt * 42
    if (!frozen && !document.hidden && hitStop <= 0) stepEffects(dt)
    // Camera: trails the bike a little, rolls into corners, breathes with speed and punches on a hit.
    camSm = lerp(camSm, me.x, 1 - Math.exp(-9 * dt)); if (Math.abs(camSm - me.x) > 0.5) camSm = me.x
    punch *= Math.exp(-7 * dt); zoom = lerp(zoom, 1.045 + (me.boosting ? 0.06 : me.draft > 0.5 || me.cu > 0 ? 0.035 : 0) + sp * 0.015, 1 - Math.exp(-4 * dt))
    const roll = -(me.lean * 0.028 + me.rec * 0.05) * (reduced ? 0 : 1), zz = zoom + punch, jit = reduced ? 0 : Math.sin(clock * 47) * 0.5 * sp
    ctx.save()
    if (shake > 0.3) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= Math.exp(-9 * dt) }
    ctx.save(); ctx.translate(W / 2, H * 0.66 + jit); ctx.rotate(roll); ctx.scale(zz, zz); ctx.translate(-W / 2, -H * 0.66)
    if (pixel) { lctx.setTransform(0.5, 0, 0, 0.5, 0, 0); render(lctx, 0, clock, true); ctx.imageSmoothingEnabled = false; ctx.drawImage(lo, 0, 0, W, H) }
    else render(ctx, 0, clock, true)
    ctx.restore()
    for (const g of tags) { const dx0 = g.x - W / 2, dy0 = g.y - H * 0.66, cs = Math.cos(roll), sn = Math.sin(roll); g.x = W / 2 + (dx0 * cs - dy0 * sn) * zz; g.y = H * 0.66 + jit + (dx0 * sn + dy0 * cs) * zz }
    for (const r of riders) if (r._sx != null && !r._adj) { /* burst positions are approximate under the camera transform */ }
    overlay(ctx, 0)
    ctx.restore()
    // HUD
    const pl = placeOf(me)
    el.place.firstChild.textContent = ORD[pl - 1]
    el.speed.firstChild.textContent = String(Math.round(sp * 190)).padStart(3, '0')
    el.time.textContent = fmt(raceT)
    const pips = el.pips.children; for (let i = 0; i < PIPS; i++) pips[i].className = i < me.pips && me.state !== 'down' ? 'on' : ''
    el.pips.classList.toggle('hurt', me.pips < PIPS || me.state === 'down')
    const cu = me.cu > 0 && me.state === 'ride'
    el.draft.textContent = me.boosting ? 'BOOST +18%' : cu ? 'CATCH-UP +14%' : 'SLIPSTREAM +10%'; el.draft.classList.toggle('show', (me.boosting || cu || me.draft > 0.5) && phase === 'race')
    el.bo.style.setProperty('--fill', me.boost.toFixed(3)); el.bo.classList.toggle('ready', me.boost >= 0.15 && !me.boosting); el.bo.classList.toggle('burn', me.boosting)
    const st = Math.min(1, me.strain).toFixed(3); el.kl.style.setProperty('--strain', st); el.kr.style.setProperty('--strain', st); el.kl.classList.toggle('risk', me.strain > 0.6); el.kr.classList.toggle('risk', me.strain > 0.6)
    for (const r of riders) { const d = el.rail.children[r.i + 1]; d.style.transform = 'translateX(' + (clamp(r.z / FINISH, 0, 1) * (el.rail.clientWidth - 12)) + 'px)' }
    el.kl.classList.toggle('cool', me.cd > 0); el.kr.classList.toggle('cool', me.cd > 0)
    if (phase === 'count') { const k = Math.ceil(countT - 0.2); if (k !== lastCount && k >= 1 && k <= 3) { lastCount = k; el.count.textContent = String(k); el.count.className = 'sk-count'; void el.count.offsetWidth; el.count.className = 'sk-count pop'; tone(440, 0.14, 'square', 0.06) } }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('show') }
    if (AC && engGain) { const live = phase === 'race' || phase === 'finishing' || phase === 'count'; engGain.gain.value = muted || !live ? 0 : 0.018 + sp * 0.02; eng.frequency.value = 48 + sp * 115 + (me.boosting ? 30 : 0) + (me.stag > 0 ? Math.sin(clock * 40) * 12 : 0) }
    if (minis.length && Math.floor(clock * 20) !== Math.floor((clock - dt) * 20)) { for (let i = 0; i < minis.length; i++) { miniTurn = (miniTurn + 1) % minis.length; if (drawMini(minis[miniTurn], clock)) break } }
    requestAnimationFrame(loop)
  }
  resetRace(true); setTheme('glass')
  window.__sk = { get riders() { return riders }, get phase() { return phase }, input, start: startRace, setTheme, setTrack, get track() { return trackId + ' ' + segs.length + ' segs ' + cars.length + ' cars' }, get finish() { return FINISH }, set frozen(v) { frozen = v }, set pixel(v) { pixel = v }, set avatars(v) { avatarsOn = v }, get avatarCount() { return AVS.length } }
  requestAnimationFrame(loop)
})()
