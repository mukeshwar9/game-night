// Lazy-loaded WORD HUNT dictionary loader.
//
// Why this is a separate module from src/lib/dictionary.js: that file is Word
// Duel's fixed 5-letter-only word lists (`_ANSWERS`/`_VALID`, ~950/~13,000
// entries), statically imported into wordduelLogic.js with no lazy-loading and
// no loading splash — it is baked into the main bundle today. Word Hunt needs
// a genuinely multi-length (3+ letter) word list, which is a different shape
// and a much bigger corpus, so repurposing dictionary.js would both be the
// wrong shape and risk destabilizing Word Duel. dictionary.js itself is never
// touched.
//
// The word data lives OUTSIDE the JS module graph, as a plain newline-
// separated text asset (public/wordhunt-dict.txt, ~125k words), fetched here
// at runtime. It was originally a lazy-imported JS module exporting a Set
// literal, but Rolldown/Vite minification of a ~125k-entry literal ballooned
// production builds from ~4s to ~18min — a static asset costs the build
// nothing. Offline: a CacheFirst service-worker rule in vite.config.js caches
// the file after first fetch, matching the old chunk's PWA behavior without
// forcing the download on visitors who never open Word Hunt.
//
// BUNDLE-LEAK CAVEAT (same acceptance as src/lib/decks/fibbage.js's header):
// once loaded, the whole word list sits in the client and a determined player
// could read it from the network tab. A Boggle word list is a lookup table,
// not a hidden "answer" the way a Fibbage prompt's truth is, so the residual
// leak here is lower-stakes — but the same accepted-casual-leak tier applies.

let _promise = null

export function loadDictionary() {
  if (!_promise) {
    _promise = fetch(`${import.meta.env.BASE_URL}wordhunt-dict.txt`)
      .then((res) => {
        if (!res.ok) throw new Error(`wordhunt dictionary fetch failed: ${res.status}`)
        return res.text()
      })
      .then((text) => {
        const words = new Set(text.split('\n').filter(Boolean))
        return {
          has: (word) => words.has(String(word ?? '').trim().toLowerCase()),
        }
      })
      .catch((err) => {
        _promise = null
        throw err
      })
  }
  return _promise
}
