// Colours for SIDE KICK's road scene, derived from the selected theme's --c-*
// tokens (.claude/rules/theming-rules.md). Nothing in the scene is a literal
// colour: sky, ground, tarmac, kerbs, foliage, paint and lights are tokens or
// mixes of two tokens, so a new theme needs no game change. Which token plays
// sky, ground and leaf is picked by hue, so every theme gets a sensible road
// without a per-theme table. Pure: [r, g, b] triplets in, CSS strings out.

import { brightness, hueOf } from './fenderPalette'
import { contrastRatio } from './themeContrast'

/** Tokens the scene reads. `art-1` and `art-4` are optional (some themes have none). */
export const SK_TOKENS = ['bg', 'card', 'text', 'dim', 'border', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger', 'deep', 'structure', 'tint-cta']
export const SK_OPTIONAL_TOKENS = ['art-1', 'art-4']

export const BLACK = [0, 0, 0]
export const WHITE = [255, 255, 255]
const lerp = (a, b, t) => a + (b - a) * t
/** Blend `a` toward `b` by `t`; keeps fractions (the scene mixes many times). */
export const mx = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
/** `rgb()` / `rgba()` string for a triplet. */
export const css = (a, al) => (al == null
  ? `rgb(${Math.round(a[0])},${Math.round(a[1])},${Math.round(a[2])})`
  : `rgba(${Math.round(a[0])},${Math.round(a[1])},${Math.round(a[2])},${al})`)

/** The candidate whose hue is nearest `hue` (within `within` degrees), else null. */
function nearestHue(cands, hue, within) {
  let best = null
  let bd = 1e9
  for (const c of cands) {
    if (!c) continue
    const h = hueOf(c)
    if (h < 0) continue
    const d = Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue))
    if (d < bd) { bd = d; best = c }
  }
  return best && bd <= within ? best : null
}

/**
 * The Western raw colours (DUST KICK), all mixes of the theme's tokens: warm sand verges, a trail darker
 * than the verges so gold hay never sits on gold sand, red rock, sage and weathered wood. The three
 * looks differ in the sky only: a dusk canyon, a clear prairie and a golden-hour town.
 * @returns {Record<string, number[]>}
 */
function dustRaw(t, dark, look, SKY) {
  const sand = dark ? mx(t.cta, t.bg, 0.6) : mx(t.cta, t.card, 0.62)
  const trail = dark ? mx(t.bg, sand, 0.18) : mx(t.text, sand, 0.58)
  const rock = dark ? mx(t.danger, t.bg, 0.5) : mx(t.danger, sand, 0.5)
  const wood = dark ? mx(t.structure, t.cta, 0.4) : mx(t.text, t.cta, 0.5)
  const sage = dark ? mx(t.win, t.bg, 0.45) : mx(t.win, sand, 0.4)
  const sky = dark
    ? { sky0: t.bg, sky1: mx(mx(t.bg, t.p2, 0.3), t.danger, 0.25) }
    : look === 'canyon' ? { sky0: mx(t.p2, t.card, 0.35), sky1: mx(t.danger, t.cta, 0.5) }
      : look === 'town' ? { sky0: mx(SKY, t.cta, 0.2), sky1: mx(t.cta, t.card, 0.82) }
        : { sky0: mx(SKY, t.text, 0.06), sky1: mx(SKY, t.card, 0.78) }
  return {
    ...sky,
    mount: mx(rock, sky.sky1, dark ? 0.55 : 0.4), hillFar: mx(rock, sky.sky1, 0.55), hillNear: mx(sand, rock, 0.3),
    grassA: sand, grassB: mx(sand, t.text, dark ? 0.1 : 0.06), dirt: mx(sand, t.text, 0.12),
    roadA: trail, roadB: mx(trail, sand, 0.1), kerbA: mx(trail, t.text, 0.22), kerbB: mx(trail, sand, 0.3),
    lane: trail, center: mx(trail, sand, 0.1), edge: mx(trail, sand, 0.3),
    fog: mx(sky.sky1, sand, 0.3),
    leaf0: mx(sage, t.text, 0.2), leaf1: sage, leaf2: mx(sage, t.card, 0.25), aut0: mx(sand, rock, 0.3), aut1: mx(sand, rock, 0.15), aut2: sand,
    trunk: wood, post: mx(wood, sand, 0.2), house: mx(wood, sand, 0.35), roof: mx(wood, t.danger, 0.3),
    hay: dark ? mx(t.cta, t.text, 0.4) : mx(t.cta, t.card, 0.14), hayDark: mx(t.cta, t.text, 0.4), rope: mx(sand, t.text, 0.1), wood, rockC: rock, rockDark: mx(rock, t.text, 0.35), cactus: sage, mesa: rock, mesaDark: mx(rock, t.text, 0.3),
    coat: mx(wood, sand, 0.1), mane: mx(wood, t.text, 0.5), hat: mx(wood, t.text, 0.4), flower: t.p3,
    sun0: dark ? t.cta : mx(t.cta, t.card, 0.4), sun1: dark ? t.danger : mx(t.danger, t.cta, 0.5),
  }
}

/**
 * @param {Record<string, number[]>} T  token name → [r, g, b], see SK_TOKENS
 * @param {{ dust?: boolean, look?: string }} [opts]  `dust` swaps the road for DUST KICK's trail in `look` (canyon, prairie, town)
 */
export function buildPalette(T, opts = {}) {
  const t = { ...T, tintCta: T['tint-cta'] || mx(T.card, T.cta, 0.2), art1: T['art-1'] || null, art4: T['art-4'] || null }
  const dark = brightness(t.bg) < 0.4
  const ps = [t.p1, t.p2, t.p3, t.p4]
  const accents = [t.p1, t.p2, t.p3, t.p4, t.cta, t.win]
  // Light themes need a sky, a ground and a leaf colour: the bluest and the greenest of their accents.
  const skyBase = t.art4 || nearestHue(accents, 205, 60) || t.structure
  const groundBase = t.art1 || nearestHue(accents, 110, 60) || t.deep
  const leafBase = nearestHue([t.win, t.p1, t.p2, t.p3, t.p4], 125, 70) || groundBase
  const SKY = dark ? null : mx(skyBase, t.card, skyBase === t.structure ? 0.15 : 0)
  const GROUND = dark ? null : groundBase
  const LEAF = dark ? t.p1 : leafBase
  const raw = dark ? {
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
  if (opts.dust) Object.assign(raw, dustRaw(t, dark, opts.look, SKY))
  const P = {
    dark, t, raw, rs: ps,
    sunC: dark ? mx(t.cta, t.text, 0.5) : mx(t.card, t.tintCta, 0.5),
    dkC: dark ? BLACK : mx(t.text, SKY, 0.25),
  }
  if (!opts.dust) raw.dirt = dark ? mx(t.deep, t.structure, 0.35) : mx(mx(t.cta, t.text, 0.3), GROUND, 0.55)
  for (const k of Object.keys(raw)) P[k] = css(raw[k])
  P.seat = ps.map((p) => ({
    main: css(p),
    dark: css(mx(p, dark ? t.bg : t.text, dark ? 0.5 : 0.36)),
    lite: css(mx(p, dark ? t.text : t.card, 0.55)),
    beam: css(p, 0.07),
  }))
  // Text on a seat-coloured tag: whichever of the paper and the ink reads better.
  P.tagText = ps.map((p) => (contrastRatio(p, WHITE) >= contrastRatio(p, raw.ink) ? css(WHITE) : css(raw.ink)))
  const carSet = dark
    ? [mx(t.p3, t.bg, 0.5), mx(t.p4, t.bg, 0.45), mx(t.p2, t.bg, 0.5), t.structure, mx(t.p1, t.bg, 0.55), t.border]
    : [t.structure, mx(t.cta, t.card, 0.45), mx(t.p4, t.card, 0.5), t.card, mx(t.p2, t.card, 0.5), mx(t.danger, t.card, 0.45)]
  P.rc = carSet
  P.cars = carSet.map((c) => css(c))
  P.shade = dark ? 'rgba(0,0,0,.3)' : css(t.text, 0.16)
  P.gloss = dark ? css(t.text, 0.16) : 'rgba(255,255,255,.4)'
  P.sheen = dark ? css(t.text, 0.08) : 'rgba(255,255,255,.12)'
  P.shadow = dark ? 'rgba(0,0,0,.5)' : css(t.text, 0.26)
  // Haze is baked into the road colours (no overlay, so no seams).
  P.fogTab = {}
  for (const k of ['dirt', 'grassA', 'grassB', 'roadA', 'roadB', 'kerbA', 'kerbB', 'lane', 'center', 'edge']) {
    P.fogTab[k] = []
    for (let q = 0; q <= 24; q++) P.fogTab[k].push(css(mx(raw[k], raw.fog, q / 24)))
  }
  return P
}

/** Read the tokens off `el` (the document root by default). Browser only. */
export function readSideKickTokens(el = document.documentElement) {
  const cs = getComputedStyle(el)
  const T = {}
  for (const k of [...SK_TOKENS, ...SK_OPTIONAL_TOKENS]) {
    const v = cs.getPropertyValue(`--c-${k}`).trim().split(/\s+/).map(Number)
    if (v.length === 3 && v.every(Number.isFinite)) T[k] = v
    else if (SK_TOKENS.includes(k)) T[k] = [128, 128, 128]
  }
  return T
}
