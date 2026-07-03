# PRD — Word Hunt (Boggle duel)

**One-liner:** both players get the identical seeded 4×4 letter grid and 80 seconds to trace as
many words as they can — GamePigeon's most-played game, built on the platform's seeded-race
pattern.

| | |
|---|---|
| `type` | `wordhunt` |
| Label / badge | `WORD HUNT` / `WH` |
| Category | `word` (2 players + spectators) |
| Integration | **C** — custom race page (typing/math precedent) |
| Network | RTDB seeded race — no P2P |
| Effort | **M** (the dictionary module is half of it) |
| Priority | P2 |

## Game rules

- 4×4 grid generated from the **16 classic Boggle dice** (fixed face distributions, e.g.
  `AAEEGN`, `ELRTTY`, … including the `Qu` face rendered as one tile) — seeded shuffle of dice to
  positions + seeded face per die. Real dice distributions matter: uniform random letters produce
  noticeably worse grids.
- A word is valid if: ≥3 letters, in the dictionary, and traceable through **adjacent** tiles
  (8-directional) without reusing a tile.
- **Scoring (classic Boggle):** 3–4 letters = 1 · 5 = 2 · 6 = 3 · 7 = 5 · 8+ = 11.
- **No shared-word cancellation** (GamePigeon rule, not classic Boggle) — cancellation punishes
  finding good words and is opaque mid-game. Both players can score the same word.
- 80-second round; higher score wins, tie = draw round. Standard match scoreboard.

## Data model

Top-level race keys (all added to `FIELD_NULLS`):

```
wordhuntGrid:      string      // 16 chars ('q' renders as Qu), written by freshGameState
wordhuntStartedAt: epoch-ms    // set when both players ready (mirror TypingGame's start flow)
wordhuntWordsX/O:  string[]    // found words, appended live
wordhuntScoreX/O:  number      // running scores (drives the ghost display)
wordhuntDoneX/O:   bool        // timer expiry acknowledged per player
```

`freshGameState('wordhunt')` generates the grid via a seeded RNG (reuse `mathLogic`'s seeded
generator if exported, else mulberry32 in `wordhuntLogic.js`) so PLAY AGAIN yields a fresh grid.

**Leak note:** found words are written live so the end screen can show both lists and let each
client verify the opponent's words (path + dictionary check — catches a hacked score). The UI
hides the opponent's *list* during play (only score/count ghost is shown); a player reading
Firebase directly can crib words — same accepted casual-leak class as fibbage, and self-limiting
(copying costs the copier time).

When both `done` flags are set, the first client to observe it runs the standard winner
transaction (math/typing pattern).

## Dictionary — `src/lib/dictionary.js` (shared prerequisite)

Shared with Word Duel; build once.

- Source: ENABLE/TWL-derived public-domain list, filtered to 3–10-letter words → ~90k entries.
- Ship as a **lazy-loaded chunk**: `const dict = await import('./dictionaryData.js')` on game
  mount (both pages show the existing CONNECTING-style splash until loaded). Keeps the main
  bundle untouched; the chunk is ~250 KB gzipped and cached by the PWA service worker after
  first load.
- API: `await loadDictionary()` → `{ has(word), isAnswerWord(word) }` (the latter a ~2.3k curated
  5-letter subset for Word Duel).
- Stretch: pack as a DAWG/prefix trie if the chunk size annoys.

## UI

- **Input, primary (mobile):** pointer/touch drag across tiles — path highlights as you go,
  release to submit. Adjacency enforced during the drag (can't slide to a non-neighbor).
  `touch-action: none` on the grid.
- **Input, secondary (desktop):** type + Enter; the page traces a valid path automatically
  (any path works, DFS).
- Feedback per submit: new valid word → tile flash `retro-win` + floating `+N`; duplicate →
  amber shake; invalid → red shake. Found-words list down the side (own only).
- Ghost display: opponent score + words-found count updating live (typing-race precedent),
  plus a last-10-seconds urgency treatment on the timer.
- End screen: both word lists side by side, unique finds highlighted, best word called out.

## Files

| File | Contents |
|---|---|
| `src/lib/dictionary.js` (+ data chunk) | shared lazy dictionary |
| `src/lib/wordhuntLogic.js` | `BOGGLE_DICE`, `generateGrid(seed)`, `findPath(grid, word)` (DFS, no tile reuse), `scoreWord`, `scoreWords` |
| `src/lib/wordhuntLogic.test.js` | see Testing |
| `src/pages/WordHuntGame.jsx` | ready/countdown → play → end flow; drag input component inline or extracted |
| Registration | registry entry (`custom: true`), icon, ladder case, `freshGameState` branch, `FIELD_NULLS` keys |

## Edge cases

- `Qu` tile: stored as `'q'`, rendered `Qu`, `findPath` consumes `qu` in the candidate word.
- Reload mid-round: found words are in Firebase; page rehydrates own list/score and keeps
  playing with the same deadline (`startedAt + 80s`).
- Opponent quits: presence indicator + existing room conventions; round still completes solo.
- Grid with pathological few words: dice distributions make this rare; accepted (both players
  share the pain — it's symmetric).
- Timer authority: each client stops accepting submits at corrected-clock deadline; a hacked
  client submitting late is caught only by scores diverging — accepted honest-client tier.

## Testing

- Unit: grid determinism per seed; dice coverage (each die used exactly once); `findPath`
  (found/not-found, no-reuse enforcement, `qu` handling, 8-direction adjacency); scoring table
  boundaries; duplicate canonicalization.
- Manual: two-browser race; drag feel on a real phone; dictionary lazy-load on cold cache;
  reload mid-round.

## Stretch

4×4 → 5×5 variant (`variantOf`); word definitions on the end screen; personal best tracking on
the profile (builds on planned `users/{uid}` stats).
