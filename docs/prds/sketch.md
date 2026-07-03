# PRD — Sketch (draw & guess)

**One-liner:** skribbl-style party drawing game — one artist draws a secret word on a shared
pixel canvas, everyone else races to guess it in chat.

| | |
|---|---|
| `type` | `sketch` |
| Label / badge | `SKETCH` / `SK` |
| Category | `party` (3–8 players) |
| Integration | **D** — custom party page (`custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8`) |
| Network | RTDB only — strokes are human-speed, no WebRTC |
| Effort | **L** |
| Priority | **P1** — party category has only 3 games; drawing is the genre's killer app |

## Why

Drawing + guessing is the highest-replay party format that exists and the platform has nothing
like it. Everything it needs is already built: party room plumbing, seat order rotation
(wavelength's clue-giver pattern), per-uid scoring with idempotent host application (fibbage),
deck files, and `commit.js` for keeping the word secret.

## Game rules

- **Match:** 2 full cycles through the seat order (every player draws twice). Highest total
  score wins; ties share the win.
- **Round:** one artist, everyone else guesses.
  1. **Choosing (15 s):** artist sees 3 word options drawn from the deck, picks one.
  2. **Drawing (75 s):** artist draws; guessers submit free-text guesses. Word shown to
     guessers as blanks (`_ _ _ _ _`, word length public). Correct guessers are locked in and
     see the word; wrong guesses appear in a public chat feed. Round ends early when every
     guesser is correct.
  3. **Reveal (6 s):** word revealed, per-round score deltas shown, next artist announced.
- **Scoring (tunable constants in `sketchLogic.js`):** guessers earn by order of correct guess —
  1st: 100, 2nd: 90, 3rd: 80, … floor 50. Artist earns 25 per correct guesser (so a word everyone
  gets beats an impossible one). No points for the artist if nobody guesses.

## Trust model — self-grading via salted hash

The chosen word must not be readable from Firebase (spectators/players would cheat casually).
But the artist's client can't be the grader — that adds latency and lets a lagging artist stall.

**Design:** on picking a word, the artist's client computes `commit(normalize(word))` and
publishes **both `hash` and `salt`** to `round.commitment`. Each guesser's client hashes its own
normalized guess with the salt locally — a match means correct, no round-trip, no artist
dependency, and correctness is verifiable by anyone at reveal.

- `normalize()`: lowercase, trim, collapse internal whitespace, strip punctuation. Unit-tested.
- Correct guessers write `round/correct/{uid} = { at: serverTimestamp }`; order is derived from
  `at` (ties broken by uid — deterministic).
- Wrong guesses (hash mismatch) are pushed to `round/chat` as plaintext. Correct guesses are
  **never** pushed as plaintext (they'd spoil).
- **Residual leak:** salt+hash enables a dictionary attack against the deck, and the deck ships
  in the bundle anyway — same accepted leak class as fibbage; copy that caveat into
  `src/lib/decks/sketch.js`.

## Drawing sync

Strokes live under `round/strokes` (cleared automatically with `round`):

```
round/strokes/{pushId}: {
  c: 0-7,          // palette index
  w: 1|2|3,        // brush size (grid cells)
  p: [x0,y0,x1,y1,...]  // polyline, ints quantized to a 0–255 grid
}
```

- Artist batches pointer samples and flushes a stroke segment every ~100 ms while drawing
  (≈10 writes/s worst case — fine for RTDB).
- Guests subscribe with `onChildAdded` and append; a late joiner replays existing children in
  key order, so the canvas is reconstructable at any time (spectators work for free).
- **Undo:** artist removes its own last stroke key. **Clear:** artist deletes the `strokes` node.
- Rendering: SVG `<polyline>`s with `stroke-linecap="round"`, `shape-rendering="crispEdges"` for
  the retro look. Quantizing to a 256×256 grid both shrinks payloads and gives an inherent
  pixel-art feel.
- **Palette:** 8 fixed colors defined as constants (black, white, red, orange, yellow, green,
  blue, brown). Drawing content must look identical across themes, so this is the deliberate
  theming exception (precedent: cursor sprites). Toolbar chrome themes normally.
- Input: pointer events with `touch-action: none` on the canvas; artist-only.

## Data model

Everything lives in `round` — **no new top-level keys, no `FIELD_NULLS` changes.**

```
round: {
  phase: 'choosing' | 'drawing' | 'reveal',
  cycle: 1 | 2,
  artist: uid,
  order: [uid, ...],            // seat order snapshot for the match
  options: [i, j, k],           // deck indices offered (public — accepted leak)
  commitment: { hash, salt },   // set when artist picks; word length derivable at pick time
  wordLen: number,
  endsAt: epoch-ms,             // phase deadline (see Timers)
  strokes: { pushId: {...} },
  chat: { pushId: { uid, text } },       // wrong guesses only
  correct: { uid: { at } },
  scored: true,                 // idempotent score application (fibbage pattern)
  revealWord: string,           // written by artist at reveal
}
scores/{uid}: number            // party standard, applied by host
```

`freshGameState('sketch')` → party branch (`round: null` etc.); registry `startRound(players)`
seeds `{ round: { phase: 'choosing', cycle: 1, artist: seatOrder(players)[0], order: seatOrder(players) } }`
(wavelength precedent). The artist's client writes `options` on entering `choosing`.

**Timers:** `endsAt` = artist's clock + Firebase `.info/serverTimeOffset` correction. All clients
render the countdown from corrected time; the **host** client enforces phase transitions on expiry
(artist advances early-end when all guessers are correct). Artist offline mid-draw (presence
`users/{uid}/online` false > 10 s): host shows a SKIP ROUND button that voids the round (no scores)
and advances the artist.

## Files

| File | Contents |
|---|---|
| `src/lib/decks/sketch.js` | ~250 drawable words, `{ word, tier: 1|2|3 }`; option picks = one per tier. Bundle-leak caveat comment. |
| `src/lib/sketchLogic.js` | `normalize`, scoring table, stroke quantize/dequantize, seeded option pick, `nextArtist(order, artist, cycle)` |
| `src/lib/sketchLogic.test.js` | all of the above |
| `src/components/SketchCanvas.jsx` | SVG canvas + artist pointer capture + toolbar (palette, 3 brush sizes, undo, clear) |
| `src/pages/SketchGame.jsx` | phase machine, chat/guess input, scoreboard, reveal screen |
| `GameIcons.jsx`, `games.js`, `Game.jsx` ladder | registration (see README checklist) |

## Edge cases

- Guesser sends the word before drawing starts → guesses only accepted in `drawing` phase.
- Artist reloads: `options`/`commitment` are in Firebase; the *word itself* is recoverable only
  if the artist stores `{ word }` in `localStorage[sketch-word-{gameId}]` at pick time — do this,
  since the artist must write `revealWord` at reveal. Lost storage → SKIP ROUND path.
- Player joins mid-match: becomes a guesser immediately, enters rotation next cycle; late
  joiners start at 0 points (accepted).
- 3-player minimum: with 2 guessers, scoring still works (100/90 + artist 25×n).
- Profanity in guesses/chat: out of scope v1 (private rooms, invited friends).

## Testing

- Unit: normalization (case/space/punctuation), scoring order math, quantize roundtrip,
  artist rotation across cycles, seeded option determinism.
- Manual: 3 browsers (one incognito) — full match, artist disconnect skip, late join, undo/clear
  propagation, mobile draw (touch) + guess.

## Stretch (not v1)

Close-guess "you're warm!" hints (Levenshtein ≤ 2 vs salted-hash n-gram — hard without leaking);
hint letters revealed over time; custom decks per room; stroke smoothing.
