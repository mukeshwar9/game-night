// @ts-check
// Pure logic for the GLASS theme (LIQUID material): which engines can draw the
// lens, the displacement map each element's lens is built from, the low-end
// step-down ladder and the highlight position. No DOM, no Firebase, no React:
// glassLens.js, useGlassLens.js and GlassBackdrop.jsx wire it up.
//
// Design record: the "Round 2 update" of the games-glass-theme report. Glass
// goes on chrome only (bars, sheets, dock, HUD pills, tiles); boards, pieces,
// rules text and real-time arenas stay solid.

/** The two GLASS variants. A theme id outside this list never gets glass. */
export const GLASS_THEME_IDS = ['glass', 'glass-night']

/** @param {string | null | undefined} id */
export function isGlassTheme(id) {
  return typeof id === 'string' && GLASS_THEME_IDS.includes(id)
}

/**
 * Tint opacity per surface (index.css --g-alpha / --g-alpha-text /
 * --g-alpha-sheet) and the art caps the contrast table assumes. contrast.test.js
 * reads the real values from the tokens; these are the documented design values
 * it must agree with.
 */
export const GLASS_DESIGN = {
  light: { alpha: { icon: 0.16, text: 0.3, sheet: 0.5 }, artStrength: 1, glyphOpacity: 0.7 },
  dark: { alpha: { icon: 0.24, text: 0.38, sheet: 0.58 }, artStrength: 0.5, glyphOpacity: 0.5 },
}

/** Chromium major from which a lens is drawn (the Android WebView floor). */
export const MIN_LENS_CHROMIUM = 111

/**
 * True on a Blink engine that draws `backdrop-filter: url(#svg-filter)`: Chrome,
 * Edge, Brave and the Android WebView. Safari, every iOS browser (all WebKit,
 * whatever their name) and Firefox parse the url() and then draw nothing, which
 * takes the blur away with it, so the lens must be gated by this and never left
 * to `@supports`.
 * @param {{ userAgent?: string, brands?: { brand: string }[], platform?: string, maxTouchPoints?: number }} env
 */
export function isBlinkEngine({ userAgent = '', brands, platform = '', maxTouchPoints = 0 } = {}) {
  // Every iOS / iPadOS browser is WebKit underneath. iPadOS reports as a Mac, so
  // a touch screen on "MacIntel" is an iPad.
  if (/iPhone|iPad|iPod/.test(userAgent)) return false
  if (platform === 'MacIntel' && maxTouchPoints > 1) return false
  if (/Firefox\/|FxiOS|Gecko\/\d+ Firefox/.test(userAgent)) return false
  const chromium = brands?.some(b => /^Chromium$/i.test(b.brand))
  const match = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent)
  if (!chromium && !match) return false
  const major = match ? Number(match[1]) : MIN_LENS_CHROMIUM
  return major >= MIN_LENS_CHROMIUM
}

/** The ladder the low-end Android probe climbs: art drifts, art still, lens off. */
export const STEP = { FULL: 0, STILL_ART: 1, CLEAR: 2 }

/**
 * Phones that cannot afford a re-blurred, re-lensed backdrop every frame: Android
 * with 3 GB of memory or less, or 4 cores or fewer. Desktop and iOS never step
 * down (iOS gets no lens at all).
 * @param {{ android?: boolean, deviceMemory?: number, hardwareConcurrency?: number }} env
 */
export function isLowEndAndroid({ android = false, deviceMemory, hardwareConcurrency } = {}) {
  if (!android) return false
  return (deviceMemory ?? Infinity) <= 3 || (hardwareConcurrency ?? Infinity) <= 4
}

/**
 * Where the ladder starts: a low-end phone begins with the art frozen, anything
 * else at full. A step the probe learned on an earlier launch wins over both,
 * but only ever downward, so a fixed phone is not locked out of the lens.
 * @param {{ lowEnd: boolean, saved?: number | null }} args
 */
export function initialStep({ lowEnd, saved = null }) {
  const base = lowEnd ? STEP.STILL_ART : STEP.FULL
  const learned = Number.isInteger(saved) ? /** @type {number} */ (saved) : base
  return Math.min(STEP.CLEAR, Math.max(base, learned))
}

// A frame over this many ms misses 60 fps by enough to feel; a probe window
// where this share of frames miss it is janky.
const JANK_FRAME_MS = 24
const JANK_SHARE = 0.25
const MIN_SAMPLES = 30
// A gap this long is a hidden tab or a screen lock, not a slow frame.
const PAUSE_MS = 250

/**
 * Whether a probe window of frame times (ms between animation frames) shows
 * dropped frames. Too few samples, or gaps from a hidden tab, never count.
 * @param {number[]} frameTimes
 */
export function isJanky(frameTimes) {
  const frames = frameTimes.filter(t => t > 0 && t < PAUSE_MS)
  if (frames.length < MIN_SAMPLES) return false
  const slow = frames.filter(t => t > JANK_FRAME_MS).length
  return slow / frames.length >= JANK_SHARE
}

/**
 * The next step after a probe window: one rung down when the window was janky,
 * otherwise where it is. The ladder ends at CLEAR (no lens, art still).
 * @param {number} step
 * @param {number[]} frameTimes
 */
export function nextStep(step, frameTimes) {
  if (step >= STEP.CLEAR) return STEP.CLEAR
  return isJanky(frameTimes) ? step + 1 : step
}

/**
 * Whether elements get the lens or clear glass (rim, highlight, frost only).
 * The lens needs a Blink engine, a GLASS theme, no reduced transparency and a
 * step the probe has not taken away.
 * @param {{ blink: boolean, glassTheme: boolean, reducedTransparency: boolean, step: number }} env
 * @returns {'lens' | 'clear'}
 */
export function glassMode({ blink, glassTheme, reducedTransparency, step }) {
  if (!blink || !glassTheme || reducedTransparency) return 'clear'
  return step >= STEP.CLEAR ? 'clear' : 'lens'
}

// ── Displacement maps ────────────────────────────────────────────────────────

const MIN_SIDE = 8
/**
 * The largest side a lens is built for. A bigger element keeps clear glass: the
 * filter region must cover the element, and the map is a pixel loop per shape.
 */
export const MAX_LENS_SIDE = 1200

/**
 * Lens geometry for an element: whole pixels, the corner radius clamped to what
 * fits, and the bezel (how far in from the rim the pane "curves") and
 * displacement scale chosen from the smaller side so a pill and a sheet both
 * read as glass. The key identifies the filter in the cache.
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 */
export function lensGeometry(width, height, radius) {
  const w = Math.min(MAX_LENS_SIDE, Math.max(MIN_SIDE, Math.round(width)))
  const h = Math.min(MAX_LENS_SIDE, Math.max(MIN_SIDE, Math.round(height)))
  const r = Math.max(0, Math.min(Math.round(radius) || 0, Math.floor(Math.min(w, h) / 2)))
  const short = Math.min(w, h)
  return {
    w,
    h,
    r,
    bezel: Math.max(6, Math.min(22, short * 0.42)),
    scale: Math.round(Math.max(10, Math.min(56, short * 0.85))),
    key: `${w}x${h}r${r}`,
  }
}

/**
 * The displacement map for a rounded rectangle, RGBA row by row (the R and G
 * channels carry the x and y offset around 128, as feDisplacementMap reads
 * them). Pixels inside the bezel are pushed along the rim's normal by a
 * circular profile, so the art behind bends at the edge like a thick pane and
 * the middle stays flat. Computed from a signed distance field of the rounded
 * rectangle.
 * @param {{ w: number, h: number, r: number, bezel: number }} geo from lensGeometry
 * @returns {Uint8ClampedArray}
 */
export function displacementMap({ w, h, r, bezel }) {
  const data = new Uint8ClampedArray(w * h * 4)
  const hx = w / 2
  const hy = h / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hx
      const py = y + 0.5 - hy
      const qx = Math.abs(px) - (hx - r)
      const qy = Math.abs(py) - (hy - r)
      let nx
      let ny
      let sdf
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy)
        sdf = len - r
        nx = qx / len
        ny = qy / len
      } else if (qx > qy) {
        sdf = qx - r
        nx = 1
        ny = 0
      } else {
        sdf = qy - r
        nx = 0
        ny = 1
      }
      nx *= Math.sign(px) || 1
      ny *= Math.sign(py) || 1
      const depth = -sdf
      let m = 0
      if (depth < bezel) {
        const t = 1 - Math.max(0, depth) / bezel
        m = 1 - Math.sqrt(1 - t * t)
      }
      const i = (y * w + x) * 4
      data[i] = 128 - nx * m * 127
      data[i + 1] = 128 - ny * m * 127
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }
  return data
}

// ── Highlight ────────────────────────────────────────────────────────────────

const clampPct = (/** @type {number} */ v) => Math.round(Math.max(-30, Math.min(130, v)))

/**
 * Where the specular sheen sits (percent of the element, written to --mx/--my)
 * for a pointer at (x, y) in a viewport of the given size. The light is held a
 * little above the pointer, as the prototype does, so the sheen reads as coming
 * from overhead.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
export function highlightFromPointer(x, y, width, height) {
  if (!(width > 0) || !(height > 0)) return { mx: 22, my: -10 }
  return { mx: clampPct((x / width) * 100), my: clampPct((y / height) * 100 - 30) }
}

/**
 * The same sheen steered by device tilt: gamma (left-right, -90..90) and beta
 * (front-back, about 30-60 when held) in degrees. A phone held level puts the
 * light at its resting spot; tilting walks it across the glass.
 * @param {number} beta
 * @param {number} gamma
 */
export function highlightFromTilt(beta, gamma) {
  const g = Math.max(-45, Math.min(45, Number(gamma) || 0))
  const b = Math.max(-45, Math.min(45, (Number(beta) || 45) - 45))
  return { mx: clampPct(50 + (g / 45) * 60), my: clampPct(-10 + (b / 45) * 45) }
}

// ── Art ──────────────────────────────────────────────────────────────────────

/** The arcade glyphs scattered over the backdrop (drawn as SVG in GlassBackdrop). */
export const GLYPH_KINDS = ['x', 'o', 'up', 'right', 'dot', 'hash', 'diamond', 'down']

// Colour tokens a glyph draws from: the four art fields and both player accents.
export const GLYPH_TONES = ['--c-art-1', '--c-art-2', '--c-art-3', '--c-art-4', '--c-p1', '--c-p2']

/**
 * A seeded scatter of glyphs for a viewport: the same seed and size always give
 * the same art, so it does not reshuffle on a re-render. Positions are pixels in
 * the viewport. The sharp edges matter, because the lens only shows where an
 * edge is bent; soft gradients alone would make it invisible.
 * @param {number} seed
 * @param {number} width
 * @param {number} height
 * @returns {{ kind: string, tone: string, x: number, y: number, size: number, rotate: number }[]}
 */
export function glassGlyphs(seed, width, height) {
  const count = Math.min(140, Math.round((width * height) / 5200))
  let s = seed >>> 0
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const out = []
  for (let i = 0; i < count; i++) {
    const a = rand()
    const b = rand()
    const c = rand()
    out.push({
      kind: GLYPH_KINDS[(i * 7 + Math.floor(c * GLYPH_KINDS.length)) % GLYPH_KINDS.length],
      tone: GLYPH_TONES[i % GLYPH_TONES.length],
      x: Math.round(a * width),
      y: Math.round(b * (height * 1.08) - height * 0.04),
      size: 14 + Math.round(c * 30),
      rotate: Math.round((c - 0.5) * 30),
    })
  }
  return out
}
