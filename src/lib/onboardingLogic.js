// Pure first-run helpers: display-name validation and friendly name
// suggestions. No DOM, Firebase or React — the first-run screens
// (src/components/Onboarding.jsx) and Profile call into these.

export const NAME_MIN = 2
export const NAME_MAX = 20

// "Guest-7F3A" — the placeholder ensureProfile() writes for a brand-new uid.
// Treated as "no name chosen yet" by the first-run gate.
export function isGuestStyleName(name) {
  return typeof name === 'string' && /^Guest-[0-9A-Z]{4}$/i.test(name.trim())
}

// Control, zero-width and bidi characters render as nothing but make two
// names that look identical compare different — strip them before anything else.
function isInvisible(ch) {
  const c = ch.codePointAt(0)
  return c < 0x20 || c === 0x7f || c === 0xad || (c >= 0x200b && c <= 0x200f) ||
    (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff
}

// Returns { ok, name, error }. `name` is always the cleaned value (trimmed,
// invisible characters removed, runs of whitespace collapsed, capped at
// NAME_MAX code points) so the input can show exactly what will be saved.
// `error` is a short, friendly upper-case message, or null when ok.
export function validateName(raw) {
  const cleaned = [...String(raw ?? '')].filter(ch => !isInvisible(ch)).join('').replace(/\s+/g, ' ').trim()
  const name = [...cleaned].slice(0, NAME_MAX).join('').trim()
  if (!name) return { ok: false, name, error: 'TYPE A NAME — OR ROLL THE DICE' }
  if ([...name].length < NAME_MIN) return { ok: false, name, error: `AT LEAST ${NAME_MIN} CHARACTERS` }
  if (!/[\p{L}\p{N}]/u.test(name)) return { ok: false, name, error: 'ADD A LETTER OR NUMBER' }
  return { ok: true, name, error: null }
}

const ADJECTIVES = [
  'Pixel', 'Turbo', 'Cosmic', 'Lucky', 'Sneaky', 'Mighty', 'Speedy', 'Sleepy',
  'Funky', 'Neon', 'Jolly', 'Cheeky', 'Brave', 'Zippy', 'Wobbly', 'Retro',
]
const NOUNS = [
  'Panda', 'Otter', 'Falcon', 'Wizard', 'Ninja', 'Taco', 'Pickle', 'Comet',
  'Badger', 'Gecko', 'Yeti', 'Muffin', 'Koala', 'Dragon', 'Waffle', 'Fox',
]

// One "Adjective Noun" name (always ≤ NAME_MAX and valid). `rand` is
// injectable so tests can pin the output.
export function suggestName(rand = Math.random) {
  const adj = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(rand() * NOUNS.length)]
  return `${adj} ${noun}`
}

// `count` distinct suggestions, none equal to `avoid` (case-insensitive).
// Bounded: gives up after a fixed number of draws rather than spinning on a
// pathological rand, so it may return fewer than `count`.
export function suggestNames(count = 3, rand = Math.random, avoid = '') {
  const seen = new Set([String(avoid).toLowerCase()])
  const out = []
  for (let i = 0; i < count * 10 && out.length < count; i++) {
    const n = suggestName(rand)
    if (seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    out.push(n)
  }
  return out
}

// The name the first-run name field starts with: a real name already on the
// profile or Google account wins; a Guest-XXXX placeholder or nothing at all
// falls through to a fresh suggestion so the field is never empty.
export function initialName({ profileName, accountName, suggestion }) {
  for (const n of [profileName, accountName]) {
    if (n && !isGuestStyleName(n)) {
      const { ok, name } = validateName(n)
      if (ok) return name
    }
  }
  return suggestion
}
