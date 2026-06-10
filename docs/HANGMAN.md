# Hangman — build specification

A complete, self-contained brief for adding Hangman to the platform. Read `CLAUDE.md` and `README.md` first for codebase conventions; everything Hangman-specific is here.

## Why this design

Hangman is the platform's first game with **hidden state** (the guesser must not see the word). The whole database is publicly readable (`.read: true`), so storing the word in plaintext means anyone can read it in DevTools. This spec uses a **commit–reveal scheme** instead — no Firebase Auth required, no security-rules changes required, and the crypto module it produces is reusable for Battleship later.

How commit–reveal works here:
1. The setter computes `sha256(word + salt)` and writes only the **hash** and the **word length** to Firebase. The actual word stays in the setter's `sessionStorage`.
2. Each guess is resolved by the **setter's client** (it has the word): it writes back the matched positions for the guessed letter.
3. At round end the setter writes `{ word, salt }`. The guesser's client re-hashes and verifies it matches the original commitment, AND that every answer given during the round is consistent with the revealed word. Any mismatch → "CHEAT DETECTED" screen. The setter cannot retroactively change the word or lie about a hit without being caught.

Liveness tradeoff (accepted): if the setter disconnects, guesses stall until they return. The existing presence system already detects and surfaces this.

## Game rules (locked decisions — do not redesign)

- **6 wrong guesses = hanged.** Maps 1:1 onto six body parts: head, body, left arm, right arm, left leg, right leg.
- **Roles alternate every round.** The match starts with X as setter. Guesser completes the word before 6 misses → guesser scores a point; word survives → setter scores. Reuse the existing `scores/{X,O}` node and first-to-3 match-over logic from `Game.jsx`.
- **Words:** A–Z only, 3–12 letters, uppercase on entry. No dictionary check (social rule between friends). Validation lives in `validateWord()`.
- **Duplicate guesses are impossible** — the on-screen keyboard disables tried letters.
- **Spectators** see exactly what the guesser sees (blanks + guesses). This is automatic: the word is never in the database.

## Data model

Extends the existing `games/{gameId}` node. Everything already there (`status`, `players`, `presence`, `scores`, `createdAt`, `gameType`) works unchanged. New/changed fields:

```
gameType: "hangman"
board:    not used (omit; do not write 9 empty cells)
round: {
  setter:     "X" | "O"          // whose word it is this round
  phase:      "setting" | "guessing" | "reveal"
  wordLength: 7                  // public — renders the blanks
  commitment: "<hex sha256(word + salt)>"
  guesses: {                     // letter → matched positions; [] (store as miss marker) = wrong guess
    "A": [0, 3],
    "E": [1],
    "Q": false                   // Firebase deletes empty arrays — use `false` for a miss
  }
  wrongCount: 3                  // maintained by the setter's client; drives the gallows
  reveal: { word: "PLATFORM", salt: "<hex>" }   // written only at round end
  result: "guessed" | "hanged"   // written with reveal
}
```

**Firebase gotchas that apply** (see CLAUDE.md): Firebase deletes keys set to `null` and empty arrays/objects. Use `false` as the miss marker in `guesses` (never `[]`). Read absent fields with `?? null`. Guess positions arrive as arrays OR numeric-keyed objects — normalize like `normalizeBoard()` does.

The setter's plaintext word is stored at `sessionStorage["hangman-word-{gameId}"]` and removed after reveal.

## Guess-loop protocol

1. Guesser taps a letter → writes `round/guesses/{letter} = "pending"`.
2. Setter's client has an `onValue` listener on `round/guesses`. For any `"pending"` entry it computes positions from its local word and writes, in one `update()`: the positions (or `false`), the new `wrongCount` if it was a miss, and — if the round just ended — `phase: "reveal"`, `result`, and `reveal: { word, salt }`.
3. Both clients react to the snapshot: keyboard updates, blanks fill in, gallows draws.
4. Guesser's client, on seeing `reveal`, runs verification (see `commit.js` below). On failure render the CHEAT DETECTED state.
5. After reveal, either player can tap "NEXT ROUND" → swap `round/setter`, reset `round` to `phase: "setting"` with fresh empty fields, increment the winner's score. First to 3 → existing match-over screen, "NEW MATCH" resets scores (mirror `handleNewMatch` in `Game.jsx`).

Round end conditions (setter's client decides): all distinct letters of the word matched → `"guessed"`; `wrongCount` reaches 6 → `"hanged"`.

## Files to create

```
src/lib/commit.js              # commit–reveal primitives (REUSABLE — keep game-agnostic)
src/lib/hangmanLogic.js        # pure game logic, no DOM/network/Firebase
src/lib/hangmanLogic.test.js   # Vitest (see Testing below)
src/lib/commit.test.js
src/components/HangmanGallows.jsx   # SVG gallows + pixel-sprite figure
src/components/WordDisplay.jsx      # blanks / revealed letters
src/components/LetterKeyboard.jsx   # on-screen A–Z grid
src/components/WordSetter.jsx       # word entry + LOCK IT IN
```

Files to modify: `src/pages/Game.jsx` (add the hangman branch / registry entry), `src/pages/Home.jsx` (add card to `GAMES` array), `src/pages/Demo.jsx` (local-only hangman demo), `src/lib/sounds.js` (add `thud` miss sound if not composable from existing tones).

### `src/lib/commit.js`

```js
// Web Crypto, no dependencies. All values hex strings.
export async function commit(secret)             // → { hash, salt }  (salt: 16 random bytes)
export async function verifyReveal(hash, secret, salt)  // → boolean
```

Use `crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + salt))` and `crypto.getRandomValues` for the salt. Async — callers must await.

### `src/lib/hangmanLogic.js`

```js
export function validateWord(raw)            // → uppercased word or null (A–Z, 3–12 chars)
export function applyGuess(word, letter)     // → number[] positions ([] for miss)
export function isWordGuessed(word, guesses) // every distinct letter present in guesses with positions
export function countWrong(guesses)          // misses (entries === false)
export const MAX_WRONG = 6
export function verifyRoundConsistency(word, guesses)
// → true iff every recorded guess answer matches applyGuess(word, letter); used after reveal
```

## Visual spec — retro theme is mandatory

Match the existing aesthetic exactly: Press Start 2P (`font-pixel`) for labels, `font-mono` for body, neon palette (`retro-p1`, `retro-p2`, `retro-cta`, `retro-dim`, `retro-border`, `retro-card`, `retro-bg` — see the Theming section in `CLAUDE.md`; these semantic tokens replaced the original `retro-cyan/pink/yellow` names when the runtime theme system landed), square line caps, existing scanline/vignette overlays.

**The hanged figure is a pixel sprite, NOT a smooth stick figure.**
- Gallows frame: dim cyan strokes, `strokeLinecap="square"`, always visible — same stroke style as `Board.jsx` grid lines.
- The figure: built from filled squares (`<rect>` cells on a ~16×16 SVG grid), `retro-p2` (pink in the default theme), like an 8-bit arcade character.
- Six body-part groups toggled by `wrongCount`: 1 head → 2 body → 3 left arm → 4 right arm → 5 left leg → 6 right leg.
- New parts snap in over 2–3 discrete steps (step-end animation), NOT smooth easing — 8-bit animation is frame-snapped.
- Once the body exists (wrongCount ≥ 2): subtle sway, CSS rotate ±2° loop, `transform-origin` at the rope point.
- On the 6th miss: eyes become X pixels, sprite slumps one pixel down, brief screen flash in pink. Reuse the `WinEffect` particle component for the round-end burst.
- On each miss: a 1-frame screen flicker.

**Other components:**
- `WordDisplay`: pixel-font letters over underscores, `retro-p1` for revealed, `retro-border` for blanks.
- `LetterKeyboard`: A–Z grid of small square buttons (mobile-first, min 40px touch targets). Three states: untried (`retro-border` border), hit (cyan + glow), miss (dim + strikethrough), all disabled when not your turn / already tried. Also accept physical keydown A–Z.
- `WordSetter`: single input (auto-uppercase, maxLength 12) + "LOCK IT IN" button, styled like the Home page name input. Show "WAITING FOR WORD-KEEPER…" to the guesser during `setting` phase.
- CHEAT DETECTED screen: blinking pixel text in `retro-p2`, arcade error-screen style, with the expected vs revealed evidence and a "BACK TO HOME" link.
- Home card icon: tiny pixel gallows, added to the `GAMES` array following the existing inline-SVG pattern.

**Sounds** (extend `src/lib/sounds.js`, Web Audio only, no files): hit → existing move bleep; miss → low descending thud + the body-part draw; round end → existing win/lose jingles; "guessed with 0 misses" → win jingle is fine, no special case.

## Build order (each step verifiable before the next)

1. **Vitest + pure logic.** Add `vitest` as a devDependency, `"test": "vitest run"` script. Write `commit.js` + `hangmanLogic.js` with tests first. (This is the repo's first test setup — keep config minimal; Vite projects need near-zero config. jsdom not required for these pure modules, but `crypto.subtle` needs a recent Node or `@vitest/environment` default — verify `npm test` passes.)
2. **Gallows component on `/demo`.** Build `HangmanGallows` standalone with a wrongCount stepper button on the Demo page. Verify all 6 stages + final animation visually.
3. **Round UI components.** WordSetter, WordDisplay, LetterKeyboard — wire them into a fully local hangman on `/demo` (no Firebase). This local version is the main development loop.
4. **Firebase integration.** Add the `Game.jsx` branch, the guess-loop protocol, presence-aware "WAITING FOR WORD-KEEPER…" pause. Verify with the standard two-tab flow (see CLAUDE.md): create in tab 1, join via link in tab 2, play a full round each direction.
5. **Reveal, verification, role swap, scoring.** Including the CHEAT DETECTED path — test it by manually editing the reveal in the Firebase console mid-game.
6. **Polish + edge cases.** Setter-offline pause, Home card, sounds, mute respect, spectator view, `npm run lint` clean.

## Edge cases checklist

- [ ] Setter offline mid-round → guesses stall, show waiting state (presence already detects this)
- [ ] Letter tapped twice / physical keyboard repeat → ignored (button disabled after first tap)
- [ ] Non-letter keys → ignored
- [ ] Word with repeated letters (e.g. "BANANA") → one guess of A reveals all three positions; `isWordGuessed` counts distinct letters
- [ ] Refresh mid-round as setter → word recovered from `sessionStorage`; if missing (new tab), round is unrecoverable → show forfeit option that ends the round as `"guessed"` for the guesser
- [ ] Guesser refreshes → state fully recovers from Firebase (nothing local needed)
- [ ] Match over at 3 → existing match-over screen; NEW MATCH resets scores and starts a fresh `setting` phase with X as setter
- [ ] Verification failure → CHEAT DETECTED, no score awarded

## Testing expectations

Unit (Vitest): every export of `hangmanLogic.js` (including `verifyRoundConsistency` against tampered words) and round-trip `commit`/`verifyReveal` plus a failing-verify case.

Manual (no automated e2e in this repo): the two-browser-tab flow per CLAUDE.md — full match to 3 points with role swaps, a deliberate cheat via Firebase console, a setter-tab-close mid-round, and a spectator third tab.
