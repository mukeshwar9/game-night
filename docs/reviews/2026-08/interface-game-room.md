# Game Room UI/UX Review

Scope: `Game.jsx` shell, room furniture (PlayerCard, GameStatus, GameSwitcher, ModeChooser, FirstMoverModal, Gravestone, ConnectionBanner, ProposalBanner, BottomSheet, BottomTabBar, EmoteBar), invite trio (InviteFriendModal, InviteToasts, QrCode), input helpers (LetterKeyboard, NumberPad), and the end-of-match path. `WaitingRoom.jsx` also read - not in the named file list, but it *is* the "waiting for opponent" screen the brief asks to judge; flagged inline so scope is clear.

Read-only. No code changed, no build/dev-server/browser used. `UX-IMPROVEMENTS.md`, `MOBILE-UX-AUDIT.md`, and `gd-platform-ux-s1/report.md` read for overlap - findings already fully implemented (bottom sheets, bottom tab bar, sticky end-of-match bar, abandoned-opponent recovery, blocked-tap toast, CTA lock, TRY NEXT suggestions, head-to-head retention framing) are referenced, not repeated.

## Ranked findings

| # | Screen | Finding | Severity | Effort | Rule ID |
|---|--------|---------|----------|--------|---------|
| 1 | BottomSheet (Invite/Switcher/EmotePicker/ModeChooser) | Back-gesture handling is currently stubbed out - a swipe-back during an open sheet exits the room, not the sheet | Critical | Low | `back-behavior`, `escape-routes` (ux) - dataset |
| 2 | End-of-match (GameStatus) | Every finish reads identically - no rout-vs-nailbiter distinction, head-to-head record exists but is never shown here | High | Medium | own judgement (cross-refs `gd-platform-ux-s1`) |
| 3 | EmoteBar | Reaction buttons are 36x36px, quick-chat chips ~30px tall - the highest-frequency tap target in live play, under target | High | Low | `touch-target-size` (ux) - dataset |
| 4 | FirstMoverModal / ModeChooser | Both components are dead code - never imported/mounted anywhere; WaitingRoom re-implements first-mover UI inline instead | Medium | Low (delete or wire up) | own judgement |
| 5 | ProposalBanner / consent handshake | No timeout or opponent-offline detection while a proposal is pending - proposer can be stuck on "WAITING FOR X..." indefinitely if X leaves | Medium | Medium | own judgement, adjacent to `escape-routes` (ux) |
| 6 | PlayerCard / WaitingRoom | Presence conveyed by dot color alone (green vs gray), no text/icon fallback | Medium | Low | `color-not-only` (ux) - dataset |
| 7 | WaitingRoom | Dead time has zero signal below "share the link" - no "link opened" / viewer-arrived feedback while alone | Low | Medium | own judgement |
| 8 | QrCode error fallback | Fixed hex colors instead of theme tokens | Low (documented exception) | - | own judgement, non-issue |

## Detail

**#1 - BottomSheet back-gesture stub.** `src/hooks/useModalHistory.js:9-13` - the entire hook body is `void onClose`, with a comment: "Temporarily disabled to diagnose popup flicker - restore M-06 history wiring once open -> close is stable." `BottomSheet.jsx:36` still calls it (`useModalHistory(onBack || onClose)`), so every sheet in scope - `InviteFriendModal`, `GameSwitcher`'s picker, `EmoteBar`'s `EmotePicker`, `ModeChooser`, `FirstMoverModal` - silently lost back-gesture interception. `MOBILE-UX-AUDIT.md` documents this as fixed (M-06); it is regressed in the current tree. Player experience: opening "Invite a friend" mid-match on Android/iOS-PWA and swiping back exits the room instead of closing the sheet - the exact hazard the audit called out originally, now live again. Structural, verified from source - no rendering needed to confirm the hook is a no-op. Fix: restore the hook body (the flicker bug it was disabled for needs its own diagnosis, but shipping with back-gesture broken is worse than the flicker).

**#2 - Flat end-of-match screen.** `GameStatus.jsx:132-220` renders "YOU WIN!" / opponent-name-WINS / "DRAW!" - same copy, same layout, same `modal-pop` animation regardless of 3-0 vs 3-2, and never touches `getHeadToHead()` (`src/lib/profile.js:74`, which reads `getStats()?.vs?.[opponentUid]` - real data, wired nowhere in the room). `gd-platform-ux-s1/report.md:41-51,93-113` already made this case from a retention angle (ASSUMPTION/VALIDATE framing); this finding pins the exact dead call site so it's actionable: one `getHeadToHead(opponentUid)` read plus a conditional line ("3-1 ALL TIME" / "YOUR RIVALRY: 3-2") is possible with existing data, no new Firebase write. Rout-vs-nailbiter differentiation (margin-aware copy/animation) is a separate, smaller lift on the same component.

**#3 - EmoteBar touch targets.** `EmoteBar.jsx:6` - `EMOTE_BTN_CLASS` is `w-9 h-9` (36px). `EmoteBar.jsx:7` - `CHIP_BTN_CLASS` is `px-2.5 py-1.5` around 8px pixel-font text, roughly 28-30px tall. This is the one control players tap repeatedly mid-match, next to the board, often one-handed - under the 44x44pt / 48x48dp targets the rest of the app (LetterKeyboard `h-11`, NumberPad `h-12`) already hits correctly. Fix: bump to `w-11 h-11` / equivalent min-height-11 padding, matching the pattern the rest of the room already uses.

**#4 - Dead FirstMoverModal / ModeChooser.** Grep confirms zero references to either component outside their own files. `WaitingRoom.jsx:103-141` hand-rolls the same X/O/RANDOM chooser `FirstMoverModal.jsx` already implements (near-identical markup, its own `useBusy`). `ModeChooser.jsx` (friend vs. solo/AI picker) has no call site at all - whatever flow was meant to open it (a catalog card offering both modes) doesn't exist in the current room/catalog wiring reviewed here. Not a player-facing bug today, but real drift risk: the next edit to "who goes first" logic has two divergent places to update, and one of them nobody will think to touch. Fix: delete both, or wire `ModeChooser` into whatever the intended solo/friend entry point is if that's still planned.

**#5 - Proposal handshake has no exit when the recipient goes dark.** `Game.jsx:949-981` - `propose`/`acceptProposal`/`declineProposal`/`cancelProposal` give the proposer only a manual CANCEL (`ProposalBanner.jsx:51-57`) while waiting; there's no code path that auto-cancels or warns when the opponent goes offline *after* a proposal was sent (the abandoned-opponent 120s timer in `Game.jsx:672-697` is scoped to `game.status === 'playing'` mid-round, not to a pending proposal at `finished`/`waiting`). Player experience: propose a rematch, opponent's tab dies, proposer sees an indefinite "WAITING FOR O..." pulse with only a manual way out - no signal that the wait is now pointless. Own judgement; adjacent to the dataset's `escape-routes` guidance (modals/multi-step flows need a way out) applied to this async, non-modal wait state.

**#6 - Presence dot is color-only.** `PlayerCard.jsx:39-46` - the presence indicator is a plain circle, `bg-retro-win` (online) vs `bg-retro-dim` (offline), no accessible name, no shape/icon difference. `WaitingRoom.jsx` and `InviteFriendModal.jsx:72` repeat the same pattern. For a small, low-contrast dot this is a real perceptibility gap on top of being a pure-color signal - matches the dataset's `color-not-only` rule directly (info conveyed by color alone). Fix: add `aria-label`/visually-hidden text ("online"/"offline"), or a text state to the name row already there ("- ONLINE").

**#7 - Waiting room has no live-in-progress feedback.** `WaitingRoom.jsx` shows link/QR/copy/share and a static "WAITING FOR OPPONENT" - nothing changes if the invite link has been opened by someone who hasn't claimed a seat yet (a spectator arriving, or a browser prefetch), and there's no elapsed-time or "still here" reassurance for the creator sitting alone. This is exactly the dead-time moment the brief calls out as a session-death risk; today it degrades silently with no signal at all until the seat actually fills. Own judgement - would need product/data work (a lightweight "someone's viewing" presence ping) beyond this review's scope to spec fully, flagging as a gap rather than prescribing the implementation.

**#8 - QrCode fallback hex.** `QrCode.jsx:22-24` hardcodes `#0a0a14`/`#ffffff` in the error-state box, with a comment explaining why (QR ink color is a fixed hex passed to the `qrcode` library and can't theme through `--c-*`, and the box sits on WaitingRoom's white QR wrapper regardless of theme). This is a deliberate, documented exception, not a violation - noting it so it isn't mistaken for an oversight.

## What is missing

- **Head-to-head / rivalry line on the end screen** (see #2) - data exists, display doesn't.
- **Margin-aware end-of-match presentation** - a 3-0 sweep and a 3-2 nailbiter get identical treatment; no use of the score differential already available in `scores`.
- **A "seen"/viewer signal in WaitingRoom** (see #7) - nothing tells the lone creator anyone has looked at the link yet.
- **Proposal timeout/expiry** (see #5) - no auto-clear when the recipient is gone.
- **Emote reach during actual gameplay tension** - the bar is well-placed structurally (below the board, gated to seated players only, cooldown-protected against spam) but every glyph is celebratory/reactive; there's no quick "good game" / "oops" pre-built beyond the existing `QUICK_CHAT` chips - reasonable as-is, flagging only because the brief asked whether emotes "do enough": they cover the surface case fine, nothing more to add without inflating scope.

## Well-built, one line each

- **ConnectionBanner** - clean two-source (`navigator.onLine` + RTDB `.info/connected`) debounce with a sensible 2.5s grace period against boot flicker; good.
- **LetterKeyboard / NumberPad** - both correctly hit 44-48px targets, `onPointerDown` + `preventDefault` on NumberPad kills tap delay; matches the audit's own note that these are already fixed.
- **BottomSheet primitive itself** (drag-to-dismiss, Escape, safe-area padding, entrance animation) - solid, aside from the back-gesture regression in #1.
- **ProposalBanner three-way branch** (proposer/recipient/spectator) - legible, correct busy-state labels, no ambiguity about who can act.
- **GameStatus sticky bottom action bar + CTA lock** - already-implemented fix (M-43/M-67), works as documented.
- **LeaveMatchConfirm** - proper full-screen destructive confirm with STAY/LEAVE, matches `confirmation-dialogs` convention.

## Structural vs. needs-rendered-check

**Structural (certain from source, no rendering needed):** #1 (hook body is literally a no-op), #3 (Tailwind size classes computed directly), #4 (grep-confirmed zero call sites), #5 (no timer/listener exists in the relevant code paths), #2 (function call absent from the component).

**Needs a rendered/measured check:** #6's actual dot color contrast against `retro-card`/`retro-bg` per theme (six themes, couldn't compute composited contrast from source alone); whether the EmoteBar's visual density feels cramped at 44px vs. the current 36px in the real layout; WinEffect confetti/animation timing feel (not reviewed in detail - out of the "does it work" question, in the "does it feel right" question that needs eyes on it).

## Dataset vs. own judgement

- **From the ui-ux-pro-max dataset, rule ID cited:** #1 (`back-behavior`/`escape-routes`), #3 (`touch-target-size`), #6 (`color-not-only`).
- **Own reasoning, marked as such:** #2, #4, #5, #7, #8, and the "what is missing" section in full. Search queries run: touch-target-size, back-gesture/escape-routes, empty-state/waiting-for-opponent (no strong hit - general `empty-states` guidance only, not game-specific, so #7 stayed own judgement rather than force-fitting a citation), toast-dismiss timing (checked, no violation found - sonner defaults used, not flagged), presence-dot/color-not-only, confirmation-dialogs (checked against LeaveMatchConfirm - already compliant, not flagged).
