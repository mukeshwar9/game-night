// Pure helpers for the HOW TO PLAY step carousel (RuleMedia.jsx). The stills
// and src/lib/ruleMedia.json come from `npm run rules:media`; captions are
// stored as indexes into src/lib/rules.js so they cannot drift from the rules.
import manifest from './ruleMedia.json'

// How long each step shows while autoplay runs.
export const STEP_MS = 3500

export function getRuleMedia(type) {
  return manifest.types[type] ?? null
}

// cap: an index into rules.howToPlay, or 'objective' / 'win'.
export function stepCaption(rules, cap) {
  if (!rules) return ''
  if (cap === 'win') return rules.win
  if (cap === 'objective') return rules.objective
  return rules.howToPlay[cap] ?? ''
}

// Wrapping step index: dir is +1 or -1.
export function stepIndex(i, count, dir) {
  return (((i + dir) % count) + count) % count
}

// Stills are captured in a light and a dark look; pick the one nearer the
// active theme from its --c-bg channels ("r g b"). Unreadable → dark.
export function lookFor(bgChannels) {
  const [r, g, b] = String(bgChannels ?? '').trim().split(/\s+/).map(Number)
  if ([r, g, b].some(v => !Number.isFinite(v))) return 'dark'
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? 'light' : 'dark'
}

export function stillPath(type, look, n) {
  return `rule-media/${type}/${look}/step${n}.png`
}
