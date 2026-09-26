# PRD: PANEL PANIC (inspired by Spaceteam)

## Summary

Each phone is one half of a failing ship's control deck. Six to eight controls with made-up
technobabble names sit on your panel; an order with a draining bar appears on your screen,
but about half the orders you see are for controls on your **partner's** panel. You shout
them across the room (or type a quick phrase), they find the control and set it. Clear 20
orders to jump to the next sector; miss too many and the hull gives out.

- **The twist:** the information is on the wrong screen. Nobody can play alone and nobody is
  ever idle — you are reading orders and working controls at the same time.
- Players: 2. Category: party (co-op). Netcode: RTDB, event-based; orders issued by the
  online-aware coordinator (`src/lib/coordinator.js`).
- Effort: **M** (one sector type plus the name generator); **L** with shake-to-clear and six
  control types.

## Rules

1. A **run** is a series of sectors. The hull starts at 100%. Each sector needs **20 completed
   orders**.
2. Each seat's panel has **6 controls** in sector 1, rising to **8** by sector 3. Control
   types: button (press), toggle (on/off), slider (positions 0–3), dial (positions 1–5).
3. Each seat always has **one active order** on screen: e.g. "SET GRAV FLANGE TO 3". The
   target control is on the partner's panel with probability 0.5 (never three orders in a row
   on the same panel).
4. An order is **done** the moment the named control reaches the named state, whoever's screen
   showed it. Done orders repair the hull by 2% (max 100%).
5. An order's bar lasts **12 s** in sector 1, dropping 1 s per sector to a floor of **7 s**.
   An expired order costs **8% hull**.
6. From sector 2, a **panel scramble** event (once per sector) renames every control on one
   panel; from sector 3, a **dim** event hides half of one panel's labels for 5 s.
7. Hull at 0% ends the run. Score = sectors cleared plus the fraction of the current sector.
   Clearing sector 3 or better earns a team star (+1 to both scores).

## Data model & architecture

`custom: true, coop: true` registry entry (`gameType: 'panelpanic'`), add to `COOP_GAMES` in
`src/lib/matchRules.js`. Page `src/pages/PanelPanicGame.jsx`; pure logic in
`src/lib/panelPanicLogic.js` (name generator, panel layout from seed, order issue, order
satisfaction, hull math). All state lives under `round`, so no `FIELD_NULLS` or rules changes.

```
round: {
  phase: 'setup' | 'playing' | 'done',
  seed, sector, hull, doneInSector,
  panels: { X: [{ id, type, name, value }], O: [...] },   // names from the seed
  orders: { X: { id, controlSeat, controlId, target, issuedAt, endsAt }, O: {...} },
  events: [{ kind, seat, at }],
  result: { outcome, sectors }
}
```

- **Controls** are written per control: `round/panels/{seat}/{i}/value` (a small `set`, no
  transaction — only the owning seat writes its own panel).
- **Orders** are issued by the coordinator (one elected writer, `coordinator.js`) in a
  `runTransaction`: when a seat's order is satisfied or expired, the coordinator updates the
  hull, increments `doneInSector`, and issues the next order. Either client may mark
  satisfaction; the transaction makes it idempotent by order id.
- `endsAt` uses the server clock (`useServerClock`); the 150 ms RTDB delay is small against a
  7–12 s bar.
- Follow the Lanterns/Docking pattern: the setup screen (`SetupChoices` from
  `src/components/TeamRoundShell.jsx`) picks NORMAL or FRANTIC timing, and the pick deals the
  run in a `runTransaction` on first view. `TeamHeader` shows hull and sector;
  `RoundEndActions` handles PLAY AGAIN / NEW MATCH / SWITCH.

## UI/UX

- 390 px portrait: order card on top (control name in `font-pixel`, target value large, a
  draining bar in `retro-cta` turning `retro-danger` under 3 s), the panel as a 2×3 or 2×4
  grid of big controls below. Hull as a segmented bar in `TeamHeader`'s status slot.
- Controls must be operable with one thumb: sliders and dials are stepped buttons (tap a
  position), not drag gestures. Each control shows its name and current value as text.
- Every control type has its own glyph (●, ⏻, ▭, ◔) as well as a colour; status never
  relies on colour alone.
- Text chat stays on (voice-first game); a quick-phrase bar ("WHAT'S THE ORDER?", "DONE!",
  "SAY AGAIN") covers players without voice.
- Sounds: `sounds.go()` on a new order, `sounds.move()` on a control change, `sounds.hit()`
  on a done order, `sounds.buzz()` on expiry, `sounds.bell()` on a sector clear.

## AI / demo mode

No meaningful solo mode: the game is about relaying. A `/demo` page can run a bot partner that
reads its own orders aloud via a text bubble after 1–3 s and fulfils orders shown to it after
2–4 s, good enough for learning the controls.

## Trust model & edge cases

- Rooms are world-readable; co-op means a cheater only spoils their own run (honour system).
- Partner offline: orders pause (the coordinator stops issuing and freezes `endsAt` by storing
  remaining time); resume when presence returns.
- Coordinator hand-off mid-order: the new coordinator recomputes from `orders` in the
  transaction; order ids prevent double-scoring.
- Name generator must pass `isFamilySafe` (`src/lib/wordDenylist.js`) for every generated name.

## Testing (vitest)

`panelPanicLogic.test.js`: deterministic panels from a seed; order issue never targets a
non-existent control or the current value; the "never three in a row on one panel" rule;
satisfaction for every control type; hull math (repair cap, expiry, run end); sector timing
floor; scramble keeps ids and changes names. E2E spec (`tests/e2e/panel-panic.spec.js`): two
players, one order shown on A's screen for a control on B's panel; B sets it; both see the
order cleared and `doneInSector` advance.

## Milestones

1. Logic + name generator + tests (1 session).
2. Page with buttons/toggles only, coordinator-issued orders (1 session).
3. Sliders, dials, events, quick phrases, demo bot (1 session).

## IP notes

Spaceteam is a brand of Sleeping Beast Games. Use our own name (PANEL PANIC), our own word
lists for control names, our own art and our own event set. Do not copy Spaceteam's control
names, its "Spaceteam" wordmark, its wormhole/asteroid events or its shake-to-clear framing
text.

## Open questions

- Ship the optional shake-to-clear event? It needs a DeviceMotion permission tap on iOS. Lean:
  no for v1.
- Build this or WIRE CROSSED first? They fill the same "loud" slot; pick one after the first
  co-op games show usage.
