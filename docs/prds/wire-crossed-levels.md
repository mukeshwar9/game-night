# PRD: WIRE CROSSED — more levels, new modules, and the 0:00 timer bug

**One-liner:** grow WIRE CROSSED (shipped co-op defusal: one Tech sees the bomb, one Handbook
reads a manual generated for that bomb) from its effective three tiers to a named 15-level
ladder plus Endless, with six phone-sized modules, and fix the bug that freezes a bomb at 0:00.

| | |
|---|---|
| `type` | `wirecrossed` (existing) |
| Category | `reflex`, co-op (`coop: true`, in `COOP_GAMES`) |
| Players | 2 today; 3–4 as an expansion |
| Integration | **C** — custom page (`src/pages/WireCrossedGame.jsx`) |
| Network | RTDB whole-room transactions; bomb derived locally from `wire.seed` + `wire.level` |
| Effort | **L** overall (≈ 16–22 working days in four phases); timer fix **S** |
| Priority | **P1** timer fix · P1 Phase 0 · P2 Phase 1 · P3 Phases 2–3 |

Source: scout report `games-wirecrossed-levels-s1` (2026-09-27, base `origin/main` @ `2c8f0bc`),
including a Lavish review with the captain. Every claim below was checked against the code at
that commit; "measured" means a script ran the real generator.

---

## 1. How it works today (evidence)

| Piece | Where | Role |
|---|---|---|
| Generator + reducers (pure) | `src/lib/wireLogic.js` | seeded RNG, bomb shell, 4 module generators, solvers, manual text, `applyWireAction` |
| Next-bomb node | `src/lib/wireMatchLogic.js` | level climb/hold, bomb number, Tech flip, stats carry; imported eagerly by `games.js`, so it must stay tiny |
| Page | `src/pages/WireCrossedGame.jsx` | roles, arm, transactions, timeout, sounds, quick phrases, result card |
| Device / manual / glyphs | `src/components/wire/WireDevice.jsx`, `WireManual.jsx`, `WireGlyph.jsx` | one panel and one manual page per module type (`PANELS`, `MANUALS` maps) |
| Registry | `src/lib/games.js:1245-1257`, `:1599-1602`, `:1683`, `:1983-1988` | `custom`, `coop`, `solo: false`; Tech = rotating starter; `wire` in `FIELD_NULLS` |
| Rules | `database.rules.json:274-300` | validates `wire/seed`, `tech`, `phase`, `strikes` (0–3), `ping` (`p` < 10). **`level`, `mods`, `solved`, `result`, `stats` are unvalidated** |
| Tests | `src/lib/wireLogic.test.js`, `wireMatchLogic.test.js` (26 pass), `tests/rules/wirecrossed.test.js`, `tests/e2e/wirecrossed.spec.js` | |

**Generation is seeded, not hand-authored.** `generateBomb(seed, level)` (`wireLogic.js:375-384`)
derives serial, two indicators, a ruleset label, module types (`sample(MODULE_TYPES, count)`,
so at most one of each) and each module's device + manual from one xmur3→mulberry32 stream.
Both screens call it independently; only progress is synced. The manual is new every bomb, so
the skill is communication, not memorisation.

**Timer / strikes / scoring.** 3:00 clock (2:30 from L5), scaled by the room timer scale
(relaxed ×2, or off → counts up). 3 strikes, each −15 s (`:15-16`, `:576-582`). A defuse credits
+1 to both seats; team ★ = `min(X, O)`. `wire.stats` (streak/best/defused/booms) is room-scoped:
NEXT BOMB carries it, NEW MATCH wipes it. NEXT BOMB is propose → partner ACCEPT; roles swap;
level +1 after a defuse, held after a boom (`wireMatchLogic.js:19-35`). No same-device mode
(`supportsLocalPlay` excludes custom games) and no `/demo`.

### Finding 1 — the level ladder is thinner than it looks

`WIRE_MAX_LEVEL` is 6, but the only knobs are:

| Knob | Code | L1 | L2 | L3 | L4 | L5 | L6 |
|---|---|---|---|---|---|---|---|
| Modules | `moduleCountForLevel` `:368` | 3 | 3 | 4 | 4 | 4 | 4 |
| Max wires | `genWires` `:196` | 4 | 5 | 6 | 6 | 6 | 6 |
| Pipe min steps | `genMaze` `:353` | 5 | 7 | 7 | 7 | 7 | 7 |
| Clock | `bombMsForLevel` `:369` | 3:00 | 3:00 | 3:00 | 3:00 | 2:30 | 2:30 |

Measured (2,000 seeds per level, real `generateBomb`):

```
L1 mods/bomb=3.00 wires=3.52 otherwise=38% bombCondDecides=21% leverTap=29% mazePath=12.2 ms=180000
L2 mods/bomb=3.00 wires=4.02 otherwise=38% bombCondDecides=20% leverTap=30% mazePath=13.3 ms=180000
L3 mods/bomb=4.00 wires=4.53 otherwise=38% bombCondDecides=20% leverTap=31% mazePath=13.4 ms=180000
L4 mods/bomb=4.00 wires=4.53 otherwise=38% bombCondDecides=20% leverTap=31% mazePath=13.4 ms=180000
L5 mods/bomb=4.00 wires=4.53 otherwise=38% bombCondDecides=20% leverTap=31% mazePath=13.4 ms=150000
L6 mods/bomb=4.00 wires=4.53 otherwise=38% bombCondDecides=20% leverTap=31% mazePath=13.4 ms=150000
```

- **L3 ≡ L4 and L5 ≡ L6** — byte-identical bombs for the same seed.
- Rule complexity never rises: 3 rules + "otherwise" per wire table at every level; glyphs and
  lever ignore `level`; the pipe minimum is cosmetic (a perfect maze averages 12–13 steps).
- From L3 every bomb holds all four types, so variety stops there. Players feel three tiers.

### Finding 2 — no telemetry

`Game.jsx:277-286` records round ends only on `status: 'finished'`; pages that finish in
page-local phases must call `recordRoundEnd` themselves. WIRE CROSSED does neither, so no
defuse/boom is counted anywhere. Balancing needs this first.

### Finding 3 — BUG: the bomb can freeze at 0:00 and never explode (reported by players)

Friends reported "the timer is broken sometimes". Reproduced.

- **Where:** `WireCrossedGame.jsx:225-238`. Each seated client schedules **one** `setTimeout`
  for `endsAt - getServerNow() + 60`. When it fires it runs `applyTimeout(current.wire,
  getServerNow())`; if the client's server-corrected clock is still before `endsAt`, that
  returns `null` and **nothing reschedules** (the effect only re-runs when `endsAt` changes). A
  failed transaction is swallowed (`.catch(() => {})`) the same way.
- **Trigger:** the client's server-corrected clock moves backwards by more than the 60 ms margin
  during the bomb — a reconnect that updates `.info/serverTimeOffset` (common on mobile data), a
  device clock correction — or the timeout transaction fails once. The clock blinks at 0:00 and
  stays `armed`; the Handbook can do nothing; only a Tech action (which checks the timeout in
  `applyWireAction`) ends it.
- **Evidence:** two real browsers on the emulators, bomb shortened with an owner write,
  `Date.now` shifted back on both pages after arming:

```
shift=0     phase=over   (boom, reason time)
shift=200   phase=over   (boom, reason time)
shift=2000  phase=armed  result=null  timer=0:00      <- stuck
--- with the fix below ---
shift=2000  phase=over   (boom, reason time)
shift=5000  phase=over   (boom, reason time)
```

- **Fix** (verified: repro booms; `tests/e2e/wirecrossed.spec.js` passes; eslint clean):

```diff
   // The clock ran out: whichever seated client notices first writes the boom.
   const endsAt = armed ? wire?.endsAt : null
+  // It re-checks until the bomb leaves 'armed': a timer that fires a little
+  // early by server time (offset/clock moved back) or a failed transaction
+  // must not leave the bomb frozen at 0:00.
   useEffect(() => {
     if (!endsAt || isSpectator) return undefined
-    const t = setTimeout(() => {
+    let t
+    const check = () => {
+      const wait = endsAt - getServerNow()
+      if (wait > 0) { t = setTimeout(check, wait + 60); return }
       runTransaction(ref(db, `games/${gameId}`), current => {
         if (!current || current.gameType !== 'wirecrossed') return
         const next = applyTimeout(current.wire, getServerNow())
         if (!next) return
         return withWire(current, next)
-      }).catch(() => {})
-    }, Math.max(0, endsAt - getServerNow()) + 60)
+      }).catch(() => {}).finally(() => { t = setTimeout(check, 1000) })
+    }
+    check()
     return () => clearTimeout(t)
   }, [endsAt, gameId, isSpectator])
```

- **Regression test** (`tests/e2e/wirecrossed-timeout.spec.js`; drafted, not yet run against
  the fix on a free emulator — the shared ports were busy):

```js
test('the bomb goes off at 0:00 even after the clock slips backwards', async ({ browser }) => {
  // create room, join, ARM (see wirecrossed.spec.js helpers)
  // owner write: wire/endsAt = wire/armedAt + 10_000
  // on both pages: const real = Date.now.bind(Date); Date.now = () => real() - 3000
  // expect 'BOOM' on both screens within 30 s, and 'OUT OF TIME.'
})
```

**Other timer rough edges (from code, not reproduced):**
- LEVER release is judged on a fresh clock string at release (`WireDevice.jsx:134`), but the
  display refreshes every 250 ms (`useServerClock({ tickMs: 250 })`); letting go in the last
  instant of the right digit can strike. Fix: judge the text last rendered, or a 300 ms grace.
- The two phones show their own server-corrected time and can differ by a few hundred ms.
- A strike's −15 s is signalled only by a small red line; flash it on both screens.
- With room timers OFF the clock counts up, which can read as broken.

### Finding 4 — mobile and data-model constraints for expansion

- Real 390×844 screenshots: 3–4 modules fit. The module tab grid is N equal columns with 8 px
  labels (`WireCrossedGame.jsx:390`); at 5–6 modules labels overflow — needs a two-row grid.
- Tab keys use `m.type` (`WireCrossedGame.jsx:392`, `WireManual.jsx:161`) and labels come from
  `MODULE_NAMES[type]`: two modules of one type need index keys and A/B labels.
- The Handbook also sees serial and indicators (`BombStrip` renders for every role, `:386`) — a
  free difficulty knob ("blind Handbook").
- The Handbook's pipe map shows the start ○ but not the live dot — good asymmetry to keep.
- Quick phrases are capped by the rule `p < 10`; adding phrases needs a rules change.
- Spectators see the Tech's device — cheap hook for 3–4 players (see §5).

---

## 2. Goals / non-goals

**Goals**
- Fix the 0:00 freeze (ship first, standalone).
- A named ladder where every level teaches one thing, then Endless.
- Fresh content every bomb (keep the seeded generator), unique answers by construction.
- Data to balance against (per-level defuse rate, strikes per module type).
- Stay phone-first and voice-first; everything readable at 390 px.

**Non-goals (v1)**
- Hand-authored fixed bombs; a global verified leaderboard; a same-device mode.

---

## 3. Level ladder (15 levels + Endless)

**Model (decided default: hybrid).** A hand-authored `LEVELS` table fixes module pool, per-module
tier, clock, strikes and twists; the seed makes the content; after L15 a budget allocator runs
Endless. Rejected: hand-authored bombs (memorisable, heavy authoring) and pure procedural (no
identity per level, budget spikes).

**Tiers.** WIRES T1 ≤4 wires, 2 rules · T2 ≤5 wires, 3 rules incl. serial/indicator conditions ·
T3 ≤6 wires, 4 rules with "unless" exceptions. GLYPHS T1 5 columns · T2 6 columns with a
near-miss column sharing 3 of 4 glyphs · T3 two near-misses. LEVER T1 2 tap rules · T2 +bomb
conditions · T3 3 tap rules, strip digit shifts with strikes. PIPES T1 today · T2 must pass a
checkpoint · T3 two wall maps, an indicator picks one. New modules have T1/T2.

**Budget.** Cost WIRES/GLYPHS/LEVER 2/3/4, PIPES 3/4/5, SWITCHES/DIAL/LOCKWORD 3/4,
CIRCUIT/SIGNAL 4/5. Modifiers: blind Handbook +2, decoy page +1 each, needy VENT +3, twins +1,
chain rule +2. Pressure = budget ÷ clock minutes.

| L | Name | Modules | New (what it teaches) | Clock | Budget | Pressure |
|---|---|---|---|---|---|---|
| 1 | FIRST WIRE | WIRES T1, LEVER T1 | roles; describe-then-read loop | 3:00 | 4 | 1.3 |
| 2 | GLYPH TALK | + GLYPHS T1 | naming shapes aloud | 3:00 | 6 | 2.0 |
| 3 | PIPE DREAM | WIRES, GLYPHS, PIPES | coordinates; Handbook tracks position | 3:00 | 7 | 2.3 |
| 4 | FULL KIT | 4 classic, WIRES/LEVER T2 | serial/indicator rules (today's L3) | 3:00 | 11 | 3.7 |
| 5 | READ IT OUT | 4 classic | blind Handbook — Tech reads the shell | 2:50 | 13 | 4.6 |
| 6 | SWITCHBOARD | 4 of 5 (+SWITCHES) | configuration talk | 2:50 | 14 | 4.9 |
| 7 | UNLESS | 4, WIRES/LEVER T3 | exceptions | 2:45 | 16 | 5.8 |
| 8 | ON AIR | 5 (+DIAL) | five modules; breather clock | 3:15 | 18 | 5.5 |
| 9 | DECOYS | 5 | manual carries 2 pages for absent modules | 3:00 | 20 | 6.7 |
| 10 | PRESSURE | 5 + VENT | interruptions, triage | 3:00 | 22 | 7.3 |
| 11 | LOCKWORD | 5 (+LOCKWORD) + 1 decoy | spelling under pressure | 2:50 | 21 | 7.4 |
| 12 | TWINS | 6, two of one type (A/B) | keeping twins apart; breather | 3:15 | 25 | 7.7 |
| 13 | CHAIN | 6 + cross-module rules | order matters | 3:00 | 27 | 9.0 |
| 14 | SIGNAL FIRE | 6 (+SIGNAL) + VENT | memory across stages | 3:00 | 30 | 10.0 |
| 15 | MAINFRAME | 6 top tiers + VENT + 2 decoys | final exam | 2:45 | 35 | 12.7 |
| 16+ | ENDLESS | procedural | +2 budget per bomb, clock floor 2:15 | — | 37+ | — |

Balance targets (tuning goals, not measurements): defuse rate L1–3 ≥ 90%, L4–8 70–85%,
L9–12 55–70%, L13–15 35–50%. Keep 3 strikes and −15 s at every level; tighten clocks instead.
After a boom: hold the level, plus a picker for any reached level.

---

## 4. New modules

Criteria: fits a 390 px card; the Tech has something to *describe*, the Handbook something to
*look up*; unique answer by reject-sampling (like `genKeypad`); pure solver for tests;
family-safe text via `wordDenylist.js`; all rules text original.

| Module | Tech sees / does | Handbook reads | Talk | T2 |
|---|---|---|---|---|
| SWITCHES (L6) | 5 toggles + 5 LEDs; set, COMMIT | LED pattern → target toggle pattern | "on off off on on" → "up down down up up" | forbidden pattern = strike |
| DIAL (L8) | 4-letter call sign, frequency dial 3.505–3.600, TX | call sign → frequency, list full of look-alikes (BOLT/BOLD) | spelling | two call signs; indicator picks |
| LOCKWORD (L11) | 5 letter columns cycling 4–6 letters; SUBMIT | 30-word list; exactly one formable | column-by-column letters | 6 letters/column, near-anagrams |
| CIRCUIT (Endless) | wires with LED, ★ sticker, stripe | attribute grid → CUT / SKIP / CUT IF … | per-wire attributes | more shell-keyed letters |
| SIGNAL (L14) | 4 lamps flash a growing sequence; press mapped buttons | colour → button map that changes with strikes and serial vowels | memory + remap | 5 stages |
| VENT, needy (L10) | gauge fills every 40–50 s; Y/N prompt | "VENT GAS? → YES unless …" | forces interruptions | shorter cycle |

Prototype evidence (scratch, real `makeRng`): LOCKWORD unique on the first draw (avg 1.07 tries
with 6-letter columns, 1.02 with 4); SWITCHES with 5 toggles / 6 LED rows unique on 61.3% of
first draws (≈ 1.6 draws expected).

UI: two-row tab grid at 5–6 modules; index-keyed tabs with A/B for twins; a needy banner above
the module card; blind Handbook masks the serial ("ASK THE TECH"); level picker on the ready
card (reached levels unlocked; DAILY / ENDLESS buttons later). Mockups: the Lavish board from
the scout report (`games-wirecrossed-levels-s1`).

---

## 5. Beyond the ladder

- **Progression:** `users/{uid}/wire = { maxLevel, defused, booms, bestTimes }`, owner-written;
  the pair may play up to the higher record. Cosmetic casings at L5/L10/L15.
- **Daily bomb:** seed `daily:${todayKey()}` (`src/lib/daily.js`), fixed L8-equivalent spec,
  friends board of time + strikes; verifiable later by replaying the action log in a function.
- **Endless / survival:** chained bombs, next clock = time left + 45 s, strikes carry,
  budget +2 per bomb.
- **3–4 players:** first, spectators become extra Readers holding a split manual (no seat
  changes); later a `wirecrossed-crew` nPlayer variant.
- **Manual on any screen:** read-only `/wire/manual/:seed/:level` for a laptop/TV.
- **Teaching stats:** strikes per module, best time per level, pair record, and a post-bomb
  "what the manual said" reveal for the Tech.

---

## 6. Technical plan

### Files

| File | Change |
|---|---|
| `src/lib/wireLevels.js` (new) | `LEVELS`, `MODULE_COST`, `levelSpec(level)`, Endless allocator |
| `src/lib/wireLogic.js` | `generateBomb` reads the spec; generators take a `tier`; pool with twins; decoys; shell visibility; `GEN_VERSION` |
| `src/lib/wire/<module>.js` (new) | gen / solve / judge / describe per module, each with `.test.js` |
| `src/lib/wireMatchLogic.js` | max level, `mode`, carry `gen` — keep tiny (entry bundle) |
| `src/components/wire/*` | new panels + manual pages; index-keyed tabs; two-row grid |
| `src/pages/WireCrossedGame.jsx` | timeout fix; level picker; blind shell; needy tick; `recordRoundEnd` on over; version gate |
| `database.rules.json` + `tests/rules/wirecrossed.test.js` | validate `wire/level` (1..99), `gen`, `mode`, `needy`; owner-only `users/{uid}/wire` |
| `src/lib/rules.js` | HOW TO PLAY per module |
| `tests/e2e/` | `wirecrossed-timeout.spec.js`; seed a level and solve each new module type |

### Level data format

```js
export const LEVELS = [
  { id: 1, name: 'FIRST WIRE', clockS: 180, strikes: 3, penaltyS: 15,
    modules: { count: 2, pool: ['wires', 'lever'], require: ['wires'], allowTwins: false },
    tiers: { wires: 1, lever: 1 },
    twists: { blindShell: false, decoyPages: 0, needy: null, chainRules: 0 },
    teaches: 'Roles and the describe-then-read loop' },
  // …
]
export const MODULE_COST = { wires: [2,3,4], keypad: [2,3,4], lever: [2,3,4], maze: [3,4,5],
  switches: [3,4], dial: [3,4], lockword: [3,4], circuit: [4,5], signal: [4,5] }
```

Synced additions: `wire.gen`, `wire.mode` (`ladder | endless | daily`), per-module progress
(`toggles`, `freq`, `cols`, `stage`), `wire.needy` (`nextAt`, `answered`).

### Version skew (must handle)

Both phones derive the bomb locally; a stale build mid-session shows a **different bomb** and a
correct cut is judged against the wrong manual. Stamp `wire.gen = GEN_VERSION` when dealing; an
older client shows "UPDATE TO KEEP PLAYING" and triggers the SW update. Keep `gen: 1` output
byte-identical for today's levels so in-flight rooms survive the deploy.

### Balancing and testing

1. Vitest invariants over 5–10k seeds per level: solvable, unique, solver = judge, budget ±2.
2. `scripts/wire-difficulty.mjs` (the scout's analysis script) with a snapshot test so difficulty
   drift shows in review.
3. Telemetry: `recordRoundEnd('wirecrossed', 'multi', …)` + per-level defuse/boom and strikes per
   module type.
4. `?wireLevel=N` in emulator mode for playtests.
5. e2e: the timeout regression; one bomb per new module type solved with the pure solver.

### Bundle

Today `WireCrossedGame` chunk 37.2 KB raw / 12.1 KB gzip; entry 254.3 / 320 KB gzip budget.
Estimate +25–35 KB raw / +8–11 KB gzip on the lazy chunk; entry unaffected if `wireLevels.js` is
imported only by lazy code. Past ~25 KB gzip, lazy-load panels per module.

### Phases

| Phase | Scope | Effort |
|---|---|---|
| Fix | 0:00 freeze fix + `wirecrossed-timeout.spec.js` | < 0.5 d |
| 0 | `LEVELS` for today's 4 modules; distinct L4/L6 (T2/T3, blind Handbook at L5); telemetry; `wire.gen`; `level` rules | 1–1.5 d |
| 1 | SWITCHES + DIAL, tiers, decoys, VENT, two-row tabs, level picker, per-user `maxLevel`, manual reveal → ladder to L10 | 5–7 d |
| 2 | LOCKWORD, CIRCUIT, SIGNAL, twins, chain rules, Endless, balancing pass → L11–15 | 6–8 d |
| 3 | daily bomb, stats, spectator readers, manual-on-any-screen | 4–6 d |

---

## 7. Product calls (recommended defaults; captain may override)

| # | Call | Recommended | Alternatives |
|---|---|---|---|
| C1 | Level model | hybrid ladder + seeded content + Endless | hand-authored; pure procedural |
| C2 | Ladder size | 15 | 10; 20 |
| C3 | After a boom | hold level + picker for reached levels | drop after 2 booms; reset to L1 |
| C4 | Progress | per user; pair plays up to the higher | room only; per pair |
| C5 | Blind Handbook | from L5 | never; Hard toggle |
| C6 | 3–4 players | spectators as split-manual readers first | nPlayer crew; stay 2P |
| C7 | Strikes at high levels | keep 3, tighten clock | 2 from L13 |
| C8 | Daily board | friends-only, unverified first | verified global; none |
| C9 | Build order | fix + Phase 0, then Phase 1 | one big release; Phase 0 only |

Status: these are held for the captain as backlog task `games-wirecrossed-levels-build`.
Implementation was started and then paused by the operator at the PRD stage; nothing beyond this
document was committed.
