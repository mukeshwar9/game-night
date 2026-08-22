# Entry Experience UX Review — Home / Onboarding / Demo / Daily / NotFound / Catalogue / Solo

Scope: `Home.jsx`, `Onboarding.jsx`, `Demo.jsx`, `DailyGame.jsx`, `NotFound.jsx`, `GameCard/GamePicker/CategoryTabs/RecentlyPlayed/ContinuePlaying/DailyTile/EmptyState/ArcadeLoader`, `loading/`, and `/solo/:type`.

`UX-IMPROVEMENTS.md` (F-01–F-46) and `MOBILE-UX-AUDIT.md` (M-01–M-92) read in full first — both are implemented and not re-litigated. Also read `gd-platform-ux-s1/report.md` (retention loop — different lens) and `games-review-solo-s1/report.md` (correctness bugs in the solo skill games — not craft/UX). Nothing below duplicates those.

## Ranked findings

| # | Screen | Finding | Severity | Effort | Rule id |
|---|--------|---------|----------|--------|---------|
| 1 | Demo / `/solo/:type` | VS AI and direct solo links never show rules — player is dropped on a bare board | **High** | Small | own judgement (task focus area) |
| 2 | NotFound | 404 is a dead end — no link home, no heading | Medium | Small | `error-recovery`, `heading-hierarchy` |
| 3 | Demo hub | No page heading (`h1`) — only a small "Demo" badge | Low | Small | `heading-hierarchy` |
| 4 | Demo / PartyGameCard | "CREATE A ROOM →" for party games routes to `/` with zero context carried — player must re-pick the game | Low | Small | own judgement |
| 5 | Onboarding | Identity step has no visible required-field/limit affordance beyond `maxLength` | Low | Small | own judgement |

## Detail

**1. Solo route bypasses rules entirely — `GamePicker.jsx:114-121`, `Demo.jsx` (whole file, confirmed zero `RulesModal`/`RulesButton`/`getRules` references)**

The catalog card's rules content is genuinely good: `RulesModal` (objective / how-to-play / win, sourced per game in `src/lib/rules.js`, ~50 entries covering the catalog) is reachable from every `GameCard` via its "?" button. But that "?" is on the *catalog* card only. The moment a player taps **VS AI** (`GamePicker.jsx:114`, `handleVsAi` → `onSolo(g.type)` → `Home.jsx:273` → `navigate('/solo/' + type)`), or opens a `/solo/:type` link directly, they land in `Demo.jsx` with no rules affordance anywhere on the page — grep confirms the file never imports `RulesModal`, `RulesButton`, or `getRules`. `BotBoardDemo` (the component that renders for the ~20 board games) mounts straight into a `PlayerCard`/board pair with no blurb at all.

For familiar games (Tic Tac Toe, Connect Four) this is a non-issue. For the catalog's less common entries reachable from this exact path — Hex, Blockade, Chain Reaction, Gomoku, Reversi, Order & Chaos — a player who came here specifically because "no friends online, play solo" (the exact CTA copy on `Home.jsx:260`) is now guessing at an unfamiliar ruleset from a blank board, with the one existing rules UI unreachable from where they are. This directly contradicts the "how it works" promise a few lines above it and is the single biggest gap against this review's "rules before the first move" brief.

Fix: add a `RulesButton`/`RulesModal` to the Demo hub's active-demo panel (`Demo.jsx:2354`, next to the "␣ DEMO" label), wired to `selected`. Cheap — the modal and its content already exist and are used elsewhere; this is a wiring gap, not new content.

**2. NotFound is a full dead end — `src/pages/NotFound.jsx:1-11`**

The entire page is one `<p>` reading "404 — NOTHING AT THIS ADDRESS." No `<h1>`, no link, no button. A player who mistypes a room code or opens a stale/expired link has no way forward except the browser back button or manually retyping the URL — every other exit pattern in the app (Home nav logo, tab bar) is simply absent here because `NotFound` renders nothing but that one line. `error-recovery` calls for a clear next step, not just an error message; the page currently has none.

Fix: one `<Link to="/">GO HOME</Link>` styled like the app's other primary CTAs. Trivial.

**3. Demo hub has no page heading — `src/pages/Demo.jsx:2320-2328`**

The header row is `justify-end` with only a small "Demo" pill; there's no `<h1>`/`<h2>` anywhere on the page. Screen-reader users landing on `/demo` or a shared `/solo/:type` link get no page-level orientation before the category tabs. Cosmetically fine for the retro aesthetic — this is a structural/semantic gap, not a visual one.

Fix: add a visually-hidden or small `<h1>` ("SOLO PLAY" / the active game's label) — no layout change needed.

**4. Party game solo card exits to blind room creation — `Demo.jsx:199-216` (`PartyGameCard`)**

For the 8 party-only types (Two Truths, Bluff, Sketch, Wavelength, Fibbage, Spyfair, Herd, Trivia's non-demo path), landing here explains there's no solo bot and offers "CREATE A ROOM →", which is a bare `<Link to="/">`. It does not pass the game type through, so the player re-arrives at Home with no selection made and has to re-find and re-tap the same game in the catalog. Minor friction, but avoidable — `createGame(type)` already exists as a callable path from `Home.jsx`.

Fix: pass `?create=type` or use `navigate` with state instead of a raw `Link to="/"`, and have `Home.jsx` auto-create on mount when present. Small effort, not urgent.

**5. Onboarding identity step's name field has no length/requirement cue — `Onboarding.jsx:149-159`**

`maxLength={20}` is enforced silently; there's no counter, no helper text, and the placeholder is the only hint (`GUEST-XXXX`) that leaving it blank is fine. Not a blocker — `finish()` falls back to a guest name — but a first-time player has no visible signal that the field is optional. Cosmetic/low; the flow works either way.

## What is missing

- **No inline rules trigger inside the solo/Demo experience** (detailed as #1 above) — the biggest gap against "rules before the first move" for this catalog's size.
- **No "why this game" signal on the Demo hub's own tiles beyond the player-tag chip** — `Demo.jsx:2334-2349`'s 4-column icon grid shows icon + short label + player tag (1P/2P), but not the duration chip or description text `GameCard` shows on the main catalog. A player browsing solo options via `/demo` (rather than the catalog's VS AI chip) has less pre-commitment information here than on Home, for the same decision. Worth carrying the duration chip over given this is explicitly the "player with nobody to play against" screen.
- **No empty/error state if a `/solo/:type` deep link names a real game with no solo demo** (e.g. a party-only type shared as a raw URL) beyond the existing PartyGameCard fallback — that part is handled — but an outright bogus `:type` param silently falls back to Tic Tac Toe with zero indication the requested game wasn't found. Low priority, but worth a toast ("GAME NOT FOUND — SHOWING TIC TAC TOE") since it's currently silent.

## Screens that are genuinely well built

- **Home.jsx** — logo/first-run copy, pending-invite cards, DailyTile + join-code utility row, first-run HOW IT WORKS strip with an explicit solo-play escape hatch, ContinuePlaying/RecentlyPlayed, stats block, upgrade nudge, PWA install prompt — all present, all with proper dismiss/empty states, and M-82's scroll-restoration is a genuinely careful fix. Nothing to add here beyond what's already tracked in F-01–F-46.
- **DailyGame.jsx** — intro/playing/done states are complete, timer urgency color-shifts correctly, share card wired, "come back tomorrow" messaging present. Well built.
- **GameCard.jsx / GamePicker.jsx** — duration + player-count + description on every card, search, filters, favorites, per-game rules modal, variant chooser — this is the strongest screen in the set and clearly answers "can a player tell what they're choosing" for the *catalog* path.
- **ContinuePlaying.jsx** — correct `Skeleton` loading state distinct from its empty state (returns `null` only after the fetch resolves empty), matches the "right kind of feedback for the right kind of wait" bar this review was asked to check.
- **CategoryTabs / EmptyState / DailyTile / RecentlyPlayed** — small, consistent, nothing to flag.
- **ArcadeLoader / PixelDots / loading family** — reduced-motion is handled at the CSS level (`index.css:478`), the three loading grammars (machine work / waiting-for-human / error) are genuinely distinct as the architecture doc claims.

## Structural vs needs-rendered-check

- **Structural certainties** (confirmed by reading the markup/logic, no rendering needed): #1 (grep-confirmed absence of rules wiring in `Demo.jsx`), #2 (NotFound's full JSX is 11 lines, nothing else renders), #3 (no heading element anywhere in `Demo.jsx`), #4 (`PartyGameCard`'s `Link to="/"` carries no params), #5 (no counter/helper JSX present).
- **Would need a rendered/contrast check**: actual on-screen contrast of `text-retro-dim`/`text-retro-cta` against each of the six themes (can't verify from CSS custom-property definitions alone without computing final RGB per theme), and whether the Demo hub's 4-column icon-grid tiles feel cramped in practice on a small phone despite passing the 24px-icon/tall-container math done above.

## Sourced vs own judgement

- Sourced from the dataset (rule id cited inline): `error-recovery`, `heading-hierarchy` (both via `ux` domain, both retried once with narrower phrasing after an initial broad query, both returned clean single-topic hits).
- Own judgement, explicitly marked: #1, #4, #5, and the "what is missing" section's duration-chip and bogus-type-toast items — these follow from the task's stated focus areas (rules-before-first-move, solo-route parity) rather than a dataset rule.
