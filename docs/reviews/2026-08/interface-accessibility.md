# UI/UX Review — Accessibility, Theming & Interface Craft (cross-cutting)

Scope: shared foundations (`src/index.css`, `tailwind.config.js`), sampled 15+ components across board/arcade games, modals, and chrome, `src/hooks/`, `src/components/loading/`. Read-only, no code changed. `UX-IMPROVEMENTS.md`, `MOBILE-UX-AUDIT.md`, and today's `games-review-*`/`gd-*`/`ge-board-s1` reports read first — findings already covered there (touch-target sizing catalog M-01–M-92, per-game color-only distinctions, Mine Race's unkeyboardable cells, Pong power-up color-only) are referenced, not repeated.

## Ranked findings

| # | Screen/Area | Finding | Severity | Effort | Rule ID |
|---|---|---|---|---|---|
| 1 | All themes, app-wide | `--c-dim` (the app's only muted/secondary text token) fails 4.5:1 body-text contrast on `bg`/`card` in 5–6 of 6 themes; used in 106 files, often at 7–10px | **Critical** | Medium | `color-contrast` (dataset) |
| 2 | TicTacToe board (`Cell.jsx`) | Cell strips `outline-none` with zero replacement — keyboard-focused cell is completely invisible, unique among all board components | **Critical** | Quick Win | `focus-states` (dataset) |
| 3 | Every `BottomSheet`-based modal (Rules, Mode/Variant chooser, Game switcher, Invite Friend, etc.) | No focus trap — Tab cycles keyboard focus into page content hidden behind the backdrop; no focus moved into the dialog on open | High | Medium | own judgement |
| 4 | Mono theme, app-wide | `--c-p1`, `--c-cta`, and `--c-win` collapse to near-identical near-white values (p1==cta exactly, win 1.05:1 off) — any UI relying on those tokens to distinguish X/CTA/win loses that signal in this theme only | High | Medium | own judgement (computed) |
| 5 | Amber theme | `--c-danger` on `bg` = 3.74:1 — fails normal-text 4.5:1, passes only large-text 3:1; weakest danger token of all 6 themes | Medium | Quick Win | `color-contrast` (dataset) |
| 6 | Presence dot (`InviteFriendModal.jsx:72`) | Online/offline friend status shown by dot color alone (`bg-retro-win` vs `bg-retro-dim`) — no icon/text alternative | Medium | Quick Win | `color-not-only` (dataset) |
| 7 | App-wide buttons | No themed `:focus-visible` style on any `<button>` — relies on unstyled native browser outline, which visually clashes with the retro chrome rather than adapting per theme like every other UI accent does | Low | Quick Win | own judgement |
| 8 | `ArcadeLoader.jsx`, `WinEffect.jsx`, `ChainReactionBoard.jsx` | Cascades/loaders are staged with `setTimeout`, not CSS `animation` — `prefers-reduced-motion`'s global `animation-duration: 0.001ms !important` (index.css:478-486) kills the per-step easing but not the multi-step wall-clock sequencing, so a reduced-motion user still watches a strobe of instant state changes over the same real duration | Medium | Medium | `reduced-motion` (dataset) |
| 9 | `NavBar.jsx:79,85` | Mute/Unmute `aria-label` is set on the inner `<svg>`, not the `<button>` itself | Low | Quick Win | `aria-labels` (dataset) — **needs a render/AT check**, accessible-name inheritance from a labelled descendant is implementation-dependent |
| 10 | Border token (`--c-border`) vs `--c-card` | ~1.1–1.5:1 in all 6 themes — near-invisible as a UI-boundary color if any component leans on the border alone (not text, so WCAG 1.4.11 non-text 3:1, not 1.4.3) | Low | — | `color-contrast` (dataset, non-text variant) — **flagging only, not confirmed as load-bearing anywhere** |

## Detail

### 1. `--c-dim` fails contrast almost everywhere (Critical)
`src/index.css` — token defined per theme at lines 46 (midnight), 73 (phosphor), 94 (amber), 115 (synthwave), 136 (grid), 157 (mono). Computed WCAG contrast of `--c-dim` text on `--c-bg`:

| Theme | dim-on-bg | dim-on-card |
|---|---|---|
| midnight | 3.10 ❌ | 2.83 ❌ |
| phosphor | 4.71 ✅ | 4.14 ❌ |
| amber | 4.01 ❌ | 3.69 ❌ |
| synthwave | 4.25 ❌ | 3.89 ❌ |
| grid | 4.32 ❌ | 3.87 ❌ |
| mono | 5.52 ✅ | 4.47 ❌ |

Only phosphor and mono clear 4.5:1, and only on `bg` — every theme fails on `card` (the surface most labels/descriptions actually sit on). `text-retro-dim` is used in 106 files (`GameCard.jsx` descriptions, `RecentlyPlayed.jsx` labels, loader status text, empty states, `ProposalBanner.jsx`, etc.), frequently at `text-[7px]`–`text-[10px]` and sometimes further dimmed with `/50`–`/70` opacity (10+ instances, e.g. `SnakeGame.jsx:291`, `SpyfairGame.jsx:470`), which only worsens an already-failing baseline. This is a computed, structural finding — no rendering needed, the numbers come straight from the token RGB values. A player with any degree of low vision will lose real information (game descriptions, round labels) on `card` surfaces in every theme, and on `bg` in 4 of 6.

**Fix:** raise `--c-dim` luminance ~15–20% per theme (structural, touches every theme's palette — plan it, don't patch blind) or reserve it for genuinely decorative/large text and add a second, AA-passing muted token for real labels.

### 2. `Cell.jsx` has no focus indicator at all (Critical, Quick Win)
`src/components/Cell.jsx:12` — `'border-2 rounded transition-all duration-100 select-none outline-none'`. No `focus-visible:` class anywhere in the file. This is TicTacToe's board cell — the single most-played board in the app — and it is the *only* board component in the whole sample that strips the outline (`ConnectFourBoard`, `DotsAndBoxesBoard`, `SosBoard`, `GomokuBoard`, `ReversiBoard`, `ChainReactionBoard`, `BlockadeBoard`, `OrderChaosBoard`, `PairsBoard` all keep native focus rings — verified `grep` across all board components, zero `outline-none` hits outside `Cell.jsx`). A keyboard player tabbing through the TicTacToe grid gets no visual cue which cell is about to receive Enter/Space. Structural certainty from the markup.

**Fix:** add `focus-visible:ring-2 focus-visible:ring-retro-p1 focus-visible:ring-offset-2` (or reuse the `ring-retro-cta` pattern already used for `isLastMove` at line 18) — one line, themed automatically via the existing token.

### 3. No focus trap in the shared modal primitive (High)
`src/components/BottomSheet.jsx` — every overlay in the app (`RulesModal`, `ModeChooser`, `VariantChooser`, `GameSwitcher`, `InviteFriendModal`, Friends' request panel, etc.) is built on this one primitive, and it's genuinely well done: `role="dialog" aria-modal="true"`, Escape-to-close (line 39), backdrop-tap-to-close with `stopPropagation` on the panel, safe-area padding, swipe-to-dismiss. But there is no focus trap and no initial-focus management: on open, focus stays wherever it was (the trigger button, usually now hidden behind the backdrop), and the DOM's natural Tab order still includes every element behind the overlay — `aria-modal` only tells assistive tech to treat the background as inert, it does not change native Tab-key traversal in the DOM. A sighted keyboard user can Tab straight through the dialog and into page chrome sitting invisibly underneath the backdrop.

Cross-cutting because it's the one shared component every dialog in the app is built on — fixing it once fixes every overlay. This is a structural read of the component; **confirming actual Tab behavior needs a rendered check** (some browsers add implicit `inert`-like behavior with `aria-modal`, but support is inconsistent).

**Fix:** on mount, move focus to the panel or its first focusable child; on a Tab/Shift+Tab that would leave the panel, wrap back to the other end (a small `useFocusTrap` hook, or `inert` on siblings of the overlay root).

### 4. Mono theme collapses p1/cta/win to the same color (High, mono-specific)
`src/index.css:158-161` — `--c-p1: 250 249 240`, `--c-cta: 250 249 240` (byte-for-byte identical), `--c-win: 255 255 248` (1.05:1 from p1 — imperceptible). Computed directly from the token values, no rendering needed. Every other theme keeps these three visually distinct (e.g. midnight: cyan/yellow/green). In mono, anything that leans on "X's color" vs "the primary CTA color" vs "you won" as a secondary reinforcing cue collapses into one near-white. This is the sharpest form of the narrow-gamut cost the task asked about — mono is deliberately near-monochrome, but three of its five identity tokens landed on the *same* value rather than three deliberately-spaced grays.

**Fix:** spread p1/cta/win across mono's available luminance range rather than clustering all three at the top (e.g. p1 slightly warmer/dimmer, keeping win as the brightest "success" beat).

### 5. Amber's danger token is the weakest across all six themes (Medium)
`src/index.css:99` — `--c-danger: 210 25 45` on amber's `--c-bg: 13 7 0` computes to 3.74:1 — every other theme's danger clears 4.5+ except this one. Amber is narrow-gamut by design (warm-only palette) so a red danger accent is inherently harder to separate from the amber/orange p1/p2/cta cluster; this is the specific token where that tradeoff actually crosses the line for normal-size text. Computed from CSS values.

**Fix:** nudge amber's danger red brighter/cooler (e.g. toward `230 45 55`) to clear 4.5:1 without reading as another amber hue.

### 6. Presence dot is color-only (Medium)
`src/components/InviteFriendModal.jsx:72` — `` `bg-retro-win` : `bg-retro-dim` `` on a bare 2.5×2.5 dot, no `aria-label`, no icon, no text. This is the platform-chrome instance of the color-only pattern the game-specific reviews already found in Pong's power-ups and several board pieces (Reversi/Hex/Connect Four/Gomoku/Order & Chaos) — worth naming because it shows the pattern isn't confined to gameplay, it's also in the social/chrome layer. A colorblind player (or anyone glancing quickly) can't tell "friend is online" from "friend is offline" without close attention to a tiny saturation difference.

**Fix:** add a filled/outline ring difference or a text `title`/`aria-label` ("Online"/"Offline") on the dot.

### 7. Buttons have no themed focus style (Low)
Every one of the 22 `focus:` occurrences found app-wide is on a text `<input>` (`focus:outline-none focus:border-retro-p1`, consistently applied and genuinely well executed — one pattern, auto-themed via the `p1` token, used identically in `Onboarding.jsx`, `GamePicker.jsx`, `Profile.jsx`, `Friends.jsx`, `Home.jsx`, etc.). Zero buttons anywhere carry a custom `focus-visible:` class, so every button's focus ring is whatever the browser's UA stylesheet supplies — functional, but the one interactive-state that *isn't* wired into the theme system in an app whose entire premise is theme-driven color. Low severity because it's still visible and functional in every theme (just not on-brand).

### 8. Reduced motion: CSS is respected, JS-staged sequences are not fully (Medium)
`src/index.css:478-486` globally neutralizes `animation-duration`/`transition-duration` — this is real and correctly implemented (confirmed already in `MOBILE-UX-AUDIT.md:180` for WinEffect's CSS keyframes/CRT scanline). What it *cannot* reach: `ArcadeLoader.jsx` marquee/blink timers, `WinEffect.jsx`'s `setTimeout(onDone, isMatch ? 2600 : 1800)` gate, and `ChainReactionBoard.jsx`'s three `setTimeout` calls (lines 99, 123, 132) that stage the cascade reveal cell-by-cell. These are JS-driven wall-clock sequences, not CSS animations, so `prefers-reduced-motion` doesn't shorten or collapse them — a reduced-motion player still watches Chain Reaction's cascade play out over the same real time, just as a series of instant snaps instead of a smooth animation (each individual step's CSS easing *is* neutralized, only the staging isn't). Net effect is better than "ignored entirely" but not the same as true reduced-motion (which should collapse to near-instant, not "same duration, no easing").

**Fix:** gate the `setTimeout` delays themselves behind a `matchMedia('(prefers-reduced-motion: reduce)')` check (already imported/used nowhere except `TouchCoachmark.jsx`, `GameStatus.jsx`'s CSS-only reliance, and `auth.js`) and collapse cascade staging to a single state update when set.

### 9. Mute/Unmute `aria-label` is on the `<svg>`, not the `<button>` (Low — needs render check)
`src/components/NavBar.jsx:79,85` — `<svg ... aria-label="Unmute">` / `aria-label="Mute"` inside a `<button>` with no label of its own. Whether this reliably becomes the button's accessible name depends on the browser/AT's accessible-name computation for a plain `<svg>` with no `role="img"` — inconsistent enough across engines that this needs an actual screen-reader check, not a markup read. Cheap, unambiguous fix regardless: move `aria-label` to the `<button>`.

## What's missing (not just what's broken)

- **No skip link.** `skip-links` (dataset, `ux` domain) — none of the sampled pages have a "skip to game board" affordance; with a persistent header + banner stack on some pages (`ProposalBanner`, `OfflineNotice`), a keyboard user re-tabs through chrome on every route.
- **No dedicated reduced-motion audit surface** — nothing in the app tells a `prefers-reduced-motion` user what changed; not required, but the loader family (`ArcadeLoader`) could offer a static variant explicitly rather than relying on the CSS override alone (see #8 — it only gets you partway there for JS-timed sequences).
- **No visible-focus story for buttons at all** (see #7) — not broken, but an opportunity: the app already themes everything else per `--c-*` token; a `focus-visible:ring-2 focus-visible:ring-retro-cta` utility class applied globally to `button, a, [role=button]` would close this in one shared rule rather than 76+ per-component fixes.
- **No colorblind-simulation pass has evidently been run** — the accumulation of per-game color-only findings across today's four game reviews plus the chrome-level instance here (#6) suggests this was never checked systematically; worth one dedicated pass rather than fixing them one at a time as they're noticed.

## Well built — one line each

- `BottomSheet.jsx` — Escape/backdrop/drag-to-dismiss, safe-area padding, `role="dialog" aria-modal`, swipe gesture with a real pointer-capture drag — genuinely solid modal primitive apart from the focus trap gap (#3).
- `GameStatus.jsx` — turn state, win/loss, and "GO AGAIN" all pair color+glow with actual text, never color alone; `useBusy` wired correctly on every CTA (synchronous guard before await, disabled state, gerund label).
- `DotsAndBoxesBoard.jsx` edge hit-targets — deliberately extended via absolute-positioned invisible padding beyond the visible line, a real touch-target fix already in place (not what `MOBILE-UX-AUDIT.md:M-09` measured as too small, which was the vertical-edge dimension, not this horizontal one — worth re-checking M-09 against current code).
- `GameCard.jsx` favorite toggle — `aria-pressed`, `aria-label`, `aria-hidden` on the decorative SVG, and fill-vs-outline shape difference (not color-only) — a model instance of the pattern #6 should follow.
- Input focus pattern (`focus:outline-none focus:border-retro-p1`) — one consistent, auto-themed idiom reused identically across ~15 files.
- `prefers-reduced-motion` global kill-switch (index.css:478) — real, correctly scoped, confirmed effective for CSS-driven motion (see #8 for its actual limit).
- Font: self-hosted `woff2` with `font-display: swap` and a trimmed `unicode-range` — no FOIT, no third-party round-trip.

## Structural vs needs-render-or-measurement

**Structural certainties (read from source, no rendering needed):** #1, #2, #4, #5, #7, #8, and the `--c-border`/`--c-card` non-text ratio (#10) — all computed directly from `src/index.css` RGB values or grep-confirmed absence of code paths.

**Need a rendered/AT check to confirm:** #3 (actual Tab-order escape behavior varies by browser's `aria-modal` handling), #9 (accessible-name computation for `aria-label` on a child `<svg>`).

## Sourcing

Dataset-cited (via `ui-ux-pro-max` search, `--domain ux`): `color-contrast`, `focus-states`, `focus-appearance`, `color-not-only`, `reduced-motion`, `aria-labels`. Own judgement, marked inline: the mono-theme token-collision finding (#4), the modal focus-trap gap (#3, WCAG 2.4.3/2.1.2 general practice — no exact dataset rule id matched), the app-wide button focus-style gap (#7), and the border-on-card non-text-contrast note (#10, flagged but not confirmed load-bearing).
