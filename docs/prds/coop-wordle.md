# PRD — Word Co-op (co-op Wordle-style)

**One-liner:** two players solve the same 5-letter word together on one shared board, taking turns proposing guesses and reacting to the same clue feedback.

| | |
|---|---|
| `type` | `wordcoop` |
| Label / badge | `WORD CO-OP` / `WC` |
| Category | `word` |
| Players | 2 |
| Integration | **C** — custom 1v1 page |
| Network | RTDB |
| Effort | **S/M** |
| Priority | P2 — friendly non-adversarial word mode |

## Goals

- Add a cooperative word game for two friends.
- Reuse existing Word Duel dictionary and tile-marking logic.
- Make it feel visually polished: shared board, partner presence, turn baton, celebratory reveal.
- Keep rules simple: one shared puzzle, six guesses, win together or lose together.
- Avoid trademarked UI/name language in product copy; call it `WORD CO-OP`.

## Non-goals for v1

- No solo daily mode.
- No voice/chat beyond existing room reactions/chat.
- No custom word entry.
- No 6-letter or hard-mode variants.
- No AI hint system.

## Game rules

- Both players solve the same secret 5-letter answer.
- Players alternate guess turns.
- X guesses first unless `starter` says O.
- Maximum `MAX_GUESSES = 6` total shared guesses.
- Every guess must be in the valid guess list.
- Feedback uses existing Wordle tile rules:
  - green: right letter, right spot
  - yellow: letter exists elsewhere
  - gray: absent
  - duplicate letters use two-pass consume algorithm from `wordduelLogic.markGuess()`.
- If either player enters the correct answer, both players win the round.
- If 6 guesses fail, both lose the round.
- Match score can use normal room scores:
  - Shared win: both `scores.X` and `scores.O` increment by 1.
  - Shared loss: no score increment.
- `PLAY AGAIN` starts a new shared word while keeping match scores.
- `NEW MATCH` resets both scores.

## Answer selection

Use same dictionary infrastructure as Word Duel:

- Answer chosen by deterministic seeded pick from answer list.
- Match/round seed is generated in `freshGameState('wordcoop')` or first round transaction.
- Store answer as `answerIndex` in `round` for v1.
- This is an honest-client/bundle-leak game: answer list ships to client, so a determined user can inspect it. Accepted for v1.

Optional later stronger variant:

- Host commits answer hash and reveals at end. Not needed v1 because both players cooperate and cheating only ruins their own round.

## Data model

All Word Co-op state lives in `round`.

```
round: {
  phase: 'playing' | 'reveal',
  seed: string,
  answerIndex: number,
  currentTurn: 'X' | 'O',
  guesses: [
    { by: 'X' | 'O', word: string, marks: 'GGYBB', at: epochMs }
  ],
  result: null | {
    outcome: 'win' | 'loss',
    solvedBy: 'X' | 'O' | null,
    answer: string,
  },
  endsAt: epochMs,        // reveal auto-advance / UI countdown only
}
```

Top-level:

```
status: 'waiting' | 'playing' | 'finished'
scores: { X: number, O: number }
winner: null | 'draw'
```

Notes:

- There is no competitive winner; round result is shared.
- For existing standard match machinery, use `winner: 'draw'` only when ending a cooperative match is needed. Prefer custom page controls rather than forcing normal winner semantics.
- Add `round: null` cleanup through existing `freshGameState()` custom branch; no new top-level keys.

## Logic module

File: `src/lib/wordcoopLogic.js`

Reuse/import `markGuess`, `isValidGuess`, and dictionary helpers from Word Duel where possible.

Pure exports:

```js
export const MAX_GUESSES = 6
export const WORD_LENGTH = 5

export function pickAnswer(answerList, seed, used = [])
export function nextTurn(currentTurn)
export function canSubmitGuess(round, player)
export function applySharedGuess(round, { player, guess, answer, at })
export function getRoundOutcome(round)
export function createNextRound({ previousRound, seed, starter, answerIndex })
```

Unit tests:

- turn alternates after wrong guess.
- correct guess ends round as win.
- sixth wrong guess ends round as loss.
- invalid turn cannot submit.
- answer pick is deterministic and excludes used.
- duplicate-letter marking is covered by reused `wordduelLogic` tests; add one integration fixture.

## UI and visual direction

User wants word games to look nice. Treat polish as acceptance.

### Overall mood

- Cozy co-op arcade puzzle.
- Same tile familiarity as Word Duel, but warmer: "we solve together".
- Use theme tokens only; no hardcoded colors.

### Layout

Top:

- `WORD CO-OP` title.
- Shared status pill:
  - `YOUR TURN`
  - `PARTNER THINKING…`
  - `YOU BOTH WIN!`
  - `WORD ESCAPED`
- Player chips left/right with avatars and online dots.
- Small shared streak/match score: `WINS 3`.

Center:

- One big 6×5 shared board.
- Each row shows who guessed it via small X/O/avatar chip at row start.
- Current empty row pulses with `retro-cta` border when it is your turn.
- Tile flip animation on submission. Use existing CSS/Framer Motion patterns if available.

Input:

- On-screen keyboard shared by both players.
- Physical keyboard support.
- Disabled state when not your turn with clear copy: `WAITING FOR PARTNER`.
- Submit button: `LOCK GUESS`.

Partner awareness:

- When partner submits, row animates in from their side.
- Small text under board: `MAYA PLAYED CRANE` after reveal of row.
- Reactions remain available through existing EmoteBar.

Reveal:

- Win: board glow, `SOLVED TOGETHER`, show guess count `4/6`.
- Loss: answer flips in large word card, `ANSWER WAS PLANT`.
- Buttons: `PLAY AGAIN`, `NEW MATCH`, `SWITCH GAME`.

Accessibility:

- Tiles include letters and textual mark labels for screen readers.
- Color not sole signal: green/yellow/gray also gets icons/classes (`✓`, `•`, `×`) consistent with Word Duel.
- Focus goes to input only on player's turn.

## Firebase flow

### Initialize

When room reaches `status === 'playing'` and `round` missing:

1. First observing client runs transaction.
2. Generate `seed` and answer index.
3. Set `phase: 'playing'`, `currentTurn: starter || 'X'`, empty guesses.

### Submit guess

Transaction on `games/{gameId}`:

1. Validate phase is `playing`.
2. Validate `currentTurn === mySeat`.
3. Validate guesses length < 6.
4. Validate guess is dictionary-valid.
5. Compute marks using answer.
6. Append guess.
7. If solved: set `phase: 'reveal'`, `result.outcome = 'win'`, increment both scores.
8. Else if guesses length becomes 6: set `phase: 'reveal'`, `result.outcome = 'loss'`.
9. Else flip `currentTurn`.

### Next round

After reveal, either player may press `PLAY AGAIN`:

- Keep scores.
- Pick new answer excluding prior used words if tracked.
- Alternate starter from previous round.

## Files

| File | Contents |
|---|---|
| `src/lib/wordcoopLogic.js` | pure round helpers |
| `src/lib/wordcoopLogic.test.js` | unit tests |
| `src/pages/WordCoopGame.jsx` | Firebase flow and UI |
| `src/components/WordGrid.jsx` or reuse WordDuel grid pieces | shared board/keyboard if extraction is low-risk |
| `src/components/GameIcons.jsx` | `WordCoopIcon` |
| `src/lib/games.js` | registry entry and fresh state |
| `src/lib/rules.js` | rules modal copy |
| `src/pages/Game.jsx` | custom ladder case |

## Reuse/refactor note

Word Duel likely has reusable board/keyboard pieces inside `WordDuelGame.jsx`. If extraction is small and safe, extract shared presentational pieces:

- `WordTileGrid`
- `WordKeyboard`
- `WordGuessInput`

If extraction touches too much, duplicate small rendering code for v1 and refactor later. Do not risk Word Duel regression for cleanup.

## Rules modal copy

Objective:

> Solve one secret word together in six guesses or fewer.

How to play:

- You and your partner share one board.
- Take turns entering guesses.
- Green means right letter and spot.
- Yellow means the letter is in the word but elsewhere.
- Gray means the letter is not in the word.

To win:

> Guess the word before all six rows are used. You both win or lose together.

## Edge cases

- Partner disconnects: show existing offline notice; input disabled if it is their turn.
- Player reloads: state is fully in Firebase; can resume.
- Both clients submit at once: transaction enforces current turn.
- Invalid guess: local validation and transaction guard.
- Spectator: can see board and reveal, cannot type.
- Same answer repeats after many rounds: avoid until deck exhausted.

## Manual test plan

1. Two profiles join room.
2. X submits wrong guess; turn flips to O.
3. O submits wrong guess; turn flips to X.
4. Correct guess by either player produces shared win and increments both scores.
5. Six wrong guesses produces loss and no score increment.
6. Reload one player mid-round; state resumes.
7. Partner offline on their turn shows blocked state.
8. Play again picks new answer and alternates starter.
9. Mobile layout: board, keyboard, and status pill fit and look polished.

## Acceptance criteria

- Game appears in picker as `WORD CO-OP`.
- Exactly two players can play.
- One shared board, alternating turns.
- Existing Wordle duplicate-letter marking is correct.
- Both players win together or lose together.
- Play again gives a new word.
- Visual polish includes shared board, row owner chips, status pill, tile flips, and reveal state.
- Unit tests cover core logic.
