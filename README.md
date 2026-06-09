# Game Night

A browser-based multiplayer games platform. Play with friends in real time — no account needed. Share a link, join instantly.

**Live:** https://game-night-91464.web.app

## Games

- Tic Tac Toe
- Connect Four
- Hangwoman — hidden-word game; a commit–reveal scheme keeps the word secret with no server and catches a cheating word-keeper (design in [`HANGMAN.md`](HANGMAN.md))

## How it works

1. Enter your name, choose a game, and click the card — you get a 6-character room code
2. Share the link with a friend
3. They open it, enter their name, and the game starts
4. Moves sync in real time via Firebase; each player sees the board update instantly
5. When a game ends, hit **PLAY AGAIN** — or **PLAY ANOTHER GAME** to switch the whole room to a different game; both players (and spectators) move together, no new code needed

Players are identified by session only — no sign-up, no passwords. The creator is always X; the first person to join is O. A third person who opens the link becomes a spectator.

## Features

- **Real-time multiplayer** — Firebase Realtime Database keeps both boards in sync
- **Score tracking** — scores persist across rounds; first to 3 wins triggers a match-over screen
- **In-room game switching** — every end-of-game screen offers the other games; switching resets the board and scores but keeps players, presence, and the room code
- **Cheat-proof hidden words** — Hangwoman stores the word only in the setter's browser, committed to Firebase as a salted SHA-256 hash (`src/lib/commit.js`); on reveal the guesser's client verifies the hash and every recorded answer, and a CHEAT DETECTED screen presents the evidence if anything doesn't match
- **Execution drama** — Hangwoman's pixel figure gets a trapdoor drop with thud and funeral bell on the final miss, a blinking DEAD WOMAN GUESSING warning at last life, and a RIP QUEEN memorial with falling roses for the loss screen
- **Presence detection** — green dot on each player card; "OPPONENT DISCONNECTED" warning when the other tab goes offline
- **8-bit sound effects** — move bleeps, win jingle, lose tune, draw buzz, join ping; all generated via Web Audio API (no audio files)
- **Mute toggle** — speaker icon in the game header and home page corner; preference saved in `localStorage`
- **Win animation** — pixel particle burst + screen flash in the winner's colour on game end
- **Retro CRT theme** — Press Start 2P pixel font, neon cyan/pink/yellow palette, scanline overlay, vignette
- **PWA** — installable on mobile, offline home screen via Workbox service worker
- **Security rules** — writes blocked outside `games/` (see [Security & correctness](#security--correctness) for known gaps in the per-game rules)

## Tech stack

| | |
|---|---|
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS v3 + shadcn utilities |
| Routing | React Router v7 |
| Real-time | Firebase Realtime Database |
| Tests | Vitest (pure game logic + commit–reveal) |
| Toasts | Sonner |
| Fonts | Press Start 2P (Google Fonts) |
| PWA | vite-plugin-pwa (Workbox) |
| Hosting | Firebase Hosting |

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Set up Firebase config
cp .env.local.example .env.local
# Fill in your Firebase project values in .env.local

# 3. Start dev server
npm run dev
# → http://localhost:5173
```

### Firebase setup (one-time)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Realtime Database** (Build → Realtime Database → Create database → test mode)
3. Register a web app (Project Settings → Your apps → `</>`) and copy the config into `.env.local`
4. Security rules are in `database.rules.json` — deploy with `firebase deploy --only database`

## Commands

```bash
npm run dev       # dev server with HMR
npm run build     # production build → dist/
npm run preview   # serve dist/ locally
npm run lint      # ESLint
npm test          # Vitest (hangman logic + commit–reveal suites)
```

## Deploy

```bash
npm install -g firebase-tools
firebase login
npm run build
firebase deploy --only hosting        # hosting only
firebase deploy --only hosting,database  # hosting + security rules
```

The `functions/` directory contains a scheduled Cloud Function that deletes games older than 24 hours. Deploying it requires the **Blaze (pay-as-you-go)** plan:

```bash
firebase deploy --only functions
```

## Adding a new game

The room/invite/Firebase/presence layer is game-agnostic. Each game needs:

1. A logic file in `src/lib/` exporting `getWinner(board)` and any move helpers
2. A board component in `src/components/`
3. An entry in `GAME_TYPES` and a branch in `freshGameState()` in `src/lib/games.js` (drives the in-room switcher and per-game initial state)
4. A card with an icon added to the `GAMES` array in `src/pages/Home.jsx`
5. A branch on the new `gameType` string in `src/pages/Game.jsx` (board size, move handler, board component, win function)

Sounds, presence, score tracking, game switching, and the win effect work automatically for any game type.

## Project structure

```
src/
  components/
    Board.jsx / Cell.jsx          # Tic Tac Toe board
    ConnectFourBoard.jsx          # Connect Four board
    HangmanGallows.jsx            # Pixel gallows + figure, trapdoor drop
    WordDisplay.jsx               # Hangwoman letter slots
    LetterKeyboard.jsx            # Hangwoman A–Z guess keyboard
    WordSetter.jsx                # Hangwoman word entry (setter)
    Gravestone.jsx                # RIP QUEEN memorial pixel art
    RoseFall.jsx                  # Falling-roses mourning overlay
    GameSwitcher.jsx              # "Play another game" picker
    PlayerCard.jsx                # Player name, score, presence dot
    GameStatus.jsx                # Turn / win / match-over display
    WaitingRoom.jsx               # Invite link + copy button
    WinEffect.jsx                 # Pixel particle burst on game end
    ui/sonner.jsx                 # Sonner Toaster (retro styled)
  pages/
    Home.jsx                      # Name entry + game selection
    Game.jsx                      # Game room (all game types)
    HangmanGame.jsx               # Hangwoman rounds, commit–reveal, cheat check
    Demo.jsx                      # Local-only playable demo (no Firebase)
  lib/
    firebase.js                   # Firebase init (reads VITE_FIREBASE_* env vars)
    games.js                      # GAME_TYPES registry + freshGameState()
    gameLogic.js                  # TTT win detection + normalizeBoard
    connectFourLogic.js           # Connect Four win detection + drop helper
    hangmanLogic.js (+ .test.js)  # Hangwoman guess/win logic + consistency check
    commit.js (+ .test.js)        # Salted SHA-256 commit–reveal primitive
    sounds.js                     # Web Audio API sound engine
    utils.js                      # cn() helper (clsx + tailwind-merge)
  hooks/
    useInstallPrompt.js           # PWA beforeinstallprompt hook
functions/
  index.js                        # Scheduled cleanup (Blaze plan required)
database.rules.json               # Firebase Realtime Database security rules
```

The `/demo` route renders a fully playable local game (no Firebase) — useful for UI testing without credentials.

## Planned improvements

### Security & correctness

Highest-impact fixes — these are the only items where someone other than the two players can ruin a game.

- **Lock down the database rules.** `database.rules.json` grants `.read: true, .write: true` at `games/$gameId`. In Realtime Database rules, permission granted at a parent **cannot be revoked by a child rule**, so the `players/X` / `players/O` `"!data.exists()"` guards are dead code — anyone with a game ID can overwrite the board, scores, status, or steal a player slot with a raw REST call. The client-side `runTransaction` only protects well-behaved clients from racing each other.
  *Fix:* enable **Firebase Anonymous Auth** (invisible to users, keeps the "no account needed" promise), stamp each player slot with `auth.uid`, and write rules so only the player whose turn it is can update the board. At minimum, add `.validate` rules constraining the data shape: board is a 9- or 42-element array of `'' | 'X' | 'O'`, `status` is one of `waiting | playing | finished`, `currentTurn` is `X | O`, etc.

- **Make moves transactional.** `handleMove` in `src/pages/Game.jsx` does a plain `update()` computed from possibly-stale local state. Two near-simultaneous writes (laggy opponent, double-tap, two tabs) can clobber each other — including the read-modify-write score increment (`scores/${winner}`), which can drop a point. Wrap the move in a `runTransaction` on the game node that re-checks `currentTurn` and cell emptiness against actual server state before committing.

- **Guard against game ID collisions.** `createGame` in `Home.jsx` does a blind `set()` on a random 6-character ID (~2.2 billion combinations, but cleanup only runs daily). A collision would silently overwrite someone's live game. Use a transaction that only writes if the node doesn't exist, or `get()` first and regenerate on collision.

- **Let players reclaim their seat.** Identity lives only in `sessionStorage`, so if a player closes their tab, their slot is orphaned forever and the game is dead. Store a random `playerId` in `localStorage`, save it in the player slot on join, and let a returning browser with a matching ID reclaim its symbol. Pairs naturally with the anonymous-auth fix above (the `uid` *is* the player ID).

### Architecture & maintainability

- **Finish the game registry.** `src/lib/games.js` now exists with `GAME_TYPES` (drives the in-room switcher) and `freshGameState()` (single source of per-game initial state, used by both game creation and game switching). What remains: move the per-type branches still in `Game.jsx` (board size, drop logic, winner function, board component, layout width) into the registry so adding a board game is a one-file change:

  ```js
  // src/lib/games.js — target shape
  export const GAME_TYPES = {
    tictactoe:   { boardSize: 9,  getWinner, getMoveIndex: (b, i) => i, Board },
    connectfour: { boardSize: 42, getWinner: getConnectFourWinner,
                   getMoveIndex: getConnectFourDrop, Board: ConnectFourBoard },
  }
  ```

- **Extend unit tests to the board games.** Vitest is in (`npm test`) with suites for `hangmanLogic` and `commit`. Still untested: `getWinner`, `getConnectFourWinner`, `getConnectFourDrop`, and `normalizeBoard` — all pure, zero-dependency functions. Connect Four win detection (diagonals, board edges) is exactly the kind of thing that breaks silently during the registry refactor, so land those tests first.

### Polish

- **Deduplicate the mute button.** The speaker toggle with its two inline SVGs is copy-pasted between `Home.jsx` and `Game.jsx` — extract a `MuteButton` component.

### Game candidates

Two-player games that fit the platform, tiered by how far they stretch the current architecture (shared visible board-as-array, alternating turns, a `getWinner` function per game, score tracking, win-line highlight).

**Tier 1 — drop-in: same model as Tic Tac Toe / Connect Four.** New board size + click handler + win function; pure registry entries once the game-registry refactor lands.

- **Gomoku (5 in a row)** — 15×15 board, same X/O cells, same win-line highlight. Plays like tic-tac-toe but actually deep; threats build up over the game. Probably the cheapest addition with the biggest payoff.
- **Ultimate Tic-Tac-Toe** — nine 3×3 boards in a 3×3 grid; your move dictates which board the opponent must play in next. Far more exciting than regular TTT and thematically perfect next to it. State is still just an array (81 cells + 9 macro cells).
- **Pentago** — 6×6 board in four 3×3 quadrants; place a marble, then rotate a quadrant 90°. Wins appear out of nowhere — the most exciting per line of code in this tier. The two-action turn still commits as a single board write.
- **SOS** — ~7×7 grid; each turn place *either* an S or an O anywhere; completing "S-O-S" in a line scores a point and grants another move. Every placement risks setting up the opponent. Scoring maps directly onto the existing `scores` node.
- **Order and Chaos** — 6×6; *both* players place X's or O's. "Order" wins by making 5-in-a-row of either symbol; "Chaos" by preventing it. Asymmetric roles make swap-sides rematches naturally compelling.
- **Notakto (misère tic-tac-toe)** — both players place X's on three 3×3 boards; completing three-in-a-row *loses* that board. Sounds trivial, plays mind-bending. Reuses the existing TTT board component almost verbatim.
- **Hex** — 11×11 rhombus of hexagons; connect your two opposite edges. One-sentence rules, no draws possible, tense endgames. Win detection is a flood-fill instead of line-scanning; the hexagonal CSS is the only real work.
- **Reversi / Othello** — 8×8 array, pieces flip; dramatic late-game swings. Win function is a disc count, but move validation (flip logic) is more code than the others in this tier.
- **Mancala** — 14-slot array of *integers* instead of strings; satisfying chain moves and captures. Simple rules, surprisingly tactical.

**Tier 2 — pieces that move instead of being placed.** Same array data model, but `handleMove` becomes select-then-move and needs a legal-move function alongside `getWinner`.

- **Breakthrough** — 8×8, two rows of pawns each, move/capture diagonally forward, first to the far side wins. Chess-like tension with checkers-like rules and zero special cases — best effort-to-fun ratio in this tier, and it paves the way for Checkers.
- **Checkers** — the obvious one; the cost is multi-jump and king logic.
- **Nine Men's Morris** — placement phase then movement phase; forming "mills" removes opponent pieces. Needs a `phase` field on the game node.
- **Quoridor** — pawns race across while players drop walls. Hugely engaging, but wall placement needs a "path still exists" BFS check — best saved until the registry refactor and unit tests exist.

**Tier 3 — simultaneous turns instead of alternating.** Each player writes a hidden choice to their own key; resolve when both exist.

- **Rock Paper Scissors (best of 5/7)** — tiny state, instantly understood; the existing score/match-over UI carries it. Also exercises the simultaneous-move pattern Battleship needs. Great "while we wait" filler game.
- **Memory / Concentration duel** — shared grid of face-down cards, flip two per turn, matches score points.

**Tier 4 — dice (one design decision required).** Push-your-luck dice games are simple and loud, but with no server there must be a fairness story for randomness. Two friend-platform-appropriate options: the player whose turn it is writes their own roll (trust-based, consistent with the current security posture), or the creator writes a random seed at game creation and both clients derive rolls deterministically.

- **Pig** — roll a d6 repeatedly; bank your points or keep rolling, but a 1 wipes the turn. First to 100. Two buttons, one die, maximum table-banging — the smallest possible game that introduces the dice mechanic.
- **Shut the Box (duel)** — same vibe, slightly more board to render.

**Tier 5 — hidden state.** Requires either the commit–reveal scheme (see [`HANGMAN.md`](HANGMAN.md)) or per-player read rules via anonymous auth.

- **Hangwoman** — ✅ shipped. Its commit–reveal module (`src/lib/commit.js`) is the reusable primitive for everything else in this tier.
- **Battleship** — the headline setup-phase game; needs hidden ship placement *and* guess verification, both built on the commit–reveal module Hangwoman produced — now unblocked.
- **Dots and Boxes** — no hidden state actually needed (it's all public edges), listed here as the other planned setup-heavy game; chain captures at the end are the exciting part.

**Avoid for now:** real-time-reflex games (Pong, air hockey, tap races) — RTDB latency makes them feel mushy; they need the WebRTC architecture described below.

**Suggested next three:** Pentago (excitement per line of code), SOS (scoring variety, reuses everything), Breakthrough (first moving-pieces game). Add Pig when introducing dice, RPS as a quick filler-game win.

### New features — medium effort
- **In-game reactions** — quick reaction buttons (👏 😬 🔥 💀) that flash on the opponent's screen, stored as a single ephemeral Firebase key.
- **Chat** — simple text input per room, messages stored under `games/$id/messages`.
- **Rematch request flow** — replace the free-for-all "Play Again" (and the equally free-for-all game switcher) with a propose/accept handshake.
- **More games** — see the full tiered list in [Game candidates](#game-candidates); Battleship is now unblocked by Hangwoman's commit–reveal module, and Dots and Boxes remains the other headline pick.

### Real-time games (Pong, air hockey, etc.) — architecture notes

The current stack assumes turn-based play: state changes once per move and syncs through RTDB. Reflex games break that — state changes ~60×/second and continuous physics replaces discrete board cells. Pushing ball positions through RTDB at 30–60Hz would mean 100–300ms perceived latency, heavy bandwidth use, and a teleporting ball. If a Pong-like is ever built, this is the plan:

**Keep Firebase for the room, not the gameplay.**
- *Firebase RTDB*: lobby, invites, presence, score, game-over — everything that changes at human speed. The existing room layer stays as-is.
- *WebRTC DataChannel (peer-to-peer)*: the actual gameplay frames. Firebase doubles as the **signaling channel** — peers exchange WebRTC offer/answer/ICE candidates under `games/$id/signaling/{X|O}` (small, infrequent writes, which RTDB is great at). Once the P2P connection is up, gameplay traffic never touches Firebase. This preserves the "no backend server" property; typical P2P latency is 20–60ms.

**Host-authoritative simulation.** Don't let both clients simulate and reconcile — that's the hard version.
- The creator (X) is the **host**: their browser runs the one true physics simulation.
- The guest (O) sends only **inputs** ("paddle up") over the data channel; the host sends back state snapshots at ~20–30Hz.
- Each client renders its **own paddle locally with zero delay** (client-side prediction — your paddle must never feel laggy) and renders the opponent's paddle and ball by interpolating between the last two snapshots, ~100ms in the past. Smooth beats current.

**The Pong-specific cheat: sync events, not positions.** Between collisions the ball's path is perfectly deterministic, so don't stream its position at all. The host only sends an event when the trajectory changes:

```js
{ type: 'bounce', t: 183421, pos: [0.92, 0.31], vel: [-0.6, 0.4] }
{ type: 'score',  t: 191002, scorer: 'X' }
```

Both clients extrapolate the ball from the last event using their local clock (synced once via a ping/offset handshake). A few messages per second instead of sixty, and the ball is smooth on both ends regardless of jitter. This generalizes to most physics-lite arcade games (air hockey, Breakout-versus, tank duels).

**Code structure** — pure simulation / transport / rendering, mirroring how board games separate `gameLogic.js` from components:

```
src/lib/realtime/
  rtc.js              # WebRTC setup, RTDB signaling, reconnect; exposes send()/onMessage()
  clockSync.js        # ping-based clock offset between peers
src/lib/pongLogic.js  # PURE: createState(), step(state, inputs, dt) — no DOM, no network
src/components/PongCanvas.jsx  # requestAnimationFrame render loop, keyboard/touch input
src/pages/Game.jsx    # game registry gains a kind: 'realtime' branch → RealtimeRoom wrapper
```

Two rules worth enforcing:
1. **Fixed-timestep simulation, interpolated rendering.** `step()` always advances by a constant dt (e.g. 1/120s) in an accumulator loop; `requestAnimationFrame` renders interpolated state. Host and guest physics stay identical, and the logic is unit-testable.
2. **Transport is an interface, not a dependency.** `pongLogic.js` never imports `rtc.js`. A loopback transport lets the `/demo` route run the identical game locally (two paddles, one keyboard) — which is how most development would happen anyway.

**Deliberately descoped:**
- *TURN relay fallback* — WebRTC P2P fails for ~5–10% of peers behind symmetric NATs; a real fix needs a TURN server (which **is** a server, with bandwidth costs). For a friends-and-family platform, detect the failure and show "connection failed — try a different network."
- *Spectators* — streaming gameplay over P2P needs a connection per spectator. v1: spectators see only the live score from Firebase, not the ball.
- *Anti-cheat* — host-authoritative means the host could cheat. Between friends, irrelevant.

**Suggested build order:** clock-sync + RTC module with the loopback demo first, then event-based ball sync, paddle prediction polish last. Note: turn-based registry games (Gomoku, Ultimate Tic-Tac-Toe) are ~10× less code per unit of fun — real-time is a "because it's cool" project, not the next roadmap item.

### New features — larger investments
- **Google sign-in + persistent stats** — win/loss record, games played, win streak. Enables leaderboards and friend lists.
- **Public matchmaking queue** — "Find a random opponent" button that pairs strangers via a Firebase queue.
