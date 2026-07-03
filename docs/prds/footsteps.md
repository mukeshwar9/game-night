# PRD: Footsteps

## Summary

A tug-of-war of sealed bids. A marker sits on the center of a 7-step track. Both players
start with **50 points**. Each round, both secretly commit a spend; higher spend pushes the
marker one step toward the opponent's edge — but **both spends are gone forever** either
way. Push the marker off your opponent's edge to win.

- **The twist:** resource bluffing with total information about the past and none about the
  present. Winning a step by 1 point is perfect play; winning it by 20 is a disaster you
  don't discover until later.
- Players: 2. Category: bluff. Netcode: RTDB + simultaneous-move protocol
  (`docs/prds/README2.md`). Effort: **S** once `simul.js` exists — this is deliberately the
  simplest simul game.

## Rules

1. Track positions 0–6; marker starts at 3. X pushes toward 6, O pushes toward 0
   (X wins at >6, O wins at <0 — i.e., off the edge, not merely reaching it).
2. Each round both players commit an integer spend: minimum 1 if you have points, exactly 0
   if broke. Spends are deducted **regardless of outcome**.
3. Higher spend moves the marker one step toward the winner's target edge. Equal spends →
   no movement.
4. Game ends when: the marker leaves the track (pusher wins), or **both** players reach 0
   points → marker side decides (position ≥ 4 → X wins, ≤ 2 → O wins, 3 → draw).
   If only one player is broke, play continues (broke player bids 0 and can only tie or lose
   rounds — dragging out a doomed position is itself strategy for the leader to avoid).

## Data model & architecture

`custom: true` (`gameType: 'footsteps'`), page `src/pages/FootstepsGame.jsx`. No `board`,
no `currentTurn`.

Firebase keys (all in `FIELD_NULLS`):

```
steps: {
  pos: 3,                 // marker position 0–6
  bankX: 50, bankO: 50,   // remaining points
  history: [{ n, bidX, bidO, pos }],   // append-only, public after each reveal
}
round: { n, phase, commits, reveals }  // simul.js
```

`src/lib/footstepsLogic.js`: `resolveRound(state, bidX, bidO)` → next state +
`result: null | { winner }`; `clampBid(bank, bid)` (illegal reveal → clamped: min 1, max
bank; keeps resolution total); `isTerminal(state)`.

Match end via the standard `winner` transaction + `scores` increment.

## UI/UX

- Center: the track as 7 neon tiles with a glowing marker (`shadow-neon-cta`), player edges
  tinted `tint-p1`/`tint-p2`. Marker movement animates as a hop (`place-pop`).
- Bottom: your bank as a big `font-pixel` number plus a spend picker — numeric stepper with
  +1/+5 repeat-hold and a drag-slider (1..bank). Confirm button "SEAL BID" → lock-in state.
- **History strip** (the mind-game fuel): compact round-by-round `bidX vs bidO` table,
  always visible — past bids are public; the current one is not.
- Opponent bank is public (classic Footsteps): show it. What's hidden is only the live bid.
- Reveal beat: both bids flip in simultaneously, marker hops (or shakes on tie —
  `miss-flash`). Sounds: `sounds.drop()` on seal, `sounds.go()` on reveal,
  `sounds.wall()` on tie, `sounds.hit(streakOfPushes)` on a push, `win()/lose()/draw()` end.

## AI / demo mode

Bot spends `round(bank × pressure)` where pressure = f(marker distance from its losing
edge): 0.10 baseline, 0.25 when two steps from losing, 0.45 when one step from losing,
±20% noise; never spends more than `opponentBank + 1` (the cap that guarantees a win if
exceeded is wasted). Local `/demo` vs bot.

## Trust model & edge cases

- Simul.js covers peek-prevention, cheat flags, lost-salt concession (concede = your bid
  becomes 1 or 0-if-broke for that round; points still deducted).
- Both broke at 0 with pos 3 → `winner: 'draw'` (platform supports draw natively).
- Bank display race: banks update only on resolution writes — no partial states visible.

## Testing (vitest)

Resolution matrix (higher/lower/tie, near edges); win-off-edge both directions;
both-broke endgame at each position; clamping of illegal bids; broke-player forced-0 rule;
full-game fuzz (random bids always terminate ≤ 100 rounds, banks never negative).

## Milestones

1. Logic + tests (half day). 2. Page UI + reveal choreography (1 day). 3. Registry, icon,
demo bot (half day). Prereq: `simul.js` from the Goofspiel build.

## Open questions

- Track length 7 vs 9 (longer = more grinding, more comebacks). Start 7.
- Bank size 50 — tune after playtest (bigger banks = finer-grained bluffs, slower games).
