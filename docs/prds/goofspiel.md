# PRD: Goofspiel (GOPS — Game of Pure Strategy)

## Summary

A 13-round sealed-bid auction. Each player holds cards 1–13. Each round a **prize card**
(also 1–13, random order) is revealed; both players **secretly and simultaneously** bid one
of their remaining cards. Higher bid wins the prize's points; both bid cards are spent
either way. Most points after 13 rounds wins.

- **The twist:** pure psychology. Do you burn your 13 to take a 2-point prize just because
  your opponent expects you to sandbag? Every card is single-use, so every bluff has a price.
- Players: 2. Category: bluff. Netcode: RTDB + the **simultaneous-move protocol**
  (`docs/prds/README2.md`) — this game is the reference implementation of `src/lib/simul.js`.
- Effort: **M** standalone; **S** once simul.js exists.

## Rules

1. Prize deck = 1–13 shuffled (shared-randomness scheme below). One prize flips per round.
2. Both players simultaneously commit one card from their remaining hand, then reveal.
3. Higher card takes the prize's face value in points. **Tie → the prize carries over**:
   the next round is worth this prize + the next one (stacking; a final-round tie discards
   the pot).
4. After 13 rounds, higher total wins; equal totals → `winner: 'draw'`.

## Data model & architecture

`custom: true` registry entry (`gameType: 'goofspiel'`), page `src/pages/GoofspielGame.jsx`
dispatched from `Game.jsx`'s custom ladder (Hangwoman pattern — no `board`, no
`currentTurn`; keeps turn-flip sounds silent).

Firebase keys (all in `FIELD_NULLS`):

```
gops: {
  handX: number[],  handO: number[],   // remaining cards (public — hands are open info in GOPS)
  scoreX: number,   scoreO: number,    // round points
  carry: number,                        // stacked prize pot from ties
  prizes: number[],                     // prize order — revealed incrementally, see below
  prizeIndex: number,                   // rounds resolved so far
}
round: { n, phase, commits, reveals }   // simul.js round node
```

**Prize order via shared randomness.** The full shuffle must not exist anywhere readable
before it's needed. Prize for round *n* is drawn from the remaining prize set using
`seed_n = sha256(saltX_{n-1} + saltO_{n-1} + gameId + n)` (both players' *previous-round*
salts — unknowable in advance, identical for both clients). Round 1 uses
`sha256(gameId + createdAt)`, which is fine: round 1 is symmetric. Each resolution appends
the drawn prize to `prizes` so late-joining spectators can replay.

**Resolution** (pure, in `src/lib/goofspielLogic.js`): `resolveRound(state, bidX, bidO)` →
next `gops` state + round result; called identically by both clients and written via the
simul.js transaction. Bid legality (card in hand) is validated in resolution — an illegal
revealed bid counts as a forfeit of that round (lowest possible bid).

Match end: 13th resolution sets `winner` via `runTransaction` + `scores` increment —
standard finish machinery, WinEffect, `recordMatch`.

## UI/UX

- Layout (max-w-sm): opponent's remaining cards fanned face-up at top (small), the prize
  card center-stage (`font-pixel`, `border-retro-cta shadow-neon-cta`, flip-in via
  `place-pop`; show `+carry` badge when a pot is stacked), your hand as a tappable card row
  at bottom. Running scores in the standard header chips.
- Commit flow: tap a card → it lifts and shows "LOCKED IN ✓" (`text-retro-win`); opponent
  status shows "OPPONENT IS THINKING…" (`animate-blink`) until their commit lands, then
  both cards flip simultaneously on reveal — the flip is the drama beat, stagger it ~400 ms.
- Reveal outcome: winning card glows (`shadow-neon-p1/p2`), points fly to the score chip.
- Sounds: `sounds.drop()` on lock-in, `sounds.go()` on double-flip, `sounds.hit(1)` on
  taking a prize, `sounds.bell()` on a tie/carry, `sounds.win()/lose()/draw()` at match end.

## AI / demo mode

Bot bids `prize value ± uniform(−2,+2)` clamped to its hand (value-for-value baseline),
with two personality rules: 10% chance to sandbag (bid its lowest card) on prizes ≤ 4, and
always contest when `prize + carry ≥ 10` with its highest remaining card. Runs locally in
`/demo` off `goofspielLogic` with no networking.

## Trust model & edge cases

- Commit-reveal prevents peeking; hash mismatch → `cheatFlag`, opponent wins (simul.js).
- Hands are public information (classic GOPS) — no hidden state beyond the pending bid.
- Lost salt (new tab mid-round): concede the round — the committed card is considered
  spent, prize goes to opponent (simul.js concession rule).
- Disconnect mid-commit: standard presence banner; the round simply waits.

## Testing (vitest)

`resolveRound` (win/tie-carry/final-tie-discard); prize-draw determinism from a fixed seed
(both "clients" derive the same prize); full-game simulation (13 rounds, hands empty,
scores sum ≤ 91); illegal-bid forfeit; carry stacking across consecutive ties.

## Milestones

1. `src/lib/simul.js` + generalized commit helpers + tests (1 day — shared with Footsteps/Liar's Dice).
2. `goofspielLogic.js` + tests (half day).
3. Page + card UI + reveal choreography (1–1.5 days).
4. Registry, icon, demo bot (half day).

## Open questions

- Show a bid-history table (round-by-round reveals) in-game, or keep the table to the
  end-of-match screen? Lean: end screen only, keep the play view tense and minimal.
