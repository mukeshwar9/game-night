# PRD — Password Duel

**One-liner:** 2-player word clue game — one player gives short clues, the other guesses the secret word. Roles swap every round; first to the target score wins.

| | |
|---|---|
| `type` | `password` |
| Label / badge | `PASSWORD` / `PW` |
| Category | `word` |
| Players | 2 |
| Integration | **C** — custom 1v1 page |
| Network | RTDB only |
| Effort | **M** |
| Priority | P2 — small 2-player word game with strong replay value |

## Goals

- Add a true 2-player Password-style game.
- Keep rules simple enough for quick mobile play.
- Make it look polished and game-show-like, not like a form.
- Avoid complicated phrases; deck should be common single words only.
- Avoid repeated words within a match, and avoid the same first words after replay/new match.
- Reuse platform room, invite, presence, rematch, switch-game, sound, and score conventions.

## Non-goals for v1

- No 4-player team mode.
- No voice chat.
- No custom decks.
- No clue legality AI/NLP beyond simple exact/substring checks.
- No asynchronous/pass-and-play mode.
- No dictionary-wide semantic validation.

## Game rules

### Match

- Two players: X and O.
- Players alternate roles each round:
  - **Clue-giver** sees secret word.
  - **Guesser** does not see secret word and submits guesses.
- First player to `TARGET_SCORE = 15` wins the match.
- If neither player reaches target after `MAX_ROUNDS = 12`, higher score wins; equal score is a draw.
- New match creates a new match seed and clears used words.

### Round

1. **Reveal to clue-giver (2 s)**
   - Secret word appears only to clue-giver.
   - Guesser sees locked word card with blanks/count.
2. **Clue turn**
   - Clue-giver enters one clue.
   - Clue must be 1 word, max 16 chars.
   - Clue cannot contain secret word, and secret word cannot contain clue.
   - Clue cannot repeat a previous clue this round.
3. **Guess turn**
   - Guesser sees clue history and enters one guess.
   - Guess max 24 chars.
   - Correct guess ends round and awards points.
   - Wrong guess advances to next clue, up to `MAX_CLUES = 5`.
4. **Round reveal (5 s)**
   - Secret word shown to both players.
   - Points awarded if guessed.
   - Next round swaps roles.

### Scoring

Points depend on how quickly word was guessed:

| Clue number | Points |
|---:|---:|
| 1 | 5 |
| 2 | 4 |
| 3 | 3 |
| 4 | 2 |
| 5 | 1 |

- Correct guess: guesser gets points.
- Clue-giver gets no points in v1.
- No correct guess after 5 clues: 0 points.
- This keeps incentives simple: clue-giver helps opponent, but role alternates and total skill is clue quality + guessing.

Optional post-v1 scoring variant: clue-giver also gets half the points when guesser succeeds, encouraging helpful clues in casual play. Do not include in v1 unless playtesting feels adversarial.

## Word deck

File: `src/lib/decks/password.js`

- 250–400 common words.
- Single words only.
- No proper nouns.
- No obscure vocabulary.
- No plural/singular near-duplicates where possible.
- No offensive/slur words.
- Mix tiers for difficulty:
  - tier 1: concrete easy nouns (`apple`, `chair`, `river`)
  - tier 2: common but less visual words (`doctor`, `winter`, `music`)
  - tier 3: abstract/common challenge words (`brave`, `secret`, `balance`)
- Secret word draw uses seeded shuffle + `used` list.
- New match/replay uses new `matchSeed`, so first words change instead of repeating.

Deck entry shape:

```js
{ word: 'planet', tier: 1 }
```

Bundle leak caveat applies: deck ships in client bundle, so a player can inspect it. This is accepted for deck games in this platform.

## Data model

All Password-specific state lives under `round`, so no new top-level keys are required beyond existing `round`/`scores` cleanup.

```
round: {
  phase: 'intro' | 'clue' | 'guess' | 'reveal' | 'finished',
  roundNum: number,
  clueGiver: 'X' | 'O',
  guesser: 'X' | 'O',
  matchSeed: string,
  used: number[],              // deck indices already used this match
  wordIndex: number,
  wordPattern: string,         // public blanks/count, e.g. "6"
  clues: [
    { text: string, at: number }
  ],
  guesses: [
    { text: string, at: number, correct: boolean }
  ],
  lastDelta: {
    player: 'X' | 'O',
    points: number,
    clueNumber: number,
  } | null,
  endsAt: epochMs,
}

scores: { X: number, O: number }
winner: 'X' | 'O' | 'draw' | null
status: 'waiting' | 'playing' | 'finished'
```

Notes:

- `wordIndex` is public, so secret can be derived by inspecting Firebase. For v1, this is acceptable under bundle-leak/honest-client trust tier.
- If stronger casual secrecy is desired, use commit-reveal like Hangwoman/Sketch: store `commitment` during clue/guess phases and reveal `wordIndex` only in reveal. This adds complexity but not real protection from bundled deck inspection. Prefer public `wordIndex` v1.
- `endsAt` supports small phase transitions/animations, not strict timers for clue/guess. No turn timer in v1.

## Logic module

File: `src/lib/passwordLogic.js`

Pure exports:

```js
export const TARGET_SCORE = 15
export const MAX_ROUNDS = 12
export const MAX_CLUES = 5
export const CLUE_POINTS = [5, 4, 3, 2, 1]

export function normalizeText(text)
export function validateClue({ clue, word, previousClues })
export function isCorrectGuess(guess, word)
export function scoreForClueNumber(clueNumber)
export function nextRoles(currentClueGiver)
export function pickWord(deck, seed, used)
export function createInitialRound({ starter, seed, wordIndex })
export function applyClue(round, clue, now)
export function applyGuess(round, guess, word, now)
export function advanceAfterReveal(round, scores, deck, now)
export function getMatchWinner(scores, roundNum)
```

Validation details:

- `normalizeText`: lowercase, trim, collapse whitespace, strip punctuation for comparisons.
- Clue must become exactly one token after normalization.
- Clue invalid if normalized clue equals normalized word.
- Clue invalid if word includes clue or clue includes word and both are length >= 3.
  - Example: secret `snowman`, clue `snow` invalid.
  - Example: secret `cat`, clue `catch` invalid.
- Repeated clue invalid by normalized comparison.
- Guess correct if normalized guess equals normalized word.

Unit tests:

- clue validation accepts simple clues.
- rejects blank, multi-word, repeated, exact word, word part.
- guess normalization handles punctuation/case.
- scoring table boundaries.
- role alternation.
- seeded word pick deterministic and excludes used.
- match winner target score, max rounds, draw.
- new match seed changes first pick.

## Page/component plan

### Files

| File | Contents |
|---|---|
| `src/lib/decks/password.js` | word deck + bundle-leak caveat |
| `src/lib/passwordLogic.js` | pure rules/helpers |
| `src/lib/passwordLogic.test.js` | logic tests |
| `src/pages/PasswordGame.jsx` | Firebase wiring + phase UI |
| `src/components/PasswordCard.jsx` | polished word/clue/guess display |
| `src/components/GameIcons.jsx` | Password icon |
| `src/lib/games.js` | registry entry + `freshGameState('password')` branch |
| `src/lib/rules.js` | rules modal copy |
| `src/pages/Game.jsx` | custom game ladder case |

### Registry

Add game entry:

```js
{
  type: 'password', label: 'PASSWORD',
  desc: 'give clues, guess word', Icon: PasswordIcon,
  badge: 'PW', maxWidth: 'max-w-sm',
  category: 'word',
  custom: true,
}
```

`freshGameState('password')` returns:

```js
{
  ...FIELD_NULLS,
  board: null,
  boxes: null,
  currentTurn: null,
  round: null,
}
```

Game start:

- Standard 2-player custom flow starts when O joins.
- First clue-giver should alternate by `starter` if available, otherwise X.
- Create `round` when status becomes `playing` and no round exists.
- Store `matchSeed` in round.

## Firebase write flow

### Start round

First seated client that sees `status === 'playing' && !round` runs transaction:

1. Confirm still no round.
2. Choose match seed.
3. Pick first word index from deck.
4. Set round phase `intro`, roles, used `[wordIndex]`, blank pattern, `endsAt`.

### Intro to clue

After intro deadline, either client may transaction phase to `clue` if still `intro`.

### Submit clue

Clue-giver only:

1. Validate locally.
2. Transaction checks phase is `clue`, actor is clue-giver, clue count < 5.
3. Append clue.
4. Set phase `guess`.

### Submit guess

Guesser only:

1. Normalize and compare to secret word from deck.
2. Transaction checks phase is `guess`, actor is guesser.
3. Append guess with `correct` boolean.
4. If correct:
   - compute points from clue count.
   - increment `scores/{guesser}`.
   - set `lastDelta`.
   - set phase `reveal`.
5. If wrong and clues length >= 5:
   - set phase `reveal`, `lastDelta: null`.
6. Else:
   - set phase `clue`.

### Reveal to next round / finish

After reveal deadline, either client runs transaction:

1. Check winner via `TARGET_SCORE` or `MAX_ROUNDS`.
2. If winner: set `status: 'finished'`, `winner`, clear proposal.
3. Else: create next round with swapped roles, next word from seeded deck excluding `used`.

## UX and visual direction

User explicitly wants it to look nice. Treat v1 visual polish as acceptance, not stretch.

### Overall mood

- Retro game-show panel.
- Dark arcade card, neon accents, big readable word/clue states.
- Feels more like a TV clue board than a chat form.
- Mobile-first, max width `max-w-sm`.

### Layout

Top:

- Compact score rail: `YOU 7` vs `THEM 5`, target marker `15`.
- Role pill: `YOU GIVE CLUE` / `YOU GUESS`.
- Round indicator: `ROUND 4/12`.

Center:

- Large `PasswordCard` with states:
  - Clue-giver sees secret word in bright `retro-cta` with subtle glow.
  - Guesser sees locked card: `••••••` or `_ _ _ _ _ _` plus word length.
  - Reveal flips card and shows word to both.
- Card should animate on role/phase change with existing `modal-pop`/CSS keyframes or Framer Motion if already used nearby.

Clue history:

- Vertical ladder of up to 5 clue slots.
- Each row: clue number token + clue text + guess result.
- Empty slots dim with small pixel dots.
- Correct guess row flashes `retro-win`.
- Wrong guesses show dim red/p2 outline, not harsh error screen.

Input area:

- Big single input with phase-specific placeholder:
  - `TYPE ONE-WORD CLUE…`
  - `TYPE YOUR GUESS…`
- Primary button label:
  - `SEND CLUE`
  - `GUESS`
- Invalid clue shows inline chip below input, e.g. `CLUE CAN'T USE PASSWORD`.
- Buttons follow `useBusy()` convention.

Reveal:

- Big word flip.
- `+5` / `+3` points burst near winner score.
- If no guess: `NO POINTS` with muted shake.
- Next role preview: `NEXT: YOU GUESS`.

End screen:

- Reuse custom-game end style.
- Show final score as big split scoreboard.
- CTA buttons: `PLAY AGAIN`, `NEW MATCH`, `SWITCH GAME` depending shared custom conventions.

### Animation/sound

- Secret card flip/pop on reveal.
- Correct guess: `sounds.win()` or `sounds.hit(points)`.
- Wrong guess: `sounds.miss()` lightly.
- New clue arrives: `sounds.bell()` for guesser.
- Round start: `sounds.go()`.
- Match win/lose use existing match sounds.
- Keep animations short; no blocking transitions.

### Accessibility

- All state uses text, not color only.
- Inputs have labels/aria labels.
- Focus moves to active input when phase changes.
- Correct/wrong feedback announced as text.
- No fast timer pressure in v1; readable for casual play.

## Rules modal copy

Objective:

> Give clues that help your opponent guess the password. Then swap roles and try to score more when you guess.

How to play:

- One player sees the secret password.
- They send one-word clues.
- The other player guesses after each clue.
- Earlier guesses score more points.
- Roles swap every round.

To win:

> First to 15 points wins. If nobody reaches 15 after 12 rounds, high score wins.

## Edge cases

- Player disconnects mid-round: show existing offline notice; allow game to continue when they return.
- Clue-giver submits invalid clue: local error, no Firebase write.
- Two clients advance reveal at same time: transaction guards phase/round number.
- Deck exhausted: allow reuse only after all words used; with 250+ words this should not happen in v1.
- Existing rooms created before deploy: if `round` missing, game initializes defensively.
- Spectators: can see public clue/guess history and reveal; during active clue phase, spectators should not see secret word unless using public `wordIndex` via devtools. UI must hide it.

## Manual test plan

Use two browser profiles/incognito.

1. Create Password room; second player joins; game starts.
2. X sees secret, O sees blanks.
3. X submits valid clue; O receives clue.
4. O wrong guess; phase returns to clue.
5. X attempts invalid clue using secret word; blocked locally.
6. O guesses correctly on clue 2; O gains 4 points.
7. Reveal shows secret and score delta.
8. Next round swaps roles.
9. Continue until target score; match finishes with correct winner.
10. Play again/new match uses different first word.
11. Switch away and back clears stale Password state.
12. Mobile viewport: card, ladder, input remain visible and attractive.

## Implementation sequence

1. Create deck and logic module with tests.
2. Add visual `PasswordCard` component.
3. Add `PasswordGame.jsx` phase UI and Firebase transactions.
4. Register icon/game/rules/fresh state/Game.jsx ladder.
5. Add targeted tests.
6. Run focused tests and build.
7. Manual two-profile smoke test.

## Acceptance criteria

- Password appears in game picker.
- Supports exactly two seated players.
- Roles alternate every round.
- Clues are one word and cannot include secret word.
- Correct guesses score 5–1 by clue number.
- Match ends at 15 points or after 12 rounds.
- New match/play again does not repeat same initial word due deterministic static seed.
- UI has polished game-show card, score rail, clue ladder, and reveal animation.
- No new Firebase top-level keys remain uncleared when switching games.
- Logic tests cover scoring, clue validation, role rotation, and word picking.
