# PRD — Pulp Rush

**One-liner:** slice the seeded produce tossed into your field, never the rotten apple — a
2–8 player race (DUEL), a co-op basket race (HARVEST), and one-phone split-screen DUEL and
TWO-TONE co-op on the solo page.

| | |
|---|---|
| `type` | `pulprush` (DUEL) · `pulpharvest` (CO-OP variant, `variantOf: 'pulprush'`) |
| Label / badge | `PULP RUSH` / `PR` · `PULP HARVEST` / `PH` |
| Category | `reflex` |
| Integration | race path — `RaceShell` + `PulpRacer` (like Aim Trainer); no WebRTC |
| Status | Shipped on `fm/games-fruit-ninja-2p-s1`; see TODO |

## Modes

- **DUEL (online, 2–8):** 45 s, same seeded course for everyone, each in their own field.
  Slice = +1; a 3-chain in one swipe pays 6, then +2 each; rotten apple = −5 and a 1 s stun.
  Highest score wins; first to 3 round wins.
- **HARVEST (online co-op, 2–8):** 60 s, same course, one team basket of 60 pulp per player,
  5 shared hearts (a dropped fruit or a rotten slice costs one). Team state is derived from
  each racer's own stats (`harvestTeam`) — no shared counter in Firebase.
- **Solo page (`/solo/pulprush`, no Firebase):** SOLO 60 s score attack (personal best),
  SPLIT DUEL (face to face, top half upside down, same throws), TWO-TONE co-op (one field,
  own colour only, grey 2× pieces need both swipes within 250 ms).

## Files

`src/lib/pulpLogic.js` (+ test), `src/components/PulpField.jsx`, `src/components/PulpRacer.jsx`,
`src/hooks/useCourseTime.js`, `src/pages/PulpRushGame.jsx`, `src/pages/PulpHarvestGame.jsx`,
`src/pages/demos/PulpRushDemo.jsx`; registry, rules text, `COOP_GAMES`, race-stats rules
allow-list (+ `tests/rules/flows.test.js`), `tests/e2e/pulprush.spec.js`.

## TODO

- [ ] Confirm `tests/e2e/pulprush.spec.js` passes (it ran once, exit 0, output not reviewed).
- [ ] Re-run the unit tests that timed out under heavy machine load (arrows, chomp,
      demoBots, wordBots) — unrelated to Pulp Rush, but not re-checked.
- [ ] Measure fps on a low-end Android phone (DOM rendering, ~10 pieces + trails); fall back
      to a canvas arena only if needed.
- [ ] Tune hearts / basket target / spawn rate from real play (hearts raised 3 → 5 because
      two fields drop fruit twice as fast).
- [ ] Two-device check of HARVEST and split-screen multi-touch on real phones.
- [ ] Optional later: SPOILERS sabotage attacks; WebRTC shared-field modes (TUG / PICNIC).
