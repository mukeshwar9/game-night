# Game Night — platform-level design review (retention lens)

Scope: platform as a product, not any single game. UX-IMPROVEMENTS.md and MOBILE-UX-AUDIT.md read and NOT re-litigated (IA/discovery/mobile findings are closed and implemented). This is a fresh pass through the 5-Component Filter applied to the platform, plus code reads of Game.jsx, GameStatus.jsx, WinEffect.jsx, profile.js, leaderboard.js, daily.js, DailyGame.jsx, Onboarding.jsx, social.js contract, games.js registry.

---

## The loop answer, first

**There is a session loop. There is no day-to-day loop.**

Within one sitting the platform works well: finish a game → confetti/sound → PLAY AGAIN / NEW MATCH / TRY NEXT (suggestions) / SWITCH GAME, all wired through a consent handshake so both players stay in sync, plus abandoned-opponent recovery (claim win / invite / go home) so the round rarely dead-ends. That machinery (`GameStatus.jsx`, `Game.jsx` propose/accept/decline) is genuinely well built and is the platform's strongest asset.

But nothing pulls the player back **tomorrow**. Walk what persists after a session ends:
- A local win/loss counter, mirrored to `users/{uid}/stats` (name, streak, bestStreak, byGame, vs-opponent record).
- Room codes in `gn-rooms` (transport, not memory).
- That's it. No currency, no unlocks, no cosmetic reward, no rank that visibly changes, no notification, no async signal from a friend.

The two features explicitly built *for* return-tomorrow — Daily Challenge and the leaderboard — are both present in code but both structurally incapable of doing that job as shipped (detailed below). So the honest read: **the loop is "did you leave a tab open," not "will you come back."** A player who closes the tab has zero reason, mechanical or social, to reopen it before someone re-sends them a link.

---

## 5-Component evaluation (platform level)

**Weakest: Motivation.**

- **Clarity — moderate-strong.** Cards now carry a 3–5-word pitch, a duration chip, category tags (quick/thinky/frantic/luck/skill), and a rules modal (F-17/F-18, already implemented). A new visitor can tell what a game is and roughly how long it takes before tapping in. Weak spot: the *rules themselves* are still one tap away in a modal per game, not surfaced inline — acceptable at this catalog size, would not scale to a "pre-commitment panel" without it (the existing audit already flags this at 100 games).

- **Motivation — weakest component.** The framework's own test — does the outcome affect persistent state — technically passes (a stats object is written) but fails the *spirit* of the test: the persistent state is a spectator number, not something that changes what the player can do, wear, or show off. Ten sessions in, a player has a bigger `wins` integer and nothing else. Compare to the retro-arcade identity the boot screen itself invokes (`ArcadeLoader.jsx`'s fake high-score marquee) — that promise (score chases, bragging rights) is only partially paid off by a v1 friends leaderboard, and that leaderboard itself undercuts the payoff by mixing incomparable games into one ranking (below).

- **Response — strong.** Room creation, invite, seat reclaim, rematch/switch consent, abandoned-opponent claim-win — all immediate, all with a recovery path. This is not the layer to spend more effort on; it's the model other components should be held to.

- **Satisfaction — adequate but flat.** `WinEffect.jsx` scales confetti count/duration by round-vs-match (30 vs 64 particles, 1.8s vs 2.6s) but **not by margin** — a 3-0 shutout and a 3-2 nail-biter get an identical celebration. `GameStatus.jsx` shows the score and nothing else about *what that result means* to this rivalry. Notably: `getHeadToHead()` / `formatHeadToHeadLabel()` in `profile.js` are fully implemented and unit-tested (`profile.test.js`) — and **never called from any `.jsx` file.** The single highest-context moment on the platform (you just beat this specific person again) has the data sitting right next to it, unused.

- **Fit — strong at the surface, thinner at the seams.** Theming (CSS custom properties, pixel font, per-genre touch schemes) holds together as one product. The seam that shows: the boot-screen arcade identity sets an expectation (real high scores, arcade prestige) that the actual engagement layer (a friends-only, cross-game-mixed leaderboard) only half-delivers.

---

## Three changes ranked by expected effect on return likelihood

**1. Surface head-to-head/streak on the win screen.** (Effort: **trivial** — the data and functions already exist and are tested; this is wiring `getHeadToHead(opponentUid)` + `formatHeadToHeadLabel` into `GameStatus.jsx`'s finished/match-over branches, ~10–20 lines.) This is the single highest-leverage, lowest-cost change available: it turns "you won" into "you're now 4-2 against Sam" at the exact moment a player is most receptive, for the cost of a UI wire-up with zero new data model.
> **ASSUMPTION:** surfacing a rivalry record increases session-to-session return intent for the *rematch* pathway specifically (not cold discovery).
> **IMPACT:** if true, this is the cheapest motivation-component fix on the platform.
> **IF WRONG:** no harm — it's additive copy on an existing screen, not a behavior change.
> **VALIDATE (posture B):** ship behind no gate (it's this cheap), watch REMATCH tap-rate before/after for two weeks of natural traffic.

**2. Make the Daily Challenge cross-device and give it a payoff loop worth returning for.** (Effort: **medium** — mirror `readBest`/`bumpStreak` to `users/{uid}/daily/{date}` using the exact pattern `profile.js`'s `mirrorStats` already established; rotate the featured game daily instead of always mental math, which was already flagged as open work in F-34.) Right now the daily's best score and streak live in `localStorage` only — a signed-in user gets a different streak on their phone than their laptop, exactly the trust problem F-32 already fixed for match stats. This is the one feature purpose-built as a day-over-day hook (Wordle's mechanic) and it's currently the least reliable persistent thing on the platform.
> **ASSUMPTION:** a synced, rotating daily is what "Wordle-style" platforms actually retain on — the streak, not the specific puzzle.
> **Source posture (A):** Wordle's own product history (daily streak as the core loop) is the closest external reference; no citation beyond the well-documented public case is available here.
> **VALIDATE:** track day-2/day-7 return rate for players who complete a daily at least once, once the sync ships.

**3. Give the friends list an asynchronous reason to check it.** (Effort: **medium** — no new data model needed; `friends/{uid}/{friendUid}` and `users/{uid}/stats` already exist. Add one signal: when a friend finishes a match, or when your rank among friends changes, surface it as an in-app badge/toast the next time you open the app — not live-only like the current invite toasts.) The social layer (`social.js`, `Friends.jsx`, invites, presence, codes) is real infrastructure, but every touchpoint today is **synchronous and session-bound**: invites only fire while both parties are online *right now* (F-26's toast is a 2-minute freshness window), the leaderboard is a one-shot pull with no delta/notification. A friends list only creates a return-loop when it can tell you something happened while you were away.
> **ASSUMPTION:** async social signals (rank change, "X just played without you") outperform synchronous-only invites for pulling a lapsed player back.
> **IMPACT:** if wrong, this is wasted build effort with no engagement lift — the friend graph may simply be too small (posture: unmeasured, see below) to generate meaningful async signal density.
> **VALIDATE:** before building, check whether the *existing* friend graph has enough edges/activity to make an async feed non-empty for a typical user — this is exactly the kind of thing F-10's play-count instrumentation should have answered by now and (per grep) apparently hasn't been extended to friend-activity tracking.

---

## Daily Challenge — what it should actually be

Current: a single fixed game (mental math), 60s blitz, per-day best in `localStorage`, in-session streak indicator computed via `bumpStreak()` (which is itself timezone-correct in its *math*, but keyed to `dateKeyFor(new Date())` — the player's local device clock, not a server anchor).

**Spec:**
- **Identity, not just device.** Mirror `{best, streak, at}` to `users/{uid}/daily/{date}` on completion, same fire-and-forget pattern as `mirrorStats`. Read localStorage first for the synchronous UI, reconcile from the mirror like `statsSync.js` already does for match stats (prefer-higher, never regress). This closes the exact "vanishes on a new device" trust gap F-32 already fixed once for match stats — the daily has silently regressed to that same broken promise.
- **Per-device date key is fine to keep — label it, don't fix it.** A server-anchored "true" day requires either a Cloud Function or accepting client-clock trust; at this scale the cost isn't justified. Keep `dateKeyFor(new Date())` as a stated **posture-B tradeoff**: "the day rolls at the player's local midnight; a player who changes timezone mid-streak may get an extra or missed day." State the tradeoff in a code comment (there's a near-miss one already, on `getDailyNumber`, that explains UTC-day math is used for the *number* but not the *rollover* — worth aligning so the comment doesn't imply more rigor than the streak keying actually has).
- **Rotate the featured game.** Already scoped as open work in the existing audit (F-34's "rotate the featured game daily"); tie it to `GAME_TYPES` so it doubles as catalog exposure (today's daily = Reversi vs AI, tomorrow = Word Duel) instead of always being the one hand-built math minigame. This is the difference between a daily *puzzle* and a daily *tour of the catalog* — the latter directly serves the "42 games, will anyone see most of them" problem too.
- **Streak-at-risk nudge.** A dismissible Home banner, evening-local-time, if today's daily is unplayed and yesterday's streak is ≥2 — same dismissal-persistence pattern already used for the upgrade nudge (F-35) and iOS install hint (F-36). Reuse, don't invent.

---

## Leaderboard — what it should actually be

Current: `fetchFriendsLeaderboard` pulls `users/{uid}/stats` for me + friends, `rankEntries` sorts by **raw wins → winrate → games**, one shared list on the Friends page. The `wins` field is a lifetime sum across every game type in the catalog — Tic Tac Toe wins and Chain Reaction wins and Pong wins all add to the same integer.

This is the "mixes incomparable scores" problem stated in the task, confirmed in code: `recordMatch` writes `s.wins += 1` regardless of `gameType`, and `byGame` (which *does* segment by game) is captured in the mirrored stats object but never read by `leaderboard.js` or rendered anywhere as a per-game rank.

**Spec:**
- **Rank per game, not globally.** The data to do this already exists in `users/{uid}/stats.byGame[gameType] = {w, l}` — it is already being written and mirrored, just not read for ranking. Add a game-type selector (or a "your best games" auto-surfaced short-list) to the Friends leaderboard, and run `rankEntries`-equivalent logic per game.
- **Keep one small global view, but make it honest.** If a single cross-game number stays (useful as a low-effort default view), relabel it as "total matches won" rather than implying skill-comparable rank — or switch the default sort to **win-rate** rather than raw win count, since raw wins conflates "plays a lot" with "wins a lot," which the current tiebreak order (wins → winrate → games) already gets backwards for a leaderboard whose point is skill signal, not volume.
- **Cadence matters more than accuracy here.** A friends-scoped leaderboard only creates return pressure if a player can see their position *move* — today's `fetchFriendsLeaderboard` is a one-shot pull with no historical comparison ("you moved up two spots this week"). That delta is what would make checking the leaderboard itself a reason to open the app; the static snapshot doesn't have that property no matter how the ranking math is fixed.

---

## Catalog size (42 games): verdict

**Was a genuine strength-vs-paralysis risk; is now closer to neutral, because the discovery layer that makes 42 games navigable already shipped** (search, sectioned ALL view, favorites, tags/duration chips, NEW badges — all F-05/06/09/17/18, all marked implemented). A first-time visitor today can search, filter by QUICK/THINKY/SOLO OK, and see the whole catalog in one scroll — the conditions under which "42 games" would read as paralysis (one-category-at-a-time, no search, no favorites) are the ones the prior audit already closed.

What breadth does **not** do, regardless of how well it's organized: it doesn't manufacture a reason to return. A large, well-organized catalog is a strong *session* asset (more likely a friend group finds something everyone wants tonight) and a weak *retention* asset on its own — Poki/CrazyGames-scale platforms pair catalog breadth with instrumentation, trending, and personalization (exactly what §8 of the existing audit already recommends as future work) to convert breadth into a reason to check back. Without that layer, 42 curated, well-signposted games and 12 poorly-signposted games produce roughly the same day-2 return rate, because the blocker isn't discovery anymore — it's motivation (see above).

A smaller curated set (e.g. 8–10 "house" games) would cost: less for-everyone appeal in a mixed group, less "there's always something new" momentum (NEW badges have less to badge). It would gain: a plausible seedbed for real per-game leaderboards/achievements sooner (the "breaks by 100" concern the existing audit already raises about curation becoming a real job applies here too — fewer games means each one can carry more retention weight sooner). Given the discovery layer is already solid, **cutting the catalog is not the lever to pull; building the motivation layer on top of the catalog that exists is.**

---

## End-of-match: what it should do that it doesn't

Read `Game.jsx`'s finish path, `GameStatus.jsx`, `WinEffect.jsx` in full. What fires today: sound (win/lose/draw/matchWin), a confetti burst scaled only by round-vs-match, `recordMatch()` (silent, no on-screen acknowledgment beyond the raw score), then PLAY AGAIN / NEW MATCH / TRY NEXT / SHARE / SWITCH GAME.

What it should do and doesn't:
1. **Show the rivalry, not just the round.** Covered above — `getHeadToHead` is dead code sitting next to the exact screen that should render it.
2. **Acknowledge margin.** A rout and a nail-biter are mechanically distinguishable (`scores/X` vs `scores/O` delta at match end) and currently produce identical effects. Even a one-line copy change ("CLOSE ONE — 3-2" vs "DOMINATED — 3-0") would cost nothing structurally and differentiate the two most common emotional states a winner leaves with.
3. **Acknowledge streaks/milestones in the moment, not just on Profile.** `bestStreak` is tracked and shown on `/profile`, but a player who just hit a new personal best learns that only if they navigate away to check — the win screen, again, is the highest-attention moment and says nothing about it.
4. **A "come back" hook, not just a "share this instant" hook.** `SHARE` builds a static result card for right now; nothing on the end screen plants an async future trigger (e.g., "rematch tomorrow" pre-scheduled, or "beat my score" challenge link with any kind of freshness signal). This is the same gap as the friends-list finding above, expressed at the single best moment to create it.

None of these require new data plumbing beyond #2 (margin, trivial derive) — #1, #3 use fields that already exist and are already computed elsewhere in the codebase.

---

## Assumptions (skill format)

```
ASSUMPTION: A rivalry/streak line on the win screen measurably increases rematch-tap rate.
IMPACT: Determines whether recommendation #1 is worth the (trivial) build cost.
IF WRONG: Wasted UI real estate on an already-busy end screen; no engagement cost since it's additive.
VALIDATE: A/B or before/after REMATCH tap-rate over natural traffic post-ship — cheap enough to just ship and watch.
```

```
ASSUMPTION: The friend graph has enough edge density/activity for an async "while you were away" feed to be non-empty for a typical user.
IMPACT: Determines whether recommendation #3 (async social signals) is worth building at all, versus premature.
IF WRONG: Feature ships to an empty state for most users, and the return-lift never materializes.
VALIDATE: Before building, query current `friends/{uid}` fan-out and `users/{uid}/stats.games` activity distribution — this is exactly the instrumentation gap F-10 should have already closed for game-level popularity and apparently hasn't been extended to social-graph activity.
```

```
ASSUMPTION: Confetti/effect intensity scaled by score margin (not just round-vs-match) improves perceived satisfaction without cheapening close-game moments.
IMPACT: Low-risk polish; affects whether recommendation area "Satisfaction" is worth revisiting before Motivation.
IF WRONG: Players may not notice or care about margin-based effects — Satisfaction was already the framework's third priority (Response > Clarity > Satisfaction > Fit > Motivation would normally rank it above Motivation, but the finding here is Motivation is broken at the state-persistence level, which is a structural gap, not a tuning one — hence ranking Motivation-fixes above Satisfaction-fixes in the top-3).
VALIDATE: Cheapest to just ship as a small copy/animation delta and watch for complaints, not worth a dedicated test.
```

```
ASSUMPTION: The 42-game catalog's discoverability fixes (search/ALL view/favorites/tags) are functioning as documented in UX-IMPROVEMENTS.md's "Status: Implemented" lines.
IMPACT: The catalog-size verdict above depends on these being real, working features, not just claimed-done in the audit doc.
IF WRONG: If any of F-05/06/09/17/18 regressed or were never actually wired end-to-end, the catalog-paralysis risk this review dismisses would still be live.
VALIDATE: Not verified interactively in this pass (read-only, no dev server per constraints) — see "could not assess" below.
```

---

## What could not be assessed by reading

- **Whether any of this is actually true in practice.** No dev server, no browser, no build — every claim above is a code-reading inference, not an observed behavior. In particular: whether search/favorites/ALL-view genuinely work end-to-end as `UX-IMPROVEMENTS.md` claims (its own "Status: Implemented" lines are self-reported by whoever closed each finding, not independently re-verified here).
- **Actual usage data.** No play-count/social-activity instrumentation exists to check the friend-graph-density assumption above, or to know whether the daily challenge, once linked (F-08), gets any real traffic — the entire "does anyone come back" question this review was asked to answer has no measured baseline anywhere in the repo. Every number in this document is posture B (a starting value + a stated test) or an explicit unmeasured assumption; none are posture C (measured on this game) because nothing is instrumented to measure them yet.
- **Whether the confetti/effect intensity actually reads as flat to a real player**, versus reading fine because round-vs-match differentiation already covers the emotionally distinct cases. This is a playtest question, not a code-read question.
- **Push/email/any out-of-app retention channel.** Grepped for it; found none (only PWA install prompting, no `Notification`/push-subscription/email code paths). If one exists outside `src/` (e.g. a separate marketing tool), it's outside this review's read scope.
- **Whether cutting the catalog would actually change conversion**, since that requires cohort data this platform doesn't collect.

---

## One-line navigation note (not a re-audit — new since the two closed audits)

`GameSwitcher` mid-round (`Game.jsx`'s in-room icon variant) still opens the original compact single-category picker rather than the newer full ALL-view/search layout (per `UX-IMPROVEMENTS.md` F-06's own status line) — worth a look only if switch-mid-session friction turns out to matter once instrumentation exists.
