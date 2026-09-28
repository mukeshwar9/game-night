# WIRE CROSSED: two-bomb difficulty match + Switchboard

**Decision update: 2026-09-28.** This replaces earlier 15-level-ladder proposal in this document.
No ladder, endless mode, daily mode, or additional module proposals are in current scope.

## Approved behavior

- At match start, Tech chooses **Easy**, **Normal**, or **Hard** once.
- Same difficulty applies to both bombs.
- Match contains exactly two bombs. Tech and Handbook swap after Bomb 1.
- Bomb 2 still runs if Bomb 1 booms, so each player gets one Tech turn.
- Both bombs must be defused to win. Any boom makes match a loss, even if Bomb 2 is later defused.
- Add **Switchboard** as only new module. Do not ship Frequency, Valve Balance, Capacitor, or Signal Decoder.

## Difficulty profiles

Reuse current generator tiers; no difficulty increase between bombs.

| Choice | Existing generator level | Modules per bomb | Wire cap | Clock | Strikes |
|---|---:|---:|---:|---:|---:|
| Easy | 1 | 3 | 4 | 3:00 | 3 |
| Normal | 3 | 4 | 6 | 3:00 | 3 |
| Hard | 5 | 4 | 6 | 2:30 | 3 |

Each bomb gets a fresh seed. Select module types from the version-2 pool, without duplicates. Existing module count per bomb stays unchanged.

## Switchboard

Tech sees five LEDs and five ON/OFF breakers. Tech reports LEDs to Handbook, then sets the breaker pattern and commits it. Handbook sees the generated rule: lit LED means ON, unlit means OFF, except two numbered switches are inverted. An incorrect committed pattern adds one strike; correct pattern solves module.

- Keep LED state and switch labels visible in text; color cannot be sole signal.
- Use real buttons with `aria-pressed`; allow keyboard/touch operation.
- Generate puzzle deterministically from bomb seed. Solver and judge must share same pure rule.
- Module may appear in either bomb; pool sampling does not guarantee every match contains it.

## Existing game and compatibility

Legacy generator v1 has four module types: Wires, Glyphs, Lever, Pipes. It keeps existing seed output and old level-progression behavior. Version 2 adds Switchboard and two-bomb flow.

New client records per-seat generator support. Upgrade room to v2 only when both seats acknowledge while Bomb 1 remains ready; otherwise both clients continue using v1 so an old open tab cannot derive a different bomb. Existing v1 rooms retain legacy behavior. A new match starts fresh and can negotiate v2 again.

V2 room fields: `generatorVersion`, `clientVersionX`, `clientVersionO`, `difficulty`, and fixed profile `level`. `difficulty` is chosen once by Tech and cannot change after selection. Match progress reuses `bombNo` and `stats` (`defused`, `booms`); no extra run-history schema.

## Implementation locations

- `src/lib/wireLogic.js` + adjacent tests: v1-compatible generator, v2 pool, Switchboard generator/solver/judge.
- `src/lib/wireMatchLogic.js` + tests: difficulty mapping, version handshake, fixed difficulty, two-bomb result.
- `src/components/wire/WireDevice.jsx`, `WireManual.jsx`: Tech and Handbook Switchboard views.
- `src/pages/WireCrossedGame.jsx`: difficulty selection, protocol negotiation, role swap, Bomb 2 after boom, final match result.
- `database.rules.json` + `tests/rules/wirecrossed.test.js`: validate version handshake and locked difficulty fields.
- `tests/e2e/wirecrossed.spec.js`: both-client difficulty choice, Switchboard action, two-bomb role swap, continuation after Bomb 1 boom.
- `src/lib/rules.js`: update player-facing instructions.

## Rollout / rollback

Deploy hosting and database rules together. V1 rooms stay readable/playable using the legacy generator; v2 begins only after both clients confirm support. Rollback to old hosting remains compatible with v1 rooms; new v2 rooms require both current clients, so users should finish an active v2 match before rolling back. No destructive database migration.

## Explicitly out of scope

Other proposed modules (Frequency tuner, Valve Balance, Capacitor Charge, Signal Decoder), progression beyond Bomb 2, daily/endless modes, module-count increases, global stats, and fixing the separate 0:00 timeout bug.
