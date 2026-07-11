# Mobile UX Audit — Game Night

A dedicated **mobile UX audit** of the platform, performed July 2026 with the catalog at **31 games across 6 categories**, evaluated as a first-time user on modern phones (iPhone SE 375×667 · small Android 360×800 · iPhone 15 Pro 393×852 · Pro Max 430×932, portrait and landscape). Scope is strictly the mobile experience: thumb reach, tap targets, touch gestures, keyboards, scrolling, overlays, motion, density, navigation. Not code quality, performance, or accessibility compliance except where it visibly degrades the phone experience.

This is the successor to `UX-IMPROVEMENTS.md` (general UX, fully implemented). Findings here are new, or residual mobile-specific weaknesses in already-shipped fixes. Prior-audit items are referenced as F-xx; this audit's findings are **M-01…M-92** (full catalog at the bottom of this document).

**Method.** Fourteen specialist auditors each swept one beat (home/discovery, room flow, all 11 turn-based boards, the 5 real-time arenas, solo skill games, word/party games, social pages, PWA shell, navigation flows, tap-target inventory, overlays/motion, forms/keyboard, consistency, responsive/density), reading the actual source and computing rendered sizes from Tailwind classes. A completeness critic then identified four under-covered surfaces (Pig, Mental Math, the friends leaderboard, the modal-vs-sheet question) and follow-up auditors filled them. After semantic dedup, **every finding was adversarially verified by an independent reviewer instructed to refute it against the cited code**: 137 raw findings → 97 unique → **92 verified** (5 refuted and discarded). Severity and effort below are post-verification calibrations. Two findings were additionally hand-verified in source before being headlined as Critical.

**Severity:** Critical = blocks a core mobile flow / game unplayable on a phone · High = significant friction on a common path · Medium = noticeable friction or missed platform convention · Low = polish.
**Effort:** Low = under a day · Medium = days · High = a week-plus or structural.

---

## Executive summary

The platform is **mobile-aware, but not yet mobile-first** — and the gap between those two is exactly what separates "responsive website" from "native-feeling game platform."

The aware part is real, and better than most web games ship: safe-area insets are respected across every piece of top chrome, `touch-action: manipulation` and transparent tap-highlights kill the classic mobile-web jank, the body uses `100svh`, every board move fires a synchronized haptic pulse, invites go through the native share sheet with QR and clipboard fallbacks, all five real-time arenas set `touch-none` on their courts, Connect Four's tap target is the whole column, and newer components (LetterKeyboard height, NumberPad, Pig's ROLL/BANK, the avatar arrows) hit 44–48px exactly. Somebody here cares about phones.

But the audit found four structural problems that no amount of per-screen care fixes:

1. **Two games are effectively broken on touch.** Word Duel's word-setting phase — the opening of *every round* — is only wired to a physical keyboard; a phone player is stuck at "PICK A WORD" forever (M-02, a ~3-line fix). Space Duel's four combat buttons render ~14px tall and span the full screen width, demanding simultaneous touches in both thumb zones (M-01). Both almost certainly survived because two-desktop-tab testing is the norm — which is itself the finding: **nothing ships without a phone test.**
2. **A tap-target debt of ~30 controls.** The 44px floor is enforced in the newest components and ignored everywhere older: category chips (~24px), skill-game START/SUBMIT/PLAY AGAIN (~27–36px), friend accept/decline/remove (~23px, remove is destructive with no confirm), modal ✕ buttons (~18px), header icons (~24–32px), exit links (~14px text), Connect Four Pop's signature strip (20px), Gomoku's cells (~20px), Dots & Boxes edges (32px in the deciding dimension). Individually small; together they're the texture of "desktop site on a phone."
3. **The OS's own gestures fight the product.** Android back closes the *room*, not the modal (M-06). An iOS edge swipe mid-Pong silently ejects a player from a live P2P match (M-22). Pull-to-refresh can reload — and thus kill — a WebRTC match (M-21, a one-line CSS fix). Nothing pushes history state, nothing guards navigation, nothing contains overscroll. This is the single clearest "web page, not app" signal a phone user gets.
4. **The interaction chrome is desktop-shaped.** All five overlays are centered dialogs with tiny corner ✕'s — not bottom sheets (M-73, and they share one literal markup pattern, so it's a single-primitive swap). Navigation lives in the top corners — the worst thumb zone — and the prior audit's own stated trigger for a bottom tab bar (4+ real destinations) has now been met (M-62). Turn status and end-of-round CTAs render below the board, at fold risk on exactly the densest boards (M-43).

The good news is the shape of the fix list: **60 of 92 findings are Low effort**, and the two worst items include the single cheapest fix in the entire audit. A focused week eliminates both Criticals, the iOS input auto-zoom, the pull-to-refresh hazard, and most of the tap-target debt. The structural work — bottom-sheet primitive, back-gesture integration, bottom tab bar, a touch-input kit for the arcade games — is what turns the platform from "plays fine on a phone" into "feels built for one."

---

## Mobile UX scorecard

| Dimension | Score | Rationale |
|---|:---:|---|
| Navigation | **6/10** | Consistent NavBar on meta pages and 1-tap Home→game, but primary nav is pinned to top corners (stretch zone), there's no persistent nav in-game, three different "go home" patterns coexist (M-69), and the bottom-tab-bar threshold set by the prior audit has been met without follow-through (M-62). |
| Gameplay (touch feel) | **5/10** | Haptics on every move, full-column Connect Four targets, chunky Simon/Chimp/NumberPad — genuinely good. But two games are broken on touch (M-01, M-02), Gomoku/UTTT/D&B/letter keyboards all miss the 44px bar, Snake/Tron demand a lift-and-retouch per turn (M-17), and there's zero feedback when tapping out-of-turn (M-15). |
| Discoverability | **8/10** | The strongest dimension, thanks to the prior audit: search, ALL view, favorites, recents, NEW badges, per-card rules. Remaining: no sticky filter bar mid-scroll (M-42), no catalog state restoration (M-82), two stacked modals before the two most iconic games (M-13). |
| Touch interactions | **5/10** | The `p-3 -m-2` invisible-hit-area trick and `h-11`/`h-12` floors exist in newer code but were never swept across the app; ~30 controls sit under 44px. No swipe-to-dismiss on any overlay (toasts excepted), no back-gesture integration, destructive actions fire unconfirmed (M-19). |
| Readability | **6/10** | The neon-on-dark palette is high-contrast and the retro identity is strong, but the pixel font is routinely pushed below legibility: 8px control legends, 9px chips, 8px W-L records, a 6px timer sliver (M-27), 20px dice history (M-71). Pixel fonts need ~10px+ to survive a phone at arm's length. |
| Responsiveness | **6/10** | Portrait phones are genuinely well handled (`svh`, safe-areas, `max-w` capping, flex-wrap in party lobbies). Landscape is unhandled for the five games most likely to be rotated (M-05), Ultimate TTT caps itself below its own registry allotment (M-30), and Math/Typing/Hangman risk pushing their input below the fold on 667px viewports (M-26, M-52, M-54). |
| Visual hierarchy | **7/10** | One CTA language (cta-yellow + neon glow + active:scale) reads instantly across 20+ screens. Weaknesses: turn status and end-of-round CTAs render below the board at fold risk (M-43), and p2-pink doubles as both "Player O" and "error" (M-86). |
| Consistency | **7/10** | 75 recorded strengths describe a real system: one modal vocabulary, one loader family, one icon style, shared board animations. Divergences are enumerable rather than endemic: toast voice splits ALL-CAPS vs sentence case (M-70), three empty-state treatments (M-85), mixed header icon hit-areas (M-29). |
| **Overall experience** | **6/10** | A strong, characterful mobile web app with excellent bones and real mobile craft in its newest layers — held back by two broken games, a sub-44px long tail, desktop-pattern overlays, and zero OS-gesture integration. The distance to "premium mobile-first" is well-defined and mostly Low/Medium effort. |

---

## Top 25 issues, ranked by impact

Rank weighs severity, how often a real player hits the problem, and how central the moment is to the core loop. Full detail for every item is in the catalog below.

| # | ID | Sev | Effort | Issue |
|---|----|-----|--------|-------|
| 1 | M-02 | Critical | Low | Word Duel's word-setting phase is untypeable on touch — the game is unplayable on a phone, every round |
| 2 | M-01 | Critical | Medium | Space Duel's combat controls are ~14px tall and span both thumb zones at once |
| 3 | M-11 | High | Low | Every text input in the app is under 16px → iOS force-zooms on every single typing moment |
| 4 | M-22 | High | Medium | No guard against browser back / iOS edge-swipe mid-game — accidental ejection from live P2P matches |
| 5 | M-06 | High | Medium | Android back gesture closes the room, not the open modal — no history integration on any overlay |
| 6 | M-03 | High | Medium | Hangman & Word Duel on-screen keyboards render ~20–34px keys (flagged independently by 5 auditors) |
| 7 | M-15 | High | Medium | Boards give zero feedback when it's not your turn — blocked taps are silent on every 2P game |
| 8 | M-08 | High | Low | START / SUBMIT / PLAY AGAIN compute to ~27–36px across all six skill games — the highest-repetition taps in the app |
| 9 | M-13 | High | Medium | Two stacked full-screen modals before a room exists for Tic Tac Toe and Connect Four — the likeliest first taps in the product |
| 10 | M-21 | High | Low | No `overscroll-behavior` anywhere — pull-to-refresh can reload (and kill) a live real-time match |
| 11 | M-04 | High | Medium | Gomoku's 15×15 grid renders ~20px cells — a fingertip covers 4–6 of them, in a game with no undo |
| 12 | M-09 | High | Medium | Dots & Boxes edges are 32px in the dimension that disambiguates adjacent lines; mis-taps gift boxes, no undo |
| 13 | M-17 | High | Medium | Snake & Tron require a full lift-and-retouch swipe per turn — touch players are structurally slower than keyboard opponents |
| 14 | M-24 | High | Medium | Rules/Invite modals don't pause real-time matches — physics keeps running invisibly behind the backdrop |
| 15 | M-16 | High | Medium | SOS & Order-and-Chaos force a sub-44px letter picker, detached below the board, before every move |
| 16 | M-10 | High | Low | Connect Four Pop Out's signature pop strip is 20px tall — under half the minimum |
| 17 | M-14 | High | Low | Category & filter chips (~24px) — the primary control for narrowing 31 games |
| 18 | M-19 | High | Low | Friend accept/decline/remove/invite ~23px; remove is destructive with zero confirmation |
| 19 | M-62 | Medium | High | The prior audit's stated trigger for a bottom tab bar has been met; nav is still top-corner and absent in-game |
| 20 | M-73 | Medium | Medium | All five overlays are centered desktop dialogs; one shared bottom-sheet primitive would convert them in a single swap |
| 21 | M-12 | High | Low | No autocorrect/autocapitalize suppression on bluff/secret-word inputs — the OS silently rewrites the player's exact words |
| 22 | M-26 | High | Medium | Mental Math's NumberPad shifts position every question and can start below the fold on short phones |
| 23 | M-20 | High | Medium | No challenge button on the Friends list — playing a specific friend takes a four-screen detour |
| 24 | M-07 | High | Medium | Google upgrade uses popup-only auth — a known failure mode inside installed iOS PWAs |
| 25 | M-25 | High | Low | Pig's ROLL renders fully enabled but silently no-ops until the dice-seed handshake completes — every round's first tap |

Just outside: M-05 (landscape arenas overflow), M-23 (Home's fixed corner icons occlude scrolling content), M-18 (Aim Trainer targets can spawn overlapped), M-27 (Math's 6px timer + silent timeouts), M-29 (header icon sweep).

---

## Top 10 quick wins (each ≤ 1 day)

1. **M-02 — Make Word Duel playable:** render the existing `<Keyboard>` component in the setting phase wired to `handleSettingKey`. A Critical fixed in ~3 lines.
2. **M-11 — Kill iOS input auto-zoom globally:** one base-layer rule, `input, textarea { font-size: 16px }` (keep the small pixel look via a scaled inner wrapper where it matters).
3. **M-21 — `overscroll-behavior-y: contain` on `html, body`:** one line; pull-to-refresh can no longer nuke a live match.
4. **M-12 — `autoCorrect="off" autoCapitalize="off" spellCheck={false}`** on the Hangman word/hint, Fibbage lie, and Wavelength clue inputs.
5. **M-10 — Connect Four Pop strip `h-5` → `h-11`:** a one-class change on the variant's signature mechanic.
6. **M-08 — Pad the skill-game CTAs to 44px:** RetroButton + START/SUBMIT get `py-3`+; six games improve at once.
7. **M-14 — Grow category/filter chip hit boxes to 44px** using the same invisible-extension trick the favorite star already uses.
8. **M-19 — Friends actions to 44px + confirm on remove:** padding bump plus a tap-to-confirm state or UNDO toast before `removeFriend()` commits.
9. **M-25 — Disable Pig's ROLL until `diceSeed` exists,** with a brief "SHUFFLING…" label — removes a dead-button moment from every round's start.
10. **M-34 — Toast safe-area offset:** pass `mobileOffset={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}` to the Toaster so toasts clear the home indicator.

(Another dozen Low-effort items are batched into the Immediate roadmap below — notably the header/✕/exit-link 44px sweep M-29–M-33 and the autoFocus keyboard-pop removal M-28.)

---

## Roadmap

### Immediate (this week — all Low effort)

The ten quick wins above, plus one themed sweep and three singles:

- **The 44px sweep (M-29, M-30, M-31, M-32, M-33):** apply the existing `p-3 -m-2` hit-area pattern to every in-room header icon, every modal ✕, every "← HOME" exit link, and the NavBar/ThemeSwitcher/mute cluster. One afternoon, ~15 controls, and the whole app stops feeling fiddly.
- **M-28:** remove `autoFocus` from the six inputs that pop the keyboard over their own instructions.
- **M-27:** give Math timeouts the same feedback as wrong answers (reuse the WRONG panel + a buzzer), and thicken the 6px timer.
- **M-23:** give Home's fixed corner controls a real bar (or matching top padding on the content column) so catalog content stops scrolling underneath them.

### Short-term (2–6 weeks — the mobile-native layer)

- **M-01:** redesign Space Duel's touch scheme — movement cluster bottom-left, thrust/fire bottom-right (twin-stick convention), all ≥44px, below the arena rather than over it.
- **M-17:** continuous hold-to-steer (virtual D-pad/joystick zone) for Snake and Tron alongside swipe.
- **M-03:** stretch both letter keyboards to fill available width (Wordle's `flex-1` key pattern).
- **M-09 / M-16 / M-04:** Dots & Boxes hit extension to ±15px; anchor SOS/O&C's letter picker at the board edge at 44px with an armed-letter badge; give Gomoku a dense-board strategy (edge-to-edge + scroll with raised min cell size, or tap-then-confirm crosshair).
- **M-15 / M-47 / M-48:** turn-state dimming + "NOT YOUR TURN" shake/toast on blocked taps; a persistent last-move marker on every board; a "GO AGAIN!" pulse for D&B/SOS extra turns.
- **M-06 + M-22:** a shared `useModalHistory()` hook (overlays close on back-gesture) and a pushState trap + confirm on leaving `/game/:gameId` while `status === 'playing'`.
- **M-73:** build the one bottom-sheet primitive (drag handle, swipe-down dismiss, snap points) and swap all five overlays onto it — they already share identical markup.
- **M-13:** one-tap room creation for Tic Tac Toe / Connect Four; demote VS-AI and variants to secondary affordances on the card.
- **M-24 / M-05 / M-18 / M-26:** pause-awareness (or live score on the backdrop) for real-time games under modals; landscape layouts for the five arenas; Aim Trainer spawn distance check; Math layout stabilization (drop the duplicate PlayerCard grid, fixed-height feedback slots).
- **M-20 / M-63:** a PLAY button on online friend rows driving the existing create+invite flow; a persistent invite badge so a missed toast isn't a lost invite.
- **M-07:** `signInWithRedirect` fallback for standalone/mobile in the Google upgrade flow.
- **M-49:** one-time control coachmarks during real-time countdowns (animated swipe/drag/tap glyph per game).

### Long-term (the mobile-first redesign)

- **M-62 — Bottom tab bar:** Home / Daily / Friends / Profile, persistent everywhere including (collapsed) in-game. This is the single largest "feels native" unlock and the prior audit's own threshold for it has been met.
- **M-43 — Post-match as a sticky bottom action bar** (rematch / switch / share / next suggestion) independent of board height — the retention moment deserves the thumb zone, not the fold.
- **M-84 + M-67 — A motion system:** shared 150/250ms easing tokens, route-level transitions, entrance animation for outcome text; today half the app animates charmingly and the other half hard-cuts.
- **Touch-input kit for the arcade genre:** shared joystick/D-pad/twin-zone components with per-game calibration, replacing five bespoke control schemes.
- **Dense-board interaction model:** a reusable pinch-zoom/pan or crosshair-confirm layer for any board whose natural cell size falls below ~40px (Gomoku today; future large boards tomorrow).
- **The absent surfaces, deliberately:** there is no settings hub (theme/mute/install are scattered chrome), no notification center (invites die with their toast), and no achievements. Each is fine to skip — but skip by decision, not by drift; a bottom tab bar makes natural homes for the first two.

---

## What would make this feel like a premium mobile-first gaming platform

Bold moves, in the order I'd make them:

1. **Move the product's center of gravity to the bottom third of the screen.** Bottom tab bar, bottom sheets instead of centered dialogs, sticky bottom CTAs on results screens, toasts that respect the home indicator. Today every important control — nav, exit, rules, mute, modal dismissal — lives in the top corners, which is precisely where a thumb isn't. This is one coordinated change, not ten small ones, and it's the difference users can't articulate but always feel (Chess.com, Discord, and Spotify all converged on it for a reason).
2. **Treat touch as the primary input for the arcade genre, keyboard as the port.** Right now every real-time control scheme is a keyboard design with touch bolted on (swipe-per-turn Snake, 14px Space Duel buttons, an 8px control legend). Build the shared touch-kit — virtual joystick, hold-zones, twin-stick layout, first-touch coachmarks — and let Supercell's rule hold: if it needs a legend, it isn't done.
3. **Enforce the 44px floor and 16px input floor at the token level, not the code-review level.** One `<Button>` primitive with `min-h-11`, a base input rule, and a ban on interactive `text-[≤9px]`. The codebase already invented the right tricks (`p-3 -m-2`, `h-11`/`h-12`); promote them from folklore to system so the debt can never re-accrue.
4. **Make the OS gestures allies instead of landmines.** History-integrated overlays, a back-guard on live matches, overscroll containment, redirect-based auth in PWAs. A web app earns "native-feeling" mostly by never surprising the user's muscle memory.
5. **Give the platform a motion-and-haptics identity.** The haptic pulse on board moves is already best-in-class for a web game — extend it into a vocabulary (win, extra turn, timeout, streak) and pair it with a 2-token motion system and route transitions. Duolingo-level juice at Apple-Arcade restraint is fully achievable in CSS.
6. **Make the post-match screen the retention engine.** Sticky rematch bar, "your friend is still here" presence, next-game suggestion, share card, daily-streak hook — one screen, one design pass, outsized effect on session length (Marvel Snap's post-match bar is the reference).
7. **Wire the social graph into one-tap play.** Challenge from the Friends list, a persistent invite inbox, presence-aware "PLAY NOW" chips. The infrastructure (uids, presence, invites) all exists; it's a UX assembly job, and it's what makes a games platform feel alive rather than a collection of links.
8. **Institutionalize the phone test.** Both Criticals could only survive desktop-tab testing. Before any game ships: one full round played on a real phone, in Safari, one-handed. Cheapest QA rule in this document.

---

## What is already at the premium mobile bar

For calibration — the audit also recorded 75 strengths (condensed below). These are the patterns the fixes above should *extend*, not replace.

**Touch & haptics**
- Every board move triggers a synchronized haptic pulse (`navigator.vibrate`) alongside sound feedback, and several boards deliberately extend the hit area past the visual element — Connect Four's drop zones cover the full ~264px column height, Dots and Boxes edges extend ~32×61px past the visible line, and GameCard's favorite star enlarges via `p-3 -m-2`.
- Real-time arenas favor gesture/drag input over small buttons: Pong's full-surface drag paddle (`setPointerCapture`), Snake/Tron's swipe-anywhere controls, and Reaction Time's full-card hit target with zero dead zones.
- App-wide `touch-action: manipulation` + transparent tap-highlight, plus consistent `touch-none` on every real-time arena's court, remove the 300ms tap delay and stop drag controls from hijacking page scroll.

**Safe areas & viewport**
- `max(Xrem, env(safe-area-inset-*))` is applied consistently for notch/home-indicator clearance across Home's corner chips, NavBar, Game shell headers, and Onboarding — the one near-miss is UpdatePrompt.
- Body uses `min-height: 100svh` (not naive `100vh`), correctly anticipating iOS Safari's dynamic toolbar; RulesModal caps at `max-h-[80vh]` with `overflow-y-auto` so long rule text stays reachable on short viewports.

**Mobile share/invite flows**
- Invite and share flows consistently use native `navigator.share` with fallbacks — WaitingRoom's trio (share/clipboard/QR/direct friend-invite) and Daily Challenge's canvas-drawn image + embedded QR code — genuinely best-practice mobile sharing, no manual copy-paste required.
- Friend-code COPY has a real clipboard (`execCommand`) fallback plus consistent toast confirmation; party lobbies (Wavelength/Fibbage/Spyfair) auto-join by link with host-gated START and no manual "ready" toggle.

**Controls that already hit the 44px bar**
- Dice's ROLL/BANK and NumberPad's digit keys are true `h-12` (48px) with generous width — the best-sized primary controls in the app, reused consistently across Mental Math and Daily Challenge.
- Simon's 2×2 pad (~154px squares), Visual Memory/Chimp's 4×4/5×5 tile grids (~58–68px), and Chain Reaction/Order & Chaos's ~47-53px cells all stay comfortably above 44px despite dense grids.
- Sumo's PUSH button (`px-10 py-4`) and AvatarCustomizer's arrows (exactly `w-11 h-11`) are precisely sized; GameCard's ~40px favorite-star/rules-button corner controls coexist without colliding even on a ~165px-wide card at 375px width.

**Native input & forms**
- Number Memory's recall field uses a real `<input inputMode="numeric">` with a digit-only filter instead of a custom keypad, invoking the OS's native numeric keyboard.
- Mental Math's custom NumberPad avoids native-keyboard viewport reflow entirely, skips the ~300ms tap delay via `onPointerDown+preventDefault`, and grays out immediately on submit for clear feedback.
- WordSetter live-uppercases input while typing (no need to hit shift/caps on mobile); no `onPaste` blockers exist anywhere, and inline (non-modal) validation is used consistently across every party-game entry form.

**Loading, motion & theming**
- An inline boot script sets `data-theme` from localStorage before first paint, eliminating theme-flash across all 6 themes; `prefers-reduced-motion` correctly overrides even inline animation shorthand (WinEffect confetti/flash, CRT scanline).
- Shared animation keyframes (place-pop, disc-drop) are reused verbatim across 6+ independently built boards; ArcadeLoader/PixelDots give every wait moment a cohesive branded feel, and Sonner toasts stay on-brand via the same `--c-*` theme vars.
- WinEffect's confetti overlay is `pointer-events-none` so it never blocks taps on PLAY AGAIN/SHARE underneath; Dice's bust feedback is multi-modal (distinct color + shake keyframe), not color alone.

**Trust & recovery**
- Consistent commit-reveal cheat-detection with a dedicated CheatScreen (Hangman/Two Truths/Bluff/Wavelength/Word Duel) builds real trust in a genre usually taken on faith.
- Stuck-round escape hatches (CONCEDE/RESET ROUND/END ROUND) and a 120s-offline abandoned-opponent banner (CLAIM WIN/INVITE A FRIEND/SAVE & GO HOME) recover play instead of stranding a room.
- Seat reclaim via Firebase Auth uid means a dropped connection never loses your seat, and a `moveInFlight` ref blocks double-submit races from fast double-taps.
- Consent-based rematch/switch handshake keeps both players in sync without navigating away; all 5 real-time games unify connection state (CONNECTING/FAILED+RETRY/countdown) through one RealtimeOverlay and each ships a matching vs-AI /demo reusing the same arena/control hook, so players rehearse the real gesture before a live match.

**Consistency across the system**
- All overlay components (RulesModal, GameSwitcher, ModeChooser, VariantChooser, InviteFriendModal) share one literal markup/interaction vocabulary — backdrop-tap-close, Escape, stopPropagation — a bounded, low-risk path to one shared primitive.
- The primary CTA style (`bg-retro-cta … shadow-neon-cta active:scale-95`) is used near-identically in 20+ files, and header icons share one consistent feather-icon style.
- Opponents are always shown by real display name (never an anonymized slot), and solo /demo mode is explicitly labeled "VS BOT"; Profile/Friends/Daily/404 share one consistent, safe-area-aware NavBar.

**Responsive layout & discoverability**
- Home's search + sectioned scroll + FAVORITES rail + NEW/+MODES badges give genuine one-thumb discoverability across 31 games; GamePicker is the hero section 1 tap away, with ModeChooser cleanly branching PLAY A FRIEND vs VS AI.
- ContinuePlaying/RecentlyPlayed render nothing when empty (no awkward placeholder) and show resumable rooms as a named rail (opponent avatar + status chip) instead of raw room codes.
- `flex-1 min-w-0 truncate` patterns (Friends list, Friends leaderboard, ContinuePlaying) degrade gracefully down to 360px width instead of overflowing, and `flex-wrap` handles variable-length content (category chips, 3–8 player rows) without horizontal overflow.
- `useInstallPrompt` correctly branches Android's native `beforeinstallprompt` flow from an iOS-specific manual Share-sheet hint, covering both major mobile install paths.

---

# Full findings catalog (M-01 – M-92)

All 92 verified findings, sorted by severity. Every finding survived an independent adversarial verification pass against the cited source; severities and efforts shown are post-verification calibrations.

## Critical (2)

### M-01 · Space Duel's touch controls are far under tap-target minimums and span both thumb zones at once

**Severity:** Critical · **Effort:** Medium · **Screen:** Space Duel — multiplayer + /solo demo · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The 4 on-screen buttons (◀ ▶ THR FIRE) have zero explicit padding/height; Tailwind preflight zeroes button padding, so height ≈ an 8px-font line (~12px) + a 1px border ≈ 14px tall, versus the 44px HIG minimum. They sit in one full-width row (grid-cols-4) spanning ~265–320px at phone widths.

**Why it hurts on mobile —** Competitive aiming requires holding turn+thrust while tapping fire — three simultaneous touches on ~78×14px targets spread across nearly the full screen width. A single thumb can't reach both ends; missed taps during frantic combat are near-certain, effectively breaking the core skill loop on a phone.

**Fix —** Cluster movement (turn L/R) to the bottom-left thumb zone and thrust/fire to the bottom-right (twin-stick convention), give every button a fixed min-h-11 min-w-11, and move the row below the arena so it doesn't overlay live gameplay.

**User benefit —** Players can actually steer and fire accurately one- or two-handed, matching keyboard players' precision instead of losing duels to fat-finger misses.

**Evidence:**
- `src/components/SpaceduelArena.jsx:65` — TouchButton: 'font-pixel text-[8px] rounded border ... flex items-center justify-center' — no height/padding utility classes
- `src/components/SpaceduelArena.jsx:169` — 'grid grid-cols-4 gap-1.5 p-1.5' touch-control row absolutely positioned over the arena's bottom edge
- `tailwind.config.js:1` — No custom fontSize/lineHeight scale; Tailwind preflight sets button padding:0, so text-[8px] content drives the button's rendered height

### M-02 · Word Duel's word-setting phase is untypeable on touch — the game is unplayable on a phone

**Severity:** Critical · **Effort:** Low · **Screen:** Word Duel — setting phase · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The 'setting' phase render has WordInput (display-only boxes) and a LOCK IN button but no on-screen Keyboard or <input>. The only way to fill settingWord is handleSettingKey, wired solely to a window 'keydown' listener.

**Why it hurts on mobile —** Every Word Duel round (not just the first) opens with this phase for both players. A touch-only phone has no way to type a letter here, so mobile players are stuck at 'PICK A WORD' forever — this is likely invisible in-house because manual testing uses two desktop browser tabs (both with physical keyboards).

**Fix —** Render the same <Keyboard onKey={handleSettingKey}> already built for the guessing phase during the setting phase too, feeding WordInput.

**User benefit —** Makes Word Duel playable at all on the device class most players actually use.

**Evidence:**
- `src/pages/WordDuelGame.jsx:495` — setting-phase render: WordInput + LOCK IN button, no Keyboard/input element anywhere
- `src/pages/WordDuelGame.jsx:587` — <Keyboard .../> is rendered only in the guessing-phase branch
- `src/pages/WordDuelGame.jsx:420` — handleSettingKey is only ever invoked from a window keydown listener

## High (25)

### M-03 · On-screen letter keyboards render well under the 44px tap-target minimum

**Severity:** High · **Effort:** Medium · **Screen:** Hangman guessing (LetterKeyboard) · Word Duel guessing (Keyboard) · **Reported independently by** 5 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** LetterKeyboard packs 26 keys into a 9-column grid inside a ~343px container (max-w-sm page minus p-4 padding), computing to ~34px-wide keys. Word Duel's Keyboard rows use an un-stretched flex row inside a centered column, leaving 100px+ of unused width and ~20px-wide keys.

**Why it hurts on mobile —** Both sit well under Apple/Material's 44px minimum on the exact devices most likely to mis-tap, and a wrong tap here has a real in-game cost (a life in Hangman, a wasted guess in Word Duel).

**Fix —** Stretch keyboard rows to fill available width (Wordle's justify-between/flex-1 key pattern) instead of shrink-wrapping to content.

**User benefit —** Fewer accidental mis-taps on the highest-frequency interaction in both games.

**Evidence:**
- `src/components/LetterKeyboard.jsx:21` — grid-cols-9 gap-1 max-w-[360px] px-1 → ~34px-wide keys at h-11 (44px tall)
- `src/pages/WordDuelGame.jsx:119` — flex gap-1 row, not stretched, inside an items-center column → ~20px-wide keys

### M-04 · Gomoku's 15×15 grid renders ~19–21px tap targets — half the usable minimum

**Severity:** High · **Effort:** Medium · **Screen:** Game Room — Gomoku board · **Reported independently by** 3 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** On 360–393px viewports the 15-column board resolves to ~19–21px square cells: container width (328–361px) minus p-4 page padding, minus p-2/border-2 board chrome, minus 14 gaps of 2px, divided by 15 columns.

**Why it hurts on mobile —** A fingertip contact patch (~40–50px) covers 4–6 adjacent cells; in a precision 5-in-a-row game a single wrong placement can lose the match with no undo, so mis-taps are frequent and costly — effectively breaking the mobile experience for this game.

**Fix —** Add pinch-zoom/pan so the board can render larger than the viewport, or a tap-then-confirm crosshair mode below a width threshold; let the board go edge-to-edge instead of sitting inside the standard card padding.

**User benefit —** Gomoku becomes reliably playable on phones instead of a coin-flip of accidental placements.

**Evidence:**
- `src/components/GomokuBoard.jsx:6` — w-full max-w-sm mx-auto ... p-2 overflow-x-auto ... gridTemplateColumns repeat(15, minmax(0,1fr)), minWidth 300px
- `src/lib/gomokuLogic.js:1` — GOMOKU_SIZE = 15
- `src/pages/Game.jsx:1131` — p-4 outer page padding (16px/side) leaves ≤361px for the board on a 393px viewport

**Verifier calibration —** Math confirmed: 393px viewport → p-4 page padding (32px) + board's own p-2/border-2 (~20px) + 14×2px gaps (28px) over 15 cols ≈ 20-21px cells, well under 44-48px target. But not "Critical/unplayable": board already has overflow-x-auto+minWidth scroll infra to build on, and default viewport meta allows native pinch-zoom as a stopgap. A simpler fix (raise cell minWidth so board scrolls, or drop outer padding for this board) is Medium effort, not the "add pinch-zoom" High-effort ask.

### M-05 · Realtime arena games overflow the viewport in landscape — no orientation-aware layout

**Severity:** High · **Effort:** Medium · **Screen:** /game/:gameId — Pong, Snake Battle, Tron, Sumo Arena, Space Duel · **Reported independently by** 3 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** Pong's court is aspect-ratio 3/2, and Snake/Tron/Sumo/Space Duel are 1/1, all capped at max-w-md (448px) but with NO landscape-specific sizing. The page stacks header (~24px) + PlayerCard row (~64px) + court + caption + offline notice, all in one vertical column with no height budget or orientation query anywhere in the codebase.

**Why it hurts on mobile —** In landscape (e.g. iPhone SE 667x375, 15 Pro 852x393), available height is only 375-430px, but a square 1/1 arena alone renders near its full 384-448px width as height, plus ~150px of header/score chrome — total exceeds viewport height, forcing a scroll during active touch-drag gameplay on the exact games (real-time reflex duels) where losing sight of the arena mid-play is disqualifying.

**Fix —** Add a landscape media query (or JS width/height check) that switches these 5 arenas to a row layout — score/header compacted to a thin bar, arena sized to fit available height (max-height: 100dvh minus chrome) rather than width.

**User benefit —** Players who naturally rotate to landscape for a reflex/twitch game (the platform's own genre framing) get a usable, fully visible arena instead of a half-cut-off court.

**Evidence:**
- `src/components/PongCourt.jsx:49` — aspectRatio: '3 / 2', width capped by max-w-md, no landscape variant
- `src/components/TronArena.jsx:45` — aspectRatio: '1 / 1' — same landscape overflow risk, worse (taller) than Pong
- `src/pages/Game.jsx:1131` — min-h-screen flex flex-col items-center p-4 wraps header+PlayerCard+arena in one vertical stack, no orientation handling

**Verifier calibration —** Confirmed no orientation query anywhere in index.css/components; math checks out (max-w-md 448px capped court + ~150-180px chrome exceeds 375-393px landscape height on iPhone SE/15 Pro). Not Critical: portrait (default/common path) is unaffected, and touch-none on the court blocks scroll during active drag, so it's a one-time framing problem, not scroll-mid-drag. Real High-severity friction for a niche but plausible orientation on real-time games.

### M-06 · No hardware/gesture back-button integration for any overlay

**Severity:** High · **Effort:** Medium · **Screen:** Global overlays · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** No file in src/ listens for popstate or pushes history state when a modal opens (verified repo-wide); RulesModal/InviteFriendModal/GameSwitcher/ModeChooser/VariantChooser only close via backdrop-tap, '✕', or Escape (desktop-only).

**Why it hurts on mobile —** Android's system back gesture — muscle memory for closing any overlay — instead navigates the underlying route. Opening 'Invite a friend' mid-match and swiping back exits the room entirely instead of closing the sheet.

**Fix —** Push a history entry when any overlay opens and close it on popstate instead of letting the route change; a shared useModalHistory() hook would cover all five overlay components at once.

**User benefit —** Back gesture behaves like every native Android app — closes the sheet, never silently abandons a live match.

**Evidence:**
- `src/components/RulesModal.jsx:35` — useEffect only wires Escape keydown; no popstate/history listener
- `src/components/InviteFriendModal.jsx` — no history/back-button handling anywhere in the file
- `src/components/GameSwitcher.jsx:25` — same Escape-only pattern, no popstate

### M-07 · Google account upgrade uses popup-based auth with no redirect fallback — a known failure mode on installed iOS PWAs

**Severity:** High · **Effort:** Medium · **Screen:** Profile (Account) · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** upgradeWithGoogle() always calls linkWithPopup/signInWithPopup, never signInWithRedirect. Firebase's popup flow is unreliable in iOS Safari standalone/home-screen-installed PWAs, where the popup opens in a disconnected browsing context and the auth result often never returns to the opener.

**Why it hurts on mobile —** CLAUDE.md documents PWA install as a supported, promoted mode (F-36); anyone who installs the app and later taps SIGN IN WITH GOOGLE from Profile risks a silently hanging or failing popup with no diagnostic beyond the generic error toast, undermining the entire cross-device trust pitch.

**Fix —** Detect standalone/PWA display mode (or just mobile UA) and fall back to signInWithRedirect for the upgrade flow; keep popup for desktop where it's reliable.

**User benefit —** Google sign-in actually completes for users on the app's own recommended installed-PWA setup.

**Evidence:**
- `src/lib/auth.js:79` — linkWithPopup(current, provider) — no redirect fallback
- `src/pages/Profile.jsx:152` — SIGN IN WITH GOOGLE button calls upgrade() → upgradeWithGoogle()

### M-08 · Primary CTAs (START / SUBMIT / PLAY AGAIN) compute to ~27–36px tall across all six skill games

**Severity:** High · **Effort:** Low · **Screen:** All six skill games (shared GameStatus + per-game START/SUBMIT) · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The RetroButton used for PLAY AGAIN/NEW MATCH on every result screen (px-6 py-2.5, text-xs) computes to ~36px tall; the START buttons in Aim Trainer/Math/Typing and the SUBMIT button in Number Memory (px-6/w-full py-2, text-[9-10px]) compute to ~27-28px — all under the 44px guideline.

**Why it hurts on mobile —** These gate the two highest-frequency taps in the entire beat — starting a round and replaying after it ends — for fast, high-repetition games played dozens of times per sitting; the shortfall compounds every round.

**Fix —** Increase padding (e.g. py-3+) on RetroButton, START, and SUBMIT so they clear ~44px regardless of font size, matching the LetterKeyboard's already-fixed h-11 pattern (F-37).

**User benefit —** Faster, more confident replays with fewer mis-taps at the exact moments these games are replayed most.

**Evidence:**
- `src/components/GameStatus.jsx:13` — RetroButton: 'px-6 py-2.5 ... font-pixel text-xs' ≈ 36px tall — used for PLAY AGAIN/NEW MATCH on every one of these result screens
- `src/pages/AimTrainerGame.jsx:284` — START button: 'px-6 py-2 ... text-[10px]' ≈ 28px tall (same pattern in MathGame.jsx:368, TypingGame.jsx:254)
- `src/pages/NumberMemoryGame.jsx:321` — SUBMIT button: 'w-full py-2 ... text-[9px]' ≈ 27px tall

### M-09 · Dots & Boxes edge targets are ~32px in their short dimension — a precision game with zero undo

**Severity:** High · **Effort:** Medium · **Screen:** Game Room — Dots & Boxes board · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Horizontal edges get an absolute hit-box of -top-[9px]/-bottom-[9px] inside a 14px grid row → 32px tall (width ~57.5px on a 360px viewport); vertical edges are the mirror image, 32px wide.

**Why it hurts on mobile —** 32px is under the 44px baseline in the dimension that disambiguates adjacent lines; because moves commit instantly to Firebase with no confirm/undo, a mis-tap can hand the opponent a free box in a game literally about tapping thin lines.

**Fix —** Widen the invisible hit extension from 9px to ~15px per side (still clear of the 57.5px box cells) and/or add a brief 'undo last edge' grace window before the write finalizes.

**User benefit —** Fewer accidental line placements in the one board game where a single mis-tap directly gifts the opponent points.

**Evidence:**
- `src/components/DotsAndBoxesBoard.jsx:46` — absolute z-10 -top-[9px] -bottom-[9px] left-0 right-0 — 14px row + 18px extension = 32px hit height
- `src/components/DotsAndBoxesBoard.jsx:78` — vertical edge mirrors: top-0 bottom-0 -left-[9px] -right-[9px] on a 14px column
- `src/components/DotsAndBoxesBoard.jsx:128` — gridTemplateColumns '14px repeat(4, minmax(0,1fr) 14px)' → box columns ≈57.5px at 360px viewport

### M-10 · Connect Four Pop Out's pop-column strip is 20px tall — under half the tap minimum

**Severity:** High · **Effort:** Low · **Screen:** Game Room — Connect Four (Pop Out variant) · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The secondary 'pop your own disc' row uses h-5 (20px) buttons across all 7 columns, versus the ~40px main drop targets directly above it.

**Why it hurts on mobile —** The pop action is the entire differentiator of this variant, yet at 20px tall — about one line of body text — thumbs will routinely miss or clip the neighboring column's pop button, since it sits directly under the primary drop grid.

**Fix —** Raise the strip to h-11 (44px); the page has vertical room since the strip only renders in Pop Out mode and nothing else is height-constrained there.

**User benefit —** The signature Pop Out mechanic becomes usable instead of a frustrating precision test.

**Evidence:**
- `src/components/ConnectFourBoard.jsx:63` — h-5 rounded-sm border ... ▼ pop buttons, one per CF_COLS(7) column, mt-1.5 pt-1.5 below the main grid

### M-11 · Every text input in the app renders under 16px, triggering iOS Safari auto-zoom on every field

**Severity:** High · **Effort:** Low · **Screen:** Cross-cutting: Home search/join-code, Onboarding name, Profile name, Friends code, WordSetter (Hangman), Game.jsx invite-name, NumberMemory, Fibbage, Wavelength, TwoTruths · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** No `<input>`/`<textarea>` anywhere sets font-size ≥16px. All use Tailwind text-xs (12px), text-sm (14px), or text-[8–11px] pixel-font classes, and there is no base-layer override forcing a 16px floor on form fields.

**Why it hurts on mobile —** Below 16px, iOS Safari force-zooms the whole page on focus — this fires on literally every typing moment in the app: the very first onboarding name field, every join code, every party-game prompt. Each tap-to-type triggers a jarring zoom-in, then zoom-out on blur.

**Fix —** Add a global `input, textarea { font-size: 16px }` (or Tailwind text-base minimum) rule for all form fields; keep the tiny pixel-font look via `transform: scale()` on an inner wrapper if the visual size must stay small.

**User benefit —** Stable, non-jumpy viewport on every text entry across the entire app — the single highest-frequency mobile web form bug, eliminated everywhere at once.

**Evidence:**
- `src/pages/Home.jsx:252` — JOIN CODE input: `font-pixel text-xs` (12px)
- `src/components/WordSetter.jsx:51` — Hangman word input: `font-pixel text-sm` (14px)
- `src/components/GamePicker.jsx:148` — SEARCH GAMES input: `font-pixel text-xs` (12px)

### M-12 · No autoCorrect/autoCapitalize/spellCheck control on any bluff or secret-word input

**Severity:** High · **Effort:** Low · **Screen:** Hangman word-setter · Fibbage lie · Wavelength clue · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** None of the inputs that carry a secret word, a bluff/lie, or a one-word clue set autoCorrect, autoCapitalize, or spellCheck — every one is a bare <input type="text"> using the OS keyboard's default predictive-text behavior.

**Why it hurts on mobile —** Predictive/auto-correct text can silently swap the exact word the player intended for a dictionary guess mid-type — directly undermining games whose whole mechanic depends on the precise wording the player chose (a bluff or clue that gets 'corrected' isn't the one they meant).

**Fix —** Add autoCorrect="off" autoCapitalize="off" spellCheck={false} to the Hangman word/hint inputs, the Fibbage lie input, and the Wavelength clue input.

**User benefit —** Guarantees the committed text matches exactly what the player typed, which the commit-reveal mechanic already assumes.

**Evidence:**
- `src/components/WordSetter.jsx:41` — word input has no autoCorrect/autoCapitalize/spellCheck attributes
- `src/pages/FibbageGame.jsx:445` — lie input — same gap
- `src/pages/WavelengthGame.jsx:482` — one-word clue input — same gap; an autocorrect swap can also trip the /\s/ one-word validator

### M-13 · Two full-screen modals required to start the platform's two most iconic games

**Severity:** High · **Effort:** Medium · **Screen:** Home — Catalog / Game Picker · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Tapping TIC TAC TOE or CONNECT FOUR (both solo:true with a hidden variant) opens ModeChooser, and choosing PLAY A FRIEND then opens VariantChooser — 3 taps and 2 stacked full-screen dark overlays before a room exists, even to get the default Classic mode.

**Why it hurts on mobile —** This is the single most likely first action a new visitor takes, on the two games everyone already knows. Two sequential full-screen transitions add real thumb travel and cognitive load to what should be a one-tap 'create room' action.

**Fix —** Make the card tap itself create a Classic/friend room directly; surface VS AI and variant picks as secondary affordances (e.g. a small +MODES chip or long-press) rather than gating every solo+variant game behind two sequential modals.

**User benefit —** One-tap room creation for the two most-played games in the catalog.

**Evidence:**
- `src/components/GamePicker.jsx:87` — handleTap: solo game with onSolo -> setModeGame (opens ModeChooser)
- `src/components/GamePicker.jsx:94` — handleModeFriend: if variantsFor(g.type).length -> opens VariantChooser (second modal)
- `src/components/ModeChooser.jsx:17` — fixed inset-0 z-50 full-screen overlay, first of two stacked modals

### M-14 · Category and filter chips sit well under the 44px tap-target minimum

**Severity:** High · **Effort:** Low · **Screen:** Home — Catalog browsing · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** CategoryTabs (ALL/BOARD/REFLEX/...) and the QUICK/THINKY/SOLO OK filter chips both use px-2.5 py-1.5 with 9px pixel-font text — roughly 24-27px tall — packed edge to edge with only an 8px gap, on the control used to narrow all 31 games.

**Why it hurts on mobile —** Well below the 44/48px Apple HIG / Material minimum on the platform's primary discovery control; seven adjacent pills (ALL·31, BOARD·9, REFLEX·9...) with an imprecise pixel font at 9px invite frequent mis-taps on exactly the gesture new users rely on most.

**Fix —** Grow the tap box to at least 40-44px tall (e.g. py-3) with gap-3 spacing, keeping the visible pixel label small — the same enlarge-hit-area-independent-of-visual-size trick already used for the favorite star.

**User benefit —** Fewer mis-taps switching categories/filters, the main way users narrow 31 games.

**Evidence:**
- `src/components/CategoryTabs.jsx:11` — 'px-2.5 py-1.5 rounded border font-pixel text-[9px]...' — ~24-27px tall button
- `src/components/GamePicker.jsx:162` — identical undersized classes reused for QUICK/THINKY/SOLO OK filter chips

### M-15 · Board gives zero visual or tactile feedback when it's not your turn

**Severity:** High · **Effort:** Medium · **Screen:** Mid-game board (all standard 2P games) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Disabled cells differ from active ones only via `cursor-pointer` vs `cursor-default` — a mouse-only signal invisible on touch. No opacity/dimming is applied, and a blocked tap silently returns with no toast, shake, or sound.

**Why it hurts on mobile —** Touch has no hover state to pre-sense a disabled control, so every tap either works or produces literally nothing. New or impatient players tap the board during the opponent's turn and get zero signal whether the app is frozen, laggy, or it's genuinely not their turn.

**Fix —** Apply opacity/grayscale + pointer-events-none to the whole grid when `disabled`, and fire a brief shake + toast ("NOT YOUR TURN") on a blocked tap so touch users get the feedback hover would give on desktop.

**User benefit —** Every tap gets instant confirmation it registered, removing "is this broken?" confusion during every opponent turn across every game.

**Evidence:**
- `src/components/Cell.jsx:16` — `isEmpty && !disabled ? 'hover:...cursor-pointer active:scale-95' : 'cursor-default'` — no opacity change for the disabled state.
- `src/components/ConnectFourBoard.jsx:41` — `!cell && !disabled && !colFull ? 'cursor-pointer' : 'cursor-default'` — same cursor-only distinction, no dimming.
- `src/pages/Game.jsx:649` — `if (game.currentTurn !== mySymbol.current) return` in handleMove — silent no-op, no toast/feedback on a blocked tap.

### M-16 · SOS and Order & Chaos force a 40px letter picker, physically detached from the board, before every move

**Severity:** High · **Effort:** Medium · **Screen:** Game Room — SOS & Order & Chaos boards · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Both boards require selecting S/O (or X/O) via w-10 h-10 (40px) buttons rendered mt-3 below the board, then tapping a cell — two taps at separate screen locations per move, and the picker itself is under the 44px minimum.

**Why it hurts on mobile —** Every one of up to 49 (SOS) or 36 (Order & Chaos) moves needs a thumb trip from the board's top rows down to a sub-44px control and back; with no active-letter indicator near the board, returning users can forget which letter is armed and place the wrong one irreversibly.

**Fix —** Grow the picker to 44px+ and anchor it directly at the board's edge (or as a floating segmented control), and echo the active letter as a small persistent badge near the board itself.

**User benefit —** Fewer wrong-letter placements and less thumb travel per move on the two board games with a selection step.

**Evidence:**
- `src/components/SosBoard.jsx:79` — w-10 h-10 rounded border-2 letter buttons, mt-3 below the ~300px board
- `src/components/OrderChaosBoard.jsx:73` — identical w-10 h-10 X/O picker pattern, mt-3 below the board

### M-17 · Snake and Tron require a full lift-and-retouch swipe for every turn — no continuous joystick drag

**Severity:** High · **Effort:** Medium · **Screen:** Snake Battle & Tron — multiplayer + /solo demo · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** useSnakeControls/useTronControls only read a direction on pointerup, computed from the delta since pointerdown; there is no pointermove handling, so each turn needs a discrete finger-lift-and-retouch of ≥16px displacement.

**Why it hurts on mobile —** In a 'frantic' real-time PvP category, consecutive turns (e.g. right then up) each cost a full release-and-retouch cycle, versus a single instant keypress for desktop opponents. Touch players are structurally slower to react in the exact genre that rewards reaction speed.

**Fix —** Add a continuous touch-and-hold virtual D-pad or joystick zone (thumb stays down, direction updates on drag) as an alternative to swipe, the way most mobile Snake/Tron clones implement steering.

**User benefit —** Touch players can chain direction changes as fast as keyboard players, removing an unfair skill penalty tied purely to input device.

**Evidence:**
- `src/hooks/useSnakeControls.js:37` — onDown records touchStart only; onUp computes dx/dy and sets pendingRef once — no pointermove listener, so mid-drag direction changes are impossible
- `src/hooks/useTronControls.js:37` — Identical discrete down/up swipe pattern, 16px threshold, one direction per gesture
- `src/components/SnakeArena.jsx:80` — Legend reads '↑ ↓ ← → · WASD · SWIPE' — swipe is the only touch scheme offered

**Verifier calibration —** Confirmed: both hooks bind only pointerdown/pointerup with 16px threshold, no pointermove; legend confirms swipe-only. Real mobile-specific reflex-game friction, severity High stands. Effort is overstated as High — a pointermove-based continuous-steer fix in these two small, near-identical hooks is contained, closer to Medium.

### M-18 · Aim Trainer's 40px targets can spawn on top of each other with no collision check

**Severity:** High · **Effort:** Medium · **Screen:** Aim Trainer (multiplayer + solo) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Targets are 40×40px circles (RADIUS=20), under the 44px minimum, and each player's target is placed by an independent random-position call with no check against the other player's current target — they can overlap or stack.

**Why it hurts on mobile —** Sub-44px targets already strain thumb precision; when the two targets land on/near each other the lower one is invisible and unreachable, so a normal tap can register as a −1 friendly-fire miss through no fault of the player.

**Fix —** Raise target radius toward ~24-28px and add a minimum-distance check on spawn so the two targets can't overlap or sit edge-to-edge.

**User benefit —** Fewer accidental misses/self-penalties — scores reflect aim skill, not screen geometry.

**Evidence:**
- `src/pages/AimTrainerGame.jsx:11` — const RADIUS = 20 — target rendered at width/height RADIUS*2 (40px) at line 192-193
- `src/pages/AimTrainerGame.jsx:127` — randomPos()/spawnTarget() (lines 115-136) pick x/y independently per player with no distance check vs the other target
- `src/pages/AimTrainerGame.jsx:280` — "SHOOT YOUR COLOR · MISS = −1 PT" — an occluded target turns an ordinary tap into an unavoidable penalty

### M-19 · Friend accept/decline/remove/invite buttons are ~22-25px tall — half the tap-target minimum, and "remove" is destructive with zero confirmation

**Severity:** High · **Effort:** Low · **Screen:** Friends / Invite Friend Modal · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Every social-action button (ACCEPT, DECLINE, remove-friend ✕, INVITE) uses px-2/px-2.5 + py-1.5 around 9px pixel-font text — roughly 22-25px tall, under half the 44px minimum. Remove-friend fires immediately on tap with no confirm dialog.

**Why it hurts on mobile —** These sit in scrollable list rows a user taps repeatedly; undersized adjacent buttons (accept 12px from decline) invite mis-taps, and an accidental tap on the remove ✕ silently deletes a friendship with zero undo — a real data-loss risk during normal one-handed scrolling.

**Fix —** Bump all action buttons to min-h-11 (44px) via padding; add a lightweight confirm step (e.g. tap-to-confirm state or a toast with UNDO) before removeFriend() commits.

**User benefit —** Fewer mis-taps, no accidental loss of friends, safer one-handed use in a scrolling list.

**Evidence:**
- `src/pages/Friends.jsx:147` — ACCEPT button: px-2.5 py-1.5 text-[9px] ≈ 23px tall
- `src/pages/Friends.jsx:193` — remove-friend ✕: px-2 py-1.5 text-[9px], onRemove fires with no confirm()
- `src/components/InviteFriendModal.jsx:64` — INVITE button: px-3 py-1.5 text-[9px], same undersized class

### M-20 · No "challenge" affordance on the Friends list — starting a game with a specific friend takes three hops instead of one tap

**Severity:** High · **Effort:** Medium · **Screen:** Friends · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Friend rows show only a presence dot and a remove ✕; there is no PLAY/CHALLENGE button. InviteFriendModal (the only way to invite a specific friend) is reachable exclusively from inside an already-created room (WaitingRoom.jsx/Game.jsx).

**Why it hurts on mobile —** To play a specific online friend, a user must leave Friends, pick a game on Home/catalog, create a room, then open "Invite a Friend" and find them again — friction on what should be the single most common action on this screen.

**Fix —** Add a one-tap PLAY button on each online friend row that opens the existing GamePicker/ModeChooser and creates+invites in one flow, mirroring the InviteFriendModal's list UI but entered from Friends.

**User benefit —** One-tap challenge to a specific online friend instead of a four-screen detour.

**Evidence:**
- `src/pages/Friends.jsx:181` — friend row: only presence dot + remove ✕, no play/challenge action
- `src/components/InviteFriendModal.jsx:9` — invite modal requires an existing gameId/gameType — only mountable from a live room

### M-21 · No overscroll-behavior anywhere — pull-to-refresh can reload a live real-time match

**Severity:** High · **Effort:** Low · **Screen:** App Shell — Real-time Game Pages (Pong/Snake/Tron/Sumo/Space Duel) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Every real-time arena correctly sets `touch-none` on its own court div to stop drag-to-scroll (PongCourt.jsx, SnakeArena.jsx, TronArena.jsx, SumoArena.jsx, SpaceduelArena.jsx), but there is zero `overscroll-behavior` anywhere in the app — the surrounding page can still rubber-band/pull-to-refresh.

**Why it hurts on mobile —** A stray downward swipe anywhere outside the court (reaching for the header, a scroll near the top of a taller layout) can trigger the browser's native pull-to-refresh, reloading the whole SPA — for the WebRTC-based real-time games this drops the peer connection entirely per the host-authoritative model, ending the match with no reconnect path described.

**Fix —** Add `overscroll-behavior-y: contain` (or `none`) globally on `html, body` in index.css, cheap and with no visual side effect.

**User benefit —** An accidental swipe near the top of the screen can no longer nuke an in-progress real-time match.

**Evidence:**
- `src/index.css:172` — body sets touch-action/tap-highlight but no overscroll-behavior anywhere in the file
- `src/components/PongCourt.jsx:46` — `touch-none` scoped only to the court div, not the page

### M-22 · No guard against browser back / iOS edge-swipe mid-game — accidental ejection from live matches

**Severity:** High · **Effort:** Medium · **Screen:** Game (/game/:gameId) — all game types, acute for real-time games (Pong/Snake/Tron/Sumo/Space Duel) · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** There is no popstate listener, useBlocker, or history guard anywhere in the app (grep for useBlocker/usePrompt/popstate returns nothing). The only CSS touch tuning is a global `touch-action: manipulation` on body, which does not intercept iOS's system edge-swipe-back gesture. Real-time games drive touch/drag input at the screen edges (paddle drag in usePongControls.js, directional swipes in Snake/Tron), the exact zone where iOS recognizes swipe-back.

**Why it hurts on mobile —** A player dragging a paddle or swiping near the left bezel in mobile Safari (the common case — most invited friends never install the PWA) can trigger the OS back gesture, instantly leaving the room with zero confirmation. For host-authoritative P2P games this silently drops the connection; the other player only finds out after the 120s abandon-timer, or the leaver's opponent can claim a win they didn't earn.

**Fix —** Add a lightweight guard on /game/:gameId: intercept popstate with a pushState trap + confirm before navigating away during 'playing' status, and increase edge touch-safe margins (or `overscroll-behavior-x: none` + edge padding) on real-time court/arena components.

**User benefit —** Prevents accidental match loss and opponent confusion — the single biggest risk to trust in the flagship real-time games.

**Evidence:**
- `src/pages/Game.jsx` — No popstate/useBlocker anywhere; '← HOME' Link (line 1135) navigates instantly, and it's the only recognized exit — an accidental gesture behaves identically with no user intent.
- `src/hooks/usePongControls.js:33` — pointerdown/pointermove drag captured directly on the court element, including near its horizontal edges, with no touch-action/overscroll containment.
- `src/index.css:172` — `touch-action: manipulation` on body — tunes tap latency/double-tap zoom only, does not block the OS edge-swipe-back gesture.

**Verifier calibration —** Confirmed: no popstate/useBlocker/beforeunload guard anywhere; body only has touch-action:manipulation (doesn't block edge-swipe-back); Pong court captures pointerdown/move with no edge containment; 120s abandon-timer real. Downgraded Critical→High: requires touch to hit narrow iOS edge zone, not every drag — real but conditional, not guaranteed unplayable.

### M-23 · Home's fixed corner nav icons have no scroll-clearance and occlude scrolling content underneath

**Severity:** High · **Effort:** Low · **Screen:** Home (/) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Home wraps its profile/friends (top-left) and theme/mute (top-right) controls in `fixed` divs with z-10, positioned at `top-[max(1rem,...)]`. The content column directly below starts at the same 16px offset with no compensating top margin, so as the (much-taller-than-viewport) page scrolls, these fixed icons stay pinned and visually sit on top of whatever scrolls beneath them — invite cards, the DailyTile/join-code row, etc.

**Why it hurts on mobile —** On a 375–430px phone the page is far taller than one screenful (logo, invites, utility row, how-it-works, ContinuePlaying, full catalog, RecentlyPlayed, stats). Interactive elements that scroll under the fixed row (e.g. the invite card's JOIN/dismiss buttons, which live near the same x-range) can be partially covered and steal or block taps during the very common 'scroll to browse the catalog' action.

**Fix —** Give the fixed corner controls a solid/blurred background bar spanning full width (like NavBar does elsewhere) or add scroll-aware top padding to the content column equal to the controls' height so nothing scrolls underneath them.

**User benefit —** Removes a subtle but real mis-tap/occlusion risk during normal catalog scrolling on every visit.

**Evidence:**
- `src/pages/Home.jsx:128` — `fixed top-[max(1rem,env(safe-area-inset-top))] right-...` z-10 controls with no in-flow spacer.
- `src/pages/Home.jsx:152` — Second fixed group (profile chip + friends icon), same offset, same lack of scroll clearance.
- `src/pages/Home.jsx:188` — Content column starts immediately with the logo at the same top offset — no margin-top added for the two fixed rows.

### M-24 · Rules/Invite modals don't pause real-time matches — they just hide them

**Severity:** High · **Effort:** Medium · **Screen:** In-room real-time games (Pong/Snake/Tron/Sumo/Spaceduel) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The shared header renders RulesModal/InviteFriendModal over active isCustom games whenever status !== 'waiting'; PongGame's host-authoritative rAF sim has no visibilitychange/pause handling anywhere in the file.

**Why it hurts on mobile —** Opening Rules or Invite mid-Pong-match covers the court with an opaque backdrop while physics keeps running underneath, invisibly — the opponent can score points the player has no way to see happening.

**Fix —** Gate Rules/Invite/Switcher behind status==='waiting' for real-time games, or surface a persistent live score readout on the modal itself so players know the match is still running behind it.

**User benefit —** No invisible points lost for reading the rules or inviting a friend mid-match.

**Evidence:**
- `src/pages/Game.jsx:1136` — RulesModal renders unconditionally whenever showRules is true, regardless of game.status or gameType
- `src/pages/Game.jsx:1154` — Invite button shown for any !isSpectator, including mid-play real-time games
- `src/pages/PongGame.jsx` — no visibilitychange/pause handling found in the file

### M-25 · Pig's ROLL button looks tappable but silently no-ops until the anti-cheat dice-seed handshake completes — every round

**Severity:** High · **Effort:** Low · **Screen:** Game Room — Pig (Dice) board · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** ROLL renders fully enabled (bright cta border, shadow-neon-cta, cursor-pointer, active:scale-95 press feedback) the instant it becomes the player's turn, but Game.jsx silently discards the tap until game.diceSeed exists — a value only set after a 3-4 step Firebase round-trip coin-flip protocol.

**Why it hurts on mobile —** X always moves first (currentTurn defaults to 'X') and the seed-establishment effect resets on every new round/rematch, so the very first ROLL tap of essentially every Pig session can silently fail with zero visual/haptic difference from a working tap — reads as 'the game is broken', worse on slower mobile/cellular RTDB round-trips.

**Fix —** In Game.jsx, fold `!game.diceSeed` into the disabled condition passed to DiceBoard for gameType 'dice' (alongside canMove), and show a brief 'SHUFFLING…' label or spinner on the button while the handshake is pending so the wait is visible.

**User benefit —** Removes a confusing dead-button moment at the very start of literally every Pig round, especially over slower mobile connections.

**Evidence:**
- `src/components/DiceBoard.jsx:143` — ROLL button styles/enables purely from the `disabled` prop (border-retro-cta, cursor-pointer) with no awareness of diceSeed readiness
- `src/pages/Game.jsx:677` — if (cfg.type === 'dice' && colOrIndex === 'roll' && !game.diceSeed) return  // silent no-op, no user-facing signal
- `src/pages/Game.jsx:1112` — const canMove = !isSpectator && game.status === 'playing' && game.currentTurn === mySeat  — never checks diceSeed, so disabled={!canMove} (line 1434) leaves ROLL visually active

### M-26 · NumberPad's screen position shifts every question and can fall below the fold on short phones

**Severity:** High · **Effort:** Medium · **Screen:** Mental Math — active round · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Game.jsx renders a full PlayerCard grid (1193-1212, ~56px+16px gap) duplicating names/scores already in MathGame's own ScoreBar (line 418) above the round. Below it, the question card's height changes every question (power banner 443-447; answered/CORRECT/WRONG/CHECKING panels 462-488) and the streak-badge row (423-436) mounts/unmounts, all before the un-anchored NumberPad (line 501).

**Why it hurts on mobile —** On a 375×667 iPhone SE, stacking header+PlayerCard+ScoreBar+question card+NumberPad+GameSwitcher approaches ~650-700px against ~600px of usable viewport, risking the pad starting off-screen; even when visible, its position moves under the thumb each question as blocks above resize, breaking tap muscle-memory during an 8s window.

**Fix —** Drop the redundant top PlayerCard grid for custom skill games (info is already in ScoreBar), and reserve fixed-height slots for the power banner/feedback panel so the NumberPad never moves once rendered.

**User benefit —** The keypad stays put and in view every question, so fast taps land where thumbs expect them instead of missing a moved key.

**Evidence:**
- `src/pages/Game.jsx:1193` — PlayerCard grid duplicated above MathGame's own ScoreBar, adding ~72px before the game area
- `src/pages/MathGame.jsx:423` — Streak badge row conditionally mounts, shifting everything below it mid-round
- `src/pages/MathGame.jsx:501` — NumberPad has no sticky/fixed position — it re-lays-out with every variable-height sibling above it

### M-27 · Per-question timer is a 6px sliver with no numeric/audio cue, and timeouts are completely silent

**Severity:** High · **Effort:** Low · **Screen:** Mental Math — active round · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** QuestionBar (58-70) is a 6px-tall bar (h-1.5, line 62) whose only urgency signal is a color swap at 60% and 30% thresholds (line 60) — no seconds counter, no sound. When time actually runs out, the timeout branch (224-230) silently calls advanceQuestion with zero sound or visual, unlike a wrong tap which gets sounds.miss() plus a red WRONG panel (317-321, 476-482).

**Why it hurts on mobile —** With eyes/thumb on the NumberPad below, a thin bar above the question is easy to miss; players get strong feedback for wrong answers but none for timeouts, so they can't tell why a question just changed and their score didn't move.

**Fix —** Reuse the existing WRONG panel pattern (a brief 'TIME'S UP' panel + short buzzer) for the timeout branch, and thicken/pulse the bar in its final 2 seconds.

**User benefit —** Every outcome — correct, wrong, or timed-out — gets equally clear feedback, removing confusion during fast-paced rounds.

**Evidence:**
- `src/pages/MathGame.jsx:62` — h-1.5 (6px) bar is the only visual timer, transition-all duration-100
- `src/pages/MathGame.jsx:226` — Timeout auto-advances with no sound/visual, unlike the miss()+red-panel path on a wrong submit
- `src/lib/sounds.js:53` — miss() sound only fires from handleSubmit's wrong branch, never from the timeout path

## Medium (46)

### M-28 · autoFocus pops the keyboard before players can read the on-screen prompt, across 6 party-game screens

**Severity:** Medium · **Effort:** Low · **Screen:** WordSetter/Hangman, Game.jsx invite-name prompt, FibbageGame, WavelengthGame, NumberMemoryGame, Onboarding · **Reported independently by** 4 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** autoFocus is set on mount with no delay in WordSetter.jsx:47, Game.jsx:935, FibbageGame.jsx:451, WavelengthGame.jsx:488, NumberMemoryGame.jsx:313, and Onboarding.jsx:150.

**Why it hurts on mobile —** On a 667px viewport the keyboard covers roughly a third of the screen the instant the component renders, before the player reads the instruction line above the field (e.g. "YOU ARE THE WORD-KEEPER"), so first-time players must dismiss the keyboard just to read what's being asked of them.

**Fix —** Remove autoFocus from fields with accompanying instructional copy; reserve it for screens where the input is the only content, or delay focus slightly after mount.

**User benefit —** Players see the game's instructions before being shoved into typing mode, reducing confusion during fast-paced party rounds.

**Evidence:**
- `src/components/WordSetter.jsx:47` — autoFocus on secret-word input, instruction text above it
- `src/pages/FibbageGame.jsx:451` — autoFocus on lie input
- `src/pages/WavelengthGame.jsx:488` — autoFocus on one-word clue input

### M-29 · In-room header: one icon bumped to 40px, three neighbors left at 24px

**Severity:** Medium · **Effort:** Low · **Screen:** Game room header (every 2-player game) · **Reported independently by** 4 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** RulesButton's hit box was grown to ~40px via p-3 -m-2, but GameSwitcher(icon), the invite icon, and the mute icon sitting in the same header row still use p-1 (~24px).

**Why it hurts on mobile —** Four visually equal icon buttons sit in one row; only one is comfortably tappable. The other three get mis-tapped far more, right at the top of a one-handed phone reach.

**Fix —** Apply the same p-3 -m-2 hit-area technique to every icon button in the header row, not just RulesButton.

**User benefit —** Fewer mis-taps in the single most-visited screen in the app — every multiplayer match.

**Evidence:**
- `src/pages/Game.jsx:1046` — invite button: 'text-retro-dim hover:text-retro-text transition-colors p-1 rounded'
- `src/pages/Game.jsx:1159` — mute button: identical p-1 rounded pattern
- `src/components/GameSwitcher.jsx:44` — icon variant: 'p-1 rounded' vs RulesButton's 'p-3 -m-2 rounded' two lines away in JSX

**Verifier calibration —** Confirmed factually: RulesModal.jsx L13 uses p-3 -m-2 (~40px hit box); Game.jsx L1046/1159 and GameSwitcher.jsx L44 use p-1 (~24px) — verified at cited lines in both header renders. Real inconsistency, but these are secondary actions (mute/invite/switch), not core move-making; mis-taps are recoverable annoyances, so High overstates mobile impact — Medium fits better. Effort Low is right (copy one class string to 3 buttons).

### M-30 · Ultimate TTT cells are ~32x32px, the board hardcodes a width smaller than its own registry allotment

**Severity:** Medium · **Effort:** Low · **Screen:** /game/:gameId — Ultimate TTT · **Reported independently by** 4 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** UltimateTttBoard.jsx wraps itself in max-w-[360px] (sm:420px) regardless of the registry's maxWidth: 'max-w-md' (448px) for this game. Computed: (360 - 2×6px pad - 2×6px gap)/3 = 112px miniboard; inner cell = (112 - 8px pad - 4px border - 4px gap)/3 ≈ 32px — on every phone in the audit range, since sm: (640px) never applies.

**Why it hurts on mobile —** 32px is well under the 44px tap-target minimum on an 81-cell board with irreversible moves (no undo) — a mis-tap lands a permanent mark in the wrong sub-board, a costly error in a 'thinky' game the audit flags as a launch differentiator.

**Fix —** Drop the internal max-w-[360px] cap and let the board fill the registry's max-w-md container (a free ~88px on 430px phones widens cells to ~40px); consider larger gap/border trim to squeeze more.

**User benefit —** Fewer accidental wrong-board taps; a flagship 'thinky' game feels precise instead of fiddly on phones.

**Evidence:**
- `src/components/UltimateTttBoard.jsx:15` — w-full max-w-[360px] sm:max-w-[420px] mx-auto — self-imposed cap under sm:
- `src/components/UltimateTttBoard.jsx:33` — inner grid-cols-3 gap-0.5 sm:gap-1 producing ~32px aspect-square buttons
- `src/lib/games.js:96` — registry says maxWidth: 'max-w-md' (448px) — the board never uses the extra ~88px it's allotted

**Verifier calibration —** Cap/cell math checks out (~32px cells), and cfg.maxWidth (max-w-md=448) vs internal max-w-[360px] cap is real. But Game.jsx wraps board in p-4 (32px total) page padding, so on common phones ≤393px width the available width (343-361px) is already below the 360px cap — removing it yields zero gain there. Only larger phones (~410-430px) gain 2-4px (cell ~34-36px), not the claimed 40px, and still short of 44px target. "Affects every phone in range" and the magnitude of benefit are overstated; real bottleneck is page padding + inherent 9x9 density, not this cap.

### M-31 · Every overlay's dismiss '✕' is far under the 44px minimum

**Severity:** Medium · **Effort:** Low · **Screen:** Global overlays (Rules/Mode/Variant/Switcher) · **Reported independently by** 3 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** RulesModal, ModeChooser, VariantChooser and GameSwitcher all reuse an identical close button: 10px pixel-font text with only px-1 (4px) horizontal padding and no vertical padding — roughly an 18×14px hit area, well under the 44px minimum.

**Why it hurts on mobile —** Centered dialogs put the '✕' near mid-screen, forcing an unnatural thumb stretch; combined with a sub-20px target, mis-taps land on the title text instead. Repeated across every overlay, it erodes trust in the app's dismiss affordance.

**Fix —** Bump every close button to a real 44×44 tap area (p-3 + min-w-11/min-h-11); consider converting these centered dialogs to bottom sheets with a drag handle for natural one-handed dismissal, per Material 3.

**User benefit —** Reliable one-tap dismissal instead of repeat mis-taps on every Rules/Switch/Invite modal.

**Evidence:**
- `src/components/RulesModal.jsx:58` — close button className: 'font-pixel text-[10px] ... px-1' — no py, no min-size
- `src/components/VariantChooser.jsx:37` — identical undersized close button pattern
- `src/components/GameSwitcher.jsx:73` — identical undersized close button pattern inside the picker modal

**Verifier calibration —** Confirmed: all 3 close buttons use identical px-1, no py, ~18x15px hit area, no min-w/h. But backdrop onClick={onClose} + Escape already provide easy alternate dismiss, so mis-taps aren't blocking—just annoying. Downgrade High to Medium; fix (RulesButton's own p-3 -m-2 pattern) is trivially Low effort.

### M-32 · Exit links are unpadded text with no confirmation, in the hardest-to-reach corner

**Severity:** Medium · **Effort:** Low · **Screen:** Game header / error screens · **Reported independently by** 3 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** "← HOME" / "← BACK TO HOME" links carry no padding classes — the tap target is the bare ~10px pixel-font text, roughly 14px tall, positioned top-left.

**Why it hurts on mobile —** Top-left is the least reachable zone for one-handed thumb use, especially on 430px-wide Pro Max phones, and the tiny target compounds mis-taps on the link that leaves a live match room.

**Fix —** Give the link the same `p-3 -m-2` padding treatment already used for RulesButton so the visual position is unchanged but the hit box grows to ~40px.

**User benefit —** A reliable, easier-to-hit way to leave a room without fumbling for a 14px-tall link.

**Evidence:**
- `src/pages/Game.jsx:1120` — `<Link to="/" className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors">← HOME</Link>` — no padding classes.
- `src/pages/Game.jsx:954` — Same unpadded pattern on the TTL-expired error screen's "← BACK TO HOME" link.
- `src/pages/Game.jsx:981` — Same pattern on the family-mismatch error screen.

### M-33 · Persistent secondary nav is pinned to top corners with sub-44px tap targets

**Severity:** Medium · **Effort:** Low · **Screen:** App Shell — Persistent Nav (NavBar + Home corner chips) · **Reported independently by** 3 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Profile/friends/theme/mute controls sit fixed at the extreme top corners on every page (NavBar.jsx on Profile/Friends/Demo/Daily/404; duplicated corner chips on Home.jsx). The friends and mute buttons are `p-2` around a 16×16 svg (~32×32px); ThemeSwitcher's swatch button is ~39×21px — both well under the 44px minimum.

**Why it hurts on mobile —** On a 393-430px-tall-reach phone (15 Pro/Pro Max) these are the least thumb-reachable pixels on screen, and the same audit already grew two other undersized targets to 40px (F-37) without touching this always-visible chrome, so the smallest tap targets in the app are also the ones present on literally every screen.

**Fix —** Grow NavBar/ThemeSwitcher/mute hit areas to 44px via the same `p-3 -m-2` invisible-extension trick already used for RulesButton and the favorites star.

**User benefit —** Muting, theme-switching, and checking friends become reliable one-handed taps instead of near-misses at the screen's hardest-to-reach corner.

**Evidence:**
- `src/components/NavBar.jsx:52` — friends icon: `p-2` wrapping a 16×16 svg ≈ 32×32px target
- `src/components/ThemeSwitcher.jsx:40` — `p-2` wrapping three 5px swatches with gap-1 ≈ 39×21px target
- `src/pages/Home.jsx:128` — identical corner chips duplicated fixed at top on Home

### M-34 · Toast notifications ignore safe-area-inset-bottom, sitting in the home-indicator zone

**Severity:** Medium · **Effort:** Low · **Screen:** App Shell — Toast Notifications (invite/error toasts) · **Reported independently by** 3 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** `src/components/ui/sonner.jsx` renders `position="bottom-center"` with no `mobileOffset`/style override; sonner's shipped default (`MOBILE_VIEWPORT_OFFSET = '16px'`, node_modules/sonner/dist/index.js:422) is a flat pixel offset with no `env(safe-area-inset-bottom)`.

**Why it hurts on mobile —** On an iPhone with a ~34px home-indicator safe area, invite toasts carrying a tappable JOIN button (InviteToasts.jsx) and error toasts ('CONNECTION ERROR', 'ENTER A GAME CODE') render only 16px from the physical bottom edge — inside the OS swipe-gesture reserved zone, risking accidental dismissal or a hard-to-hit JOIN button.

**Fix —** Pass `mobileOffset={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}` to the Toaster in sonner.jsx.

**User benefit —** Invite and error toasts, including their action buttons, stay clear of the iPhone home-indicator gesture zone.

**Evidence:**
- `src/components/ui/sonner.jsx:5` — `position="bottom-center"`, no mobileOffset/env() passed
- `src/components/InviteToasts.jsx:30` — invite toast carries a tappable JOIN action, most consequential toast in the app

### M-35 · Search field has no clear/cancel affordance

**Severity:** Medium · **Effort:** Low · **Screen:** Home — search · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The SEARCH GAMES input is a plain type="text" field with no x clear button and no Cancel/close control anywhere in the surrounding UI.

**Why it hurts on mobile —** type="search" would at least give iOS/Android a native clear glyph; without it, and with no custom clear button either, returning from search results to normal browsing requires manually backspacing every character — friction on precisely the 'clearing' step of the search flow.

**Fix —** Switch the input to type="search" for the native clear icon, and/or add a small x button inside the field once the query is non-empty.

**User benefit —** One-tap return from search results to normal category browsing.

**Evidence:**
- `src/components/GamePicker.jsx:142` — <input type="text" ... placeholder="SEARCH GAMES… ( / )" /> — no clear button, no type="search"

### M-36 · Bluff Battle's bid-face stepper buttons are 28x28px

**Severity:** Medium · **Effort:** Low · **Screen:** /game/:gameId — Bluff Battle (bidding step) · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The −/+ die-face stepper buttons use w-7 h-7 (28px), well under the 44px minimum, sitting directly beside the large RAISE BID / CALL LIAR action buttons.

**Why it hurts on mobile —** This is the control tapped most often per turn in a bidding game (adjusting face value before every raise); at 28px it's markedly smaller than every other primary control on the same screen and easy to miss on a quick tap.

**Fix —** Bump to at least w-11 h-11 (44px) or add an invisible padding/-m hit-area extension as done for the RulesButton (F-37).

**User benefit —** Fewer mis-taps while adjusting a bid under time pressure.

**Evidence:**
- `src/pages/BluffBattleGame.jsx:455` — className="w-7 h-7 font-pixel text-xs border border-retro-border rounded ... active:scale-90" — 28px stepper button

### M-37 · Wavelength's core guess input — the spectrum dial — has only a 32px-tall drag target

**Severity:** Medium · **Effort:** Low · **Screen:** WavelengthGame (guessing phase) · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The interactive Dial used by every non-clue-giver to lock a guess (rendered at WavelengthGame.jsx:519-524) sits in a container fixed at `h-8` (32px, line 51); the range input tracking it is `absolute inset-0 w-full h-full`, so the tap/drag band is capped at 32px tall.

**Why it hurts on mobile —** 32px is below the 44px minimum touch target height for the single primary interaction of an entire game mode, making the initial touch-down on the thumb (visually only 16px, `w-4 h-4`, line 74) less forgiving than the rest of the app's controls.

**Fix —** Increase the Dial's outer container to `h-11` (44px) minimum, keeping the visual track/thumb thin inside a taller invisible hit area, matching the pattern already used for the search/join inputs' 44px+ touch heights.

**User benefit —** More forgiving, thumb-friendly initial touch-down on the game's core interaction.

**Evidence:**
- `src/pages/WavelengthGame.jsx:51` — Dial container: `relative h-8` (32px)
- `src/pages/WavelengthGame.jsx:519` — interactive Dial used for every guesser's actual input

### M-38 · Avatar tone-color swatches are 24×24px with only 8px gaps

**Severity:** Medium · **Effort:** Low · **Screen:** Profile > Avatar Customizer · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The 6 color-tone dots are w-6 h-6 (24px) laid out with gap-2 (8px), center-to-center spacing ~32px — well under the 44px/8mm guideline for adjacent circular targets.

**Why it hurts on mobile —** Picking the intended shade for a cap/shirt/pants/shoe on a 360px Android screen is fiddly for a thumb; mis-taps are low-cost (just pick again) but add friction to a feature meant to feel fun and quick, undercutting the app's otherwise premium retro-pixel polish.

**Fix —** Increase swatches to w-9/w-10 (36-40px) with 12px gaps, or wrap each dot in a larger invisible padded hit-area matching the visual dot.

**User benefit —** Faster, more confident color selection during avatar customization.

**Evidence:**
- `src/components/AvatarCustomizer.jsx:133` — button className="w-6 h-6 rounded-full border-2 ..." inside a gap-2 row

### M-39 · Enter/Go doesn't submit two forms, unlike every sibling input in the app

**Severity:** Medium · **Effort:** Low · **Screen:** Friends (add-friend code), Profile (display name) · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Friends.jsx:120-126's code input and Profile.jsx:102-109's display-name input have no onKeyDown handler, while Home's join-code, WordSetter, NumberMemoryGame, FibbageGame, WavelengthGame, and Game.jsx's invite-name prompt all wire onKeyDown for Enter to submit.

**Why it hurts on mobile —** Mobile keyboards surface a "Go"/"Return" key users expect to submit the form; on these two screens it's a no-op, so a user types a code or name, taps Return, nothing happens, and they must hunt for the small SEND/SAVE button.

**Fix —** Add the same `onKeyDown={e => e.key === 'Enter' && sendRequest()}` pattern already used throughout the rest of the codebase to these two inputs.

**User benefit —** Predictable, consistent submit behavior on every form in the app, matching platform keyboard conventions.

**Evidence:**
- `src/pages/Friends.jsx:120` — code input, no onKeyDown handler; sendRequest defined at line 59
- `src/pages/Profile.jsx:102` — display-name input, no onKeyDown handler

### M-40 · UpdatePrompt banner ignores safe-area-inset-top — sits under the Dynamic Island/notch

**Severity:** Medium · **Effort:** Low · **Screen:** App Shell — Update Prompt (all pages) · **Reported independently by** 2 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** UpdatePrompt.jsx pins its 'UPDATE READY / RELOAD / LATER' banner at literal top-0 with a flat pt-3 (12px), horizontally centered. Every other fixed-top chrome in the app (NavBar, Home's corner chips, Game.jsx headers, Onboarding's theme switcher) instead uses `max(Xrem, env(safe-area-inset-top))`.

**Why it hurts on mobile —** On iPhone 15 Pro/Pro Max the banner is centered directly beneath the Dynamic Island cutout with only 12px clearance, so RELOAD/LATER can render partly obscured/unreachable right where the hardware island sits — the one fixed element in the codebase that skipped the safe-area pattern everyone else follows.

**Fix —** Change `pt-3` to `pt-[max(0.75rem,env(safe-area-inset-top))]`, matching NavBar.jsx's existing pattern exactly.

**User benefit —** Update prompts stay fully visible and tappable on notch/Dynamic-Island phones instead of colliding with hardware.

**Evidence:**
- `src/components/UpdatePrompt.jsx:12` — `fixed top-0 inset-x-0 z-50 flex justify-center px-4 pt-3` — no env(safe-area-inset-top)
- `src/components/NavBar.jsx:19` — `pt-[max(0.75rem,env(safe-area-inset-top))]` — the established pattern this component skipped

**Verifier calibration —** Confirmed factually: UpdatePrompt.jsx:12 uses plain pt-3, unlike NavBar.jsx:19's env(safe-area-inset-top) pattern. Real but rare (only fires on PWA update, infrequent) and not a core-flow blocker — Medium, not High.

### M-41 · Utility row (DAILY + JOIN CODE + JOIN) squeezes sub-44px controls into ~90-160px lanes

**Severity:** Medium · **Effort:** Low · **Screen:** Home — utility row · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** DailyTile, the JOIN CODE input, and the JOIN button share one flex row; DailyTile's own code comment documents only '~140px of content width' at 375px, and each control's vertical padding (py-2/py-2.5) yields roughly 34-42px tall hit areas.

**Why it hurts on mobile —** Three separate tap targets are compressed below the 44px minimum on both axes, on the narrowest supported viewports (iPhone SE 375, small Android 360) — this is the very first interactive row a returning user sees, so it's also the most-tapped.

**Fix —** Stack DAILY above JOIN CODE below a ~400px breakpoint, or move join-by-code behind a compact expandable affordance as the original F-01 fix proposed.

**User benefit —** Reliable taps on the daily challenge and join-by-code on the smallest phones.

**Evidence:**
- `src/pages/Home.jsx:241` — DailyTile + JOIN CODE input + JOIN button share one flex row
- `src/components/DailyTile.jsx:18` — code comment: 'the tile shares a row with the join input on a ~375px viewport (~140px of content width)'

### M-42 · No sticky category/filter bar — refining browse mid-scroll means scrolling back to the top

**Severity:** Medium · **Effort:** Low · **Screen:** Home — catalog ALL view · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The default ALL view renders all 31 games as one long sectioned vertical scroll (favorites + 6 category sections); the search input, filter chips, and CategoryTabs above it use no sticky positioning anywhere (grep-confirmed zero 'sticky' usages in these files) and scroll away with the page.

**Why it hurts on mobile —** A user several sections deep (e.g. browsing PARTY games) who wants to jump categories or start typing a search must scroll all the way back to the top — there is no persistent quick-filter across a scroll this long.

**Fix —** Make the search+filter+tabs block 'sticky top-0' (with safe-area offset) when layout="full", so refining stays one tap away throughout the scroll.

**User benefit —** Category/search access stays reachable through the full 31-game catalog scroll.

**Evidence:**
- `src/components/GamePicker.jsx:140` — search/filter/tabs block has no sticky class; grep for 'sticky' across GamePicker.jsx, CategoryTabs.jsx, Home.jsx returns zero matches

### M-43 · Turn status and every end-of-round CTA render strictly below the board, risking below-the-fold burial

**Severity:** Medium · **Effort:** Medium · **Screen:** Mid-game / results screen · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** GameStatus (the "YOUR TURN" label and, at round end, PLAY AGAIN / SHARE / TRY NEXT / SWITCH GAME) is always JSX-ordered after the board component. On dense boards like SOS's 7×7 grid, the board plus its letter-picker/score rows already consume ~400px before GameStatus starts.

**Why it hurts on mobile —** On an iPhone SE (~560-600px usable height), the "what do I do now" cue and the primary rematch button can sit past the fold — exactly when a player wants an instant answer after winning or on their turn, they instead have to scroll to find it.

**Fix —** Pin a compact turn/result summary near the player cards at the top, and/or make PLAY AGAIN a sticky bottom action bar independent of board height (Marvel Snap's persistent post-match bar pattern).

**User benefit —** Players always see whose turn it is and can act on a round result without hunting or scrolling.

**Evidence:**
- `src/pages/Game.jsx:1408` — `<cfg.BoardComponent board={board} .../>` immediately followed by `<GameStatus .../>` at line 1416 — turn/result UI always renders below the board.
- `src/components/SosBoard.jsx:68` — 7-column grid, 3px gaps, in a max-w-sm (384px) container ⇒ ~43px cells, ~300px+ board before the letter-picker/score rows that also precede GameStatus.

**Verifier calibration —** Turn-status half is largely mitigated: PlayerCard (Game.jsx L1194-1211) already shows an active-turn glow+PixelDots up top, no scroll needed. End-of-round CTA burial is real but confined to dense boards (SOS 7x7 + picker + score rows, ~460px); TicTacToe/ConnectFour are much shorter. Not "every" game as claimed — narrower than stated, so Medium not High.

### M-44 · Spectator's only CTA disappears the instant the round ends

**Severity:** Medium · **Effort:** Low · **Screen:** Spectator view, finished round · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The "SPECTATING" label and "START YOUR OWN ROOM" button are gated to `game.status === 'playing'`; once the round finishes, both vanish and the spectator sees only static winner text.

**Why it hurts on mobile —** The moment a spectator is most likely to want to act — right after an exciting finish — is exactly when their only action button disappears, leaving nothing tappable except the tiny unpadded header HOME link.

**Fix —** Extend the condition to also cover `status === 'finished'`, or add the CTA to GameStatus's finished-state branch so spectators keep an entry point at every stage.

**User benefit —** Spectators can act on their excitement immediately instead of hunting for a way back into play.

**Evidence:**
- `src/pages/Game.jsx:1431` — `{!isCustom && isSpectator && game.status === 'playing' && (...START YOUR OWN {cfg.label} ROOM...)}` — condition excludes `finished`.
- `src/components/GameStatus.jsx:112` — `onPlayAgain`/`onNewMatch`/`onSwitchGame` are all null for spectators, so the finished-state branch shows no actionable buttons for them either.

### M-45 · Mid-game switch proposal shifts the board layout right as it appears

**Severity:** Medium · **Effort:** Medium · **Screen:** Mid-game consent handshake (switch proposal) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** GameSwitcher's icon trigger lets a seated player propose a switch any time `status !== 'waiting'`; ProposalBanner then renders inline above the board in the same flex column, and its ~70-90px height pushes the board down the moment it appears.

**Why it hurts on mobile —** A proposal can land mid-turn without warning; the sudden layout shift moves the board's cells right when a player may be mid-tap, risking a mis-placed move on a phone where finger position was already committed to the pre-shift layout.

**Fix —** Render ProposalBanner as a fixed/overlay toast (mirroring the overlay pattern WinEffect already uses in this same file) instead of an in-flow block that reflows the board.

**User benefit —** No surprise layout jumps mid-move, eliminating accidental taps caused by a shifting board.

**Evidence:**
- `src/pages/Game.jsx:1127` — `<GameSwitcher variant="icon" ... onSwitch={(t) => propose('switch', t)} />` available whenever `game.status !== 'waiting'`, i.e. mid-round.
- `src/pages/Game.jsx:1227` — `{activeProposal && game.status !== 'waiting' && (<ProposalBanner .../>)}` renders inline, above the board block starting at line 1239.

### M-46 · Chain Reaction's 8-row board pushes turn status off-screen on iPhone SE

**Severity:** Medium · **Effort:** Medium · **Screen:** Game Room — Chain Reaction board · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** Summing measured component heights (header ~32px, player cards 56px, 8×6 board ~445px, status line ~16px, emote bar ~40px, 4×16px space-y gaps, 36px safe-area padding) totals ~689px against SE's 667px viewport.

**Why it hurts on mobile —** The turn indicator and/or emote bar land below the fold mid-match on the smallest common device, and Safari's real toolbar chrome shrinks the visible area further, forcing a scroll during active play just to see whose turn it is.

**Fix —** Collapse the emote bar into the header icon row for this game, tighten the space-y gap between board and status, or cap the board at max-w-[280px] to shave overall row height.

**User benefit —** Full game state stays visible without scrolling on every phone, matching the other 8 board games.

**Evidence:**
- `src/components/ChainReactionBoard.jsx:156` — max-w-xs (320px) container, 8 rows × 6 cols, each cell forced square by column width (~49px)
- `src/lib/chainReactionLogic.js:5` — CR_COLS=6, CR_ROWS=8, CR_CELL_COUNT=48 — the only non-square board
- `src/pages/Game.jsx:1142` — space-y-4 between header/players/board/status/emotes, plus pt-[max(1.25rem,safe-area)] outer padding

**Verifier calibration —** Math checks out: CR board ~320px wide (max-w-xs), ~406-422px tall grid, plus header/cards/gaps sums to ~670-690px vs 667px viewport — real overflow. But PlayerCard isActive glow/PixelDots (above fold, ~88px into page) already shows whose turn it is redundantly with the below-fold GameStatus text, so scrolling isn't needed to know whose turn it is — only the redundant text line and emote bar are cut off. Downgrade High to Medium (annoyance, not blocking core info).

### M-47 · No board persists a last-move indicator — returning to the tab mid-game means re-scanning the whole grid

**Severity:** Medium · **Effort:** Medium · **Screen:** All turn-based boards · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Placement feedback everywhere is a one-shot CSS animation (place-pop / disc-drop / box-claim, ~0.2–0.4s) with no lingering highlight; once it finishes there is no marker left on the opponent's last cell.

**Why it hurts on mobile —** Mobile play is interrupted constantly (calls, notifications, app-switching, PWA backgrounding); on dense boards like Gomoku (15×15), Reversi (8×8) or Ultimate TTT (81 cells) a returning player must diff the entire board from memory to find what changed.

**Fix —** Add a persistent subtle ring/dot on the most-recent cell — Chain Reaction already tracks crLastMove for its replay; thread the same prop into every board's boardProps and render a lasting marker until the next move.

**User benefit —** Instant re-orientation after any interruption, especially valuable on the largest, most error-prone boards.

**Evidence:**
- `src/index.css:272` — box-claim/place-pop/disc-drop keyframes are the only placement feedback; all are transient (0.2–0.4s), none persist
- `src/components/ReversiBoard.jsx:46` — flipped/placed discs animate on mount only, no lastMove prop or styling
- `src/components/GomokuBoard.jsx:40` — same one-shot disc-drop animation, no persistent marker

### M-48 · Dots & Boxes and SOS give an extra turn with zero distinct signal — status text is identical to a normal turn

**Severity:** Medium · **Effort:** Medium · **Screen:** Game Room — Dots & Boxes and SOS boards · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** When a move completes a box (D&B) or an S-O-S (SOS), currentTurn stays on the mover, but GameStatus renders the same 'YOUR TURN' / 'OPPONENT'S TURN' string as any other turn, with no toast, sound cue, or badge marking the bonus turn.

**Why it hurts on mobile —** First-time players can misread an extra turn as a bug ('why didn't it switch?') or fail to notice they're still active, especially on mobile where the status line is one small skimmable text row between taps.

**Fix —** Fire a brief 'GO AGAIN!' toast/pulse on the PlayerCard when currentTurn is unchanged after a scoring move — the exact condition is already computed in games.js's applyMove for both games.

**User benefit —** Removes a recurring first-session confusion point in two of the platform's higher-depth board games.

**Evidence:**
- `src/lib/games.js:186` — currentTurn: moved.completedBoxes.length ? symbol : (symbol==='X'?'O':'X') — silent extra turn
- `src/lib/games.js:210` — currentTurn: applied.completedCount ? symbol : (symbol==='X'?'O':'X') — same silent pattern for SOS
- `src/components/GameStatus.jsx:124` — status==='playing' renders only 'YOUR TURN'/'OPPONENT'S TURN', no bonus-turn state

### M-49 · Touch control scheme is taught only opt-in — no proactive first-touch coachmark, and the persistent legend is 8px

**Severity:** Medium · **Effort:** Medium · **Screen:** Pong, Snake, Tron, Sumo, Space Duel — first-time control onboarding · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The only in-context control hint is a permanent `text-[8px]` legend row under the arena (e.g. 'SWIPE', 'DRAG', 'A/D ROTATE · W THRUST · SPACE FIRE'); real teaching only happens if the player separately visits /demo or taps the '?' rules icon before joining.

**Why it hurts on mobile —** A first-timer who joins a live match straight from an invite link gets no proactive gesture demonstration; the countdown before the round starts is a wasted teaching moment, and the always-tiny legend text is easy to miss while focused on the arena.

**Fix —** Show a one-time coachmark overlay during the pre-match countdown (e.g. an animated swipe/drag/tap icon) keyed per game type, dismissed after first play and stored like other first-run flags.

**User benefit —** First-time mobile players understand the control scheme before the round starts instead of losing the opening seconds to trial and error.

**Evidence:**
- `src/components/SpaceduelArena.jsx:210` — 'A/D ROTATE · W THRUST · SPACE FIRE' rendered at font-pixel text-[8px], the only persistent hint (doesn't even mention the touch buttons)
- `src/components/TronArena.jsx:76` — '↑ ↓ ← → · WASD · SWIPE' — same 8px pattern
- `src/components/RulesModal.jsx:29` — Full control explanation only reachable via an opt-in '?' tap, not shown automatically before a first match

### M-50 · Reaction Time measures the tap via onClick — the app's own slower input path, unlike every other custom keypad

**Severity:** Medium · **Effort:** Low · **Screen:** Reaction Time (multiplayer + solo) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The stimulus tap uses `<button onClick={handleClick}>` with no onPointerDown, while TypingKeyboard and NumberPad in the same codebase deliberately use `onPointerDown` + preventDefault for lower-latency input on touch.

**Why it hurts on mobile —** Touch→click event synthesis adds latency a mouse click doesn't pay. On the one game whose entire premise is sub-300ms precision, mobile players' recorded times are systematically inflated relative to desktop opponents in the same room.

**Fix —** Switch the tap handler to onPointerDown (with preventDefault), matching the low-latency pattern already established for TypingKeyboard and NumberPad.

**User benefit —** Faster-feeling taps and reaction scores that reflect real reflexes rather than device/browser event overhead.

**Evidence:**
- `src/pages/ReactionGame.jsx:247` — <button onClick={handleClick} disabled={phase === 'submitted'} ...> — no onPointerDown
- `src/components/TypingKeyboard.jsx:51` — onPointerDown={e => { e.preventDefault(); tap(raw) }} — the faster pattern used elsewhere
- `src/pages/ReactionGame.jsx:164` — rt = Math.round(performance.now() - roundStartRef.current) captured inside the click handler — synthesis lag is baked into the recorded score

### M-51 · Number Memory's 3-second reveal doesn't scale with digit count

**Severity:** Medium · **Effort:** Low · **Screen:** Number Memory (multiplayer + solo) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** SHOW_MS is a flat 3000ms constant used for every round regardless of round.level (the digit count, which grows every round both players succeed), so a 9-10 digit number gets the same reveal window as a 1-digit number.

**Why it hurts on mobile —** The task gets objectively harder each round while the time budget stays fixed; the wide tracking-widest pixel font (text-2xl) is slower to scan on a ~320px card than plain text, so small-screen readability compounds an already-unscaled timer.

**Fix —** Scale SHOW_MS with level (e.g. a base plus a per-digit increment) so difficulty comes from recall capacity, not from an unreadable flash on a small screen.

**User benefit —** A fairer difficulty curve that actually tests memory rather than screen-reading speed under an arbitrary clock.

**Evidence:**
- `src/pages/NumberMemoryGame.jsx:10` — const SHOW_MS = 3000 — single constant, not a function of round.level
- `src/pages/NumberMemoryGame.jsx:74` — setCountdown(Math.ceil(SHOW_MS / 1000)) drives the same 3s window every round regardless of digit count
- `src/pages/NumberMemoryGame.jsx:276` — number rendered as 'font-pixel text-2xl ... tracking-widest' inside a max-w-xs (320px) card

### M-52 · Typing Race stacks roughly 550–620px of chrome + content, risking the keyboard falling below the fold on 667px phones

**Severity:** Medium · **Effort:** Medium · **Screen:** Typing Race (multiplayer + solo) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Shared page chrome (header + two PlayerCards, ~150-160px) plus the passage box (~150-170px for a wrapped 130-150 char passage) plus the 4-row on-screen keyboard (~172px) plus the offline-notice/GameSwitcher row sum to roughly 550-620px before subtracting the mobile browser's own toolbar chrome.

**Why it hurts on mobile —** On a 667px iPhone SE (or an Android with the URL bar visible), the keyboard or the 'TAP FOR NEXT'/switch-game controls can be pushed below the fold, forcing a scroll mid-race — a uniquely bad interruption for a timed WPM game where every second counts.

**Fix —** Collapse non-essential chrome (player cards, GameSwitcher row) while actively racing, or size the passage+keyboard block with dvh so it's guaranteed to fit above the fold on short viewports.

**User benefit —** Never lose sight of the keyboard or passage while the clock is running.

**Evidence:**
- `src/pages/Game.jsx:1131` — page shell p-4 + safe-area padding, header row (1144-1190), PlayerCard grid (1193-1212) ≈ 150-160px of chrome before game content
- `src/pages/TypingGame.jsx:246` — passage box: p-3 + font-mono leading-6 wrapping ~130-150 chars to ~4-5 lines ≈ 150-170px
- `src/components/TypingKeyboard.jsx:66` — 4 rows at h-10 with space-y-1 ≈ 172px, plus TypingGame's offline-notice/GameSwitcher row below it

### M-53 · Aim Trainer's own-target color is bound to "isOwn", not to your actual X/O identity

**Severity:** Medium · **Effort:** Low · **Screen:** Aim Trainer (multiplayer + solo) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** renderTarget() colors the clickable target purely by 'is this mine' — always retro-p1 for your own, retro-p2 for the opponent's — while the score header colors X/O by their real symbol (X=p1, O=p2) exactly as every other screen in the app does.

**Why it hurts on mobile —** The game's core instruction is 'shoot your color'; an O player sees their name in p2 but their own shootable target in p1 — a color-language mismatch during fast, thumb-driven tapping with little time to reconcile it.

**Fix —** Bind target color to the real symbol (X→p1, O→p2) for both own and opponent targets, matching PlayerCard/header conventions already used everywhere else.

**User benefit —** One consistent color language across the screen, fewer color-driven mistaps for O players.

**Evidence:**
- `src/pages/AimTrainerGame.jsx:196` — isOwn ? 'bg-retro-p1 shadow-neon-p1 ...' : 'bg-retro-p2 shadow-neon-p2 ...' — colored by ownership, not symbol
- `src/pages/AimTrainerGame.jsx:251` — header colors X as text-retro-p1 and O as text-retro-p2 by real symbol — the established convention this target ignores

### M-54 · Hangwoman's gallows illustration eats enough viewport to push the keyboard below the fold

**Severity:** Medium · **Effort:** Low · **Screen:** Hangwoman — guessing phase · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** HangmanGallows renders at a fixed 240×300px (viewBox 120×150 aspect-locked to className max-w-[240px]) on any screen ≥240px wide, before word display, status text, or LetterKeyboard are even laid out.

**Why it hurts on mobile —** Combined with the page header/PlayerCard chrome (~150px) and word display/status/keyboard (~360px), total content lands around 710-750px — taller than an iPhone SE's or small Android's usable viewport, so the keyboard (the only interactive control) sits below the fold.

**Fix —** Cap the gallows to a responsive max-height (e.g. max-h-[22vh]) on short viewports so the keyboard stays reachable without scrolling.

**User benefit —** The whole guess loop — hangman state and letters — becomes visible and tappable in one glance, matching the desktop experience.

**Evidence:**
- `src/components/HangmanGallows.jsx:78` — viewBox 0 0 120 150, className w-full max-w-[240px] → fixed 240×300px render
- `src/pages/Game.jsx:1121` — shared header + PlayerCard grid render above HangmanGame's own content
- `src/pages/HangmanGame.jsx:496` — Gallows → WordDisplay → status → Keyboard stacked with no viewport-height budget

**Verifier calibration —** Factually correct: gallows is fixed w-full max-w-[240px]/viewBox 120x150 (≈240×300px), rendered above word/status/keyboard, with header+PlayerCard grid also above it (Game.jsx:1142-1210). But the page container is plain min-h-screen with no overflow-hidden anywhere in index.css, so it scrolls normally — keyboard is one scroll away, not unreachable. Downgrade severity High→Medium (friction, not blocking). Fix is a one-line Tailwind class (max-h-[22vh]), so effort Medium→Low.

### M-55 · Word Duel's guessing screen (boards + keyboard) also overflows a small phone viewport

**Severity:** Medium · **Effort:** Medium · **Screen:** Word Duel — guessing phase · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Two side-by-side 6-row boards (~300px tall) plus the on-screen keyboard (~150px) plus a current-guess preview row are stacked under the shared page header/PlayerCard chrome.

**Why it hurts on mobile —** Wordle-style play depends on seeing board and keyboard together; here small-phone players must scroll mid-guess, breaking the fast tap-tap-tap rhythm the format is built for.

**Fix —** Shrink or relocate the opponent's ghost board and trim vertical padding (py-4→py-2) to reclaim height on short viewports.

**User benefit —** Restores the single-glance board+keyboard rhythm the format depends on.

**Evidence:**
- `src/pages/WordDuelGame.jsx:567` — boards row (my guesses + opponent ghost) followed by the keyboard, ~450px combined, no responsive height handling
- `src/pages/WordDuelGame.jsx:77` — w-10 h-10 (40px) tiles × 6 rows per board

### M-56 · Party-game vote/guess buttons consistently land a few px under 44px

**Severity:** Medium · **Effort:** Low · **Screen:** Fibbage voting · Spyfair accusation · Two Truths statement guess · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Fibbage's vote options, Spyfair's accusation buttons, and Two Truths' statement buttons all size to roughly 38-42px tall (py-2.5/py-3 with 11-12px text), incidentally rather than intentionally under the 44px minimum.

**Why it hurts on mobile —** This is the single decisive tap in each of these party rounds (accuse, vote, guess), happening at a fast social pace where a slight under-tap is easy to make.

**Fix —** Standardize these list-item buttons to an explicit min-h-11 (44px) rather than letting padding+font decide the height.

**User benefit —** More forgiving taps during the fast pace of party rounds.

**Evidence:**
- `src/pages/FibbageGame.jsx:482` — vote option button: px-3 py-2.5 text-[12px]
- `src/pages/SpyfairGame.jsx:579` — accusation button: px-4 py-2.5 text-[11px]
- `src/pages/TwoTruthsGame.jsx:421` — statement button: px-3 py-3 text-xs

### M-57 · Two Truths' three-textarea setter can push LOCK IT IN under the keyboard fold

**Severity:** Medium · **Effort:** Medium · **Screen:** Two Truths — storyteller writing phase · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** StatementSetter stacks 3 rows={2} textareas (each with its own MARK AS LIE button) followed by the LOCK IT IN submit button, with no keyboard-avoidance or scroll-into-view handling.

**Why it hurts on mobile —** With the system keyboard open (~40% of an SE viewport), filling in the 3rd statement can push that textarea and the submit button below the visible area, forcing a scroll-while-keyboard-open maneuver mid-typing.

**Fix —** Auto-scroll the focused field above the keyboard on focus, or pin LOCK IT IN to a sticky footer so it's always reachable.

**User benefit —** Smoother completion of the one required action on this screen without hunting for the submit button.

**Evidence:**
- `src/pages/TwoTruthsGame.jsx:84` — 3× (textarea + MARK AS LIE button) followed by a page-bottom LOCK IT IN button, no scroll-into-view/sticky handling

### M-58 · AvatarCustomizer's part-selector (CAP/SHIRT/PANT/SHOE) is unpadded 8px text — the primary control of a first-run onboarding step is nearly untappable

**Severity:** Medium · **Effort:** Low · **Screen:** Profile > Avatar Customizer / Onboarding · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** The buttons that choose which body part to recolor are plain text with zero px/py padding at font-pixel text-[8px] — hit height is roughly the 8px glyph's line box (~10-14px), the smallest interactive element found in the whole beat.

**Why it hurts on mobile —** This is the core interaction of the customizer, and it's not tucked away in Profile — it's also rendered in Onboarding.jsx (first-run identity step), so every new user's first tap-heavy interaction is on a control well under any usable size.

**Fix —** Give each label button explicit padding (e.g. px-2 py-2, -m-2 to preserve visual spacing) so the hit area reaches ~40-44px tall while keeping the compact visual label.

**User benefit —** New users can reliably select which part to recolor instead of mis-tapping between CAP/SHIRT/PANT/SHOE on first launch.

**Evidence:**
- `src/components/AvatarCustomizer.jsx:118` — button className="transition-all ..." — no padding classes at all, text-[8px]
- `src/components/Onboarding.jsx:139` — AvatarCustomizer rendered in the mandatory first-run identity step

**Verifier calibration —** Confirmed: button at AvatarCustomizer.jsx:118-126 has zero padding, text-[8px], ~12px line box, no global min-tap-target CSS mitigates it. But it's optional (default avatar + w-11 h-11 prev/next arrows suffice to finish onboarding), not a blocking primary control — High overstates impact; Medium fits noticeable-but-not-blocking friction.

### M-59 · Declining a game invite is undiscoverable: the toast has no close button, and the Home fallback's ✕ is unpadded and sits right beside the room-joining JOIN button

**Severity:** Medium · **Effort:** Low · **Screen:** Invite Toasts / Home (pending invites) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The sonner Toaster is configured without closeButton, so the invite toast can only be dismissed by swipe or its 10s auto-timeout. The persistent fallback on Home renders a dismiss ✕ with px-1.5 and no vertical padding (~10-12px tall) immediately next to a JOIN button that navigates straight into a live game room.

**Why it hurts on mobile —** A user who wants to say "not now" has no obvious, comfortably-sized way to do it — the safest tap target near the invite is the one that jumps them into someone else's game.

**Fix —** Add closeButton to the Toaster config; give the Home fallback's dismiss control matching px/py to the JOIN button (both ≥40px tall) so declining is as easy as accepting.

**User benefit —** Users can confidently dismiss an unwanted invite without risking an accidental room-join.

**Evidence:**
- `src/components/ui/sonner.jsx:5` — Toaster config has no closeButton prop
- `src/pages/Home.jsx:228` — dismiss button: className="px-1.5 text-retro-dim ... text-[9px]" — no py at all
- `src/pages/Home.jsx:222` — JOIN button sits immediately adjacent, navigates into the game room

### M-60 · Share-card fallback (no native share) silently downloads a PNG with zero confirmation, unlike every other action in the app

**Severity:** Medium · **Effort:** Low · **Screen:** Daily Challenge (Share Result) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** When navigator.canShare({files}) is false, shareResult() falls through to a synthetic <a download> click with no toast or message — contrasted with copyCode() elsewhere in the same social layer, which always shows toast.success/toast.error.

**Why it hurts on mobile —** On browsers/contexts where file-sharing isn't supported (some Android WebViews, desktop-mode mobile browsers), tapping SHARE RESULT produces an unexplained blob download with no feedback that anything happened, breaking the app's otherwise consistent toast-confirmation pattern.

**Fix —** Add a toast.success('Saved — check your downloads') (or equivalent) after the fallback download path completes, matching the confirmation pattern used for code-copy elsewhere.

**User benefit —** Users get the same clear confirmation for sharing as for every other action in the app.

**Evidence:**
- `src/lib/shareCard.js:164` — fallback download path: no toast/feedback call after the click()
- `src/pages/Profile.jsx:63` — contrast: copyCode() always calls toast.success/toast.error

### M-61 · No scroll-restoration between routes — landing on a new page at the old scroll position

**Severity:** Medium · **Effort:** Low · **Screen:** App Shell — Route Navigation · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** App.jsx wires plain react-router `BrowserRouter`/`Routes` with no scroll-reset logic, and there is zero reference to `scrollTo`/`ScrollRestoration` anywhere in src.

**Why it hurts on mobile —** GamePicker's full ALL-category view is a long stacked scroll (favorites + up to 6 category shelves); tapping a card deep in that scroll and landing on `/game/:gameId` keeps the browser's current scrollY, so the new room can render off-screen below the fold until the user manually scrolls up — same risk returning ← HOME from a scrolled game page.

**Fix —** Add a small `useEffect(() => window.scrollTo(0,0), [pathname])` at the App/router level so every navigation starts at the top.

**User benefit —** Every route change opens at the top of the new page instead of wherever the previous page happened to be scrolled.

**Evidence:**
- `src/App.jsx:15` — `<Routes>` block has no scroll-reset wrapper or listener
- `src/components/GamePicker.jsx:188` — long stacked ALL-category view — the common scroll-then-tap case

### M-62 · The audit's own stated trigger for a bottom tab bar has now been met, but nav still isn't unified or reachable from Home/Game

**Severity:** Medium · **Effort:** High · **Screen:** Cross-cutting: NavBar, Home, Game · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** F-14 in UX-IMPROVEMENTS.md explicitly deferred a bottom nav, reasoning 'two secondary destinations… revisit only if Daily + Leaderboards make it 4+ real destinations.' Since then, Daily shipped a real day-over-day streak (src/pages/DailyGame.jsx, `bumpStreak`) and Friends shipped a leaderboard (per recent commit) — both trigger conditions are now true, yet NavBar (src/components/NavBar.jsx) still only links Home/Profile/Friends, no Daily, and is still absent from Home and Game entirely.

**Why it hurts on mobile —** Daily and the leaderboard are now real retention mechanics but sit one tier below Profile/Friends in discoverability — no persistent affordance surfaces them from anywhere except Home's inline DailyTile. Meanwhile Home and Game each hand-roll their own partial nav, so the pattern for 'how do I get to X' differs by screen, which is the exact hub-and-spoke fragmentation F-14 originally flagged, just with more spokes now.

**Fix —** Revisit the bottom-nav decision now that the stated threshold is met: a persistent Home/Daily/Friends/Profile tab bar (Chess.com/Discord model) would give 1-tap access to all 4 destinations from every screen, including from inside a game, instead of the current 0-for-Game and inconsistent-elsewhere state.

**User benefit —** Daily-streak and leaderboard engagement loops get equal footing with Friends/Profile instead of being one tap deeper; consistent muscle memory for 'where's home/daily/friends' everywhere.

**Evidence:**
- `src/components/NavBar.jsx:40` — Links present: /profile (41), /friends (49) — no /daily anywhere in the component.
- `src/pages/DailyGame.jsx:6` — `bumpStreak` — a real day-over-day streak mechanic (Wordle-style hook), yet Daily has no NavBar/global entry point.
- `src/pages/Game.jsx:1135` — In-game header has no Friends/Profile/Daily link at all — only '← HOME'.

**Verifier calibration —** Factually confirmed: NavBar.jsx (used on Profile/Friends/Daily/Demo) has no /daily link; Game.jsx header only has "← HOME". But Home.jsx already hand-links /profile, /friends, and DailyTile, so all 4 destinations are 1-2 taps from anywhere, not blocked — this is a consistency/polish gap, not major friction. Downgrade High→Medium; effort High stands (touches every screen).

### M-63 · Pending game invites have no persistent indicator outside Home — a missed 10s toast is unrecoverable

**Severity:** Medium · **Effort:** Low · **Screen:** Cross-cutting: InviteToasts, Home, NavBar · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Friend game-invites surface only as a Sonner toast with a 10s duration (InviteToasts.jsx) plus an inline card on Home (Home.jsx lines 210-238). No other screen renders the `invites` list, and NavBar's Friends-icon badge is wired to `requestCount` (friend requests) only — not game invites — so it never reflects a waiting invite.

**Why it hurts on mobile —** If a user is mid-match (thumbs occupied) or on Profile/Friends/Demo/Daily when a friend's invite toast times out, there is no visual cue anywhere that an invite is waiting; they must guess to navigate Home and check. This directly weakens golden loop #6 (receive invite → play) for anyone not already on Home when it arrives.

**Fix —** Fold pending game-invite count into the same NavBar badge as friend requests (or a second badge), so it's visible from every screen, not just a 10s toast + Home-only card.

**User benefit —** Friend invites become recoverable and visible from anywhere, not just a narrow 10-second window on one screen.

**Evidence:**
- `src/components/InviteToasts.jsx:13` — MAX_TOAST_AGE_MS/duration:10000 — toast auto-dismisses after 10s with no persistent trace.
- `src/lib/AuthContext.jsx:55` — `unsubRequests = subscribeRequests(list => setRequestCount(list.length))` — badge count is friend-requests only, invites are a separate untracked list.
- `src/pages/Home.jsx:211` — Pending invites render inline only inside Home's own JSX — grep confirms no other page renders `invites`.

### M-64 · Room-join loading spinner has no timeout or manual cancel — only an unguarded back gesture as escape

**Severity:** Medium · **Effort:** Low · **Screen:** Game (/game/:gameId) — initial load · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** `LoadingScreen` renders only a spinner with no text, timeout, or cancel affordance. The room-join effect awaits a one-shot `get(gameRef)` with no client-side timeout wrapper; on a stalled/flaky mobile connection (elevator, subway, weak cell signal — common when joining a friend's link on the go) this can hang indefinitely with zero UI escape besides the browser back button, which (per the edge-swipe finding above) has no guard either.

**Why it hurts on mobile —** A very plausible real-world networking condition (joining via a shared link on mobile data) leaves the user stuck on a bare spinner with no way to retry or bail out from the UI itself.

**Fix —** Wrap the initial `get()` in a timeout (e.g. 8-10s) that surfaces a retry/cancel screen matching the existing error-screen pattern already used elsewhere in Game.jsx.

**User benefit —** Turns an indefinite silent hang into a clear, actionable retry state on flaky mobile networks.

**Evidence:**
- `src/pages/Game.jsx:93` — `LoadingScreen` — spinner only, no text/cancel/timeout.
- `src/pages/Game.jsx:224` — `snap = await get(gameRef)` with no timeout race — only a catch for outright rejection, not for hangs.

### M-65 · The reused ThemeSwitcher toggle is ~39×21px and ships on every page and every game

**Severity:** Medium · **Effort:** Low · **Screen:** Global — Home corners, NavBar (Profile/Friends/Demo/Daily/404), in-game headers · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** ThemeSwitcher.jsx's trigger has only `p-2` around a 23×5px row of three color dots with no explicit height — the flex row sizes to content, computing to roughly 39×21px, under half the 44px minimum in height.

**Why it hurts on mobile —** This one component mounts on every screen in the app, so its undersized hit box is the most-repeated tap-target defect in the codebase even though any single tap is infrequent — it's a systemic, not isolated, gap.

**Fix —** Wrap the dot row in a min-h-11 container, or swap it for a standard icon in the same 40×40px box other header icons use.

**User benefit —** One fix improves theme-switching precision across the entire product surface at once.

**Evidence:**
- `src/components/ThemeSwitcher.jsx:40` — trigger: p-2 flex items-center gap-1, no h- class, content is three 5×5px dots

### M-66 · Global tap-highlight removal leaves several header controls with zero tap feedback

**Severity:** Medium · **Effort:** Low · **Screen:** Header controls (NavBar, ThemeSwitcher) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** body sets -webkit-tap-highlight-color: transparent app-wide (index.css:172); NavBar's mute/profile/friends controls and ThemeSwitcher's trigger + dropdown rows carry no active: class, so nothing visibly responds to a tap.

**Why it hurts on mobile —** On the 5 pages that use NavBar (Profile, Friends, Daily, Demo, 404), tapping mute, the profile chip, or a theme option gives no visual confirmation until the resulting state/route change lands — reads as unresponsive.

**Fix —** Add active:scale-95 / active:bg-retro-tint-* to NavBar's buttons and ThemeSwitcher's trigger + dropdown items, matching the active: convention already used on ~57 other components in the codebase.

**User benefit —** Every tap gets instant visual confirmation instead of an ambiguous pause before something happens.

**Evidence:**
- `src/components/NavBar.jsx:67` — mute toggle button — no active: class
- `src/components/NavBar.jsx:40` — profile Link chip — no active: class
- `src/components/ThemeSwitcher.jsx:50` — theme dropdown rows — no active: class

### M-67 · Win celebration is skippable before it plays and the outcome text has no entrance

**Severity:** Medium · **Effort:** Low · **Screen:** End of round (WinEffect + GameStatus) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** WinEffect's confetti is pointer-events-none and GameStatus's PLAY AGAIN button mounts the same instant status flips to 'finished', so it's tappable from frame one; 'YOU WIN!' renders as static text with no entrance animation.

**Why it hurts on mobile —** An eager tap on PLAY AGAIN can cut the 1.8-2.6s confetti short every round; unlike a placed board piece (place-pop), the actual payoff moment gets zero motion treatment — thin next to Duolingo/Clash Royale's held win-beat.

**Fix —** Briefly disable/delay round-end CTAs ~400-500ms and give the winner banner its own entrance (reuse place-pop or a scale+glow-in) so the celebration always plays out before the next action.

**User benefit —** Wins feel earned and celebrated instead of instantly steamrolled by the next tap.

**Evidence:**
- `src/components/WinEffect.jsx:38` — 'fixed inset-0 pointer-events-none z-50' lets taps pass straight through to buttons underneath
- `src/components/GameStatus.jsx:78` — 'YOU WIN!' text rendered with no animation/entrance styling
- `src/components/Cell.jsx:24` — contrast: individual placed pieces get 'animation: place-pop 0.2s ease-out' but the win banner gets none

### M-68 · Bottom safe-area padding lives on 2 containers, missing from ~7

**Severity:** Medium · **Effort:** Low · **Screen:** Home, Profile, Friends, DailyGame, Demo, and Game.jsx's own error/loading/waiting states · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** Only Game.jsx's two happy-path containers add pb-[max(1rem,env(safe-area-inset-bottom))]; every other page root — plus Game.jsx's own LoadingScreen, error screen and family-mismatch screen — uses a flat p-4 with no bottom inset.

**Why it hurts on mobile —** On iPhone 15 Pro/Pro Max, bottom content (last button, last list row) sits flush against the home-indicator gesture bar with zero clearance — exactly where a one-handed thumb rests, risking mis-taps or an accidental system swipe.

**Fix —** Move safe-area-bottom padding into one shared page-shell wrapper (or a Tailwind utility) and apply it to every full-height route, not just the two active-gameplay containers.

**User benefit —** Reliable bottom taps and no home-indicator collisions on any screen, on every modern iPhone.

**Evidence:**
- `src/pages/Game.jsx:1027` — pb-[max(1rem,env(safe-area-inset-bottom))] present on the active-game container
- `src/pages/Profile.jsx:81` — root div is just 'min-h-screen bg-retro-bg', inner content p-4 only — no bottom inset
- `src/pages/Game.jsx:968` — Game.jsx's own error screen uses flat 'p-4', not the inset-aware padding used two states later

**Verifier calibration —** Factually confirmed: Home/Profile/Friends/DailyGame/Demo/Game error states use flat p-4, no bottom inset. But home indicator overlay is translucent w/ generous OS-reserved margin, not truly flush; risk is minor mis-tap not a blocked flow. Downgrading High to Medium.

### M-69 · Three uncoordinated 'go home' patterns depending on which screen you're on

**Severity:** Medium · **Effort:** Medium · **Screen:** Profile/Friends/DailyGame/Demo (NavBar-only) vs Game room & dead-ends (text link) vs NotFound (both at once) · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** Shell pages rely solely on NavBar's 28px icon-only logo (label hidden below sm:); Game.jsx and error screens instead use an unpadded '← HOME' / '← BACK TO HOME' text link; NotFound ships both simultaneously.

**Why it hurts on mobile —** Users learn a 'get me home' gesture on one screen that doesn't exist on the next; the NavBar version has no visible label on any phone, and neither pattern hits a comfortable tap size.

**Fix —** Pick one persistent back/home affordance (the NavBar bar) and apply it everywhere, including inside the game room and error states; delete the redundant text link.

**User benefit —** One learnable, consistently-sized way back to home from any screen.

**Evidence:**
- `src/components/NavBar.jsx:24` — Link wraps only a w-7 h-7 (28px) icon box; label is 'hidden sm:inline'
- `src/pages/Game.jsx:1034` — '← HOME' Link has no padding — font-pixel text-[10px] only
- `src/pages/NotFound.jsx:7` — renders <NavBar/> AND a separate '← BACK TO HOME' Link at line 12 — two redundant affordances on one 404 screen

**Verifier calibration —** Confirmed factually: NavBar logo is 28px icon-only (label hidden <sm), Game.jsx uses unpadded 10px "← HOME" text link, NotFound renders both. Real inconsistency but neither pattern is broken/unusable — downgrading from High to Medium since it's friction/polish, not a blocked core flow.

### M-70 · Toast copy voice splits between arcade ALL-CAPS and casual sentence-case

**Severity:** Medium · **Effort:** Low · **Screen:** Global toasts (sonner) — Home/Game vs Friends/Profile/Onboarding/WaitingRoom · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** In-game toasts read 'MOVE FAILED — CHECK CONNECTION'; social/profile toasts on the identical Toaster chrome read 'Friend code copied!' — opposite personality for the same UI element.

**Why it hurts on mobile —** Voice inconsistency reads as two teams building two products; a player bouncing between Friends and a match hears the app talk to them in two different voices within seconds.

**Fix —** Write one toast-copy guideline (ALL-CAPS pixel voice, matching the rest of the chrome) and route every toast string through it.

**User benefit —** A consistent, on-brand voice that reinforces the arcade identity instead of undercutting it mid-session.

**Evidence:**
- `src/pages/Game.jsx:729` — toast.error('MOVE FAILED — CHECK CONNECTION')
- `src/pages/Friends.jsx:72` — toast.success('Friend added!')
- `src/components/WaitingRoom.jsx:36` — toast.success('Link copied!')

### M-71 · Roll-history MiniDie trail is illegible at 20px on a phone screen

**Severity:** Medium · **Effort:** Low · **Screen:** Game Room — Pig (Dice) board, roll-history strip · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Each MiniDie in the 'at-risk rolls' trail is a 20×20px square (w-5 h-5) holding 4px pips (w-1 h-1) in a 3×3 grid at 80% opacity; up to 12 of them (TRAIL_CAP) are packed edge-to-edge into a 320px-wide (max-w-xs) card.

**Why it hurts on mobile —** At normal phone viewing distance the pip pattern per die cannot be resolved, so the trail meant to let a player watch their push-your-luck streak build reads as an undifferentiated row of grey dots — the game's core tension cue is present but not actually readable.

**Fix —** Render the numeral (or a larger 32px+ die) instead of tiny pips once dice count exceeds a handful, or switch to compact colored number chips for history entries beyond the current one.

**User benefit —** Makes the risk trail an actually-readable indicator of how much is at stake this turn, restoring the intended push-your-luck tension.

**Evidence:**
- `src/components/DiceBoard.jsx:50` — MiniDie: 'w-5 h-5 rounded border ... grid-cols-3 grid-rows-3 gap-0.5 p-0.5 opacity-80'
- `src/components/DiceBoard.jsx:53` — pip rendered as 'w-1 h-1 rounded-full' — 4px dot, unreadable at a glance
- `src/components/DiceBoard.jsx:74` — TRAIL_CAP = 12 — up to 12 of these packed into a 320px max-w-xs card

### M-72 · Fixed 8s question clock doesn't scale for harder problems that also need more NumberPad taps

**Severity:** Medium · **Effort:** Medium · **Screen:** Mental Math — active round · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** QUESTION_MS is a flat 8000ms (mathLogic.js:2) for every difficulty tier. Hard-level problems (index ≥ 40) include 2-3 digit answers up to 225 (mul3 68-71, sq 72-74), requiring 3 taps plus ENTER on the NumberPad vs 1-2 taps for easy problems — with no extra time or tap allowance granted.

**Why it hurts on mobile —** Harder rounds spend the same clock on both longer mental computation and more digit-taps, so the speed-point decay (speedPtsFor, MathGame.jsx:22-24) punishes correct-but-slower typists on 3-digit answers more than it should, rewarding thumb speed over math skill on exactly the questions meant to test skill most.

**Fix —** Scale QUESTION_MS (or pause the speed-decay clock) by expected digit-count/level, so entry time doesn't eat into the same window as computation time.

**User benefit —** Score reflects math ability rather than how fast a player can tap 3 digits before a shared clock runs out.

**Evidence:**
- `src/lib/mathLogic.js:2` — QUESTION_MS = 8000, applied uniformly across easy/medium/hard levels
- `src/lib/mathLogic.js:69` — Hard level mul3/sq answers reach up to 225 (3 digits) within the same 8s window
- `src/pages/MathGame.jsx:263` — answer.length < 5 cap — one digit registered per NumberPad tap, no bulk paste/entry

### M-73 · Centered-overlay modal pattern (not a bottom sheet) is the wrong primitive for mobile, not just under-sized

**Severity:** Medium · **Effort:** Medium · **Screen:** Cross-cutting: Game room (Rules, Switch Game, Invite Friend) and Catalog (Mode/Variant chooser) — 5 shared components, ~30 game pages · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** All 5 overlays (RulesModal, GameSwitcher, ModeChooser, VariantChooser, InviteFriendModal) share one literal pattern: `fixed inset-0 flex items-center justify-center` overlay + a vertically-centered `max-w-sm` panel with a tiny top-corner ✕, dismissed only by tap-outside or that ✕. No bottom-anchored sheet, no drag handle, no swipe-to-dismiss anywhere in the app.

**Why it hurts on mobile —** Vertical centering puts the panel's top (and its only reliable close control) wherever content height happens to land — for GameSwitcher's `max-h-[80vh]` GamePicker grid (RulesModal.jsx:42-45, GameSwitcher.jsx:60-66) that's near the very top of a 667px screen, out of one-handed thumb reach exactly where prior findings flagged the ✕ as hard to hit. Sizing the ✕ up fixes tap-target area but not position; the structural problem is centered modals have no thumb-adjacent dismiss path at all, unlike a sheet whose drag handle/swipe zone sits where the thumb already rests.

**Fix —** Replace the shared overlay with one bottom-sheet primitive (rounded top corners, drag handle, swipe-down-to-dismiss, snap points) reused by all 5 call sites — they already share identical markup (RulesModal.jsx:26 comment, VariantChooser.jsx:1-27, ModeChooser.jsx:16-23), so this is a single-primitive swap, not 5 rewrites. Mirrors Discord/Spotify/Material 3 bottom-sheet convention for exactly this 'pick one of N, dismiss when done' use case.

**User benefit —** Every rules/switch-game/mode/variant/invite interaction (dozens per session across 31 games) gets a thumb-reachable dismiss gesture instead of a tap-a-tiny-X-at-the-top-of-the-screen tax, matching native sheet behavior players already know from other apps.

**Evidence:**
- `src/components/RulesModal.jsx:42` — `fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4` — centered overlay; comment at line 26 explicitly calls this 'the shared pattern' mirrored by GameSwitcher
- `src/components/GameSwitcher.jsx:64` — `w-full max-w-sm max-h-[80vh] overflow-y-auto` panel holding the full GamePicker grid — near-full-viewport centered box; ✕ (line 70-76) lands near screen top, not thumb reach
- `src/components/ModeChooser.jsx:17` — Same `fixed inset-0 ... items-center justify-center` wrapper duplicated verbatim; only dismiss paths are tap-outside (line 19) or the px-1 ✕ (line 30-36) — no swipe gesture

**Verifier calibration —** Read RulesModal/GameSwitcher/ModeChooser fully. Pattern (fixed inset-0, centered panel, ✕) is real and shared, but claim "no thumb-adjacent dismiss path" is false: outer overlay has onClick={onClose} covering the entire viewport including the thumb-reachable bottom area — tapping anywhere outside the panel closes it, no precision ✕-tap needed. RulesModal also has a full-width "GOT IT" button. Bottom-sheet is a legitimate design-system upgrade, but impact is polish/consistency, not blocked dismissal — downgrading High→Medium.

## Low (19)

### M-74 · Recently Played rail overflows with no scroll-snap or edge cue

**Severity:** Low · **Effort:** Low · **Screen:** Home — Recently Played rail · **Reported independently by** 2 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** RecentlyPlayed renders up to 6 chips in a plain flex gap-2 overflow-x-auto row; at typical chip widths (~130-170px each) this overflows a ~343px container with no scroll-snap, no partial-card 'peek', and no edge fade signaling more content off-screen.

**Why it hurts on mobile —** Users may not register that the row scrolls at all, or land on an awkward mid-chip stop instead of a clean card boundary — a small but real polish gap on a rail meant to speed up repeat play.

**Fix —** Add snap-x snap-mandatory with snap-start per chip, and/or a right-edge gradient mask hinting at overflow.

**User benefit —** An obviously scrollable rail that always lands on a full chip.

**Evidence:**
- `src/components/RecentlyPlayed.jsx:34` — flex gap-2 overflow-x-auto pb-1 — no scroll-snap; grep for 'scroll-snap|snap-x' across src returns zero matches

### M-75 · Small game elements shrink below comfortable visibility at phone widths

**Severity:** Low · **Effort:** Low · **Screen:** Tron & Space Duel arenas · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** Tron's GRID=31 grid on a ~343px-wide iPhone SE arena yields ~11px cells for a 1-cell-wide trail; Space Duel's BULLET_R=0.012 yields ~8px bullets on the same arena. Both must be tracked precisely under fast motion.

**Why it hurts on mobile —** A game whose entire premise is 'don't touch the thin line' or 'dodge the small dot' becomes harder to play correctly simply because the phone is small — desktop players judging the same relative geometry at 2-3x the pixel size have a real precision advantage.

**Fix —** Render trails/bullets with a minimum pixel floor (e.g. box-shadow halo or slightly oversized hit-graphic vs. hit-box) so visual size doesn't scale linearly down to arbitrarily small viewports.

**User benefit —** Fair, legible play on small phones without changing game balance or requiring a larger device.

**Evidence:**
- `src/lib/tronLogic.js:11` — export const GRID = 31 — cell ≈ 343px/31 ≈ 11px at iPhone SE arena width
- `src/lib/spaceduelLogic.js:16` — export const BULLET_R = 0.012 — bullet diameter ≈ 0.024×343 ≈ 8px

**Verifier calibration —** Pixel math checks out (~11px Tron cells, ~8px bullets on a 343px arena, confirmed via games.js max-w-md + px-4 padding). But Tron movement is grid-discrete (not pixel-precision dodging), and bullets already render with shadow-glow-dot (a halo) — the exact fix proposed is partially in place. Real but overstated; a quick halo/size bump on Tron trail heads and a bigger glow-dot radius is a small styling tweak, not Medium effort.

### M-76 · No in-round pause/forfeit action — the only visible exit is 'SWITCH GAME' for the whole room

**Severity:** Low · **Effort:** Low · **Screen:** Pong, Snake, Tron, Sumo, Space Duel — mid-match · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** Every realtime page renders `<GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />` unconditionally during the live 'Playing' state, directly under the arena. There is no distinct 'forfeit round' / 'quit' control — the only affordance changes the entire room's game type.

**Why it hurts on mobile —** A player who wants to bail on a losing round has no lightweight way to signal that; their only path is a 2-tap flow (SWITCH GAME → pick another game) that reroutes the whole match for both players, or silently backgrounding the tab — both of which are heavier and more confusing than a simple forfeit.

**Fix —** Add a small 'FORFEIT ROUND' text action distinct from SWITCH GAME, using the existing proposal/consent plumbing so it doesn't unilaterally end things for the opponent.

**User benefit —** A clear, low-friction way to bow out of a round that's already lost, instead of overloading the game-switcher for that purpose.

**Evidence:**
- `src/pages/SumoGame.jsx:237` — GameSwitcher rendered right under the live arena whenever status==='playing', not just at finish
- `src/pages/PongGame.jsx:320` — Same pattern: SWITCH GAME visible during active rallies
- `src/components/GameSwitcher.jsx:22` — default variant='button' opens the full GamePicker for the room — no lighter-weight forfeit option exists

**Verifier calibration —** Confirmed no dedicated forfeit control exists, but "whyItHurts" is factually wrong: onSwitchGame → propose('switch',...) which is consent-gated (ProposalBanner accept/decline in Game.jsx), not a unilateral 2-tap reroute for both players. Since switching already can't be forced on an unwilling opponent, and these are short reflex rounds (Pong/Sumo/etc. end quickly), missing friction is minor polish, not Medium-severity confusion.

### M-77 · Tron's mid-round score row is a static, always-'0 · 0' placeholder

**Severity:** Low · **Effort:** Low · **Screen:** Tron — in-round score row · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** TronArena always renders literal '0' for both sides in the score position (by design — Tron has no incremental mid-round score, only a win/lose result) with no visual distinction from a broken counter.

**Why it hurts on mobile —** On mobile, where players glance quickly rather than read code comments, a score readout that visibly never changes for the entire round can read as a stuck/broken UI element rather than an intentional 'no live score' state, undermining trust in the arena's polish.

**Fix —** Replace the two static zeros with a neutral 'VS' or the round timer/objective text so the row can't be mistaken for a non-functioning score.

**User benefit —** Removes a small but real moment of 'is this broken?' doubt during an otherwise tense, fast round.

**Evidence:**
- `src/components/TronArena.jsx:29` — Score span content is hardcoded '0' for X and O — comment confirms 'Tron has no mid-round score counter, so the score row shows 0/0 placeholders'

### M-78 · Chimp Test, Visual Memory, and Simon all end the round on the very first mis-tap, with no grace

**Severity:** Low · **Effort:** Medium · **Screen:** Chimp Test / Visual Memory / Simon (multiplayer + solo) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** All three memory games hand the round to the opponent the instant a tap lands on the wrong cell/pad — there is no near-miss tolerance or confirm step.

**Why it hurts on mobile —** Touchscreens carry more location noise than a mouse (finger width, parallax); zero grace turns an accidental fat-finger tap into an instant round loss, most acutely on Chimp's denser 5×5 grid (~58px cells, 4px gaps) at higher levels.

**Fix —** Consider a one-time near-miss grace at higher levels, or widen Chimp's inter-cell gap to reduce adjacent-cell mistaps.

**User benefit —** Losses feel earned by a memory failure rather than caused by touch imprecision.

**Evidence:**
- `src/lib/chimpLogic.js:28` — if (layout[progress] !== cellIndex) return { updates: {}, result: { winner: opponent } } — instant loss on any wrong cell
- `src/lib/visualMemoryLogic.js:30` — if (!pattern.includes(cellIndex)) return { updates: {}, result: { winner: opponent } } — instant loss
- `src/lib/simonLogic.js:22` — if (padIndex !== seq[progress]) return { updates: {}, result: { winner: opponent } } — instant loss

### M-79 · Sharing your own friend code has no native-share option, only COPY, despite a working share pattern already in the codebase

**Severity:** Low · **Effort:** Low · **Screen:** Friends / Profile · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The friend-code block offers only a COPY button (clipboard + execCommand fallback); there's no navigator.share entry point, even though shareCard.js already implements a working native-share flow used for Daily results.

**Why it hurts on mobile —** Inviting a friend by code today means copy → switch apps → find the conversation → paste, instead of one tap into the native share sheet (Messages/WhatsApp) that mobile users expect for this exact kind of "invite someone" action.

**Fix —** Add a SHARE button next to COPY that calls navigator.share({text: `Add me on Game Night: ${code}`, url}) when available, falling back to the current copy behavior.

**User benefit —** One tap to send a friend code via the user's preferred messaging app instead of a manual copy-paste round trip.

**Evidence:**
- `src/pages/Friends.jsx:104` — friend-code block: only a COPY button, no share option
- `src/lib/shareCard.js:155` — navigator.share pattern already exists and works elsewhere in the app

### M-80 · Sign-out is a single unconfirmed tap that immediately discards the signed-in session

**Severity:** Low · **Effort:** Low · **Screen:** Profile (Account) · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The full-width SIGN OUT button calls handleSignOut → signOutToGuest() with no confirm step; the account switches to a brand-new anonymous guest immediately, with only a passive toast afterward.

**Why it hurts on mobile —** For a signed-in user, this is the one genuinely destructive-feeling action on the page (their session identity changes instantly); a mis-tap or a curious tap gives no chance to back out before the switch happens.

**Fix —** Add a lightweight confirm (native confirm() or a two-step "tap again to confirm" button state) before calling signOutToGuest().

**User benefit —** No accidental session switch from a stray tap.

**Evidence:**
- `src/pages/Profile.jsx:161` — SIGN OUT button: onClick={handleSignOut}, no confirmation gate
- `src/pages/Profile.jsx:50` — handleSignOut calls signOutToGuest() immediately

### M-81 · ArcadeLoader boot splash blocks first paint behind a fixed ~1s scripted animation, decoupled from real auth latency

**Severity:** Low · **Effort:** Low · **Screen:** App Shell — Boot / Auth Splash · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** AuthContext.jsx renders `<ArcadeLoader variant="boot">` for the entire tree until `authReady()` resolves. The loader's RAM-check sequence runs 6 rows at 140ms + 200ms (~1040ms) regardless of how fast auth actually resolves — unrelated timers.

**Why it hurts on mobile —** On a fast repeat visit (persisted anonymous session, typically <200ms) the loader unmounts mid-animation — an abrupt flash-and-cut rather than an instant open; on a slow connection it shows a static 'READY/SYSTEM OK' screen with no real progress feedback while still waiting.

**Fix —** Skip/shorten the RAM-check choreography once `authReady()` has already resolved (or is very close), so warm repeat opens feel instant rather than a truncated animation.

**User benefit —** Returning users, the majority of sessions, get the app open near-instantly instead of a jittery mandatory splash.

**Evidence:**
- `src/lib/AuthContext.jsx:74` — `if (!booted) return <ConnectingSplash />` gates the whole app tree
- `src/components/ArcadeLoader.jsx:93` — RAM_ROWS scripted at `i*140ms` + 200ms, independent of the auth promise

**Verifier calibration —** Confirmed factually: `booted` flips on authReady() resolution independent of the RAM-check timers, so a fast (<200ms) auth causes the loader to unmount mid-sequence. But impact is a brief (<1s) cosmetic flicker on boot, not a functional/flow blocker — Low severity, Low effort (gate/shorten timers on a ref).</notes>
</invoke>


### M-82 · No scroll-position or category/filter restoration when returning to the catalog

**Severity:** Low · **Effort:** Low · **Screen:** Home (/) — GamePicker · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** `GamePicker`'s `activeCat`, `filters`, and `query` are local `useState` with no persistence; `defaultCat` always resets to `'all'` (layout="full"). Since Home fully unmounts on navigating to a game and remounts fresh on return, any category tab, facet filter (QUICK/THINKY/SOLO OK), or search the user had active — and their scroll position — are lost every time.

**Why it hurts on mobile —** Golden loop #4/#5 (finish game → home → browse more) always dumps the user back at the top of 'ALL' regardless of what shelf or filter they were just browsing, adding repeat navigation work on a very common return trip.

**Fix —** Persist activeCat/filters/query and scrollY to sessionStorage keyed by route, restore on remount.

**User benefit —** Returning to the catalog after a round picks up exactly where the user left off instead of resetting.

**Evidence:**
- `src/components/GamePicker.jsx:25` — `const defaultCat = isFull ? 'all' : ...` — always resets to 'all' on remount, no persisted value read.
- `src/components/GamePicker.jsx:26` — `useState(defaultCat)` for activeCat, `useState({})` for filters (line 35), `useState('')` for query (line 33) — all local, non-persisted.

### M-83 · Catalog card icon buttons (rules, favorite) are ~40×40px — a shade under 44 despite the earlier fix

**Severity:** Low · **Effort:** Low · **Screen:** Home / catalog picker — GameCard · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** RulesButton and the favorite-heart toggle both use `p-3 -m-2` around a ~14–16px icon, computing to a ~38–40px hit box — better than the prior audit's ~16–20px finding (F-37) but still under 44px.

**Why it hurts on mobile —** These sit on every catalog card, tapped whenever a user decides what to play; at ~40px most taps land, but precision still lags best-practice on the screen browsed most often.

**Fix —** Bump padding from p-3 to p-3.5 (14px) to clear 44px cleanly.

**User benefit —** Closes the last few pixels of a control that's already been improved once.

**Evidence:**
- `src/components/RulesModal.jsx:13` — RulesButton: p-3 -m-2 around a 16×16 svg ≈ 40×40px
- `src/components/GameCard.jsx:73` — favorite button: p-3 -m-2 around a 14×14 svg ≈ 38×38px

### M-84 · Zero route-level transition — every navigation is a hard instant cut

**Severity:** Low · **Effort:** Medium · **Screen:** Global routing · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** App.jsx mounts React Router's <Routes> with no transition wrapper; Home→Game, Game→Profile/Friends, and every other navigation swaps the DOM tree with no fade/slide of any kind.

**Why it hurts on mobile —** The rest of the app invests in a cohesive motion vocabulary (place-pop, disc-drop, box-claim); the single most frequent interaction — moving between screens — gets none of it, reading as a plain website rather than an app.

**Fix —** Wrap route changes in a 150-200ms fade (or slide-from-right for forward navigations) using the same ease-out timing already established by place-pop elsewhere in the app.

**User benefit —** Navigating the app feels continuous and native instead of an abrupt reload of each screen.

**Evidence:**
- `src/App.jsx:19` — <Routes> block with no AnimatePresence/transition wrapper around route swaps

### M-85 · Empty states still ship three different visual treatments after the F-31 fix

**Severity:** Low · **Effort:** Low · **Screen:** GamePicker filters, Friends 'no friends yet', Home/Profile stats · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** GamePicker's 'NO GAMES MATCH…' is bare pixel-caps text; Friends' 'No friends yet…' is the bordered mono-sentence-case card the prior audit named as the standard; Home/Profile's 'PLAY A MATCH TO START YOUR RECORD' is bare pixel-caps with no card at all.

**Why it hurts on mobile —** The fix meant to generalize the Friends-page standard shipped a third, different look instead — empty states still don't read as one system despite being flagged and 'fixed' already.

**Fix —** Build one <EmptyState/> (bordered card + brief copy) and use it in all three places.

**User benefit —** Predictable, branded 'nothing here yet' moments instead of three different silences.

**Evidence:**
- `src/components/GamePicker.jsx:136` — emptyState() renders bare '<p className="font-pixel text-[9px] text-retro-dim text-center py-6...">'
- `src/pages/Friends.jsx:173` — bordered-card treatment: 'font-mono text-xs ... bg-retro-card border border-retro-border rounded p-3'
- `src/pages/Home.jsx:349` — 'PLAY A MATCH TO START YOUR RECORD' — bare text, no card/border

### M-86 · retro-p2 is both Player O's identity color and the app's only 'error' color

**Severity:** Low · **Effort:** Medium · **Screen:** PlayerCard, toasts, ProposalBanner DECLINE, offline warnings · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** retro-p2 renders Player O's avatar badge/score/turn-dots and is separately reused as the sole error/danger accent (toast .error border, DECLINE button, 'OPPONENT IS OFFLINE').

**Why it hurts on mobile —** A player seated as O sees their own name, score, and active-turn indicator rendered in the same red used for failures everywhere else in the product, for the entire match.

**Fix —** Introduce a dedicated danger/error token distinct from retro-p2 for errors, declines, and warnings.

**User benefit —** Player O's identity color stops doubling as a persistent error cue.

**Evidence:**
- `src/components/PlayerCard.jsx:14` — 'border-retro-p2 bg-retro-tint-p2/60 shadow-neon-p2' for O's active state
- `src/components/ui/sonner.jsx:20` — toastOptions classNames: "error: 'border-retro-p2!'"
- `src/components/ProposalBanner.jsx:52` — DECLINE button: 'border border-retro-p2 text-retro-p2'

### M-87 · FAIR ROLL anti-cheat badge is functionally invisible — 8px text, no icon, no explainer

**Severity:** Low · **Effort:** Low · **Screen:** Game Room — Pig (Dice) board · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** The only UI surface for the platform's elaborate commit-reveal anti-cheat dice protocol is one line of 8px pixel-font text with no icon or tap target, appearing only after diceSeed is set (which per finding above coincides with the exact window players are already confused).

**Why it hurts on mobile —** A genuine trust/fairness feature (cryptographically provable non-rigged dice, per diceLogic.js's coin-flip protocol) is essentially invisible on a phone screen and, even if noticed, gives players no way to learn what it verifies — wasting the anti-cheat investment as a trust signal.

**Fix —** Promote to a small icon+label chip near the score row (12-14px, matching other badges) with a one-tap explainer, e.g. 'Rolls verified fair by both players'.

**User benefit —** Surfaces a real differentiator (provably fair dice) that builds competitive trust instead of going unnoticed.

**Evidence:**
- `src/components/DiceBoard.jsx:137` — {diceSeed && (<div className="font-pixel text-[8px] text-retro-win text-glow-win">✓ FAIR ROLL</div>)} — no icon, no onClick/explainer
- `src/lib/diceLogic.js:8` — 4-step commit/reveal seed protocol this badge is meant to represent, undocumented in-UI

### M-88 · Timer's 'danger' color reuses the opponent's identity color and collapses in 2 of 6 themes

**Severity:** Low · **Effort:** Low · **Screen:** Mental Math — active round · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** QuestionBar's low-time state uses bg-retro-p2 (line 60) — the same token used for the O player's name/score/streak badge on this exact screen. In the phosphor theme p2=(216,255,216) pale mint vs win=(118,255,118) green (index.css:59,61); in mono, p2/cta/win are all near-grayscale (index.css:135-137).

**Why it hurts on mobile —** In phosphor/mono the 3-tier color urgency cue nearly disappears (green-vs-green, gray-vs-gray), so players can't glance-tell 'plenty of time' from 'almost out'; on any theme, reusing the opponent's identity color as 'danger' is a semantic clash under pressure.

**Fix —** Drive the countdown from a theme-independent warn ramp (or the existing p1-vs-p2-agnostic cta/win pair only) and add a non-color cue like a pulse for the final 2 seconds.

**User benefit —** Consistent, unambiguous urgency cue no matter which of the 6 themes a player has chosen.

**Evidence:**
- `src/pages/MathGame.jsx:60` — pct > 0.3 ? 'bg-retro-cta' : 'bg-retro-p2' — reuses opponent's accent color as the danger state
- `src/index.css:59` — phosphor: --c-p2: 216 255 216 vs --c-win: 118 255 118 (both pale green)
- `src/index.css:135` — mono theme: p2/cta/win are all near-grayscale (176,175,164 / 250,249,240 / 255,255,248)

**Verifier calibration —** Confirmed code: MathGame.jsx:60 uses bg-retro-p2 as danger tier, same token as O's identity color (ScoreBar sits directly above, line 418). But the "collapses" claim is overstated: computed RGB Euclidean distances show phosphor p2-vs-win ≈139/441 (moderately distinct, not indistinguishable) and mono's real near-collapse is cta-vs-win (dist≈11), not p2-vs-{cta,win} (dist≈130-140) as implied. Also found this same p2-as-danger pattern already used for the TIME LEFT digit (line 411), so it's an established convention, not isolated. Semantic clash (reusing opponent color for danger) is real but is a subtle glance-legibility nit on a thin 6px bar, not a functional blocker — polish-level, not Medium.

### M-89 · Leaderboard rows look tappable but carry zero interactivity

**Severity:** Low · **Effort:** Low · **Screen:** Friends — Leaderboard · **Reported independently by** 1 **auditor(s)** · **Verification:** ADJUSTED

**Problem —** Each row (rank, avatar, name, W-L, win%) has no onClick, role, cursor-pointer, or hover state — it's a plain div. Visually it matches an interactive list-item pattern (avatar + name + accent border for 'you') but is inert; there is no per-user profile route (App.jsx has only /profile for self) and no wire-up to InviteFriendModal.

**Why it hurts on mobile —** Users naturally tap a leaderboard entry expecting to view that friend's stats or challenge them — Chess.com/Duolingo leaderboards are tappable to a profile card. A dead tap on mobile (no ripple, no navigation) reads as broken, not intentional.

**Fix —** Either add a lightweight tap affordance (open a stats sheet or trigger InviteFriendModal pre-filled to that friend) or visually demote rows (remove border/avatar emphasis) so they read as static data, not a list control.

**User benefit —** Removes a dead-end tap and turns a passive stat block into a path toward starting a match with the friend you're already looking at.

**Evidence:**
- `src/pages/Friends.jsx:222` — row div: `flex items-center gap-3 bg-retro-card border rounded p-2.5` — no onClick/cursor/role
- `src/App.jsx:26` — only `/profile` route exists (self); no `/profile/:uid` to link a leaderboard row to

**Verifier calibration —** Confirmed: row div (Friends.jsx:245-248) has no onClick/role/cursor-pointer; no /profile/:uid route. Real but minor polish issue, not a broken-feeling control (leaderboard rows commonly are static). Fix (remove border/avatar emphasis or add handler) is <1hr, so effort is Low not Medium.

### M-90 · Double-digit rank can visually collide with the avatar

**Severity:** Low · **Effort:** Low · **Screen:** Friends — Leaderboard · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** Rank is `w-4` (16px) fixed-width, `text-center`, `font-pixel text-[11px]`. Press Start 2P glyphs run wide (~7-8px/char); two digits ('10', '11') approach or exceed the 16px box with no `overflow-hidden`/`truncate` guard, and only a 12px gap (`gap-3`) separates it from the 36px avatar.

**Why it hurts on mobile —** In a friend group of 10+, tied or ranked entries beyond #9 can render with the rank digits crowding or touching the avatar, which reads as a layout bug in an otherwise pixel-precise retro UI.

**Fix —** Widen the rank column to `w-6`/`w-7` or drop to `text-[10px]` so two-digit ranks fit with margin.

**User benefit —** Keeps rank legible and avoids visual glitches as friend groups and leaderboards grow.

**Evidence:**
- `src/pages/Friends.jsx:226` — `<span className="font-pixel text-[11px] text-retro-dim w-4 text-center shrink-0">{e.rank}</span>`

### M-91 · '(you)' self-tag lives inside the truncating name string

**Severity:** Low · **Effort:** Low · **Screen:** Friends — Leaderboard · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** `{e.displayName}{e.isMe ? ' (you)' : ''}` is concatenated into one `truncate` paragraph. On a longer display name at the ~178-193px name column available on a 375/360px screen, ' (you)' is the first thing clipped off by CSS ellipsis.

**Why it hurts on mobile —** The one textual cue that this is the current user's own row can silently disappear for exactly the users most likely to have a long name, leaving only the cta-border color as the (less obvious) signal.

**Fix —** Render '(you)' as a separate `shrink-0` badge after the truncating name span, not inside the same truncated string.

**User benefit —** Guarantees users can always spot their own row regardless of name length.

**Evidence:**
- `src/pages/Friends.jsx:229` — `<p className="font-mono text-sm text-retro-text truncate">`
- `src/pages/Friends.jsx:230` — `{e.displayName || '…'}{e.isMe ? ' (you)' : ''}` — suffix inside the truncated string

### M-92 · W-L record rendered at 8px, the smallest text on the row

**Severity:** Low · **Effort:** Low · **Screen:** Friends — Leaderboard · **Reported independently by** 1 **auditor(s)** · **Verification:** CONFIRMED

**Problem —** `{e.wins}W-{e.losses}L` uses `font-pixel text-[8px]`, smaller than the rank (11px) and win% (10px) on the same row. Press Start 2P's blocky glyphs are harder to parse at small sizes than a regular sans digit, and this is the only place raw win/loss counts appear.

**Why it hurts on mobile —** The one piece of data letting a user sanity-check the win% (e.g. tell '2W-1L' apart from '7W-1L' at a glance) is the hardest to read, undercutting quick comparison — the core job of a leaderboard.

**Fix —** Bump to `text-[9px]`/`text-[10px]` or switch this substat to `font-mono` to match the sharper legibility used for names.

**User benefit —** Makes the actual comparison numbers easy to skim instead of squint at.

**Evidence:**
- `src/pages/Friends.jsx:232` — `<p className="font-pixel text-[8px] text-retro-dim">{e.wins}W-{e.losses}L</p>`
