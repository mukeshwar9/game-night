// Pure helpers for auditing theme color contrast/separability. No DOM, no
// Firebase, no React — parses the --c-* custom-property triplets straight
// out of src/index.css's raw text so the regression test (themeContrast.
// test.js) can check WCAG contrast + hue/saturation separability without a
// browser. See .claude/rules/theming-rules.md for the --c-* convention.

const ROOT_BLOCK_RE = /:root\s*\{([^{}]*)\}/g
const THEME_BLOCK_RE = /\[data-theme="([\w-]+)"\]\s*\{([^{}]*)\}/g
const VAR_RE = /--c-([\w-]+)\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g

function stripComments(cssText) {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '')
}

function extractVars(blockText) {
  const out = {}
  VAR_RE.lastIndex = 0
  let m
  while ((m = VAR_RE.exec(blockText))) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  }
  return out
}

/**
 * Parse src/index.css text into { [themeId]: { [key]: [r,g,b] } }.
 * The default theme (midnight) lives in every `:root { ... }` block found in
 * the file (only the `@layer base { :root { ... } } ` one actually declares
 * --c-* vars; the others — cursor vars, --app-header-h — are ignored because
 * they don't match VAR_RE). Every other theme is a `[data-theme="id"] { ... }`
 * block, parsed independently (no inheritance) so a theme that forgets to
 * redefine a key shows up as missing here, even though the CSS cascade would
 * silently fall back to midnight's value in the browser.
 */
export function parseThemes(cssText) {
  const clean = stripComments(cssText)
  const themes = {}

  let rootVars = {}
  ROOT_BLOCK_RE.lastIndex = 0
  let rm
  while ((rm = ROOT_BLOCK_RE.exec(clean))) {
    rootVars = { ...rootVars, ...extractVars(rm[1]) }
  }
  themes.midnight = rootVars

  THEME_BLOCK_RE.lastIndex = 0
  let tm
  while ((tm = THEME_BLOCK_RE.exec(clean))) {
    const [, id, body] = tm
    themes[id] = extractVars(body)
  }

  return themes
}

function srgbToLinear(c) {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function relativeLuminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** WCAG contrast ratio between two [r,g,b] colors (0-255 channels). */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

function saturation([r, g, b]) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function hue([r, g, b]) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  if (d === 0) return 0
  let h
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  if (h < 0) h += 360
  return h
}

/**
 * Circular hue distance in degrees. Returns null (achromatic — hue is
 * undefined/noisy) if either color's saturation is below 0.08.
 */
export function hueGap(a, b) {
  if (saturation(a) < 0.08 || saturation(b) < 0.08) return null
  const diff = Math.abs(hue(a) - hue(b))
  return diff > 180 ? 360 - diff : diff
}

/** Absolute difference of (max-min)/max "saturation" between two colors. */
export function saturationGap(a, b) {
  return Math.abs(saturation(a) - saturation(b))
}
