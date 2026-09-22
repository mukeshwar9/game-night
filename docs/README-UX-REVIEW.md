# Game Night UX Review and Improvement Plan

> **Direction: keep the arcade identity and remove friction between choosing a game and making the first move.**

- **Review date:** September 15, 2026.
- **Status:** Review and proposed implementation plan; application changes have not been implemented.
- **Selected direction:** The focused playability pass: board-first solo play, keyboard-safe sheets, and readable discovery.
- **Decision record:** The user selected that direction in Lavish with the feedback, “lets go with this,” and then requested this detailed README. The broader redesign remains a proposal, not part of the selected first pass.
- **Visual companion:** [Interactive before-and-after review](../.lavish/ux-review/index.html).

This document preserves the findings, mockup concepts, priorities, implementation boundaries, trade-offs, and verification criteria from the Lavish review. It is a dated snapshot, not proof that the recommendations have shipped.

## Contents

1. [Executive assessment](#1-executive-assessment)
2. [Evidence and review limitations](#2-evidence-and-review-limitations)
3. [Existing strengths to preserve](#3-existing-strengths-to-preserve)
4. [Prioritized improvements](#4-prioritized-improvements)
5. [Detailed findings](#5-detailed-findings)
6. [Before-and-after design concepts](#6-before-and-after-design-concepts)
7. [Selected implementation scope](#7-selected-implementation-scope)
8. [Deferred second pass](#8-deferred-second-pass)
9. [Source-only multiplayer follow-up](#9-source-only-multiplayer-follow-up)
10. [Verification and usability testing](#10-verification-and-usability-testing)
11. [Risks and implementation guardrails](#11-risks-and-implementation-guardrails)
12. [Delivery checklist and stop condition](#12-delivery-checklist-and-stop-condition)
13. [Review artifacts](#13-review-artifacts)

## 1. Executive assessment

Game Night already has a recognizable visual identity, a substantial game library, and useful discovery and social foundations. It feels like an arcade rather than a generic dashboard. A wholesale visual rebrand is not the highest-value next step.

The main opportunity is **reducing repeated decisions and making the next action obvious**.

The clearest example is solo play. After choosing a specific game and selecting “VS AI,” the user reaches `/solo/:type`, but the screen still presents another game catalog above the active game. At a 390 × 844 viewport, the Tic Tac Toe board is only partially visible. The interface asks the user to keep browsing after they have already decided what to play.

Other observed issues reinforce that friction:

- A modal options sheet does not contain keyboard focus.
- Game metadata is rendered in 6–7 px pixel type on mobile.
- Mobile cards hide the descriptions that explain unfamiliar games.
- First-time visitors encounter identity customization before discovering the catalog.
- Filters and categories compete in the same horizontal row.
- Secondary destinations and repeated branding compete with joining or starting a game.

**Recommendation:** ship a narrow playability pass first. Evaluate onboarding and home-layout changes afterward through a short usability check. Do not add more product features to compensate for discovery friction.

## 2. Evidence and review limitations

### Review method

The review combined source inspection with screenshots and a focused keyboard interaction check against the running local app.

Capture conditions:

- App served at `http://localhost:5173`.
- An isolated browser context, not the user's normal signed-in profile.
- Default midnight theme.
- Reduced-motion preference enabled.
- Mobile viewport: **390 × 844**.
- Desktop home viewport: **1440 × 1000**.
- Firebase requests blocked to avoid creating profiles, rooms, or presence records.
- Local onboarding state seeded for catalog inspection rather than completing the profile-writing action.

The screenshots show real application components. They do **not** establish that live multiplayer or authenticated social flows work correctly.

### Captured screens

| Screen | Evidence |
| --- | --- |
| First-visit welcome | [Mobile screenshot](../.lavish/ux-review/current-welcome-mobile.png) |
| Name/avatar setup | [Mobile screenshot](../.lavish/ux-review/current-identity-mobile.png) |
| Home catalog | [Mobile screenshot](../.lavish/ux-review/current-home-mobile.png) |
| Game options sheet | [Mobile screenshot](../.lavish/ux-review/current-options-mobile.png) |
| Home catalog | [Desktop screenshot](../.lavish/ux-review/current-home-desktop.png) |
| Solo Tic Tac Toe | [Mobile screenshot](../.lavish/ux-review/current-solo-mobile.png) |

### Concrete observations

- The captured catalog reported **44 base games**. This is a snapshot; future UI should derive the count from the registry.
- On mobile home, the first Tic Tac Toe card started approximately **434 px** below the top of the document.
- That card's title was **10 px**, player count **7 px**, and duration **6 px**.
- Its description existed in the DOM but had `display: none` at the mobile viewport.
- The solo Tic Tac Toe route rendered **17 board-game tiles** before the active game.
- Opening the options sheet left keyboard focus outside the dialog, on the originating card.
- Pressing Tab then moved focus to the background favorite button, still outside the dialog.
- No document-level horizontal overflow was detected in the captured app screens at their tested sizes. Readability and vertical prioritization remain issues even when horizontal overflow is absent.

The measurements and focus checks are recorded in [evidence.json](../.lavish/ux-review/evidence.json).

### What was not verified

This was not a full accessibility, performance, or multiplayer audit. The following remain unverified:

- Live room creation and joining.
- Real invitations and authenticated Friends/Profile behavior.
- Reconnection, peer-to-peer connection failure, and recovery.
- End-of-round, rematch, and game-switch journeys.
- Screen-reader announcements and reading order.
- Real-device Android back gestures or iOS behavior.
- All games, modes, variants, and viewport combinations.
- Contrast compliance across every theme.
- Actual conversion, retention, or time-to-first-move improvements.

Priorities below are based on observed friction and code evidence, not measured business impact.

## 3. Existing strengths to preserve

### Arcade identity

Keep the midnight surfaces, semantic neon accents, pixel-art icons, and self-hosted pixel font. They give the app a distinctive personality.

The mockups deliberately reuse the product's own design language:

- Color tokens from [`src/index.css`](../src/index.css).
- `Press Start 2P` from the existing self-hosted font asset.
- Pixel headings combined with mono supporting text.
- Existing player, action, and surface color roles.

The proposal is not a replacement design system. It changes hierarchy and readability within the current one.

### Explicit play choices

The catalog already opens a `GameOptionsSheet` with online, solo, same-device, variant, and rules choices where supported. A normal home-card tap does not silently create a Firebase room.

Preserve this intentionality. The recommendation is to clarify the choices, not remove the confirmation boundary and accidentally create rooms again.

### Useful discovery and navigation foundations

The app already has:

- Search and category filtering.
- Favorites.
- Continue Playing.
- Recently Played.
- Sticky discovery controls.
- Restored home scroll position and picker state.
- Persistent navigation on the main non-game pages.
- Optional identity upgrade rather than a mandatory permanent account.
- Reduced-motion styling.

Improve these existing systems rather than adding parallel pickers, new recommendation infrastructure, or another navigation layer.

## 4. Prioritized improvements

| ID | Priority | Improvement | Evidence | Relative effort | Delivery status |
| --- | --- | --- | --- | --- | --- |
| UX-01 | P1 | Put the selected solo game before the catalog | Browser + source | Small–medium | Selected first pass |
| UX-02 | P1 | Make the options sheet a keyboard focus boundary | Reproduced keyboard behavior | Small | Selected first pass |
| UX-03 | P1 | Improve metadata readability and input labeling | Browser + source | Small–medium | Selected first pass |
| UX-04 | P2 | Allow discovery before identity customization | Browser + source | Medium | Deferred |
| UX-05 | P2 | Clarify play intent and separate competing controls | Browser + source | Medium | Deferred |
| UX-06 | P2 | Promote recent play and simplify home hierarchy | Browser + source | Small–medium | Deferred |
| UX-07 | Follow-up | Consider share-first mobile waiting rooms | Source only | Not estimated | Capture live behavior first |

“Small” and “medium” are planning estimates, not delivery commitments. Shared-sheet changes may affect more callers than their small source footprint suggests.

## 5. Detailed findings

### UX-01: Put the game before the game picker

**Current behavior**

`Demo` routes valid solo deep links into `DemoHub`. The hub selects the requested game but still renders category tabs and its game grid above the active component.

The current journey is:

1. Choose a game from Home.
2. Select “VS AI.”
3. Arrive at the selected game's solo route.
4. Encounter another category/grid selector.
5. Scroll to reach the board.

The repeated selection UI does not respect the intent already expressed in steps 1–2. The “Demo” label also makes a playable mode sound provisional.

**Proposed behavior**

- Treat a valid `/solo/:type` route as explicit play intent.
- Show the active game, player information, and immediate instruction first.
- Put the existing picker behind an explicit “Change game” control.
- Keep `/demo` as the browsing hub.
- Label explicit solo play “Solo” or “Solo play,” rather than “Demo.”

**Implementation guidance**

Primary file: [`src/pages/Demo.jsx`](../src/pages/Demo.jsx), especially `Demo`, `DemoHub`, and the existing `DEMOS` entries.

Reuse the current components, game selection state, and keyed remount behavior. Do not duplicate game engines or create a second game registry. Preserve intentional solo-play recording and existing local-play routing.

Party entries that only explain multiplayer requirements must not become falsely advertised as playable solo games. Preserve their eligibility behavior.

**Acceptance criteria**

- [ ] At 390 × 844, the entire Tic Tac Toe board and turn instruction are visible without scrolling after choosing solo play.
- [ ] “Change game” is visible and opens the existing selection experience on demand.
- [ ] `/demo` remains a useful browsing hub.
- [ ] `/local/:type` behavior is unchanged.
- [ ] Switching games still resets the selected game appropriately.
- [ ] Direct navigation, reload, and back navigation behave consistently.
- [ ] Invalid and ineligible routes retain a deliberate fallback rather than crashing or advertising unsupported play.
- [ ] Other games receive individual board-fit checks; the Tic Tac Toe result is not generalized to the entire library.

### UX-02: Make the options sheet a real focus boundary

**Current behavior**

The shared `BottomSheet` declares `role="dialog"` and `aria-modal="true"`, but the browser check showed that focus remained in the background. Tab moved to the card's favorite button while the sheet remained open.

A modal that is visually blocking but keyboard-permeable can lead users to interact with content they cannot clearly see.

**Proposed behavior**

- Capture the opener before displaying the sheet.
- Move initial focus into the sheet.
- Keep Tab and Shift+Tab within the sheet.
- Make background content inert while the sheet is open.
- Prevent background scrolling.
- Restore focus to the opener after closing, if it still exists.
- Preserve all existing dismissal mechanisms.

**Implementation guidance**

Primary file: [`src/components/BottomSheet.jsx`](../src/components/BottomSheet.jsx).

The behavior belongs in the shared primitive, not in each options-sheet caller. If background inertness requires a portal, mount the dialog outside the subtree being made inert. Never mark an ancestor of the active dialog inert.

Preserve:

- Escape dismissal.
- Backdrop dismissal.
- Mobile drag-to-dismiss behavior.
- Existing animation and safe-area layout.
- `useModalHistory` back handling and its `onBack` override.
- Existing title/label ownership by callers.

Restore any pre-existing scroll and inert state during cleanup. Consider multiple or rapidly replaced overlays, and handle an opener that has been removed from the DOM. A sheet with no currently enabled interactive children still needs a safe focus target.

**Acceptance criteria**

- [ ] Initial focus is inside the dialog when it opens.
- [ ] Tab wraps from the last focusable control to the first.
- [ ] Shift+Tab wraps in the opposite direction.
- [ ] Background controls cannot receive focus or pointer interaction.
- [ ] Background content does not scroll while the sheet is open.
- [ ] Escape closes the dialog and focus returns to a valid opener.
- [ ] Backdrop, drag, and hardware/gesture back behavior remain functional.
- [ ] Closing or unmounting restores previous document state without leaving the app inert or scroll-locked.
- [ ] The dialog's accessible name and screen-reader behavior are checked separately from keyboard focus.

### UX-03: Use pixel typography for character, not every detail

**Current behavior**

`GameCard` uses 6–7 px pixel text for duration and player count. The descriptive line is hidden below `sm`. This preserves density at the cost of explaining what unfamiliar games are and how they fit the user's available time or group.

The search and room-code inputs also rely on placeholder text instead of a clear, associated field label. On the captured mobile home, the narrow code field clipped its placeholder.

**Proposed behavior**

- Keep pixel game titles, branding, and selected score treatments.
- Use readable mono type for player count, duration, and descriptive copy.
- Target **12–14 px** for supporting metadata and at least **14 px** for important instructions.
- Keep a concise existing game description visible on mobile.
- Add visible labels programmatically associated with search and room-code inputs.
- Keep placeholders supplementary rather than treating them as labels.

These sizes are design targets, not a claim that font size alone establishes accessibility compliance.

**Implementation guidance**

Primary files:

- [`src/components/GameCard.jsx`](../src/components/GameCard.jsx).
- [`src/components/GamePicker.jsx`](../src/components/GamePicker.jsx).
- [`src/pages/Home.jsx`](../src/pages/Home.jsx).

Use existing descriptions and metadata rather than inventing a second copy source. Associate labels with unique input IDs; avoid collisions if multiple picker instances render together.

Keep `getPlayerTag`, duration metadata, favorite behavior, loading/disabled states, and card-to-options behavior intact. Use semantic theme tokens rather than hardcoded colors.

**Acceptance criteria**

- [ ] Mobile cards retain a useful short description.
- [ ] Player count and duration no longer rely on 6–7 px pixel text.
- [ ] Search and room-code fields have visible, programmatic labels.
- [ ] Long game names, descriptions, and metadata wrap without clipping or overlapping controls.
- [ ] Normal text meets a 4.5:1 contrast target; test across themes rather than assuming a larger font fixes contrast.
- [ ] At 200% zoom, content remains readable and controls remain operable.
- [ ] Cards and forms have no unintended horizontal overflow at tested widths.
- [ ] Existing reduced-motion behavior remains intact.

**Trade-off**

Larger text and visible descriptions may show fewer cards per viewport. That is acceptable if users can understand and choose a game more easily. Evaluate successful choice, not only card density.

### UX-04: Let new visitors discover games before customizing

**Current behavior**

The normal first-visit Home flow presents:

1. An arcade welcome with “INSERT COIN TO PLAY.”
2. “PLAY AS GUEST” or Google sign-in.
3. Name and avatar customization.
4. The catalog after completing setup.

The avatar system is expressive, but it demands attention before the visitor has seen what they can play. “INSERT COIN” is on-brand, yet may imply a payment requirement that the product does not have.

**Proposed behavior**

- Keep an arcade-styled welcome with a clear explanation of the product.
- Offer one-click guest entry using generated defaults.
- Defer name/avatar customization to Profile or another optional later moment.
- Keep Google sign-in secondary and explain its cross-device benefit.
- Clearly state that no account is required.

Example copy from the concept:

- “Good games. Great company.”
- “Play a quick solo round or send a room link to a friend.”
- Primary action: “Let's play.”
- Secondary action: “Sign in to sync progress.”
- Reassurance: “Free to play. No account required. Choose your name and avatar later.”

**Implementation guidance**

Relevant files: [`src/components/Onboarding.jsx`](../src/components/Onboarding.jsx), [`src/lib/onboarding.js`](../src/lib/onboarding.js), and [`src/pages/Home.jsx`](../src/pages/Home.jsx).

Reuse existing guest identity and avatar defaults. Do not add a parallel identity system, bypass Firebase Auth identity, overwrite a returning profile, or discard an invite destination.

**Acceptance criteria**

- [ ] One guest-entry action reaches the catalog without typing a name or choosing an avatar.
- [ ] Returning profiles and customized avatars are preserved.
- [ ] Optional sign-in remains discoverable.
- [ ] Invite visitors retain their destination through any identity step.
- [ ] Local-guest fallback remains intentional when authentication is unavailable.
- [ ] The welcome explains the value of the app without suggesting payment is required.

**Status:** Deferred to the second pass. Not included in the selected playability implementation.

### UX-05: Clarify play intent and reduce competing controls

**Current behavior**

The full picker places Quick, Thinky, and Solo OK before the category tabs in the same horizontally scrolling row. At 390 px, these controls and All occupy the initial visible area; additional categories require horizontal exploration.

The options sheet is explicit, but some labels require translation:

- “PLAY ONLINE” creates a private room; it does not find a public opponent.
- “VS AI” is appropriate only when a computer opponent actually exists.
- “2P PASS” describes a play mode less clearly than “Same device.”

**Proposed behavior**

Start with a low-risk copy improvement:

| Current label | Proposed label | Meaning |
| --- | --- | --- |
| PLAY ONLINE | Create a room | Start a private room and share its link |
| VS AI | Play solo | Start an eligible solo activity; mention the computer only where applicable |
| 2P PASS | Same device | Take turns on one device |
| MORE MODES | Keep or clarify contextually | Choose a supported game variant |
| RULES | How to play | Explain the selected game's rules |

Then compare that copy-only approach with the broader concept of a separate play-intent selector:

- Solo.
- With friends.
- Same device.

Do not confuse play mode with game category. A strategy game can support multiple play modes; “solo” is not a replacement for “board.”

**Implementation guidance**

Relevant files: [`src/components/GamePicker.jsx`](../src/components/GamePicker.jsx), [`src/components/GameOptionsSheet.jsx`](../src/components/GameOptionsSheet.jsx), and the capability helpers in [`src/lib/games.js`](../src/lib/games.js).

Mode eligibility must continue to come from the registry and existing helpers such as `supportsLocalPlay`. Variants may have different capabilities from their base game. Do not introduce a hand-maintained UI-only capability list.

**Acceptance criteria**

- [ ] Users can tell that creating a room requires sharing or inviting, not matchmaking.
- [ ] Solo copy does not imply an AI opponent for standalone skill activities.
- [ ] Unsupported modes are not presented as playable.
- [ ] Variant selection still respects actual solo and same-device support.
- [ ] If a mode selector is introduced, users can reset to the full library.
- [ ] Existing category/search/filter behavior is preserved or deliberately specified, not accidentally changed.

**Status:** Deferred. Test clearer copy before committing to additional global mode state.

### UX-06: Promote the next useful action, not every feature

**Current behavior**

Home repeats branding already present in the global header. The utility row puts Daily beside the narrow room-code input. The Emoji Lab occupies a prominent position near the logo, while Notes is a primary bottom-tab destination.

Continue Playing already appears before the catalog. Recently Played, however, appears after the entire catalog, where returning users may not reach it quickly.

**Proposed behavior**

- Keep Continue Playing near the top.
- Move Recently Played above full discovery when history exists.
- Make room joining a clearly labeled action with enough space for a usable form.
- Reduce repeated branding rather than removing the product identity.
- Give first-time visitors a small number of understandable starter choices, followed by the full catalog.
- Consider moving Notes and Emoji Lab to secondary destinations unless usage evidence supports their prominent placement.
- Keep Daily discoverable without forcing it to compete with the room-code field.

**Implementation guidance**

Relevant files: [`src/pages/Home.jsx`](../src/pages/Home.jsx), [`src/components/ContinuePlaying.jsx`](../src/components/ContinuePlaying.jsx), [`src/components/RecentlyPlayed.jsx`](../src/components/RecentlyPlayed.jsx), and [`src/components/BottomTabBar.jsx`](../src/components/BottomTabBar.jsx).

Preserve routes even if links move. Keep the current home scroll and picker-state restoration. A new ordering should not accidentally auto-resume a finished room or turn a recent-game shortcut into a different mode without explanation.

**Acceptance criteria**

- [ ] Returning players see resumable rooms and recent games before the full catalog.
- [ ] Finished or unavailable rooms have an intentional state, not an automatic resume attempt.
- [ ] A visitor can identify how to join an existing room immediately.
- [ ] The full library, search, and favorites remain available.
- [ ] Navigation changes preserve access to existing features and routes.
- [ ] Decisions about Notes and Emoji Lab are informed by usage or task testing, not aesthetic preference alone.

**Status:** Deferred to the second pass.

## 6. Before-and-after design concepts

The Lavish artifact contains three illustrative concepts. Their controls demonstrate hierarchy and intent; they do not create rooms, sign users in, or run game logic.

### A. Solo play: respect the completed choice

**Current:** global header, Demo label, category tabs, game grid, then the selected game.

**Proposed:**

1. Compact Game Night header with a Solo play context.
2. Game title and “Change game.”
3. Player identities and turn state.
4. A direct instruction: “Your turn. Tap an empty square.”
5. The board.
6. Brief rules and an optional “How to play” control.

The mockup includes a static Tic Tac Toe board, an expandable change-game explanation, and a rules disclosure. These illustrate layout, not a replacement game implementation.

### B. Home: a clear starting point followed by the library

**Current:** repeated branding, Daily/code utility row, search, combined filters/categories, and a large catalog.

**Proposed:**

1. Compact header.
2. “What shall we play?” with a clear no-account promise.
3. “Have a room code?” / “Join a room.”
4. Optional Solo / With friends / Same device intent controls.
5. A small Quick Picks section with readable descriptions, duration, and action labels.
6. An explicit “Browse and search all games” entry.
7. Daily challenge as a separate secondary section.
8. A simplified primary navigation concept.

Tic Tac Toe and Connect Four are static example starter picks, not personalized recommendations. A future returning-user treatment should prioritize existing history rather than inventing a recommendation service. The displayed game count must be derived from the registry in any implementation.

This is broader than the selected first pass. The first pass does not introduce this home layout or move navigation destinations.

### C. Welcome: communicate value before asking for customization

**Current:** arcade slogan, guest/sign-in choice, then a full identity screen before catalog discovery.

**Proposed:**

1. A short product promise.
2. Small examples of available games.
3. One strong guest-entry action.
4. Secondary sign-in for syncing progress.
5. Clear reassurance that identity customization can happen later.

The welcome mockup's primary action switches to the home mockup only. It does not save a profile or authenticate a user.

## 7. Selected implementation scope

### Scope summary

The selected pass contains exactly three improvements:

1. **Board-first explicit solo routes.**
2. **Keyboard-safe shared sheets.**
3. **Readable card metadata and labeled discovery inputs.**

### Expected source ownership

| File | Intended responsibility |
| --- | --- |
| `src/pages/Demo.jsx` | Distinguish explicit solo play from hub browsing; expose the picker on demand |
| `src/components/BottomSheet.jsx` | Own focus containment, initial/return focus, background inertness, and scroll restoration |
| `src/components/GameCard.jsx` | Improve supporting typography and retain mobile descriptions |
| `src/components/GamePicker.jsx` | Associate a visible label with search while retaining picker behavior |
| `src/pages/Home.jsx` | Associate a visible label with the room-code field while retaining join/create behavior |

This is an ownership map, not a mandate to change every file or prohibit a small necessary supporting helper. Any additional file should directly support these acceptance conditions, not start a wider refactor.

### Explicit non-goals

Do not include the following in the first pass:

- The new home-page layout.
- Global mode-first browsing.
- Onboarding or identity-flow changes.
- Recently Played reordering.
- Notes or Emoji Lab navigation changes.
- Waiting-room redesign.
- Game rules, AI behavior, physics, or scoring changes.
- Firebase schema, seat-claim, room-creation, or presence changes.
- New matchmaking or recommendation infrastructure.
- A theme replacement or new design system.
- A broad rewrite of `Demo.jsx` merely because it is large.

### Suggested implementation order

1. Capture baseline screenshots and record the keyboard reproduction.
2. Implement the focused solo layout using existing game components.
3. Implement shared-sheet focus behavior and verify representative callers.
4. Improve metadata and labels without changing discovery behavior.
5. Run the verification matrix and compare before/after screenshots.
6. Record any checks that require unavailable real devices or multiplayer setup.
7. Stop when the three selected improvements meet their acceptance conditions.

## 8. Deferred second pass

After the focused pass, run a short usability check before changing information architecture.

Candidate work:

- One-click guest discovery with deferred customization.
- Recent play before the full catalog.
- Clearer play-mode labels.
- A comparison between copy-only changes and mode-first browsing.
- Less duplicated branding and a room-join action with a dedicated, readable form.
- Evidence-based placement of secondary destinations.

### Alternative directions retained from the review

- **Focused playability:** selected; addresses the clearest reproduced issues without a broad redesign.
- **Broader home refresh:** explore discovery and onboarding together before implementation.
- **Copy-only iteration:** retain current layouts while clarifying actions and mode names.
- **Multiplayer-first review:** inspect real lobby, invite, reconnect, and rematch journeys before choosing additional work.

These alternatives are not all intended to ship. They are different ways to choose the next product slice.

## 9. Source-only multiplayer follow-up

### UX-07: Consider a share-first mobile waiting room

[`src/components/WaitingRoom.jsx`](../src/components/WaitingRoom.jsx) currently places a **150 px QR code** before Share/Copy and the room-code text.

A possible improvement is:

- **Mobile:** lead with sharing or copying the room link; keep the code readable; provide QR as an alternative.
- **Desktop or co-located play:** keep QR prominent when a second device is likely to scan the host's screen.

This recommendation is based on source order, not a captured live lobby. Do not claim a confirmed mobile fold or conversion problem without testing the real room screen.

Before prioritizing it, capture:

- A host waiting for a second player.
- A second player opening the invite.
- A ready-to-start room.
- Share success, cancellation, and clipboard fallback.
- A disconnected or reconnecting player.
- A completed round and rematch proposal.

Use separate browser profiles or devices for distinct players. Two regular tabs share identity and are not a valid two-player test.

## 10. Verification and usability testing

### Automated project checks for a future implementation

Run from the repository root:

```bash
npm test
npm run lint
npm run build
```

These checks should bracket code changes where practical. Unit tests cover pure logic; passing them does not prove focus behavior, multiplayer correctness, or visual layout.

No application test/build run was needed for this documentation-only addition. The checks below are implementation requirements, not completed claims.

### Responsive and accessibility matrix

| Area | Required check |
| --- | --- |
| Widths | 360, 390, 768, and 1440 px |
| Primary solo target | Full Tic Tac Toe board and instruction at 390 × 844 |
| Keyboard | Open, Tab, Shift+Tab, Escape, return focus, and background isolation |
| Zoom | 200% with usable controls and no lost content |
| Text contrast | Check normal text against 4.5:1 across all themes |
| Long content | Long game names, descriptions, player names, and field labels |
| Motion | Preserve reduced-motion behavior |
| Mobile overlays | Drag dismissal, scrolling, safe areas, and on-screen keyboard |
| Browser history | Back closes the intended sheet or returns to the intended route |
| Screen reader | Dialog naming, focus, reading order, and labeled fields |
| Identity states | New local guest, returning guest, and existing profile |

Real-device behavior must be reported as unverified when the device is unavailable. Desktop emulation is useful but is not proof of Android gesture-back or iOS behavior.

### Functional regression matrix

- `/demo` remains browse-first.
- A valid `/solo/:type` route becomes game-first.
- Direct solo entry, reload, and game switching remain coherent.
- `/local/:type` keeps existing same-device behavior.
- Unsupported modes and invalid types do not expose broken play paths.
- Solo play recording is neither lost nor accidentally duplicated.
- Search, filters, categories, favorites, and restored picker state still work.
- Home scrolling/restoration remains predictable.
- Catalog taps still open options rather than silently creating rooms.
- Room-code submission and online room creation retain their existing behavior.
- Shared sheet callers do not leave background content inert after closing.

### Usability tasks

Use the same task wording before and after changes:

1. **New visitor, solo:** “Play one move of Tic Tac Toe by yourself.”
2. **Private multiplayer:** “Start a game that a friend can join from another device.”
3. **Same-device play:** “Find a game two people can play on this phone.”
4. **Returning visitor:** “Continue the room you were playing earlier.”
5. **Discovery:** “Find a game that fits a short break.”

Observe:

- Time to the first intentional game interaction.
- Whether users understand that Create a room requires sharing or inviting.
- Wrong-mode selections and backtracking.
- Whether users notice the room-join action.
- Whether descriptions and duration help users choose.
- Whether users can complete the flow without assistance.
- Keyboard-only completion of the same relevant tasks.

Establish a baseline before claiming improvements. No percentage reduction, conversion lift, or retention gain was measured during this review.

### What was validated in the visual artifact

The separate Lavish prototype was checked at 360, 390, 768, and 1440 px for each of its three comparison states.

Checks passed for:

- No document-level horizontal overflow in those artifact states.
- Local mode-preview updates.
- The guest-entry preview opening the home concept.
- Choice changes staying local until explicit submission.
- Exactly one queued feedback call on submission.
- No browser page errors during the validation run.

These are checks of the review artifact, not proof that the proposed app changes have been implemented or tested.

## 11. Risks and implementation guardrails

### Typography versus density

Larger supporting text makes cards taller. Preserve understandable content before optimizing the number of cards visible at once. Avoid shrinking the text back to solve a layout that should instead wrap or use more space.

### Deferred customization versus engagement

One-click guest entry may reduce early interaction with the avatar system. That can be acceptable if visitors reach games sooner, but it should be evaluated rather than assumed. Keep customization easy to find later.

### Mode-first discovery versus hidden inventory

A global mode selector can hide games and introduce persistence/empty-state complexity. If adopted later, provide an obvious full-library reset and derive availability from existing capabilities. Do not implement it just because the mockup looks cleaner.

### Shared modal changes versus broad regressions

The shared sheet has multiple callers and existing history semantics. Focus handling must not disable the sheet itself, break nested/replaced overlays, swallow navigation, or leave document state altered after unmounting.

### Returning identity and route preservation

Do not reset a profile, erase user customization, lose an invite destination, or change local-play behavior as a side effect of layout work.

### Existing project conventions

Future implementation must follow the repository's authoritative rules:

- [Theming rules](../.claude/rules/theming-rules.md): semantic CSS variables and theme tokens; no hardcoded application colors.
- [Async busy rules](../.claude/rules/async-busy-rules.md): preserve disabled/busy/error behavior for async actions.
- [Firebase rules](../.claude/rules/firebase-rules.md): preserve write, normalization, and transactional conventions.
- [Game logic rules](../.claude/rules/game-logic-rules.md): keep pure game logic separate and tested if it is ever changed.
- [Game registry conventions](../.claude/rules/adding-a-game-rules.md): reuse existing per-game capabilities rather than duplicating them in the UI.

The selected pass should not require changing game logic or Firebase data structures.

## 12. Delivery checklist and stop condition

### Selected first pass

- [ ] UX-01: explicit solo routes display the selected game first.
- [ ] UX-02: the shared sheet safely owns focus and restores document state.
- [ ] UX-03: supporting card text is readable and discovery inputs are labeled.
- [ ] Responsive before-and-after screenshots are recorded.
- [ ] Tests, lint, and production build results are recorded.
- [ ] Keyboard, zoom, theme, and route regression checks are recorded.
- [ ] Unavailable real-device or multiplayer checks are explicitly listed.
- [ ] No deferred redesign or game/network behavior changes slipped into the patch.

### Deferred backlog

- [ ] UX-04: evaluate one-click guest entry.
- [ ] UX-05: test clearer mode copy before adding global mode state.
- [ ] UX-06: evaluate recent-play ordering and home/navigation hierarchy.
- [ ] UX-07: capture the live lobby before redesigning share/QR priority.

### Stop condition

The focused pass is complete when its three acceptance sets pass and existing `/demo`, `/local`, discovery, and room-creation behavior is preserved.

Do not expand into onboarding, the broader home mockup, navigation restructuring, or multiplayer redesign without a separate scope decision. Record what remains rather than treating the entire backlog as one implementation task.

## 13. Review artifacts

The supporting files currently live in `.lavish/ux-review/`:

| File | Purpose |
| --- | --- |
| `index.html` | Interactive review, current screenshots, concepts, priorities, and selected scope |
| `evidence.json` | Capture conditions, viewport measurements, typography, and focus observations |
| `current-welcome-mobile.png` | First-visit welcome |
| `current-identity-mobile.png` | Identity customization step |
| `current-home-mobile.png` | Mobile catalog |
| `current-options-mobile.png` | Options sheet |
| `current-home-desktop.png` | Desktop catalog |
| `current-solo-mobile.png` | Solo route before the proposed change |
| `review-desktop.png` | Screenshot of the review artifact |
| `press-start-2p-latin.woff2` | Copied product font for a self-contained local review directory |
| `capture.mjs` | Read-only browser capture script with Firebase requests blocked |
| `validate.mjs` | Artifact layout and interaction checks |

The screenshot links in this README depend on retaining that directory. Preserve it with the document if distributing the review, or export the visual companion as a portable HTML file.

To view the companion locally, open `.lavish/ux-review/index.html` in a browser. Lavish annotations require opening it through Lavish:

```bash
lavish-axi .lavish/ux-review/index.html
```

If a review session was explicitly ended from the browser, reopening it may require `--reopen`; only do that when another review is wanted.

To export the companion with its local assets inlined:

```bash
lavish-axi export .lavish/ux-review/index.html --out .lavish/ux-review/portable.html
```

The capture and validation scripts reference a machine-local Playwright installation. They are review helpers, not portable project test commands. Resolve that dependency for the target machine before rerunning them; do not add their hardcoded installation path to the application's tooling.
