# PRD: DUAL KEY (inspired by Codenames Duet)

## Summary

A 5×5 grid of words sits between two phones. Each phone shows a different secret key marking
some words as **contacts** (to find) and some as **traps**. You take turns giving your partner a
one-word clue plus a number; they tap words they think are your contacts. Find all 15 contacts
before the turns run out, without touching a trap.

- **The twist:** both players hold a key, and the keys overlap. Your contacts are not your
  partner's, a word can be a contact on one side and a trap on the other, and the clue-giver
  alternates every turn, so nobody can run the game.
- Players: 2. Category: word (co-op). Netcode: RTDB, turn-based.
- Effort: **M**. Needs a curated ~400-word list.

## Rules

1. Deal **25 words** from the list. Each side's key has **9 contacts, 3 traps, 13 neutrals**.
   Keys overlap as follows: 3 words are contacts on both keys; 1 of each side's traps is a
   contact on the other side; 1 trap is shared; so there are **15 distinct contacts** in all.
2. Players alternate as **clue-giver**. The clue-giver types one word (no word from the grid,
   no part of one) and a number 0–9.
3. The guesser taps words one at a time. Each tap is judged against the **clue-giver's key**:
   - contact: it is marked found; the guesser may keep going (up to number + 1 taps);
   - neutral: marked as "neutral for the giver", the turn ends, and one **time token** is spent;
   - trap: the game is lost.
4. The guesser may stop at any time after the first tap.
5. There are **9 time tokens**. When they run out, each player gets one more sudden-death turn
   where any neutral tap also loses.
6. Win by finding all 15 contacts. A win earns a team star (+1 to both scores).

## Data model & architecture

`custom: true, coop: true` registry entry (`gameType: 'dualkey'`), add to `COOP_GAMES`. Page
`src/pages/DualKeyGame.jsx`; logic `src/lib/dualKeyLogic.js` (key generation with the overlap
constraints from a seed, clue validation, tap resolution, token and sudden-death rules); deck
`src/lib/decks/dualkey.js` (lazy-loaded with the page, with the bundle-leak caveat comment from
`src/lib/decks/fibbage.js`). State under `round` only:

```
round: {
  phase: 'setup' | 'clue' | 'guess' | 'done', seed, words: string[25],
  keys: { X: string[25], O: string[25] },   // 'C' | 'T' | 'N' (co-op honour system)
  found: bool[25], neutralFor: { X: bool[25], O: bool[25] },
  giver, clue: { word, number }, tapsLeft, tokens, suddenDeath, result
}
```

- Every action is a `runTransaction`. Normalize the `bool[25]` arrays by explicit key on read
  (Firebase drops empty arrays and returns sparse objects).
- Clue text goes through `sanitizeDisplayName`-style trimming, `isBannedWord`, and a check that it
  isn't a grid word or a substring/superstring of one (reuse the Password clue rules in
  `passwordLogic.js` where they fit).
- Lanterns/Docking pattern: `SetupChoices` picks STANDARD or GENTLE (11 tokens), the pick deals
  in a transaction; `TeamHeader` and `RoundEndActions` from `TeamRoundShell.jsx`.
- Should use `seen/{deck}` (`seenHistory.js`) so a room doesn't see the same words again soon.

## UI/UX

- 390 px portrait: 5×5 grid of word tiles, 9 px `font-pixel` capped at 8 letters (the list is
  curated for ≤ 8 letters so tiles never truncate at 360 px). Your own key shows as small corner
  glyphs on each tile (● contact, ✕ trap, · neutral) that you can hide with a toggle.
- Found words: filled tile + ✓. Neutral for a giver: striped tile + that giver's seat letter.
  Never colour-only.
- Clue bar at the bottom for the giver (word input + number stepper + GIVE CLUE with the
  `useBusy` "GIVING…" label); the guesser sees the clue large with taps left and END TURN.
- Tokens as 9 hourglass glyphs in the status row.

## AI / demo mode

No bot clue-giver in v1 (word-association needs embeddings far over the bundle budget), so
`solo: false`. A later demo could use a small hand-made association table for a subset of
words.

## Trust model & edge cases

- Both keys are plaintext in the room; co-op honour system. The UI never renders the partner's
  key.
- Partner offline: the table waits.
- A clue that fails validation is rejected client-side with a reason; the transaction rechecks.
- The number 0 means "none of these are mine": the guesser gets unlimited taps (standard co-op
  convention, our own wording in the rules text).

## Testing (vitest)

`dualKeyLogic.test.js`: key generation satisfies the overlap counts for many seeds; tap
resolution uses the giver's key; token spend and sudden death; trap loss; win on the 15th
contact; clue validation (grid words, substrings, banned words). Deck test: all words ≤ 8
letters, `isFamilySafe`, no duplicates. E2E spec: two players, A gives a clue, B taps a word,
both see the result and the giver swap.

## Milestones

1. Word list (~400 nouns, curated) + deck test (1 session).
2. Logic + tests (1 session).
3. Page, clue bar, key toggle (1 session).

## IP notes

CODENAMES is a CGE trademark filed for games and for software. Never use "Codenames" or
"Duet" in UI, copy or code identifiers shown to users. Write our own word list (do not derive it
from Codenames' published words), our own key layout algorithm and our own card art. The
overlap counts are a mechanic; the name, the agent/assassin theme and the word cards are not
ours.

## Open questions

- Allow a timer per clue (like Password's 45 s)? Lean: no; this is a thinky game.
- Should the grid mix in picture tiles using the avatar sprites for variety? Later.
