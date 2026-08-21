# Async Busy-Flag Convention

Every button that fires an async action (Firebase write, `navigator.share`, service-worker update) follows this shape, via `useBusy()` (`src/hooks/useBusy.js`):

1. Set the `busy` flag **synchronously, before any `await`** — never behind a `setTimeout`/debounce. This is not a style preference: it must run inside the same tick as the user gesture or it breaks `navigator.share`'s user-activation window.
2. Disable the button while busy.
3. Swap its label to an "…ING" gerund (SAVING…, SENDING…, CANCELLING…).
4. On failure, `toast.error(...)` — never fail silently, and never leave the button stuck disabled with no feedback (see `MathGame.jsx`'s swallowed-catch bug for what silent failure looks like: a thrown `runTransaction` left the UI on "CHECKING…" forever with no toast and no state revert).

Loading states have distinct grammar by cause — don't mix them: machine work (steps()/`PixelDots` motion), waiting-for-a-human (same motion family), and errors (static, never animated) — per `src/components/loading/`.
