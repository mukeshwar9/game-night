// Retro pixel-art avatar registry. Composite format: '{shape}.{tone}' (e.g. 'ghost.p2').
// Bare legacy keys ('ghost') stay valid forever — parseAvatar resolves them to their
// classic tone. Keep SHAPES in sync with GLYPHS in src/components/Avatar.jsx.
//
// Humanoid avatars ('boy', 'girl') use a dash-joined 4-tone tuple in the tone slot
// instead of a single tone: '{shape}.{cap}-{shirt}-{pants}-{shoes}', e.g. 'girl.cta-p2-dim-text'.
// The single-dot invariant is preserved. A humanoid with a plain single tone (e.g.
// 'boy.p1') is also valid and expands to a derived outfit via outfitFromTone — every
// helper here stays total.

export const SHAPES = [
  'invader', 'robot', 'ghost', 'alien', 'skull', 'cat', 'ufo', 'wizard',
  'ninja', 'crown', 'dino', 'heart',
  'frog', 'star', 'mushroom', 'bolt', 'moon', 'fish', 'sword', 'slime',
  'boy', 'girl',
]

export const TONES = ['p1', 'p2', 'cta', 'win', 'text', 'dim']

// Legacy classic tones — copied verbatim from Avatar.jsx TONE map, stripped of '--c-'.
// Pins rendering of bare keys so legacy users never shift color.
export const CLASSIC_TONES = {
  invader: 'win', robot: 'p1', ghost: 'text', alien: 'win', skull: 'text', cat: 'p2',
  ufo: 'cta', wizard: 'p1', ninja: 'text', crown: 'cta', dino: 'win', heart: 'p2',
  frog: 'win', star: 'cta', mushroom: 'p2', bolt: 'cta', moon: 'text', fish: 'p1', sword: 'dim', slime: 'win',
  boy: 'p1', girl: 'p2',
}

// Humanoid avatars — the only shapes offered by the picker (creature shapes above
// stay fully renderable/valid for anyone who already saved one). Re-enabling
// creatures in the picker later = point PICKER_SHAPES back at SHAPES.
export const HUMANOIDS = ['boy', 'girl']
export const PARTS = ['cap', 'shirt', 'pants', 'shoes']
export const PICKER_SHAPES = HUMANOIDS

export function isHumanoid(shape) {
  return HUMANOIDS.includes(shape)
}

export function makeAvatar(shape, tone) { return `${shape}.${tone}` }

// Builds a humanoid composite id from a { cap, shirt, pants, shoes } part map.
export function makeHumanoid(shape, parts) {
  return `${shape}.${parts.cap}-${parts.shirt}-${parts.pants}-${parts.shoes}`
}

// Deterministic, pleasant default outfit derived from a single tone — used when a
// humanoid avatar is stored/typed with only one tone (e.g. 'boy.p1').
export function outfitFromTone(tone) {
  return { cap: tone, shirt: tone, pants: 'dim', shoes: 'text' }
}

// Total function: any input → renderable { shape, tone } (humanoids also get `parts`).
// Never throws or returns null. Bare legacy key → classic tone. Unknown shape →
// invader. Unknown tone → shape's classic tone. Malformed humanoid tuples fall back
// to the shape's classic tone (single-tone) just like an unrecognized plain tone.
export function parseAvatar(id) {
  if (typeof id !== 'string' || !id) return { shape: 'invader', tone: CLASSIC_TONES.invader }
  const dot = id.indexOf('.')
  if (dot === -1) {
    const shape = SHAPES.includes(id) ? id : 'invader'
    const tone = CLASSIC_TONES[shape]
    if (isHumanoid(shape)) return { shape, tone, parts: outfitFromTone(tone) }
    return { shape, tone }
  }
  const rawShape = id.slice(0, dot)
  const rawTone = id.slice(dot + 1)
  const shape = SHAPES.includes(rawShape) ? rawShape : 'invader'
  if (isHumanoid(shape)) {
    const segs = rawTone.split('-')
    if (segs.length === 4 && segs.every(s => TONES.includes(s))) {
      const parts = { cap: segs[0], shirt: segs[1], pants: segs[2], shoes: segs[3] }
      return { shape, tone: parts.shirt, parts }
    }
    // Malformed tuple — fall back like an unknown tone.
    const tone = TONES.includes(rawTone) ? rawTone : CLASSIC_TONES[shape]
    return { shape, tone, parts: outfitFromTone(tone) }
  }
  const tone = TONES.includes(rawTone) ? rawTone : CLASSIC_TONES[shape]
  return { shape, tone }
}

export function canonicalAvatar(id) {
  const { shape, tone, parts } = parseAvatar(id)
  if (isHumanoid(shape)) return makeHumanoid(shape, parts)
  return makeAvatar(shape, tone)
}

export function isValidAvatar(key) {
  if (typeof key !== 'string' || !key) return false
  const dot = key.indexOf('.')
  if (dot === -1) return SHAPES.includes(key)
  const shape = key.slice(0, dot)
  const tone = key.slice(dot + 1)
  if (!SHAPES.includes(shape)) return false
  if (isHumanoid(shape)) {
    const segs = tone.split('-')
    if (segs.length === 4) return segs.every(s => TONES.includes(s))
    return TONES.includes(tone)
  }
  return TONES.includes(tone)
}

// Deterministic default so brand-new guests don't all look identical. Stable for a
// given id (uid). Always a humanoid (boy/girl) with a hashed 4-part outfit.
export function defaultAvatarForId(id) {
  const s = String(id || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  const shape = PICKER_SHAPES[h % PICKER_SHAPES.length]
  const parts = {
    cap: TONES[h % TONES.length],
    shirt: TONES[Math.floor(h / 7) % TONES.length],
    pants: TONES[Math.floor(h / 49) % TONES.length],
    shoes: TONES[Math.floor(h / 343) % TONES.length],
  }
  return makeHumanoid(shape, parts)
}
