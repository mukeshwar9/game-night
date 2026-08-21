# UX Improvements — Game Night

A comprehensive UX audit of the platform, performed July 2026 when the catalog stood at **31 registry entries / 29 selectable games** (2 variants hidden behind "+MODES") across 5 categories: board (9), reflex (9), memory (4), word (4), party (3). The platform launched with 3–4 games; the shell around the games has not evolved with the catalog. This document records every finding with enough context to implement each fix independently.

**Scope:** UX only — information architecture, discoverability, navigation, flows, consistency, engagement, mobile. Not code quality, performance, or visual design.

**Format per finding:** Severity (Critical/High/Medium/Low) · Priority (Quick Win / Medium Effort / Long-Term), where it occurs (with file pointers), why it hurts, the recommended fix, and expected impact.

**Implementation status (July 2026):** all 8 Critical/High findings — F-01, F-05, F-06, F-07, F-08, F-11, F-20, F-26 — are ✅ implemented; a second round landed the full quick-wins sweep — F-04, F-12, F-15, F-21, F-24, F-25, F-28, F-30, F-31, F-35, F-36, F-37; a third round landed F-10, F-22, and F-23; a fourth round landed F-09, F-27, F-32, and F-34; a fifth round closed the remainder — F-02, F-03, F-13, F-14, F-17, F-18, F-29, F-33 (see per-finding Status lines and the updated index below). F-38 was resolved as a side effect of F-01. **Every actionable finding in this audit is now implemented**; F-16 is accepted as-is and F-19 remains a watch item. File pointers and line numbers in the finding bodies describe the *pre-fix* code.

---

## Executive summary

The in-room experience is genuinely strong — the invite trio (link / QR / friend-invite), seat reclaim via auth uid, the consent-based rematch/switch handshake, presence dots, emotes, and per-genre touch controls are all better than most platforms this size. The weakness is everything *around* the games: the home page is an identity form with the catalog buried beneath it, discovery tops out at five category tabs showing one category at a time, there is no "recently played," a fully built daily-challenge page is linked from nowhere, and the entire product renders in a 384px strip on every screen size. **The catalog outgrew the shell.** The fixes below don't require new games — they promote the catalog to the front door and add standard discovery scaffolding (search, recents, favorites, new-game surfacing) before the next 20 games arrive.

---

## Findings index

| # | Finding | Severity | Priority | Status |
|---|---------|----------|----------|--------|
| F-01 | Home page is a form, not a catalog | Critical | Medium Effort | ✅ Done |
| F-02 | Two parallel catalogs (Home vs /demo) | High | Medium Effort | ✅ Done |
| F-03 | Category taxonomy unbalanced/misfiled | Medium | Quick Win | ✅ Done |
| F-04 | Newest games invisible (no NEW badges, historical order) | Medium | Quick Win | ✅ Done |
| F-05 | No search | High | Quick Win | ✅ Done |
| F-06 | One category visible at a time, no ALL view | High | Quick Win | ✅ Done |
| F-07 | No recently-played; YOUR ROOMS speaks in room codes | High | Medium Effort | ✅ Done |
| F-08 | Daily challenge orphaned (no link to /daily) | Critical | Quick Win | ✅ Done |
| F-09 | No favorites/pinning | Medium | Medium Effort | ✅ Done |
| F-10 | No popularity data or instrumentation | Medium | Long-Term | ✅ Done |
| F-11 | Desktop gets a 384px phone strip | High | Medium Effort | ✅ Done |
| F-12 | Game count copy stale in 3 places (13 / 20+ / 29) | Low | Quick Win | ✅ Done |
| F-13 | Double first-run teaching | Low | Quick Win | ✅ Done |
| F-14 | No persistent navigation | Medium-High | Medium Effort | ✅ Done |
| F-15 | No 404 route | Low | Quick Win | ✅ Done |
| F-16 | Leaving mid-game is silent | Low | — | Accepted as-is |
| F-17 | Cards don't help users choose | Medium | Quick Win | ✅ Done |
| F-18 | No decision-support facets/filters | Medium | Medium Effort | ✅ Done |
| F-19 | Variant burial (watch at scale) | Low | — | Watch |
| F-20 | Word Duel SWITCH GAME button is dead | Critical (bug) | Quick Win | ✅ Done |
| F-21 | 5 games ship without rules | Medium | Quick Win | ✅ Done |
| F-22 | End of game suggests nothing | Medium | Medium Effort | ✅ Done |
| F-23 | Abandoned opponents strand the player | Medium-High | Medium Effort | ✅ Done |
| F-24 | Full room → silent spectatorship | Medium | Quick Win | ✅ Done |
| F-25 | Error pages are dead ends | Medium | Quick Win | ✅ Done |
| F-26 | Social features only work on the Home page | High | Medium Effort | ✅ Done |
| F-27 | Round-advance CTAs diverge | Medium | Quick Win | ✅ Done |
| F-28 | Disconnect copy: three phrasings | Low | Quick Win | ✅ Done |
| F-29 | Spectator experience is three different products | Low-Medium | Medium Effort | ✅ Done |
| F-30 | Word Duel end screen lacks SHARE | Low-Medium | Quick Win | ✅ Done |
| F-31 | Empty states are inconsistent silence | Low | Quick Win | ✅ Done |
| F-32 | Account pitch overpromises (stats don't sync) | Medium (trust) | Medium Effort | ✅ Done |
| F-33 | The arcade has no real high scores | High | Long-Term | ✅ Done |
| F-34 | Daily loop half-built | Medium | Medium Effort | ✅ Done |
| F-35 | Upgrade nudges: two touchpoints, zero context | Medium | Quick Win | ✅ Done |
| F-36 | iOS users get no install path | Medium | Quick Win | ✅ Done |
| F-37 | Two undersized tap targets | Low | Quick Win | ✅ Done |
| F-38 | Keyboard-over-content on Home | Low | — | ✅ Done (via F-01) |
| F-39 | Arcade splash doesn't pitch the product | High | Quick Win | Open |
| F-40 | Demo hub tiles mislabeled ("2P" on vs-CPU demos, mid-word breaks) | High | Quick Win | Open |
| F-41 | Demo hub vs Home tell different stories (counts, framing) | Medium | Quick Win | Open |
| F-42 | Hidden-info rooms give joiners no anticipation copy | Medium-High | Medium Effort | Open |
| F-43 | Rules unreachable inside a room before start | Medium | Quick Win | Open |
| F-44 | Multi-act moments under-weighted (extra turn / hit again) | Medium | Medium Effort | Open |
| F-45 | No curated START HERE path at 44 tiles | Low-Medium | Medium Effort | Open |
| F-46 | Share cards not standardized across all end screens | Low | Quick Win | Open |

---

## 1. Information Architecture

### F-01 · Critical · Medium Effort — The home page is a form, not a game catalog

**Where:** `src/pages/Home.jsx`. DOM order of the main column: logo → pending invites → first-run how-it-works strip → **name input (autofocused) → join-code input → YOUR ROOMS list** → "OR START NEW" divider → game picker → solo CTA → stats tiles → PWA install.

**Why it hurts:** The catalog — the entire product — sits below two text inputs and a room list, below the fold on most phones. A visitor's first impression is "fill in a form," not "pick from 29 games." The name input is also redundant: onboarding (`src/components/Onboarding.jsx`, identity step) already captured name + avatar, and the top-left profile chip already displays it, yet Home re-presents the name as a required-looking field forever. The `autoFocus` on the name input means the mobile OS keyboard pops over the content on every arrival.

**Fix:** Invert the hierarchy:
1. Catalog (GamePicker) moves to hero position, directly under the logo.
2. Delete the name input from the main column — identity is ambient via the profile chip (name editing lives in `/profile`, which already supports it).
3. Join-by-code becomes a compact secondary affordance near the top (e.g. a "HAVE A CODE?" one-liner that expands, or a small input inline with the header area).
4. YOUR ROOMS (reworked per F-07) sits above or beside the catalog as a "continue" rail, not a blocker in front of it.

**Impact:** Every visitor, every visit. First-impression shift from utility page → gaming destination; more games seen per session; no keyboard-over-catalog on mobile.

**Status: ✅ Implemented (July 2026).** Name input deleted (`getPlayerName()` reads the profile; missing name re-triggers onboarding); join-by-code is now a compact input in a utility row next to the DAILY tile; catalog (`GamePicker layout="full"`) is the hero section; YOUR ROOMS replaced by the CONTINUE PLAYING rail (F-07).

### F-02 · High · Medium Effort — Two parallel catalogs split the IA (multiplayer vs /demo)

**Where:** `Home.jsx` GamePicker (tap = create a multiplayer room) vs `src/pages/Demo.jsx` (a second, fully parallel 29-entry catalog for solo/vs-AI play with its own 4-column grid and its own copy of the category tabs).

**Why it hurts:** The same 29 games are browsable in two disconnected places with different layouts. Users must decide *how* they want to play (with a friend vs solo) before choosing *what* to play — backwards for a casual platform. Solo play is the zero-friction first taste of any game, but nothing on a catalog card indicates a practice/AI mode exists. The demo hub's party-game cards aren't even playable (they show "NEEDS 2+ PLAYERS" + a CREATE A ROOM link back to Home) — a dead-end loop between the two catalogs.

**Fix:** One catalog; mode is a property of the game. Tapping a card offers "PLAY A FRIEND / VS AI" for games with bot support — the exact interaction pattern `VariantChooser.jsx` already established for game variants, so no new vocabulary. Games without bots go straight to room creation as today. Keep `/demo` as a redirect for old links.

**Impact:** Halves the navigational model users must learn; makes solo play discoverable from the main grid; removes an entire duplicate browsing surface that would otherwise have to scale in parallel.

**Status: ✅ Implemented (July 2026).** One catalog: solo-capable cards on Home open a ModeChooser — PLAY A FRIEND (room creation, variant pick after) / VS AI (deep-links `/solo/:type`; variant pick only when a variant has a real demo, via the registry `solo` flag). /demo remains the browsable solo hub; the compact in-room switcher is untouched.

### F-03 · Medium · Quick Win — Category taxonomy is unbalanced and partly misfiled

**Where:** `GAME_CATEGORIES` in `src/lib/games.js` — board 9, reflex 9, memory 4, word 4, party 3.

**Why it hurts:** Two categories hold 62% of the catalog and will absorb most future games. "BOARD" already mixes strategy (Reversi, Gomoku) with pure luck (PIG, a dice game) with cascade toys (Chain Reaction). "WORD & BLUFF" mixes a Wordle race with liar's dice. Categories work as *filters* but fail as *browsing shelves* because they don't reflect how players actually choose: fast vs thinky, luck vs skill, 2P vs group.

**Fix:** Short-term: re-home the obvious misfits (PIG and Bluff Battle could form a "DICE & BLUFF" shelf, or move PIG out of "board"). Long-term (see Scaling section): move to tags (duration, skill/luck, pace, player count) with categories kept as curated shelves rather than exclusive bins.

**Impact:** Moderate today; prevents the "BOARD ·23" mega-tab problem at 50 games.

**Status: ✅ Implemented (July 2026)** (short-term fix): PIG and Bluff Battle moved to a new DICE & BLUFF category; WORD & BLUFF became WORD GAMES. The long-term tags-as-truth model now has its foundation via F-18's registry tags.

### F-04 · Medium · Quick Win — Catalog order is historical, so the newest games are hardest to find

**Where:** `GAME_TYPES` array order = declaration order = chronological addition order; `GamePicker.jsx` renders it verbatim. The only "NEW" tag in the entire app is inside `VariantChooser.jsx` (on Ultimate TTT / C4 Pop Out modes).

**Why it hurts:** Word Duel and Chain Reaction — the newest, most differentiated titles — render at the tail of their category with zero visual distinction. Regular users have no way to notice the catalog grew. Catalog growth is itself a retention message ("this platform is alive") and it's currently mute.

**Fix:** Add `addedAt` to registry entries; render a NEW badge on cards for ~14 days after `addedAt`; add a "NEW" rail/section at the top of the catalog once the rails layout exists (F-06/F-07).

**Impact:** Direct play-through on new content; visible momentum.

**Status: ✅ Implemented (July 2026).** `addedAt` (real git dates) on the 7 entries added 2026-07-04; `isNewGame()` helper in games.js; GameCard renders a NEW badge for 14 days. Older games carry no `addedAt` and never show NEW. The NEW rail (rails layout) remains future work.

---

## 2. Discoverability

### F-05 · High (Critical at 50+) · Quick Win — No search

**Where:** Nowhere — no search input exists in `Home.jsx`, `GamePicker.jsx`, or `Demo.jsx` (grep-confirmed).

**Why it hurts:** A user who wants Reversi must know it's filed under "BOARD," tap that tab, and scan 9 cards. At 29 games that's tolerable; at 50 it's broken. Search is also the fastest fix for tab isolation (F-06) because it cuts across categories. The "looking for a specific game" user flow currently has **no supported path at all**.

**Fix:** Type-to-filter input above the category tabs, matching label + desc + category (typing "wor" surfaces Word Duel, Hangwoman, …). Client-side over 31 registry entries — trivial. Index variant entries too (searching "ultimate" must find Ultimate TTT even though it's hidden behind "+MODES"). Add a `/` keyboard shortcut on desktop.

**Impact:** Directly serves specific-game seekers; the single cheapest discovery feature available.

**Status: ✅ Implemented (July 2026).** `src/lib/gameSearch.js` (unit-tested) + a search input in `GamePicker layout="full"`: matches label/desc/category, indexes variant entries (searching "ultimate" surfaces Ultimate TTT and selects it directly, bypassing VariantChooser), `/` shortcut on desktop, no autofocus.

### F-06 · High · Quick Win — One category visible at a time; no ALL view

**Where:** `GamePicker.jsx` — the grid renders only `activeCat`'s games; default tab is BOARD (first category).

**Why it hurts:** A new visitor sees 9 board-game cards and may never tap REFLEX or PARTY — **20 of 29 games are invisible behind untapped pills.** Tabs-with-counts is a filter pattern being used as the *only* browse pattern. There is no way to scan the whole catalog in one gesture.

**Fix:** Default to an "ALL" view rendered as **sectioned vertical scroll** — category headers with their games beneath, tabs become jump-links/filters. This is the Poki/CrazyGames/App Store pattern and it scales indefinitely (add sections, not tabs).

**Impact:** Every game becomes reachable by scrolling — the single biggest catalog-exposure win available.

**Status: ✅ Implemented (July 2026).** `GamePicker layout="full"` defaults to a synthetic ALL tab rendering sectioned vertical scroll (one header + grid per category); tabs now act as filters. The in-game SWITCH GAME modal keeps the original compact single-category layout.

### F-07 · High · Medium Effort — "Recently played" doesn't exist; YOUR ROOMS speaks in room codes

**Where:** `Home.jsx` YOUR ROOMS section — rows read `"K3XQ2P — PONG →"`. Backed by `getRooms()` in `src/lib/profile.js` (localStorage `gn-rooms`, capped at 6, newest-first, no status/outcome data).

**Why it hurts:** Room codes are transport plumbing, not user memory. Users remember "I was playing Pong with Sam and it was my turn," not a 6-char code. Rows carry no status (waiting? finished? your turn?) so "continue playing" is a guess — a finished room and a live room look identical. And there is no game-centric recents ("games you play often") to shortcut repeat play, the dominant behavior of returning users.

**Fix:** Split into two modules:
- **CONTINUE PLAYING** — active rooms: game icon + opponent name/avatar + status chip ("YOUR TURN" / "WAITING FOR OPPONENT" / "FINISHED"). All of this data already exists in the `games/{id}` doc; fetch the few recent room docs on Home load.
- **RECENTLY PLAYED** — game-type chips (icon + label), one tap → new room (or vs AI). Derive from `gn-rooms` gameTypes or the `byGame` stats already tracked in `gn-stats`.
- Demote raw codes to secondary text within the row.

**Impact:** Returning-visitor session start drops from "decode a code" to one glance. Recency rails are the highest-engagement module on every benchmark platform (Netflix "Continue watching", Poki "Recently played").

**Status: ✅ Implemented (July 2026).** `src/components/ContinuePlaying.jsx` (one-shot Firebase fetch via `src/lib/continueRooms.js`, unit-tested chip derivation: YOUR TURN / WAITING FOR OPPONENT / FINISHED; expired rooms pruned from gn-rooms) + `src/components/RecentlyPlayed.jsx` (game-type chips from gn-rooms ∪ gn-stats byGame). Room codes demoted to secondary mono text.

### F-08 · Critical (for the feature) · Quick Win — The daily challenge is orphaned

**Where:** `/daily` route exists in `src/App.jsx` (`src/pages/DailyGame.jsx` — a 60-second seeded mental-math blitz with per-day best score in localStorage `gn-daily-{date}` and an in-session combo-streak indicator). **No link anywhere in the app points to it** — grep for `/daily` finds only the route definition.

**Why it hurts:** A finished retention feature with zero traffic. Daily challenges are the single best reason to return tomorrow (Wordle, Chess.com's daily puzzle) — and this one is invisible unless you type the URL.

**Fix:** Prominent DAILY tile at the top of Home showing today's state ("NOT PLAYED YET" / "BEST: 14"). See F-34 for the follow-on loop (streaks, sharing).

**Impact:** Creates the platform's first daily-return loop for the cost of one link. Cheapest retention win in this document.

**Status: ✅ Implemented (July 2026).** `src/components/DailyTile.jsx` in Home's top utility row shows "NOT PLAYED YET" or "BEST: {n}" and links `/daily`; the date/score helpers were extracted to `src/lib/daily.js` so both surfaces share one source of truth. F-34 follow-ons (streak, share, rotation) remain open.

### F-09 · Medium · Medium Effort — No favorites/pinning

**Where:** No star/favorite/pin mechanism anywhere (grep-confirmed).

**Why it hurts:** Groups converge on 2–3 games they replay; every visit restarts from the full grid. The cost compounds with catalog size.

**Fix:** Heart/pin toggle on cards (localStorage or `users/{uid}` for cross-device); FAVORITES rail rendered first when non-empty.

**Impact:** Repeat-play friction approaches zero for the games that matter to each user.

**Status: ✅ Implemented (July 2026).** Heart toggle on catalog cards (localStorage `gn-favs`, 40px hit area, click never creates a room); the ALL view renders a ★ FAVORITES section ahead of the category sections. v1 is device-local; cross-device sync can adopt the users/{uid} pattern F-32 established.

### F-10 · Medium · Long-Term — No popularity/trending signal, and no instrumentation to ever build one

**Where:** Nothing records play counts per game type (only per-user localStorage stats exist).

**Why it hurts:** Recommendations, trending shelves, "similar games," and data-informed catalog curation all need play-frequency data — and it takes months to accumulate. Every month without instrumentation delays those features by a month.

**Fix:** Start logging anonymized play events per gameType now (an increment-on-game-start counters node in RTDB is sufficient). Ship a "POPULAR" shelf later once the data is meaningful.

**Impact:** Zero UX cost today; unlocks every future personalization feature.

**Status: ✅ Implemented (July 2026).** `recordPlay(gameType, 'multi'|'solo')` in `src/lib/analytics.js` — atomic `increment(1)` to `plays/{gameType}/{mode}`, fire-and-forget. Wired into Home room creation, Demo solo selection (initial default excluded to avoid visit-inflation), Game.jsx switches and error-CTA rooms. Rules node added; requires `firebase deploy --only database`. POPULAR shelf remains future work.

---

## 3. Homepage Experience

(F-01, F-06, F-08 above are the core homepage findings.)

### F-11 · High · Medium Effort — Desktop gets a 384px phone strip

**Where:** `Home.jsx` wraps everything in `max-w-sm` (384px); `GamePicker.jsx` grid is hardcoded `grid-cols-2`; **zero Tailwind breakpoint classes exist in any page-level layout** (Home, Game, Profile, Friends — grep-confirmed). Only game-board components (`Board.jsx`, `Cell.jsx`, `ConnectFourBoard.jsx`, etc.) have responsive classes.

**Why it hurts:** On a 1440px display, ~73% of the screen is empty background and users see 4–6 game cards per viewport. Mobile-first is the right instinct; mobile-*only* is a scale blocker — desktop is where friend groups organize game nights (link sharing, Discord calls).

**Fix:** Responsive shell: container `max-w-sm md:max-w-3xl lg:max-w-5xl`; picker grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`. The board components already scale — only the shell is frozen.

**Impact:** Desktop catalog exposure roughly triples; the platform stops feeling like a phone app in a window.

**Status: ✅ Implemented (July 2026)** for the Home shell: container `max-w-sm md:max-w-3xl lg:max-w-5xl`, picker grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`; narrow-by-nature sections (logo, invites, utility row, stats) capped at `max-w-md mx-auto`. Other pages (Profile, Friends, Demo, Game) still use fixed narrow shells.

### F-12 · Low · Quick Win — The platform lies about its own size, three different ways

**Where:** OG/Twitter meta in `index.html`: **"13 quick multiplayer games"**; Home tagline (`Home.jsx`): **"20+ GAMES"**; reality: **29**.

**Why it hurts:** Shared links — the platform's primary growth channel — undersell the product by more than 2×. Small, but it's marketing copy actively working against you.

**Fix:** Derive the in-app count from `GAME_TYPES` (excluding variants) so it never rots again; update the static meta copy.

**Status: ✅ Implemented (July 2026).** Home tagline and how-it-works copy derive the count from `GAME_TYPES` (currently 29); index.html OG/Twitter meta updated to "29+".

### F-13 · Low · Quick Win — Double first-run teaching

**Where:** A brand-new visitor gets the full-screen `Onboarding` flow AND Home's dismissible "HOW IT WORKS" strip — separate localStorage gates (`onboarded` via `checkShouldOnboard()` vs `isNewVisitor` = no name + no rooms), both fire for the same user. The strip's dismissal is only in-memory state, so it reappears on reload until a name/room exists.

**Fix:** Fold the 3 steps (PICK A GAME / SHARE THE LINK / PLAY TOGETHER) into onboarding's welcome step, or suppress the strip once `onboarded` is set. Persist dismissal.

**Status: ✅ Implemented (July 2026).** The HOW IT WORKS strip is suppressed once onboarding completes (shared `hasOnboarded()` flag) and manual dismissal persists (`gn-howitworks-dismissed`).

---

## 4. Navigation

### F-14 · Medium-High · Medium Effort — No persistent navigation; each page hand-rolls its own

**Where:** No nav component exists (grep for `<nav`, bottom bars, hamburgers: nothing). Home has fixed corner chips (profile pill + friends icon top-left; theme + mute top-right). Profile/Friends/Demo/Game each render a bespoke "← HOME" link. **Profile and Friends are unreachable from inside a game** — `Game.jsx` only links home. Game → Demo has no path.

**Why it hurts:** At 4 pages this was fine. At 6 routes plus a daily page it's a hub-and-spoke maze where Home is the only junction. Combined with F-26 (social subscriptions only on Home), being anywhere but Home means being cut off from the social layer.

**Fix:** A minimal persistent top bar (logo → home · profile chip · friends icon w/ badge · theme · mute) on all non-game pages, folded into the existing in-game header on game pages. **Not a hamburger** — there aren't enough destinations to justify hiding them.

**Impact:** Every cross-surface journey shortens; social features stop being Home-exclusive.

**Status: ✅ Implemented (July 2026).** `NavBar` (logo-home, profile chip, friends icon + request badge, theme, mute) on Profile, Friends, Demo, Daily, and 404, replacing bespoke ← HOME links. Home's corner chips and Game.jsx's in-game header remain their own nav, per the audit's design.

### F-15 · Low · Quick Win — No 404 route

**Where:** `src/App.jsx` has no catch-all route; unknown paths render an empty shell.

**Fix:** Catch-all route styled like the existing "GAME NOT FOUND" screen, linking home.

**Status: ✅ Implemented (July 2026).** `src/pages/NotFound.jsx` + a `path="*"` catch-all route, styled like the existing error screens.

### F-16 · Low — Leaving mid-game is silent

**Where:** "← HOME" in the game header navigates instantly, no confirm; the opponent sees only a presence dot go dark plus "OPPONENT DISCONNECTED."

**Assessment:** Acceptable as-is — seat reclaim makes leaving safe, and a confirm dialog would add friction. But pair it with F-23 so the *remaining* player isn't stranded.

---

## 5. Browsing Experience

### F-17 · Medium · Quick Win — Cards don't help users choose

**Where:** `GamePicker.jsx` cards show icon + label + `desc` + player tag. `desc` quality is wildly inconsistent across `games.js`: `"3 × 3"` (board dimensions) vs `"Wordle-style race"` (an actual pitch) vs `"duel"` (nothing).

**Why it hurts:** A user who doesn't already know Gomoku learns nothing from "15 × 15". The information that actually drives choice — how long a round takes, luck vs skill, frantic vs thinky — appears nowhere. The "?" rules button helps but costs a modal per game (29 modals to browse the catalog).

**Fix:** Standardize `desc` as a 3–5 word pitch ("five in a row wins", "don't crash first", "outroll the liar"); move board dimensions into the rules modal. Add a duration chip (~2 MIN / ~10 MIN) once registry metadata exists (F-18).

**Impact:** Faster, more confident picks; fewer created-then-abandoned rooms from mispicks.

**Status: ✅ Implemented (July 2026).** All 31 descs rewritten as 3–5 word pitches; board dimensions moved into the rules modal; cards show a ~N MIN duration chip from the new `durationMin` field.

### F-18 · Medium · Medium Effort — No decision-support facets

**Where:** The only facet is the 5 category tabs. No filter for "playable solo," "3+ players," "quick (<5 min)," "phone-friendly."

**Fix:** Add registry metadata per game — `tags`, `durationMin`, `pitch`, `addedAt` — then render 2–3 filter chips beside search (F-05). The registry pattern in `games.js` makes this a pure-data addition.

**Impact:** Rises with catalog size; the metadata itself is the prerequisite for most Long-Term items.

**Status: ✅ Implemented (July 2026).** Registry gained `tags` (quick/thinky/frantic/luck/skill), `durationMin`, and `solo`; the full-layout picker renders QUICK / THINKY / SOLO OK filter chips (AND-combined, applied across sections, category view, and search).

### F-19 · Low — Variant burial is fine today; watch at scale

**Where:** Ultimate TTT and C4 Pop Out are hidden behind "+MODES" on their base cards (`variantOf` in the registry, surfaced via `VariantChooser`).

**Assessment:** Clean pattern at 2 variants. If variants multiply they become invisible inventory — one more reason search (F-05) must index them, and end-of-game suggestions (F-22) should cross-sell them.

---

## 6. Individual Game Pages

### F-20 · Critical (dead CTA) · Quick Win — Word Duel's SWITCH GAME button does nothing

**Where:** `src/pages/WordDuelGame.jsx` renders `<GameSwitcher currentType="wordduel" onSelect={onSwitchGame} />` — but `GameSwitcher`'s prop is **`onSwitch`**, not `onSelect` (every other custom page passes `onSwitch={onSwitchGame}`).

**Why it hurts:** A primary end-of-game CTA silently no-ops. The user taps, nothing happens, trust erodes — in one of the newest games.

**Fix:** Rename the prop. One line.

**Status: ✅ Implemented (July 2026) — scope was wider than audited.** The same wrong-prop defect (`onSelect=` or `onSwitchGame=` instead of `onSwitch=`) existed in **7 files / 12 call sites**: WordDuelGame, ChimpGame, ReactionGame, TypingGame, AimTrainerGame, NumberMemoryGame, MathGame. All fixed (with `currentType` added where missing); grep-verified that every `<GameSwitcher>` site now passes `onSwitch`.

### F-21 · Medium · Quick Win — 5 games ship without rules

**Where:** `GAME_RULES` in `src/lib/rules.js` covers 26 of 31 types. Missing (fallback "Rules coming soon."): **chainreaction, spaceduel, sumo, tron, wordduel**.

**Why it hurts:** Chain Reaction is genuinely unintuitive without an explanation (orb capacity, cascades, elimination). New players' first-round comprehension suffers exactly in the newest games.

**Fix:** Write the 5 entries (OBJECTIVE / HOW TO PLAY / TO WIN, matching the existing format).

**Status: ✅ Implemented (July 2026).** All 5 entries written against the actual logic files (capacities, cascade/elimination rules, win/draw conditions, real-time controls).

### F-22 · Medium · Medium Effort — End of game suggests nothing

**Where:** `src/components/GameStatus.jsx` end screen: PLAY AGAIN / NEW MATCH / SHARE / SWITCH GAME (which opens the full 29-game picker modal).

**Why it hurts:** The moment of highest receptiveness — "that was fun, what next?" — offers either repetition or a full catalog to re-browse. No "you liked Connect Four → try C4 Pop Out or Gomoku." Variants especially should be cross-sold here (a player finishing classic TTT is the perfect Ultimate TTT prospect).

**Fix:** 2–3 suggestion chips on the end screen ahead of the SWITCH GAME button: variants of the current game first (`variantOf` lookup), then same-category picks. Registry data already supports this; later, popularity data (F-10) improves the picks.

**Impact:** Session length — converts single-game visits into multi-game sessions. This is the loop Poki/CrazyGames engineer hardest.

**Status: ✅ Implemented (July 2026).** `suggestGames()` (`src/lib/gameSuggestions.js`, unit-tested): variant relatives first, then same-category, registry-order deterministic; party games excluded. GameStatus renders a TRY NEXT chip row above SWITCH GAME on both end states, going through the same consent-handshake switch path.

### F-23 · Medium-High · Medium Effort — Abandoned opponents strand the player forever

**Where:** Turn-based games: opponent leaves → board stays interactive with pulsing "OPPONENT DISCONNECTED" — no timeout, no claim-win, no re-invite. (Hangwoman uniquely got escape hatches: CONCEDE ROUND for a setter who lost the word, END ROUND for a guesser whose setter went offline. Nothing else did.)

**Why it hurts:** The most common real-world failure of link-based multiplayer — a friend gets distracted and never returns — has no resolution path except leaving. It's the worst dead-end in the product.

**Fix:** After N minutes of opponent-offline mid-game, offer the remaining player: **claim win** (increments score, records match) / **save room & return home** / **invite someone else** (requires the invite modal outside the waiting room — see F-26).

**Impact:** Converts the product's worst dead-end into a recoverable moment.

**Status: ✅ Implemented (July 2026)** for standard 2P turn-based games: after 120s of continuous opponent-offline time mid-round, a banner offers CLAIM WIN (server-side transaction re-checks status + presence so a returning opponent can't be clobbered; writes the normal finish shape so win effects/recordMatch fire) / INVITE A FRIEND (F-26 modal) / SAVE & GO HOME. Custom/realtime and party games out of scope for v1.

### F-24 · Medium · Quick Win — Full room → silent spectatorship

**Where:** A third visitor to a 2-seat room silently becomes a spectator (`mySymbol=null`) with only a "SPECTATING" caption. No explanation that the room was full, no exit path.

**Fix:** One-time toast ("Room's full — you're spectating") + a "START YOUR OWN {game} ROOM" CTA.

**Impact:** Rescues misdirected joiners (e.g. a link shared to a group chat where two people already claimed the seats).

**Status: ✅ Implemented (July 2026).** One-time "ROOM'S FULL — YOU'RE SPECTATING" toast (fires only when both seats are occupied) + a START YOUR OWN {game} ROOM button beside the SPECTATING caption.

### F-25 · Medium · Quick Win — Error pages are dead ends

**Where:** `Game.jsx` full-page errors — "GAME NOT FOUND", "THIS GAME HAS EXPIRED" (24h TTL), family-mismatch, connection error — all offer only "← BACK TO HOME".

**Why it hurts:** The user's intent is known (they clicked an invite to play game X). Expired invite links are a *routine* entry path given the 24h TTL, and each one currently ends the journey.

**Fix:** On NOT FOUND / EXPIRED, add "START A NEW {game label} ROOM" (game type is in the dead room doc for expired rooms; omit when unknown).

**Impact:** Recovers broken/expired invite-link arrivals — likely a meaningful share of all arrivals.

**Status: ✅ Implemented (July 2026).** EXPIRED screens show START A NEW {game label} ROOM (type captured from the dead room doc before erroring); NOT FOUND/connection errors omit the CTA since the type is unknowable. `createNewRoom` in Game.jsx mirrors Home's createGame including the party/2P shape branch.

---

## 7. User Flows

**First-time visitor:** boot loader (pure atmosphere, unskippable) → onboarding (good: guest-first primary CTA, avatar+name, Google optional) → Home re-asks the name (F-01), shows how-it-works again (F-13), catalog below the fold, BOARD tab hiding 20 games (F-06). *Strong onboarding, weak landing.*

**Returning visitor:** No recents, no favorites, no new-game surfacing; stats tiles are the only recognition of history — and they're device-local (F-32). *The platform has no memory of you.*

**Looking for a specific game:** No search (F-05); know-the-category-then-scan. *Unsupported.*

**Casual browsing:** One category at a time (F-06), low-information cards (F-17). *Friction-heavy.*

**Continue playing:** YOUR ROOMS with bare codes and no status (F-07); after the 24h TTL, rooms die into dead-end errors (F-25). *Partially supported.*

### F-26 · High · Medium Effort — Social features only work if you're standing on the Home page

**Where:** `subscribeInvites` / `subscribeRequests` (`src/lib/social.js`) are wired **only in `Home.jsx`**. `InviteFriendModal` opens **only from `WaitingRoom.jsx`** (pre-game lobby).

**Why it hurts:** A friend invites you while you're mid-game, on /demo, or on /profile → you see nothing until you happen to return Home. Invites are the platform's strongest growth/re-engagement loop and they're gated to one page. You also cannot invite a replacement after an opponent bails mid-game (compounds F-23), and incoming friend requests are equally invisible outside Home.

**Fix:** Move invite/request subscriptions to app level (e.g. `AuthContext` or an app-shell component); surface as sonner toasts with a JOIN action, visible on any page (suppress or soften during active real-time rounds). Allow `InviteFriendModal` from the in-game header, not just the waiting room.

**Impact:** Invite → join conversion; unblocks the F-23 recovery path; makes the friends system feel alive.

**Status: ✅ Implemented (July 2026).** `subscribeInvites`/`subscribeRequests` hoisted into `AuthContext`'s per-uid effect (`invites` + `requestCount` exposed via `useAuth()`); a headless `src/components/InviteToasts.jsx` fires sonner toasts with a JOIN action on any page (fresh invites only — a 2-minute age guard prevents stale invites toasting on app load); an invite-a-friend button now sits in both Game.jsx header variants (hidden for spectators) opening `InviteFriendModal` mid-game. Home consumes the context values instead of its own subscriptions.

---

## 8. Scalability (50 / 100 / 500 games)

**Already broken at 29:** single-category browsing (F-06), no search (F-05), no recents (F-07), phone-strip desktop (F-11).

**Breaks by 50:**
- The 5-category scheme — "BOARD ·20" tabs are shelves nobody scans (F-03).
- Registry-order grids — new games invisible (F-04).
- The SWITCH GAME modal — same picker, same problems, mid-session.
- The 2-col mobile grid — ~25 rows of scrolling with no landmarks.

**Breaks by 100:**
- **Tap-card-→-instantly-create-room.** With 100 unfamiliar games, users need a pre-commitment surface: a lightweight game panel (pitch, duration, players, rules, PLAY A FRIEND / VS AI, related games) instead of instant room creation on first tap. Familiar games keep one-tap play via recents/favorites rails — preserving the instant-play identity where it's earned.
- Curation becomes a real job: editorial collections ("2-minute breaks," "party night," "brain burners") and popularity ranking (needs F-10 data started **now**).

**Breaks by 500:**
- Categories as navigation. The browse model must be search-first + personalized rails + collections; categories become metadata.
- Game detail pages become necessary shareable/SEO surfaces.
- Per-game leaderboards/communities become the retention spine.

**Do now (cheap insurance):** registry metadata (`addedAt`, `tags`, `durationMin`, `pitch`), play-count instrumentation, sectioned-scroll ALL view, search.
**Can wait:** detail pages, collections, recommendation logic, editorial tooling.

---

## 9. UX Consistency

### F-27 · Medium · Quick Win — Round-advance CTAs diverge

**Where:** Standard games (via `GameStatus.jsx`): **PLAY AGAIN** (round) / **NEW MATCH** (match). WordDuel and Hangman: bespoke **NEXT ROUND** buttons with their own styling.

**Why it hurts:** The behavioral difference is intentional (NEXT ROUND keeps score — this is the documented convention for custom games). The *visual* divergence isn't. Users learn one end-screen grammar and get a different one per game.

**Fix:** Codify the rule — NEXT ROUND = continue keeping score; NEW MATCH = reset — and style the bespoke buttons identically to GameStatus's (shared classes or a shared button component).

**Status: ✅ Implemented (July 2026).** WordDuel and Hangman end-screen buttons now use GameStatus's exact RetroButton/outline classes (primary = NEXT ROUND, secondary = NEW MATCH/CONCEDE/END/RESET ROUND). Behavior unchanged per the documented convention.

### F-28 · Low · Quick Win — Disconnect copy: three phrasings

**Where:** "OPPONENT DISCONNECTED" (standard + Pong) / "OPPONENT IS OFFLINE" (WordDuel) / "WORD-KEEPER IS OFFLINE" (Hangman).

**Fix:** One pattern: `{ROLE} IS OFFLINE` — role-specific names (WORD-KEEPER) are good; the verb inconsistency isn't.

**Status: ✅ Implemented (July 2026).** "OPPONENT DISCONNECTED" → "OPPONENT IS OFFLINE" across 13 files; WORD-KEEPER IS OFFLINE kept as the role-specific exemplar.

### F-29 · Low-Medium · Medium Effort — Spectator experience is three different products

**Where:** One caption "SPECTATING" (standard games) vs a live score card with P2P caveat (Pong) vs full live guess boards (WordDuel).

**Fix:** Define a floor for every game — score + status + who's-turn — and add live-board depth where feasible. Spectators are would-be players; give them a "START YOUR OWN" path (ties into F-24).

**Status: ✅ Implemented (July 2026).** Shared `SpectatorCard` (players + match score + status, `statusOverride` for page-specific states) mounted across all 12 custom 2P pages — including two that previously showed spectators nothing. Fixed two real spectator bugs found in the sweep (ReactionGame's swapped counters, BluffBattle's "YOU" mislabel). WordDuel/Pong keep their richer views.

### F-30 · Low-Medium · Quick Win — Word Duel end screen lacks SHARE

**Where:** WordDuel builds a fully custom result screen and never renders the share-card CTA that every `GameStatus`-driven game gets (`src/lib/shareCard.js`).

**Why it hurts:** The most inherently shareable game on the platform (Wordle-adjacent, grid-reveal culture) is the one game that can't be shared.

**Fix:** Wire `shareCard.js` into WordDuel's result screen.

**Status: ✅ Implemented (July 2026).** shareCard wired into Word Duel's round-end and match-end screens (headline mirrors the on-screen result incl. cheat-detection; sub = match score).

### F-31 · Low · Quick Win — Empty states are inconsistent silence

**Where:** Zero stats → the YOUR STATS block silently unmounts (Home + Profile); zero requests → REQUESTS section unmounts; zero rooms → nothing. Meanwhile the Friends page does it right: *"No friends yet. Share your code or add someone above."*

**Fix:** Apply the Friends-page standard: brief encouragement + a CTA ("Play a match to start your record →" etc.). Empty states are onboarding surfaces, not absences.

**Status: ✅ Implemented (July 2026).** Home and Profile stats slots now show "PLAY A MATCH TO START YOUR RECORD" instead of unmounting when empty.

### F-32 · Medium (trust) · Medium Effort — The account pitch overpromises

**Where:** `Profile.jsx` copy: *"Your profile syncs across every device you sign in on."* Reality (`src/lib/profile.js` header comment confirms): win/loss stats live in localStorage only — they vanish on a new device even for signed-in users. Head-to-head records are keyed by the opponent's free-text display name — a rename silently orphans the history. And `recordMatch` runs only for 2-player games on match end, so the 3 party games build zero stats.

**Fix (preferred):** Mirror stats to `users/{uid}/stats` on write (the file's own header suggests exactly this), migrate localStorage on first sign-in, and key head-to-head by uid with a display-name label. **Fix (minimum):** scope the copy honestly ("profile, avatar & friends sync; stats stay on this device").

**Impact:** Trust — the account upgrade's core promise currently breaks for the most visible progress artifact.

**Status: ✅ Implemented (July 2026)** — the preferred fix: `recordMatch` mirrors stats to `users/{uid}/stats` (fire-and-forget, auth uid), head-to-head keyed by opponent uid with a name label (legacy name-keyed entries still render), one-time boot reconciliation in `src/lib/statsSync.js` (prefer more-games side, never decrease; unit-tested), Profile copy updated to match reality. Party games still build no stats (recordMatch remains 2P-only).

---

## 10. Engagement

### F-33 · High · Long-Term — The arcade has no real high scores

**Where:** The boot screen (`ArcadeLoader.jsx`) scrolls a marquee of **fake** high scores ("AAA 999900"…), while the product has no leaderboard, no achievements, no match history (grep-confirmed: zero real hits for achievement/leaderboard/XP).

**Why it hurts:** The retro-arcade identity *sets up* an expectation — high-score tables are the original engagement mechanic — and the product never pays it off.

**Fix (sequenced):** sync stats per F-32 → per-user match history (simple append log) → **friends-scoped leaderboards** (friend graph + presence already exist; friends-scoped avoids global-leaderboard abuse/moderation costs and fits the play-with-friends identity) → a handful of achievement badges surfaced on Profile and PlayerCards.

**Status: ✅ Implemented (July 2026)** — v1 of the sequenced fix: friends-scoped LEADERBOARD on the Friends page (wins → winrate → games, competition ranking; self highlighted; stat-less friends rank last at 0-0), reading the `users/{uid}/stats` mirror from F-32. No rules change was needed. Match history and achievement badges remain the follow-up phases.

### F-34 · Medium · Medium Effort — Daily loop half-built

**Where:** `DailyGame.jsx` has per-day best + in-session combo streak, but no day-over-day streak (Wordle's core hook), no share card, and one fixed game (math only).

**Fix (sequenced):** link it (F-08) → day-over-day streak counter (localStorage/`users/{uid}`) → share card via `shareCard.js` ("Daily #142 — 17 solved 🔥5") → rotate the featured game daily ("Today's challenge: Reversi vs AI"), which doubles as catalog exposure.

**Status: ✅ Implemented (July 2026)** through the streak+share steps: day-over-day streak (`gn-daily-streak`, idempotent per local day, unit-tested across year boundaries) shown on the end screen and Home tile from 2 days up; SHARE RESULT posts "DAILY #N — X SOLVED 🔥streak" via shareCard. Rotating the featured game daily remains open.

### F-35 · Medium · Quick Win — Upgrade nudges: two touchpoints, zero context

**Where:** Guest→Google upgrade appears only in onboarding's welcome step and the Profile page. A returning guest who skipped both never sees it again.

**Fix:** One contextual, dismissible nudge at moments that *sell* the account: a 3-win streak, 5th match played, first friend added — "Sign in to keep this across devices." Cap frequency; never block play.

**Working well — keep:** the emote bar, share result cards, the consent-based rematch/switch handshake, presence dots, the waiting-room invite trio (link/QR/friend), win effects with round-vs-match intensity, the room-code join fallback.

**Status: ✅ Implemented (July 2026).** One dismissible Home banner for anonymous users at bestStreak ≥ 3 or games ≥ 5, linking /profile; dismissal persists 14 days (`gn-upgrade-nudge-dismissed`).

---

## 11. Cognitive Load

- **Room codes as the primary object** (F-07): users manage transport IDs instead of games and people.
- **Autofocused name input** (F-01): pops the mobile keyboard over the catalog on arrival.
- **Choice architecture** (F-06/F-17): 9 identical-weight cards per tab, no defaults, no "popular" anchor — choice overload with no signposting.
- **Instant room creation on tap:** *good* at 29 games (low friction is the product's superpower); becomes accidental-commitment at 100 (see Scalability §8, the split-tap-contract fix).
- **Micro-copy density:** all-caps 7–10px pixel font for every label *including body copy* trades readability for theme. Reserve pixel font for headings/labels; use the existing mono font for sentences. (Flagged as readability, not visual design.)

---

## 12. Mobile UX

**Strong foundation (keep):** safe-area insets used consistently; `touch-action: manipulation` global; 44–48px letter/number keyboards; per-genre touch schemes (Pong drag-paddle, Snake/Tron swipe, Spaceduel multi-touch on-screen buttons, Sumo tap); no hover-gated functionality anywhere; `prefers-reduced-motion` respected; every board capped ≤448px so nothing horizontally scrolls on a 375px viewport.

### F-36 · Medium · Quick Win — iOS users get no install path

**Where:** `useInstallPrompt.js` relies on `beforeinstallprompt`, which iOS Safari never fires → the "+ ADD TO HOME SCREEN" button never appears for roughly half of mobile users.

**Fix:** iOS-detect (user agent + `!navigator.standalone`) and show a one-time instructional hint: Share sheet → "Add to Home Screen."

**Status: ✅ Implemented (July 2026).** `useInstallPrompt` returns `isIos` (UA detect + `!navigator.standalone`); Home shows a dismissible "TAP SHARE → ADD TO HOME SCREEN" hint in the install slot (`gn-ios-install-dismissed`).

### F-37 · Low · Quick Win — Two undersized tap targets

**Where:** (a) WordDuel on-screen keyboard keys are 40px (`w-10 h-10`) below the `sm:` breakpoint — under the 44px recommendation, on the surface users hammer fastest. (b) The "?" RulesButton overlaid on each catalog card is ~16–20px sitting beside a large card button — and a mis-tap *creates a room*, an expensive error.

**Fix:** Enlarge hit areas via padding (visuals unchanged).

**Status: ✅ Implemented (July 2026).** RulesButton hit box grown to 40px via p-3/-m-2 (no visual/layout shift). Word Duel keys: true 44px height below `sm:`; a w-11 width bump cannot fit 10 keys in a 375px viewport, so width gained an overlap-safe invisible 2px-per-side hit extension instead.

### F-38 · Low — Keyboard-over-content on Home

Resolved by F-01 (removing the autofocused input from the initial viewport). Keep any remaining inputs below the first screenful.

**Status: ✅ Resolved (July 2026)** as a side effect of F-01 — the autofocused name input was deleted; the search input and join-code input do not autofocus.

**No bottom nav needed** at current scale (two secondary destinations). Revisit only if Daily + Leaderboards make it 4+ real destinations.

---

## 13. Benchmarking — patterns worth adopting

| Platform | Pattern | Why it applies |
|---|---|---|
| **Poki / CrazyGames** | Sectioned-scroll home; horizontal category rails; always-visible search; "recently played" as first rail; instant play preserved | Closest analog; proven discovery model for hundreds of casual games; solves F-05/06/07 directly |
| **Netflix** | "Continue watching" row first; rows cheap to add/reorder; personalization via row order | The rails architecture (F-07); rails scale where tabs don't |
| **Chess.com** | Daily puzzle as retention anchor; one prominent PLAY action with modes beneath; friends-scoped leaderboards | Template for F-08/F-33/F-34; also the "mode is a property of the game" model (F-02) |
| **Steam** | Tags over categories; instrumented "popular now" | Metadata + instrumentation groundwork (F-10/F-18) |
| **Apple Arcade / Game Pass** | Editorial collections; "New this week"; strong per-game panels | The 100-game curation model (§8); NEW rail (F-04) |
| **Nintendo eShop** | *Anti-pattern:* launch-era flat lists that collapsed at scale until search/wishlists arrived | Bolt discovery on **before** the catalog forces it |
| **itch.io** | Community/creator identity, jams | Light inspiration only; not a structural model here |

**Patterns to reject:** heavy game-detail interstitials before play at current scale (kills instant-play, the platform's core differentiator); infinite personalized feeds (catalog too small); hamburger navigation (too few destinations to hide).

---

## Top 10 improvements (impact-ranked)

1. ✅ **Catalog-first home restructure** — grid to the top, name field removed, join-code demoted (F-01).
2. ✅ **ALL-games sectioned scroll + search** — kills tab isolation, serves specific-game seekers (F-05, F-06).
3. ✅ **CONTINUE PLAYING + RECENTLY PLAYED rails** replacing code-centric YOUR ROOMS (F-07).
4. **Link the daily challenge** ✅ (F-08), then add streak + share (F-34 — open).
5. ✅ **Responsive desktop layout** — wider shell, 3–5 column grid (F-11; Home only, other pages open).
6. **End-of-game "try next" suggestions** (F-22 — open) + ✅ fix the dead SWITCH buttons (F-20 — fixed in 7 files).
7. ✅ **App-level invite/request notifications** + mid-game friend invites (F-26).
8. **Abandoned-game recovery** — timeout → claim win / re-invite / save & exit (F-23).
9. **Unify /demo into the catalog** — mode picker per game (F-02).
10. **Registry metadata + NEW badges + play-count instrumentation** — the scaling foundation (F-04, F-10, F-17, F-18).

---

## Roadmap

### Immediate (quick wins, ~days)

| Item | Finding |
|---|---|
| ✅ Link `/daily` from Home (DAILY tile with today's state) | F-08 |
| ✅ Fix `onSelect`/`onSwitchGame` → `onSwitch` dead buttons (7 files, not just Word Duel) | F-20 |
| ✅ Write the 5 missing rules entries (chainreaction, spaceduel, sumo, tron, wordduel) | F-21 |
| ✅ NEW badges driven by `addedAt` registry field | F-04 |
| ✅ Fix game-count copy (derive in-app; update `index.html` meta) | F-12 |
| ✅ "START A NEW {game} ROOM" CTA on NOT FOUND / EXPIRED screens | F-25 |
| ✅ Room-full toast + start-your-own CTA for spectators | F-24 |
| ✅ Empty-state copy pass (stats, requests, rooms) | F-31 |
| ✅ Disconnect-copy normalization (`{ROLE} IS OFFLINE`) | F-28 |
| ✅ Enlarge "?" RulesButton and WordDuel key hit areas | F-37 |
| ✅ iOS add-to-home-screen hint | F-36 |
| ✅ SHARE button on Word Duel end screen | F-30 |
| ✅ Contextual account-upgrade nudge at streak/milestone | F-35 |
| ✅ 404 catch-all route | F-15 |

### Next iteration (~weeks)

- ✅ Home restructure: catalog-first, rails order = DAILY / CONTINUE / catalog sections / RECENT (F-01, F-07, F-08)
- ✅ Search + ALL sectioned-scroll view; tabs become filters (F-05, F-06)
- ✅ Responsive desktop shell + multi-column grid (F-11 — Home; other pages open)
- ✅ Game-centric CONTINUE PLAYING (room status chips) + RECENTLY PLAYED chips (F-07)
- End-of-game suggestion chips (variants → same category) (F-22)
- ✅ Global invite/request toasts; invite modal available mid-game (F-26)
- Abandoned-game timeout UX (claim win / re-invite / save & exit) (F-23)
- Favorites/pinning + FAVORITES rail (F-09)
- Stats sync to `users/{uid}` + honest account copy + uid-keyed head-to-head (F-32)
- CTA/label consistency pass: NEXT ROUND styling, spectator floor (F-27, F-29)

### Future enhancements

- /demo unification — mode-per-game chooser, `/demo` redirects (F-02)
- Registry tags + duration + filter chips; desc → pitch rewrite (F-17, F-18)
- Play-count instrumentation → POPULAR rail (F-10)
- Friends leaderboard + match history + achievements (F-33)
- Daily rotation across games; daily share cards; day-over-day streaks (F-34)
- Editorial collections ("2-minute breaks", "party night") (§8)
- Lightweight game detail panels before the catalog reaches ~100 (§8)
- Category taxonomy rework (tags as truth, categories as curated shelves) (F-03)

---

## Scaling to 100+ games — evolve before you get there

1. **Metadata before features.** Every future registry entry ships with `addedAt`, `tags`, `durationMin`, and a one-line `pitch`; retrofit the existing 31. Every discovery feature in this document depends on this data existing.
2. **Rails, not tabs.** Home becomes stacked horizontal rails (Daily / Continue / Favorites / New / Popular / per-category). Rails absorb catalog growth by adding rows; tabs don't.
3. **Search becomes primary navigation** — including variant entries; `/` shortcut on desktop; remember recent searches.
4. **Instrument now, personalize later.** Play counts per gameType from today; ranking, trending, and "similar games" all feed off it.
5. **Split the tap contract.** Recents/favorites keep one-tap instant play; unfamiliar games get a lightweight pre-commitment panel (pitch, duration, rules, PLAY / VS AI, related). Instant play stays the identity — where it's earned.
6. **One catalog, modes within.** The /demo split must be gone before 50 games; two parallel 50-game catalogs is untenable.
7. **Community layer as the retention spine.** Friends-scoped leaderboards, match history, achievements — built on the existing uid/friends graph. Friends-scoped avoids global-leaderboard toxicity and moderation cost while fitting the invite-your-friends product.

---

## Strengths / Weaknesses / Opportunities

**Strengths**
- Frictionless entry: anonymous auth, no forced account, instant room creation
- Best-in-class invite trio: link share, QR code, in-app friend invites
- Consent-based rematch/switch handshake (proposal banner with accept/decline)
- Seat reclaim via auth uid — closing a tab never kills a game
- Genuinely mobile-considered game controls per genre; safe-area, reduced-motion, tap-target hygiene
- Solo/vs-AI coverage for most of the catalog; per-game rules modals; themed share result cards
- Cheat-detection transparency in commit-reveal games (WordDuel, Hangwoman)

**Weaknesses**
- Form-first homepage; catalog below the fold; redundant name capture
- Discovery ceiling: no search, no ALL view, no recents, no favorites, one-category-at-a-time tabs
- Desktop as afterthought (384px strip, fixed 2-col grid)
- Invisible catalog growth: no NEW surfacing, historical ordering, stale "13 games" meta copy
- Social layer imprisoned on the Home page; invites only from the waiting room
- Dead-end states: expired links, full rooms, abandoned opponents
- Stats layer local-only, party-game-blind, and oversold by account copy
- Inconsistent end-of-game CTAs, disconnect copy, spectator depth, empty states
- A finished daily challenge nobody can find

**Opportunities**
- The daily loop: built, unlinked — the cheapest retention win available
- Rails-based home that scales to 500 games without redesign
- Friends-scoped leaderboards that make the boot screen's fake high scores real
- End-of-game cross-selling to multiply games per session
- Play-count instrumentation now → personalization later
- Unified catalog making vs-AI the zero-friction first taste of every game

---

## Appendix: verification notes for implementers

Quick wins are individually verifiable in the running app (`npm run dev`):
- Home shows a DAILY tile that reaches `/daily` and reflects played/unplayed state
- Word Duel end screen: SWITCH GAME opens the picker (was dead)
- All 29 games show real rules in the "?" modal (no "Rules coming soon.")
- Word Duel and Chain Reaction cards show NEW badges
- Expired/NOT FOUND screens offer "START A NEW {game} ROOM"
- Invite toast fires while in a game (two-player test: normal window + incognito, per CLAUDE.md — same-browser tabs share playerId)

Larger items (home restructure, rails, search) should be validated against the five flow checks in §7: first-time visitor, returning visitor, specific-game seeker, casual browser, continue-playing.

---

# Round 2 audit — August 2026 (catalog at 44 entries / 40 playable)

Fresh-eyes pass on the live app after the second game wave (hex, mine race,
herd mind, trivia blitz, battleship, mancala, checkers, air hockey, artillery).
The July round's shell fixes held up; what's new is **wayfinding drift between
the three surfaces** (coin screen, catalog, demo hub) plus gaps opened by the
new hidden-info and multi-turn games. Findings continue the F-numbering.

### F-39 · High · Quick Win — The arcade splash doesn't pitch the product

**Where:** Boot/landing screen — "INSERT COIN TO PLAY" / "CREDIT 1" with
PLAY AS GUEST / SIGN IN buttons. The one-line pitch ("44 GAMES · SHARE A LINK ·
NO ACCOUNT") only renders *after* sign-in on Home.

**Why it hurts:** Charming, but a first-time visitor gets theme with zero
product identity for two clicks. The pitch is the conversion line and it's
buried behind the exact action we're asking for.

**Fix:** Put "{N} GAMES · SHARE A LINK · NO ACCOUNT" on the coin screen itself
(derive N from GAME_TYPES so it can't rot, per F-12).

**Impact:** Landing page converts curiosity → play without requiring trust
first.

### F-40 · High · Quick Win — Demo hub tiles mislabeled

**Where:** `src/pages/Demo.jsx` DEMOS array + tile renderer. Every tile shows
the registry player-tag ("2P") even though every demo is vs-CPU; short names
break mid-word: "BATTLE SHIP", "CHECK ERS", "ARTIL LERY" (`\n` in `short`).

**Why it hurts:** The hub reads as multiplayer browse mode, contradicting what
tapping does. Mid-word breaks look broken rather than stylized at 7px pixel
font.

**Fix:** In demo context render "VS CPU" instead of `getPlayerTag`; fix shorts
("BATTLE\nSHIP" is fine, CHECKERS → smaller font or "CHECKERS" single line at
6px, ARTILLERY → "ARTIL-\nLERY" hyphenated or shrink).

**Impact:** Kills the biggest "this looks unfinished" surface.

### F-41 · Medium · Quick Win — Demo hub vs Home tell different stories

**Where:** Demo category tabs show different counts than Home ("BOARD ·17" vs
"·13") because DEMOS includes variants Home hides; hub header says just "Demo";
no cross-link from catalog cards to practice mode beyond the VS AI button.

**Why it hurts:** Two surfaces naming the same games differently erodes the
mental model (extends F-02, which unified *entry*, not *presentation*).

**Fix:** Header → "PRACTICE · VS CPU"; derive tab counts from the same source;
add a "PRACTICE MODE" caption linking back to full catalog.

**Impact:** One coherent story across surfaces.

### F-42 · Medium-High · Medium Effort — Hidden-info rooms give joiners no anticipation copy

**Where:** Battleship/Hangwoman waiting rooms show generic waiting UI. What
the joiner is waiting *for* (rival deploying a secret fleet / setter choosing
a word) only appears after start.

**Why it hurts:** Anticipation is the fun of hidden-info games; an empty room
with no narrative wastes the wait.

**Fix:** Per-game waiting-room flavor line via registry field (`waitingCopy`)
— e.g. Battleship: "RIVAL IS DEPLOYING THEIR SECRET FLEET…"

**Impact:** Turns dead wait time into hype.

### F-43 · Medium · Quick Win — Rules unreachable inside a room before start

**Where:** "?" rules live on catalog cards only. Inside a created room, before
start, nothing teaches the game — worst for party games (herd/trivia) where
one confused player stalls everyone.

**Fix:** RulesButton in the waiting-room header (same modal component).

**Impact:** Fewer stalled rooms; party games self-onboard.

### F-44 · Medium · Medium Effort — Multi-act moments are under-weighted

**Where:** Mancala extra turn ("GO AGAIN" toast) and Battleship hit-again
(one-line banner) use small text while goals get full-screen flashes.

**Why it hurts:** These are each game's signature dopamine moment — the most
missed feedback in the platform.

**Fix:** Full-width flash treatment (goal-flash precedent) + dedicated sound
for extra-turn/hit-again states.

**Impact:** Game feel; these moments are why people replay.

### F-45 · Low-Medium · Medium Effort — No curated START HERE path at 44 tiles

**Where:** Home ALL view is sectioned by category; NEW badges exist; no
editorial on-ramp for a newcomer facing 44 cards.

**Fix:** "START HERE" rail (3–5 curated: TTT → Connect Four → Battleship →
Sketch), rendered above categories for first-session visitors only
(`hasOnboarded`-gated like F-13).

**Impact:** Conversion of new visitors who freeze at choice overload.

### F-46 · Low · Quick Win — Share cards not standardized

**Where:** shareCard.js wired into GameStatus-driven games + some custom pages
(wordduel F-30); herd/trivia/battleship/mancala/checkers/artillery demos and
some custom end screens lack it.

**Fix:** Audit all end screens against a checklist: PLAY AGAIN · SHARE · TRY
NEXT · SWITCH GAME.

**Impact:** Every match end becomes a growth loop.

### Round 2 watch items

- Mute state persistence across reloads — verify once.
- Emote bar discoverability for first-session players (no hint it exists).
- Air Hockey ships demo-first (PRD order); catalogue entry goes realtime-only
  until the transport page lands — confirm the ModeChooser doesn't offer
  broken "PLAY A FRIEND" for it.
