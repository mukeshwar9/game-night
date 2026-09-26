// Content policy for every word list in the app — pure, no DOM/React.
//
// Two levels (captain decision D2(a), 2026-09-26 — reversible here):
//   - BANNED: slurs and unambiguous vulgarity. Never accepted anywhere: not as
//     a found word (Word Hunt, Anagrams), not as a setter word (Hangwoman,
//     Word Duel), never served or shown.
//   - Not family-safe: BANNED plus sensitive words and innocent homographs
//     (tit, ass, cock). Players may still *find* a homograph in Word Hunt, but
//     the game never *serves* one (answer lists, racks, decks) or shows it in
//     a "words you missed" list.
// Checks cover simple inflections (plural, -ed, -ing, -er, -y) so "slurs"
// and "slurring" are caught by listing the root once.

const SLURS = [
  'nigger', 'nigga', 'nigra', 'faggot', 'fag', 'faggy', 'kike', 'kyke',
  'spic', 'spick', 'gook', 'wetback', 'raghead', 'towelhead', 'tranny',
  'wop', 'dago', 'honky', 'paki', 'squaw', 'darky', 'darkie', 'darkey',
  'beaner', 'redskin', 'spaz', 'jap', 'coolie', 'golliwog', 'sambo', 'shemale',
]

const VULGAR = [
  'fuck', 'shit', 'cunt', 'twat', 'wank', 'wanker', 'jizz', 'dildo', 'blowjob',
  'whore', 'whorehouse', 'whoredom', 'whoreson', 'slut', 'bitch', 'bastard', 'pussy', 'arse', 'asshole', 'arsehole',
  'piss', 'turd', 'smegma', 'queef', 'skank', 'titty', 'tittie', 'porn', 'porno',
  'cumshot', 'bollock', 'bollocks', 'schlong', 'motherfucker', 'bullshit',
  'horseshit', 'shithead', 'dickhead', 'jerkoff', 'handjob', 'rimjob', 'milf', 'hooters',
]

// Allowed as a found word, never served or displayed. Slurs that are also
// ordinary words (chink = a gap, dyke = an embankment, retard = to slow)
// live here rather than in SLURS.
const SENSITIVE = [
  'negro', 'negress', 'rape', 'raped', 'rapes', 'rapist', 'nazi', 'lynch',
  'lynching', 'gypsy', 'gyp', 'coon', 'chink', 'dyke', 'retard', 'retarded',
  'boob', 'boobs', 'crap', 'craps', 'damn', 'goddamn', 'fart', 'horny', 'kinky',
  'semen', 'sperm', 'penis', 'vagina', 'anal', 'anus', 'sodomy', 'sodomize',
  'hooker', 'pimp', 'orgy', 'orgasm', 'erotic', 'sexy', 'sex', 'nude', 'nudes',
  'naked', 'stripper', 'viagra', 'condom', 'heroin', 'cocaine', 'meth',
  'suicide', 'incest', 'pedophile', 'molest', 'genocide', 'terrorist', 'hitler',
  'kkk', 'bong', 'bongs', 'gringo', 'harlot', 'hussy', 'wench', 'queer', 'homo',
  'transvestite', 'midget', 'spastic', 'imbecile', 'bimbo',
]

const HOMOGRAPHS = [
  'tit', 'tits', 'ass', 'asses', 'cock', 'cocks', 'dick', 'dicks', 'prick',
  'shag', 'bugger', 'boner', 'dong', 'knockers', 'poon', 'cum', 'muff', 'nob',
  'pecker', 'wang', 'willy', 'booty', 'butt', 'butts', 'tosser', 'pubes',
  'pubic', 'bra', 'bras', 'thong', 'undies',
]

// Roots too offensive to allow inside any longer word (no innocent English
// word contains them — unlike "nigger" in "snigger" or "shit" in "mishit").
const CONTAINS = ['fuck', 'cunt', 'faggot', 'dildo']

// Innocent words that inflection matching would otherwise catch
// ("spicy" → "spic", "beanery" → "beaner").
const ALLOW = new Set([
  'spice', 'spices', 'spiced', 'spicer', 'spicers', 'spicy', 'spicier',
  'spiciest', 'spicily', 'spicing', 'beanery', 'beaneries', 'niggard',
  'niggards', 'niggardly', 'snigger', 'sniggers', 'sniggered', 'sniggering',
  'butter', 'butters', 'buttered', 'buttering', 'buttery', 'butterfly',
  'butterflies', 'buttercup', 'buttercups', 'butte', 'buttes', 'heroine',
  'heroines', 'shaggy', 'shaggier', 'shaggiest', 'titter', 'titters',
  'tittered', 'tittering', 'dicker', 'dickers', 'dickered', 'dickering',
  'crape', 'crapes', 'craped', 'craping', 'cocker', 'cockers', 'brasier',
])

const SLUR_SET = new Set(SLURS)
const VULGAR_SET = new Set(VULGAR)
const SENSITIVE_SET = new Set(SENSITIVE)
const HOMOGRAPH_SET = new Set(HOMOGRAPHS)

const SUFFIXES = ['s', 'es', 'ed', 'd', 'er', 'ers', 'ing', 'ings', 'y', 'ies', 'ier', 'iest', 'ish', 'gy', 'ot', 'ots']

/** The word plus the roots it may inflect from (dogs → dog, slurring → slurr/slur). */
export function wordForms(word) {
  const w = String(word ?? '').toLowerCase().replace(/[^a-z]/g, '')
  const forms = new Set([w])
  for (const suf of SUFFIXES) {
    // "-ss" words are not "-s" plurals ("brass" is not "bras" + s).
    if ((suf === 's' || suf === 'es') && w.endsWith('ss')) continue
    if (w.length > suf.length + 1 && w.endsWith(suf)) {
      const stem = w.slice(0, -suf.length)
      // Short stems only via a plain "-s" ("fags" → "fag"), so "japes" never
      // reduces to a three-letter slur.
      if (stem.length < 4 && suf !== 's') continue
      forms.add(stem)
      if (suf === 'ies' || suf === 'ier' || suf === 'iest') forms.add(stem + 'y')
      // doubled consonant before -ing/-ed/-er ("slurring" → "slur"), but not
      // "-ss" stems, which are base words ("assessed" is not "asses" + d)
      if (stem.length > 2 && !stem.endsWith('ss') && stem[stem.length - 1] === stem[stem.length - 2]) forms.add(stem.slice(0, -1))
    }
  }
  return [...forms].filter(Boolean)
}

function hitsSet(word, set) {
  return wordForms(word).some(f => set.has(f))
}

/** Slurs and unambiguous vulgarity: never accept, serve or show. */
export function isBannedWord(word) {
  const w = String(word ?? '').toLowerCase()
  if (!w || ALLOW.has(w)) return false
  if (CONTAINS.some(root => w.includes(root))) return true
  return hitsSet(w, SLUR_SET) || hitsSet(w, VULGAR_SET)
}

/** Safe for the game to serve or display on its own (answer lists, racks,
 * decks, "missed words"). Stricter than `isBannedWord`. */
export function isFamilySafe(word) {
  const w = String(word ?? '').toLowerCase()
  if (!w || ALLOW.has(w)) return true
  if (isBannedWord(w)) return false
  return !hitsSet(w, SENSITIVE_SET) && !hitsSet(w, HOMOGRAPH_SET)
}

/** Filter helper for word lists: keeps only words `isFamilySafe` allows. */
export function familySafeOnly(words) {
  return words.filter(isFamilySafe)
}
