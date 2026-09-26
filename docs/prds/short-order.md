# PRD: SHORT ORDER (inspired by Overcooked)

## Summary

A three-minute diner rush for two. The Grill cook (X) runs the griddle and the fryer; the
Counter cook (O) runs drinks, plating and the pass. Every ticket needs parts from both stations,
handed through a two-slot hatch. Serve tickets before they expire; burnt food and missed
tickets cost stars.

- **The twist:** split ownership plus a clock. Neither of you can finish a single ticket alone,
  and the hatch holds only two items, so you constantly negotiate "send fries now or hold?".
- Players: 2 (co-op). Category: `reflex`. Netcode: RTDB event-based (every action is a discrete
  tap; nothing needs frame sync).
- Effort: **M–L**. The code is modest; balancing the recipe table and timers is the work.

## Rules

1. A shift lasts 180 s (server clock). Tickets arrive every 12–18 s, at most 4 open at once,
   each with a 60 s patience bar.
2. Recipes (v1): BURGER (patty + bun, plated), BURGER MEAL (burger + fries + soda), FRIES
   BASKET (fries, plated), SHAKE (drink station only, plated), DOUBLE (two patties + bun).
3. Grill station (X): 2 griddle slots and 1 fryer basket. A patty cooks in 4 s, is perfect until
   9 s, then burns (unusable; clear it). Fries take 5 s, perfect until 11 s.
4. Counter station (O): drink machine (3 s per soda or shake), bun bin, plates, the pass.
5. The hatch has 2 slots. X places cooked items in it; O takes them onto a plate. O assembles
   the plate to match a ticket and taps SERVE on that ticket.
6. Serving: +10 coins per ticket, +5 tip if more than half its patience remains. An expired
   ticket or a burnt item costs one of 5 stars.
7. The shift ends at 180 s or at 0 stars. Targets: 1 star-rating tier per 60 coins, up to ★★★ at
   180. A shift with ★ or better and at least 1 star left is a team win.

## Data model & architecture

`custom: true, coop: true, hidePlayerCards: true` registry entry (`gameType: 'shortorder'`),
page `src/pages/ShortOrderGame.jsx`, logic `src/lib/shortOrderLogic.js`. Add `'shortorder'` to
`COOP_GAMES` in `src/lib/matchRules.js`.

State under `round` only:

```
round: {
  phase: 'setup' | 'shift' | 'done', level, seed, startsAt, endsAt,
  tickets: [{ id, recipe, at, expiresAt, served }],
  grill: [{ item, startedAt } | ''], fryer: { startedAt } | '',
  hatch: [item | ''], plate: [item], drinks: [{ item, startedAt } | ''],
  coins, stars, log: [...],
  result: { outcome, coins, rating } | null,
}
```

Timers are timestamps, not ticks: an item's state (raw / cooking / perfect / burnt) is a pure
function of `startedAt` and the server time from `useServerClock`, so no client needs to write
every second. Tickets are generated from `seed` deterministically (`ticketsUntil(seed, t)`), so
both clients agree on arrivals without a writer. Expiry and burn penalties are applied lazily by
whichever client next writes, via `settle(round, now)` inside the transaction, plus a
coordinator (`src/lib/coordinator.js`) sweep every 2 s so penalties land even when nobody taps.

Each action (`startPatty`, `flip`, `toHatch`, `takeFromHatch`, `pour`, `plate`, `serve`,
`bin`) is one `runTransaction` on `games/{id}` through the logic module. Follows the
Lanterns/Docking shell: `SetupChoices` (FIRST SHIFT / LUNCH RUSH / LATE NIGHT) and
`TeamRoundShell.jsx` header/end actions; a winning shift adds +1 to both `scores`.

## UI/UX

- 390 px portrait. Top: shift timer ring, stars (★/☆ glyphs) and coins. Tickets as a horizontal
  strip of cards, each with recipe icons and a draining patience bar plus seconds text.
- Bottom half is your station only. Grill: two griddle buttons and a fryer button showing a
  cook-state glyph (◌ raw, ◐ cooking, ● perfect, ✹ burnt) and a progress bar. Counter: drink
  machine, bun bin, plate tray, SERVE buttons on tickets.
- The hatch sits between, visible to both with its 2 slots.
- Tap-only controls, 44 px minimum targets. No drag.
- Sounds: `sounds.step()` on taps, `sounds.bell()` on serve, `sounds.buzz()` on burn/expiry.
- Quick-phrase bar (FRIES!, BURGER UP, HOLD, HATCH FULL) for text-only pairs; voice is expected
  in a room or on a call.

## AI / demo mode

`/demo/shortorder` with a bot partner on the other station following a greedy script: cook for
the oldest open ticket, pass perfect items, never let the hatch overflow. A good onboarding tool.

## Trust model & edge cases

- Honour system; all state readable. A client could forge coins, but it only inflates its own
  team's score; `coop: true` keeps it off the leaderboard.
- Latency: 100–300 ms is small against 4–9 s cook windows. Use server time for every timer.
- Partner offline: the shift pauses (freeze `endsAt` via a `pausedAt` field) for up to 30 s, then
  ends as a loss if they do not return.
- Burst taps: each tap is a transaction; `useBusy` is too slow for rapid taps, so use an
  optimistic local pending state per station slot with rollback on abort.

## Testing

Vitest: cook-state function across the 0/4/9 s thresholds; seeded ticket arrivals are
deterministic; `settle` applies each expiry and burn exactly once; serve matching (exact recipe,
extra items reject); coin and tip maths; star loss end; rating tiers. E2E
(`tests/e2e/short-order.spec.js`): X cooks and hatches a patty, O plates and serves a burger,
both see coins go up.

## Milestones

1. Logic with time-as-data + tests (1 day).
2. Two station UIs and ticket strip (1.5 days).
3. Balance pass with the bot and three shift levels (1–2 days).
4. Registry, icon, rules text, e2e (half day).

## IP notes

OVERCOOKED! is a registered mark (Ghost Town Games / Team17). The diner theme is generic. Use
SHORT ORDER, our own recipes, station names and pixel icons. Do not copy Overcooked's chef
characters, onion king, level layouts, or its "kitchen" visual trade dress, and never call it
"Overcooked online".

## Open questions

- Swap stations between shifts automatically, or let players pick? Lean: auto-swap, so both
  learn both jobs.
- A 3–4 player party mode (extra stations) later?
