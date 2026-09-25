# Hangwoman

How the two-player hangman game (`gameType: 'hangwoman'`) works today. Read `CLAUDE.md` first for platform conventions; everything Hangwoman-specific is here. Rules live in `src/lib/hangmanLogic.js` (pure, unit-tested in `src/lib/hangmanLogic.test.js`); the page is `src/pages/HangmanGame.jsx`.

## Why commit–reveal

Hangwoman has **hidden state**: the guesser must not see the word, and the whole database is publicly readable. So the word never touches Firebase until the round ends:

1. The word-keeper (setter) computes `sha256(word + salt)` (`src/lib/commit.js`) and writes only the **commitment**, the per-word letter counts and the optional hint. The word, salt and commitment stay in the setter's `sessionStorage` (`hangwoman-word-{gameId}`), which is tab-local.
2. The setter's client grades each guess against its local word.
3. At round end the setter writes `{ word, salt }`. The guesser's client re-hashes it, re-checks every recorded answer, re-derives the result and checks the word against the rule it was locked under (see *Cheat handling*).

## Rules

- **6 wrong guesses = hanged.** One body part per miss: head, body, left arm, right arm, left leg, right leg.
- **Roles alternate every round.** The lobby's first player sets first (X by default). Word guessed before 6 misses → the guesser scores; hanged → the setter scores.
- **One pending guess at a time.** The guesser taps a letter, it shows as pending (…), and the keyboard stays locked until the setter's client has graded it. The physical keyboard ignores the room chat and other text fields, Cmd/Ctrl/Alt shortcuts and key repeats (`useGameKeys`). Tried keys show ✓ (in the word), ✗ (not in the word) or … (checking), with matching aria-labels.
- **Match: first to 3 with equal setter turns.** The match ends only when a player has 3 round wins **and** both players have set the same number of rounds, or when the trailing player can no longer catch up in the setter turn still owed to them. A tie at that point is **sudden death**: the first player ahead after an equal number of setter turns wins (`getHangwomanMatchWinner`). The match target comes from the registry (`matchTarget: 3`). The page shows `ROUND n / EQUAL TURNS / FIRST TO 3` (or `SUDDEN DEATH`) in the `MatchScoreRail`.

### Setter words (captain decision D3(a), reversible)

`validateSetterWord(raw, { rule, dictionary })`:

| Rule | Allowed |
|---|---|
| Default (`'dictionary'`) | One word from the Word Hunt list (`public/wordhunt-dict.txt`, via `loadDictionary()`), 4+ letters (max 30), A–Z only. The button reads LOADING WORDS… until the list has loaded; a failed load offers RETRY. |
| House rule **ANY WORD** (`'any'`) | The old free-form rule: 3–30 letters, A–Z and spaces, phrases allowed (names, in-jokes). |

Under both rules, banned words (`isBannedWord`, `src/lib/wordDenylist.js`) are refused, checked per word and for the whole phrase run together. The optional hint may not contain the word, case-insensitively — for a phrase also any of its 3+ letter words other than short function words (THE, AND, …) (`hintRevealsWord`). Each refusal shows a reason inline (e.g. `ONE WORD ONLY — TURN ON ANY WORD FOR PHRASES`, `NOT IN THE WORD LIST — TURN ON ANY WORD TO ALLOW IT`, `THE HINT GIVES THE WORD AWAY`).

The house rule is a room preference at `games/{id}/hangwomanAnyWord` (not in `FIELD_NULLS`, so it persists across rounds, matches and game switches). Either player can toggle it while a word is being chosen (transaction guarded on `round.phase === 'setting'`); both see its state. When the word is locked the rule it was checked under is recorded as `round.wordRule`; if ANY WORD was turned off between checking and locking, the lock is refused and the setter re-checks.

## Advancing and stalls

All timers use the server-corrected clock (`useServerClock`). Values are exported from `hangmanLogic.js` and are starting points to playtest.

| Constant | Value | Meaning |
|---|---|---|
| `AUTO_ADVANCE_MS` | 8 s | A verified reveal advances on its own |
| `PRESENCE_GRACE_MS` | 10 s | An opponent must be offline this long before a disconnect claim appears |
| `SETTING_DEADLINE_MS` | 120 s | No word locked → the guesser may claim |
| `GRADING_STALL_MS` | 60 s | A guess ungraded this long → the guesser may claim |
| `GUESSER_IDLE_MS` | 60 s | No new guess this long (from the start of guessing or the last grade, never while a guess is pending) → the setter may claim |

- **Next round:** after the reveal **either player** can start the next round (a `runTransaction` on the game node, guarded on the same reveal still being on screen, scored from live values). The guesser may always advance; the setter may once the guesser's client has verified the reveal (`round.verified`) or flagged a cheat, or once the guesser has been offline past the grace. The round auto-advances `AUTO_ADVANCE_MS` after a verified reveal (never after a cheat, so the evidence stays readable).
- **Stall claims award the point to the side that isn't stalling** (`getRoundClaim`). CLAIM ROUND (+1) appears for the player who is being stalled: the guesser when no word is set in time, when their guess sits ungraded, or when the setter has been offline past the grace; the setter when the guesser stops guessing or has been offline past the grace (after the word is locked). Countdowns show to the claimant in the last 30 s (always for the no-word deadline and the grace), and the stalling side sees a matching warning (LOCK A WORD WITHIN / GUESS WITHIN). The claim transaction re-checks the stall against live data, and a disconnect claim also requires the server's presence to still say offline.
- **Lost word:** a setter whose word is gone (new tab, or a stored word from another round) sees CONCEDE ROUND, which gives the guesser the point.
- **Platform CLAIM WIN:** `Game.jsx` offers CLAIM WIN after an opponent is offline 60 s and writes `status: 'finished'` + `winner`. The page treats `status === 'finished'` as match over (using `game.winner`) and stops all input and timers.

Every end-of-round path (advance, claim, concede) goes through `buildNextRound()`: score the winner, count the setter's turn in `round.turns`, swap the setter, reset the round and set `status`/`winner` when the match is decided.

## Cheat handling

The guesser's client verifies every reveal:

- **HASH OK** — `sha256(word + salt)` matches the commitment.
- **ANSWERS OK** — every recorded hit/miss matches the word (`verifyRoundConsistency`).
- **RESULT OK** — the written `result` matches the result re-derived from the word and the recorded guesses (`deriveRoundResult`).
- **WORD RULE OK** — the word follows `round.wordRule` (dictionary + 4+ letters + not banned, or the ANY WORD rule). Skipped for rounds locked by older clients; the dictionary part is skipped if the list can't load within 4 s, so a slow network never produces a false cheat.

All pass → the guesser writes `round.verified: true`. Any fail → the guesser writes the binding `round.cheatDetected: true`: the guesser sees CHEAT DETECTED with the evidence, the setter and spectators see the forfeit screen, and **the guesser takes the point** — either player's NEXT ROUND awards it.

## Data model

Extends `games/{gameId}` (see `CLAUDE.md`). No `board` or `currentTurn`.

```
hangwomanAnyWord: true | absent          // house rule; room preference, not reset between matches
round: {
  setter:            "X" | "O"
  phase:             "setting" | "guessing" | "reveal"
  turns:             { X, O }            // rounds each player has set this match (absent = 0)
  wordStructure:     [3, 5]              // letters per word; legacy rounds may have wordLength instead
  hint:              "..." | absent
  commitment:        "<hex sha256(word + salt)>"
  wordRule:          "dictionary" | "any"
  guesses:           { "A": [0, 3], "Q": false, "E": "pending" }   // positions, false = miss
  wrongCount:        3
  lastGuess:         { letter, hits }    // last graded guess (drives the aria-live feedback line)
  settingStartedAt:  ts                  // anchors SETTING_DEADLINE_MS
  guessingStartedAt: ts                  // anchors GUESSER_IDLE_MS before the first grade
  pendingAt:         ts | absent         // when the pending guess was sent (GRADING_STALL_MS)
  gradedAt:          ts                  // last grade (GUESSER_IDLE_MS)
  reveal:            { word, salt }      // written only at round end
  revealAt:          ts                  // anchors AUTO_ADVANCE_MS
  result:            "guessed" | "hanged"
  verified:          true | absent       // guesser's client checked the reveal
  cheatDetected:     true | absent       // guesser's client proved a cheat
}
```

Firebase gotchas (`.claude/rules/firebase-rules.md`): `false` is the miss marker (Firebase deletes empty arrays); positions can come back as numeric-keyed objects, so `normalizeGuesses()` maps them; absent fields read as `?? null`.

## Guess loop

1. Guesser taps a letter → a transaction on `round` writes `guesses/{L} = 'pending'` and `pendingAt`, refusing if anything is already pending (`canQueueGuess`).
2. The setter's client listens on `round/guesses`. For a pending letter it runs a transaction (guarded on `phase === 'guessing'` and its stored commitment) that applies `gradePending()`: positions or `false`, `wrongCount`, `gradedAt`, `lastGuess`, `pendingAt: null`, and — once the word is complete or the sixth miss lands — `phase: 'reveal'`, `result`, `reveal`, `revealAt`. Leftover pending letters (older clients) are graded alphabetically and grading stops the moment the round is decided; the rest are discarded, so six misses hang her even if a later letter would have completed the word.
3. The guesser's client verifies the reveal (above), then either player advances.

## UI

- `MatchScoreRail` replaces the platform player cards (names, score, pips, OFFLINE).
- `WordDisplay` sizes cells by the longest word (≤ 8 letters full size, 9–11 smaller, 12+ smallest and wrapping) and wraps phrases at spaces, so nothing overflows a 360 px phone. It is exposed to screen readers as one labelled image ("Hidden word, 4 letters: J blank Z Z").
- `WordFeedback` announces each guess result ("A IS IN THE WORD × 2", "Q IS NOT IN THE WORD · 3/6 WRONG"); a polite live region announces the round end and the winner.
- Buttons follow the busy rule (`useBusy`): LOCKING…, STARTING…, CLAIMING…, CONCEDING…, SAVING…, with `toast.error` on failure.

## Known limits

- The word lives in one browser tab; a setter who opens the game in a new tab must concede.
- Short rare-letter dictionary words (JAZZ, FUZZ, LYNX) remain strong setter picks; equal setter turns keep that symmetric rather than removing it.
- The solo `/demo` has you set and guess your own word; a bot word-keeper is a follow-up.
- Multiplayer flows are verified by hand (two browser profiles), not by automated tests.
