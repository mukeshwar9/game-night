# PRD: Liar's Dice (Perudo, 2-player)

## Summary

Both players secretly roll five dice. Players alternate raising bids about the **combined**
dice on the table ("there are at least four 3s"), until someone calls **LIAR!** — then both
hands are revealed and cryptographically verified. Wrong caller (or honest bidder) — the
loser of the challenge loses a die. First player to lose all five dice loses the match.

- **The twist:** hidden state with zero trust and no server. Your dice are committed by
  hash before bidding starts, so nobody can re-roll — the platform's commit-reveal makes a
  classically "needs a server" game serverless.
- Players: 2 (v2: 3–6). Category: bluff. Netcode: RTDB; commit-reveal for the rolls,
  ordinary alternating turns for the bidding (this is *not* a simultaneous-move game — it
  uses `commit.js` helpers directly, not the full simul.js round loop).
- Effort: **M**.

## Rules

1. Round start: each player rolls `diceCount` dice locally (crypto random), commits
   `sha256(sortedDice + ':' + salt)`, keeps dice+salt in sessionStorage.
2. When both commitments are in, bidding opens. The round's first bidder alternates each
   round (X starts round 1). A bid is `(quantity, face)`, face 2–6. **Aces (1s) are wild** —
   they count toward every face.
3. On your turn: **raise** (higher quantity, or same quantity with higher face) or call
   **LIAR!**.
4. On LIAR!: both players reveal dice+salt; each client verifies the opponent's reveal
   against the commitment. Count matching dice (face + aces). Bid satisfied → challenger
   loses a die; bid short → bidder loses a die.
5. New round with updated dice counts. A player at 0 dice loses the match.

## Data model & architecture

`custom: true` (`gameType: 'liarsdice'`), page `src/pages/LiarsDiceGame.jsx`. Round
sub-node modeled on Hangwoman's:

```
dice: { countX: 5, countO: 5 }
round: {
  n, firstBidder: 'X'|'O',
  phase: 'rolling' | 'bidding' | 'reveal' | 'settled',
  commits: { X: hash, O: hash },
  bids: [{ by, q, f }],               // append-only; last entry is the live bid
  challenge: { by } | null,
  reveals: { X: { dice, salt }, O: ... },
  outcome: { loser, actualCount } | null,
}
```

All keys in `FIELD_NULLS`. No `board`/`currentTurn` (bid turn = derived from
`firstBidder` + `bids.length` — avoids double-source-of-truth).

`src/lib/liarsDiceLogic.js` (pure): `isRaiseLegal(prev, next)`, `countMatching(diceX,
diceO, face)` (aces wild), `settleChallenge(bid, diceX, diceO)` → loser,
`nextFirstBidder`, `rollDice(n, rng)` (rng injected for tests), bid-space helpers for the
picker (`minLegalRaise(prev)`).

Match end: `dice.countX|O === 0` → standard `winner` transaction + `scores`, WinEffect,
`recordMatch`.

## UI/UX

- Your five dice rendered as pixel-art pips (`border-retro-p1`, knockout-style pips à la
  Avatar glyphs), always visible at bottom. Opponent's dice: face-down tiles showing only
  the count. Center: the live bid, huge (`font-pixel text-xl text-glow-cta`) — "≥ 4 × ⚄".
- Bid picker: quantity stepper + face selector, pre-seeded to `minLegalRaise`; oversized
  **LIAR!** button (`bg-retro-p2 shadow-neon-p2`) — the button is the brand of this game.
- Reveal choreography: opponent dice flip one at a time (~150 ms stagger,
  `place-pop`), matching dice flash `win-flash`, then the verdict banner
  ("BID HELD — THEY NEEDED 4, FOUND 5"). A lost die shatters (`miss-flash` + fall).
- Bid history rail along the side (last 4 bids, dimmed).
- Sounds: dice-roll rattle = quick `seq` reuse via `sounds.drop()` ×3, `sounds.move(sym)`
  per raise, `sounds.bell()` on LIAR!, `sounds.hit()` per matching die during count-up,
  `win()/lose()` on match end.
- Verification failure: full-screen "CHEAT DETECTED — HASH MISMATCH" (`text-retro-p2`),
  honest player takes the match (Hangwoman precedent).

## AI / demo mode

Bot knows its own dice; models the opponent's as uniform. Raise while
`P(bid true) > 0.38` (binomial over unknown dice with ace-wild p=1/3); call LIAR! below
that; prefers raises through faces it holds; 8% pure bluff raises. `/demo` runs fully
local with visible "thinking" delay of 600–1200 ms.

## Trust model & edge cases

- Committed rolls: re-rolling after seeing bids is impossible; the reveal must hash to the
  pre-bid commitment. Sorted-dice canonical form prevents permutation ambiguity.
- Lost salt (new tab): the player cannot prove their roll → concede the **round** (lose
  one die), fresh round. Mirrors Hangwoman's lost-word concession.
- Stalling during bidding: standard presence banner + New Match escape hatch (v1).
- Max bid = total dice on table (quantity can't exceed `countX + countO`); the picker and
  `isRaiseLegal` both enforce it.

## Testing (vitest)

Raise legality matrix; ace-wild counting; challenge settlement (held/short/exact);
first-bidder rotation; min-raise helper; commitment round-trip (roll → hash → verify);
sorted canonicalization; full-match fuzz with random legal actions (terminates, dice
counts monotonically decrease).

## Milestones

1. Logic + tests (1 day). 2. Commit/reveal wiring + round machine (1 day).
3. UI + reveal choreography (1–1.5 days). 4. Registry, icon, demo bot (half day).

## Open questions

- Palifico round (when a player hits 1 die, aces stop being wild for that round) — classic
  Perudo rule, adds depth; suggest v1.1 after playtest.
- v2: 3–6 players (bids about the whole table generalize cleanly; needs n-player seats).
