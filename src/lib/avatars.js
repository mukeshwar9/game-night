// Retro pixel-art avatar registry. Composite format: '{shape}.{tone}' (e.g. 'ghost.p2').
// Bare legacy keys ('ghost') stay valid forever — parseAvatar resolves them to their
// classic tone. Keep SHAPES in sync with GLYPHS in src/components/Avatar.jsx.

export const SHAPES = [
  'invader', 'robot', 'ghost', 'alien', 'skull', 'cat', 'ufo', 'wizard',
  'ninja', 'crown', 'dino', 'heart',
  'frog', 'star', 'mushroom', 'bolt', 'moon', 'fish', 'sword', 'slime',
]

export const TONES = ['p1', 'p2', 'cta', 'win', 'text', 'dim']

// Legacy classic tones — copied verbatim from Avatar.jsx TONE map, stripped of '--c-'.
// Pins rendering of bare keys so legacy users never shift color.
export const CLASSIC_TONES = {
  invader: 'win', robot: 'p1', ghost: 'text', alien: 'win', skull: 'text', cat: 'p2',
  ufo: 'cta', wizard: 'p1', ninja: 'text', crown: 'cta', dino: 'win', heart: 'p2',
  frog: 'win', star: 'cta', mushroom: 'p2', bolt: 'cta', moon: 'text', fish: 'p1', sword: 'dim', slime: 'win',
}

export function makeAvatar(shape, tone) { return `${shape}.${tone}` }

// Total function: any input → renderable { shape, tone }. Never throws or returns null.
// Bare legacy key → classic tone. Unknown shape → invader. Unknown tone → shape's classic tone.
export function parseAvatar(id) {
  if (typeof id !== 'string' || !id) return { shape: 'invader', tone: CLASSIC_TONES.invader }
  const dot = id.indexOf('.')
  if (dot === -1) {
    const shape = SHAPES.includes(id) ? id : 'invader'
    return { shape, tone: CLASSIC_TONES[shape] }
  }
  const rawShape = id.slice(0, dot)
  const rawTone = id.slice(dot + 1)
  const shape = SHAPES.includes(rawShape) ? rawShape : 'invader'
  const tone = TONES.includes(rawTone) ? rawTone : CLASSIC_TONES[shape]
  return { shape, tone }
}

export function canonicalAvatar(id) {
  const { shape, tone } = parseAvatar(id)
  return makeAvatar(shape, tone)
}

export function isValidAvatar(key) {
  if (typeof key !== 'string' || !key) return false
  const dot = key.indexOf('.')
  if (dot === -1) return SHAPES.includes(key)
  const shape = key.slice(0, dot)
  const tone = key.slice(dot + 1)
  return SHAPES.includes(shape) && TONES.includes(tone)
}

// Deterministic default so brand-new guests don't all look identical. Stable for
// a given id (uid). Derives both shape and tone for 120 distinct defaults, always composite.
export function defaultAvatarForId(id) {
  const s = String(id || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  const shape = SHAPES[h % SHAPES.length]
  const tone = TONES[Math.floor(h / SHAPES.length) % TONES.length]
  return makeAvatar(shape, tone)
}
