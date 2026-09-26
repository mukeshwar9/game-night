# PRD: LAST WIRE (inspired by Bomb Busters)

## Summary

Two technicians open a vault lock of numbered tumblers. Each player holds a private rack of
tumbler tiles, always sorted low to high. On your turn you point at a tile in your partner's
rack and name a value you also hold. Right, and both tiles open; wrong, and the alarm clock
ticks and the true value is stamped on that tile for everyone to see. Open every tumbler before
the alarm runs out.

- **The twist:** actions are the only signal. You may not talk about your own rack, but because
  racks are sorted, every revealed tile narrows its neighbours, so each guess is a small
  deduction puzzle and each wrong guess is a gift of information.
- Players: 2. Category: board (co-op). Netcode: RTDB, turn-based.
- Effort: **M**. Zero content; a mission ladder supplies difficulty.

## Rules

1. The set has values **1–12, four tiles of each** (48 tiles). Mission 1 deals **12 tiles
   each**; the rest stay out of play face down.
2. Each rack is sorted ascending on the owner's screen and shown to the partner as face-down
   tiles in the same order, with position numbers.
3. On your turn, tap one face-down tile in your partner's rack and name a value **that you hold
   face down in your own rack**. If the tile has that value, it opens, and you open one of your
   own tiles of that value (your choice). Open tiles are face up for both.
4. If you're wrong, the **alarm** advances one step and the tile gets a public stamp with its
   true value (it stays closed; it can still be opened later with a correct call).
5. The alarm has **6 steps** in mission 1 (fewer in harder missions). The alarm reaching the end
   loses.
6. Missions add **jam tiles** (value J, 1–3 per mission): naming the value of a tile that is
   actually a jam loses immediately; a jam is opened only by calling "JAM" on it, which costs no
   alarm step if right and ends the game if wrong.
7. Special move once per mission each: **SCAN** — reveal whether a chosen partner tile is higher
   or lower than a value you name. It costs one alarm step.
8. You win when every non-jam tile is open. A win earns a team star (+1 to both scores) and
   unlocks the next mission in the ladder.

## Data model & architecture

`custom: true, coop: true` registry entry (`gameType: 'lastwire'`), add to `COOP_GAMES`. Page
`src/pages/LastWireGame.jsx`; pure logic `src/lib/lastWireLogic.js` (deal, sort, call
resolution, stamps, jams, scan, mission ladder). State under `round` only:

```
round: {
  phase: 'setup' | 'playing' | 'done', mission,
  racks: { X: [{ v, open, stamp }], O: [...] },   // plaintext, sorted (co-op honour system)
  alarm, alarmMax, scans: { X, O },
  turn, lastAction, result
}
```

- Standard alternating turns: each action is one `runTransaction` on `games/{id}` running
  `applyCall(round, seat, action)`; the next turn is mirrored to top-level `currentTurn`.
- Page follows the Lanterns/Docking pattern: `SetupChoices` picks the mission (1–8 unlocked by
  the room's `round.bestMission`, carried inside the room's previous round via PLAY AGAIN), the
  pick deals in a transaction, `TeamHeader` and `RoundEndActions` from
  `src/components/TeamRoundShell.jsx` give the chrome.
- Needs the platform `quiet` flag (hide typed chat, keep emotes) once it exists; until then the
  rules text asks players not to discuss their own racks.

## UI/UX

- 390 px portrait: partner rack on top as one row (12 tiles fit at ~26 px wide; 16-tile missions
  wrap into two rows with position numbers), alarm track and mission label in the middle, your
  rack at the bottom face up with open/closed state.
- Tap a partner tile, then a value from a keypad of the values you hold (values you don't hold
  are disabled). The selected tile shows neighbouring stamps for context.
- Open tiles use a filled style plus a ✓ glyph; stamped tiles show the value in a small corner
  badge with a ⌁ glyph; jams show ⚠. Never colour-only.
- Sounds: `sounds.hit()` on an open, `sounds.buzz()` on an alarm step, `sounds.bell()` on the
  final open.

## AI / demo mode

A bot partner is straightforward: it computes, for each partner tile, the set of values
consistent with sorting, open tiles and stamps, and calls the most certain (tile, value) pair it
can make with values it holds. `/demo` plays against it.

## Trust model & edge cases

- Racks sit in the room in plaintext (rooms are world-readable). Co-op honour system: reading
  your own rack from devtools only spoils your own game.
- Partner offline: the table waits; no solo takeover (you would see both racks).
- Ties in "open one of your own": the UI opens your leftmost matching closed tile by default;
  the choice is kept for the rare case where it matters for deduction.
- A player with no closed non-jam tiles left passes automatically.

## Testing (vitest)

`lastWireLogic.test.js`: deal sizes and sorting; correct call opens both tiles; wrong call
stamps and advances the alarm; you cannot name a value you don't hold; jam rules; scan result
and cost; alarm loss; win detection; mission ladder parameters. E2E spec: two players, A calls
a value on B's tile, both see the open or stamp, and the turn passes.

## Milestones

1. Logic + tests + mission table (1 session).
2. Page, racks and keypad (1 session).
3. Jams, scan, ladder progress, demo bot (1 session).

## IP notes

Bomb Busters is Hisashi Hayashi's design (Cocktail Games / Pegasus), Spiel des Jahres 2025. Use
our own vault/tumbler theme (kept away from bombs so it doesn't collide with WIRE CROSSED), our
own art, our own mission ladder and our own rules text. Do not use the Bomb Busters name, its
wire art, its mission booklet or its equipment cards.

## Open questions

- Should mission progress persist per pair of players (a friends-level record) or only per
  room? Lean: per room for v1.
- Is 12 tiles each too long on a phone? Playtest 10 versus 12 for mission 1.
