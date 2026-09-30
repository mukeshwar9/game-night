# Wire Crossed: modes, module tiers, new modules and modifiers

`type: 'wirecrossed'` · status: **implementation-ready** · written 2026-09-30

This PRD extends the shipped Wire Crossed game (`src/pages/WireCrossedGame.jsx`,
`src/lib/wireLogic.js`, `src/lib/wireMatchLogic.js`). The design was reviewed with the owner in
the Lavish page `.lavish/wirecrossed-modules.html`. That page has the visual mocks and a worked
example for every module. This document is the build spec. Where the two differ, follow this
document.

A builder should not need to make a design decision that is not settled here. Section 12 lists
the three points that were settled by default rather than by the owner.

---

## 1. Why

Review findings against the current code:

| ID | Finding | Where |
|---|---|---|
| F-01 | From level 3, every bomb has all 4 module types. Only the order changes. | `generateBomb`: `sample(rng, MODULE_TYPES, moduleCountForLevel(lvl))` with 4 types |
| F-02 | Level 4 plays the same as level 3, and level 6 the same as level 5. | `genWires`, `genMaze`, `moduleCountForLevel`, `bombMsForLevel` |
| F-03 | Manual complexity never grows: 3 rules per wire table, 4 glyph keys, 2 lever tap rules, a 6×6 maze. | all generators |
| F-04 | The lever release check accepts the digit anywhere in `m:ss`. About 30% of blind releases pass. | `judge` → `lever`: `shown.includes(String(sol.digit))` |
| F-05 | Module tabs use `key={m.type}`, so a bomb can't repeat a type. | `WireCrossedGame.jsx`, `WireManual.jsx` |
| F-06 | `database.rules.json` validates only `seed`, `tech`, `phase`, `strikes` and `ping` under `wire`. | `database.rules.json` ~L328 |
| F-07 | Nothing makes both players work at once or split their attention. | design |

## 2. Goals and non-goals

**Goals**

- Players pick a **mode** (Easy, Medium or Hard). Each mode is a short run of levels that ends in
  a "MODE CLEARED" screen.
- Every level in a mode is clearly harder than the one before. In Easy the step is small. In
  Medium and Hard it is large.
- Add **six new modules**: Patch Bay, Switchboard, Relay, Pulse, Pressure Gauge and Call Sign.
- Give every module (the 4 current ones and the 6 new ones) **tiers I–III**.
- Add **five bomb modifiers**: Scrambled Pages, Errata, Short Fuse, Blackout and Swap.
- Fix F-04, F-05 and F-06.

**Non-goals**

- No Endless mode. The owner decided to drop the open-ended level climb.
- No solo or demo mode. The registry keeps `solo: false`.
- No change to roles, voice or quick phrases, the room layer, or scoring. A defuse still adds 1
  to both seats.

## 3. Modes

### 3.1 Mode table

"Tiers" lists the tier of each module slot. The slot order is shuffled with the bomb's RNG.
"+G" means the Pressure Gauge is added on top of the listed modules.

| Mode | Lvl | Modules | Slot tiers | Gauge tier | Clock (base) | Modifiers |
|---|---|---|---|---|---|---|
| Easy | 1 | 2 | I, I | — | 3:00 | 0 |
| Easy | 2 | 2 | II, I | — | 2:45 | 1 × mild |
| Medium | 1 | 3 | II, I, I | — | 3:00 | 0 |
| Medium | 2 | 3 | II, II, II | — | 2:45 | 1 × mild |
| Medium | 3 | 3 +G | III, II, II | I | 2:45 | 2 × up to medium |
| Hard | 1 | 3 | II, II, II | — | 2:45 | 1 × up to medium |
| Hard | 2 | 4 +G | III, III, II, II | II | 3:00 | 2 × up to medium |
| Hard | 3 | 5 +G | III ×5 | III | 3:15 | 3 × up to severe |

**Module pools** (the Gauge is never drawn into a slot; it is added only by the "+G" column):

- Easy: `wires`, `keypad`, `lever`, `maze`, `patch`
- Medium and Hard: all nine slot modules: the five above plus `switch`, `pulse`, `relay` and `callsign`

A bomb never repeats a module type. Every pool is at least as large as the largest slot count.

**Pools only draw from modules that are shipped.** Until a module's PR lands, it is left out of
the pools (see §10). The table must still hold; see the `MODES` invariants test in §9.

### 3.2 Modifier severity

| Severity | Modifiers |
|---|---|
| mild | Scrambled Pages, Errata |
| medium | Short Fuse, Blackout |
| severe | Swap |

"1 × mild" means 1 modifier drawn from the mild set. "2 × up to medium" means 2 distinct modifiers
drawn from mild ∪ medium. "3 × up to severe" means 3 distinct modifiers from all five. A bomb
never repeats a modifier.

### 3.3 Run flow

```
             ┌─────────── boom: retry the same level (new seed) ───────────┐
             ▼                                                             │
[pick mode] → level 1 bomb → defused? ──yes──► level 2 … ► last level ──defused──► MODE CLEARED
                                   └──no (boom)─┘                                   │
                                                                     RUN AGAIN (same mode) / CHANGE MODE
```

- **A boom retries the same level** with a new seed. The run's boom count goes up by 1.
- **A defuse on the last level** ends the run: the result card shows "MODE CLEARED", the run's
  total armed time and its boom count. It updates this mode's records (§6.4).
- Roles swap every bomb, as today (`firstMoverUpdates` writes `wire/tech`).
- **NEW MATCH** clears the mode and the records and returns to the mode picker. Switching games
  does the same.

### 3.4 Choosing a mode (either player proposes, the other confirms)

- When `wire.mode` is empty, the ready card shows three mode cards (EASY, MEDIUM, HARD). Each card
  shows its level count, module counts and "modifiers from level N".
- Either seated player taps a card. This writes `wire.modeProposal = { by, mode, at }`.
- The other player sees "`<NAME>` PROPOSES HARD" with ACCEPT and DECLINE. The proposer sees
  WAITING… and CANCEL. Proposing again overwrites the earlier proposal.
- ACCEPT sets `wire.mode`, clears `modeProposal`, and resets the run to level 1 with a new seed.
  DECLINE and CANCEL clear `modeProposal`.
- The Tech's ARM button stays disabled until `wire.mode` is set.
- **CHANGE MODE** appears on the ready card and the result card. It opens the same picker and
  proposal flow. Accepting a different mode starts a new run at level 1.
- Spectators see the picker read-only.
- Every write above is a `runTransaction` on `games/{id}` that checks `current.wire.seed` (the
  pattern `arm()` uses today). Every button uses `useBusy` with PROPOSING…, ACCEPTING… and
  CANCELLING….

This is a separate proposal from the room-level `game.proposal` (PLAY AGAIN, NEW MATCH, SWITCH).
It lives under `wire` so that `FIELD_NULLS.wire` clears it on a game switch.

## 4. Modules

Every module is one file under `src/lib/wire/modules/` and exports the same interface (§7.2).
A **strike** is any wrong action. It adds 1 strike and takes `bomb.strikePenaltyMs` off the clock
(15 000 ms, or 25 000 ms with Short Fuse).

The serial, the indicators and the shared "bomb conditions" (serial odd or even, indicator X lit)
come from today's code unchanged.

### 4.1 WIRES (current module, now tiered)

| Tier | Device | Manual | Clear |
|---|---|---|---|
| I | 3–4 wires | One table per wire count: 3 single-condition rules plus "otherwise". The first rule that matches wins. **This is exactly today's module.** | One correct cut |
| II | 5–6 wires | 4 rules per table. A condition may be `{ all: [condA, condB] }` (AND). | One correct cut |
| III | 5–6 wires. 1–3 wires are **striped** `[c1, c2]` and show both letter tags | Every table's first rule is "if any wire is striped, cut **every** wire containing `<colour>`, first to last". The rest are as tier II. | Every required wire, cut in order |

- Device shape: `wires: Array<string | [string, string]>`. A striped wire "contains" both colours
  for every condition (`count`, `firstIs`, `lastIs`, `firstOf` and `lastOf`).
- Tier III progress: `mods[i].cut` (as today) plus `mods[i].done` (the number of required cuts so
  far). A required wire cut out of order is a strike. A non-required wire is a strike.
- Generator guarantee (tier III): the "every wire containing" rule matches 2–3 wires.

### 4.2 GLYPHS (current, now tiered)

| Tier | Keys | Manual |
|---|---|---|
| I | 4 | 5 columns of 6 (**today**) |
| II | 5 | 6 columns of 7. Exactly one column holds all 5. |
| III | 5 | **Two pages**, A and B. The serial's last digit picks the page (odd = A, even = B). Page B includes mirrored glyphs. |

- Mirrored glyphs: ids 24–31 render the asymmetric base glyphs listed in `MIRRORABLE` (8 ids from
  `WireGlyph.jsx`, picked by eye, with no left–right symmetry) with `transform: scaleX(-1)`. The id
  of the mirror of base glyph `b` is `24 + MIRRORABLE.indexOf(b)`.
- Uniqueness rule (as today): no other column on **the page in use** holds every key. At tier III
  the generator also puts a decoy column on the *other* page that holds 4 of the 5 keys.

### 4.3 LEVER (current, now tiered; fixes F-04)

| Tier | Change |
|---|---|
| I | Today's rules. **Release now matches only the last digit of the clock** (`shown.slice(-1) === String(digit)`). This applies to every tier (F-04). |
| II | 3 tap rules (a label rule, a colour + bomb-condition rule, and a strip-free rule: "tap if the serial contains the lever's first letter"). |
| III | While the lever is held, the strip shows `strip` for 2 000 ms, then changes to `strip2`. **Only `strip2` counts.** The release action carries `held` (ms). A release with `held < 2000` is a strike. |

- Release action: `{ kind: 'release', clock, held }`. The panel measures `held` with
  `performance.now()`, as it does today. It is client-reported, which is fine for a co-op game.
- Tier III UI: the strip label changes from `YELLOW STRIP` to `WHITE STRIP`. Colour is never the
  only cue.

### 4.4 PIPES (current, now tiered)

| Tier | Grid | Tech sees | Extra |
|---|---|---|---|
| I | 6×6 | Own cell ● and flag ⚑ (today) | Exit at least 5 steps away |
| II | 8×8 (A1–H8) | Own cell ● only, **no flag** | Exit at least 12 steps away |
| III | 8×8 | Own cell ● and a **FUEL** counter | Exit at least 12 steps away. 2–4 one-way valves. Fuel = shortest path + 4. |

- `MAZE_SIZE` becomes per-module: `module.device.size`. `cellName` takes `size`.
- **Valves** sit on an edge between two cells: `{ from, to }` can only be crossed from `from` to
  `to`. The Handbook's map draws them as ▶ ◀ ▲ ▼ on the edge. The generator puts 1–2 valves on the
  unique start→exit path, pointing **forward**, and 1–2 on side branches pointing either way.
  Solvability is then guaranteed: the maze is a perfect maze (a tree), so the path is unique.
- A move against a valve counts as a wall: a strike, and the Tech stays put.
- **Fuel**: `mods[i].moves` counts successful moves. When `moves` reaches `fuel` and the Tech is
  not on the exit, that is a strike, and the Tech goes back to the start with `moves = 0`.

### 4.5 PATCH BAY (new; unlocks: Easy pool)

Plugs are on the left, one per colour letter. Sockets 1…n are on the right.

| Tier | Plugs | Routing | Start |
|---|---|---|---|
| I | 3 | One lookup column | Empty |
| II | 4 | 2 columns, headed by indicator labels on this bomb. "Use column `<A>` if lit, else `<B>`." | Empty |
| III | 4 | As tier II | **Tangled**: 3 cables are already patched wrong |

- Actions: `{ kind: 'patch', plug, socket }` and `{ kind: 'unplug', plug }`.
- A patch into the wrong socket is a strike, and the cable is not stored ("springs out"). A patch
  into an occupied socket is not allowed (it returns `null`, and the UI disables it).
- **Crossings**: cables `a` and `b` cross when their plug order and socket order are opposite.
  Where two cables cross, the one patched later lies on top.
  `mods[i].stack` = the plugs in patch order. At tier III the initial `stack` comes from the
  generator.
- **Tier III unplug rule**: unplugging a cable that another crossing cable lies on top of is a
  strike, and nothing changes. Cables may cross freely in the final layout.
- Clear: every plug is in its correct socket.
- Generator guarantee (tier III): the initial tangle has at least 2 crossings, and every initial
  cable is in a wrong socket. It is always solvable: unplugging from the top of the stack is
  always legal.
- Tech UI: the patch order sets SVG z-order, so the Tech can see which cable lies on top. The
  aria-label of each cable lists what lies on it: "Cable R to 4, under Y".

### 4.6 SWITCHBOARD (new; Medium and Hard)

There are 4 or 5 toggles, each with a light (R, Y, G, B or dark) and a position (▲ or ▼).

| Tier | Switches | Short circuits | Lock |
|---|---|---|---|
| I | 4 | 0 | — |
| II | 5 | 2 | — |
| III | 5 | 3 | 1 |

- Manual: 3 target rules (checked top to bottom, the first match wins, the last is "otherwise"),
  the short-circuit list, and the lock condition ("switch 5 is locked until switch 3 is ▲").
- A short circuit is a condition on 2–3 switches ("switches 3 and 4 both ▲"). No board state that
  matches one is allowed, not even on the way.
- Action `{ kind: 'flip', sw }`.
  - Flipping into a short circuit is a strike, and the flip is undone.
  - Flipping a locked switch returns `null`: no write and no strike. The panel shows a local
    "LOCKED" rattle, using the pure `isLocked(module, state)`.
  - The module clears when the state equals the target.
- State: `mods[i].sw`, an integer bitmask (bit k = switch k+1 is ▲).
- Generator guarantee: the start state and the target are not short circuits, and a BFS over the
  2^n states (respecting the lock) finds a path. At tier II and III, the naive order (flip the
  differing switches left to right) must pass through a short circuit or a lock, so order
  matters. Re-roll until both hold.

### 4.7 RELAY (new; Medium and Hard)

Each stage has a display word (`HOLD`, `SEND`, `MUTE` or `OPEN`) and a digit 1–4, above 4 keys
labelled 1–4 in shuffled order.

| Tier | Stages | Look-back | On a strike |
|---|---|---|---|
| I | 3 | 1 stage | Stay on the stage |
| II | 4 | Up to 2 stages | Stay on the stage |
| III | 5 | Up to 2 stages | **Back to stage 1** with new displays |

- Manual: one rule block per stage, with one rule per word. Rule kinds: `labelIsDisplay`,
  `position(n)`, `samePositionAs(stage)`, `sameLabelAs(stage)`, `leftmost` and `rightmost`.
- Action `{ kind: 'press', key }` (key = a position from 0 to 3).
- State: `mods[i].presses = [{ pos, label }]` and `mods[i].resets`. The stage displays are seeded
  from `rng(seed + ':' + modIndex + ':' + resets)`, so a tier III reset re-rolls them the same way
  on both screens.
- The Tech panel shows the stage lamps. The Handbook page shows every stage's rules. Neither
  screen shows the press log; players keep it themselves (that is the design).

### 4.8 PULSE (new; Medium and Hard)

A lamp flashes a colour pattern, pauses, and repeats. The Tech tunes a dial and presses TX.

| Tier | Codebook | Patterns |
|---|---|---|
| I | 8 entries | No two entries share a 2-flash prefix |
| II | 12 entries | Shared prefixes, and at least one entry is a rotation of another (the mid-loop trap) |
| III | 12 entries | Long flashes, where a long flash counts as two of that colour ("R— B G" = R R B G) |

- The flash timeline is a pure function of `(module, armedAt, now)` from the server clock, so both
  screens (and spectators) agree. Short flash: 450 ms on, 250 ms off. Long flash: 1 000 ms on.
  Pause: 1 600 ms.
- Every flash shows its letter under the lamp. With `prefers-reduced-motion`, the lamp does not
  change colour; only the letter strip ticks along.
- The dial steps only through the codebook frequencies, in sorted order. Action
  `{ kind: 'tx', freq }`. The wrong frequency is a strike.

### 4.9 PRESSURE GAUGE (new; "+G" levels only; never solved)

| Tier | Fill time (10% → 100%) | Amber rule |
|---|---|---|
| I | 60 s | Uses the serial (vowel → A, else C) |
| II | 45 s | Uses an indicator |
| III | 35 s | As II, and after each vent the right valve for each zone moves one step (A→B→C→A) |

- Zones: GREEN 0–49%, AMBER 50–79% and RED 80–99%. The zone name is printed under the needle.
- State: `wire.gauge = { base, at, vents }`. Pressure =
  `base + (now − at) / fillMs × 90`, clamped. It is set to `{ 10, armedAt, 0 }` on arm.
- Action `{ kind: 'vent', valve }` (the module index is the Gauge's slot).
  - A correct valve in AMBER or RED sets `{ base: 10, at: now, vents: vents + 1 }`.
  - Any vent in GREEN, or the wrong valve, is a strike, and the pressure is unchanged.
- **Burst**: at pressure 100, whichever seated client notices first runs `applyGaugeBurst(wire,
  bomb, now)` in a transaction (the same watchdog pattern as `applyTimeout`). The result is a
  strike and `{ base: 40, at: burstAt, vents }`. It can cause the boom.
- Excluded from "all modules solved". The Tech's Gauge tab blinks from AMBER (`arcade-blink`,
  plus the label "GAUGE!").
- `fillMs` is scaled with `scaledMs(base, timerScale)`. **With the timers off, the Gauge still
  runs** at the base rate (default decision, §12).

### 4.10 CALL SIGN (new; Medium and Hard)

| Tier | Word length | Letters per wheel |
|---|---|---|
| I | 4 | 4 |
| II | 5 | 6 |
| III | 5 | 6, and every letter is shifted forward by the serial's last digit |

- The word lists are original to this game: `src/lib/wire/callsignWords.js`, at least 60
  four-letter and 60 five-letter common English words. They are family-friendly and follow
  `docs/content-policy.md`.
- Generator guarantee: **exactly one** list word can be spelled with the wheels (checked against
  the whole list for that length), and at least 3 words survive the first wheel. Re-roll until
  both hold.
- Wheel positions are local UI state; only TRANSMIT writes. Action
  `{ kind: 'transmit', word }`. The wrong word is a strike.
- Tier III: the Handbook shifts letters back by the digit. The manual prints the rule and an
  A–Z strip.

## 5. Modifiers

All modifiers derive from the seed. The ready card lists them before arming ("MODIFIERS: SHORT
FUSE · ERRATA"), and a small chip row stays on both screens while the bomb is armed.

| Modifier | Effect | Implementation |
|---|---|---|
| **Scrambled Pages** | The Handbook's tabs come in a different order from the Tech's modules. Tabs show names only. | `bomb.pageOrder`, a permutation. `WireManual` renders tabs in that order. |
| **Errata** | A red slip at the top of one manual page replaces one rule. The solver uses the replacement. | `bomb.errata = { mod, patch }`. Each eligible module exports `applyErrata(manual, patch)`. Eligible: wires, lever, patch, switch, gauge. |
| **Short Fuse** | A strike costs 25 s. The clock turns red at 45 s instead of 30 s. | `bomb.strikePenaltyMs` and `bomb.urgentMs` |
| **Blackout** | Every 25 s after arming, the Tech's module panel goes dark for 3 s. Outlines, the clock and letter tags stay; actions still work. | Pure `isBlackout(wire, now)`, used only for rendering |
| **Swap** | At half time, the roles swap once. | `wire.swapAt = armedAt + durationMs / 2`, set on arm. `roleOf(wire, symbol, now)` returns the swapped role once `now ≥ swapAt`. A full-width banner "SWAP! YOU ARE NOW THE HANDBOOK" shows for 3 s. |

No modifier hides colour-letter tags, the timer or quick phrases.

## 6. Synced state (`games/{id}/wire`)

All state stays under `wire`. `FIELD_NULLS` already has `wire: null`, so switching games clears
all of it, and **no new room keys are needed**.

```js
wire: {
  seed, level, bombNo, tech, phase, strikes,   // as today
  mode: 'easy' | 'medium' | 'hard' | null,     // new: null until confirmed
  modeProposal: { by: 'X'|'O', mode, at } | null,
  run: { booms, ms },                          // new: this run's booms and total armed ms
  armedAt, endsAt, swapAt,                     // swapAt: only with Swap
  solved, mods, last, result, ping,            // as today; `mods[i]` shapes per §4
  gauge: { base, at, vents } | null,           // only on "+G" levels
  stats: { defused, booms, records: { easy: { bestMs, fewestBooms, clears }, medium: …, hard: … } },
}
```

### 6.1 `generateBomb(seed, level, mode)`

- `mode` is set: use the mode table. Draw modules from the pool, assign the slot tiers, append the
  Gauge on "+G" levels, draw modifiers, and derive the clock with `scaledMs(clockMs, timerScale)`
  (as `arm()` does today).
- `mode` is missing: use the **legacy** generator, a frozen copy of today's `generateBomb`. This
  keeps bombs that are dealt or armed during the deploy byte-identical on both screens. A snapshot
  test pins it. Delete it one release later.
- Determinism: one RNG stream per bomb, `makeRng('wirecrossed:' + seed)`, consumed in a fixed
  order: shell, modifiers, slot types, slot tiers, then each module in slot order. Modules must
  never call `Math.random` or `Date.now`.

### 6.2 `nextWireBomb(previous, seed)` (in `wireMatchLogic.js`; stays small, eagerly imported)

- `MODE_LEVELS = { easy: 2, medium: 3, hard: 3 }` lives here. The full mode table lives in
  `src/lib/wire/modes.js` (lazy).
- A previous defuse below the last level: `level + 1`, and `run` carries.
- A previous defuse on the last level (run cleared): `level 1`, same mode, new `run`.
- A previous boom: same level, and `run.booms + 1`.
- No previous bomb (NEW MATCH or switch): `mode: null`, `level 1`, `stats: null`.
- `tech` alternates as today.

### 6.3 Reducers (`wireLogic.js`)

- `armWire(wire, now, durationMs, bomb)`: as today, plus `gauge` (on "+G" levels) and `swapAt`
  (with Swap). It refuses when `!wire.mode` (legacy bombs are exempt).
- `applyWireAction(wire, bomb, action, now, by)`: as today, but it dispatches `judge` to the
  module file, uses `bomb.strikePenaltyMs`, and routes `{ mod: gaugeIndex, kind: 'vent' }` to the
  Gauge. The "all solved" check skips the Gauge.
- `applyGaugeBurst(wire, bomb, now)`: new, and pure. It returns `null` when the gauge is not at 100%.
- `finish(...)`: on a defuse at the last level, it sets `result.cleared = true`, adds `run.ms`, and
  updates `stats.records[mode]`.
- `proposeMode`, `acceptMode`, `cancelMode`: new reducers for §3.4, and pure.

### 6.4 Records

For each mode: `bestMs` is the shortest cleared run, `fewestBooms` the fewest booms in a cleared
run, and `clears` the number of clears. Records carry across PLAY AGAIN and reset on NEW MATCH, as
the streak does today. They replace `streak` and `best`, since there is no endless climb. The
result card shows "EASY CLEARED · 4:12 · 1 BOOM · BEST 3:40".

## 7. Code layout

### 7.1 Files

```
src/lib/wire/
  rng.js              makeRng, int, pick, shuffle, sample        (moved from wireLogic.js)
  shell.js            serial, indicators, bomb conditions        (moved)
  modes.js            MODES table, pools, severities, tier/modifier draw
  modifiers.js        pageOrder, errata, isBlackout, roleOf
  legacy.js           frozen legacy generateBomb (delete next release)
  callsignWords.js
  modules/
    index.js          MODULES registry { wires, keypad, lever, maze, patch, switch, relay, pulse, gauge, callsign }
    wires.js keypad.js lever.js maze.js patch.js switch.js relay.js pulse.js gauge.js callsign.js
    *.test.js         one beside each
src/lib/wireLogic.js  generateBomb, reducers, clock helpers; re-exports what the page and e2e import today
src/components/wire/
  panels/<Name>Panel.jsx    Tech panels (split from WireDevice.jsx)
  manual/<Name>Manual.jsx   Handbook pages (split from WireManual.jsx)
  ModePicker.jsx, ModifierChips.jsx
  WireDevice.jsx / WireManual.jsx   become thin registries
```

### 7.2 Module interface

```js
export default {
  type: 'patch',
  name: 'PATCH BAY',
  generate(rng, tier, ctx),          // → { type, tier, device, manual, ...solution }
  judge(module, bomb, wire, i, action, now), // → { ok, solved, progress, text } | null (as today)
  solveNext(module, bomb, wire, i, now),     // → the next correct action (tests + e2e only)
  applyErrata?(manual, patch),
  errataCandidates?(rng, module),
}
```

`solveNext` lets unit tests and e2e drive any module generically. The e2e helper
`solveModule(page, bomb, m)` becomes one loop over `solveNext`.

### 7.3 UI changes (`WireCrossedGame.jsx`)

- Key the tabs by index (F-05). With 6 tabs (5 slots + Gauge), the tab row becomes a 3-column
  grid with 2 rows. Each tab keeps `min-h-11`.
- The ready card: the mode picker (§3.4) when `!wire.mode`. Otherwise: the mode, level X of N,
  module count, clock, the modifier list and CHANGE MODE.
- The result card: "MODE CLEARED" plus records on a clear; otherwise as today, with "RETRY LEVEL
  N" or "NEXT: LEVEL N+1".
- `roleOf()` replaces the `role` const, so Swap works. The sound effects keep working.
- Every new action button follows `useBusy`: PATCHING…, FLIPPING…, TRANSMITTING…, VENTING….
- Every panel is keyboard reachable (the review-a-game checklist). Arrow keys stay limited to Pipes.

## 8. Rules (`database.rules.json`) (fixes F-06 for new state)

Add validation under `games/$id/wire`:

- `mode`: `'easy' | 'medium' | 'hard'`
- `modeProposal`: `by` ∈ {X, O}, `mode` as above, `at` a number, `$other: false`
- `level`: an integer from 1 to 3
- `gauge`: `base` and `vents` numbers, `at` a number, `$other: false`
- `swapAt`: a number

Moves run `runTransaction` on the whole room, so every `.validate` must accept unchanged data
(compare with `data`); see `.claude/rules/firebase-rules.md`. Add a case for each new key to
`tests/rules/wirecrossed.test.js`, plus an "unchanged sibling passes" case.

## 9. Tests

| Kind | What |
|---|---|
| Unit, each module | Tiers I–III generate valid modules for 500 seeds. `solveNext` clears every one. Every wrong action type is a strike. Determinism: two `generate` calls with the same seed deep-equal. |
| Unit, modes | Invariants: every pool ≥ the largest slot count; the table matches §3.1; modifiers are distinct and within severity. |
| Unit, legacy | A snapshot of `generateBomb(seed, level)` without a mode for 20 fixed seeds × 6 levels, identical to today's output. |
| Unit, reducers | Mode proposal and accept flows; run progression (boom retries, last-level clear resets); Gauge burst; Swap `roleOf`; Short Fuse penalty; F-04 lever check. |
| Rules | §8 |
| E2E (`tests/e2e/wirecrossed.spec.js`) | Update the existing spec: X proposes EASY, O accepts, and they clear 2 levels with `solveNext`, reaching MODE CLEARED. Add a Hard level 2 spec using a fixed seed with Gauge + Scrambled Pages: vent once, solve all, defuse. |

Commands: `npm test`, `npm run test:rules` and `npm run test:e2e`.

## 10. Delivery plan

The default decision is a foundation PR first, then one PR per module (§12). Each PR ships its own
logic tests, rules cases, its part of the e2e spec, and a HOW TO PLAY update in `src/lib/rules.js`.

| PR | Scope | Size |
|---|---|---|
| 1. Foundation | Split into `src/lib/wire/`; module interface; `legacy.js`; modes and run flow; mode proposal UI; records; tabs by index (F-05); lever F-04 fix; rules (F-06); Scrambled Pages and Short Fuse. The pools contain only the classic 4 at tier I until PR 2. | L |
| 2. Classic tiers | Tiers II and III for Wires, Glyphs (plus mirrored glyph art), Lever and Pipes | M |
| 3. Patch Bay | + Easy, Medium and Hard pools | M |
| 4. Switchboard | | S/M |
| 5. Pressure Gauge | + the burst watchdog, the "+G" levels and the timers-off behaviour | M |
| 6. Pulse | | S/M |
| 7. Relay | | S/M |
| 8. Call Sign | + the word lists (content pass) | M |
| 9. Modifiers | Errata, Blackout and Swap | M |

Until PR 9 ships, the modifier draw only picks shipped modifiers. Until PR 5 ships, "+G" levels
play without the Gauge. The game stays playable after every PR.

## 11. Risks

| Risk | Mitigation |
|---|---|
| The two screens derive different bombs (a non-deterministic generator) | One RNG stream, a fixed draw order, no `Math.random` or `Date.now` in `src/lib/wire/`, and deep-equal determinism tests |
| An unsolvable generated module | Each generator validates itself with its own `solveNext` and re-rolls; a 500-seed property test per tier |
| In-flight bombs break on deploy | `legacy.js` for wire nodes without a `mode`, pinned by a snapshot |
| A transaction fails with `permission_denied` from another key | Validate against `data` for unchanged values; add an unchanged-sibling rules test |
| Hard level 3 is too hard to ever clear | Playtest before PR 9 merges; tune the clock in `modes.js` (one table edit) |
| The Gauge burst is double-written by both clients | The transaction and a pure `applyGaugeBurst` return `null` unless the pressure is at 100% for the current `gauge.at` |
| Hidden information in a world-readable room | An honour system, as for every co-op game (`docs/prds/README.md`) |

## 12. Decisions

Decided by the owner:

- **Modules**: all six new modules.
- **Modes**: Easy (2 levels × 2 modules), Medium (3 × 3), Hard (3 levels: 3 → 4 → 5 modules).
  Modifiers grow with the mode.
- **Modifiers**: all five. Easy uses mild modifiers only.
- **Hard clock**: 2:45, 3:00, 3:15.
- **After a boom**: retry the same level.
- **Endless mode**: dropped.
- **Choosing the mode**: either player proposes, and the other confirms.

Settled by default (the recommended option on the review page). **Confirm or change before PR 1:**

- **Delivery**: a foundation PR first, then one PR per module (§10).
- **Lever F-04**: fix the release check for every tier, including tier I.
- **Gauge with timers off**: the Gauge still fills at its base rate.
