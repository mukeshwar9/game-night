// Retro pixel-art avatar registry. Composite format: '{shape}.{tone}' (e.g. 'ghost.p2').
// Bare legacy keys ('ghost') stay valid forever — parseAvatar resolves them to their
// classic tone. Keep SHAPES in sync with GLYPHS in src/components/Avatar.jsx.
//
// Humanoid avatars ('boy', 'girl', 'kid', 'punk') use a dash-joined tuple in the tone
// slot instead of a single tone. Two wire shapes exist:
//   v1 (4-tuple):  '{shape}.{cap}-{shirt}-{pants}-{shoes}', e.g. 'girl.cta-p2-dim-text'
//   v2 (8-tuple):  '{shape}.{cap}-{shirt}-{pants}-{shoes}-{skin}-{hair}-{hairColor}-{acc}'
//                  e.g. 'kid.none-p2-dim-text-s2-spiky-p1-glasses'
// The single-dot invariant is preserved in both. A humanoid with a plain single tone
// (e.g. 'boy.p1') is also valid and expands to a derived outfit via outfitFromTone —
// every helper here stays total.
//
// v2 is additive: an old client that has not picked up this module yet will fail the
// 4-tuple/1-tone checks on an 8-tuple string, fall through the malformed-tuple path,
// and render the shape's default humanoid outfit instead of the real one. That's an
// accepted, documented degradation — the PWA updates fast and the stored string itself
// is untouched, so the real outfit reappears once the client refreshes.

export const SHAPES = [
  'invader', 'robot', 'ghost', 'alien', 'skull', 'cat', 'ufo', 'wizard',
  'ninja', 'crown', 'dino', 'heart',
  'frog', 'star', 'mushroom', 'bolt', 'moon', 'fish', 'sword', 'slime',
  'boy', 'girl', 'kid', 'punk',
  // Third wave (first-run picker rework) — appended after the humanoids because
  // the order above is wire format and must never change.
  'bunny', 'bear', 'owl', 'penguin', 'octopus', 'fox', 'rocket',
]

export const TONES = ['p1', 'p2', 'cta', 'win', 'text', 'dim', 'av1', 'av2', 'av3', 'av4']

// Legacy classic tones — copied verbatim from Avatar.jsx TONE map, stripped of '--c-'.
// Pins rendering of bare keys so legacy users never shift color.
export const CLASSIC_TONES = {
  invader: 'win', robot: 'p1', ghost: 'text', alien: 'win', skull: 'text', cat: 'p2',
  ufo: 'cta', wizard: 'p1', ninja: 'text', crown: 'cta', dino: 'win', heart: 'p2',
  frog: 'win', star: 'cta', mushroom: 'p2', bolt: 'cta', moon: 'text', fish: 'p1', sword: 'dim', slime: 'win',
  boy: 'p1', girl: 'p2', kid: 'win', punk: 'cta',
  bunny: 'text', bear: 'av4', owl: 'av2', penguin: 'p1', octopus: 'p2', fox: 'av1', rocket: 'cta',
}

// Humanoid avatars — the only shapes offered by the picker (creature shapes above
// stay fully renderable/valid for anyone who already saved one). Re-enabling
// creatures in the picker later = point PICKER_SHAPES back at SHAPES.
export const HUMANOIDS = ['boy', 'girl', 'kid', 'punk']
export const PARTS = ['cap', 'shirt', 'pants', 'shoes']
export const PICKER_SHAPES = HUMANOIDS

// Every single-colour creature shape, in SHAPES order — the avatar picker's
// CRITTERS grid. LEGACY_CREATURES is the pre-rework set of 20; party bots draw
// from it so seeded bot looks never shift when a new creature is added.
export const CREATURES = SHAPES.filter(s => !HUMANOIDS.includes(s))
export const LEGACY_CREATURES = SHAPES.slice(0, 20)

// v2 vocabularies. Hair color reuses TONES.
export const SKIN_TONES = ['s1', 's2', 's3', 's4', 's5']
export const HAIR_STYLES = ['none', 'short', 'spiky', 'long', 'bob', 'curly']
export const ACCESSORIES = ['none', 'glasses', 'headphones', 'crown', 'cape']

export function isHumanoid(shape) {
  return HUMANOIDS.includes(shape)
}

export function makeAvatar(shape, tone) { return `${shape}.${tone}` }

// Builds a humanoid composite id from a part map. Accepts either a legacy 4-part map
// ({ cap, shirt, pants, shoes }) or an extended v2 map that also carries skin/hair/
// hairColor/acc — missing v2 fields fall back to their defaults (skin 's3', hair
// 'none', hairColor the shape's classic tone, acc 'none'). Emits the shortest
// canonical wire form: the 4-tuple when every v2 extra is at its default AND cap is
// not 'none' (a plain cap is what a 4-tuple means), otherwise the full 8-tuple.
export function makeHumanoid(shape, parts) {
  const classic = CLASSIC_TONES[shape]
  const base = parts?.cap != null ? parts : defaultHumanoidParts(shape, classic)
  const full = {
    cap: base.cap,
    shirt: base.shirt,
    pants: base.pants,
    shoes: base.shoes,
    skin: base.skin ?? 's3',
    hair: base.hair ?? 'none',
    hairColor: base.hairColor ?? classic,
    acc: base.acc ?? 'none',
  }
  const isDefaultExtras = full.skin === 's3' && full.hair === 'none' && full.acc === 'none' &&
    full.hairColor === classic && full.cap !== 'none'
  if (isDefaultExtras) {
    return `${shape}.${full.cap}-${full.shirt}-${full.pants}-${full.shoes}`
  }
  return `${shape}.${full.cap}-${full.shirt}-${full.pants}-${full.shoes}-${full.skin}-${full.hair}-${full.hairColor}-${full.acc}`
}

// Deterministic, pleasant default outfit derived from a single tone — used when a
// humanoid avatar is stored/typed with only one tone (e.g. 'boy.p1').
export function outfitFromTone(tone) {
  return { cap: tone, shirt: tone, pants: 'dim', shoes: 'text' }
}

// Full v2 part map derived from a single tone — outfitFromTone's 4 parts plus the
// v2 defaults (skin 's3', hair 'none', hairColor the shape's classic tone, acc 'none').
function defaultHumanoidParts(shape, tone) {
  return { ...outfitFromTone(tone), skin: 's3', hair: 'none', hairColor: CLASSIC_TONES[shape], acc: 'none' }
}

// Total function: any input → renderable { shape, tone } (humanoids also get `parts`,
// always the full 8-key v2 shape: { cap, shirt, pants, shoes, skin, hair, hairColor, acc }).
// Never throws or returns null. Bare legacy key → classic tone. Unknown shape →
// invader. Unknown tone → shape's classic tone.
//
// Humanoid tone-slot rules:
//   8 segs (v2) — validated per slot; a bad slot falls back to that slot's own
//     default (tone slots incl. cap → shape's classic tone; skin → 's3'; hair →
//     'none'; hairColor → shape's classic tone; acc → 'none') instead of discarding
//     the whole tuple.
//   4 segs (v1) — all four must be in TONES or the whole tuple is malformed;
//     expanded with the v2 defaults above.
//   1 seg / bare key / malformed (incl. 2, 3, 5, 6, 7 segs) — falls back like an
//     unrecognized plain tone, same as pre-v2 behavior.
export function parseAvatar(id) {
  if (typeof id !== 'string' || !id) return { shape: 'invader', tone: CLASSIC_TONES.invader }
  const dot = id.indexOf('.')
  if (dot === -1) {
    const shape = SHAPES.includes(id) ? id : 'invader'
    const tone = CLASSIC_TONES[shape]
    if (isHumanoid(shape)) return { shape, tone, parts: defaultHumanoidParts(shape, tone) }
    return { shape, tone }
  }
  const rawShape = id.slice(0, dot)
  const rawTone = id.slice(dot + 1)
  const shape = SHAPES.includes(rawShape) ? rawShape : 'invader'
  if (isHumanoid(shape)) {
    const segs = rawTone.split('-')
    if (segs.length === 8) {
      const classic = CLASSIC_TONES[shape]
      const cap = (TONES.includes(segs[0]) || segs[0] === 'none') ? segs[0] : classic
      const shirt = TONES.includes(segs[1]) ? segs[1] : classic
      const pants = TONES.includes(segs[2]) ? segs[2] : classic
      const shoes = TONES.includes(segs[3]) ? segs[3] : classic
      const skin = SKIN_TONES.includes(segs[4]) ? segs[4] : 's3'
      const hair = HAIR_STYLES.includes(segs[5]) ? segs[5] : 'none'
      const hairColor = TONES.includes(segs[6]) ? segs[6] : classic
      const acc = ACCESSORIES.includes(segs[7]) ? segs[7] : 'none'
      const parts = { cap, shirt, pants, shoes, skin, hair, hairColor, acc }
      return { shape, tone: shirt, parts }
    }
    if (segs.length === 4 && segs.every(s => TONES.includes(s))) {
      const parts = {
        cap: segs[0], shirt: segs[1], pants: segs[2], shoes: segs[3],
        skin: 's3', hair: 'none', hairColor: CLASSIC_TONES[shape], acc: 'none',
      }
      return { shape, tone: parts.shirt, parts }
    }
    // Malformed tuple (any other length, or an invalid 4-tuple) or a plain single
    // tone — fall back like an unknown tone.
    const tone = TONES.includes(rawTone) ? rawTone : CLASSIC_TONES[shape]
    return { shape, tone, parts: defaultHumanoidParts(shape, tone) }
  }
  const tone = TONES.includes(rawTone) ? rawTone : CLASSIC_TONES[shape]
  return { shape, tone }
}

export function canonicalAvatar(id) {
  const { shape, tone, parts } = parseAvatar(id)
  if (isHumanoid(shape)) return makeHumanoid(shape, parts)
  return makeAvatar(shape, tone)
}

// AvatarCustomizer only edits humanoids. Legacy creature keys ('ghost.p2') and
// other ids without a parts map would crash on parts.cap — seed a stable humanoid
// outfit hashed from the stored id instead.
export function humanoidCustomizerSeed(id) {
  const parsed = parseAvatar(id)
  if (parsed.parts && isHumanoid(parsed.shape)) return parsed
  const seed = typeof id === 'string' && id ? id : 'guest'
  return parseAvatar(defaultAvatarForId(seed))
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
    if (segs.length === 8) {
      const [cap, shirt, pants, shoes, skin, hair, hairColor, acc] = segs
      return (TONES.includes(cap) || cap === 'none') &&
        TONES.includes(shirt) && TONES.includes(pants) && TONES.includes(shoes) &&
        SKIN_TONES.includes(skin) && HAIR_STYLES.includes(hair) &&
        TONES.includes(hairColor) && ACCESSORIES.includes(acc)
    }
    return TONES.includes(tone)
  }
  return TONES.includes(tone)
}

// Deterministic default so brand-new guests don't all look identical. Stable for a
// given id (uid). Always a humanoid, hashed body + full outfit; accessory always
// starts at 'none' (a deliberate first-impression choice — accessories are opt-in).
export function defaultAvatarForId(id) {
  const s = String(id || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  const shape = PICKER_SHAPES[h % PICKER_SHAPES.length]
  const legacyTones = TONES.slice(0, 6)
  const parts = {
    cap: TONES[h % TONES.length],
    shirt: TONES[Math.floor(h / 7) % TONES.length],
    pants: TONES[Math.floor(h / 49) % TONES.length],
    shoes: TONES[Math.floor(h / 343) % TONES.length],
    skin: SKIN_TONES[Math.floor(h / 2401) % SKIN_TONES.length],
    hair: HAIR_STYLES[Math.floor(h / 11) % HAIR_STYLES.length],
    hairColor: legacyTones[Math.floor(h / 13) % legacyTones.length],
    acc: 'none',
  }
  return makeHumanoid(shape, parts)
}

// Random look for the picker's SHUFFLE button — half the time a creature in a
// random tone, otherwise a fully random humanoid. `rand` is injectable so tests
// can pin the output; `avoid` re-rolls once if the result equals it, so a shuffle
// always visibly changes something.
export function randomHumanoid(rand = Math.random) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  // Accessories are 50% 'none' — a full outfit reads busier than most people want.
  const nonNoneAcc = ACCESSORIES.filter(a => a !== 'none')
  const accPool = [...Array(nonNoneAcc.length).fill('none'), ...nonNoneAcc]
  return makeHumanoid(pick(PICKER_SHAPES), {
    cap: pick(TONES), shirt: pick(TONES), pants: pick(TONES), shoes: pick(TONES),
    skin: pick(SKIN_TONES), hair: pick(HAIR_STYLES), hairColor: pick(TONES), acc: pick(accPool),
  })
}

export function randomAvatar(rand = Math.random, avoid = null) {
  const roll = () => rand() < 0.5
    ? makeAvatar(CREATURES[Math.floor(rand() * CREATURES.length)], TONES[Math.floor(rand() * TONES.length)])
    : randomHumanoid(rand)
  const first = roll()
  if (avoid == null || first !== canonicalAvatar(avoid)) return first
  const second = roll()
  if (second !== first) return second
  // Two identical rolls in a row: step the tone/shirt deterministically instead.
  const { shape, tone, parts } = parseAvatar(first)
  const next = TONES[(TONES.indexOf(tone) + 1) % TONES.length]
  return parts ? makeHumanoid(shape, { ...parts, shirt: next }) : makeAvatar(shape, next)
}

// Curated outfit combos for the customizer's preset strip. Shape-agnostic — applying
// one preserves whichever shape/skin the user already has selected; parts here supply
// skin only as part of the combo's "look" default. Every combo is valid across every
// HUMANOIDS shape via makeHumanoid.
export const OUTFIT_PRESETS = [
  { id: 'arcade', label: 'ARCADE', parts: { cap: 'cta', shirt: 'p1', pants: 'dim', shoes: 'text', skin: 's3', hair: 'spiky', hairColor: 'text', acc: 'none' } },
  { id: 'hero', label: 'HERO', parts: { cap: 'p1', shirt: 'cta', pants: 'p2', shoes: 'text', skin: 's3', hair: 'short', hairColor: 'dim', acc: 'cape' } },
  { id: 'stealth', label: 'STEALTH', parts: { cap: 'none', shirt: 'dim', pants: 'dim', shoes: 'text', skin: 's4', hair: 'short', hairColor: 'text', acc: 'glasses' } },
  { id: 'sunset', label: 'SUNSET', parts: { cap: 'av1', shirt: 'av2', pants: 'dim', shoes: 'text', skin: 's2', hair: 'long', hairColor: 'av1', acc: 'none' } },
  { id: 'mint', label: 'MINT', parts: { cap: 'av3', shirt: 'win', pants: 'dim', shoes: 'text', skin: 's1', hair: 'bob', hairColor: 'av3', acc: 'headphones' } },
  { id: 'royal', label: 'ROYAL', parts: { cap: 'cta', shirt: 'p2', pants: 'p1', shoes: 'text', skin: 's5', hair: 'curly', hairColor: 'av4', acc: 'crown' } },
  { id: 'classic', label: 'CLASSIC', parts: { cap: 'p1', shirt: 'p1', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p1', acc: 'none' } },
]

// Human-readable labels for aria-labels / swatch tooltips.
export const TONE_LABEL = {
  p1: 'BLUE', p2: 'PINK', cta: 'YELLOW', win: 'GREEN', text: 'WHITE', dim: 'SLATE',
  av1: 'ORANGE', av2: 'VIOLET', av3: 'TEAL', av4: 'BROWN',
}

export const SKIN_LABEL = { s1: 'FAIR', s2: 'LIGHT', s3: 'TAN', s4: 'BROWN', s5: 'DEEP' }

export const HAIR_LABEL = { none: 'NONE', short: 'SHORT', spiky: 'SPIKY', long: 'LONG', bob: 'BOB', curly: 'CURLY' }

export const ACCESSORY_LABEL = { none: 'NONE', glasses: 'GLASSES', headphones: 'HEADPHONES', crown: 'CROWN', cape: 'CAPE' }
