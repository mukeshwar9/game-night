# Local multiplayer testing in one browser (F-51)

Lets Chrome DevTools MCP (and human testers) control **distinct, isolated
players in ordinary browser tabs** — no incognito profiles, no second machine.
Two-player and party games both work; seat claims, rules, presence, and game
logic all run the real production paths.

## Prerequisites

- Firebase CLI (`npm i -g firebase-tools`) — only for the local emulators.
- No `.env.local` needed for this mode: testing mode never reads the live
  project config, so CI and fresh clones work without Firebase credentials.

## Running

```bash
npm run test:emulators   # Auth (9099) + Realtime Database (9000), project demo-gamenight-test
npm run dev:test         # Vite dev server with the testing flag on
```

Open `http://localhost:5173/` — you get the **DEV MULTIPLAYER LAUNCHER**.
`npm run dev` (ordinary dev) and production builds are unaffected; testing
mode requires BOTH `VITE_DEV_PLAYERS=1` and a loopback hostname, and
production builds ignore `?devPlayer=` entirely.

## Player slots

| Slot | Meaning |
|------|---------|
| `p1`–`p8` | A separate anonymous Firebase Auth uid per slot, per-tab. Opening the same slot again reopens the same player. |
| `spectator` | Its own authenticated emulator identity that joins rooms via the normal spectator path — never claims a seat. |

Every slot opens as `http://localhost:5173/?devPlayer=p1` etc. The URL
parameter wins over any stored slot; navigation away from the parameter keeps
the same player (stored in `sessionStorage`). Launcher links always carry an
explicit parameter and open with `noopener`, so one slot's session storage can
never leak into another's.

**What is isolated per slot:** profile mirror (`playerName`/`playerAvatar`),
onboarding flag, lifetime stats, match history, recent rooms, favorites, seat
records (`game-{id}`), and all hidden-info secrets (hangwoman word, battleship
fleet, fibbage lie, spyfair location, wavelength target, wordduel words,
bluff dice, minerace reveals). Keys are prefixed `gn-dev-<slot>:` in
`localStorage`/`sessionStorage` — normal mode keeps the original keys.
Shared device state (theme, sound settings, emote usage, coachmarks) is
intentionally NOT isolated.

Google account upgrade is disabled in testing mode (emulator has no Google
provider; linking would defeat per-slot isolation).

## Chrome DevTools MCP walkthrough — two players

1. `npm run test:emulators` and `npm run dev:test` (two terminals).
2. Open the base URL in a tab — the launcher appears. Click **P1**
   (accessible name `OPEN PLAYER SLOT P1`).
3. In the P1 tab: pick a game (e.g. Tic-Tac-Toe), create a room. Note the
   room URL (`/game/{id}`).
4. Back on the launcher tab, click **P2**; in the P2 tab navigate to the room
   URL. P2 joins the O seat — two distinct emulator uids, both seats claimed.
5. Play the match. Verify both tabs see the same board, moves flip turns, and
   the room works end-to-end.
6. Reload the P2 tab — the seat is reclaimed via the emulator uid.
7. Check the DEV badge in each tab: correct slot label, different uid prefix,
   `EMU-OK`.

## Party walkthrough (3+ players)

1. From the launcher open **P1**, **P2**, **P3**.
2. P1 creates a party room (e.g. Wavelength, min 3 players) and shares the
   room URL with P2 and P3.
3. Each tab claims a distinct seat (uid-keyed, order of arrival); the fourth
   opened slot (P4) arrives as a spectator.
4. Start, play a round, exercise role rotation / clue-giver changes.
5. Verify spectator P4 cannot submit moves or take a seat.

## Limitations

- Background-tab throttling can distort simultaneous reflex games — use
  separate visible windows for those checks.
- Same-browser testing proves nothing about WebRTC/NAT traversal (Pong):
  for realtime transport use two devices/networks.
- Emulator data is disposable; resetting it also means opening fresh slots
  (cached seat records are tab-local and cannot masquerade as room membership
  after a data reset — rooms themselves are gone).

## Implementation map

| Piece | File |
|-------|------|
| Mode gating + slot resolution (pure) | `src/lib/devTestingLogic.js` (+ tests) |
| Impure module init (URL param → session storage) | `src/lib/devTesting.js` |
| Per-slot namespaced storage adapter | `src/lib/storage.js` (+ tests) |
| Per-slot Firebase app + emulator wiring | `src/lib/firebase.js` |
| Launcher + dev badge | `src/components/DevPlayerBar.jsx` |
| Spectator-slot seat-claim skip | `src/pages/Game.jsx` (`isTestSpectator`) |
| Upgrade disabled | `src/lib/auth.js` (`upgradeWithGoogle`) |
