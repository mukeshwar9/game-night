// Shared moderation denylist: slurs, strong profanity and explicit sexual terms
// that should never be shown to other players — for chat/display-name
// moderation, and reusable by any word list that wants the same bar. Pure
// module — no DOM, Firebase or React. Not wired into any game yet.
//
// Matching is exact on whole words after normalization (see `isDenied`), never
// substring: "therapist", "cocktail", "spicy", "grape" and "Scunthorpe" all
// pass. Every inflection that should be blocked is therefore listed explicitly
// below; there is deliberately no suffix stripping, because a generic
// "-ed/-y/-s" rule turns "spiced", "spicy" and "japes" into false positives.
// Callers moderating free text split it into words themselves.
//
// Scope and policy: docs/content-policy.md.

const SLURS = [
  // Racial and ethnic
  'nigger', 'niggers', 'nigga', 'niggas', 'niggaz', 'niggah', 'nigguh', 'nigra', 'nigras',
  'negro', 'negroes', 'coon', 'coons', 'jigaboo', 'jigaboos', 'sambo', 'sambos',
  'pickaninny', 'pickaninnies', 'darkie', 'darkies', 'darky',
  'kike', 'kikes', 'kyke', 'hymie', 'hymies', 'yid', 'yids', 'heeb', 'heebs', 'sheeny', 'sheenies',
  'spic', 'spics', 'spick', 'spicks', 'spik', 'beaner', 'beaners', 'wetback', 'wetbacks',
  'chink', 'chinks', 'chinky', 'chinaman', 'chinamen', 'gook', 'gooks', 'jap', 'japs', 'zipperhead',
  'paki', 'pakis', 'raghead', 'ragheads', 'towelhead', 'towelheads', 'sandnigger',
  'wog', 'wogs', 'golliwog', 'golliwogs', 'gollywog', 'dago', 'dagos', 'dagoes', 'wop', 'wops',
  'polack', 'polacks', 'kraut', 'krauts', 'honky', 'honkie', 'honkies',
  'redskin', 'redskins', 'squaw', 'squaws', 'injun', 'injuns', 'halfbreed', 'halfbreeds',
  'coolie', 'coolies', 'abo', 'abos', 'boong', 'boongs', 'gyp', 'gyps', 'gypped', 'gypping',
  // Homophobic and transphobic
  'fag', 'fags', 'faggot', 'faggots', 'fagot', 'fagots', 'faggy', 'dyke', 'dykes',
  'lesbo', 'lesbos', 'lezzie', 'lezzies', 'lezzy', 'lezza', 'homo', 'homos',
  'poofter', 'poofters', 'poove', 'pooves', 'tranny', 'trannies', 'shemale', 'shemales',
  // Ableist
  'retard', 'retards', 'retarded', 'tard', 'tards', 'spaz', 'spazz', 'spazzes', 'spastic', 'spastics',
  'mong', 'mongs', 'mongoloid', 'mongoloids', 'midget', 'midgets',
  // Misogynist
  'slut', 'sluts', 'slutty', 'whore', 'whores', 'whorish', 'skank', 'skanks', 'skanky',
  'bitch', 'bitches', 'bitchy', 'bitching', 'bitched', 'cunt', 'cunts', 'twat', 'twats',
]

const PROFANITY = [
  'fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'fuckin', 'fuckup', 'fuckups',
  'fuckoff', 'fuckface', 'fuckhead', 'fuckheads', 'fuckwit', 'fuckwits',
  'motherfucker', 'motherfuckers', 'motherfucking', 'mofo', 'mofos',
  'fuk', 'fuks', 'fukk', 'fcuk', 'phuck', 'phuk',
  'shit', 'shits', 'shitty', 'shitted', 'shitting', 'shite', 'shites', 'shithead', 'shitheads',
  'shithole', 'shitholes', 'bullshit', 'horseshit', 'dipshit', 'dipshits', 'apeshit', 'batshit',
  'asshole', 'assholes', 'arsehole', 'arseholes', 'asshat', 'asshats',
  'cocksucker', 'cocksuckers', 'dickhead', 'dickheads',
  'wank', 'wanks', 'wanked', 'wanker', 'wankers', 'wanking', 'bollock', 'bollocks',
  'bastard', 'bastards', 'piss', 'pissed', 'pisses', 'pissing', 'pisser', 'pisshead',
  'goddamn', 'goddamned', 'goddam',
]

const SEXUAL = [
  'cock', 'cocks', 'dick', 'dicks', 'pussy', 'pussies', 'tits', 'titty', 'titties', 'tittie',
  'dildo', 'dildos', 'dildoes', 'blowjob', 'blowjobs', 'handjob', 'handjobs', 'rimjob',
  'cum', 'cums', 'cumming', 'cummed', 'cumshot', 'jizz', 'jizzed', 'jism', 'jisms', 'jissom', 'gism', 'spooge',
  'porn', 'porns', 'porno', 'pornos', 'porny', 'milf', 'milfs',
  'clit', 'clits', 'schlong', 'schlongs', 'bukkake', 'gangbang', 'gangbangs',
  'felch', 'felching', 'queef', 'queefs', 'poontang', 'punani',
  'rape', 'rapes', 'raped', 'raping', 'rapist', 'rapists', 'raper', 'rapers',
  'pedo', 'pedos', 'paedo', 'paedos', 'pedophile', 'pedophiles', 'paedophile', 'paedophiles',
]

export const DENYLIST = new Set([...SLURS, ...PROFANITY, ...SEXUAL])

// Common look-alike substitutions ("sh1t", "b!tch", "a$$hole").
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'l' }

function lettersOnly(text) {
  return text.replace(/[^a-z]/g, '')
}

function fold(word) {
  return String(word ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

// Lowercase, strip accents, drop anything that isn't a-z. Exported so callers
// that key their own lists (e.g. a future name filter) normalize identically.
export function normalizeForDenylist(word) {
  return lettersOnly(fold(word))
}

// Candidate spellings to test: as typed, with look-alike characters decoded (a
// "1" can stand for i or l), and with stretched letters ("fuuuuck") squeezed.
// Only runs of 3+ are squeezed — English words have no tripled letters, so this
// can't turn a real word into a denied one, while doubled letters ("coon" vs
// "con") are left alone.
function candidates(word) {
  const lower = fold(word)
  const decoded = [...lower].map(ch => LEET[ch] ?? ch).join('')
  const decodedL = [...lower].map(ch => (ch === '1' ? 'l' : LEET[ch] ?? ch)).join('')
  const out = new Set()
  for (const raw of [lower, decoded, decodedL]) {
    const letters = lettersOnly(raw)
    if (!letters) continue
    out.add(letters)
    out.add(letters.replace(/([a-z])\1{2,}/g, '$1'))
    out.add(letters.replace(/([a-z])\1{2,}/g, '$1$1'))
  }
  return out
}

// True when `word` is a denylisted term (case-, accent-, punctuation-,
// look-alike- and stretched-letter-insensitive). Whole-word only.
export function isDenied(word) {
  // Fast path for the common case (plain lowercase dictionary words): nothing
  // to decode or squeeze, so an exact lookup is the whole answer.
  const lower = String(word ?? '').toLowerCase()
  if (/^[a-z]+$/.test(lower) && !/([a-z])\1\1/.test(lower)) return DENYLIST.has(lower)
  for (const candidate of candidates(word)) {
    if (DENYLIST.has(candidate)) return true
  }
  return false
}
