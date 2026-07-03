# PRD — Battleship

**One-liner:** classic 10×10 fleet duel — the platform's first hidden-information game, made
trustworthy without a server via the salted-hash commit-reveal already proven in hangwoman.

| | |
|---|---|
| `type` | `battleship` |
| Label / badge | `BATTLESHIP` / `BS` |
| Category | `board` (2 players + spectators) |
| Integration | **C** — custom page (two grids, phases, hidden state — doesn't fit the registry board shape) |
| Network | RTDB + commit-reveal (`src/lib/commit.js`) |
| Effort | **L** |
| Priority | **P1** — the classic 1v1 people will search for; showcases the commit infra |

## Game rules

- Grid: 10×10 (cells 0–99, row-major). Fleet: Carrier 5, Battleship 4, Cruiser 3, Submarine 3,
  Destroyer 2 (17 ship cells). Ships may touch (no-adjacency variant is stretch).
- **Placement:** both players place simultaneously and privately, then ready-up.
- **Battle:** X shoots first. Result is `miss` / `hit` / `sunk:<ship>`. **Hit = shoot again**
  (the common digital rule — keeps momentum; a `HIT_AGAIN` const makes it easy to flip to
  strict alternation).
- **Win:** all 17 opponent cells hit. One battle = one round of the standard match scoreboard.

## Trust model (the core of this PRD)

Neither player's fleet ever touches Firebase until the game ends.

1. **Commit:** at ready-up, each client canonically serializes its fleet —
   `carrier:h:23;battleship:v:5;…` (ships in fixed order, `h|v` + top-left cell) — and publishes
   only `commit(serialized).hash` to `round/commits/{X|O}`. The `{ fleet, salt }` pair is stored in
   **`localStorage[battleship-fleet-{gameId}]`**. (Deliberate divergence from hangwoman's
   sessionStorage: re-entering a fleet after an accidental reload is expensive and a mid-battle
   concede is worse; localStorage changes nothing about what the *opponent* can see.)
2. **Grading:** the shooter pushes `{ by, cell, result: null }` to `round/shots`; the **defender's
   client** grades it from its local fleet and fills in `result`. Turn advances only when `result`
   lands (defender offline → "WAITING FOR RIVAL" + existing presence indicator).
3. **Reveal & verify:** when a fleet is sunk (or a player concedes), both clients publish
   `{ fleet, salt }` to `round/reveal/{X|O}`. Each client then runs
   `verifyTranscript(fleet, salt, hash, shots)`: `verifyReveal` against the commitment, fleet
   validity check, and **re-grades every shot** against the revealed fleet.
   Any mismatch → the honest side's client writes the win to itself with reason `'cheat'`
   ("VERIFICATION FAILED — WIN AWARDED").
4. Only after both reveals verify does the winner transaction run (standard `winner` + `scores`
   increment).

**Residual holes (accepted, documented in code):** a player can lie *during* the battle and only
be caught at reveal (game voids in the honest player's favor — good enough); a loser can refuse
to reveal — after a 30 s grace with the game clearly over, the other client claims the win.

## Data model

Everything lives in `round` — **no new top-level keys, no `FIELD_NULLS` changes.**
`freshGameState('battleship')` → `{ ...FIELD_NULLS, board: null, boxes: null, currentTurn: null,
round: { phase: 'placing' } }` (currentTurn null: shots drive their own sounds, hangwoman precedent).

```
round: {
  phase: 'placing' | 'battle' | 'reveal' | 'done',
  commits: { X: hash, O: hash },        // presence of both hashes ⇒ phase flips to battle
  turn: 'X' | 'O',                      // battle turn (starts 'X')
  shots: { pushId: { by, cell, result: null|'miss'|'hit'|'sunk:<ship>' } },
  reveal: { X: { fleet, salt }, O: { fleet, salt } },
  verified: { X: bool, O: bool },       // each side's verdict on the *opponent's* transcript
  result: { winner, reason: 'sunk'|'cheat'|'forfeit' },
}
```

## UI

- **Two grids:** YOUR WATERS (own fleet + incoming shots) and TARGETING (fog + your shots).
  Desktop: side by side. Mobile: stacked, targeting grid on top during your turn.
- Placement: tap ship in dock → tap cell; ROTATE and RANDOM (auto-place) buttons; drag as
  enhancement. READY locks in.
- Battle feedback: hit = accent flash + `retro-p1/p2` tint; sunk = whole-ship reveal on the
  targeting grid + shake; existing sound hooks fired from the page (custom pages drive own audio).
- **Spectators** see both *tracking* views (shots, hits, sinks) but never un-hit ship cells —
  spectating is genuinely watchable without spoiling.
- Ship-status sidebars: each side's remaining fleet as silhouettes (sunk ones dimmed).

## Files

| File | Contents |
|---|---|
| `src/lib/battleshipLogic.js` | `FLEET_SPEC`, `validateFleet`, `serializeFleet`/`parseFleet` (canonical), `randomFleet(rng)`, `gradeShot(fleet, cell, priorShots)`, `allSunk`, `verifyTranscript` |
| `src/lib/battleshipLogic.test.js` | the most test-friendly logic in the repo — see Testing |
| `src/components/BattleshipBoard.jsx` | one grid component, reused for both views via props |
| `src/pages/BattleshipGame.jsx` | phase machine, placement dock, grading effect (defender), verification effect |
| Registration | registry entry (`custom: true`), icon, `Game.jsx` ladder case, `freshGameState` branch |

## Edge cases

- Reload mid-battle: fleet restored from localStorage; if storage was cleared → concede button
  with explanatory copy (hangwoman convention).
- Both players sink simultaneously: impossible — shots are strictly sequential.
- Shot at an already-shot cell: client blocks; `gradeShot` also returns `null` → ignored.
- Defender grades wrongly by bug (not malice): verification catches it identically; keep
  `gradeShot` pure and shared by grader and verifier so they can't diverge.
- Play again: `onPlayAgain` → fresh `round { phase: 'placing' }`, scores kept.

## Testing

- Unit: fleet validation (bounds/overlap), serialize↔parse roundtrip + canonicality (same fleet,
  different placement order → same string), grading (miss/hit/sunk boundaries, last-cell sink),
  `allSunk`, `verifyTranscript` (honest pass; tampered result, tampered fleet, wrong salt each
  fail), `randomFleet` validity over 1k seeds.
- Manual: full game two browsers; defender-offline stall + recovery; reload both roles;
  cheat simulation (hand-edit a `result` in the Firebase console → verify honest client claims
  win); spectator view.

## Stretch

No-touch placement variant; salvo mode (5 shots/turn); per-ship hit markers for spectators;
placement timer.
